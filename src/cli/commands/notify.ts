import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import { getAdapter } from '../../adapters/index.js';
import { cleanNotifyArray } from '../../adapters/codex-adapter.js';
import type { NotificationDispatcher, DispatchResult } from '../../core/notification-dispatcher.js';
import type { ParsedHookPayload } from '../../types/adapter.js';
import {
  isSupportedAgent,
  isUnifiedEventType,
  type SupportedAgent,
  type UnifiedEventType,
} from '../../types/event.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface NotifyCommandOptions {
  agent: string;
  event: string;
  project?: string;
  reason?: string;
  url?: string;
  force?: boolean;
  quiet?: boolean;
  hook?: boolean;
  cwd?: string;
  lastAssistantMessage?: string;
  threadId?: string;
  turnId?: string;
  client?: string;
  inputMessages?: string;
  chain?: string[];
}

export async function readStdin(timeoutMs = 20): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return new Promise((resolve) => {
    let data = '';
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try {
          process.stdin.pause();
        } catch {
          // ignore
        }
        resolve(data.trim());
      }
    };

    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();

    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    process.stdin.resume();
  });
}

export function parseHookPayload(
  rawJson: string,
  options: { agent: string; event: string; reason?: string },
): ParsedHookPayload | Promise<ParsedHookPayload> {
  const fallbackEvent = options.event as UnifiedEventType;
  const fallbackReason = options.reason;

  try {
    const payload = JSON.parse(rawJson) as Record<string, unknown>;
    if (isSupportedAgent(options.agent)) {
      const adapter = getAdapter(options.agent);
      if (adapter?.parseHookPayload) {
        return adapter.parseHookPayload(payload, fallbackEvent, fallbackReason);
      }
    }
  } catch {
    // Malformed JSON fallback
  }

  return {
    eventType: fallbackEvent,
    reason: fallbackReason,
    shouldSkip: false,
    isPreToolUse: false,
  };
}

function writeHookResponse(agent: SupportedAgent, isPreToolUse = false): void {
  if (agent !== 'antigravity') return;
  console.log(JSON.stringify({ decision: isPreToolUse ? 'ask' : 'stop' }));
}

export function registerNotifyCommand(
  program: Command,
  dispatcher: NotificationDispatcher,
  env?: Record<string, string | undefined>,
  stdinReader: () => Promise<string> = readStdin,
): void {
  const lang = detectLanguage(undefined, env);
  const dict = getLocaleStrings(lang);

  program
    .command('notify [action]')
    .description(dict.cli.commands.notify)
    .requiredOption('-a, --agent <name>', 'Agent name (claude, codex, opencode, antigravity)')
    .requiredOption('-e, --event <type>', 'Lifecycle event type (task_completed, waiting_input, waiting_permission, task_failed)')
    .option('-p, --project [name]', 'Project workspace name (auto-detected if omitted)')
    .option('-r, --reason [message]', 'Optional extra context or error details')
    .option('--url [url]', 'Direct Bark push URL override')
    .option('-f, --force', 'Bypass the 2-second debounce window')
    .option('-q, --quiet', 'Suppress console output')
    .option('--hook', 'Use host-safe hook protocol output and exit behavior')
    .option('--cwd [path]', 'Working directory passed by agent notify')
    .option('--last-assistant-message [message]', 'Assistant response passed by agent notify')
    .option('--thread-id [id]', 'Agent thread ID')
    .option('--turn-id [id]', 'Agent turn ID')
    .option('--client [name]', 'Agent client name')
    .option('--input-messages [json]', 'Agent input messages')
    .option('--chain <cmd...>', 'Secondary notify command to chain execution')
    .allowUnknownOption(true)
    .action(async (action: string | undefined, options: NotifyCommandOptions) => {
      const activeDict = getLocaleStrings(detectLanguage());
      const n = activeDict.cli.notify;

      if (options.chain && options.chain.length > 0) {
        const agentTurnIdx = options.chain.findIndex((arg) => arg === 'agent-turn-complete');
        if (!action && agentTurnIdx !== -1) {
          action = options.chain[agentTurnIdx];
          options.chain.splice(agentTurnIdx, 1);
        } else if (!action) {
          const jsonIdx = options.chain.findIndex(
            (arg) => typeof arg === 'string' && arg.trim().startsWith('{') && arg.trim().endsWith('}'),
          );
          if (jsonIdx !== -1) {
            action = options.chain[jsonIdx];
            options.chain.splice(jsonIdx, 1);
          }
        }
      }

      let eventType = options.event;
      if (!eventType && action) {
        if (action === 'agent-turn-complete' || action === 'turn-ended') {
          eventType = 'task_completed';
        }
      }

      if (!isSupportedAgent(options.agent)) {
        if (!options.quiet) {
          console.error(`Error: Unsupported agent "${options.agent}". Supported: claude, codex, opencode, antigravity`);
        }
        process.exitCode = 1;
        return;
      }

      if (!isUnifiedEventType(eventType)) {
        if (!options.quiet) {
          console.error(`Error: Unsupported event type "${eventType}". Supported: task_completed, waiting_input, waiting_permission, task_failed`);
        }
        process.exitCode = 1;
        return;
      }

      if (options.chain && options.chain.length > 0) {
        try {
          const cleanedChain = cleanNotifyArray(options.chain) ?? options.chain;
          if (cleanedChain.length > 0) {
            const chainBin = cleanedChain[0];
            const chainArgs = cleanedChain.slice(1);
            if (action) chainArgs.push(action);
            if (options.threadId) chainArgs.push('--thread-id', options.threadId);
            if (options.turnId) chainArgs.push('--turn-id', options.turnId);
            if (options.cwd) chainArgs.push('--cwd', options.cwd);
            if (options.client) chainArgs.push('--client', options.client);
            if (options.lastAssistantMessage) chainArgs.push('--last-assistant-message', options.lastAssistantMessage);
            if (options.inputMessages) chainArgs.push('--input-messages', options.inputMessages);
            const child = spawn(chainBin, chainArgs, {
              stdio: 'ignore',
              detached: true,
            });
            child.on('error', () => {
              // Ignore errors if secondary binary does not exist or fails to spawn
            });
            child.unref?.();
          }
        } catch {
          // ignore chaining errors
        }
      }

      const effectiveReason = options.reason || options.lastAssistantMessage;
      const effectiveCwd = options.cwd;

      let rawPayload = '';
      if (action && typeof action === 'string' && action.trim().startsWith('{') && action.trim().endsWith('}')) {
        rawPayload = action.trim();
      } else if (Array.isArray(program.args)) {
        for (const arg of program.args) {
          if (typeof arg === 'string' && arg.trim().startsWith('{') && arg.trim().endsWith('}')) {
            rawPayload = arg.trim();
            break;
          }
        }
      }

      if (!rawPayload) {
        const rawStdin = await stdinReader();
        if (rawStdin && rawStdin.trim().length > 0) {
          rawPayload = rawStdin.trim();
        }
      }

      const isFromHook = Boolean(options.hook || rawPayload || (action && action.trim().length > 0));
      let result: DispatchResult & { isPreToolUse?: boolean } = { status: 'skipped' };
      if (isFromHook) {
        if (typeof dispatcher.dispatchFromHook === 'function') {
          result = await dispatcher.dispatchFromHook(
            rawPayload,
            {
              agent: options.agent,
              type: eventType as UnifiedEventType,
              action,
              project: options.project,
              reason: effectiveReason,
              cwd: effectiveCwd,
              threadId: options.threadId,
              turnId: options.turnId,
              env,
            },
            {
              barkUrlOverride: options.url,
              force: options.force,
            },
          );
        } else {
          const parsed = await parseHookPayload(rawPayload, { ...options, event: eventType, reason: effectiveReason });
          if (parsed.shouldSkip) {
            result = { status: 'skipped', isPreToolUse: parsed.isPreToolUse };
          } else {
            const res = await dispatcher.dispatch(
              {
                agent: options.agent as SupportedAgent,
                type: parsed.eventType,
                project: options.project,
                reason: parsed.reason || effectiveReason,
                cwd: parsed.projectCwd || effectiveCwd,
                env,
              },
              {
                barkUrlOverride: options.url,
                force: options.force,
              },
            );
            result = { ...res, isPreToolUse: parsed.isPreToolUse };
          }
        }
      } else {
        result = await dispatcher.dispatch(
          {
            agent: options.agent as SupportedAgent,
            type: eventType as UnifiedEventType,
            project: options.project,
            reason: effectiveReason,
            cwd: effectiveCwd,
            env,
          },
          {
            barkUrlOverride: options.url,
            force: options.force,
          },
        );
      }

      if (options.hook) {
        writeHookResponse(options.agent, result.isPreToolUse);
      } else {
        switch (result.status) {
          case 'dispatched':
            if (!options.quiet) {
              console.log(`${n.sent}: ${result.payload?.title} (${result.payload?.subtitle})`);
            }
            break;

          case 'debounced':
            if (!options.quiet) {
              console.log(n.debounced);
            }
            break;

          case 'agent_disabled':
            if (!options.quiet) {
              console.log(`${n.agentDisabled.replace('agent', `agent "${options.agent}"`)}`);
            }
            break;

          case 'event_disabled':
            if (!options.quiet) {
              console.log(`${n.eventDisabled.replace('event', `event "${options.event}"`)}`);
            }
            break;

          case 'skipped':
            break;

          case 'missing_credential':
            if (!options.quiet) {
              console.error(n.missingCred);
            }
            process.exitCode = 1;
            break;

          case 'failed':
            if (!options.quiet) {
              console.error(`${n.pushFailed}: ${result.error}`);
            }
            process.exitCode = 1;
            break;
        }
      }
    });
}
