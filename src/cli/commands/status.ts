import type { Command } from 'commander';
import pc from 'picocolors';
import { createAllAdapters } from '../../adapters/index.js';
import type { AgentAdapter, HookStatus } from '../../types/adapter.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import type { TakeFiveConfig } from '../../types/config.js';
import { SUPPORTED_AGENTS, UNIFIED_EVENT_TYPES, type SupportedAgent } from '../../types/event.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface StatusCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
}

export interface StatusReport {
  bark: {
    configured: boolean;
    endpoint: string | null;
  };
  agents: Record<
    SupportedAgent,
    {
      displayName: string;
      detected: boolean;
      installed: boolean;
      configPath: string;
      backupExists: boolean;
      hooks: HookStatus['hooks'];
    }
  >;
  config: TakeFiveConfig;
}

/**
 * Masks sensitive token in Bark URL for safe console display.
 */
export function maskBarkUrl(url: string | null): string {
  if (!url) return pc.dim('Not configured (Run "takefive install")');
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const hasTrailingSlash = pathname.endsWith('/');
    if (segments.length > 0) {
      const key = segments[0];
      if (key.length > 6) {
        const masked = `${key.slice(0, 3)}***${key.slice(-3)}`;
        segments[0] = masked;
      } else {
        segments[0] = '***';
      }
      parsed.pathname = '/' + segments.join('/') + (hasTrailingSlash ? '/' : '');
    }
    return parsed.toString();
  } catch {
    if (url.length > 8) {
      return `${url.slice(0, 4)}***${url.slice(-4)}`;
    }
    return '***';
  }
}

export async function gatherStatusReport(deps: StatusCommandDependencies): Promise<StatusReport> {
  const barkUrl = await deps.credentialStore.getBarkUrl();
  const config = await deps.configManager.loadConfig();
  const adapters = deps.adapters ?? createAllAdapters();

  const agentsReport = {} as StatusReport['agents'];

  for (const adapter of adapters) {
    const hookStatus = await adapter.getHookStatus(deps.env);
    agentsReport[adapter.id] = {
      displayName: adapter.displayName,
      detected: hookStatus.detected,
      installed: hookStatus.installed,
      configPath: hookStatus.configPath,
      backupExists: hookStatus.backupExists,
      hooks: hookStatus.hooks,
    };
  }

  return {
    bark: {
      configured: Boolean(barkUrl),
      endpoint: barkUrl,
    },
    agents: agentsReport,
    config,
  };
}

export function registerStatusCommand(
  program: Command,
  deps: StatusCommandDependencies,
): void {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .command('status')
    .description(dict.cli.commands.status)
    .option('--json', dict.cli.options.json)
    .action(async (options: { json?: boolean }) => {
      const report = await gatherStatusReport(deps);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      const lang = detectLanguage(report.config.language, deps.env);
      const dict = getLocaleStrings(lang);
      const s = dict.cli.status;

      console.log(pc.bold(pc.cyan(`\n  ${s.title}\n`)));

      // Section 1: Bark Push Service
      console.log(pc.bold(s.barkTitle));
      if (report.bark.configured) {
        console.log(`  ${s.configured.slice(0, 1) === '✔' ? 'Status:  ' : '状态:    '} ${pc.green(s.configured)}`);
        console.log(`  Endpoint: ${pc.dim(maskBarkUrl(report.bark.endpoint))}`);
      } else {
        console.log(`  ${s.notConfigured.slice(0, 1) === '✖' ? 'Status:  ' : '状态:    '} ${pc.red(s.notConfigured)}`);
        console.log(`  Hint:     ${s.notConfiguredHint}`);
      }
      console.log('');

      // Section 2: Coding Agent Integrations
      console.log(pc.bold(s.agentsTitle));
      for (const agentId of SUPPORTED_AGENTS) {
        const agentStatus = report.agents[agentId];
        if (!agentStatus) continue;

        const isEnabled = report.config.enabledAgents[agentId] ?? true;
        const statusBadge = agentStatus.installed
          ? pc.green(s.active)
          : agentStatus.detected
            ? pc.yellow(s.detectedHooksMissing)
            : pc.dim(s.notDetected);

        const enabledBadge = isEnabled ? pc.green(s.enabled) : pc.dim(s.disabled);
        const displayName = dict.agents[agentId] || agentStatus.displayName;

        console.log(`  • ${pc.bold(displayName)} (${agentId}) [${enabledBadge}]`);
        console.log(`    ${s.configPath}:     ${pc.dim(agentStatus.configPath)}`);
        console.log(
          `    Backup:     ${agentStatus.backupExists ? pc.green(s.backupPresent) : pc.dim(s.backupNone)}`,
        );

        const hookKeys = Object.keys(agentStatus.hooks || {});
        if (hookKeys.length > 0) {
          console.log(`    Hooks:      ${pc.dim(`${hookKeys.length}/${UNIFIED_EVENT_TYPES.length} ${s.hooksRegistered}`)}`);
        }
        console.log('');
      }

      // Section 3: Notification Rules & Configuration
      console.log(pc.bold(s.configTitle));
      console.log(`  ${s.language}:        ${pc.cyan(report.config.language)}`);
      console.log(`  ${s.debounceWindow}: ${pc.cyan(`${report.config.debounceSeconds}s`)}`);
      console.log(`  ${s.eventRules}:`);

      for (const eventType of UNIFIED_EVENT_TYPES) {
        const rule = report.config.events[eventType];
        const state = rule?.enabled ? pc.green('ON ') : pc.red('OFF');
        const level = rule?.level ? pc.dim(`(level: ${rule.level})`) : '';
        const customTitle = rule?.title ? pc.dim(` [title: "${rule.title}"]`) : '';
        console.log(`    - ${eventType.padEnd(20)} [${state}] ${level}${customTitle}`);
      }

      console.log('');
    });
}
