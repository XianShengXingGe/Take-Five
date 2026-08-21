import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter, translateCodexEvent } from '../src/adapters/codex-adapter.js';

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
    configPath = join(codexDir, 'config.json');
    adapter = new CodexAdapter();
    mockEnv = {
      HOME: tempDir,
      CODEX_CONFIG_DIR: codexDir,
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

    const customPath = join(tempDir, 'custom-codex-config.json');
    expect(adapter.getConfigPath({ CODEX_CONFIG_PATH: customPath })).toBe(customPath);
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
    expect(postStatus.hooks.task_completed).toBe('takefive notify --agent codex --event task_completed');
    expect(postStatus.hooks.waiting_input).toBe('takefive notify --agent codex --event waiting_input');
    expect(postStatus.hooks.waiting_permission).toBe('takefive notify --agent codex --event waiting_permission');
    expect(postStatus.hooks.task_failed).toBe('takefive notify --agent codex --event task_failed');
  });

  it('preserves existing user configuration and unrelated custom hooks', async () => {
    const existingConfig = {
      model: 'o1-preview',
      telemetry: false,
      hooks: {
        custom_lint: 'npm run lint',
        onTaskCompleted: 'echo custom',
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
    expect(updatedContent.model).toBe('o1-preview');
    expect(updatedContent.telemetry).toBe(false);
    expect(updatedContent.hooks.custom_lint).toBe('npm run lint');
    expect(updatedContent.hooks.onTaskCompleted).toBe('echo custom');
    expect(updatedContent.hooks.task_completed).toBe('takefive notify --agent codex --event task_completed');
  });

  it('is completely idempotent on repeated install calls with zero drift', async () => {
    const initialConfig = { userSetting: 'keep-me' };
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
    const pristineConfig = { originalSetting: 123, hooks: { existingHook: 'true' } };
    writeFileSync(configPath, JSON.stringify(pristineConfig, null, 2));

    await adapter.install({ env: mockEnv });
    expect(existsSync(`${configPath}.takefive.bak`)).toBe(true);

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(true);
    expect(existsSync(`${configPath}.takefive.bak`)).toBe(false);

    const restoredContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(restoredContent).toEqual(pristineConfig);
  });

  it('surgically cleans hooks on uninstall when no backup file exists', async () => {
    const manualConfig = {
      userCustom: 'value',
      hooks: {
        task_completed: 'takefive notify --agent codex --event task_completed',
        user_custom_hook: 'echo custom',
      },
    };
    writeFileSync(configPath, JSON.stringify(manualConfig, null, 2));

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(false);

    const finalContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(finalContent.userCustom).toBe('value');
    expect(finalContent.hooks.task_completed).toBeUndefined();
    expect(finalContent.hooks.user_custom_hook).toBe('echo custom');
  });

  it('maps lifecycle events to unified types accurately', () => {
    expect(adapter.mapLifecycleEvent('complete')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('task_complete')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('done')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('finish')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('exit_success')).toBe('task_completed');

    expect(adapter.mapLifecycleEvent('input_required')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('prompt')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('user_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('prompt_user')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('permission_required')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('approval_required')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('tool_approval')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permission_prompt')).toBe('waiting_permission');

    expect(adapter.mapLifecycleEvent('error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('task_error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('fatal')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('exception')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('exit_error')).toBe('task_failed');

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
});
