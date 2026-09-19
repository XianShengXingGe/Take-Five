import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  HookStatus,
  ParsedHookPayload,
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
    const serialized = takefive ? JSON.stringify(takefive) : '';
    const isConfigured = Boolean(
      takefive &&
      typeof takefive === 'object' &&
      takefive.enabled !== false &&
      serialized.includes('--event task_completed') &&
      serialized.includes('--event waiting_input') &&
      serialized.includes('--event waiting_permission'),
    );

    const hooks: Partial<Record<UnifiedEventType, string>> = {};
    if (isConfigured) {
      hooks.task_completed = 'Stop (maps error termination to task_failed)';
      hooks.waiting_input = 'PreToolUse: ask_question';
      hooks.waiting_permission = 'PreToolUse: ask_permission';
      hooks.task_failed = 'Stop: terminationReason=error';
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
    return this.applyJsonPatchInstall(
      (existingConfig) => {
        const existingTakeFive = existingConfig.takefive as Record<string, unknown> | undefined;
        const currentSource = existingTakeFive ? JSON.stringify(existingTakeFive) : '';
        return Boolean(
          existingTakeFive?.enabled === true &&
            currentSource.includes('--event task_completed') &&
            currentSource.includes('--event waiting_input') &&
            currentSource.includes('--event waiting_permission'),
        );
      },
      (existingConfig) => ({
        ...existingConfig,
        takefive: this.buildHookSpec(options.env),
      }),
      [...UNIFIED_EVENT_TYPES],
      options,
    );
  }

  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    return this.applyJsonPatchUninstall(
      (config) => {
        delete config.takefive;
      },
      [...UNIFIED_EVENT_TYPES],
      options,
    );
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
      case 'request_user_input':
      case 'requestuserinput':
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

  override parseHookPayload(
    payload: Record<string, unknown>,
    fallbackEvent: UnifiedEventType,
    fallbackReason?: string,
  ): ParsedHookPayload {
    const isPreToolUse = Boolean(payload.toolCall && typeof payload.toolCall === 'object');
    let shouldSkip = false;
    let eventType: UnifiedEventType = fallbackEvent;
    let reason: string | undefined = fallbackReason;
    let projectCwd: string | undefined = undefined;

    if (fallbackEvent === 'task_completed' && payload.fullyIdle === false) {
      shouldSkip = true;
    }

    const toolCall = payload.toolCall as { name?: string; args?: Record<string, unknown> } | undefined;
    if (toolCall?.name === 'ask_question' || toolCall?.name === 'request_user_input') {
      eventType = 'waiting_input';
      const questions = toolCall.args?.questions as Array<{ question?: string } | string> | undefined;
      const firstQ = questions?.[0];
      const questionText =
        (typeof firstQ === 'object' && firstQ !== null ? firstQ.question : typeof firstQ === 'string' ? firstQ : undefined) ||
        (typeof toolCall.args?.question === 'string' ? toolCall.args.question : undefined) ||
        (typeof toolCall.args?.prompt === 'string' ? toolCall.args.prompt : undefined) ||
        (typeof toolCall.args?.message === 'string' ? toolCall.args.message : undefined);
      if (questionText) {
        reason = questionText;
      }
    } else if (
      payload.terminationReason === 'error' ||
      (typeof payload.error === 'string' && payload.error.trim().length > 0)
    ) {
      eventType = 'task_failed';
      reason = (payload.error as string) || (payload.terminationReason as string);
    } else if (payload.terminationReason === 'permission_request') {
      eventType = 'waiting_permission';
    }

    if (
      Array.isArray(payload.workspacePaths) &&
      payload.workspacePaths.length > 0 &&
      typeof payload.workspacePaths[0] === 'string'
    ) {
      projectCwd = payload.workspacePaths[0];
    }

    return { eventType, reason, projectCwd, shouldSkip, isPreToolUse };
  }

  private buildHookSpec(env?: Record<string, string | undefined>): Record<string, unknown> {
    return {
      enabled: true,
      Stop: [
        {
          type: 'command',
          command: this.generateNotifyCommand('task_completed', { env }),
          timeout: 10,
        },
      ],
      PreToolUse: [
        {
          matcher: 'ask_question',
          hooks: [
            {
              type: 'command',
              command: this.generateNotifyCommand('waiting_input', { env }),
              timeout: 10,
            },
          ],
        },
        {
          matcher: 'ask_permission',
          hooks: [
            {
              type: 'command',
              command: this.generateNotifyCommand('waiting_permission', { env }),
              timeout: 10,
            },
          ],
        },
      ],
    };
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
  } else if (payload.toolCall?.name === 'ask_question' || payload.toolCall?.name === 'request_user_input') {
    type = 'waiting_input';
    const questions = payload.toolCall.args?.questions as Array<{ question?: string } | string> | undefined;
    const firstQ = questions?.[0];
    const questionText =
      (typeof firstQ === 'object' && firstQ !== null ? firstQ.question : typeof firstQ === 'string' ? firstQ : undefined) ||
      (typeof payload.toolCall.args?.question === 'string' ? payload.toolCall.args.question : undefined) ||
      (typeof payload.toolCall.args?.prompt === 'string' ? payload.toolCall.args.prompt : undefined) ||
      (typeof payload.toolCall.args?.message === 'string' ? payload.toolCall.args.message : undefined);
    if (questionText) {
      reason = questionText;
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
  return { decision: 'stop' };
}
