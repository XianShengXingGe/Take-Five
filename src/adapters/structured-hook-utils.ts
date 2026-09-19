/** Utilities for the matcher-group hook format shared by Claude Code and Codex. */

export interface CommandHookHandler {
  type?: string;
  command: string;
  commandWindows?: string;
  timeout?: number;
  async?: boolean;
  [key: string]: unknown;
}

export interface HookMatcherGroup {
  matcher?: string;
  hooks: unknown[];
  [key: string]: unknown;
}

export type StructuredHooks = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCommandHandler(value: unknown): value is CommandHookHandler {
  return isRecord(value) && typeof value.command === 'string';
}

function isMatcherGroup(value: unknown): value is HookMatcherGroup {
  return isRecord(value) && Array.isArray(value.hooks);
}

function isTakeFiveHandler(value: unknown): value is CommandHookHandler {
  return isCommandHandler(value) && /\bnotify\s+--agent\s+(claude|codex|opencode|antigravity)\b/.test(value.command);
}

export function listTakeFiveCommands(hooks: StructuredHooks, eventName: string): string[] {
  const groups = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
  const commands: string[] = [];

  for (const group of groups) {
    if (isMatcherGroup(group)) {
      for (const handler of group.hooks) {
        if (isTakeFiveHandler(handler)) commands.push(handler.command);
      }
    } else if (isTakeFiveHandler(group)) {
      commands.push(group.command);
    }
  }

  return commands;
}

/**
 * Adds one Take Five command without changing user-owned handlers. Existing
 * Take Five handlers for the same event/matcher are replaced so upgrades can
 * refresh absolute executable paths.
 */
export function upsertCommandHook(
  hooks: StructuredHooks,
  eventName: string,
  command: string,
  matcher?: string,
  options?: { isAsync?: boolean },
): void {
  const currentValue = hooks[eventName];
  const current = Array.isArray(currentValue) ? [...currentValue] : [];
  let target: HookMatcherGroup | undefined;

  for (const item of current) {
    if (!isMatcherGroup(item)) continue;
    const itemMatcher = typeof item.matcher === 'string' ? item.matcher : undefined;
    if (itemMatcher !== matcher) continue;
    item.hooks = item.hooks.filter((handler) => !isTakeFiveHandler(handler));
    target = item;
  }

  if (!target) {
    target = matcher === undefined ? { hooks: [] } : { matcher, hooks: [] };
    current.push(target);
  }

  const handler: CommandHookHandler = {
    type: 'command',
    command,
    timeout: 10,
  };
  if (options?.isAsync) {
    handler.async = true;
  }

  target.hooks.push(handler);

  hooks[eventName] = current;
}

/** Removes only Take Five handlers and keeps all foreign hook definitions. */
export function removeTakeFiveHooks(hooks: StructuredHooks): number {
  let removed = 0;

  for (const [eventName, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) continue;
    const next: unknown[] = [];

    for (const item of value) {
      if (isMatcherGroup(item)) {
        const handlers = item.hooks.filter((handler) => {
          if (isTakeFiveHandler(handler)) {
            removed++;
            return false;
          }
          return true;
        });
        if (handlers.length > 0) next.push({ ...item, hooks: handlers });
      } else if (isTakeFiveHandler(item)) {
        removed++;
      } else {
        next.push(item);
      }
    }

    if (next.length > 0) hooks[eventName] = next;
    else delete hooks[eventName];
  }

  return removed;
}
