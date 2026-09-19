import { Command } from 'commander';
import { ConfigManager } from '../core/config-manager.js';
import { NotificationDispatcher } from '../core/notification-dispatcher.js';
import { OsCredentialStore } from '../core/credential-store.js';
import { BarkClient } from '../core/bark-client.js';
import type { CredentialStore } from '../types/credential.js';
import type { AgentDetectorOptions } from '../core/agent-detector.js';
import { registerNotifyCommand } from './commands/notify.js';
import type { PromptDriver } from './prompt-driver.js';
import type { AgentAdapter } from '../types/adapter.js';

import { detectLanguage, getLocaleStrings } from '../i18n/index.js';
import { VERSION } from '../version.js';

export interface CliDependencies {
  configManager?: ConfigManager;
  dispatcher?: NotificationDispatcher;
  credentialStore?: CredentialStore;
  barkClient?: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
  fastPath?: boolean | string;
}

/**
 * Fast-path pre-parsing check to determine if the target subcommand is 'notify'.
 * Scans argv for the first non-option token after the script entry.
 */
export function isNotifyInvocation(argv: string[]): boolean {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') break;
    if (!arg.startsWith('-')) {
      return arg === 'notify';
    }
  }
  return false;
}

/**
 * Creates a lightweight Commander instance solely for the 'notify' subcommand.
 * Skips registration of heavy interactive commands to minimize initialization overhead.
 */
export function createNotifyCli(deps: CliDependencies = {}): Command {
  const program = new Command();
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .name('takefive')
    .description(dict.cli.description)
    .version(VERSION);

  const configManager = deps.configManager ?? new ConfigManager({ env: deps.env });
  const credentialStore = deps.credentialStore ?? new OsCredentialStore();
  const barkClient = deps.barkClient ?? new BarkClient();
  const dispatcher = deps.dispatcher ?? new NotificationDispatcher({ configManager, credentialStore, barkClient });

  registerNotifyCommand(program, dispatcher, deps.env);

  return program;
}

export function createCli(deps: CliDependencies = {}): Command {
  if (deps.fastPath === true || deps.fastPath === 'notify') {
    return createNotifyCli(deps);
  }

  const program = new Command();
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .name('takefive')
    .description(dict.cli.description)
    .version(VERSION);

  const configManager = deps.configManager ?? new ConfigManager({ env: deps.env });
  const credentialStore = deps.credentialStore ?? new OsCredentialStore();
  const barkClient = deps.barkClient ?? new BarkClient();
  const dispatcher = deps.dispatcher ?? new NotificationDispatcher({ configManager, credentialStore, barkClient });

  // 1. Notify (registered directly on the program)
  registerNotifyCommand(program, dispatcher, deps.env);

  // 2. Test (lazy dynamic import)
  program
    .command('test')
    .description(dict.cli.commands.test)
    .option(
      '-e, --event <type>',
      'Specific lifecycle event type to test (task_completed, waiting_input, waiting_permission, task_failed)',
    )
    .option('-a, --agent <name>', 'Agent name (default: claude)', 'claude')
    .option('-p, --project [name]', 'Project workspace name (auto-detected if omitted)')
    .option('--url [url]', 'Direct Bark push URL override')
    .option('-q, --quiet', 'Suppress console output')
    .action(async (options) => {
      const { runTestAction } = await import('./commands/test.js');
      await runTestAction(options, dispatcher, deps.env);
    });

  // 3. Install (lazy dynamic import)
  program
    .command('install')
    .description(dict.cli.commands.install)
    .option('-r, --reconfigure', 'Reconfigure all settings, language, and credentials interactively')
    .option('-b, --bark-url <url>', 'Set or update Bark push URL directly')
    .option('-y, --yes', 'Automatically accept defaults without prompting')
    .action(async (options) => {
      const { runInstallAction } = await import('./commands/install.js');
      await runInstallAction(options, {
        configManager,
        credentialStore,
        barkClient,
        promptDriver: deps.promptDriver,
        agentDetectorOptions: deps.agentDetectorOptions,
        adapters: deps.adapters,
        env: deps.env,
      });
    });

  // 4. Status (lazy dynamic import)
  program
    .command('status')
    .description(dict.cli.commands.status)
    .option('--json', dict.cli.options.json)
    .action(async (options) => {
      const { runStatusAction } = await import('./commands/status.js');
      await runStatusAction(options, {
        configManager,
        credentialStore,
        adapters: deps.adapters,
        env: deps.env,
      });
    });

  // 5. Config (lazy dynamic import)
  program
    .command('config')
    .description(dict.cli.commands.config)
    .option('-b, --bark-url <url>', 'Set Bark push URL or device key directly')
    .option('--autostart <boolean>', 'Enable or disable autostart (true/false)')
    .option('--debounce <seconds>', 'Set debounce duration in seconds')
    .option('--language <lang>', 'Set language (system, zh-CN, en)')
    .option('--event <type>', 'Set event rule type (task_completed, waiting_input, waiting_permission, task_failed)')
    .option('--level <level>', 'Set notification level (active, timeSensitive)')
    .option('-q, --quiet', 'Suppress output')
    .action(async (options) => {
      const { runConfigAction } = await import('./commands/config.js');
      await runConfigAction(options, {
        configManager,
        credentialStore,
        barkClient,
        promptDriver: deps.promptDriver,
        env: deps.env,
      });
    });

  // 6. Repair (lazy dynamic import)
  program
    .command('repair')
    .description(dict.cli.commands.repair)
    .option('-a, --agent <name>', dict.cli.options.agent)
    .option('-f, --force', dict.cli.options.forceRepair)
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (options) => {
      const { runRepairAction } = await import('./commands/repair.js');
      await runRepairAction(options, {
        adapters: deps.adapters,
        env: deps.env,
      });
    });

  // 7. Uninstall (lazy dynamic import)
  program
    .command('uninstall')
    .description(dict.cli.commands.uninstall)
    .option('-y, --yes', dict.cli.options.yes)
    .option('-f, --force', dict.cli.options.yes)
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (options) => {
      const { runUninstallAction } = await import('./commands/uninstall.js');
      await runUninstallAction(options, {
        credentialStore,
        adapters: deps.adapters,
        promptDriver: deps.promptDriver,
        env: deps.env,
      });
    });

  // 8. Agents switch (lazy dynamic import)
  program
    .command('enable [agents...]')
    .alias('on')
    .description(dict.cli.commands.enable)
    .option('--all', 'Enable all four agents')
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (agents: string[], options) => {
      const { runEnableAction } = await import('./commands/agents.js');
      await runEnableAction(agents, options, { configManager, env: deps.env });
    });

  program
    .command('disable [agents...]')
    .alias('off')
    .description(dict.cli.commands.disable)
    .option('--all', 'Disable all four agents')
    .option('-q, --quiet', dict.cli.options.quiet)
    .action(async (agents: string[], options) => {
      const { runDisableAction } = await import('./commands/agents.js');
      await runDisableAction(agents, options, { configManager, env: deps.env });
    });

  // 9. Tray (lazy dynamic import)
  program
    .command('tray [action]')
    .alias('menu')
    .description(dict.cli.commands.tray)
    .action(async (action?: string) => {
      const { runTrayAction } = await import('./commands/tray.js');
      await runTrayAction(action, { env: deps.env });
    });

  // 10. MCP (lazy dynamic import)
  program
    .command('mcp')
    .description('Run Take Five Model Context Protocol (MCP) server over stdio for Claude Desktop')
    .action(async () => {
      const { runMcpAction } = await import('./commands/mcp.js');
      await runMcpAction(dispatcher, deps.env);
    });

  return program;
}

export async function runCli(argv: string[] = process.argv, deps: CliDependencies = {}): Promise<void> {
  if (deps.fastPath === true || deps.fastPath === 'notify' || (deps.fastPath !== false && isNotifyInvocation(argv))) {
    const program = createNotifyCli(deps);
    await program.parseAsync(argv);
    return;
  }
  const program = createCli(deps);
  await program.parseAsync(argv);
}
