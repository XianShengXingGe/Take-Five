import type { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  detectInstalledAgents,
  type AgentDetectorOptions,
} from '../../core/agent-detector.js';
import type { BarkClient } from '../../core/bark-client.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import type { ConfigLanguage, TakeFiveConfig } from '../../types/config.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ENABLED_AGENTS,
  DEFAULT_EVENT_RULES,
  DEFAULT_ICONS,
} from '../../types/config.js';
import type { BarkPushPayload } from '../../types/bark.js';
import { getLocaleStrings } from '../../i18n/index.js';

export interface PromptDriver {
  intro: (title: string) => void;
  outro: (message: string) => void;
  note: (message: string, title?: string) => void;
  cancel: (message: string) => void;
  isCancel: (value: unknown) => boolean;
  password: (opts: {
    message: string;
    validate?: (value: string) => string | undefined;
    mask?: string;
  }) => Promise<string | symbol>;
  select: <T>(opts: {
    message: string;
    options: { value: T; label: string; hint?: string }[];
    initialValue?: T;
  }) => Promise<T | symbol>;
  confirm: (opts: { message: string; initialValue?: boolean }) => Promise<boolean | symbol>;
  spinner: () => {
    start: (msg?: string) => void;
    stop: (msg?: string) => void;
    message: (msg?: string) => void;
  };
}

const defaultPromptDriver: PromptDriver = {
  intro: p.intro,
  outro: p.outro,
  note: p.note,
  cancel: p.cancel,
  isCancel: p.isCancel,
  password: p.password,
  select: p.select as PromptDriver['select'],
  confirm: p.confirm,
  spinner: p.spinner,
};

export interface InstallCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  barkClient: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
}

/**
 * Normalizes Bark server URL or device key into a fully qualified Bark push endpoint URL.
 */
export function normalizeBarkUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://api.day.app/${trimmed}`;
}

export function registerInstallCommand(
  program: Command,
  deps: InstallCommandDependencies,
): void {
  program
    .command('install')
    .description('Interactive setup wizard to configure Bark credentials, agents, and default rules')
    .action(async () => {
      const prompt = deps.promptDriver ?? defaultPromptDriver;

      prompt.intro(pc.bgCyan(pc.black(' Take Five (片刻) - Setup Wizard ')));

      // Step 1: Detect available agent environments
      const s = prompt.spinner();
      s.start('Scanning for installed coding agents...');

      const detected = detectInstalledAgents(deps.agentDetectorOptions);
      s.stop('Agent environments scanned.');

      const zhDict = getLocaleStrings('zh-CN');

      if (detected.hasAnyInstalled) {
        const detectedList = detected.installedAgents
          .map((agent) => `${zhDict.agents[agent] ?? agent} (${detected[agent].path})`)
          .join('\n• ');
        prompt.note(`• ${detectedList}`, 'Detected Coding Agents');
      } else {
        prompt.note(
          'No pre-existing agent configurations found in home directory.\nDefault notification hooks will be configured for all supported agents.',
          'Coding Agents',
        );
      }

      // Step 2: Prompt Bark URL & verify mobile connectivity
      let currentUrl = '';

      while (true) {
        if (!currentUrl) {
          const rawInput = await prompt.password({
            message: 'Enter your Bark server URL or device push key (e.g. https://api.day.app/YOUR_KEY/):',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Bark URL or device key cannot be empty.';
              }
              return undefined;
            },
          });

          if (prompt.isCancel(rawInput)) {
            prompt.cancel('Installation cancelled.');
            return;
          }

          currentUrl = normalizeBarkUrl(String(rawInput));
        }

        // Send test notification
        s.start('Sending test push notification to verify mobile connectivity...');
        const testPayload: BarkPushPayload = {
          title: '🎉 Take Five (片刻)',
          subtitle: 'Bark Setup Verification',
          body: 'Take Five is now connected to your device! Notifications are ready.',
          group: 'Take-Five',
          level: 'active',
          icon: DEFAULT_ICONS.claude,
        };

        try {
          await deps.barkClient.push(currentUrl, testPayload);
          s.stop(pc.green('✔ Test notification verified successfully on your device! 📱'));
          await deps.credentialStore.setBarkUrl(currentUrl);
          break;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          s.stop(pc.red(`✖ Failed to reach Bark server: ${errorMsg}`));

          const choice = await prompt.select({
            message: 'Bark notification dispatch failed. How would you like to proceed?',
            options: [
              { value: 'retry_input', label: 'Re-enter Bark URL / Device Key' },
              { value: 'retry_send', label: 'Retry sending test notification' },
              { value: 'force_save', label: 'Save URL anyway (skip connectivity test)' },
              { value: 'cancel', label: 'Cancel installation' },
            ],
          });

          if (prompt.isCancel(choice) || choice === 'cancel') {
            prompt.cancel('Installation cancelled.');
            return;
          }

          if (choice === 'retry_input') {
            currentUrl = '';
            continue;
          }

          if (choice === 'retry_send') {
            continue;
          }

          if (choice === 'force_save') {
            await deps.credentialStore.setBarkUrl(currentUrl);
            break;
          }
        }
      }

      // Step 3: Notification language preferences & rules confirmation
      const languageChoice = await prompt.select<ConfigLanguage>({
        message: 'Select preferred notification & CLI language:',
        options: [
          { value: 'system', label: 'System Default (Auto-detect from OS locale)' },
          { value: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
          { value: 'en', label: 'English' },
        ],
        initialValue: 'system',
      });

      if (prompt.isCancel(languageChoice) || typeof languageChoice === 'symbol') {
        prompt.cancel('Installation cancelled.');
        return;
      }

      // Display and confirm default notification rules
      prompt.note(
        '• task_completed (任务完成): active (普通通知)\n' +
          '• waiting_input (等待输入): timeSensitive (重要提醒)\n' +
          '• waiting_permission (等待授权): timeSensitive (重要提醒)\n' +
          '• task_failed (任务失败): timeSensitive (重要提醒)',
        'Default Notification Rules',
      );

      const confirmRules = await prompt.confirm({
        message: 'Confirm default notification rules and proceed with configuration?',
        initialValue: true,
      });

      if (prompt.isCancel(confirmRules) || confirmRules === false) {
        prompt.cancel('Installation cancelled.');
        return;
      }

      // Step 4: Initialize ~/.takefive/config.json
      s.start('Initializing configuration at ~/.takefive/config.json...');

      const enabledAgents = { ...DEFAULT_ENABLED_AGENTS };
      if (detected.hasAnyInstalled) {
        for (const agent of Object.keys(enabledAgents) as (keyof typeof enabledAgents)[]) {
          enabledAgents[agent] = detected[agent]?.installed ?? true;
        }
      }

      const newConfig: TakeFiveConfig = {
        version: '1.0.0',
        language: languageChoice as ConfigLanguage,
        debounceSeconds: DEFAULT_CONFIG.debounceSeconds,
        icons: { ...DEFAULT_ICONS },
        events: {
          task_completed: { ...DEFAULT_EVENT_RULES.task_completed },
          waiting_input: { ...DEFAULT_EVENT_RULES.waiting_input },
          waiting_permission: { ...DEFAULT_EVENT_RULES.waiting_permission },
          task_failed: { ...DEFAULT_EVENT_RULES.task_failed },
        },
        enabledAgents,
      };

      await deps.configManager.saveConfig(newConfig);
      s.stop('Configuration file initialized.');

      prompt.outro(
        pc.bold(
          pc.green(
            '✨ Take Five installation completed successfully!\n\n' +
              `Run ${pc.cyan('takefive test')} to trigger sample mobile notifications on demand.`,
          ),
        ),
      );
    });
}
