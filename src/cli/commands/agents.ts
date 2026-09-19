import type { Command } from 'commander';
import pc from 'picocolors';
import type { ConfigManager } from '../../core/config-manager.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';
import {
  SUPPORTED_AGENTS,
  isSupportedAgent,
  type SupportedAgent,
} from '../../types/event.js';

export type AgentSwitchTarget = SupportedAgent[] | 'all';

/** Atomically updates the central soft switches after validating every target. */
export async function setAgentEnabledState(
  configManager: ConfigManager,
  target: AgentSwitchTarget | string[],
  enabled: boolean,
): Promise<SupportedAgent[]> {
  const requested = target === 'all' ? [...SUPPORTED_AGENTS] : [...target];
  const invalid = requested.filter((agent) => !isSupportedAgent(agent));
  if (invalid.length > 0) {
    throw new Error(`Unsupported agent: ${invalid.join(', ')}`);
  }

  const agents = requested as SupportedAgent[];
  const config = await configManager.loadConfig();
  for (const agent of agents) config.enabledAgents[agent] = enabled;
  await configManager.saveConfig(config);
  return agents;
}

export interface AgentSwitchDependencies {
  configManager: ConfigManager;
  env?: Record<string, string | undefined>;
}

export interface AgentSwitchOptions {
  all?: boolean;
  quiet?: boolean;
}

export async function runAgentSwitchAction(
  agents: string[],
  options: AgentSwitchOptions,
  deps: AgentSwitchDependencies,
  enabled: boolean,
): Promise<void> {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);
  try {
    if (!options.all && agents.length === 0) {
      throw new Error(`Specify an agent (${SUPPORTED_AGENTS.join(', ')}) or use --all.`);
    }
    const changed = await setAgentEnabledState(deps.configManager, options.all ? 'all' : agents, enabled);
    if (!options.quiet) {
      const state = enabled ? dict.cli.agentSwitch.enabled : dict.cli.agentSwitch.disabled;
      console.log(pc.green(`${state}: ${changed.map((agent) => dict.agents[agent]).join(', ')}`));
    }
  } catch (error: unknown) {
    if (!options.quiet) console.error(pc.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

export async function runEnableAction(
  agents: string[],
  options: AgentSwitchOptions,
  deps: AgentSwitchDependencies,
): Promise<void> {
  return runAgentSwitchAction(agents, options, deps, true);
}

export async function runDisableAction(
  agents: string[],
  options: AgentSwitchOptions,
  deps: AgentSwitchDependencies,
): Promise<void> {
  return runAgentSwitchAction(agents, options, deps, false);
}

function registerSingleSwitch(
  program: Command,
  deps: AgentSwitchDependencies,
  enabled: boolean,
): void {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);
  const name = enabled ? 'enable' : 'disable';
  const alias = enabled ? 'on' : 'off';

  program
    .command(`${name} [agents...]`)
    .alias(alias)
    .description(enabled ? dict.cli.commands.enable : dict.cli.commands.disable)
    .option('--all', enabled ? 'Enable all four agents' : 'Disable all four agents')
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (agents: string[], options: AgentSwitchOptions) => {
      await runAgentSwitchAction(agents, options, deps, enabled);
    });
}

export function registerAgentSwitchCommands(program: Command, deps: AgentSwitchDependencies): void {
  registerSingleSwitch(program, deps, true);
  registerSingleSwitch(program, deps, false);
}
