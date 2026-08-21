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
import type { UnifiedEventType } from '../src/types/event.js';

describe('CLI takefive notify', () => {
  let tempDir: string;
  let configPath: string;
  let cachePath: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-cli-test-'));
    configPath = join(tempDir, 'config.json');
    cachePath = join(tempDir, 'cache.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/SECRET_KEY/');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestCli(configLanguage: 'zh-CN' | 'en' = 'zh-CN') {
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
    return { cli, configManager, debouncer, barkClient, dispatcher };
  }

  it('covers all 4 event types end-to-end with mock Bark HTTP server', async () => {
    const { cli, configManager } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const eventTypes: Array<{
      type: UnifiedEventType;
      expectedTitle: string;
      expectedLevel: string;
    }> = [
      { type: 'task_completed', expectedTitle: '✅ 任务完成', expectedLevel: 'active' },
      { type: 'waiting_input', expectedTitle: '⏳ 等待输入', expectedLevel: 'timeSensitive' },
      { type: 'waiting_permission', expectedTitle: '🔐 等待授权', expectedLevel: 'timeSensitive' },
      { type: 'task_failed', expectedTitle: '❌ 任务失败', expectedLevel: 'timeSensitive' },
    ];

    for (let i = 0; i < eventTypes.length; i++) {
      const item = eventTypes[i];
      // Use distinct project names to avoid 2s debounce window across sequential loop iterations
      const project = `TestProject-${i}`;
      await cli.parseAsync([
        'node',
        'takefive',
        'notify',
        '--agent',
        'claude',
        '--event',
        item.type,
        '--project',
        project,
      ]);

      const lastPayload = mockBark.getLastPayload();
      expect(lastPayload).toBeDefined();
      expect(lastPayload?.title).toBe(item.expectedTitle);
      expect(lastPayload?.subtitle).toBe(`Claude Code · ${project}`);
      expect(lastPayload?.group).toBe(project);
      expect(lastPayload?.level).toBe(item.expectedLevel);
      expect(lastPayload?.icon).toContain('claude.png');
    }

    expect(mockBark.getRequestCount()).toBe(4);
  });

  it('outputs English title and body when language is configured for en', async () => {
    const { cli, configManager } = createTestCli('en');
    await configManager.saveConfig(createMockConfig({ language: 'en' }));

    await cli.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'codex',
      '--event',
      'task_completed',
      '--project',
      'my-app',
    ]);

    const payload = mockBark.getLastPayload();
    expect(payload?.title).toBe('✅ Task Completed');
    expect(payload?.subtitle).toBe('Codex · my-app');
    expect(payload?.body).toBe('Task has finished successfully');
  });

  it('forwards custom reason to Bark payload body', async () => {
    const { cli, configManager } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    await cli.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'antigravity',
      '--event',
      'task_failed',
      '--project',
      'compiler',
      '--reason',
      'TypeScript compilation failed with 3 errors',
    ]);

    const payload = mockBark.getLastPayload();
    expect(payload?.title).toBe('❌ 任务失败');
    expect(payload?.subtitle).toBe('Antigravity · compiler');
    expect(payload?.body).toBe('TypeScript compilation failed with 3 errors');
  });

  it('cleanly debounces rapid consecutive calls (< 2s) from the same agent & project', async () => {
    const { cli, configManager } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    await cli.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'opencode',
      '--event',
      'waiting_input',
      '--project',
      'quick-flow',
    ]);
    expect(mockBark.getRequestCount()).toBe(1);

    // Immediate second call
    await cli.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'opencode',
      '--event',
      'waiting_input',
      '--project',
      'quick-flow',
    ]);
    expect(mockBark.getRequestCount()).toBe(1);
  });

  it('completes notify dispatch in less than 150ms', async () => {
    const { cli, configManager } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const start = performance.now();
    await cli.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'claude',
      '--event',
      'task_completed',
      '--project',
      'perf-test',
    ]);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(150);
  });

  it('correctly resolves project name from Antigravity workspacePaths instead of cwd config', async () => {
    const { configManager, dispatcher } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const mockPayload = JSON.stringify({
      workspacePaths: ['/Users/xreal/Workspace/MyAwesomeProject'],
      fullyIdle: true,
      terminationReason: 'model_stop',
    });

    const program = new (await import('commander')).Command();
    const { registerNotifyCommand } = await import('../src/cli/commands/notify.js');
    registerNotifyCommand(program, dispatcher, undefined, async () => mockPayload);

    await program.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'antigravity',
      '--event',
      'task_completed',
    ]);

    const payload = mockBark.getLastPayload();
    expect(payload).toBeDefined();
    expect(payload?.subtitle).toBe('Antigravity · MyAwesomeProject');
    expect(payload?.group).toBe('MyAwesomeProject');
  });

  it('suppresses task_completed notification when Antigravity fullyIdle is false', async () => {
    const { configManager, dispatcher } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const mockPayload = JSON.stringify({
      workspacePaths: ['/Users/xreal/Workspace/MyProject'],
      fullyIdle: false, // subtasks still running
      terminationReason: 'model_stop',
    });

    const program = new (await import('commander')).Command();
    const { registerNotifyCommand } = await import('../src/cli/commands/notify.js');
    registerNotifyCommand(program, dispatcher, undefined, async () => mockPayload);

    await program.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'antigravity',
      '--event',
      'task_completed',
    ]);

    // Should NOT have sent a push notification
    expect(mockBark.getRequestCount()).toBe(0);
  });

  it('translates ask_question toolCall in Antigravity hook payload to waiting_input event', async () => {
    const { configManager, dispatcher } = createTestCli('zh-CN');
    await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

    const mockPayload = JSON.stringify({
      workspacePaths: ['/Users/xreal/Workspace/CoolApp'],
      toolCall: {
        name: 'ask_question',
        args: {
          questions: [{ question: 'Do you want to proceed with migration?' }],
        },
      },
    });

    const program = new (await import('commander')).Command();
    const { registerNotifyCommand } = await import('../src/cli/commands/notify.js');
    registerNotifyCommand(program, dispatcher, undefined, async () => mockPayload);

    await program.parseAsync([
      'node',
      'takefive',
      'notify',
      '--agent',
      'antigravity',
      '--event',
      'waiting_input',
    ]);

    const payload = mockBark.getLastPayload();
    expect(payload).toBeDefined();
    expect(payload?.title).toBe('⏳ 等待输入');
    expect(payload?.subtitle).toBe('Antigravity · CoolApp');
    expect(payload?.body).toBe('Do you want to proceed with migration?');
  });
});
