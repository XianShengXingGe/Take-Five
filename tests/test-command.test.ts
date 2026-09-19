import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import {
  MockBarkDispatcher,
  MockCredentialStore,
  createMockConfig,
} from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { NotificationDispatcher } from '../src/core/notification-dispatcher.js';
import { BarkClient } from '../src/core/bark-client.js';
import { Debouncer } from '../src/core/debouncer.js';
import { TemplateEngine } from '../src/core/template-engine.js';

describe('CLI takefive test', () => {
  let tempDir: string;
  let configPath: string;
  let cachePath: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-test-cmd-'));
    configPath = join(tempDir, 'config.json');
    cachePath = join(tempDir, 'cache.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/TEST_KEY/');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestCli() {
    const configManager = new ConfigManager({ configPath });
    const debouncer = new Debouncer({ cachePath, debounceSeconds: 2 });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const templateEngine = new TemplateEngine();

    const dispatcher = new NotificationDispatcher({
      configManager,
      debouncer,
      barkClient,
      credentialStore: mockCreds,
      templateEngine,
    });

    const cli = createCli({ dispatcher, configManager });
    return { cli, configManager, mockBark, mockCreds, dispatcher };
  }

  it('dispatches single test event when --event is specified', async () => {
    const { cli, configManager, mockBark } = createTestCli();
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    await cli.parseAsync([
      'node',
      'takefive',
      'test',
      '--event',
      'task_completed',
      '--project',
      'MyProject',
    ]);

    expect(mockBark.getRequestCount()).toBe(1);
    const lastPayload = mockBark.getLastPayload();
    expect(lastPayload?.title).toBe('✅ 任务完成');
    expect(lastPayload?.subtitle).toBe('Claude Code · MyProject');
    expect(lastPayload?.group).toBe('MyProject');
  });

  it('dispatches all 4 event types sequentially when --event is omitted', async () => {
    const { cli, configManager, mockBark } = createTestCli();
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    await cli.parseAsync([
      'node',
      'takefive',
      'test',
      '--project',
      'BatteryTest',
    ]);

    expect(mockBark.getRequestCount()).toBe(4);
    const requests = mockBark.getRequests();
    const titles = requests.map((r) => r.payload.title);

    expect(titles).toContain('✅ 任务完成');
    expect(titles).toContain('⏳ 等待输入');
    expect(titles).toContain('🔐 等待授权');
    expect(titles).toContain('❌ 任务失败');
  });

  it('handles invalid event type gracefully with exit code 1', async () => {
    const { cli } = createTestCli();
    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    await cli.parseAsync([
      'node',
      'takefive',
      'test',
      '--event',
      'invalid_event_type',
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = prevExitCode;
  });

  it('handles missing credentials with error message and exit code 1', async () => {
    const { cli, mockCreds } = createTestCli();
    mockCreds.reset(null);

    const prevExitCode = process.exitCode;
    process.exitCode = 0;

    await cli.parseAsync([
      'node',
      'takefive',
      'test',
      '--event',
      'task_completed',
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = prevExitCode;
  });
});
