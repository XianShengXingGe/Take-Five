import type { Command } from 'commander';
import pc from 'picocolors';
import { detectInstalledAgents, type AgentDetectorOptions } from '../../core/agent-detector.js';
import { BarkClient, maskBarkUrl, normalizeBarkUrl } from '../../core/bark-client.js';
import type { ConfigManager } from '../../core/config-manager.js';
import type { CredentialStore } from '../../types/credential.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ENABLED_AGENTS,
  DEFAULT_EVENT_RULES,
  DEFAULT_ICONS,
  isConfigLanguage,
  type ConfigLanguage,
  type TakeFiveConfig,
} from '../../types/config.js';
import type { BarkPushPayload } from '../../types/bark.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';
import { createAllAdapters } from '../../adapters/index.js';
import type { AgentAdapter } from '../../types/adapter.js';
import type { SupportedAgent } from '../../types/event.js';

import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';

export type { PromptDriver };

export function buildDetectedAgentDefaults(
  detected: { installedAgents: SupportedAgent[] },
): typeof DEFAULT_ENABLED_AGENTS {
  const enabled = {
    claude: false,
    codex: false,
    opencode: false,
    antigravity: false,
  };
  for (const agent of detected.installedAgents) enabled[agent] = true;
  return enabled;
}

export interface InstallCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  barkClient: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
}

export interface InstallCommandOptions {
  reconfigure?: boolean;
  barkUrl?: string;
  yes?: boolean;
}

export async function runInstallAction(
  options: InstallCommandOptions = {},
  deps: InstallCommandDependencies,
): Promise<void> {
  const prompt = deps.promptDriver ?? defaultPromptDriver;

      const hasExistingConfig = deps.configManager.hasConfig();
      const existingConfig = await deps.configManager.loadConfig();
      const storedBarkUrl = await deps.credentialStore.getBarkUrl(deps.env);

      let activeLang = detectLanguage(hasExistingConfig ? existingConfig.language : undefined, deps.env);
      let dict = getLocaleStrings(activeLang);
      let ins = dict.cli.install;

      prompt.intro(pc.bgCyan(pc.black(` ${ins.intro} `)));

      // Step 1: Detect available agent environments
      const s = prompt.spinner();
      s.start(ins.scanning);

      const detected = detectInstalledAgents(deps.agentDetectorOptions);
      s.stop(ins.scanned);

      if (detected.hasAnyInstalled) {
        const detectedList = detected.installedAgents
          .map((agent) => `${dict.agents[agent] ?? agent} (${detected[agent].path})`)
          .join('\n• ');
        prompt.note(`• ${detectedList}`, ins.detectedTitle);
      } else {
        prompt.note(ins.noAgentsDetected, ins.noAgentsNoteTitle);
      }

      // Step 2: Prompt Bark URL & verify mobile connectivity
      const platform = String(deps.credentialStore.getPlatform());
      const isPlatformSupported = deps.credentialStore.isSupported();

      if (!isPlatformSupported) {
        const warningTemplate = ins.unsupportedPlatformWarning || 'OS-level secure credential storage is unsupported on this platform (%s).';
        prompt.note(warningTemplate.replace('%s', platform), ins.unsupportedPlatformTitle || 'Platform Warning');
      }

      let currentUrl = '';

      if (options.barkUrl && options.barkUrl.trim().length > 0) {
        currentUrl = normalizeBarkUrl(options.barkUrl);
      } else if (options.yes && storedBarkUrl && storedBarkUrl.trim().length > 0) {
        currentUrl = storedBarkUrl;
      } else if (storedBarkUrl && storedBarkUrl.trim().length > 0) {
        const masked = maskBarkUrl(storedBarkUrl);
        const reuseChoice = await prompt.select({
          message: `${ins.existingBarkPrompt} ${pc.cyan(masked)}`,
          options: [
            { value: 'reuse', label: `${ins.reuseExistingOption} (${masked})` },
            { value: 'new', label: ins.inputNewOption },
          ],
          initialValue: 'reuse',
        });

        if (prompt.isCancel(reuseChoice)) {
          prompt.cancel(ins.cancelled);
          return;
        }

        if (reuseChoice === 'reuse') {
          currentUrl = storedBarkUrl;
        }
      }

      while (true) {
        if (!currentUrl) {
          if (options.yes) {
            prompt.cancel(ins.barkEmptyError);
            process.exitCode = 1;
            return;
          }

          const rawInput = await prompt.password({
            message: ins.barkPrompt,
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return ins.barkEmptyError;
              }
              return undefined;
            },
          });

          if (prompt.isCancel(rawInput)) {
            prompt.cancel(ins.cancelled);
            return;
          }

          currentUrl = normalizeBarkUrl(String(rawInput));
        }

        s.start(ins.testingBark);
        const testPayload: BarkPushPayload = {
          title: activeLang === 'zh-CN' ? '🎉 片刻' : '🎉 Take Five',
          subtitle: activeLang === 'zh-CN' ? 'Bark 连通性测试' : 'Bark Setup Verification',
          body: activeLang === 'zh-CN' ? '片刻已成功连接到您的设备！' : 'Take Five is now connected to your device! Notifications are ready.',
          group: activeLang === 'zh-CN' ? '片刻' : 'Take-Five',
          level: 'active',
          icon: DEFAULT_ICONS.claude,
        };

        try {
          await deps.barkClient.push(currentUrl, testPayload);
          s.stop(pc.green(ins.barkSuccess));
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          s.stop(pc.red(`${ins.barkFail} ${errorMsg}`));

          if (options.yes) {
            // In yes mode, proceed with storing the validated URL structure
            try {
              await deps.credentialStore.setBarkUrl(currentUrl, deps.env);
              break;
            } catch (saveErr: unknown) {
              const saveErrMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
              prompt.cancel(saveErrMsg);
              process.exitCode = 1;
              return;
            }
          }

          const choice = await prompt.select({
            message: ins.failPrompt,
            options: [
              { value: 'retry_input', label: ins.retryInput },
              { value: 'retry_send', label: ins.retrySend },
              { value: 'force_save', label: ins.forceSave },
              { value: 'cancel', label: ins.cancelChoice },
            ],
          });

          if (prompt.isCancel(choice) || choice === 'cancel') {
            prompt.cancel(ins.cancelled);
            return;
          }

          if (choice === 'retry_input') {
            currentUrl = '';
            continue;
          }

          if (choice === 'retry_send') {
            continue;
          }
        }

        try {
          await deps.credentialStore.setBarkUrl(currentUrl, deps.env);
          break;
        } catch (saveErr: unknown) {
          const saveErrMsg = saveErr instanceof Error ? saveErr.message : String(saveErr);
          prompt.cancel(saveErrMsg);
          return;
        }
      }

      // Step 3: Notification language preferences & rules confirmation
      let languageChoice: ConfigLanguage = (hasExistingConfig && existingConfig.language) ? existingConfig.language : 'system';

      if (!options.yes) {
        const selectedLang = await prompt.select<ConfigLanguage>({
          message: ins.languagePrompt,
          options: [
            { value: 'system', label: activeLang === 'zh-CN' ? '系统默认 (自动跟随操作系统语言)' : 'System Default (Auto-detect from OS locale)' },
            { value: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
            { value: 'en', label: 'English' },
          ],
          initialValue: languageChoice,
        });

        if (prompt.isCancel(selectedLang) || typeof selectedLang === 'symbol') {
          prompt.cancel(ins.cancelled);
          return;
        }
        languageChoice = selectedLang;
      }

      if (isConfigLanguage(languageChoice) && languageChoice !== 'system') {
        activeLang = languageChoice;
        dict = getLocaleStrings(activeLang);
        ins = dict.cli.install;
      }

      if (!options.yes) {
        // Display and confirm default notification rules
        prompt.note(
          `• task_completed (${dict.rules.taskCompleted}): active (${dict.rules.levelActive})\n` +
            `• waiting_input (${dict.rules.waitingInput}): timeSensitive (${dict.rules.levelTimeSensitive})\n` +
            `• waiting_permission (${dict.rules.waitingPermission}): timeSensitive (${dict.rules.levelTimeSensitive})\n` +
            `• task_failed (${dict.rules.taskFailed}): timeSensitive (${dict.rules.levelTimeSensitive})`,
          ins.defaultRulesTitle,
        );

        const confirmRules = await prompt.confirm({
          message: ins.confirmRulesPrompt,
          initialValue: true,
        });

        if (prompt.isCancel(confirmRules) || confirmRules === false) {
          prompt.cancel(ins.cancelled);
          return;
        }
      }

      // Step 4: Initialize ~/.takefive/config.json
      s.start(ins.savingConfig);

      const detectedDefaults = buildDetectedAgentDefaults(detected);
      const enabledAgents = hasExistingConfig
        ? {
            claude: existingConfig.enabledAgents.claude ?? detectedDefaults.claude,
            codex: existingConfig.enabledAgents.codex ?? detectedDefaults.codex,
            opencode: existingConfig.enabledAgents.opencode ?? detectedDefaults.opencode,
            antigravity: existingConfig.enabledAgents.antigravity ?? detectedDefaults.antigravity,
          }
        : detectedDefaults;

      if (hasExistingConfig) {
        for (const agent of detected.installedAgents) {
          if (existingConfig.enabledAgents[agent] === undefined) {
            enabledAgents[agent] = true;
          }
        }
      }

      const newConfig: TakeFiveConfig = {
        version: '1.0.0',
        language: isConfigLanguage(languageChoice) ? languageChoice : (existingConfig.language ?? 'system'),
        debounceSeconds: hasExistingConfig ? existingConfig.debounceSeconds : DEFAULT_CONFIG.debounceSeconds,
        icons: { ...DEFAULT_ICONS, ...(hasExistingConfig ? existingConfig.icons : {}) },
        events: {
          task_completed: { ...DEFAULT_EVENT_RULES.task_completed, ...(hasExistingConfig ? existingConfig.events.task_completed : {}) },
          waiting_input: { ...DEFAULT_EVENT_RULES.waiting_input, ...(hasExistingConfig ? existingConfig.events.waiting_input : {}) },
          waiting_permission: { ...DEFAULT_EVENT_RULES.waiting_permission, ...(hasExistingConfig ? existingConfig.events.waiting_permission : {}) },
          task_failed: { ...DEFAULT_EVENT_RULES.task_failed, ...(hasExistingConfig ? existingConfig.events.task_failed : {}) },
        },
        enabledAgents,
        ...(existingConfig.autostart !== undefined ? { autostart: existingConfig.autostart } : {}),
      };

      await deps.configManager.saveConfig(newConfig);
      s.stop(ins.savedConfig);

      // Step 5: Inject lifecycle notification hooks into enabled & detected agents
      const targetAdapters = deps.adapters ?? createAllAdapters();
      const injectedList: string[] = [];

      for (const adapter of targetAdapters) {
        if (enabledAgents[adapter.id] !== false) {
          const res = await adapter.install({ env: deps.env });
          if (res.success) {
            injectedList.push(`${dict.agents[adapter.id] ?? adapter.displayName} (${res.configPath})`);
          }
        }
      }

      if (injectedList.length > 0) {
        prompt.note(
          injectedList.map((item) => `• ${item}`).join('\n'),
          activeLang === 'zh-CN' ? '已自动注入通知钩子' : 'Notification Hooks Injected',
        );
      }

  prompt.outro(pc.bold(pc.green(ins.outro)));
}

export function registerInstallCommand(
  program: Command,
  deps: InstallCommandDependencies,
): void {
  const activeLang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(activeLang);

  program
    .command('install')
    .description(dict.cli.commands.install)
    .option('-r, --reconfigure', 'Reconfigure all settings, language, and credentials interactively')
    .option('-b, --bark-url <url>', 'Set or update Bark push URL directly')
    .option('-y, --yes', 'Automatically accept defaults without prompting')
    .action(async (options: InstallCommandOptions = {}) => {
      await runInstallAction(options, deps);
    });
}

