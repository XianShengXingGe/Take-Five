import type { Command } from 'commander';
import pc from 'picocolors';
import { maskBarkUrl } from '../../core/bark-client.js';
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
    platform?: string;
    platformSupported?: boolean;
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
 * Formats Bark URL for status display, masking secrets.
 */
export function formatStatusBarkUrl(url: string | null): string {
  if (!url) return pc.dim('Not configured (Run "takefive install")');
  return maskBarkUrl(url);
}

export async function gatherStatusReport(deps: StatusCommandDependencies): Promise<StatusReport> {
  const [barkUrl, config] = await Promise.all([
    deps.credentialStore.getBarkUrl(deps.env),
    deps.configManager.loadConfig(),
  ]);
  const adapters = deps.adapters ?? createAllAdapters();

  const platform = String(deps.credentialStore.getPlatform());
  const platformSupported = deps.credentialStore.isSupported();

  const agentsReport = {} as StatusReport['agents'];

  const adapterResults = await Promise.all(
    adapters.map(async (adapter) => {
      const hookStatus = await adapter.getHookStatus(deps.env);
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        hookStatus,
      };
    }),
  );

  for (const { id, displayName, hookStatus } of adapterResults) {
    agentsReport[id] = {
      displayName,
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
      platform,
      platformSupported,
    },
    agents: agentsReport,
    config,
  };
}

export async function runStatusAction(
  options: { json?: boolean },
  deps: StatusCommandDependencies,
): Promise<void> {
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
  if (report.bark.platformSupported === false) {
    const warningTemplate = s.unsupportedPlatformWarning || '⚠ Platform "%s" is unsupported for secure credential storage.';
    const warningMsg = warningTemplate.replace('%s', report.bark.platform || process.platform);
    console.log(`  ${pc.yellow(warningMsg)}`);
  }
  if (report.bark.configured) {
    console.log(`  ${s.statusLabel} ${pc.green(s.configured)}`);
    console.log(`  Endpoint: ${pc.dim(formatStatusBarkUrl(report.bark.endpoint))}`);
  } else {
    console.log(`  ${s.statusLabel} ${pc.red(s.notConfigured)}`);
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

    console.log(`  • ${pc.bold(displayName)} (${agentId}) [${enabledBadge}] [${statusBadge}]`);
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
      await runStatusAction(options, deps);
    });
}
