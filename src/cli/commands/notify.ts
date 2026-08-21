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

export interface NotifyCommandOptions {
  agent: string;
  event: string;
  project?: string;
  reason?: string;
  url?: string;
  force?: boolean;
  quiet?: boolean;
}

export function registerNotifyCommand(
  program: Command,
  dispatcher: NotificationDispatcher,
): void {
  program
    .command('notify')
    .description('Send push notification for an agent lifecycle event')
    .requiredOption('-a, --agent <name>', 'Agent name (claude, codex, opencode, antigravity)')
    .requiredOption('-e, --event <type>', 'Lifecycle event type (task_completed, waiting_input, waiting_permission, task_failed)')
    .option('-p, --project [name]', 'Project workspace name (auto-detected if omitted)')
    .option('-r, --reason [message]', 'Optional extra context or error details')
    .option('--url [url]', 'Direct Bark push URL override')
    .option('-f, --force', 'Bypass the 2-second debounce window')
    .option('-q, --quiet', 'Suppress console output')
    .action(async (options: NotifyCommandOptions) => {
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

      const projectName = detectProjectName({ explicitProject: options.project });
      const event: UnifiedEvent = {
        agent: options.agent,
        type: options.event,
        project: projectName,
        reason: options.reason,
        timestamp: Date.now(),
      };

      const result = await dispatcher.dispatch(event, {
        barkUrlOverride: options.url,
        force: options.force,
      });

      switch (result.status) {
        case 'dispatched':
          if (!options.quiet) {
            console.log(`Notification sent: ${result.payload?.title} (${result.payload?.subtitle})`);
          }
          break;

        case 'debounced':
          if (!options.quiet) {
            console.log(`Notification skipped: debounced within cooldown window.`);
          }
          break;

        case 'agent_disabled':
          if (!options.quiet) {
            console.log(`Notification skipped: agent "${event.agent}" is disabled in config.`);
          }
          break;

        case 'event_disabled':
          if (!options.quiet) {
            console.log(`Notification skipped: event "${event.type}" is disabled in config.`);
          }
          break;

        case 'missing_credential':
          if (!options.quiet) {
            console.error(`Error: Bark URL is not configured. Run "takefive install" to set up credentials.`);
          }
          process.exitCode = 1;
          break;

        case 'failed':
          if (!options.quiet) {
            console.error(`Error: Push failed: ${result.error}`);
          }
          process.exitCode = 1;
          break;
      }
    });
}
