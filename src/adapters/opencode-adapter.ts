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
import { mergeHookCommand, stripHookCommand } from './hook-utils.js';

export const OPENCODE_HOOK_COMMANDS = {
  task_completed: 'takefive notify --agent opencode --event task_completed',
  waiting_input: 'takefive notify --agent opencode --event waiting_input',
  waiting_permission: 'takefive notify --agent opencode --event waiting_permission',
  task_failed: 'takefive notify --agent opencode --event task_failed',
} as const;

/**
 * Adapter for OpenCode CLI integration.
 * Injects non-destructive lifecycle hooks into ~/.opencode/config.json.
 */
export class OpenCodeAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'opencode';
  readonly displayName = 'OpenCode';

  /**
   * Resolves the root directory for OpenCode configuration.
   */
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

  /**
   * Resolves the full path to OpenCode's config.json.
   */
  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.OPENCODE_CONFIG_PATH && resolved.OPENCODE_CONFIG_PATH.trim().length > 0) {
      return resolved.OPENCODE_CONFIG_PATH.trim();
    }
    return join(this.getOpenCodeDir(env), 'config.json');
  }

  /**
   * Checks whether ~/.opencode or ~/.config/opencode installation is detected.
   */
  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const opencodeDir = this.getOpenCodeDir(env);
    try {
      const stats = await stat(opencodeDir);
      if (stats.isDirectory()) return true;
    } catch {
      // Continue to alternative location
    }

    const altDir = join(this.getHomeDir(env), '.config', 'opencode');
    try {
      const stats = await stat(altDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Inspects current OpenCode configuration and hook installation status.
   */
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

  /**
   * Injects Take Five notification hooks into OpenCode's config.json idempotently.
   */
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
        const currentCmd = existingHooks[eventType];
        if (typeof currentCmd !== 'string' || !currentCmd.includes(expectedCmd)) {
          allAlreadyPresent = false;
          break;
        }
      }

      if (allAlreadyPresent && !options.force) {
        const hasBackup = await this.backupManager.hasBackup(configPath);
        return {
          agent: this.id,
          success: true,
          configPath,
          backupPath: hasBackup ? this.backupManager.getBackupPath(configPath) : undefined,
          hooksInjected: [...UNIFIED_EVENT_TYPES],
          alreadyInstalled: true,
        };
      }

      // Create backup before mutation
      const backupPath = (await this.backupManager.createBackup(configPath)) ?? undefined;

      // Merge hooks non-destructively
      const updatedHooks: Record<string, unknown> = { ...existingHooks };
      const injectedEvents: UnifiedEventType[] = [];

      for (const eventType of UNIFIED_EVENT_TYPES) {
        const cmd = this.generateNotifyCommand(eventType);
        updatedHooks[eventType] = mergeHookCommand(existingHooks[eventType], cmd);
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

  /**
   * Uninstalls Take Five hooks by restoring original backup or removing hook entries.
   */
  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);

    try {
      // 1. Try restoring from backup first
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

      // 2. If no backup exists, surgically clean hooks from config.json
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
          const stripped = stripHookCommand(hooks[eventType]);
          if (stripped) {
            hooks[eventType] = stripped;
          } else {
            delete hooks[eventType];
          }
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

  /**
   * Maps OpenCode lifecycle triggers to UnifiedEventType.
   */
  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null {
    const normalized = rawEvent.trim().toLowerCase();

    switch (normalized) {
      case 'task_completed':
      case 'session_end':
      case 'task_success':
      case 'completed':
        return 'task_completed';

      case 'waiting_input':
      case 'prompt_user':
      case 'waiting_for_input':
      case 'prompt':
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
        return 'task_failed';

      default:
        return null;
    }
  }
}
