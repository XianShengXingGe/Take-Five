import type { Command } from 'commander';
import pc from 'picocolors';
import { createAllAdapters } from '../../adapters/index.js';
import type { AgentAdapter, HookStatus } from '../../types/adapter.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import type { TakeFiveConfig } from '../../types/config.js';
import { SUPPORTED_AGENTS, UNIFIED_EVENT_TYPES, type SupportedAgent } from '../../types/event.js';

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
  program
    .command('status')
    .description('Display Bark connectivity, agent hook statuses, and notification rules')
    .option('--json', 'Output system status in JSON format')
    .action(async (options: { json?: boolean }) => {
      const report = await gatherStatusReport(deps);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      console.log(pc.bold(pc.cyan('\n  Take Five (片刻) · System Status\n')));

      // Section 1: Bark Push Service
      console.log(pc.bold('📱 Bark Push Service'));
      if (report.bark.configured) {
        console.log(`  Status:   ${pc.green('✔ Configured')}`);
        console.log(`  Endpoint: ${pc.dim(maskBarkUrl(report.bark.endpoint))}`);
      } else {
        console.log(`  Status:   ${pc.red('✖ Not configured')}`);
        console.log(`  Hint:     Run ${pc.cyan('takefive install')} to set up credentials.`);
      }
      console.log('');

      // Section 2: Coding Agent Integrations
      console.log(pc.bold('🤖 Coding Agent Integrations'));
      for (const agentId of SUPPORTED_AGENTS) {
        const agentStatus = report.agents[agentId];
        if (!agentStatus) continue;

        const isEnabled = report.config.enabledAgents[agentId] ?? true;
        const statusBadge = agentStatus.installed
          ? pc.green('✔ Active')
          : agentStatus.detected
            ? pc.yellow('⚠ Detected (Hooks Missing)')
            : pc.dim('○ Not Detected');

        const enabledBadge = isEnabled ? pc.green('enabled') : pc.dim('disabled');

        console.log(`  • ${pc.bold(agentStatus.displayName)} (${agentId}) [${enabledBadge}]`);
        console.log(`    Status:     ${statusBadge}`);
        console.log(`    Config:     ${pc.dim(agentStatus.configPath)}`);
        console.log(
          `    Backup:     ${agentStatus.backupExists ? pc.green('Present (.takefive.bak)') : pc.dim('None')}`,
        );

        const hookKeys = Object.keys(agentStatus.hooks || {});
        if (hookKeys.length > 0) {
          console.log(`    Hooks:      ${pc.dim(`${hookKeys.length}/${UNIFIED_EVENT_TYPES.length} events registered`)}`);
        }
        console.log('');
      }

      // Section 3: Notification Rules & Configuration
      console.log(pc.bold('⚙ Configuration & Notification Rules'));
      console.log(`  Language:        ${pc.cyan(report.config.language)}`);
      console.log(`  Debounce Window: ${pc.cyan(`${report.config.debounceSeconds}s`)}`);
      console.log('  Event Rules:');

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
