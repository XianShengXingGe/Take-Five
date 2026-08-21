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

export class OpenCodeAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'opencode';
  readonly displayName = 'OpenCode';

  getOpenCodeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.OPENCODE_CONFIG_DIR && resolved.OPENCODE_CONFIG_DIR.trim().length > 0) {
      return resolved.OPENCODE_CONFIG_DIR.trim();
    }
    if (resolved.OPENCODE_HOME && resolved.OPENCODE_HOME.trim().length > 0) {
      return resolved.OPENCODE_HOME.trim();
    }
    return join(this.getHomeDir(env), '.opencode');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.OPENCODE_CONFIG_PATH && resolved.OPENCODE_CONFIG_PATH.trim().length > 0) {
      return resolved.OPENCODE_CONFIG_PATH.trim();
    }
    return join(this.getOpenCodeDir(env), 'config.json');
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const openCodeDir = this.getOpenCodeDir(env);
    try {
      const stats = await stat(openCodeDir);
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
    const pluginsObj = (config.plugins && typeof config.plugins === 'object'
      ? config.plugins
      : {}) as Record<string, unknown>;
    const takeFivePlugin = (pluginsObj.takefive && typeof pluginsObj.takefive === 'object'
      ? pluginsObj.takefive
      : {}) as Record<string, unknown>;
    const pluginHooks = (takeFivePlugin.hooks && typeof takeFivePlugin.hooks === 'object'
      ? takeFivePlugin.hooks
      : {}) as Record<string, unknown>;

    const hooks: Partial<Record<UnifiedEventType, string>> = {};

    let installedCount = 0;
    for (const eventType of UNIFIED_EVENT_TYPES) {
      const command = (hooksObj[eventType] ?? pluginHooks[eventType]) as string | undefined;
      if (typeof command === 'string') {
        hooks[eventType] = command;
        if (command.includes('takefive notify') && command.includes('opencode')) {
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

      const existingPlugins =
        existingConfig.plugins && typeof existingConfig.plugins === 'object'
          ? (existingConfig.plugins as Record<string, unknown>)
          : {};

      const existingPlugin =
        existingPlugins.takefive && typeof existingPlugins.takefive === 'object'
          ? (existingPlugins.takefive as Record<string, unknown>)
          : null;

      let allAlreadyPresent = true;
      for (const eventType of UNIFIED_EVENT_TYPES) {
        const expectedCmd = this.generateNotifyCommand(eventType);
        if (existingHooks[eventType] !== expectedCmd) {
          allAlreadyPresent = false;
          break;
        }
      }

      if (allAlreadyPresent && existingPlugin?.enabled === true && !options.force) {
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
      const pluginHooksMap: Record<string, string> = {};
      const injectedEvents: UnifiedEventType[] = [];

      for (const eventType of UNIFIED_EVENT_TYPES) {
        const cmd = this.generateNotifyCommand(eventType);
        updatedHooks[eventType] = cmd;
        pluginHooksMap[eventType] = cmd;
        injectedEvents.push(eventType);
      }

      const updatedPlugins: Record<string, unknown> = {
        ...existingPlugins,
        takefive: {
          enabled: true,
          version: '1.0.0',
          hooks: pluginHooksMap,
        },
      };

      const updatedConfig = {
        ...existingConfig,
        plugins: updatedPlugins,
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

      if (config.plugins && typeof config.plugins === 'object') {
        const plugins = config.plugins as Record<string, unknown>;
        delete plugins.takefive;
        if (Object.keys(plugins).length === 0) {
          delete config.plugins;
        }
      }

      const removedEvents: UnifiedEventType[] = [];
      if (config.hooks && typeof config.hooks === 'object') {
        const hooks = config.hooks as Record<string, unknown>;
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
        }
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
      case 'session_end':
      case 'task_success':
      case 'complete':
      case 'exit_success':
      case 'done':
        return 'task_completed';

      case 'waiting_input':
      case 'prompt_user':
      case 'waiting_for_input':
      case 'prompt':
      case 'user_input':
        return 'waiting_input';

      case 'waiting_permission':
      case 'tool_permission':
      case 'permission_request':
      case 'approval_required':
        return 'waiting_permission';

      case 'task_failed':
      case 'task_error':
      case 'session_error':
      case 'error':
      case 'exit_error':
      case 'failure':
        return 'task_failed';

      default:
        return null;
    }
  }
}
