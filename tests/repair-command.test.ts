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
    // 1. Setup Claude environment with broken/missing hooks in config.json
    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const claudeConfigPath = join(claudeDir, 'config.json');
    writeFileSync(
      claudeConfigPath,
      JSON.stringify({ customSetting: true, hooks: {} }, null, 2),
      'utf-8',
    );

    // 2. Setup OpenCode environment with partial hooks
    const opencodeDir = join(homeDir, '.opencode');
    mkdirSync(opencodeDir, { recursive: true });
    const opencodeConfigPath = join(opencodeDir, 'config.json');
    writeFileSync(
      opencodeConfigPath,
      JSON.stringify(
        {
          hooks: {
            task_completed: 'takefive notify --agent opencode --event task_completed',
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const adapters = [
      new ClaudeAdapter(),
      new OpenCodeAdapter(),
      new CodexAdapter(),
      new AntigravityAdapter(),
    ];

    const summary = await runRepair({ adapters, env });

    // Claude and OpenCode should be repaired, Codex and Antigravity skipped
    expect(summary.repairedCount).toBe(2);
    expect(summary.skippedCount).toBe(2);
    expect(summary.failedCount).toBe(0);

    // Verify Claude config has all hooks and preserved customSetting
    const updatedClaude = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    expect(updatedClaude.customSetting).toBe(true);
    expect(updatedClaude.hooks.task_completed).toContain('takefive notify');
    expect(updatedClaude.hooks.waiting_input).toContain('takefive notify');
    expect(updatedClaude.hooks.waiting_permission).toContain('takefive notify');
    expect(updatedClaude.hooks.task_failed).toContain('takefive notify');
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
    writeFileSync(join(claudeDir, 'config.json'), '{}', 'utf-8');

    const cli = createCli({
      env,
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
});
