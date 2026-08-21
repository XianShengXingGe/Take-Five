import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
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
import type { NotificationDispatcher } from '../core/notification-dispatcher.js';

export interface AntigravityHookPayload {
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  stepIdx?: number;
  invocationNum?: number;
  executionNum?: number;
  terminationReason?: string;
  error?: string;
  fullyIdle?: boolean;
  toolCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
}

export interface AntigravityHookResponse {
  decision?: 'allow' | 'deny' | 'ask' | 'force_ask' | 'continue' | 'stop';
  reason?: string;
  injectSteps?: unknown[];
  permissionOverrides?: string[];
  overwrite?: Record<string, unknown>;
}

export const ANTIGRAVITY_HOOK_SPEC = {
  enabled: true,
  Stop: [
    {
      type: 'command',
      command: 'takefive notify --agent antigravity --event task_completed',
    },
  ],
  PreToolUse: [
    {
      matcher: 'ask_question',
      hooks: [
        {
          type: 'command',
          command: 'takefive notify --agent antigravity --event waiting_input',
        },
      ],
    },
  ],
};

export class AntigravityAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'antigravity';
  readonly displayName = 'Google Antigravity';

  getGeminiDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.ANTIGRAVITY_CONFIG_DIR && resolved.ANTIGRAVITY_CONFIG_DIR.trim().length > 0) {
      return resolved.ANTIGRAVITY_CONFIG_DIR.trim();
    }
    if (resolved.ANTIGRAVITY_HOME && resolved.ANTIGRAVITY_HOME.trim().length > 0) {
      return resolved.ANTIGRAVITY_HOME.trim();
    }
    if (resolved.GEMINI_CONFIG_DIR && resolved.GEMINI_CONFIG_DIR.trim().length > 0) {
      return resolved.GEMINI_CONFIG_DIR.trim();
    }
    if (resolved.GEMINI_HOME && resolved.GEMINI_HOME.trim().length > 0) {
      return resolved.GEMINI_HOME.trim();
    }
    return join(this.getHomeDir(env), '.gemini');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.ANTIGRAVITY_HOOKS_PATH && resolved.ANTIGRAVITY_HOOKS_PATH.trim().length > 0) {
      return resolved.ANTIGRAVITY_HOOKS_PATH.trim();
    }
    if (resolved.GEMINI_HOOKS_PATH && resolved.GEMINI_HOOKS_PATH.trim().length > 0) {
      return resolved.GEMINI_HOOKS_PATH.trim();
    }
    return join(this.getGeminiDir(env), 'config', 'hooks.json');
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const geminiDir = this.getGeminiDir(env);
    const home = this.getHomeDir(env);

    const candidates = [
      geminiDir,
      join(geminiDir, 'config'),
      join(geminiDir, 'antigravity'),
      join(home, '.antigravity'),
      join(home, '.gemini', 'antigravity'),
      join(home, '.gemini'),
    ];

    for (const candidate of candidates) {
      try {
        const stats = await stat(candidate);
        if (stats.isDirectory()) {
          return true;
        }
      } catch {
        // continue
      }
    }

    return false;
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

    const takefive = config.takefive as Record<string, unknown> | undefined;
    const isConfigured = Boolean(takefive && typeof takefive === 'object' && takefive.enabled !== false);

    const hooks: Partial<Record<UnifiedEventType, string>> = {};
    if (isConfigured) {
      hooks.task_completed = 'takefive notify --agent antigravity --event task_completed';
      hooks.waiting_input = 'takefive notify --agent antigravity --event waiting_input';
      hooks.waiting_permission = 'takefive notify --agent antigravity --event waiting_permission';
      hooks.task_failed = 'takefive notify --agent antigravity --event task_failed';
    }

    return {
      detected,
      installed: isConfigured,
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

      const existingTakeFive = existingConfig.takefive as Record<string, unknown> | undefined;
      if (existingTakeFive?.enabled === true && !options.force) {
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

      const updatedConfig = {
        ...existingConfig,
        takefive: { ...ANTIGRAVITY_HOOK_SPEC },
      };

      await this.backupManager.atomicWriteJson(configPath, updatedConfig);

      return {
        agent: this.id,
        success: true,
        configPath,
        backupPath,
        hooksInjected: [...UNIFIED_EVENT_TYPES],
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

      delete config.takefive;
      await this.backupManager.atomicWriteJson(configPath, config);

      return {
        agent: this.id,
        success: true,
        configPath,
        restoredFromBackup: false,
        hooksRemoved: [...UNIFIED_EVENT_TYPES],
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
      case 'stop':
      case 'task_completed':
      case 'model_stop':
      case 'done':
      case 'completed':
      case 'postinvocation':
        return 'task_completed';

      case 'ask_question':
      case 'waiting_input':
      case 'prompt':
      case 'user_input':
      case 'question':
        return 'waiting_input';

      case 'permission_request':
      case 'waiting_permission':
      case 'tool_permission':
      case 'approval_required':
        return 'waiting_permission';

      case 'error':
      case 'task_failed':
      case 'exception':
      case 'failure':
        return 'task_failed';

      default:
        return null;
    }
  }
}

export function translateAntigravityEvent(payload: AntigravityHookPayload): UnifiedEvent {
  let type: UnifiedEventType = 'task_completed';
  let reason: string | undefined = payload.error;

  const hasError = Boolean(payload.error && payload.error.trim().length > 0);
  const isErrorTermination = payload.terminationReason === 'error';

  if (hasError || isErrorTermination) {
    type = 'task_failed';
    reason = payload.error || payload.terminationReason;
  } else if (payload.toolCall?.name === 'ask_question') {
    type = 'waiting_input';
    const questions = payload.toolCall.args?.questions as Array<{ question?: string }> | undefined;
    if (questions && questions.length > 0 && questions[0].question) {
      reason = questions[0].question;
    }
  } else if (
    payload.terminationReason === 'permission_request' ||
    (payload.toolCall && payload.terminationReason?.includes('permission'))
  ) {
    type = 'waiting_permission';
    const cmd = payload.toolCall?.args?.CommandLine as string | undefined;
    reason = cmd || payload.toolCall?.name;
  } else {
    type = 'task_completed';
  }

  let explicitProject: string | undefined;
  if (payload.workspacePaths && payload.workspacePaths.length > 0) {
    explicitProject = basename(payload.workspacePaths[0]);
  }

  const project = detectProjectName({ explicitProject });

  return {
    agent: 'antigravity',
    type,
    project,
    reason,
    timestamp: Date.now(),
  };
}

export async function handleAntigravityHookPayload(
  payload: AntigravityHookPayload,
  dispatcher: NotificationDispatcher,
): Promise<AntigravityHookResponse> {
  const event = translateAntigravityEvent(payload);
  await dispatcher.dispatch(event);
  return {};
}
