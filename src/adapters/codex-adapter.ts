import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  HookStatus,
  ParsedHookPayload,
} from '../types/adapter.js';
import type { SupportedAgent, UnifiedEvent, UnifiedEventType } from '../types/event.js';
import { detectProjectName } from '../core/project-detector.js';
import { BaseAdapter, type StructuredHookBinding } from './base-adapter.js';
import {
  listTakeFiveCommands,
  type StructuredHooks,
} from './structured-hook-utils.js';

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

const CODEX_EVENT_BINDINGS: ReadonlyArray<StructuredHookBinding> = [
  { eventName: 'Stop', eventType: 'task_completed' },
  { eventName: 'PermissionRequest', eventType: 'waiting_permission' },
  { eventName: 'Interrupt', eventType: 'task_failed' },
];

export function parseTomlNotify(content: string): string[] | null {
  const match = content.match(/^\s*notify\s*=\s*\[([\s\S]*?)\]/m);
  if (!match) return null;
  const raw = match[1];
  const items: string[] = [];
  const stripped = raw
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(stripped)) !== null) {
    items.push(m[1] !== undefined ? m[1].replace(/\\"/g, '"') : m[2]);
  }
  return items;
}

export function isTakeFiveNotifyArray(items?: string[] | null): boolean {
  if (!items || items.length === 0) return false;
  const joined = items.join(' ');
  return (
    joined.includes('takefive') ||
    joined.includes('dist/cli.js') ||
    (items.includes('notify') && items.includes('--agent') && items.includes('codex'))
  );
}

export function cleanNotifyArray(items?: string[] | null): string[] | undefined {
  if (!items || items.length === 0) return undefined;
  let cleaned = [...items];

  // 1. Remove Take Five commands that might be chained or nested inside --previous-notify
  let prevIdx = cleaned.indexOf('--previous-notify');
  while (prevIdx !== -1) {
    const after = cleaned.slice(prevIdx + 1);
    if (after.length === 0) {
      // Dangling --previous-notify with nothing after it
      cleaned.splice(prevIdx, 1);
    } else if (
      isTakeFiveNotifyArray(after) ||
      after.some((arg) => arg.includes('takefive') || (arg.includes('notify') && after.includes('codex')))
    ) {
      // Points back to Take Five! Remove --previous-notify and following Take Five args to break circular loop
      cleaned = cleaned.slice(0, prevIdx);
    } else {
      break;
    }
    prevIdx = cleaned.indexOf('--previous-notify');
  }

  // Also remove trailing dangling --previous-notify if any
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '--previous-notify') {
    cleaned.pop();
  }

  return cleaned.length > 0 ? cleaned : undefined;
}

export function extractChainedNotify(items?: string[] | null): string[] | undefined {
  if (!items || items.length === 0) return undefined;

  const chainIdx = items.indexOf('--chain');
  if (chainIdx !== -1) {
    const sub = items.slice(chainIdx + 1);
    if (isTakeFiveNotifyArray(sub)) {
      return extractChainedNotify(sub);
    }
    return cleanNotifyArray(sub);
  }

  // If items starts with external tool and has --previous-notify pointing to Take Five
  const prevIdx = items.indexOf('--previous-notify');
  if (prevIdx !== -1 && !isTakeFiveNotifyArray(items.slice(0, prevIdx))) {
    return cleanNotifyArray(items.slice(0, prevIdx));
  }

  if (!isTakeFiveNotifyArray(items)) {
    return cleanNotifyArray(items);
  }

  return undefined;
}

export function updateTomlNotify(content: string, newArray: string[]): string {
  const formatted = `notify = [ ${newArray.map((s) => JSON.stringify(s)).join(', ')} ]`;
  if (/^\s*notify\s*=/m.test(content)) {
    return content.replace(/^\s*notify\s*=.*$/m, formatted);
  }
  return `${formatted}\n${content}`;
}

export function removeTomlNotify(content: string, restoreArray?: string[]): string {
  if (restoreArray && restoreArray.length > 0) {
    const formatted = `notify = [ ${restoreArray.map((s) => JSON.stringify(s)).join(', ')} ]`;
    return content.replace(/^\s*notify\s*=.*$/m, formatted);
  }
  return content.replace(/^\s*notify\s*=.*\r?\n?/m, '');
}

export interface CodexTurnQueryResult {
  threadId?: string;
  turnId?: string;
  status: 'completed' | 'inProgress' | 'failed' | 'interrupted' | 'unknown';
  phase?: 'commentary' | 'final_answer' | string;
  agentMessageText?: string;
}

let sqliteWarningSuppressed = false;

export function suppressSqliteWarning(): void {
  if (sqliteWarningSuppressed) return;
  sqliteWarningSuppressed = true;

  const originalEmitWarning = process.emitWarning;
  if (!originalEmitWarning) return;

  process.emitWarning = function (warning: unknown, ...args: unknown[]) {
    if (
      typeof warning === 'string' &&
      warning.includes('SQLite is an experimental feature')
    ) {
      return;
    }
    if (
      warning &&
      typeof warning === 'object' &&
      'message' in warning &&
      typeof (warning as { message: unknown }).message === 'string' &&
      ((warning as { message: string }).message).includes('SQLite is an experimental feature')
    ) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalEmitWarning as any).apply(this, [warning, ...args]);
  };
}

export function queryCodexTurnFromDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  threadId?: string,
  turnId?: string,
): CodexTurnQueryResult {
  let resolvedThreadId = threadId;
  let resolvedTurnId = turnId;
  let turnStatus: string | undefined;

  // 1. If neither threadId nor turnId is specified, automatically resolve the latest active turn from thread_turns
  if (!resolvedThreadId && !resolvedTurnId) {
    try {
      const stmtLatest = db.prepare('SELECT thread_id, turn_id, status FROM thread_turns ORDER BY started_at DESC LIMIT 1');
      const row = stmtLatest.get() as { thread_id?: string; turn_id?: string; status?: string } | undefined;
      if (row?.thread_id && row?.turn_id) {
        resolvedThreadId = row.thread_id;
        resolvedTurnId = row.turn_id;
        turnStatus = row.status;
      } else {
        const stmtItem = db.prepare('SELECT thread_id, turn_id FROM thread_items ORDER BY created_at_ms DESC LIMIT 1');
        const itemRow = stmtItem.get() as { thread_id?: string; turn_id?: string } | undefined;
        if (itemRow?.thread_id && itemRow?.turn_id) {
          resolvedThreadId = itemRow.thread_id;
          resolvedTurnId = itemRow.turn_id;
        }
      }
    } catch {
      // Ignore query errors
    }
  } else if (!resolvedThreadId && resolvedTurnId) {
    try {
      const stmtTurn = db.prepare('SELECT thread_id, status FROM thread_turns WHERE turn_id = ?');
      const row = stmtTurn.get(resolvedTurnId) as { thread_id?: string; status?: string } | undefined;
      if (row?.thread_id) {
        resolvedThreadId = row.thread_id;
        turnStatus = row.status;
      } else {
        const stmtItem = db.prepare('SELECT thread_id FROM thread_items WHERE turn_id = ? LIMIT 1');
        const itemRow = stmtItem.get(resolvedTurnId) as { thread_id?: string } | undefined;
        if (itemRow?.thread_id) {
          resolvedThreadId = itemRow.thread_id;
        }
      }
    } catch {
      // Ignore query errors
    }
  } else if (resolvedThreadId && !resolvedTurnId) {
    try {
      const stmtLatest = db.prepare('SELECT turn_id, status FROM thread_turns WHERE thread_id = ? ORDER BY started_at DESC LIMIT 1');
      const row = stmtLatest.get(resolvedThreadId) as { turn_id?: string; status?: string } | undefined;
      if (row?.turn_id) {
        resolvedTurnId = row.turn_id;
        turnStatus = row.status;
      }
    } catch {
      // Ignore query errors
    }
  } else if (resolvedThreadId && resolvedTurnId && !turnStatus) {
    try {
      const stmt = db.prepare('SELECT status FROM thread_turns WHERE thread_id = ? AND turn_id = ?');
      const row = stmt.get(resolvedThreadId, resolvedTurnId) as { status?: string } | undefined;
      if (row?.status) {
        turnStatus = row.status;
      }
    } catch {
      // Ignore query errors
    }
  }

  // 2. Fetch latest agentMessage for this turn in thread_items
  let phase: string | undefined;
  let agentMessageText: string | undefined;

  if (resolvedTurnId) {
    try {
      const msgRow = resolvedThreadId
        ? (db.prepare(
            "SELECT item_json FROM thread_items WHERE thread_id = ? AND turn_id = ? AND item_type = 'agentMessage' ORDER BY rollout_ordinal DESC LIMIT 1",
          ).get(resolvedThreadId, resolvedTurnId) as { item_json?: string } | undefined)
        : (db.prepare(
            "SELECT item_json FROM thread_items WHERE turn_id = ? AND item_type = 'agentMessage' ORDER BY rollout_ordinal DESC LIMIT 1",
          ).get(resolvedTurnId) as { item_json?: string } | undefined);
      if (msgRow?.item_json) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parsed = JSON.parse(msgRow.item_json) as { phase?: string; text?: string; content?: any[] };
          phase = parsed.phase;
          if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
            agentMessageText = parsed.text.trim();
          } else if (Array.isArray(parsed.content)) {
            const joined = parsed.content
              .map((c) => (typeof c === 'string' ? c : c?.text || ''))
              .join('')
              .trim();
            if (joined.length > 0) agentMessageText = joined;
          }
        } catch {
          // Ignore parse errors
        }
      }
    } catch {
      // Ignore query errors
    }
  }

  // 3. Status determination with Phase gating priority:
  // - Explicit failed or interrupted turns
  if (turnStatus === 'failed' || turnStatus === 'interrupted') {
    return {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      status: turnStatus as 'failed' | 'interrupted',
      phase,
      agentMessageText,
    };
  }

  // - Phase gating:
  //   "phase": "commentary" -> inProgress (inhibit intermediate step)
  //   "phase": "final_answer" -> completed (allow final answer)
  if (phase === 'commentary') {
    return {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      status: 'inProgress',
      phase,
      agentMessageText,
    };
  }

  if (phase === 'final_answer') {
    return {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      status: 'completed',
      phase,
      agentMessageText,
    };
  }

  // - Fallback to thread_turns status if no phase
  if (turnStatus === 'completed') {
    return {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      status: 'completed',
      phase,
      agentMessageText,
    };
  }

  if (turnStatus === 'inProgress') {
    return {
      threadId: resolvedThreadId,
      turnId: resolvedTurnId,
      status: 'inProgress',
      phase,
      agentMessageText,
    };
  }

  return {
    threadId: resolvedThreadId,
    turnId: resolvedTurnId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: (turnStatus as any) || 'unknown',
    phase,
    agentMessageText,
  };
}

export function queryCodexTurnDetails(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  codexDirOrDb: string | any,
  threadId?: string,
  turnId?: string,
): CodexTurnQueryResult {
  if (typeof codexDirOrDb !== 'string' && codexDirOrDb && typeof codexDirOrDb.prepare === 'function') {
    return queryCodexTurnFromDb(codexDirOrDb, threadId, turnId);
  }
  const codexDir = codexDirOrDb as string;
  const dbPath = join(codexDir, 'thread_history_1.sqlite');
  if (!existsSync(dbPath)) return { status: 'unknown' };

  try {
    suppressSqliteWarning();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return queryCodexTurnFromDb(db, threadId, turnId);
    } finally {
      db.close();
    }
  } catch {
    // Graceful fallback if SQLite query fails
  }

  return { status: 'unknown' };
}

export function checkCodexTurnStatus(
  codexDir: string,
  threadId?: string,
  turnId?: string,
): 'completed' | 'inProgress' | 'failed' | 'interrupted' | 'unknown' {
  return queryCodexTurnDetails(codexDir, threadId, turnId).status;
}

export async function waitForCodexTurnCompletion(
  codexDir: string,
  threadId?: string,
  turnId?: string,
  maxWaitMs = 600,
  intervalMs = 150,
): Promise<CodexTurnQueryResult> {
  const dbPath = join(codexDir, 'thread_history_1.sqlite');
  if (!existsSync(dbPath)) return { status: 'unknown' };

  try {
    suppressSqliteWarning();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const startTime = Date.now();
      let details = queryCodexTurnFromDb(db, threadId, turnId);

      if (
        details.status === 'completed' ||
        details.status === 'failed' ||
        details.status === 'interrupted' ||
        details.status === 'unknown' ||
        details.phase === 'commentary'
      ) {
        return details;
      }

      while (Date.now() - startTime < maxWaitMs) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        details = queryCodexTurnFromDb(db, threadId, turnId);
        if (
          details.status === 'completed' ||
          details.status === 'failed' ||
          details.status === 'interrupted' ||
          details.phase === 'commentary'
        ) {
          return details;
        }
      }

      return details;
    } finally {
      db.close();
    }
  } catch {
    // Graceful fallback if SQLite query fails
  }

  return { status: 'unknown' };
}

/** Uses Codex's official user-level ~/.codex/config.toml notify and hooks.json lifecycle hooks. */
export class CodexAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'codex';
  readonly displayName = 'OpenAI Codex';

  getCodexDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return resolved.CODEX_CONFIG_DIR?.trim() || resolved.CODEX_HOME?.trim() || join(this.getHomeDir(env), '.codex');
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return resolved.CODEX_HOOKS_PATH?.trim() || resolved.CODEX_CONFIG_PATH?.trim() || join(this.getCodexDir(env), 'hooks.json');
  }

  getConfigTomlPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return resolved.CODEX_CONFIG_TOML_PATH?.trim() || join(this.getCodexDir(env), 'config.toml');
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    try {
      return (await stat(this.getCodexDir(env))).isDirectory();
    } catch {
      return false;
    }
  }

  async getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus> {
    const configPath = this.getConfigPath(env);
    const configTomlPath = this.getConfigTomlPath(env);
    const detected = await this.detectEnvironment(env);
    const backupExists = (await this.backupManager.hasBackup(configPath)) || (await this.backupManager.hasBackup(configTomlPath));
    const config = await this.backupManager.readJson<Record<string, unknown>>(configPath);
    const hooksObject = config?.hooks;
    const structuredHooks: StructuredHooks = hooksObject && typeof hooksObject === 'object' && !Array.isArray(hooksObject)
      ? hooksObject as StructuredHooks
      : {};
    const hooks: HookStatus['hooks'] = {};

    for (const binding of CODEX_EVENT_BINDINGS) {
      const command = listTakeFiveCommands(structuredHooks, binding.eventName)
        .find((item) => item.includes(`--event ${binding.eventType}`));
      if (command) hooks[binding.eventType] = command;
    }

    const tomlContent = await this.backupManager.readText(configTomlPath);
    let tomlInstalled = true;
    if (tomlContent !== null) {
      const notifyArray = parseTomlNotify(tomlContent);
      tomlInstalled = isTakeFiveNotifyArray(notifyArray);
      if (tomlInstalled && notifyArray) {
        hooks.task_completed = notifyArray.join(' ');
      }
    }

    const structuredInstalled = CODEX_EVENT_BINDINGS.every((binding) => Boolean(hooks[binding.eventType]));
    const installed = structuredInstalled && tomlInstalled && Boolean(hooks.task_completed);

    return {
      detected,
      installed,
      configPath,
      backupExists,
      hooks,
    };
  }

  async install(options: AdapterInstallOptions = {}): Promise<AdapterInstallResult> {
    const structuredResult = await this.applyStructuredHooksInstall(CODEX_EVENT_BINDINGS, options, {
      description: 'User-level Codex lifecycle hooks.',
    });

    const configTomlPath = this.getConfigTomlPath(options.env);
    const tomlContent = await this.backupManager.readText(configTomlPath);
    let tomlInjected = false;
    let isAlreadyInToml = false;
    if (tomlContent !== null || (await this.detectEnvironment(options.env))) {
      const currentToml = tomlContent ?? '';
      const existingNotify = parseTomlNotify(currentToml);
      isAlreadyInToml = isTakeFiveNotifyArray(existingNotify);

      if (!isAlreadyInToml || options.force) {
        await this.backupManager.createBackup(configTomlPath);
        const cliArgv = this.getCliArgv(options.env);
        const notifyCmd = [...cliArgv, 'notify', '--agent', 'codex', '--event', 'task_completed', '--hook', '--quiet'];
        const secondary = extractChainedNotify(existingNotify);
        if (secondary && secondary.length > 0) {
          notifyCmd.push('--chain', ...secondary);
        }
        const updatedToml = updateTomlNotify(currentToml, notifyCmd);
        await this.backupManager.atomicWriteText(configTomlPath, updatedToml);
        tomlInjected = true;
      }
    }

    const hooksInjected = [...structuredResult.hooksInjected];
    if ((tomlInjected || isAlreadyInToml) && !hooksInjected.includes('task_completed')) {
      hooksInjected.unshift('task_completed');
    }

    return {
      ...structuredResult,
      hooksInjected,
    };
  }

  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const structuredResult = await this.applyStructuredHooksUninstall(CODEX_EVENT_BINDINGS, options);

    const configTomlPath = this.getConfigTomlPath(options.env);
    if (await this.backupManager.hasBackup(configTomlPath)) {
      await this.backupManager.restoreBackup(configTomlPath);
    } else {
      const tomlContent = await this.backupManager.readText(configTomlPath);
      if (tomlContent) {
        const existingNotify = parseTomlNotify(tomlContent);
        if (isTakeFiveNotifyArray(existingNotify)) {
          const secondary = extractChainedNotify(existingNotify);
          const cleanedToml = removeTomlNotify(tomlContent, secondary);
          await this.backupManager.atomicWriteText(configTomlPath, cleanedToml);
        }
      }
    }

    return structuredResult;
  }

  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null {
    const normalized = rawEvent.trim().toLowerCase();
    if (['stop', 'task_completed', 'completed', 'done'].includes(normalized)) return 'task_completed';
    if (['permissionrequest', 'permission_request', 'waiting_permission'].includes(normalized)) return 'waiting_permission';
    if (['waiting_input', 'input_required'].includes(normalized)) return 'waiting_input';
    if (['task_failed', 'error', 'failed'].includes(normalized)) return 'task_failed';
    return null;
  }

  override parseHookPayload(
    payload: Record<string, unknown>,
    fallbackEvent: UnifiedEventType,
    fallbackReason?: string,
  ): ParsedHookPayload | Promise<ParsedHookPayload> {
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
    } else if (typeof payload.directory === 'string' && payload.directory.trim().length > 0) {
      projectCwd = payload.directory.trim();
    }

    const resolveField = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = payload[k];
        if (typeof v === 'string' && v.trim().length > 0) return v.trim();
        if (typeof v === 'number') return String(v);
      }
      return undefined;
    };

    let threadId = resolveField('threadId', 'thread-id', 'thread_id', 'sessionId', 'session-id', 'session_id');
    let turnId = resolveField('turnId', 'turn-id', 'turn_id');

    const hookEvent = typeof payload.hook_event_name === 'string'
      ? payload.hook_event_name.toLowerCase()
      : typeof payload.event === 'string'
      ? payload.event.toLowerCase()
      : '';

    const toolName = typeof payload.tool_name === 'string'
      ? payload.tool_name.toLowerCase()
      : '';

    const toolInput = payload.tool_input && typeof payload.tool_input === 'object'
      ? payload.tool_input as Record<string, unknown>
      : undefined;

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
    } else if (assistantMsg) {
      reason = assistantMsg;
    } else if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      reason = payload.message.trim();
    } else if (toolInput) {
      if (typeof toolInput.command === 'string' && toolInput.command.trim().length > 0) {
        reason = toolInput.command.trim();
      } else if (typeof toolInput.message === 'string' && toolInput.message.trim().length > 0) {
        reason = toolInput.message.trim();
      } else if (typeof toolInput.question === 'string' && toolInput.question.trim().length > 0) {
        reason = toolInput.question.trim();
      } else if (typeof toolInput.prompt === 'string' && toolInput.prompt.trim().length > 0) {
        reason = toolInput.prompt.trim();
      } else if (typeof toolInput.description === 'string' && toolInput.description.trim().length > 0) {
        reason = toolInput.description.trim();
      } else if (typeof toolInput.path === 'string' && toolInput.path.trim().length > 0) {
        reason = toolInput.path.trim();
      }
    } else if (typeof payload.reason === 'string' && payload.reason.trim().length > 0) {
      const rawReason = payload.reason.trim();
      const lower = rawReason.toLowerCase();
      if (!['stop', 'tool_call', 'tool_use', 'exec', 'end_turn', 'completed'].includes(lower)) {
        reason = rawReason;
      }
    }

    const stopReason = typeof payload.stop_reason === 'string'
      ? payload.stop_reason.toLowerCase()
      : typeof payload.stopReason === 'string'
      ? payload.stopReason.toLowerCase()
      : '';

    const trigger = typeof payload.trigger === 'string' ? payload.trigger.toLowerCase() : '';

    const isTurnComplete = Boolean(
      payload.type === 'agent-turn-complete' ||
      payload.event === 'agent-turn-complete' ||
      payload.action === 'agent-turn-complete' ||
      hookEvent === 'agent-turn-complete' ||
      payload.type === 'turn-ended' ||
      payload.event === 'turn-ended' ||
      payload.action === 'turn-ended' ||
      hookEvent === 'turn-ended' ||
      stopReason === 'end_turn' ||
      (typeof payload.reason === 'string' && payload.reason.trim().toLowerCase() === 'end_turn')
    );

    if (isTurnComplete) {
      eventType = 'task_completed';
    } else if (
      hookEvent === 'interrupt' ||
      payload.interrupted === true ||
      payload.termination_reason === 'error' ||
      payload.terminationReason === 'error' ||
      (typeof payload.reason === 'string' && payload.reason.toLowerCase().includes('interrupt'))
    ) {
      eventType = 'task_failed';
      if (!reason && typeof payload.reason === 'string') {
        reason = payload.reason.trim();
      }
      if (!reason) {
        reason = 'Task was interrupted';
      }
    } else if (
      toolName === 'request_user_input' ||
      toolName === 'ask_question' ||
      (toolInput && (toolInput.question || (toolInput.message && hookEvent.includes('permission'))))
    ) {
      eventType = 'waiting_input';
    } else if (hookEvent.includes('permission') || payload.type === 'approval-requested') {
      eventType = 'waiting_permission';
    }

    const isSubagent = Boolean(
      payload.agent_type === 'subagent' ||
      payload.is_subagent === true ||
      payload.subagent === true ||
      payload.parent_session_id ||
      payload.parent_id ||
      payload.parent_turn_id ||
      payload['parent-turn-id'] ||
      hookEvent === 'subagentstop' ||
      hookEvent === 'subagentstart'
    );

    const isNotFullyIdle = payload.fully_idle === false || payload.fullyIdle === false;
    const rawReason = typeof payload.reason === 'string' ? payload.reason.toLowerCase() : '';
    const isExplicitEndTurn = stopReason === 'end_turn' || rawReason === 'end_turn' || isTurnComplete;

    const isIntermediateStopHook = (hookEvent === 'stop' || payload.stop_hook_active === true) && !isExplicitEndTurn;
    const isIntermediateToolCall = (
      stopReason === 'tool_use' ||
      stopReason === 'tool_call' ||
      stopReason === 'tool_result' ||
      trigger === 'tool_use' ||
      trigger === 'tool_call' ||
      rawReason === 'tool_use' ||
      rawReason === 'tool_call' ||
      rawReason === 'exec' ||
      payload.continue === true
    );
    const isIntermediateStep = isIntermediateStopHook || isIntermediateToolCall;

    let shouldSkip = false;
    if (isSubagent || isNotFullyIdle || isIntermediateToolCall) {
      shouldSkip = true;
    }

    // Explicit status in payload
    if (payload.status === 'inProgress' || payload.status === 'in_progress') {
      shouldSkip = true;
    } else if (payload.status === 'failed') {
      eventType = 'task_failed';
      shouldSkip = false;
    } else if (payload.status === 'interrupted') {
      eventType = 'task_failed';
      shouldSkip = false;
      if (!reason) reason = 'Task was interrupted';
    } else if (payload.status === 'completed') {
      eventType = 'task_completed';
      shouldSkip = false;
    }

    const hasExplicitSignal = Boolean(
      threadId ||
      turnId ||
      hookEvent ||
      isTurnComplete ||
      payload.status !== undefined ||
      payload.stop_hook_active !== undefined ||
      payload.action ||
      payload.type ||
      payload.event
    );

    if (!shouldSkip && eventType !== 'task_failed' && eventType !== 'waiting_input' && eventType !== 'waiting_permission' && hasExplicitSignal) {
      const env = payload.env as Record<string, string | undefined> | undefined;
      const codexDir = this.getCodexDir(env);
      const dbPath = join(codexDir, 'thread_history_1.sqlite');
      const hasDb = existsSync(dbPath);

      if (hasDb) {
        const initialDetails = queryCodexTurnDetails(codexDir, threadId, turnId);
        const isSettled = (
          initialDetails.status === 'completed' ||
          initialDetails.status === 'failed' ||
          initialDetails.status === 'interrupted' ||
          initialDetails.status === 'unknown' ||
          initialDetails.phase === 'commentary'
        );

        const applyTurnDetails = (details: CodexTurnQueryResult): ParsedHookPayload => {
          let resEventType: UnifiedEventType = eventType;
          let resReason = reason;
          let resSkip = shouldSkip;
          let resThreadId = threadId;
          let resTurnId = turnId;

          if (!resThreadId && details.threadId) resThreadId = details.threadId;
          if (!resTurnId && details.turnId) resTurnId = details.turnId;
          if (details.agentMessageText && !resReason) resReason = details.agentMessageText;

          if (details.status === 'inProgress') {
            resSkip = true;
          } else if (details.status === 'completed') {
            resEventType = 'task_completed';
            resSkip = false;
          } else if (details.status === 'failed') {
            resEventType = 'task_failed';
            resSkip = false;
            if (!resReason) resReason = 'Task failed';
          } else if (details.status === 'interrupted') {
            resEventType = 'task_failed';
            resSkip = false;
            if (!resReason) resReason = 'Task was interrupted';
          } else {
            // Status is unknown from DB
            if (isIntermediateStep || (!isTurnComplete && fallbackEvent === 'task_completed')) {
              resSkip = true;
            }
          }

          const resFingerprint = (resThreadId && resTurnId)
            ? `codex:${resThreadId}:${resTurnId}`
            : (resTurnId ? `codex:${resTurnId}` : undefined);

          return {
            eventType: resEventType,
            reason: resReason,
            projectCwd,
            shouldSkip: resSkip,
            isPreToolUse: false,
            threadId: resThreadId,
            turnId: resTurnId,
            fingerprint: resFingerprint,
          };
        };

        if (isSettled) {
          return applyTurnDetails(initialDetails);
        }

        // Unsettled: delegate to waitForCodexTurnCompletion which manages the single DatabaseSync handle
        return waitForCodexTurnCompletion(codexDir, threadId, turnId).then(applyTurnDetails);
      } else {
        // No DB present
        if (isIntermediateStep) {
          shouldSkip = true;
        } else if (fallbackEvent === 'task_completed' && !isTurnComplete && payload.status !== 'completed') {
          shouldSkip = true;
        }
      }
    } else if (!hasExplicitSignal) {
      // Empty or unassociated payload
      shouldSkip = true;
    }

    const fingerprint = (threadId && turnId)
      ? `codex:${threadId}:${turnId}`
      : (turnId ? `codex:${turnId}` : undefined);

    return {
      eventType,
      reason,
      projectCwd,
      shouldSkip,
      isPreToolUse: false,
      threadId,
      turnId,
      fingerprint,
    };
  }
}


export function translateCodexEvent(raw: CodexRawEvent): UnifiedEvent {
  const identifier = `${raw.event ?? raw.type ?? ''} ${raw.status ?? ''}`.toLowerCase();
  let type: UnifiedEventType = 'task_completed';
  if (raw.error || identifier.includes('fail') || identifier.includes('error')) type = 'task_failed';
  else if (identifier.includes('permission') || identifier.includes('approval')) type = 'waiting_permission';
  else if (identifier.includes('input') || identifier.includes('question')) type = 'waiting_input';
  return {
    agent: 'codex',
    type,
    project: detectProjectName({ explicitProject: raw.project }),
    reason: raw.error || raw.reason || raw.message,
    timestamp: raw.timestamp ?? Date.now(),
  };
}
