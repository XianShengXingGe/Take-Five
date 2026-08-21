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
  type UnifiedEventType,
} from '../types/event.js';
import { BaseAdapter } from './base-adapter.js';

export class ClaudeAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'claude';
  readonly displayName = 'Claude Code';

  getClaudeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.CLAUDE_CONFIG_DIR && resolved.CLAUDE_CONFIG_DIR.trim().length > 0) {
      return resolved.CLAUDE_CONFIG_DIR.trim();
    }
    if (resolved.CLAUDE_HOME && resolved.CLAUDE_HOME.trim().length > 0) {
      return resolved.CLAUDE_HOME.trim();
    }
    return join(this.getHomeDir(env), '.claude');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.CLAUDE_CONFIG_PATH && resolved.CLAUDE_CONFIG_PATH.trim().length > 0) {
      return resolved.CLAUDE_CONFIG_PATH.trim();
    }
    return join(this.getClaudeDir(env), 'config.json');
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const claudeDir = this.getClaudeDir(env);
    try {
      const stats = await stat(claudeDir);
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
      if (typeof command === 'string') {
        hooks[eventType] = command;
        if (command.includes('takefive notify') && command.includes('claude')) {
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
        if (existingHooks[eventType] !== expectedCmd) {
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
        if (typeof hooks[eventType] === 'string') {
          const cmd = hooks[eventType] as string;
          if (cmd.includes('takefive notify')) {
            delete hooks[eventType];
            removedEvents.push(eventType);
          }
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
      case 'stop':
      case 'completed':
      case 'done':
      case 'task_finish':
      case 'posttoolexecution':
        return 'task_completed';

      case 'waiting_input':
      case 'prompt':
      case 'user_input':
      case 'input_required':
      case 'userprompt':
        return 'waiting_input';

      case 'waiting_permission':
      case 'permission_request':
      case 'approval_required':
      case 'permission_prompt':
      case 'permissionrequest':
        return 'waiting_permission';

      case 'task_failed':
      case 'error':
      case 'fatal':
      case 'exception':
      case 'task_error':
        return 'task_failed';

      default:
        return null;
    }
  }
}
