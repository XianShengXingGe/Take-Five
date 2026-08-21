import type { Command } from 'commander';
import pc from 'picocolors';
import type { BarkClient } from '../../core/bark-client.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';
import { normalizeBarkUrl } from './install.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ICONS,
  type ConfigLanguage,
  type EventRule,
  type TakeFiveConfig,
} from '../../types/config.js';
import {
  SUPPORTED_AGENTS,
  UNIFIED_EVENT_TYPES,
  type NotificationLevel,
  type SupportedAgent,
  type UnifiedEventType,
} from '../../types/event.js';
import type { BarkPushPayload } from '../../types/bark.js';

export interface ConfigCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  barkClient: BarkClient;
  promptDriver?: PromptDriver;
}

export function registerConfigCommand(
  program: Command,
  deps: ConfigCommandDependencies,
): void {
  program
    .command('config')
    .description('Interactive configuration menu for Bark credentials, notification rules, and preferences')
    .action(async () => {
      const prompt = deps.promptDriver ?? defaultPromptDriver;

      prompt.intro(pc.bgCyan(pc.black(' Take Five (片刻) · Configuration ')));

      let config: TakeFiveConfig = await deps.configManager.loadConfig();
      let hasChanges = false;

      while (true) {
        const choice = await prompt.select({
          message: 'What would you like to configure?',
          options: [
            { value: 'bark_url', label: '📱 Bark Server URL / Device Key' },
            {
              value: 'language',
              label: `🌐 Active Language (${config.language})`,
            },
            {
              value: 'debounce',
              label: `⏱  Debounce Cooldown (${config.debounceSeconds}s)`,
            },
            { value: 'event_rules', label: '🔔 Per-Event Notification Rules' },
            { value: 'agents', label: '🤖 Enabled Coding Agents' },
            { value: 'reset', label: '🔄 Reset All to Defaults' },
            { value: 'save_exit', label: '💾 Save and Exit' },
            { value: 'cancel', label: '❌ Cancel (Discard Unsaved Changes)' },
          ],
        });

        if (prompt.isCancel(choice) || choice === 'cancel') {
          prompt.outro(pc.dim('Configuration cancelled. No changes were saved.'));
          return;
        }

        if (choice === 'save_exit') {
          await deps.configManager.saveConfig(config);
          prompt.outro(pc.green('✔ Configuration saved successfully to ~/.takefive/config.json!'));
          return;
        }

        if (choice === 'bark_url') {
          const currentUrl = (await deps.credentialStore.getBarkUrl()) ?? '';
          const rawInput = await prompt.password({
            message: `Enter new Bark server URL or device push key (current: ${currentUrl ? 'configured' : 'none'}):`,
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Bark URL or device key cannot be empty.';
              }
              return undefined;
            },
          });

          if (prompt.isCancel(rawInput)) continue;

          const normalizedUrl = normalizeBarkUrl(String(rawInput));
          const spinner = prompt.spinner();
          spinner.start('Verifying Bark push endpoint...');

          const testPayload: BarkPushPayload = {
            title: 'Take Five (片刻)',
            subtitle: 'Configuration Updated',
            body: 'Bark push notifications verified successfully!',
            group: 'Take-Five',
            level: 'active',
            icon: config.icons.claude ?? DEFAULT_ICONS.claude,
          };

          try {
            await deps.barkClient.push(normalizedUrl, testPayload);
            spinner.stop(pc.green('✔ Test notification verified on your device!'));
            await deps.credentialStore.setBarkUrl(normalizedUrl);
            prompt.note('Bark credential updated securely in OS keychain.', 'Success');
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            spinner.stop(pc.red(`✖ Failed to reach Bark server: ${errorMsg}`));

            const forceSave = await prompt.confirm({
              message: 'Save Bark URL anyway despite test failure?',
              initialValue: false,
            });

            if (!prompt.isCancel(forceSave) && forceSave === true) {
              await deps.credentialStore.setBarkUrl(normalizedUrl);
              prompt.note('Bark credential saved without verification.', 'Saved');
            }
          }
          continue;
        }

        if (choice === 'language') {
          const langChoice = await prompt.select<ConfigLanguage>({
            message: 'Select preferred notification and CLI language:',
            options: [
              { value: 'system', label: 'System Default (Auto-detect OS locale)' },
              { value: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
              { value: 'en', label: 'English' },
            ],
            initialValue: config.language,
          });

          if (prompt.isCancel(langChoice)) continue;
          config.language = langChoice as ConfigLanguage;
          hasChanges = true;
          prompt.note(`Language updated to "${config.language}".`, 'Updated');
          continue;
        }

        if (choice === 'debounce') {
          const debounceInput = await prompt.text({
            message: 'Enter debounce cooldown window in seconds (default: 2):',
            defaultValue: String(config.debounceSeconds),
            validate: (val) => {
              const num = Number(val);
              if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
                return 'Please enter a non-negative integer (e.g. 0, 1, 2, 5).';
              }
              return undefined;
            },
          });

          if (prompt.isCancel(debounceInput)) continue;
          config.debounceSeconds = Number(debounceInput);
          hasChanges = true;
          prompt.note(`Debounce cooldown set to ${config.debounceSeconds}s.`, 'Updated');
          continue;
        }

        if (choice === 'agents') {
          await configureAgentsMenu(config, prompt);
          hasChanges = true;
          continue;
        }

        if (choice === 'event_rules') {
          await configureEventRulesMenu(config, prompt);
          hasChanges = true;
          continue;
        }

        if (choice === 'reset') {
          const confirmReset = await prompt.confirm({
            message: 'Reset all configuration to factory defaults?',
            initialValue: false,
          });

          if (!prompt.isCancel(confirmReset) && confirmReset === true) {
            config = {
              version: '1.0.0',
              language: DEFAULT_CONFIG.language,
              debounceSeconds: DEFAULT_CONFIG.debounceSeconds,
              icons: { ...DEFAULT_CONFIG.icons },
              events: {
                task_completed: { ...DEFAULT_CONFIG.events.task_completed },
                waiting_input: { ...DEFAULT_CONFIG.events.waiting_input },
                waiting_permission: { ...DEFAULT_CONFIG.events.waiting_permission },
                task_failed: { ...DEFAULT_CONFIG.events.task_failed },
              },
              enabledAgents: { ...DEFAULT_CONFIG.enabledAgents },
            };
            hasChanges = true;
            prompt.note('Configuration reset to defaults in memory.', 'Reset');
          }
          continue;
        }
      }
    });
}

async function configureAgentsMenu(
  config: TakeFiveConfig,
  prompt: PromptDriver,
): Promise<void> {
  while (true) {
    const options = SUPPORTED_AGENTS.map((agent) => {
      const isEnabled = config.enabledAgents[agent] ?? true;
      const statusText = isEnabled ? pc.green('ON') : pc.red('OFF');
      return {
        value: agent,
        label: `${agent.padEnd(12)} [${statusText}]`,
      };
    });

    const agentChoice = await prompt.select<string>({
      message: 'Select an agent to toggle ON/OFF, or Back:',
      options: [...options, { value: 'back', label: '⬅ Back to main menu' }],
    });

    if (prompt.isCancel(agentChoice) || agentChoice === 'back') {
      return;
    }

    const targetAgent = agentChoice as SupportedAgent;
    config.enabledAgents[targetAgent] = !(config.enabledAgents[targetAgent] ?? true);
  }
}

async function configureEventRulesMenu(
  config: TakeFiveConfig,
  prompt: PromptDriver,
): Promise<void> {
  while (true) {
    const options = UNIFIED_EVENT_TYPES.map((eventType) => {
      const rule = config.events[eventType] ?? { enabled: true, level: 'active' };
      const statusText = rule.enabled ? pc.green('ON ') : pc.red('OFF');
      const levelText = pc.dim(`(${rule.level})`);
      return {
        value: eventType,
        label: `${eventType.padEnd(20)} [${statusText}] ${levelText}`,
      };
    });

    const eventChoice = await prompt.select<string>({
      message: 'Select an event type to configure, or Back:',
      options: [...options, { value: 'back', label: '⬅ Back to main menu' }],
    });

    if (prompt.isCancel(eventChoice) || eventChoice === 'back') {
      return;
    }

    const eventType = eventChoice as UnifiedEventType;
    const rule: EventRule = config.events[eventType] ?? { enabled: true, level: 'active' };

    await configureSingleEventRule(eventType, rule, prompt);
    config.events[eventType] = rule;
  }
}

async function configureSingleEventRule(
  eventType: UnifiedEventType,
  rule: EventRule,
  prompt: PromptDriver,
): Promise<void> {
  while (true) {
    const editChoice = await prompt.select({
      message: `Configure rules for event "${eventType}":`,
      options: [
        {
          value: 'toggle',
          label: `Enabled status: ${rule.enabled ? pc.green('Enabled') : pc.red('Disabled')}`,
        },
        {
          value: 'level',
          label: `Urgency Level: ${pc.cyan(rule.level)}`,
        },
        {
          value: 'title',
          label: `Custom Title: ${rule.title ? pc.cyan(`"${rule.title}"`) : pc.dim('None (default template)')}`,
        },
        {
          value: 'body',
          label: `Custom Body: ${rule.body ? pc.cyan(`"${rule.body}"`) : pc.dim('None (default template)')}`,
        },
        { value: 'back', label: '⬅ Back to events list' },
      ],
    });

    if (prompt.isCancel(editChoice) || editChoice === 'back') {
      return;
    }

    if (editChoice === 'toggle') {
      rule.enabled = !rule.enabled;
      continue;
    }

    if (editChoice === 'level') {
      const levelChoice = await prompt.select<NotificationLevel>({
        message: `Select push urgency level for ${eventType}:`,
        options: [
          { value: 'passive', label: 'passive (静默通知 - No sound/vibration)' },
          { value: 'active', label: 'active (普通通知 - Standard alert)' },
          { value: 'timeSensitive', label: 'timeSensitive (重要提醒 - Breaks through focus)' },
          { value: 'critical', label: 'critical (强提醒 - Alarm sound)' },
        ],
        initialValue: rule.level,
      });

      if (!prompt.isCancel(levelChoice)) {
        rule.level = levelChoice as NotificationLevel;
      }
      continue;
    }

    if (editChoice === 'title') {
      const titleInput = await prompt.text({
        message: 'Enter custom title override (leave empty to reset to default):',
        defaultValue: rule.title ?? '',
      });

      if (!prompt.isCancel(titleInput)) {
        const trimmed = String(titleInput).trim();
        rule.title = trimmed.length > 0 ? trimmed : undefined;
      }
      continue;
    }

    if (editChoice === 'body') {
      const bodyInput = await prompt.text({
        message: 'Enter custom body override (leave empty to reset to default):',
        defaultValue: rule.body ?? '',
      });

      if (!prompt.isCancel(bodyInput)) {
        const trimmed = String(bodyInput).trim();
        rule.body = trimmed.length > 0 ? trimmed : undefined;
      }
      continue;
    }
  }
}
