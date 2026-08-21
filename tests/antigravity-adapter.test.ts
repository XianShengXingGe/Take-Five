import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AntigravityAdapter,
  translateAntigravityEvent,
  handleAntigravityHookPayload,
} from '../src/adapters/antigravity-adapter.js';

describe('AntigravityAdapter', () => {
  let tempDir: string;
  let geminiDir: string;
  let configDir: string;
  let hooksPath: string;
  let adapter: AntigravityAdapter;
  let mockEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-antigravity-test-'));
    geminiDir = join(tempDir, '.gemini');
    configDir = join(geminiDir, 'config');
    mkdirSync(configDir, { recursive: true });
    hooksPath = join(configDir, 'hooks.json');
    adapter = new AntigravityAdapter();
    mockEnv = {
      HOME: tempDir,
      GEMINI_HOME: geminiDir,
      ANTIGRAVITY_CONFIG_DIR: geminiDir,
      ANTIGRAVITY_HOOKS_PATH: hooksPath,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects Antigravity environment when directory exists', async () => {
    const detected = await adapter.detectEnvironment(mockEnv);
    expect(detected).toBe(true);

    const nonExistentEnv = { HOME: join(tempDir, 'does-not-exist') };
    const notDetected = await adapter.detectEnvironment(nonExistentEnv);
    expect(notDetected).toBe(false);
  });

  it('resolves correct config path from env overrides', () => {
    expect(adapter.getConfigPath(mockEnv)).toBe(hooksPath);

    const customPath = join(tempDir, 'custom-hooks.json');
    expect(adapter.getConfigPath({ ANTIGRAVITY_HOOKS_PATH: customPath })).toBe(customPath);
  });

  it('injects hooks into empty / new config and detects hook status', async () => {
    const initialStatus = await adapter.getHookStatus(mockEnv);
    expect(initialStatus.detected).toBe(true);
    expect(initialStatus.installed).toBe(false);

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.alreadyInstalled).toBe(false);
    expect(installResult.hooksInjected).toHaveLength(4);

    const postStatus = await adapter.getHookStatus(mockEnv);
    expect(postStatus.installed).toBe(true);
    expect(postStatus.hooks.task_completed).toBe('takefive notify --agent antigravity --event task_completed');
    expect(postStatus.hooks.waiting_input).toBe('takefive notify --agent antigravity --event waiting_input');
    expect(postStatus.hooks.waiting_permission).toBe('takefive notify --agent antigravity --event waiting_permission');
    expect(postStatus.hooks.task_failed).toBe('takefive notify --agent antigravity --event task_failed');
  });

  it('preserves existing user configuration and unrelated custom hooks', async () => {
    const existingHooks = {
      'lint-checker': {
        PostToolUse: [
          {
            matcher: 'run_command',
            hooks: [{ type: 'command', command: './scripts/lint.sh' }],
          },
        ],
      },
    };
    writeFileSync(hooksPath, JSON.stringify(existingHooks, null, 2));

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.backupPath).toBe(`${hooksPath}.takefive.bak`);
    expect(existsSync(installResult.backupPath!)).toBe(true);

    const backupContent = JSON.parse(readFileSync(installResult.backupPath!, 'utf-8'));
    expect(backupContent).toEqual(existingHooks);

    const updatedContent = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    expect(updatedContent['lint-checker']).toBeDefined();
    expect(updatedContent.takefive).toBeDefined();
    expect(updatedContent.takefive.enabled).toBe(true);
    expect(updatedContent.takefive.Stop[0].command).toContain('takefive notify --agent antigravity');
  });

  it('is completely idempotent on repeated install calls with zero drift', async () => {
    const initialConfig = { userCustom: { enabled: true } };
    writeFileSync(hooksPath, JSON.stringify(initialConfig, null, 2));

    // First install
    const firstRun = await adapter.install({ env: mockEnv });
    expect(firstRun.success).toBe(true);
    expect(firstRun.alreadyInstalled).toBe(false);

    const firstContent = readFileSync(hooksPath, 'utf-8');

    // Second install
    const secondRun = await adapter.install({ env: mockEnv });
    expect(secondRun.success).toBe(true);
    expect(secondRun.alreadyInstalled).toBe(true);

    const secondContent = readFileSync(hooksPath, 'utf-8');
    expect(secondContent).toBe(firstContent);

    // Third install
    const thirdRun = await adapter.install({ env: mockEnv });
    expect(thirdRun.alreadyInstalled).toBe(true);
    expect(readFileSync(hooksPath, 'utf-8')).toBe(firstContent);
  });

  it('restores pre-existing configuration on uninstall via backup', async () => {
    const pristineConfig = { customHook: { enabled: true } };
    writeFileSync(hooksPath, JSON.stringify(pristineConfig, null, 2));

    await adapter.install({ env: mockEnv });
    expect(existsSync(`${hooksPath}.takefive.bak`)).toBe(true);

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(true);
    expect(existsSync(`${hooksPath}.takefive.bak`)).toBe(false);

    const restoredContent = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    expect(restoredContent).toEqual(pristineConfig);
  });

  it('surgically cleans hooks on uninstall when no backup file exists', async () => {
    const manualConfig = {
      otherPlugin: { enabled: true },
      takefive: { enabled: true },
    };
    writeFileSync(hooksPath, JSON.stringify(manualConfig, null, 2));

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(false);

    const finalContent = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    expect(finalContent.otherPlugin).toEqual({ enabled: true });
    expect(finalContent.takefive).toBeUndefined();
  });

  it('maps lifecycle events to unified types accurately', () => {
    expect(adapter.mapLifecycleEvent('stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('model_stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('done')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('postinvocation')).toBe('task_completed');

    expect(adapter.mapLifecycleEvent('ask_question')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('waiting_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('prompt')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('user_input')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('permission_request')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('waiting_permission')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('tool_permission')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('approval_required')).toBe('waiting_permission');

    expect(adapter.mapLifecycleEvent('error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('task_failed')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('exception')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('failure')).toBe('task_failed');

    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });

  describe('translateAntigravityEvent', () => {
    it('translates normal Stop event with model_stop to task_completed', () => {
      const event = translateAntigravityEvent({
        terminationReason: 'model_stop',
        workspacePaths: ['/Users/developer/projects/core-engine'],
      });

      expect(event.agent).toBe('antigravity');
      expect(event.type).toBe('task_completed');
      expect(event.project).toBe('core-engine');
    });

    it('translates Stop event with error to task_failed with error reason', () => {
      const event = translateAntigravityEvent({
        terminationReason: 'error',
        error: 'Out of memory during graph compilation',
        workspacePaths: ['/Users/developer/projects/graph-service'],
      });

      expect(event.agent).toBe('antigravity');
      expect(event.type).toBe('task_failed');
      expect(event.reason).toBe('Out of memory during graph compilation');
      expect(event.project).toBe('graph-service');
    });

    it('translates PreToolUse for ask_question to waiting_input', () => {
      const event = translateAntigravityEvent({
        toolCall: {
          name: 'ask_question',
          args: {
            questions: [{ question: 'Select preferred database' }],
          },
        },
        workspacePaths: ['/Users/developer/projects/webapp'],
      });

      expect(event.agent).toBe('antigravity');
      expect(event.type).toBe('waiting_input');
      expect(event.reason).toBe('Select preferred database');
      expect(event.project).toBe('webapp');
    });

    it('translates tool confirmation request to waiting_permission', () => {
      const event = translateAntigravityEvent({
        toolCall: {
          name: 'run_command',
          args: {
            CommandLine: 'rm -rf /tmp/build',
          },
        },
        terminationReason: 'permission_request',
        workspacePaths: ['/Users/developer/projects/build-tool'],
      });

      expect(event.agent).toBe('antigravity');
      expect(event.type).toBe('waiting_permission');
      expect(event.reason).toBe('rm -rf /tmp/build');
      expect(event.project).toBe('build-tool');
    });
  });

  describe('handleAntigravityHookPayload', () => {
    it('translates payload, dispatches notification, and returns valid stdout JSON', async () => {
      const dispatchedEvents = [];
      const mockDispatcher = {
        dispatch: async (event) => {
          dispatchedEvents.push(event);
          return { status: 'dispatched' };
        },
      };

      const response = await handleAntigravityHookPayload(
        {
          terminationReason: 'model_stop',
          workspacePaths: ['/Users/developer/projects/test-app'],
        },
        mockDispatcher,
      );

      expect(response).toEqual({});
      expect(dispatchedEvents).toHaveLength(1);
      expect(dispatchedEvents[0].agent).toBe('antigravity');
      expect(dispatchedEvents[0].type).toBe('task_completed');
      expect(dispatchedEvents[0].project).toBe('test-app');
    });
  });
});
