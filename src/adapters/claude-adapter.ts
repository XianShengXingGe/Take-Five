import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  HookStatus,
  ParsedHookPayload,
} from '../types/adapter.js';
import type { SupportedAgent, UnifiedEventType } from '../types/event.js';
import { BaseAdapter, type StructuredHookBinding } from './base-adapter.js';
import {
  listTakeFiveCommands,
  type StructuredHooks,
} from './structured-hook-utils.js';

const CLAUDE_EVENT_BINDINGS: ReadonlyArray<StructuredHookBinding> = [
  { eventName: 'Stop', eventType: 'task_completed', isAsync: true },
  { eventName: 'Notification', eventType: 'waiting_input', matcher: 'agent_needs_input', isAsync: true },
  { eventName: 'PermissionRequest', eventType: 'waiting_permission', isAsync: true },
  { eventName: 'StopFailure', eventType: 'task_failed', isAsync: true },
];

/** Claude Code shares ~/.claude/settings.json hooks; Claude Desktop uses claude_desktop_config.json MCP. */
export class ClaudeAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'claude';
  readonly displayName = 'Claude Code';

  getClaudeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return resolved.CLAUDE_CONFIG_DIR?.trim() || resolved.CLAUDE_HOME?.trim() || join(this.getHomeDir(env), '.claude');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return resolved.CLAUDE_CONFIG_PATH?.trim() || join(this.getClaudeDir(env), 'settings.json');
  }

  getClaudeDesktopConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.CLAUDE_DESKTOP_CONFIG_PATH?.trim()) {
      return resolved.CLAUDE_DESKTOP_CONFIG_PATH.trim();
    }
    const home = this.getHomeDir(env);
    if (resolved.CLAUDE_DESKTOP_CONFIG_DIR?.trim()) {
      return join(resolved.CLAUDE_DESKTOP_CONFIG_DIR.trim(), 'claude_desktop_config.json');
    }
    if (process.platform === 'win32' || resolved.APPDATA) {
      const appData = resolved.APPDATA?.trim() || join(home, 'AppData', 'Roaming');
      return join(appData, 'Claude', 'claude_desktop_config.json');
    }
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }

  async detectClaudeCode(env?: Record<string, string | undefined>): Promise<boolean> {
    try {
      return (await stat(this.getClaudeDir(env))).isDirectory();
    } catch {
      return false;
    }
  }

  async detectClaudeDesktop(env?: Record<string, string | undefined>): Promise<boolean> {
    const resolved = this.resolveEnv(env);
    const desktopConfigPath = this.getClaudeDesktopConfigPath(env);
    const home = this.getHomeDir(env);

    if (resolved.CLAUDE_DESKTOP_CONFIG_PATH || resolved.CLAUDE_DESKTOP_CONFIG_DIR) {
      try {
        const stats = await stat(desktopConfigPath);
        if (stats.isFile() || stats.isDirectory()) return true;
      } catch {}
      try {
        const dirStats = await stat(dirname(desktopConfigPath));
        if (dirStats.isDirectory()) return true;
      } catch {}
      return false;
    }

    const candidates = [
      dirname(desktopConfigPath),
      desktopConfigPath,
    ];

    if (process.platform === 'darwin' || !resolved.OS) {
      candidates.push(
        join(home, 'Library', 'Application Support', 'Claude'),
        join(home, 'Applications', 'Claude.app'),
      );
      if (!env?.HOME) {
        candidates.push('/Applications/Claude.app');
      }
    }

    if (process.platform === 'win32' || resolved.APPDATA) {
      const appData = resolved.APPDATA?.trim() || join(home, 'AppData', 'Roaming');
      candidates.push(join(appData, 'Claude'));
    }

    for (const candidate of candidates) {
      try {
        await stat(candidate);
        return true;
      } catch {}
    }
    return false;
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const claudeCodeDetected = await this.detectClaudeCode(env);
    const claudeDesktopDetected = await this.detectClaudeDesktop(env);
    return claudeCodeDetected || claudeDesktopDetected;
  }

  async getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus> {
    const configPath = this.getConfigPath(env);
    const detected = await this.detectEnvironment(env);
    const backupExists = await this.backupManager.hasBackup(configPath);
    const config = await this.backupManager.readJson<Record<string, unknown>>(configPath);
    const hooksObject = config?.hooks;
    const structuredHooks: StructuredHooks = hooksObject && typeof hooksObject === 'object' && !Array.isArray(hooksObject)
      ? hooksObject as StructuredHooks
      : {};
    const hooks: HookStatus['hooks'] = {};

    for (const binding of CLAUDE_EVENT_BINDINGS) {
      const command = listTakeFiveCommands(structuredHooks, binding.eventName)
        .find((item) => item.includes(`--event ${binding.eventType}`));
      if (command) hooks[binding.eventType] = command;
    }

    return {
      detected,
      installed: CLAUDE_EVENT_BINDINGS.every((binding) => Boolean(hooks[binding.eventType])),
      configPath,
      backupExists,
      hooks,
    };
  }

  async install(options: AdapterInstallOptions = {}): Promise<AdapterInstallResult> {
    const codeResult = await this.applyStructuredHooksInstall(CLAUDE_EVENT_BINDINGS, options);
    if (!codeResult.success) {
      return codeResult;
    }

    if (await this.detectClaudeDesktop(options.env)) {
      await this.installClaudeDesktop({ env: options.env, force: options.force });
    }

    return codeResult;
  }

  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const codeResult = await this.applyStructuredHooksUninstall(CLAUDE_EVENT_BINDINGS, options);
    if (
      (await this.detectClaudeDesktop(options.env)) ||
      (await this.backupManager.fileExists(this.getClaudeDesktopConfigPath(options.env)))
    ) {
      await this.uninstallClaudeDesktop({ env: options.env });
    }
    return codeResult;
  }

  async installClaudeDesktop(options: AdapterInstallOptions = {}): Promise<AdapterInstallResult> {
    const desktopConfigPath = options.configPath ?? this.getClaudeDesktopConfigPath(options.env);
    try {
      const existingConfig =
        (await this.backupManager.readJsonStrict<Record<string, unknown>>(desktopConfigPath)) ?? {};
      const mcpServers =
        existingConfig.mcpServers && typeof existingConfig.mcpServers === 'object'
          ? { ...(existingConfig.mcpServers as Record<string, unknown>) }
          : {};

      const argv = this.getCliArgv(options.env);
      const command = argv[0];
      const args = [...argv.slice(1), 'mcp'];
      const currentTakeFive = mcpServers.takefive as { command?: string; args?: string[] } | undefined;

      const alreadyInstalled = Boolean(
        currentTakeFive &&
          currentTakeFive.command === command &&
          Array.isArray(currentTakeFive.args) &&
          JSON.stringify(currentTakeFive.args) === JSON.stringify(args),
      );

      if (alreadyInstalled && !options.force) {
        return {
          agent: this.id,
          success: true,
          configPath: desktopConfigPath,
          backupPath: (await this.backupManager.hasBackup(desktopConfigPath))
            ? this.backupManager.getBackupPath(desktopConfigPath)
            : undefined,
          hooksInjected: ['task_completed', 'waiting_input', 'waiting_permission', 'task_failed'],
          alreadyInstalled: true,
        };
      }

      const backupPath = (await this.backupManager.createBackup(desktopConfigPath)) ?? undefined;
      mcpServers.takefive = {
        command,
        args,
      };

      await this.backupManager.atomicWriteJson(desktopConfigPath, {
        ...existingConfig,
        mcpServers,
      });

      return {
        agent: this.id,
        success: true,
        configPath: desktopConfigPath,
        backupPath,
        hooksInjected: ['task_completed', 'waiting_input', 'waiting_permission', 'task_failed'],
        alreadyInstalled: false,
      };
    } catch (error: unknown) {
      return this.makeInstallFailure(desktopConfigPath, error);
    }
  }

  async uninstallClaudeDesktop(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const desktopConfigPath = options.configPath ?? this.getClaudeDesktopConfigPath(options.env);
    try {
      const config = await this.backupManager.readJsonStrict<Record<string, unknown>>(desktopConfigPath);
      if (!config) {
        const restored = await this.backupManager.restoreBackup(desktopConfigPath);
        return {
          agent: this.id,
          success: true,
          configPath: desktopConfigPath,
          restoredFromBackup: restored,
          hooksRemoved: [],
        };
      }

      const mcpServers =
        config.mcpServers && typeof config.mcpServers === 'object'
          ? { ...(config.mcpServers as Record<string, unknown>) }
          : {};

      delete mcpServers.takefive;
      if (Object.keys(mcpServers).length > 0) {
        config.mcpServers = mcpServers;
      } else {
        delete config.mcpServers;
      }

      await this.backupManager.atomicWriteJson(desktopConfigPath, config);
      await this.backupManager.removeBackup(desktopConfigPath);

      return {
        agent: this.id,
        success: true,
        configPath: desktopConfigPath,
        restoredFromBackup: false,
        hooksRemoved: ['task_completed', 'waiting_input', 'waiting_permission', 'task_failed'],
      };
    } catch (error: unknown) {
      return this.makeUninstallFailure(desktopConfigPath, error);
    }
  }

  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null {
    const normalized = rawEvent.trim().toLowerCase();
    if (['stop', 'task_completed', 'completed'].includes(normalized)) return 'task_completed';
    if (['agent_needs_input', 'waiting_input', 'notification'].includes(normalized)) return 'waiting_input';
    if (
      [
        'permissionrequest',
        'permission_request',
        'waiting_permission',
        'toolconfirmation',
        'tool_confirmation',
      ].includes(normalized)
    )
      return 'waiting_permission';
    if (['stopfailure', 'stop_failure', 'task_failed', 'error'].includes(normalized)) return 'task_failed';
    return null;
  }

  override parseHookPayload(
    payload: Record<string, unknown>,
    fallbackEvent: UnifiedEventType,
    fallbackReason?: string,
  ): ParsedHookPayload {
    const hookName = typeof payload.hook_event_name === 'string'
      ? payload.hook_event_name.toLowerCase()
      : typeof payload.hook_name === 'string'
      ? payload.hook_name.toLowerCase()
      : typeof payload.event === 'string'
      ? payload.event.toLowerCase()
      : '';

    const isSubagent = Boolean(
      payload.is_subagent === true ||
      payload.subagent === true ||
      payload.agent_type === 'subagent' ||
      payload.parent_session_id ||
      payload.parent_id ||
      hookName === 'subagentstop'
    );

    let eventType: UnifiedEventType = fallbackEvent;
    let reason: string | undefined = fallbackReason;
    let projectCwd: string | undefined = undefined;

    if (typeof payload.cwd === 'string' && payload.cwd.trim().length > 0) {
      projectCwd = payload.cwd.trim();
    } else if (
      Array.isArray(payload.workspacePaths) &&
      payload.workspacePaths.length > 0 &&
      typeof payload.workspacePaths[0] === 'string'
    ) {
      projectCwd = payload.workspacePaths[0];
    }

    const assistantMsg = (
      (typeof payload['last-assistant-message'] === 'string' && payload['last-assistant-message'].trim().length > 0
        ? payload['last-assistant-message'].trim()
        : undefined) ||
      (typeof payload.last_assistant_message === 'string' && payload.last_assistant_message.trim().length > 0
        ? payload.last_assistant_message.trim()
        : undefined) ||
      (typeof payload.lastAssistantMessage === 'string' && payload.lastAssistantMessage.trim().length > 0
        ? payload.lastAssistantMessage.trim()
        : undefined)
    );

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      eventType = 'task_failed';
      reason = payload.error.trim();
    } else if (
      hookName === 'toolconfirmation' ||
      hookName === 'tool_confirmation' ||
      hookName === 'permissionrequest' ||
      hookName === 'permission_request'
    ) {
      eventType = 'waiting_permission';
      if (!reason) {
        reason = (payload.command as string) || (payload.tool_name as string) || (payload.tool as string);
      }
    } else if (assistantMsg) {
      reason = assistantMsg;
    } else if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      reason = payload.message.trim();
    }

    const shouldSkip = (fallbackEvent === 'task_completed' || eventType === 'task_completed') && isSubagent;
    return { eventType, reason, projectCwd, shouldSkip, isPreToolUse: false };
  }
}

