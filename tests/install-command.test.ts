import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
        if (opts.message.includes('language')) {
          return responses.language ?? 'zh-CN';
        }
        if (opts.message.includes('fail') || opts.message.includes('connectivity') || opts.message.includes('error') || opts.message.includes('Bark')) {
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
    });

    await cli.parseAsync(['node', 'takefive', 'install']);

    // 1. Assert credential saved to Keychain
    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/VALID_BARK_KEY/');

    // 2. Assert test push sent to Bark
    expect(mockBark.getRequestCount()).toBe(1);
    const payload = mockBark.getLastPayload();
    expect(payload?.title).toContain('Take Five');

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
      failureChoice: 'force_save',
      language: 'system',
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

    // Stored despite push failure because user chose force-save
    const storedUrl = await mockCreds.getBarkUrl();
    expect(storedUrl).toBe('https://api.day.app/INVALID_KEY/');
    expect(existsSync(configPath)).toBe(true);
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

  it('cancels gracefully if user aborts prompt', async () => {
    const cancelSymbol = Symbol('clack:cancel');
    const { driver } = createMockPromptDriver({
      barkUrl: cancelSymbol,
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

    // Should NOT save credentials or config
    expect(await mockCreds.getBarkUrl()).toBeNull();
    expect(existsSync(configPath)).toBe(false);
  });
});
