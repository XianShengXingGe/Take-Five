import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter, cleanNotifyArray, extractChainedNotify, parseTomlNotify, suppressSqliteWarning } from '../src/adapters/codex-adapter.js';
import { NotificationDispatcher } from '../src/core/notification-dispatcher.js';
import { Debouncer } from '../src/core/debouncer.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { TemplateEngine } from '../src/core/template-engine.js';
import { BarkClient } from '../src/core/bark-client.js';
import { MockBarkDispatcher, MockCredentialStore } from '../src/testing/index.js';

describe('Codex Dual-Channel & SQLite Phase Gating (Ticket 01)', () => {
  let tempDir: string;
  let codexDir: string;
  let mockEnv: Record<string, string>;
  let adapter: CodexAdapter;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;
  let debouncer: Debouncer;
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-codex-dual-'));
    codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });

    mockEnv = {
      HOME: tempDir,
      CODEX_HOME: codexDir,
      TAKEFIVE_CLI_COMMAND: 'takefive',
    };

    adapter = new CodexAdapter();
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/TEST_KEY/');
    debouncer = new Debouncer({
      cachePath: join(tempDir, 'cache.json'),
      debounceSeconds: 2,
      fingerprintWindowSeconds: 60,
    });

    const configManager = new ConfigManager({
      configPath: join(tempDir, 'config.json'),
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    dispatcher = new NotificationDispatcher({
      configManager,
      debouncer,
      barkClient,
      credentialStore: mockCreds,
      templateEngine: new TemplateEngine(),
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function initSqliteDb(statements: string[] = []) {
    suppressSqliteWarning();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = join(codexDir, 'thread_history_1.sqlite');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS thread_turns (
        thread_id TEXT,
        turn_id TEXT,
        rollout_ordinal INT,
        status TEXT,
        started_at INT,
        completed_at INT
      );
      CREATE TABLE IF NOT EXISTS thread_items (
        thread_id TEXT,
        turn_id TEXT,
        item_id TEXT,
        rollout_ordinal INT,
        created_at_ms INT,
        item_json TEXT,
        item_type TEXT
      );
    `);
    for (const sql of statements) {
      db.exec(sql);
    }
    db.close();
  }

  it('1. dual-channel installation injects Stop into hooks.json AND config.toml notify', async () => {
    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);

    // Channel A: hooks.json must contain Stop hook for task_completed
    const hooksJsonPath = adapter.getConfigPath(mockEnv);
    const hooksJson = JSON.parse(readFileSync(hooksJsonPath, 'utf-8'));
    expect(hooksJson.hooks?.Stop).toBeDefined();
    expect(hooksJson.hooks.Stop[0].hooks[0].command).toContain('--event task_completed');
    expect(hooksJson.hooks.PermissionRequest[0].hooks[0].command).toContain('--event waiting_permission');
    expect(hooksJson.hooks.Interrupt[0].hooks[0].command).toContain('--event task_failed');

    // Channel B: config.toml must contain notify array with takefive
    const tomlPath = adapter.getConfigTomlPath(mockEnv);
    const tomlContent = readFileSync(tomlPath, 'utf-8');
    expect(tomlContent).toContain('notify = [');
    expect(tomlContent).toContain('takefive');
    expect(tomlContent).toContain('task_completed');

    // getHookStatus reports installed = true
    const status = await adapter.getHookStatus(mockEnv);
    expect(status.installed).toBe(true);
    expect(status.hooks.task_completed).toBeDefined();
  });

  it('2. intermediate commentary phase suppresses Bark notification (silent during tool execution)', async () => {
    initSqliteDb([
      `INSERT INTO thread_turns VALUES ('thread-abc', 'turn-001', 1, 'inProgress', 1000, NULL);`,
      `INSERT INTO thread_items VALUES (
        'thread-abc',
        'turn-001',
        'item-1',
        1,
        1000,
        '{"type":"agentMessage","phase":"commentary","text":"Inspecting directory layout..."}',
        'agentMessage'
      );`,
    ]);

    const stopPayload = JSON.stringify({
      hook_event_name: 'Stop',
      threadId: 'thread-abc',
      turnId: 'turn-001',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const result = await dispatcher.dispatchFromHook(
      stopPayload,
      {
        agent: 'codex',
        type: 'task_completed',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );

    expect(result.status).toBe('skipped');
    expect(mockBark.getRequestCount()).toBe(0);
  });

  it('3. final_answer phase allows Bark push and automatically uses assistant message as reason', async () => {
    initSqliteDb([
      `INSERT INTO thread_turns VALUES ('thread-abc', 'turn-001', 1, 'inProgress', 1000, NULL);`,
      `INSERT INTO thread_items VALUES (
        'thread-abc',
        'turn-001',
        'item-1',
        1,
        1000,
        '{"type":"agentMessage","phase":"commentary","text":"Running tests..."}',
        'agentMessage'
      );`,
      `INSERT INTO thread_items VALUES (
        'thread-abc',
        'turn-001',
        'item-2',
        2,
        2000,
        '{"type":"agentMessage","phase":"final_answer","text":"Refactoring complete. 24 tests passed!"}',
        'agentMessage'
      );`,
    ]);

    const stopPayload = JSON.stringify({
      hook_event_name: 'Stop',
      threadId: 'thread-abc',
      turnId: 'turn-001',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const result = await dispatcher.dispatchFromHook(
      stopPayload,
      {
        agent: 'codex',
        type: 'task_completed',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );

    expect(result.status).toBe('dispatched');
    expect(mockBark.getRequestCount()).toBe(1);
    expect(mockBark.getLastPayload()?.body).toContain('Refactoring complete. 24 tests passed!');
  });

  it('4. automatically resolves latest turn and agentMessage when threadId is omitted', async () => {
    initSqliteDb([
      `INSERT INTO thread_turns VALUES ('thread-latest', 'turn-latest', 1, 'completed', 5000, 5100);`,
      `INSERT INTO thread_items VALUES (
        'thread-latest',
        'turn-latest',
        'item-final',
        1,
        5050,
        '{"type":"agentMessage","phase":"final_answer","text":"Ticket 01 resolved successfully."}',
        'agentMessage'
      );`,
    ]);

    // Omit threadId and turnId in payload
    const stopPayload = JSON.stringify({
      hook_event_name: 'Stop',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const result = await dispatcher.dispatchFromHook(
      stopPayload,
      {
        agent: 'codex',
        type: 'task_completed',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );

    expect(result.status).toBe('dispatched');
    expect(mockBark.getRequestCount()).toBe(1);
    expect(mockBark.getLastPayload()?.body).toContain('Ticket 01 resolved successfully.');
  });

  it('5. dual channels (hooks.json Stop and config.toml notify) deduplicate via 60s fingerprint pool', async () => {
    initSqliteDb([
      `INSERT INTO thread_turns VALUES ('thread-dup', 'turn-dup', 1, 'completed', 1000, 2000);`,
      `INSERT INTO thread_items VALUES (
        'thread-dup',
        'turn-dup',
        'item-done',
        1,
        1500,
        '{"type":"agentMessage","phase":"final_answer","text":"Deployment ready."}',
        'agentMessage'
      );`,
    ]);

    // Channel A: hooks.json Stop hook arrives first
    const hookPayload = JSON.stringify({
      hook_event_name: 'Stop',
      threadId: 'thread-dup',
      turnId: 'turn-dup',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const resA = await dispatcher.dispatchFromHook(
      hookPayload,
      {
        agent: 'codex',
        type: 'task_completed',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );
    expect(resA.status).toBe('dispatched');
    expect(mockBark.getRequestCount()).toBe(1);

    // Channel B: config.toml notify triggers 100ms later with same threadId and turnId
    const tomlNotifyPayload = JSON.stringify({
      type: 'agent-turn-complete',
      threadId: 'thread-dup',
      turnId: 'turn-dup',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const resB = await dispatcher.dispatchFromHook(
      tomlNotifyPayload,
      {
        agent: 'codex',
        type: 'task_completed',
        action: 'agent-turn-complete',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );

    // Channel B must be debounced via fingerprint pool!
    expect(resB.status).toBe('debounced');
    expect(mockBark.getRequestCount()).toBe(1); // Still exactly 1 push!
  });

  it('6. dispatches task_failed on Interrupt or turn error without suppression', async () => {
    initSqliteDb([
      `INSERT INTO thread_turns VALUES ('thread-err', 'turn-err', 1, 'failed', 1000, 1500);`,
    ]);

    const interruptPayload = JSON.stringify({
      hook_event_name: 'Interrupt',
      threadId: 'thread-err',
      turnId: 'turn-err',
      reason: 'User canceled execution',
      cwd: '/workspace/project',
      env: mockEnv,
    });

    const result = await dispatcher.dispatchFromHook(
      interruptPayload,
      {
        agent: 'codex',
        type: 'task_failed',
        reason: 'User canceled execution',
        cwd: '/workspace/project',
        env: mockEnv,
      },
    );

    expect(result.status).toBe('dispatched');
    expect(mockBark.getRequestCount()).toBe(1);
    expect(mockBark.getLastPayload()?.body).toContain('User canceled execution');
  });

  it('7. cleans circular --previous-notify dead loops from SkyComputerUseClient', () => {
    // Malformed array created by SkyComputerUseClient and previous Take Five installations
    const circularArray = [
      '/Users/sky/SkyClient',
      'turn-ended',
      '--previous-notify',
      'takefive',
      'notify',
      '--agent',
      'codex',
      '--event',
      'task_completed',
      '--hook',
      '--quiet',
      '--chain',
      '/Users/sky/SkyClient',
      'turn-ended',
      '--previous-notify',
    ];

    const cleaned = cleanNotifyArray(circularArray);
    expect(cleaned).toEqual(['/Users/sky/SkyClient', 'turn-ended']);

    // Trailing dangling --previous-notify is also cleaned
    const trailingDangling = ['/bin/my-tool', '--flag', '--previous-notify'];
    expect(cleanNotifyArray(trailingDangling)).toEqual(['/bin/my-tool', '--flag']);

    // extractChainedNotify extracts clean target binary without circular takefive reference
    const extracted = extractChainedNotify(circularArray);
    expect(extracted).toEqual(['/Users/sky/SkyClient', 'turn-ended']);
  });
});
