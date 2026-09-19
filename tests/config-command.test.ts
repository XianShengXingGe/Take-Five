import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import {
  MockBarkDispatcher,
  MockCredentialStore,
  createMockConfig,
} from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { BarkClient } from '../src/core/bark-client.js';
import type { PromptDriver } from '../src/cli/prompt-driver.js';
import type { TakeFiveConfig } from '../src/types/config.js';

describe('CLI takefive config', () => {
  let tempDir: string;
  let configPath: string;
  let homeDir: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-config-cmd-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/INITIAL_KEY/');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createInteractivePromptDriver(actions: {
    selectQueue: unknown[];
    textQueue?: string[];
    passwordQueue?: string[];
    confirmQueue?: boolean[];
  }): { driver: PromptDriver; logs: string[] } {
    const logs: string[] = [];
    const selectQueue = [...actions.selectQueue];
    const textQueue = [...(actions.textQueue ?? [])];
    const passwordQueue = [...(actions.passwordQueue ?? [])];
    const confirmQueue = [...(actions.confirmQueue ?? [])];

    const driver: PromptDriver = {
      intro: (title) => logs.push(`intro: ${title}`),
      outro: (msg) => logs.push(`outro: ${msg}`),
      note: (msg, title) => logs.push(`note [${title}]: ${msg}`),
      cancel: (msg) => logs.push(`cancel: ${msg}`),
      isCancel: (val) => typeof val === 'symbol' || val === 'CANCELLED_SYMBOL',
      password: async () => passwordQueue.shift() ?? 'https://api.day.app/NEW_KEY/',
      text: async () => textQueue.shift() ?? '',
      select: async () => selectQueue.shift() ?? 'cancel',
      confirm: async () => confirmQueue.shift() ?? true,
      spinner: () => ({
        start: (msg) => logs.push(`spinner.start: ${msg}`),
        stop: (msg) => logs.push(`spinner.stop: ${msg}`),
        message: (msg) => logs.push(`spinner.message: ${msg}`),
      }),
    };

    return { driver, logs };
  }

  it('updates language and saves to config.json', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig({ language: 'system' }));

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['language', 'en', 'save_exit'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.language).toBe('en');
  });

  it('updates debounce cooldown seconds and saves to config.json', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig({ debounceSeconds: 2 }));

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['debounce', 'save_exit'],
      textQueue: ['5'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.debounceSeconds).toBe(5);
  });

  it('updates Bark URL with test notification verification', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig());

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['bark_url', 'save_exit'],
      passwordQueue: ['https://api.day.app/UPDATED_KEY/'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/UPDATED_KEY/');
    expect(mockBark.getRequestCount()).toBe(1);
  });

  it('updates event rules (level, custom title override)', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig());

    const { driver } = createInteractivePromptDriver({
      selectQueue: [
        'event_rules',
        'task_completed',
        'level',
        'critical',
        'title',
        'back',
        'back',
        'save_exit',
      ],
      textQueue: ['构建完成'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.events.task_completed.level).toBe('critical');
    expect(saved.events.task_completed.title).toBe('构建完成');
  });

  it('toggles agent enablement', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig());

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['agents', 'opencode', 'back', 'save_exit'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.enabledAgents.opencode).toBe(false);
  });

  it('resets configuration to factory defaults', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(
      createMockConfig({
        language: 'en',
        debounceSeconds: 10,
        enabledAgents: { claude: false, codex: false, opencode: false, antigravity: false },
      }),
    );

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['reset', 'save_exit'],
      confirmQueue: [true],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(saved.language).toBe('system');
    expect(saved.debounceSeconds).toBe(2);
    expect(saved.enabledAgents.claude).toBe(true);
  });

  it('discards unsaved changes when cancelling', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const { driver } = createInteractivePromptDriver({
      selectQueue: ['language', 'en', 'cancel'],
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
    });

    await cli.parseAsync(['node', 'takefive', 'config']);

    const saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    // Should NOT have changed to 'en'
    expect(saved.language).toBe('zh-CN');
  });

  describe('direct non-interactive options', () => {
    it('updates event rule notification level via --event and --level', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      await cli.parseAsync([
        'node',
        'takefive',
        'config',
        '--event',
        'task_completed',
        '--level',
        'timeSensitive',
        '--quiet',
      ]);

      let saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.events.task_completed.level).toBe('timeSensitive');

      await cli.parseAsync([
        'node',
        'takefive',
        'config',
        '--event',
        'waiting_permission',
        '--level',
        'active',
        '--quiet',
      ]);

      saved = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.events.waiting_permission.level).toBe('active');
    });

    it('normalizes and updates language via --language (supporting zh alias)', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig({ language: 'en' }));

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      await cli.parseAsync(['node', 'takefive', 'config', '--language', 'zh', '--quiet']);

      let saved: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.language).toBe('zh-CN');

      await cli.parseAsync(['node', 'takefive', 'config', '--language', 'system', '--quiet']);
      saved = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(saved.language).toBe('system');
    });

    it('normalizes and updates Bark URL via --bark-url <key> into credential store', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'device_key_12345', '--quiet']);

      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/device_key_12345');
    });

    it('supports -b shorthand for --bark-url', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      await cli.parseAsync(['node', 'takefive', 'config', '-b', 'shorthand_key_abc', '--quiet']);

      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/shorthand_key_abc');
    });

    it('preserves and updates self-hosted full URL via --bark-url <full-url>', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      const privateServer = 'https://bark.internal.corp:8443/push/team-key';
      await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', privateServer, '--quiet']);

      expect(await mockCreds.getBarkUrl()).toBe(privateServer);
    });

    it('suppresses stdout when --quiet flag is provided', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      try {
        await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'quiet_test_key', '--quiet']);
      } finally {
        console.log = originalLog;
      }

      expect(logs).toHaveLength(0);
      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/quiet_test_key');
    });

    it('prints success message when --quiet is not provided', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(' '));

      try {
        await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'verbose_test_key']);
      } finally {
        console.log = originalLog;
      }

      expect(logs.some((msg) => msg.includes('Configuration updated successfully'))).toBe(true);
      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/verbose_test_key');
    });

    it('rejects invalid format input with exitCode 1 and preserves existing credentials and config', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig({ language: 'en' }));
      const initialBark = await mockCreds.getBarkUrl();

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      const originalExitCode = process.exitCode;
      try {
        process.exitCode = 0;
        await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'invalid key with spaces', '--quiet']);
        expect(process.exitCode).toBe(1);
        expect(await mockCreds.getBarkUrl()).toBe(initialBark);

        process.exitCode = 0;
        await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'ftp://api.day.app/key', '--quiet']);
        expect(process.exitCode).toBe(1);
        expect(await mockCreds.getBarkUrl()).toBe(initialBark);

        process.exitCode = 0;
        await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'https://api.day.app/', '--quiet']);
        expect(process.exitCode).toBe(1);
        expect(await mockCreds.getBarkUrl()).toBe(initialBark);

        const savedConfig: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(savedConfig.language).toBe('en');
      } finally {
        process.exitCode = originalExitCode;
      }
    });

    it('updates both Bark credentials and config properties when combined', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig({ language: 'en', debounceSeconds: 2 }));

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      await cli.parseAsync([
        'node',
        'takefive',
        'config',
        '--bark-url',
        'combo_key_xyz',
        '--language',
        'zh-CN',
        '--debounce',
        '10',
        '--quiet',
      ]);

      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/combo_key_xyz');
      const savedConfig: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(savedConfig.language).toBe('zh-CN');
      expect(savedConfig.debounceSeconds).toBe(10);
    });

    it('executes direct --bark-url configuration non-interactively in under 50ms', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
      });

      const start = performance.now();
      await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'perf_test_key', '--quiet']);
      const durationMs = performance.now() - start;

      expect(durationMs).toBeLessThan(50);
      expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/perf_test_key');
    });
  });
});
