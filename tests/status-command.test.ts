import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { maskBarkUrl, type StatusReport } from '../src/cli/commands/status.js';
import { MockCredentialStore, createMockConfig } from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';

describe('CLI takefive status', () => {
  let tempDir: string;
  let configPath: string;
  let homeDir: string;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-status-cmd-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
    mockCreds = new MockCredentialStore(null);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('masks Bark URL correctly without exposing full token', () => {
    expect(maskBarkUrl(null)).toContain('Not configured');
    expect(maskBarkUrl('https://api.day.app/SECRET_BARK_KEY_12345/')).toBe('https://api.day.app/SEC***345/');
    expect(maskBarkUrl('short')).toBe('***');
    expect(maskBarkUrl('some_random_key_value')).toBe('some***alue');
  });

  it('outputs JSON format when --json flag is passed', async () => {
    await mockCreds.setBarkUrl('https://api.day.app/TEST_KEY/');
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(
      createMockConfig({
        language: 'en',
        debounceSeconds: 5,
      }),
    );

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
    });

    let output = '';
    const originalLog = console.log;
    console.log = (msg: unknown) => {
      output += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'status', '--json']);
    } finally {
      console.log = originalLog;
    }

    const parsed: StatusReport = JSON.parse(output);
    expect(parsed.bark.configured).toBe(true);
    expect(parsed.bark.endpoint).toBe('https://api.day.app/TEST_KEY/');
    expect(parsed.config.language).toBe('en');
    expect(parsed.config.debounceSeconds).toBe(5);
    expect(parsed.agents.claude).toBeDefined();
    expect(parsed.agents.opencode).toBeDefined();
    expect(parsed.agents.codex).toBeDefined();
    expect(parsed.agents.antigravity).toBeDefined();
  });

  it('outputs human-readable formatted status text', async () => {
    const configManager = new ConfigManager({ configPath });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
    });

    let output = '';
    const originalLog = console.log;
    console.log = (msg: unknown) => {
      output += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'status']);
    } finally {
      console.log = originalLog;
    }

    expect(output).toContain('Take Five');
    expect(output).toContain('Bark Push Service');
    expect(output).toContain('Coding Agent Integrations');
    expect(output).toContain('Claude Code');
    expect(output).toContain('Configuration & Notification Rules');
  });
});
