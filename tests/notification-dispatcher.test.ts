import { describe, expect, it, beforeEach } from 'vitest';
import {
  NotificationDispatcher,
  type DispatchResult,
} from '../src/core/notification-dispatcher.js';
import {
  MockBarkDispatcher,
  MockCredentialStore,
  createMockConfig,
  createMockUnifiedEvent,
} from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { Debouncer } from '../src/core/debouncer.js';
import { BarkClient } from '../src/core/bark-client.js';
import { TemplateEngine } from '../src/core/template-engine.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('NotificationDispatcher', () => {
  let tempDir: string;
  let configPath: string;
  let cachePath: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-dispatcher-'));
    configPath = join(tempDir, 'config.json');
    cachePath = join(tempDir, 'cache.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/VALID_KEY/');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createDispatcher(configLanguage: 'zh-CN' | 'en' | 'system' = 'zh-CN') {
    const configManager = new ConfigManager({ configPath });
    const debouncer = new Debouncer({ cachePath, debounceSeconds: 2 });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const templateEngine = new TemplateEngine();

    return {
      dispatcher: new NotificationDispatcher({
        configManager,
        debouncer,
        barkClient,
        credentialStore: mockCreds,
        templateEngine,
      }),
      configManager,
    };
  }

  it('successfully dispatches a notification end-to-end in Chinese', async () => {
    const { dispatcher, configManager } = createDispatcher('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const event = createMockUnifiedEvent({
      type: 'task_completed',
      agent: 'claude',
      project: 'Take-Five',
    });

    const result = await dispatcher.dispatch(event);

    expect(result.status).toBe('dispatched');
    expect(result.payload?.title).toBe('✅ 任务完成');
    expect(result.payload?.subtitle).toBe('Claude Code · Take-Five');
    expect(result.payload?.body).toBe('恭喜！任务已完成');
    expect(result.payload?.group).toBe('Take-Five');
    expect(mockBark.getRequestCount()).toBe(1);
  });

  it('successfully dispatches a notification end-to-end in English', async () => {
    const { dispatcher, configManager } = createDispatcher('en');
    await configManager.saveConfig(createMockConfig({ language: 'en' }));

    const event = createMockUnifiedEvent({
      type: 'task_completed',
      agent: 'claude',
      project: 'Take-Five',
    });

    const result = await dispatcher.dispatch(event);

    expect(result.status).toBe('dispatched');
    expect(result.payload?.title).toBe('✅ Task Completed');
    expect(result.payload?.subtitle).toBe('Claude Code · Take-Five');
    expect(result.payload?.body).toBe('Task has finished successfully');
    expect(result.payload?.group).toBe('Take-Five');
    expect(mockBark.getRequestCount()).toBe(1);
  });

  it('skips dispatch when agent is disabled in config', async () => {
    const configManager = new ConfigManager({ configPath });
    const config = createMockConfig({
      enabledAgents: {
        ...createMockConfig().enabledAgents,
        claude: false,
      },
    });
    await configManager.saveConfig(config);

    const debouncer = new Debouncer({ cachePath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const templateEngine = new TemplateEngine();

    const dispatcher = new NotificationDispatcher({
      configManager,
      debouncer,
      barkClient,
      credentialStore: mockCreds,
      templateEngine,
    });

    const event = createMockUnifiedEvent({ agent: 'claude' });
    const result = await dispatcher.dispatch(event);

    expect(result.status).toBe('agent_disabled');
    expect(mockBark.getRequestCount()).toBe(0);
  });

  it('skips dispatch when event type is disabled in config', async () => {
    const configManager = new ConfigManager({ configPath });
    const config = createMockConfig({
      events: {
        ...createMockConfig().events,
        task_completed: { enabled: false, level: 'passive' },
      },
    });
    await configManager.saveConfig(config);

    const debouncer = new Debouncer({ cachePath });
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const templateEngine = new TemplateEngine();

    const dispatcher = new NotificationDispatcher({
      configManager,
      debouncer,
      barkClient,
      credentialStore: mockCreds,
      templateEngine,
    });

    const event = createMockUnifiedEvent({ type: 'task_completed' });
    const result = await dispatcher.dispatch(event);

    expect(result.status).toBe('event_disabled');
    expect(mockBark.getRequestCount()).toBe(0);
  });

  it('skips dispatch and returns debounced status when duplicate event arrives rapidly', async () => {
    const { dispatcher } = createDispatcher();
    const event = createMockUnifiedEvent({ agent: 'claude', project: 'Take-Five' });

    const first = await dispatcher.dispatch(event);
    expect(first.status).toBe('dispatched');

    const second = await dispatcher.dispatch(event);
    expect(second.status).toBe('debounced');
    expect(mockBark.getRequestCount()).toBe(1);
  });

  it('returns missing_credential status when Bark URL is not configured', async () => {
    mockCreds.reset(null); // Clear credentials
    const { dispatcher } = createDispatcher();
    const event = createMockUnifiedEvent();

    const result = await dispatcher.dispatch(event);

    expect(result.status).toBe('missing_credential');
    expect(mockBark.getRequestCount()).toBe(0);
  });

  it('uses explicit barkUrl override when supplied in options', async () => {
    mockCreds.reset(null);
    const { dispatcher } = createDispatcher();
    const event = createMockUnifiedEvent();

    const result = await dispatcher.dispatch(event, {
      barkUrlOverride: 'https://api.day.app/OVERRIDE_KEY/',
    });

    expect(result.status).toBe('dispatched');
    expect(mockBark.getLastRequest()?.url).toBe('https://api.day.app/OVERRIDE_KEY/');
  });
});
