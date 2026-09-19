import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { formatStatusBarkUrl, gatherStatusReport, type StatusReport } from '../src/cli/commands/status.js';
import { maskBarkUrl } from '../src/core/bark-client.js';
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
    expect(formatStatusBarkUrl(null)).toContain('Not configured');
    expect(formatStatusBarkUrl('https://api.day.app/SECRET_BARK_KEY_12345/')).toBe('https://api.day.app/SEC***345/');
    expect(maskBarkUrl('short')).toBe('***');
    expect(maskBarkUrl('https://api.day.app/SECRET_BARK_KEY_12345/')).toBe('https://api.day.app/SEC***345/');
  });

  it('scans all agent adapters concurrently via Promise.all with lower latency', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig());

    const createDelayedAdapter = (id: any, delayMs: number) => ({
      id,
      displayName: `Mock ${id}`,
      detectEnvironment: async () => true,
      getConfigPath: () => `/mock/${id}`,
      getHookStatus: async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return {
          detected: true,
          installed: false,
          configPath: `/mock/${id}`,
          backupExists: false,
          hooks: {},
        };
      },
      install: async () => ({ agent: id, success: true, configPath: '', hooksInjected: [] }),
      uninstall: async () => ({ agent: id, success: true, configPath: '', restoredFromBackup: false, hooksRemoved: [] }),
      mapLifecycleEvent: () => null,
      generateNotifyCommand: () => '',
    });

    const mockAdapters = [
      createDelayedAdapter('claude', 50),
      createDelayedAdapter('codex', 50),
      createDelayedAdapter('opencode', 50),
      createDelayedAdapter('antigravity', 50),
    ];

    const start = Date.now();
    const report = await gatherStatusReport({
      configManager,
      credentialStore: mockCreds,
      adapters: mockAdapters as any,
    });
    const elapsed = Date.now() - start;

    expect(report.agents.claude.detected).toBe(true);
    expect(report.agents.codex.detected).toBe(true);
    expect(report.agents.opencode.detected).toBe(true);
    expect(report.agents.antigravity.detected).toBe(true);
    // If sequential: 4 * 50 = 200ms. If concurrent with Promise.all: ~50-80ms (< 150ms)
    expect(elapsed).toBeLessThan(160);
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

  it('outputs human-readable formatted status text in English when configured', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(
      createMockConfig({
        language: 'en',
      }),
    );
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      env: { LANG: 'en_US.UTF-8' },
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

    expect(output).toContain('Take Five · System Status');
    expect(output).toContain('Bark Push Service');
    expect(output).toContain('Status:  ');
    expect(output).toContain('Coding Agent Integrations');
    expect(output).toContain('Claude Code');
    expect(output).toContain('Configuration & Notification Rules');
  });

  it('outputs human-readable formatted status text in Simplified Chinese when configured', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(
      createMockConfig({
        language: 'zh-CN',
      }),
    );
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      env: { LANG: 'zh_CN.UTF-8' },
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

    expect(output).toContain('片刻 · 系统状态');
    expect(output).toContain('Bark 推送服务');
    expect(output).toContain('状态:    ');
    expect(output).toContain('编码智能体集成');
    expect(output).toContain('Claude Code');
    expect(output).toContain('配置与通知规则');
    expect(output).toContain('未配置');
  });
});
