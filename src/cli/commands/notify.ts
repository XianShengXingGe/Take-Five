import type { Command } from 'commander';
import { detectProjectName } from '../../core/project-detector.js';
import type { NotificationDispatcher } from '../../core/notification-dispatcher.js';
import {
  isSupportedAgent,
  isUnifiedEventType,
  type SupportedAgent,
  type UnifiedEvent,
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
}

export async function readStdin(timeoutMs = 50): Promise<string> {
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
        resolve(data.trim());
      }
    };

    const timer = setTimeout(finish, timeoutMs);

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
  options: NotifyCommandOptions,
): {
  eventType: UnifiedEventType;
  reason?: string;
  projectCwd?: string;
  shouldSkip: boolean;
} {
  let eventType: UnifiedEventType = options.event as UnifiedEventType;
  let reason: string | undefined = options.reason;
  let projectCwd: string | undefined = undefined;
  let shouldSkip = false;

  try {
    const payload = JSON.parse(rawJson) as Record<string, unknown>;

    if (options.agent === 'antigravity') {
      // If background tasks or subagents are still actively running, suppress premature task_completed
      if (options.event === 'task_completed' && payload.fullyIdle === false) {
        shouldSkip = true;
      }

      // If toolCall was ask_question, map to waiting_input
      const toolCall = payload.toolCall as { name?: string; args?: Record<string, unknown> } | undefined;
      if (toolCall?.name === 'ask_question') {
        eventType = 'waiting_input';
        const questions = toolCall.args?.questions as Array<{ question?: string }> | undefined;
        if (questions?.[0]?.question) {
          reason = questions[0].question;
        }
      }

      // If error termination, map to task_failed
      if (
        payload.terminationReason === 'error' ||
        (typeof payload.error === 'string' && payload.error.trim().length > 0)
      ) {
        eventType = 'task_failed';
        reason = (payload.error as string) || (payload.terminationReason as string);
      } else if (payload.terminationReason === 'permission_request') {
        eventType = 'waiting_permission';
      }

      // Extract workspace paths
      if (
        Array.isArray(payload.workspacePaths) &&
        payload.workspacePaths.length > 0 &&
        typeof payload.workspacePaths[0] === 'string'
      ) {
        projectCwd = payload.workspacePaths[0];
      }
    } else {
      // Generic agent payload
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
      }
    }
  } catch {
    // ignore parse error if malformed JSON
  }

  return { eventType, reason, projectCwd, shouldSkip };
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
    .command('notify')
    .description(dict.cli.commands.notify)
    .requiredOption('-a, --agent <name>', 'Agent name (claude, codex, opencode, antigravity)')
    .requiredOption('-e, --event <type>', 'Lifecycle event type (task_completed, waiting_input, waiting_permission, task_failed)')
    .option('-p, --project [name]', 'Project workspace name (auto-detected if omitted)')
    .option('-r, --reason [message]', 'Optional extra context or error details')
    .option('--url [url]', 'Direct Bark push URL override')
    .option('-f, --force', 'Bypass the 2-second debounce window')
    .option('-q, --quiet', 'Suppress console output')
    .action(async (options: NotifyCommandOptions) => {
      const activeDict = getLocaleStrings(detectLanguage());
      const n = activeDict.cli.notify;

      if (!isSupportedAgent(options.agent)) {
        if (!options.quiet) {
          console.error(`Error: Unsupported agent "${options.agent}". Supported: claude, codex, opencode, antigravity`);
        }
        process.exitCode = 1;
        return;
      }

      if (!isUnifiedEventType(options.event)) {
        if (!options.quiet) {
          console.error(`Error: Unsupported event type "${options.event}". Supported: task_completed, waiting_input, waiting_permission, task_failed`);
        }
        process.exitCode = 1;
        return;
      }

      const rawStdin = await stdinReader();
      let eventType: UnifiedEventType = options.event;
      let reason: string | undefined = options.reason;
      let projectCwd: string | undefined = undefined;

      if (rawStdin.length > 0) {
        const parsed = parseHookPayload(rawStdin, options);
        if (parsed.shouldSkip) {
          if (!options.quiet && options.agent === 'antigravity') {
            console.log('{}');
          }
          return;
        }
        eventType = parsed.eventType;
        if (parsed.reason) {
          reason = parsed.reason;
        }
        projectCwd = parsed.projectCwd;
      }

      const projectName = detectProjectName({
        explicitProject: options.project,
        cwd: projectCwd,
        env,
      });

      const event: UnifiedEvent = {
        agent: options.agent,
        type: eventType,
        project: projectName,
        reason,
        timestamp: Date.now(),
      };

      const result = await dispatcher.dispatch(event, {
        barkUrlOverride: options.url,
        force: options.force,
      });

      if (rawStdin.length > 0 && options.agent === 'antigravity') {
        // Output empty JSON object as required by Antigravity hook protocol
        console.log('{}');
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
              console.log(`${n.agentDisabled.replace('agent', `agent "${event.agent}"`)}`);
            }
            break;

          case 'event_disabled':
            if (!options.quiet) {
              console.log(`${n.eventDisabled.replace('event', `event "${event.type}"`)}`);
            }
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
