import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import {
  MockBarkDispatcher,
  MockCredentialStore,
} from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { BarkClient } from '../src/core/bark-client.js';
import type { PromptDriver } from '../src/cli/commands/install.js';
import type { TakeFiveConfig } from '../src/types/config.js';

describe('CLI takefive install', () => {
  let tempDir: string;
  let configPath: string;
  let homeDir: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-install-cmd-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore(null);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockPromptDriver(responses: {
    barkUrl?: string | symbol;
    reuseChoice?: 'reuse' | 'new' | symbol;
    language?: 'system' | 'zh-CN' | 'en' | symbol;
    failureChoice?: 'retry_input' | 'retry_send' | 'force_save' | 'cancel' | symbol;
    secondBarkUrl?: string;
  }): { driver: PromptDriver; logs: string[] } {
    const logs: string[] = [];
    let passwordCallCount = 0;

    const driver: PromptDriver = {
      intro: (title) => logs.push(`intro: ${title}`),
      outro: (msg) => logs.push(`outro: ${msg}`),
      note: (msg, title) => logs.push(`note [${title}]: ${msg}`),
      cancel: (msg) => logs.push(`cancel: ${msg}`),
      isCancel: (val) => typeof val === 'symbol' || val === 'CANCELLED_SYMBOL',
      password: async () => {
        passwordCallCount++;
        if (passwordCallCount === 2 && responses.secondBarkUrl) {
          return responses.secondBarkUrl;
        }
        return responses.barkUrl ?? 'https://api.day.app/TEST_KEY/';
      },
      text: async () => responses.barkUrl ?? 'https://api.day.app/TEST_KEY/',
      select: async (opts) => {
        if (opts.options.some((o) => o.value === 'reuse')) {
          return responses.reuseChoice ?? 'reuse';
        }
        if (opts.message.includes('language') || opts.message.includes('语言')) {
          return responses.language ?? 'zh-CN';
        }
        if (opts.message.includes('fail') || opts.message.includes('connectivity') || opts.message.includes('error') || opts.message.includes('Bark') || opts.message.includes('处理')) {
          return responses.failureChoice ?? 'force_save';
        }
        return (opts.options[0]?.value as any) ?? 'force_save';
      },
      confirm: async () => true,
      spinner: () => ({
        start: (msg) => logs.push(`spinner.start: ${msg}`),
        stop: (msg) => logs.push(`spinner.stop: ${msg}`),
        message: (msg) => logs.push(`spinner.message: ${msg}`),
      }),
    };

    return { driver, logs };
  }

  it('completes full interactive installation on happy path', async () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/VALID_BARK_KEY/',
      language: 'zh-CN',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
      env: { HOME: homeDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // 1. Assert credential saved to Keychain
    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/VALID_BARK_KEY/');

    // 2. Assert test push sent to Bark
    expect(mockBark.getRequestCount()).toBe(1);
    const payload = mockBark.getLastPayload();
    expect(payload?.title).toMatch(/🎉 (片刻|Take Five)/);

    // 3. Assert config.json created with valid schema
    expect(existsSync(configPath)).toBe(true);
    const savedConfig: TakeFiveConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(savedConfig.version).toBe('1.0.0');
    expect(savedConfig.language).toBe('zh-CN');
    expect(savedConfig.events.task_completed.enabled).toBe(true);
    expect(savedConfig.enabledAgents.claude).toBe(true);
  });

  it('normalizes bare Bark device key into official URL endpoint', async () => {
    const { driver } = createMockPromptDriver({
      barkUrl: 'my_device_key_123',
      language: 'en',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/my_device_key_123');
  });

  it('handles push failure with force-save option', async () => {
    // Bark dispatcher simulates failure
    const failingFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ code: 500, message: 'Device not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/INVALID_KEY/',
      failAction: 'force_save',
      language: 'en',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: failingFetch });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // Assert force-saved despite failure
    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/INVALID_KEY/');
  });

  it('handles push failure with retry_input leading to successful dispatch', async () => {
    let callCount = 0;
    const retryFetch: typeof fetch = async (url) => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ code: 404, message: 'Key error' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ code: 200, message: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/BAD_KEY/',
      secondBarkUrl: 'https://api.day.app/GOOD_KEY/',
      failureChoice: 'retry_input',
      language: 'zh-CN',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: retryFetch });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/GOOD_KEY/');
    expect(existsSync(configPath)).toBe(true);
  });

  it('aborts installation cleanly when prompt is cancelled', async () => {
    const { driver } = createMockPromptDriver({
      barkUrl: Symbol('clack:cancel'),
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // Verify nothing was persisted
    expect(existsSync(configPath)).toBe(false);
    expect(await mockCreds.getBarkUrl()).toBeNull();
  });

  it('injects notification hooks into detected agent configs during install', async () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    mkdirSync(join(homeDir, '.gemini'), { recursive: true });

    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/VALID_BARK_KEY/',
      language: 'zh-CN',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
      env: { HOME: homeDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // Assert that agent config files were created with injected hooks
    const claudeConfigPath = join(homeDir, '.claude', 'settings.json');
    expect(existsSync(claudeConfigPath)).toBe(true);
    const claudeConfig = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'));
    expect(JSON.stringify(claudeConfig.hooks)).toContain('notify --agent claude');

    const antigravityConfigPath = join(homeDir, '.gemini', 'config', 'hooks.json');
    expect(existsSync(antigravityConfigPath)).toBe(true);
    const antigravityConfig = JSON.parse(readFileSync(antigravityConfigPath, 'utf-8'));
    expect(antigravityConfig.takefive.enabled).toBe(true);
  });

  it('reuses existing Bark URL from credential store on user confirmation', async () => {
    await mockCreds.setBarkUrl('https://api.day.app/EXISTING_BARK_KEY/');

    const { driver } = createMockPromptDriver({
      reuseChoice: 'reuse',
      language: 'zh-CN',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // 1. Assert push was sent to the existing Bark URL
    expect(mockBark.getRequestCount()).toBe(1);
    expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/EXISTING_BARK_KEY/');

    // 2. Assert config was saved
    expect(existsSync(configPath)).toBe(true);
  });

  it('allows entering a new Bark URL when reconfiguring even when one is already configured in store', async () => {
    await mockCreds.setBarkUrl('https://api.day.app/OLD_KEY/');

    const { driver } = createMockPromptDriver({
      reuseChoice: 'new',
      barkUrl: 'https://api.day.app/NEW_OVERRIDE_KEY/',
      language: 'en',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install', '--reconfigure']);

    expect(mockBark.getRequestCount()).toBe(1);
    expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/NEW_OVERRIDE_KEY/');
  });

  it('preserves and merges existing config during reinstall/overwrite', async () => {
    mkdirSync(join(homeDir, '.takefive'), { recursive: true });
    mkdirSync(join(homeDir, '.claude'), { recursive: true });

    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig({
      version: '1.0.0',
      language: 'en',
      debounceSeconds: 8,
      icons: { claude: 'custom-icon.png', codex: 'custom-codex.png', opencode: 'custom-opencode.png', antigravity: 'custom-anti.png' },
      events: {
        task_completed: { enabled: false, level: 'passive', title: 'Finished' },
        waiting_input: { enabled: true, level: 'critical' },
        waiting_permission: { enabled: true, level: 'timeSensitive' },
        task_failed: { enabled: true, level: 'critical' },
      },
      enabledAgents: {
        claude: false,
        codex: true,
        opencode: false,
        antigravity: false,
      },
    });

    await mockCreds.setBarkUrl('https://api.day.app/EXISTING_KEY/');

    const { driver } = createMockPromptDriver({
      reuseChoice: 'reuse',
      language: 'en',
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    const savedConfig = await configManager.loadConfig();
    expect(savedConfig.language).toBe('en');
    expect(savedConfig.debounceSeconds).toBe(8);
    expect(savedConfig.icons.claude).toBe('custom-icon.png');
    expect(savedConfig.events.task_completed.enabled).toBe(false);
    expect(savedConfig.events.task_completed.level).toBe('passive');
    expect(savedConfig.events.task_completed.title).toBe('Finished');
    expect(savedConfig.enabledAgents.claude).toBe(false); // Preserved user's previous preference
  });

  it('strictly isolates branding in Chinese environment using pure "片刻"', async () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/ZH_KEY/',
      language: 'zh-CN',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
      env: { HOME: homeDir, LANG: 'zh_CN.UTF-8', TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    const payload = mockBark.getLastPayload();
    expect(payload?.title).toBe('🎉 片刻');
    expect(payload?.body).toBe('片刻已成功连接到您的设备！');
    expect(payload?.group).toBe('片刻');
    expect(payload?.subtitle).toBe('Bark 连通性测试');
  });

  it('strictly isolates branding in English environment using pure "Take Five"', async () => {
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    const { driver } = createMockPromptDriver({
      barkUrl: 'https://api.day.app/EN_KEY/',
      language: 'en',
    });

    const configManager = new ConfigManager({ configPath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: driver,
      agentDetectorOptions: { homedir: homeDir },
      env: { HOME: homeDir, LANG: 'en_US.UTF-8', TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    const payload = mockBark.getLastPayload();
    expect(payload?.title).toBe('🎉 Take Five');
    expect(payload?.body).toBe('Take Five is now connected to your device! Notifications are ready.');
    expect(payload?.group).toBe('Take-Five');
    expect(payload?.subtitle).toBe('Bark Setup Verification');
  });
});
