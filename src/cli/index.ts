import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { ConfigManager } from '../core/config-manager.js';
import { NotificationDispatcher } from '../core/notification-dispatcher.js';
import { OsCredentialStore } from '../core/credential-store.js';
import { BarkClient } from '../core/bark-client.js';
import type { CredentialStore } from '../types/credential.js';
import type { AgentDetectorOptions } from '../core/agent-detector.js';
import { registerNotifyCommand } from './commands/notify.js';
import { registerTestCommand } from './commands/test.js';
import { registerInstallCommand, type PromptDriver } from './commands/install.js';

export interface CliDependencies {
  configManager?: ConfigManager;
  dispatcher?: NotificationDispatcher;
  credentialStore?: CredentialStore;
  barkClient?: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
}

export function createCli(deps: CliDependencies = {}): Command {
  const program = new Command();

  program
    .name('takefive')
    .description('Smart notification tool for Coding Agents (Codex, Claude Code, OpenCode, Antigravity)')
    .version('1.0.0');

  const configManager = deps.configManager ?? new ConfigManager();
  const credentialStore = deps.credentialStore ?? new OsCredentialStore();
  const barkClient = deps.barkClient ?? new BarkClient();
  const dispatcher = deps.dispatcher ?? new NotificationDispatcher({ configManager, credentialStore, barkClient });

  registerNotifyCommand(program, dispatcher);
  registerTestCommand(program, dispatcher);
  registerInstallCommand(program, {
    configManager,
    credentialStore,
    barkClient,
    promptDriver: deps.promptDriver,
    agentDetectorOptions: deps.agentDetectorOptions,
  });

  return program;
}

export async function runCli(argv: string[] = process.argv, deps: CliDependencies = {}): Promise<void> {
  const program = createCli(deps);
  await program.parseAsync(argv);
}

const isDirectExecution = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
