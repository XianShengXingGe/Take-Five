import { rm } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import { createAllAdapters } from '../../adapters/index.js';
import type { AgentAdapter, AdapterUninstallResult } from '../../types/adapter.js';
import type { CredentialStore } from '../../types/credential.js';
import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';
import { getTakeFiveHome } from '../../core/paths.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface UninstallCommandDependencies {
  credentialStore: CredentialStore;
  adapters?: AgentAdapter[];
  promptDriver?: PromptDriver;
  env?: Record<string, string | undefined>;
}

export interface UninstallOptions {
  yes?: boolean;
  force?: boolean;
  quiet?: boolean;
}

export interface UninstallReport {
  agentResults: AdapterUninstallResult[];
  configPurged: boolean;
  credentialsPurged: boolean;
}

export async function runUninstall(
  deps: UninstallCommandDependencies,
): Promise<UninstallReport> {
  const adapters = deps.adapters ?? createAllAdapters();
  const agentResults: AdapterUninstallResult[] = [];

  // 1. Revert hooks across all adapters
  for (const adapter of adapters) {
    const result = await adapter.uninstall({ env: deps.env });
    agentResults.push(result);
  }

  // 2. Remove ~/.takefive directory
  const takeFiveHome = getTakeFiveHome(deps.env);
  let configPurged = false;
  try {
    await rm(takeFiveHome, { recursive: true, force: true });
    configPurged = true;
  } catch {
    configPurged = false;
  }

  // 3. Purge OS Keychain credentials
  let credentialsPurged = false;
  try {
    await deps.credentialStore.deleteBarkUrl();
    credentialsPurged = true;
  } catch {
    credentialsPurged = false;
  }

  return {
    agentResults,
    configPurged,
    credentialsPurged,
  };
}

export function registerUninstallCommand(
  program: Command,
  deps: UninstallCommandDependencies,
): void {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .command('uninstall')
    .description(dict.cli.commands.uninstall)
    .option('-y, --yes', dict.cli.options.yes)
    .option('-f, --force', dict.cli.options.yes)
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (options: UninstallOptions) => {
      const prompt = deps.promptDriver ?? defaultPromptDriver;
      const skipPrompt = Boolean(options.yes || options.force);
      const lang = detectLanguage(undefined, deps.env);
      const dict = getLocaleStrings(lang);
      const u = dict.cli.uninstall;

      if (!skipPrompt) {
        prompt.intro(pc.bgRed(pc.white(` ${u.intro} `)));

        const proceed = await prompt.confirm({
          message: u.confirmMessage,
          initialValue: false,
        });

        if (prompt.isCancel(proceed) || proceed !== true) {
          prompt.outro(pc.dim(u.cancelledOutro));
          return;
        }
      }

      const spinner = prompt.spinner();
      if (!options.quiet) {
        spinner.start(u.purging);
      }

      const report = await runUninstall(deps);

      if (!options.quiet) {
        spinner.stop(u.purgeDone);

        console.log(pc.bold(pc.cyan(`\n  ${u.summaryTitle}\n`)));

        for (const result of report.agentResults) {
          const displayName = dict.agents[result.agent] || result.agent;
          if (result.success) {
            const detail = result.restoredFromBackup
              ? u.restoredFromBak
              : `${result.hooksRemoved.length} ${u.hooksRemoved}`;
            console.log(`  ${pc.green('✔')} Agent "${displayName}": ${pc.dim(detail)} (${result.configPath})`);
          } else {
            console.error(`  ${pc.red('✖')} Agent "${displayName}": failed to remove hooks (${result.error})`);
          }
        }

        console.log(
          `  ${report.configPurged ? pc.green('✔') : pc.red('✖')} ${u.configPurged}`,
        );
        console.log(
          `  ${report.credentialsPurged ? pc.green('✔') : pc.red('✖')} ${u.credsPurged}`,
        );

        console.log('');
        prompt.outro(pc.bold(pc.green(u.outroSuccess)));
      }
    });
}
