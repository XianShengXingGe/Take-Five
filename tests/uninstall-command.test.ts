import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { CodexAdapter } from '../src/adapters/codex-adapter.js';
import { AntigravityAdapter } from '../src/adapters/antigravity-adapter.js';
import { MockCredentialStore } from '../src/testing/index.js';
import type { PromptDriver } from '../src/cli/prompt-driver.js';

describe('CLI takefive uninstall', () => {
  let tempDir: string;
  let homeDir: string;
  let takeFiveDir: string;
  let mockCreds: MockCredentialStore;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-uninstall-cmd-'));
    homeDir = join(tempDir, 'home');
    takeFiveDir = join(homeDir, '.takefive');
    mkdirSync(takeFiveDir, { recursive: true });
    writeFileSync(join(takeFiveDir, 'config.json'), '{"test": true}', 'utf-8');
    writeFileSync(join(takeFiveDir, 'cache.json'), '{"events": {}}', 'utf-8');

    mockCreds = new MockCredentialStore('https://api.day.app/SECRET_KEY/');
    env = { HOME: homeDir, USERPROFILE: homeDir, TAKEFIVE_HOME: takeFiveDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockPromptDriver(confirmed: boolean): { driver: PromptDriver; logs: string[] } {
    const logs: string[] = [];
    const driver: PromptDriver = {
      intro: (title) => logs.push(`intro: ${title}`),
      outro: (msg) => logs.push(`outro: ${msg}`),
      note: (msg, title) => logs.push(`note [${title}]: ${msg}`),
      cancel: (msg) => logs.push(`cancel: ${msg}`),
      isCancel: (val) => typeof val === 'symbol' || val === 'CANCELLED_SYMBOL',
      password: async () => '',
      text: async () => '',
      select: async () => 'cancel',
      confirm: async () => confirmed,
      spinner: () => ({
        start: (msg) => logs.push(`spinner.start: ${msg}`),
        stop: (msg) => logs.push(`spinner.stop: ${msg}`),
        message: (msg) => logs.push(`spinner.message: ${msg}`),
      }),
    };
    return { driver, logs };
  }

  it('performs total purge when user confirms interactive prompt', async () => {
    // 1. Setup Claude with backup and modified config
    const claudeDir = join(homeDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const claudeConfigPath = join(claudeDir, 'config.json');
    const originalClaude = { originalKey: 'value123' };
    writeFileSync(claudeConfigPath, JSON.stringify(originalClaude, null, 2), 'utf-8');

    const claudeAdapter = new ClaudeAdapter();
    await claudeAdapter.install({ env });

    expect(existsSync(`${claudeConfigPath}.takefive.bak`)).toBe(true);

    const { driver } = createMockPromptDriver(true);

    const cli = createCli({
      credentialStore: mockCreds,
      promptDriver: driver,
      env,
    });

    await cli.parseAsync(['node', 'takefive', 'uninstall']);

    // 1. Assert Claude restored from backup
    expect(existsSync(`${claudeConfigPath}.takefive.bak`)).toBe(false);
    const restoredClaude = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    expect(restoredClaude.originalKey).toBe('value123');
    expect(restoredClaude.hooks).toBeUndefined();

    // 2. Assert ~/.takefive directory deleted
    expect(existsSync(takeFiveDir)).toBe(false);

    // 3. Assert credentials purged
    expect(await mockCreds.getBarkUrl()).toBeNull();
  });

  it('aborts uninstallation when user declines confirmation prompt', async () => {
    const { driver } = createMockPromptDriver(false);

    const cli = createCli({
      credentialStore: mockCreds,
      promptDriver: driver,
      env,
    });

    await cli.parseAsync(['node', 'takefive', 'uninstall']);

    // Should NOT delete ~/.takefive or credentials
    expect(existsSync(takeFiveDir)).toBe(true);
    expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/SECRET_KEY/');
  });

  it('bypasses confirmation prompt when --yes flag is provided', async () => {
    const cli = createCli({
      credentialStore: mockCreds,
      env,
    });

    await cli.parseAsync(['node', 'takefive', 'uninstall', '--yes']);

    // Assert deleted
    expect(existsSync(takeFiveDir)).toBe(false);
    expect(await mockCreds.getBarkUrl()).toBeNull();
  });
});
