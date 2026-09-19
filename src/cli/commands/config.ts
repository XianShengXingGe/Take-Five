import type { Command } from 'commander';
import pc from 'picocolors';
import { type BarkClient, isValidBarkUrl, normalizeBarkUrl } from '../../core/bark-client.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ICONS,
  isConfigLanguage,
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
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface ConfigCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  barkClient: BarkClient;
  promptDriver?: PromptDriver;
  env?: Record<string, string | undefined>;
}

export interface ConfigCommandOptions {
  barkUrl?: string;
  autostart?: string;
  debounce?: string;
  language?: string;
  event?: string;
  level?: string;
  quiet?: boolean;
}

export async function runConfigAction(
  options: ConfigCommandOptions = {},
  deps: ConfigCommandDependencies,
): Promise<void> {
  let config: TakeFiveConfig = await deps.configManager.loadConfig();

  const hasDirectOptions =
    options.barkUrl !== undefined ||
    options.autostart !== undefined ||
    options.debounce !== undefined ||
    options.language !== undefined ||
    options.event !== undefined;

  if (hasDirectOptions) {
    if (options.barkUrl !== undefined) {
      if (!isValidBarkUrl(options.barkUrl)) {
        if (!options.quiet) {
          console.error(pc.red('Error: Invalid Bark URL or device key format.'));
        }
        process.exitCode = 1;
        return;
      }
      const normalizedUrl = normalizeBarkUrl(options.barkUrl);
      try {
        await deps.credentialStore.setBarkUrl(normalizedUrl, deps.env);
      } catch (err: unknown) {
        if (!options.quiet) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(pc.red(`Error: Failed to persist Bark credentials: ${msg}`));
        }
        process.exitCode = 1;
        return;
      }
    }

    let configModified = false;
    if (options.autostart !== undefined) {
      config.autostart = options.autostart === 'true' || options.autostart === '1';
      configModified = true;
    }
    if (options.debounce !== undefined) {
      const sec = parseFloat(options.debounce);
      if (!isNaN(sec) && sec >= 0) {
        config.debounceSeconds = sec;
        configModified = true;
      }
    }
    if (options.language !== undefined) {
      let lang = options.language;
      if (lang === 'zh' || lang === 'zh_CN' || lang === 'cn') {
        lang = 'zh-CN';
      }
      if (isConfigLanguage(lang)) {
        config.language = lang;
        configModified = true;
      }
    }
    if (options.event && UNIFIED_EVENT_TYPES.includes(options.event as UnifiedEventType)) {
      const evt = options.event as UnifiedEventType;
      const level = options.level;
      if (level === 'active' || level === 'timeSensitive') {
        if (!config.events[evt]) {
          config.events[evt] = { enabled: true, level };
        } else {
          config.events[evt].level = level;
        }
        configModified = true;
      }
    }
    if (configModified) {
      await deps.configManager.saveConfig(config);
    }
    if (!options.quiet) {
      console.log(pc.green('✔ Configuration updated successfully.'));
    }
    return;
  }

      const prompt = deps.promptDriver ?? defaultPromptDriver;
      let activeLang = detectLanguage(config.language);
      let dict = getLocaleStrings(activeLang);
      let c = dict.cli.config;

      prompt.intro(pc.bgCyan(pc.black(` ${c.intro} `)));

      while (true) {
        activeLang = detectLanguage(config.language);
        dict = getLocaleStrings(activeLang);
        c = dict.cli.config;

        const choice = await prompt.select({
          message: c.menuPrompt,
          options: [
            { value: 'bark_url', label: c.barkUrlOption },
            {
              value: 'language',
              label: `${c.langOption} (${config.language})`,
            },
            {
              value: 'debounce',
              label: `${c.debounceOption} (${config.debounceSeconds}s)`,
            },
            { value: 'event_rules', label: c.rulesOption },
            { value: 'agents', label: c.agentsOption },
            { value: 'reset', label: c.resetOption },
            { value: 'save_exit', label: c.saveOption },
            { value: 'cancel', label: c.cancelOption },
          ],
        });

        if (prompt.isCancel(choice) || choice === 'cancel') {
          prompt.outro(pc.dim(c.cancelledOutro));
          return;
        }

        if (choice === 'save_exit') {
          await deps.configManager.saveConfig(config);
          prompt.outro(pc.green(c.saveSuccessOutro));
          return;
        }

        if (choice === 'bark_url') {
          const currentUrl = (await deps.credentialStore.getBarkUrl()) ?? '';
          const rawInput = await prompt.password({
            message: `${c.currentBarkPrompt} (${currentUrl ? 'configured' : 'none'}):`,
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return c.barkEmptyError;
              }
              return undefined;
            },
          });

          if (prompt.isCancel(rawInput)) continue;

          const normalizedUrl = normalizeBarkUrl(String(rawInput));
          const spinner = prompt.spinner();
          spinner.start(c.barkTesting);

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
            spinner.stop(pc.green(c.barkTestSuccess));
            await deps.credentialStore.setBarkUrl(normalizedUrl);
            prompt.note(c.barkSuccessNote, c.noteSuccess);
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            spinner.stop(pc.red(`✖ Failed to reach Bark server: ${errorMsg}`));

            const forceSave = await prompt.confirm({
              message: c.barkFailConfirm,
              initialValue: false,
            });

            if (!prompt.isCancel(forceSave) && forceSave === true) {
              await deps.credentialStore.setBarkUrl(normalizedUrl);
              prompt.note(c.barkForceSaved, c.noteSaved);
            }
          }
          continue;
        }

        if (choice === 'language') {
          const langChoice = await prompt.select<ConfigLanguage>({
            message: c.langPrompt,
            options: [
              { value: 'system', label: activeLang === 'zh-CN' ? '系统默认 (自动跟随操作系统语言)' : 'System Default (Auto-detect OS locale)' },
              { value: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
              { value: 'en', label: 'English' },
            ],
            initialValue: config.language,
          });

          if (prompt.isCancel(langChoice)) continue;
          if (isConfigLanguage(langChoice)) {
            config.language = langChoice;
          }
          prompt.note(`${c.langUpdated} "${config.language}".`, c.noteUpdated);
          continue;
        }

        if (choice === 'debounce') {
          const debounceInput = await prompt.text({
            message: c.debouncePrompt,
            defaultValue: String(config.debounceSeconds),
            validate: (val) => {
              const num = Number(val);
              if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
                return c.debounceInvalid;
              }
              return undefined;
            },
          });

          if (prompt.isCancel(debounceInput)) continue;
          config.debounceSeconds = Number(debounceInput);
          prompt.note(`${c.debounceUpdated} ${config.debounceSeconds}s.`, c.noteUpdated);
          continue;
        }

        if (choice === 'agents') {
          await configureAgentsMenu(config, prompt, dict);
          continue;
        }

        if (choice === 'event_rules') {
          await configureEventRulesMenu(config, prompt, dict);
          continue;
        }

        if (choice === 'reset') {
          const confirmReset = await prompt.confirm({
            message: c.resetConfirm,
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
            prompt.note(c.resetDone, c.noteReset);
          }
          continue;
        }
      }
    }


export function registerConfigCommand(
  program: Command,
  deps: ConfigCommandDependencies,
): void {
  const lang = detectLanguage();
  const dict = getLocaleStrings(lang);

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
    .action(async (options: ConfigCommandOptions = {}) => {
      await runConfigAction(options, deps);
    });
}


async function configureAgentsMenu(
  config: TakeFiveConfig,
  prompt: PromptDriver,
  dict: ReturnType<typeof getLocaleStrings>,
): Promise<void> {
  while (true) {
    const options = SUPPORTED_AGENTS.map((agent) => {
      const isEnabled = config.enabledAgents[agent] ?? true;
      const statusText = isEnabled ? pc.green('ON') : pc.red('OFF');
      const displayName = dict.agents[agent] ?? agent;
      return {
        value: agent,
        label: `${displayName} (${agent}) [${statusText}]`,
      };
    });

    const agentChoice = await prompt.select<string>({
      message: dict.cli.config.toggleAgentsPrompt,
      options: [
        { value: 'enable_all', label: dict.cli.config.enableAllAgentsOption },
        { value: 'disable_all', label: dict.cli.config.disableAllAgentsOption },
        ...options,
        { value: 'back', label: dict.cli.config.backOption },
      ],
    });

    if (prompt.isCancel(agentChoice) || agentChoice === 'back') {
      return;
    }

    if (agentChoice === 'enable_all' || agentChoice === 'disable_all') {
      const enabled = agentChoice === 'enable_all';
      for (const agent of SUPPORTED_AGENTS) config.enabledAgents[agent] = enabled;
      continue;
    }

    const targetAgent = agentChoice as SupportedAgent;
    config.enabledAgents[targetAgent] = !(config.enabledAgents[targetAgent] ?? true);
  }
}

async function configureEventRulesMenu(
  config: TakeFiveConfig,
  prompt: PromptDriver,
  dict: ReturnType<typeof getLocaleStrings>,
): Promise<void> {
  while (true) {
    const options = UNIFIED_EVENT_TYPES.map((eventType) => {
      const rule = config.events[eventType] ?? { enabled: true, level: 'active' };
      const statusText = rule.enabled ? pc.green('ON ') : pc.red('OFF');
      const levelText = pc.dim(`(${rule.level})`);
      const eventTitle = dict.events[eventType]?.title ?? eventType;
      return {
        value: eventType,
        label: `${eventTitle.padEnd(16)} [${statusText}] ${levelText}`,
      };
    });

    const eventChoice = await prompt.select<string>({
      message: dict.cli.config.toggleEventsPrompt,
      options: [...options, { value: 'back', label: dict.cli.config.backOption }],
    });

    if (prompt.isCancel(eventChoice) || eventChoice === 'back') {
      return;
    }

    const eventType = eventChoice as UnifiedEventType;
    const rule: EventRule = config.events[eventType] ?? { enabled: true, level: 'active' };

    await configureSingleEventRule(eventType, rule, prompt, dict);
    config.events[eventType] = rule;
  }
}

async function configureSingleEventRule(
  eventType: UnifiedEventType,
  rule: EventRule,
  prompt: PromptDriver,
  dict: ReturnType<typeof getLocaleStrings>,
): Promise<void> {
  const c = dict.cli.config;
  while (true) {
    const editChoice = await prompt.select({
      message: `${c.editEventRulePrompt} "${dict.events[eventType]?.title ?? eventType}":`,
      options: [
        {
          value: 'toggle',
          label: `${c.editEventRuleToggle}: ${rule.enabled ? pc.green('ON') : pc.red('OFF')}`,
        },
        {
          value: 'level',
          label: `${c.editEventRuleLevel}: ${pc.cyan(rule.level)}`,
        },
        {
          value: 'title',
          label: `${c.editEventRuleTitle}: ${rule.title ? pc.cyan(`"${rule.title}"`) : pc.dim(c.noneDefaultTemplate)}`,
        },
        {
          value: 'body',
          label: `${c.editEventRuleBody}: ${rule.body ? pc.cyan(`"${rule.body}"`) : pc.dim(c.noneDefaultTemplate)}`,
        },
        { value: 'back', label: c.backOption },
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
        message: `${c.selectUrgencyPrompt} (${dict.events[eventType]?.title ?? eventType}):`,
        options: [
          { value: 'passive', label: 'passive (静默通知 - No sound/vibration)' },
          { value: 'active', label: 'active (普通 - Standard alert)' },
          { value: 'timeSensitive', label: 'timeSensitive (重要 - Breaks through focus)' },
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
        message: c.customTitlePrompt,
        defaultValue: rule.title ?? '',
        validate: (val) => {
          if (!val || String(val).trim().length === 0) return undefined;
          if (String(val).trim().length > 12) {
            return c.titleLengthError;
          }
          return undefined;
        },
      });

      if (!prompt.isCancel(titleInput)) {
        const trimmed = String(titleInput).trim();
        rule.title = trimmed.length > 0 ? trimmed.slice(0, 12) : undefined;
      }
      continue;
    }

    if (editChoice === 'body') {
      const bodyInput = await prompt.text({
        message: c.customBodyPrompt,
        defaultValue: rule.body ?? '',
        validate: (val) => {
          if (val && String(val).trim().length > 32) {
            return c.bodyLengthError;
          }
          return undefined;
        },
      });

      if (!prompt.isCancel(bodyInput)) {
        const trimmed = String(bodyInput).trim();
        rule.body = trimmed.length > 0 ? trimmed.slice(0, 32) : undefined;
      }
      continue;
    }
  }
}
