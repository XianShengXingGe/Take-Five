import { Command } from 'commander';
import { ConfigManager } from '../core/config-manager.js';
import { NotificationDispatcher } from '../core/notification-dispatcher.js';
import { OsCredentialStore } from '../core/credential-store.js';
import { BarkClient } from '../core/bark-client.js';
import type { CredentialStore } from '../types/credential.js';
import type { AgentDetectorOptions } from '../core/agent-detector.js';
import { registerNotifyCommand } from './commands/notify.js';
import { registerTestCommand } from './commands/test.js';
import { registerInstallCommand } from './commands/install.js';
import { registerStatusCommand } from './commands/status.js';
import { registerConfigCommand } from './commands/config.js';
import { registerRepairCommand } from './commands/repair.js';
import { registerUninstallCommand } from './commands/uninstall.js';
import type { PromptDriver } from './prompt-driver.js';
import type { AgentAdapter } from '../types/adapter.js';

import { detectLanguage, getLocaleStrings } from '../i18n/index.js';

export interface CliDependencies {
  configManager?: ConfigManager;
  dispatcher?: NotificationDispatcher;
  credentialStore?: CredentialStore;
  barkClient?: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
}

export function createCli(deps: CliDependencies = {}): Command {
  const program = new Command();
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .name('takefive')
    .description(dict.cli.description)
    .version('1.0.0');

  const configManager = deps.configManager ?? new ConfigManager();
  const credentialStore = deps.credentialStore ?? new OsCredentialStore();
  const barkClient = deps.barkClient ?? new BarkClient();
  const dispatcher = deps.dispatcher ?? new NotificationDispatcher({ configManager, credentialStore, barkClient });

  registerNotifyCommand(program, dispatcher, deps.env);
  registerTestCommand(program, dispatcher, deps.env);
  registerInstallCommand(program, {
    configManager,
    credentialStore,
    barkClient,
    promptDriver: deps.promptDriver,
    agentDetectorOptions: deps.agentDetectorOptions,
    adapters: deps.adapters,
    env: deps.env,
  });
  registerStatusCommand(program, {
    configManager,
    credentialStore,
    adapters: deps.adapters,
    env: deps.env,
  });
  registerConfigCommand(program, {
    configManager,
    credentialStore,
    barkClient,
    promptDriver: deps.promptDriver,
  });
  registerRepairCommand(program, {
    adapters: deps.adapters,
    env: deps.env,
  });
  registerUninstallCommand(program, {
    credentialStore,
    adapters: deps.adapters,
    promptDriver: deps.promptDriver,
    env: deps.env,
  });

  return program;
}

export async function runCli(argv: string[] = process.argv, deps: CliDependencies = {}): Promise<void> {
  const program = createCli(deps);
  await program.parseAsync(argv);
}
