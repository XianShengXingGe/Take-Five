import type { Command } from 'commander';
import pc from 'picocolors';
import { createAllAdapters, getAdapter } from '../../adapters/index.js';
import type { AgentAdapter, AdapterInstallResult } from '../../types/adapter.js';
import { isSupportedAgent, type SupportedAgent } from '../../types/event.js';

export interface RepairCommandDependencies {
  adapters?: AgentAdapter[];
  env?: Record<string, string | undefined>;
}

export interface RepairOptions {
  agent?: string;
  force?: boolean;
  quiet?: boolean;
}

export interface SingleRepairResult {
  agent: SupportedAgent;
  displayName: string;
  detected: boolean;
  status: 'repaired' | 'healthy' | 'skipped' | 'failed';
  configPath: string;
  backupPath?: string;
  error?: string;
}

export interface RepairSummary {
  results: SingleRepairResult[];
  repairedCount: number;
  healthyCount: number;
  skippedCount: number;
  failedCount: number;
}

export async function runRepair(
  deps: RepairCommandDependencies,
  options: RepairOptions = {},
): Promise<RepairSummary> {
  let targetAdapters: AgentAdapter[];

  if (options.agent) {
    if (!isSupportedAgent(options.agent)) {
      throw new Error(
        `Unsupported agent "${options.agent}". Supported: claude, codex, opencode, antigravity`,
      );
    }
    const adapter = getAdapter(options.agent);
    targetAdapters = adapter ? [adapter] : [];
  } else {
    targetAdapters = deps.adapters ?? createAllAdapters();
  }

  const results: SingleRepairResult[] = [];

  for (const adapter of targetAdapters) {
    const hookStatus = await adapter.getHookStatus(deps.env);

    if (!hookStatus.detected && !hookStatus.installed && !hookStatus.backupExists) {
      results.push({
        agent: adapter.id,
        displayName: adapter.displayName,
        detected: false,
        status: 'skipped',
        configPath: hookStatus.configPath,
      });
      continue;
    }

    if (hookStatus.installed && !options.force) {
      results.push({
        agent: adapter.id,
        displayName: adapter.displayName,
        detected: hookStatus.detected,
        status: 'healthy',
        configPath: hookStatus.configPath,
        backupPath: hookStatus.backupExists ? `${hookStatus.configPath}.takefive.bak` : undefined,
      });
      continue;
    }

    // Re-inject hooks
    const installResult: AdapterInstallResult = await adapter.install({
      env: deps.env,
      force: true,
    });

    if (installResult.success) {
      results.push({
        agent: adapter.id,
        displayName: adapter.displayName,
        detected: hookStatus.detected,
        status: 'repaired',
        configPath: installResult.configPath,
        backupPath: installResult.backupPath,
      });
    } else {
      results.push({
        agent: adapter.id,
        displayName: adapter.displayName,
        detected: hookStatus.detected,
        status: 'failed',
        configPath: installResult.configPath,
        error: installResult.error,
      });
    }
  }

  const repairedCount = results.filter((r) => r.status === 'repaired').length;
  const healthyCount = results.filter((r) => r.status === 'healthy').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return {
    results,
    repairedCount,
    healthyCount,
    skippedCount,
    failedCount,
  };
}

export function registerRepairCommand(
  program: Command,
  deps: RepairCommandDependencies,
): void {
  program
    .command('repair')
    .description('Scan and automatically repair broken or missing agent notification hooks')
    .option('-a, --agent <name>', 'Specific agent to repair (claude, codex, opencode, antigravity)')
    .option('-f, --force', 'Force re-injection for all agents regardless of current state')
    .option('-q, --quiet', 'Suppress non-error output')
    .action(async (options: RepairOptions) => {
      try {
        if (!options.quiet) {
          console.log(pc.bold(pc.cyan('\n  Take Five (片刻) · Hook Repair Scanner\n')));
        }

        const summary = await runRepair(deps, options);

        if (!options.quiet) {
          for (const item of summary.results) {
            switch (item.status) {
              case 'repaired':
                console.log(
                  `  ${pc.green('✔')} ${pc.bold(item.displayName)} (${item.agent}): ${pc.green('Hooks repaired and restored')}`,
                );
                console.log(`    Config: ${pc.dim(item.configPath)}`);
                if (item.backupPath) {
                  console.log(`    Backup: ${pc.dim(item.backupPath)}`);
                }
                break;

              case 'healthy':
                console.log(
                  `  ${pc.cyan('ℹ')} ${pc.bold(item.displayName)} (${item.agent}): ${pc.cyan('Hooks already healthy (no drift detected)')}`,
                );
                console.log(`    Config: ${pc.dim(item.configPath)}`);
                break;

              case 'skipped':
                console.log(
                  `  ${pc.dim('○')} ${pc.dim(item.displayName)} (${item.agent}): ${pc.dim('Environment not found, skipped')}`,
                );
                break;

              case 'failed':
                console.error(
                  `  ${pc.red('✖')} ${pc.bold(item.displayName)} (${item.agent}): ${pc.red(`Repair failed - ${item.error}`)}`,
                );
                break;
            }
          }

          console.log('');
          if (summary.failedCount > 0) {
            console.error(
              pc.bold(
                pc.red(
                  `✖ Hook repair finished with ${summary.failedCount} error(s). (${summary.repairedCount} repaired, ${summary.healthyCount} healthy, ${summary.skippedCount} skipped)`,
                ),
              ),
            );
          } else {
            console.log(
              pc.bold(
                pc.green(
                  `✔ Hook repair completed. (${summary.repairedCount} repaired, ${summary.healthyCount} healthy, ${summary.skippedCount} skipped)`,
                ),
              ),
            );
          }
          console.log('');
        }

        if (summary.failedCount > 0) {
          process.exitCode = 1;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!options.quiet) {
          console.error(pc.red(`Error: ${msg}`));
        }
        process.exitCode = 1;
      }
    });
}
