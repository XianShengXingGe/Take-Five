import { rm } from 'node:fs/promises';
import type { Command } from 'commander';
import pc from 'picocolors';
import { createAllAdapters } from '../../adapters/index.js';
import type { AgentAdapter, AdapterUninstallResult } from '../../types/adapter.js';
import type { CredentialStore } from '../../types/credential.js';
import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';
import { getTakeFiveHome } from '../../core/paths.js';

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
  program
    .command('uninstall')
    .description('Completely revert agent hooks, delete ~/.takefive/, and purge stored credentials')
    .option('-y, --yes', 'Skip confirmation prompt and proceed with total purge')
    .option('-f, --force', 'Alias for --yes')
    .option('-q, --quiet', 'Suppress non-error output')
    .action(async (options: UninstallOptions) => {
      const prompt = deps.promptDriver ?? defaultPromptDriver;
      const skipPrompt = Boolean(options.yes || options.force);

      if (!skipPrompt) {
        prompt.intro(pc.bgRed(pc.white(' Take Five (片刻) · Uninstallation ')));

        const proceed = await prompt.confirm({
          message:
            'Are you sure you want to completely uninstall Take Five?\n' +
            'This will revert all agent configuration hooks, delete ~/.takefive/, and purge credentials from OS Keychain.',
          initialValue: false,
        });

        if (prompt.isCancel(proceed) || proceed !== true) {
          prompt.outro(pc.dim('Uninstallation cancelled. No changes were made.'));
          return;
        }
      }

      const spinner = prompt.spinner();
      if (!options.quiet) {
        spinner.start('Purging Take Five configuration, agent hooks, and credentials...');
      }

      const report = await runUninstall(deps);

      if (!options.quiet) {
        spinner.stop('Purge completed.');

        console.log(pc.bold(pc.cyan('\n  Uninstallation Summary:\n')));

        for (const result of report.agentResults) {
          if (result.success) {
            const detail = result.restoredFromBackup
              ? 'restored from .takefive.bak'
              : `${result.hooksRemoved.length} hooks removed`;
            console.log(`  ${pc.green('✔')} Agent "${result.agent}": ${pc.dim(detail)} (${result.configPath})`);
          } else {
            console.error(`  ${pc.red('✖')} Agent "${result.agent}": failed to remove hooks (${result.error})`);
          }
        }

        console.log(
          `  ${report.configPurged ? pc.green('✔') : pc.red('✖')} Configuration: ~/.takefive/ directory deleted`,
        );
        console.log(
          `  ${report.credentialsPurged ? pc.green('✔') : pc.red('✖')} Credentials: com.takefive.cli secret purged from OS store`,
        );

        console.log('');
        prompt.outro(pc.bold(pc.green('✨ Take Five has been completely uninstalled. Zero residue remains.')));
      }
    });
}
