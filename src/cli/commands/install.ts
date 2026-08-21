import type { Command } from 'commander';
import pc from 'picocolors';
import { detectInstalledAgents, type AgentDetectorOptions } from '../../core/agent-detector.js';
import { BarkClient, normalizeBarkUrl } from '../../core/bark-client.js';
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

import type { PromptDriver } from '../prompt-driver.js';
import { defaultPromptDriver } from '../prompt-driver.js';

export type { PromptDriver };

export interface InstallCommandDependencies {
  configManager: ConfigManager;
  credentialStore: CredentialStore;
  barkClient: BarkClient;
  promptDriver?: PromptDriver;
  agentDetectorOptions?: AgentDetectorOptions;
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
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
    .action(async () => {
      const prompt = deps.promptDriver ?? defaultPromptDriver;
      let activeLang = detectLanguage(undefined, deps.env);
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
      let currentUrl = '';

      while (true) {
        if (!currentUrl) {
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

        // Send test notification
        s.start(ins.testingBark);
        const testPayload: BarkPushPayload = {
          title: '🎉 Take Five (片刻)',
          subtitle: activeLang === 'zh-CN' ? 'Bark 连通性测试' : 'Bark Setup Verification',
          body: activeLang === 'zh-CN' ? 'Take Five 已成功连接到您的设备！' : 'Take Five is now connected to your device! Notifications are ready.',
          group: 'Take-Five',
          level: 'active',
          icon: DEFAULT_ICONS.claude,
        };

        try {
          await deps.barkClient.push(currentUrl, testPayload);
          s.stop(pc.green(ins.barkSuccess));
          await deps.credentialStore.setBarkUrl(currentUrl);
          break;
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          s.stop(pc.red(`${ins.barkFail} ${errorMsg}`));

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

          if (choice === 'force_save') {
            await deps.credentialStore.setBarkUrl(currentUrl);
            break;
          }
        }
      }

      // Step 3: Notification language preferences & rules confirmation
      const languageChoice = await prompt.select<ConfigLanguage>({
        message: ins.languagePrompt,
        options: [
          { value: 'system', label: activeLang === 'zh-CN' ? '系统默认 (自动跟随操作系统语言)' : 'System Default (Auto-detect from OS locale)' },
          { value: 'zh-CN', label: '简体中文 (Simplified Chinese)' },
          { value: 'en', label: 'English' },
        ],
        initialValue: 'system',
      });

      if (prompt.isCancel(languageChoice) || typeof languageChoice === 'symbol') {
        prompt.cancel(ins.cancelled);
        return;
      }

      if (isConfigLanguage(languageChoice) && languageChoice !== 'system') {
        activeLang = languageChoice;
        dict = getLocaleStrings(activeLang);
        ins = dict.cli.install;
      }

      // Display and confirm default notification rules
      prompt.note(
        '• task_completed (任务完成): active (普通通知)\n' +
          '• waiting_input (等待输入): timeSensitive (重要提醒)\n' +
          '• waiting_permission (等待授权): timeSensitive (重要提醒)\n' +
          '• task_failed (任务失败): timeSensitive (重要提醒)',
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

      // Step 4: Initialize ~/.takefive/config.json
      s.start(ins.savingConfig);

      const enabledAgents = { ...DEFAULT_ENABLED_AGENTS };
      if (detected.hasAnyInstalled) {
        for (const agent of Object.keys(enabledAgents) as (keyof typeof enabledAgents)[]) {
          enabledAgents[agent] = detected[agent]?.installed ?? true;
        }
      }

      const newConfig: TakeFiveConfig = {
        version: '1.0.0',
        language: isConfigLanguage(languageChoice) ? languageChoice : 'system',
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
    });
}
