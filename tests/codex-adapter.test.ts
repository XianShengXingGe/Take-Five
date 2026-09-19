import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CodexAdapter,
  translateCodexEvent,
  checkCodexTurnStatus,
  waitForCodexTurnCompletion,
  suppressSqliteWarning,
} from '../src/adapters/codex-adapter.js';

describe('CodexAdapter', () => {
  let tempDir: string;
  let codexDir: string;
  let configPath: string;
  let adapter: CodexAdapter;
  let mockEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-codex-test-'));
    codexDir = join(tempDir, '.codex');
    mkdirSync(codexDir, { recursive: true });
    configPath = join(codexDir, 'hooks.json');
    adapter = new CodexAdapter();
    mockEnv = {
      HOME: tempDir,
      CODEX_CONFIG_DIR: codexDir,
      TAKEFIVE_CLI_COMMAND: 'takefive',
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects Codex environment when directory exists', async () => {
    const detected = await adapter.detectEnvironment(mockEnv);
    expect(detected).toBe(true);

    const nonExistentEnv = { HOME: join(tempDir, 'does-not-exist') };
    const notDetected = await adapter.detectEnvironment(nonExistentEnv);
    expect(notDetected).toBe(false);
  });

  it('resolves correct config path from env overrides', () => {
    expect(adapter.getConfigPath(mockEnv)).toBe(configPath);

    const customPath = join(tempDir, 'custom-codex-hooks.json');
    expect(adapter.getConfigPath({ CODEX_HOOKS_PATH: customPath })).toBe(customPath);
  });

  it('injects hooks into empty / new config and detects hook status', async () => {
    const initialStatus = await adapter.getHookStatus(mockEnv);
    expect(initialStatus.detected).toBe(true);
    expect(initialStatus.installed).toBe(false);

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.alreadyInstalled).toBe(false);
    expect(installResult.hooksInjected).toEqual(['task_completed', 'waiting_permission', 'task_failed']);

    const postStatus = await adapter.getHookStatus(mockEnv);
    expect(postStatus.installed).toBe(true);
    expect(postStatus.hooks.task_completed).toContain('--event task_completed');
    expect(postStatus.hooks.waiting_permission).toContain('--event waiting_permission');
  });

  it('preserves existing user configuration and unrelated custom hooks', async () => {
    const existingConfig = {
      description: 'Custom hooks config',
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'echo custom' }] }],
      },
    };
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.backupPath).toBe(`${configPath}.takefive.bak`);
    expect(existsSync(installResult.backupPath!)).toBe(true);

    const backupContent = JSON.parse(readFileSync(installResult.backupPath!, 'utf-8'));
    expect(backupContent).toEqual(existingConfig);

    const updatedContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updatedContent.description).toBe('Custom hooks config');
    expect(updatedContent.hooks.Stop[0].hooks.some((h: { command: string }) => h.command === 'echo custom')).toBe(true);
    expect(updatedContent.hooks.Stop[0].hooks.some((h: { command: string }) => h.command.includes('takefive'))).toBe(true);
    expect(updatedContent.hooks.PermissionRequest[0].hooks.some((h: { command: string }) => h.command.includes('--event waiting_permission'))).toBe(true);
  });

  it('is completely idempotent on repeated install calls with zero drift', async () => {
    const initialConfig = { description: 'keep-me' };
    writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

    // First install
    const firstRun = await adapter.install({ env: mockEnv });
    expect(firstRun.success).toBe(true);
    expect(firstRun.alreadyInstalled).toBe(false);

    const firstContent = readFileSync(configPath, 'utf-8');

    // Second install
    const secondRun = await adapter.install({ env: mockEnv });
    expect(secondRun.success).toBe(true);
    expect(secondRun.alreadyInstalled).toBe(true);

    const secondContent = readFileSync(configPath, 'utf-8');
    expect(secondContent).toBe(firstContent);

    // Third install
    const thirdRun = await adapter.install({ env: mockEnv });
    expect(thirdRun.alreadyInstalled).toBe(true);
    expect(readFileSync(configPath, 'utf-8')).toBe(firstContent);
  });

  it('restores pre-existing configuration on uninstall via backup', async () => {
    const pristineConfig = { description: 'pristine' };
    writeFileSync(configPath, JSON.stringify(pristineConfig, null, 2));

    await adapter.install({ env: mockEnv });
    expect(existsSync(`${configPath}.takefive.bak`)).toBe(true);

    rmSync(configPath);
    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(true);
    expect(existsSync(`${configPath}.takefive.bak`)).toBe(false);

    const restoredContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(restoredContent).toEqual(pristineConfig);
  });

  it('surgically cleans hooks on uninstall when no backup file exists', async () => {
    const manualConfig = {
      description: 'manual',
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'takefive notify --agent codex --event task_completed' },
              { type: 'command', command: 'echo custom' },
            ],
          },
        ],
      },
    };
    writeFileSync(configPath, JSON.stringify(manualConfig, null, 2));

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(false);

    const finalContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(finalContent.description).toBe('manual');
    expect(finalContent.hooks.Stop[0].hooks).toEqual([{ type: 'command', command: 'echo custom' }]);
  });

  it('maps lifecycle events to unified types accurately', () => {
    expect(adapter.mapLifecycleEvent('stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('task_completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('done')).toBe('task_completed');

    expect(adapter.mapLifecycleEvent('permissionrequest')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permission_request')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('waiting_permission')).toBe('waiting_permission');

    expect(adapter.mapLifecycleEvent('waiting_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('input_required')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('task_failed')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('failed')).toBe('task_failed');

    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });

  describe('translateCodexEvent', () => {
    it('translates successful completion event to task_completed', () => {
      const event = translateCodexEvent({
        type: 'task_complete',
        status: 'success',
        project: 'backend-service',
      });

      expect(event.agent).toBe('codex');
      expect(event.type).toBe('task_completed');
      expect(event.project).toBe('backend-service');
    });

    it('translates failed completion event to task_failed with error reason', () => {
      const event = translateCodexEvent({
        type: 'complete',
        status: 'error',
        error: 'SyntaxError: Unexpected identifier',
        project: 'compiler',
      });

      expect(event.agent).toBe('codex');
      expect(event.type).toBe('task_failed');
      expect(event.reason).toBe('SyntaxError: Unexpected identifier');
      expect(event.project).toBe('compiler');
    });

    it('translates input_required event to waiting_input', () => {
      const event = translateCodexEvent({
        type: 'input_required',
        project: 'cli-tool',
      });

      expect(event.agent).toBe('codex');
      expect(event.type).toBe('waiting_input');
    });

    it('translates permission_required event to waiting_permission', () => {
      const event = translateCodexEvent({
        type: 'permission_required',
        message: 'Allow execution of git push?',
        project: 'my-repo',
      });

      expect(event.agent).toBe('codex');
      expect(event.type).toBe('waiting_permission');
      expect(event.reason).toBe('Allow execution of git push?');
    });
  });

  describe('parseHookPayload suppression and subagent filtering', () => {
    it('suppresses completion notification when agent_type is subagent or child thread', () => {
      const result1 = adapter.parseHookPayload({ agent_type: 'subagent' }, 'task_completed');
      expect(result1.shouldSkip).toBe(true);

      const result2 = adapter.parseHookPayload({ is_subagent: true }, 'task_completed');
      expect(result2.shouldSkip).toBe(true);

      const result3 = adapter.parseHookPayload({ parent_session_id: 'parent-123' }, 'task_completed');
      expect(result3.shouldSkip).toBe(true);

      const result4 = adapter.parseHookPayload({ parent_id: 'parent-456' }, 'task_completed');
      expect(result4.shouldSkip).toBe(true);
    });

    it('suppresses completion notification when session is not fully idle', () => {
      const result1 = adapter.parseHookPayload({ fully_idle: false }, 'task_completed');
      expect(result1.shouldSkip).toBe(true);

      const result2 = adapter.parseHookPayload({ fullyIdle: false }, 'task_completed');
      expect(result2.shouldSkip).toBe(true);
    });

    it('suppresses completion notification when stop reason is intermediate tool use or continue is true', () => {
      const result1 = adapter.parseHookPayload({ stop_reason: 'tool_use' }, 'task_completed');
      expect(result1.shouldSkip).toBe(true);

      const result2 = adapter.parseHookPayload({ stopReason: 'tool_call' }, 'task_completed');
      expect(result2.shouldSkip).toBe(true);

      const result3 = adapter.parseHookPayload({ continue: true }, 'task_completed');
      expect(result3.shouldSkip).toBe(true);
    });

    it('allows completion notification for genuine top-level turn completion', () => {
      const result = adapter.parseHookPayload({
        cwd: '/Users/gd/my-project',
        stop_reason: 'end_turn',
      }, 'task_completed');

      expect(result.shouldSkip).toBe(false);
      expect(result.eventType).toBe('task_completed');
      expect(result.projectCwd).toBe('/Users/gd/my-project');
    });
  });

  describe('config.toml notify management', () => {
    it('injects notify into config.toml and chains existing notify command', async () => {
      const tomlPath = join(codexDir, 'config.toml');
      const originalToml = `notify = [ "/Users/gd/SkyClient", "turn-ended" ]\nmodel = "gpt-5.6"\n`;
      writeFileSync(tomlPath, originalToml, 'utf-8');

      const installResult = await adapter.install({ env: mockEnv });
      expect(installResult.success).toBe(true);

      const updatedToml = readFileSync(tomlPath, 'utf-8');
      expect(updatedToml).toContain('notify = [');
      expect(updatedToml).toContain('takefive');
      expect(updatedToml).toContain('--chain');
      expect(updatedToml).toContain('/Users/gd/SkyClient');
      expect(updatedToml).toContain('turn-ended');
      expect(updatedToml).toContain('model = "gpt-5.6"');

      // Status should detect installation
      const status = await adapter.getHookStatus(mockEnv);
      expect(status.installed).toBe(true);

      // Uninstall should restore original config.toml
      const uninstallResult = await adapter.uninstall({ env: mockEnv });
      expect(uninstallResult.success).toBe(true);

      const restoredToml = readFileSync(tomlPath, 'utf-8');
      expect(restoredToml).toBe(originalToml);
    });
  });

  describe('checkCodexTurnStatus SQLite phase detection', () => {
    it('returns inProgress when latest agentMessage has phase commentary', () => {
      suppressSqliteWarning();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = join(codexDir, 'thread_history_1.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE thread_turns (thread_id TEXT, turn_id TEXT, status TEXT, started_at INT);
        CREATE TABLE thread_items (thread_id TEXT, turn_id TEXT, rollout_ordinal INT, item_type TEXT, item_json TEXT);
        INSERT INTO thread_turns VALUES ('t1', 'turn1', 'inProgress', 100);
        INSERT INTO thread_items VALUES ('t1', 'turn1', 1, 'agentMessage', '{"type":"agentMessage","phase":"commentary","text":"Running tools..."}');
      `);
      db.close();

      const status = checkCodexTurnStatus(codexDir, 't1', 'turn1');
      expect(status).toBe('inProgress');
    });

    it('returns completed when latest agentMessage has phase final_answer even if turn is inProgress in thread_turns', () => {
      suppressSqliteWarning();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = join(codexDir, 'thread_history_1.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE thread_turns (thread_id TEXT, turn_id TEXT, status TEXT, started_at INT);
        CREATE TABLE thread_items (thread_id TEXT, turn_id TEXT, rollout_ordinal INT, item_type TEXT, item_json TEXT);
        INSERT INTO thread_turns VALUES ('t1', 'turn1', 'inProgress', 100);
        INSERT INTO thread_items VALUES ('t1', 'turn1', 1, 'agentMessage', '{"type":"agentMessage","phase":"commentary","text":"Step 1"}');
        INSERT INTO thread_items VALUES ('t1', 'turn1', 2, 'agentMessage', '{"type":"agentMessage","phase":"final_answer","text":"All tasks complete!"}');
      `);
      db.close();

      const status = checkCodexTurnStatus(codexDir, 't1', 'turn1');
      expect(status).toBe('completed');
    });
  });

  describe('waitForCodexTurnCompletion async polling & single SQLite handle reuse', () => {
    it('polls asynchronously and resolves when final_answer arrives during polling', async () => {
      suppressSqliteWarning();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = join(codexDir, 'thread_history_1.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE thread_turns (thread_id TEXT, turn_id TEXT, status TEXT, started_at INT);
        CREATE TABLE thread_items (thread_id TEXT, turn_id TEXT, rollout_ordinal INT, item_type TEXT, item_json TEXT);
        INSERT INTO thread_turns VALUES ('t-async', 'turn-async', 'inProgress', 100);
      `);
      db.close();

      // Schedule background update after 60ms
      setTimeout(() => {
        const updateDb = new DatabaseSync(dbPath);
        updateDb.exec(`
          INSERT INTO thread_items VALUES ('t-async', 'turn-async', 2, 'agentMessage', '{"type":"agentMessage","phase":"final_answer","text":"Completed in background!"}');
        `);
        updateDb.close();
      }, 60);

      const result = await waitForCodexTurnCompletion(codexDir, 't-async', 'turn-async', 500, 30);
      expect(result.status).toBe('completed');
      expect(result.phase).toBe('final_answer');
      expect(result.agentMessageText).toBe('Completed in background!');
    });

    it('returns immediately without looping when turn is already completed', async () => {
      suppressSqliteWarning();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = join(codexDir, 'thread_history_1.sqlite');
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_turns (thread_id TEXT, turn_id TEXT, status TEXT, started_at INT);
        CREATE TABLE IF NOT EXISTS thread_items (thread_id TEXT, turn_id TEXT, rollout_ordinal INT, item_type TEXT, item_json TEXT);
        INSERT INTO thread_turns VALUES ('t-done', 'turn-done', 'completed', 200);
      `);
      db.close();

      const start = Date.now();
      const result = await waitForCodexTurnCompletion(codexDir, 't-done', 'turn-done', 500, 50);
      const elapsed = Date.now() - start;

      expect(result.status).toBe('completed');
      expect(elapsed).toBeLessThan(50); // Immediate resolution
    });

    it('suppressSqliteWarning prevents ExperimentalWarning for SQLite', () => {
      let warningEmitted = false;
      const originalWarning = process.emitWarning;
      try {
        suppressSqliteWarning();
        process.emitWarning('SQLite is an experimental feature and might change at any time');
      } finally {
        process.emitWarning = originalWarning;
      }
      expect(warningEmitted).toBe(false);
    });
  });
});
