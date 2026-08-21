import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  HookStatus,
} from '../types/adapter.js';
import {
  UNIFIED_EVENT_TYPES,
  type SupportedAgent,
  type UnifiedEvent,
  type UnifiedEventType,
} from '../types/event.js';
import { BaseAdapter } from './base-adapter.js';
import { detectProjectName } from '../core/project-detector.js';

export interface CodexRawEvent {
  event?: string;
  type?: string;
  status?: string;
  project?: string;
  error?: string;
  message?: string;
  reason?: string;
  timestamp?: number;
}

export class CodexAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'codex';
  readonly displayName = 'OpenAI Codex';

  getCodexDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.CODEX_CONFIG_DIR && resolved.CODEX_CONFIG_DIR.trim().length > 0) {
      return resolved.CODEX_CONFIG_DIR.trim();
    }
    if (resolved.CODEX_HOME && resolved.CODEX_HOME.trim().length > 0) {
      return resolved.CODEX_HOME.trim();
    }
    return join(this.getHomeDir(env), '.codex');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.CODEX_CONFIG_PATH && resolved.CODEX_CONFIG_PATH.trim().length > 0) {
      return resolved.CODEX_CONFIG_PATH.trim();
    }
    return join(this.getCodexDir(env), 'config.json');
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const codexDir = this.getCodexDir(env);
    try {
      const stats = await stat(codexDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus> {
    const configPath = this.getConfigPath(env);
    const detected = await this.detectEnvironment(env);
    const backupExists = await this.backupManager.hasBackup(configPath);

    const config = await this.backupManager.readJson<Record<string, unknown>>(configPath);
    if (!config || typeof config !== 'object') {
      return {
        detected,
        installed: false,
        configPath,
        backupExists,
        hooks: {},
      };
    }

    const hooksObj = (config.hooks && typeof config.hooks === 'object' ? config.hooks : {}) as Record<
      string,
      unknown
    >;
    const hooks: Partial<Record<UnifiedEventType, string>> = {};

    let installedCount = 0;
    for (const eventType of UNIFIED_EVENT_TYPES) {
      const command = hooksObj[eventType];
      let cmdStr: string | undefined;

      if (typeof command === 'string') {
        cmdStr = command;
      } else if (command && typeof command === 'object' && 'command' in command) {
        cmdStr = (command as { command: string }).command;
      }

      if (cmdStr) {
        hooks[eventType] = cmdStr;
        if (cmdStr.includes('takefive notify') && cmdStr.includes('codex')) {
          installedCount++;
        }
      }
    }

    return {
      detected,
      installed: installedCount === UNIFIED_EVENT_TYPES.length,
      configPath,
      backupExists,
      hooks,
    };
  }

  async install(options: AdapterInstallOptions = {}): Promise<AdapterInstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);

    try {
      const existingConfig = (await this.backupManager.readJson<Record<string, unknown>>(
        configPath,
      )) ?? {};

      const existingHooks =
        existingConfig.hooks && typeof existingConfig.hooks === 'object'
          ? (existingConfig.hooks as Record<string, unknown>)
          : {};

      let allAlreadyPresent = true;
      for (const eventType of UNIFIED_EVENT_TYPES) {
        const expectedCmd = this.generateNotifyCommand(eventType);
        const currentHook = existingHooks[eventType];
        const currentCmd =
          typeof currentHook === 'string'
            ? currentHook
            : (currentHook as { command?: string } | undefined)?.command;

        if (currentCmd !== expectedCmd) {
          allAlreadyPresent = false;
          break;
        }
      }

      if (allAlreadyPresent && !options.force) {
        return {
          agent: this.id,
          success: true,
          configPath,
          backupPath: this.backupManager.getBackupPath(configPath),
          hooksInjected: [...UNIFIED_EVENT_TYPES],
          alreadyInstalled: true,
        };
      }

      const backupPath = (await this.backupManager.createBackup(configPath)) ?? undefined;
      const updatedHooks: Record<string, unknown> = { ...existingHooks };
      const injectedEvents: UnifiedEventType[] = [];

      for (const eventType of UNIFIED_EVENT_TYPES) {
        updatedHooks[eventType] = this.generateNotifyCommand(eventType);
        injectedEvents.push(eventType);
      }

      const updatedConfig = {
        ...existingConfig,
        hooks: updatedHooks,
      };

      await this.backupManager.atomicWriteJson(configPath, updatedConfig);

      return {
        agent: this.id,
        success: true,
        configPath,
        backupPath,
        hooksInjected: injectedEvents,
        alreadyInstalled: false,
      };
    } catch (err: unknown) {
      return {
        agent: this.id,
        success: false,
        configPath,
        hooksInjected: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);

    try {
      const restored = await this.backupManager.restoreBackup(configPath);
      if (restored) {
        return {
          agent: this.id,
          success: true,
          configPath,
          restoredFromBackup: true,
          hooksRemoved: [...UNIFIED_EVENT_TYPES],
        };
      }

      const config = await this.backupManager.readJson<Record<string, unknown>>(configPath);
      if (!config) {
        return {
          agent: this.id,
          success: true,
          configPath,
          restoredFromBackup: false,
          hooksRemoved: [],
        };
      }

      const hooks = (config.hooks && typeof config.hooks === 'object' ? config.hooks : {}) as Record<
        string,
        unknown
      >;
      const removedEvents: UnifiedEventType[] = [];

      for (const eventType of UNIFIED_EVENT_TYPES) {
        const currentHook = hooks[eventType];
        const cmdStr =
          typeof currentHook === 'string'
            ? currentHook
            : (currentHook as { command?: string } | undefined)?.command;

        if (cmdStr && cmdStr.includes('takefive notify')) {
          delete hooks[eventType];
          removedEvents.push(eventType);
        }
      }

      if (Object.keys(hooks).length === 0) {
        delete config.hooks;
      } else {
        config.hooks = hooks;
      }

      await this.backupManager.atomicWriteJson(configPath, config);

      return {
        agent: this.id,
        success: true,
        configPath,
        restoredFromBackup: false,
        hooksRemoved: removedEvents,
      };
    } catch (err: unknown) {
      return {
        agent: this.id,
        success: false,
        configPath,
        restoredFromBackup: false,
        hooksRemoved: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null {
    const normalized = rawEvent.trim().toLowerCase();

    switch (normalized) {
      case 'task_completed':
      case 'complete':
      case 'task_complete':
      case 'done':
      case 'finish':
      case 'stop':
      case 'exit_success':
        return 'task_completed';

      case 'waiting_input':
      case 'input_required':
      case 'prompt':
      case 'user_input':
      case 'prompt_user':
      case 'input':
        return 'waiting_input';

      case 'waiting_permission':
      case 'permission_required':
      case 'approval_required':
      case 'tool_approval':
      case 'permission_prompt':
        return 'waiting_permission';

      case 'task_failed':
      case 'error':
      case 'task_error':
      case 'fatal':
      case 'failed':
      case 'exception':
      case 'exit_error':
        return 'task_failed';

      default:
        return null;
    }
  }
}

export function translateCodexEvent(raw: CodexRawEvent): UnifiedEvent {
  const eventIdentifier = (raw.event || raw.type || '').toLowerCase();
  const status = (raw.status || '').toLowerCase();

  let type: UnifiedEventType = 'task_completed';
  let reason: string | undefined = raw.error || raw.reason || raw.message;

  if (
    eventIdentifier.includes('fail') ||
    eventIdentifier.includes('error') ||
    status === 'failed' ||
    status === 'error' ||
    Boolean(raw.error)
  ) {
    type = 'task_failed';
  } else if (
    eventIdentifier.includes('input') ||
    eventIdentifier.includes('question') ||
    eventIdentifier === 'waiting_input'
  ) {
    type = 'waiting_input';
  } else if (
    eventIdentifier.includes('permission') ||
    eventIdentifier.includes('approval') ||
    eventIdentifier === 'waiting_permission'
  ) {
    type = 'waiting_permission';
  } else {
    type = 'task_completed';
  }

  const project = detectProjectName({ explicitProject: raw.project });

  return {
    agent: 'codex',
    type,
    project,
    reason,
    timestamp: raw.timestamp ?? Date.now(),
  };
}
