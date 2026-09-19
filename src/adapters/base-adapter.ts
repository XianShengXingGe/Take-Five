import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  AgentAdapter,
  HookStatus,
  ParsedHookPayload,
} from '../types/adapter.js';
import type { SupportedAgent, UnifiedEventType } from '../types/event.js';
import { BackupManager } from './backup-manager.js';
import {
  listTakeFiveCommands,
  removeTakeFiveHooks,
  upsertCommandHook,
  type StructuredHooks,
} from './structured-hook-utils.js';

export interface StructuredHookBinding {
  eventName: string;
  eventType: UnifiedEventType;
  matcher?: string;
  isAsync?: boolean;
}

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: SupportedAgent;
  abstract readonly displayName: string;

  protected backupManager: BackupManager;

  constructor(backupManager?: BackupManager) {
    this.backupManager = backupManager ?? new BackupManager();
  }

  abstract detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean>;
  abstract getConfigPath(env?: Record<string, string | undefined>): string;
  abstract getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus>;
  abstract install(options?: AdapterInstallOptions): Promise<AdapterInstallResult>;
  abstract uninstall(options?: AdapterUninstallOptions): Promise<AdapterUninstallResult>;
  abstract mapLifecycleEvent(rawEvent: string): UnifiedEventType | null;

  generateNotifyCommand(
    eventType: UnifiedEventType,
    options?: { project?: string; reason?: string; env?: Record<string, string | undefined> },
  ): string {
    let cmd = `${this.getCliCommand(options?.env)} notify --agent ${this.id} --event ${eventType} --hook --quiet`;
    if (options?.project && options.project.trim().length > 0) {
      cmd += ` --project "${options.project.trim()}"`;
    }
    if (options?.reason && options.reason.trim().length > 0) {
      cmd += ` --reason "${options.reason.trim()}"`;
    }
    return cmd;
  }

  /**
   * Resolve a hook-safe CLI invocation. GUI apps on macOS and Windows do not
   * reliably inherit the user's shell PATH, so prefer the absolute Node and
   * entry-point paths while Take Five is running from an installed bundle.
   */
  protected getCliCommand(env?: Record<string, string | undefined>): string {
    return this.getCliArgv(env).map((part) => this.quoteCommandArg(part)).join(' ');
  }

  protected getCliArgv(env?: Record<string, string | undefined>): string[] {
    const resolvedEnv = this.resolveEnv(env);
    const override = resolvedEnv.TAKEFIVE_CLI_COMMAND?.trim();
    if (override) return [override];

    const entry = process.argv[1] ? resolve(process.argv[1]) : '';
    if (
      entry &&
      existsSync(entry) &&
      !entry.includes('node_modules') &&
      !entry.includes('vitest') &&
      !entry.includes('tinypool') &&
      (entry.endsWith('.js') || entry.endsWith('.ts') || entry.endsWith('.mjs'))
    ) {
      return [process.execPath, entry];
    }

    const distCli = resolve(process.cwd(), 'dist', 'cli.js');
    if (existsSync(distCli)) {
      return [process.execPath, distCli];
    }

    return ['takefive'];
  }

  protected quoteCommandArg(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  protected resolveEnv(
    env?: Record<string, string | undefined>,
  ): Record<string, string | undefined> {
    return env ?? process.env;
  }

  protected getHomeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.HOME && resolved.HOME.trim().length > 0) {
      return resolved.HOME.trim();
    }
    if (resolved.USERPROFILE && resolved.USERPROFILE.trim().length > 0) {
      return resolved.USERPROFILE.trim();
    }
    return homedir();
  }

  parseHookPayload(
    payload: Record<string, unknown>,
    fallbackEvent: UnifiedEventType,
    fallbackReason?: string,
  ): ParsedHookPayload | Promise<ParsedHookPayload> {
    let eventType: UnifiedEventType = fallbackEvent;
    let reason: string | undefined = fallbackReason;
    let projectCwd: string | undefined = undefined;

    if (typeof payload.cwd === 'string') {
      projectCwd = payload.cwd;
    } else if (
      Array.isArray(payload.workspacePaths) &&
      payload.workspacePaths.length > 0 &&
      typeof payload.workspacePaths[0] === 'string'
    ) {
      projectCwd = payload.workspacePaths[0];
    }

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      eventType = 'task_failed';
      reason = payload.error;
    } else if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      reason = payload.message;
    } else if (
      payload.tool_input &&
      typeof payload.tool_input === 'object' &&
      typeof (payload.tool_input as Record<string, unknown>).description === 'string'
    ) {
      reason = (payload.tool_input as Record<string, unknown>).description as string;
    }

    return { eventType, reason, projectCwd, shouldSkip: false, isPreToolUse: false };
  }

  protected makeInstallFailure(configPath: string, error: unknown): AdapterInstallResult {
    return {
      agent: this.id,
      success: false,
      configPath,
      hooksInjected: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  protected makeUninstallFailure(configPath: string, error: unknown): AdapterUninstallResult {
    return {
      agent: this.id,
      success: false,
      configPath,
      restoredFromBackup: false,
      hooksRemoved: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  /**
   * Declarative installation engine for adapters backed by StructuredHooks in a JSON configuration file.
   */
  protected async applyStructuredHooksInstall(
    bindings: readonly StructuredHookBinding[],
    options: AdapterInstallOptions = {},
    defaultInitialConfig?: Record<string, unknown>,
  ): Promise<AdapterInstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const existingConfig =
        (await this.backupManager.readJsonStrict<Record<string, unknown>>(configPath)) ??
        (defaultInitialConfig ? { ...defaultInitialConfig } : {});

      const hooksObject = existingConfig.hooks;
      const hooks: StructuredHooks =
        hooksObject && typeof hooksObject === 'object' && !Array.isArray(hooksObject)
          ? { ...(hooksObject as StructuredHooks) }
          : {};

      const alreadyInstalled = bindings.every((binding) =>
        listTakeFiveCommands(hooks, binding.eventName).some((command) =>
          command.includes(`--event ${binding.eventType}`),
        ),
      );

      if (alreadyInstalled && !options.force) {
        return {
          agent: this.id,
          success: true,
          configPath,
          backupPath: (await this.backupManager.hasBackup(configPath))
            ? this.backupManager.getBackupPath(configPath)
            : undefined,
          hooksInjected: bindings.map((b) => b.eventType),
          alreadyInstalled: true,
        };
      }

      const backupPath = (await this.backupManager.createBackup(configPath)) ?? undefined;

      for (const binding of bindings) {
        upsertCommandHook(
          hooks,
          binding.eventName,
          this.generateNotifyCommand(binding.eventType, { env: options.env }),
          binding.matcher,
          { isAsync: binding.isAsync ?? false },
        );
      }

      await this.backupManager.atomicWriteJson(configPath, { ...existingConfig, hooks });

      return {
        agent: this.id,
        success: true,
        configPath,
        backupPath,
        hooksInjected: bindings.map((b) => b.eventType),
        alreadyInstalled: false,
      };
    } catch (error: unknown) {
      return this.makeInstallFailure(configPath, error);
    }
  }

  /**
   * Declarative uninstallation engine for adapters backed by StructuredHooks in a JSON configuration file.
   */
  protected async applyStructuredHooksUninstall(
    bindings: readonly StructuredHookBinding[],
    options: AdapterUninstallOptions = {},
  ): Promise<AdapterUninstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const config = await this.backupManager.readJsonStrict<Record<string, unknown>>(configPath);
      if (!config) {
        const restored = await this.backupManager.restoreBackup(configPath);
        return {
          agent: this.id,
          success: true,
          configPath,
          restoredFromBackup: restored,
          hooksRemoved: [],
        };
      }

      const hooksObject = config.hooks;
      const hooks: StructuredHooks =
        hooksObject && typeof hooksObject === 'object' && !Array.isArray(hooksObject)
          ? { ...(hooksObject as StructuredHooks) }
          : {};

      const removed = removeTakeFiveHooks(hooks);
      if (Object.keys(hooks).length > 0) {
        config.hooks = hooks;
      } else {
        delete config.hooks;
      }

      await this.backupManager.atomicWriteJson(configPath, config);
      await this.backupManager.removeBackup(configPath);

      return {
        agent: this.id,
        success: true,
        configPath,
        restoredFromBackup: false,
        hooksRemoved: bindings
          .slice(0, Math.min(removed, bindings.length))
          .map((b) => b.eventType),
      };
    } catch (error: unknown) {
      return this.makeUninstallFailure(configPath, error);
    }
  }

  /**
   * Declarative JSON patch installer for adapters requiring custom JSON transformations.
   */
  protected async applyJsonPatchInstall<T extends Record<string, unknown> = Record<string, unknown>>(
    checkAlreadyInstalled: (config: T) => boolean,
    patchConfig: (config: T) => T,
    hooksInjected: UnifiedEventType[],
    options: AdapterInstallOptions = {},
  ): Promise<AdapterInstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const existingConfig =
        (await this.backupManager.readJsonStrict<T>(configPath)) ?? ({} as T);

      if (checkAlreadyInstalled(existingConfig) && !options.force) {
        return {
          agent: this.id,
          success: true,
          configPath,
          backupPath: (await this.backupManager.hasBackup(configPath))
            ? this.backupManager.getBackupPath(configPath)
            : undefined,
          hooksInjected,
          alreadyInstalled: true,
        };
      }

      const backupPath = (await this.backupManager.createBackup(configPath)) ?? undefined;
      const updatedConfig = patchConfig(existingConfig);
      await this.backupManager.atomicWriteJson(configPath, updatedConfig);

      return {
        agent: this.id,
        success: true,
        configPath,
        backupPath,
        hooksInjected,
        alreadyInstalled: false,
      };
    } catch (error: unknown) {
      return this.makeInstallFailure(configPath, error);
    }
  }

  /**
   * Declarative JSON patch uninstaller.
   */
  protected async applyJsonPatchUninstall<T extends Record<string, unknown> = Record<string, unknown>>(
    unpatchConfig: (config: T) => T | void,
    hooksRemoved: UnifiedEventType[],
    options: AdapterUninstallOptions = {},
  ): Promise<AdapterUninstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const config = await this.backupManager.readJsonStrict<T>(configPath);
      if (!config) {
        const restored = await this.backupManager.restoreBackup(configPath);
        return {
          agent: this.id,
          success: true,
          configPath,
          restoredFromBackup: restored,
          hooksRemoved: [],
        };
      }

      const updated = unpatchConfig(config) ?? config;
      await this.backupManager.atomicWriteJson(configPath, updated);
      await this.backupManager.removeBackup(configPath);

      return {
        agent: this.id,
        success: true,
        configPath,
        restoredFromBackup: false,
        hooksRemoved,
      };
    } catch (error: unknown) {
      return this.makeUninstallFailure(configPath, error);
    }
  }
}

