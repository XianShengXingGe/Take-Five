import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { CodexAdapter } from '../src/adapters/codex-adapter.js';
import { AntigravityAdapter } from '../src/adapters/antigravity-adapter.js';
import { runRepair } from '../src/cli/commands/repair.js';

describe('CLI takefive repair', () => {
  let tempDir: string;
  let homeDir: string;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-repair-cmd-'));
    homeDir = join(tempDir, 'home');
    mkdirSync(homeDir, { recursive: true });
    env = { HOME: homeDir, USERPROFILE: homeDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects missing hooks in existing agent configs and repairs them', async () => {
    // 1. Setup Claude environment with missing hooks in settings.json
    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const claudeConfigPath = join(claudeDir, 'settings.json');
    writeFileSync(
      claudeConfigPath,
      JSON.stringify({ customSetting: true, hooks: {} }, null, 2),
      'utf-8',
    );

    // 2. Setup OpenCode environment without takefive plugin
    const opencodeDir = join(homeDir, '.config', 'opencode');
    mkdirSync(opencodeDir, { recursive: true });

    const adapters = [
      new ClaudeAdapter(),
      new OpenCodeAdapter(),
      new CodexAdapter(),
      new AntigravityAdapter(),
    ];

    const summary = await runRepair({ adapters, env: { ...env, TAKEFIVE_CLI_COMMAND: 'takefive' } });

    // Claude and OpenCode should be repaired, Codex and Antigravity skipped
    expect(summary.repairedCount).toBe(2);
    expect(summary.skippedCount).toBe(2);
    expect(summary.failedCount).toBe(0);

    // Verify Claude config has hooks and preserved customSetting
    const updatedClaude = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    expect(updatedClaude.customSetting).toBe(true);
    expect(JSON.stringify(updatedClaude.hooks)).toContain('takefive');
  });

  it('recognizes already healthy hooks and reports healthy without mutation', async () => {
    const claudeAdapter = new ClaudeAdapter();
    await claudeAdapter.install({ env });

    const summary = await runRepair({ adapters: [claudeAdapter], env });
    expect(summary.healthyCount).toBe(1);
    expect(summary.repairedCount).toBe(0);
  });

  it('forces re-injection when force option is set', async () => {
    const claudeAdapter = new ClaudeAdapter();
    await claudeAdapter.install({ env });

    const summary = await runRepair({ adapters: [claudeAdapter], env }, { force: true });
    expect(summary.repairedCount).toBe(1);
    expect(summary.healthyCount).toBe(0);
  });

  it('repairs single targeted agent via CLI command', async () => {
    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, 'settings.json'), '{}', 'utf-8');

    const cli = createCli({
      env: { ...env, TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    let stdout = '';
    const originalLog = console.log;
    console.log = (msg: unknown) => {
      stdout += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'repair', '--agent', 'claude']);
    } finally {
      console.log = originalLog;
    }

    expect(stdout).toContain('Claude Code');
    expect(stdout).toContain('Hooks repaired');
  });

  it('handles unsupported agent name with error exit code', async () => {
    const cli = createCli({ env });

    let stderr = '';
    const originalErr = console.error;
    console.error = (msg: unknown) => {
      stderr += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'repair', '--agent', 'invalid-agent']);
    } finally {
      console.error = originalErr;
    }

    expect(stderr).toContain('Unsupported agent');
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('repairs multiple agents concurrently with Promise.all', async () => {
    const createDelayedAdapter = (id: any, delayMs: number) => ({
      id,
      displayName: `Mock ${id}`,
      detectEnvironment: async () => true,
      getConfigPath: () => join(homeDir, id),
      getHookStatus: async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return {
          detected: true,
          installed: false,
          configPath: join(homeDir, id),
          backupExists: false,
          hooks: {},
        };
      },
      install: async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return {
          agent: id,
          success: true,
          configPath: join(homeDir, id),
          hooksInjected: ['task_completed'],
        };
      },
      uninstall: async () => ({ agent: id, success: true, configPath: '', restoredFromBackup: false, hooksRemoved: [] }),
      mapLifecycleEvent: () => null,
      generateNotifyCommand: () => '',
    });

    const mockAdapters = [
      createDelayedAdapter('claude', 40),
      createDelayedAdapter('codex', 40),
      createDelayedAdapter('opencode', 40),
      createDelayedAdapter('antigravity', 40),
    ];

    const start = Date.now();
    const summary = await runRepair({
      adapters: mockAdapters as any,
      env,
    });
    const elapsed = Date.now() - start;

    expect(summary.repairedCount).toBe(4);
    expect(summary.failedCount).toBe(0);
    // If sequential: 4 * (40 + 40) = 320ms. If concurrent: ~80-120ms (< 240ms)
    expect(elapsed).toBeLessThan(240);
  });
});
