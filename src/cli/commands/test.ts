import type { Command } from 'commander';
import pc from 'picocolors';
import { detectProjectName } from '../../core/project-detector.js';
import type { NotificationDispatcher } from '../../core/notification-dispatcher.js';
import {
  isSupportedAgent,
  isUnifiedEventType,
  UNIFIED_EVENT_TYPES,
  type SupportedAgent,
  type UnifiedEvent,
  type UnifiedEventType,
} from '../../types/event.js';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface TestCommandOptions {
  event?: string;
  agent?: string;
  project?: string;
  url?: string;
  quiet?: boolean;
}

/**
 * Registers the `takefive test` CLI command.
 */
export function registerTestCommand(
  program: Command,
  dispatcher: NotificationDispatcher,
  env?: Record<string, string | undefined>,
): void {
  const lang = detectLanguage(undefined, env);
  const dict = getLocaleStrings(lang);

  program
    .command('test')
    .description(dict.cli.commands.test)
    .option(
      '-e, --event <type>',
      'Specific lifecycle event type to test (task_completed, waiting_input, waiting_permission, task_failed)',
    )
    .option('-a, --agent <name>', 'Agent name (default: claude)', 'claude')
    .option('-p, --project [name]', 'Project workspace name (auto-detected if omitted)')
    .option('--url [url]', 'Direct Bark push URL override')
    .option('-q, --quiet', 'Suppress console output')
    .action(async (options: TestCommandOptions) => {
      const lang = detectLanguage();
      const dict = getLocaleStrings(lang);
      const t = dict.cli.test;

      const agentName = options.agent ?? 'claude';
      if (!isSupportedAgent(agentName)) {
        if (!options.quiet) {
          console.error(
            pc.red(`Error: Unsupported agent "${agentName}". Supported: claude, codex, opencode, antigravity`),
          );
        }
        process.exitCode = 1;
        return;
      }

      const projectName = detectProjectName({ explicitProject: options.project });

      const eventsToTest: UnifiedEventType[] = options.event
        ? [options.event as UnifiedEventType]
        : [...UNIFIED_EVENT_TYPES];

      if (options.event && !isUnifiedEventType(options.event)) {
        if (!options.quiet) {
          console.error(
            pc.red(
              `Error: Unsupported event type "${options.event}". Supported: ${UNIFIED_EVENT_TYPES.join(', ')}`,
            ),
          );
        }
        process.exitCode = 1;
        return;
      }

      if (!options.quiet) {
        console.log(pc.bold(pc.cyan(`\n${t.testingTitle} ${agentName} (${projectName})...\n`)));
      }

      let hadError = false;

      for (const eventType of eventsToTest) {
        const event: UnifiedEvent = {
          agent: agentName as SupportedAgent,
          type: eventType,
          project: projectName,
          timestamp: Date.now(),
        };

        const result = await dispatcher.dispatch(event, {
          barkUrlOverride: options.url,
          force: true, // Bypass debounce during testing
        });

        switch (result.status) {
          case 'dispatched':
            if (!options.quiet) {
              console.log(
                pc.green(`  ✔ [${eventType}] ${t.sent}: `) +
                  pc.bold(result.payload?.title ?? '') +
                  pc.dim(` (${result.payload?.subtitle})`),
              );
            }
            break;

          case 'missing_credential':
            if (!options.quiet) {
              console.error(
                pc.red(`  ✖ ${t.missingCredError}`),
              );
            }
            hadError = true;
            break;

          case 'agent_disabled':
            if (!options.quiet) {
              console.log(pc.yellow(`  ⚠ ${t.skippedAgentDisabled.replace('agent', `agent "${agentName}"`)}`));
            }
            break;

          case 'event_disabled':
            if (!options.quiet) {
              console.log(pc.yellow(`  ⚠ ${t.skippedEventDisabled.replace('event', `event "${eventType}"`)}`));
            }
            break;

          case 'failed':
            if (!options.quiet) {
              console.error(pc.red(`  ✖ [${eventType}] ${t.pushFailed}: ${result.error}`));
            }
            hadError = true;
            break;

          default:
            if (!options.quiet) {
              console.log(pc.dim(`  ℹ [${eventType}] Status: ${result.status}`));
            }
            break;
        }
      }

      if (hadError) {
        process.exitCode = 1;
      } else if (!options.quiet) {
        console.log(pc.bold(pc.green(`\n✔ ${eventsToTest.length} ${t.allSuccess}\n`)));
      }
    });
}
