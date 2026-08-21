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
      textQueue: ['Custom Build Complete'],
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
    expect(saved.events.task_completed.title).toBe('Custom Build Complete');
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
});
