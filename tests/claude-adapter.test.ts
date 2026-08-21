import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';

describe('ClaudeAdapter', () => {
  let tempDir: string;
  let claudeDir: string;
  let configPath: string;
  let adapter: ClaudeAdapter;
  let mockEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-claude-test-'));
    claudeDir = join(tempDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    configPath = join(claudeDir, 'config.json');
    adapter = new ClaudeAdapter();
    mockEnv = {
      HOME: tempDir,
      CLAUDE_CONFIG_DIR: claudeDir,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects Claude Code environment when directory exists', async () => {
    const detected = await adapter.detectEnvironment(mockEnv);
    expect(detected).toBe(true);

    const nonExistentEnv = { HOME: join(tempDir, 'does-not-exist') };
    const notDetected = await adapter.detectEnvironment(nonExistentEnv);
    expect(notDetected).toBe(false);
  });

  it('resolves correct config path from env overrides', () => {
    expect(adapter.getConfigPath(mockEnv)).toBe(configPath);

    const customPath = join(tempDir, 'custom-claude-config.json');
    expect(adapter.getConfigPath({ CLAUDE_CONFIG_PATH: customPath })).toBe(customPath);
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
    expect(postStatus.hooks.task_completed).toBe('takefive notify --agent claude --event task_completed');
    expect(postStatus.hooks.waiting_input).toBe('takefive notify --agent claude --event waiting_input');
    expect(postStatus.hooks.waiting_permission).toBe('takefive notify --agent claude --event waiting_permission');
    expect(postStatus.hooks.task_failed).toBe('takefive notify --agent claude --event task_failed');
  });

  it('preserves existing user configuration and unrelated custom hooks', async () => {
    const existingConfig = {
      theme: 'dracula',
      autoUpdate: true,
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
    expect(updatedContent.theme).toBe('dracula');
    expect(updatedContent.autoUpdate).toBe(true);
    expect(updatedContent.hooks.custom_lint).toBe('npm run lint');
    expect(updatedContent.hooks.onTaskCompleted).toBe('echo custom');
    expect(updatedContent.hooks.task_completed).toBe('takefive notify --agent claude --event task_completed');
  });

  it('chains hooks non-destructively when user already has an identically named hook key', async () => {
    const existingConfig = {
      hooks: {
        task_completed: 'my-custom-script.sh',
      },
    };
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);

    const updated = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updated.hooks.task_completed).toBe(
      'my-custom-script.sh && takefive notify --agent claude --event task_completed',
    );

    // Surgical uninstall should restore the original script
    rmSync(`${configPath}.takefive.bak`, { force: true });
    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);

    const uninstalled = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(uninstalled.hooks.task_completed).toBe('my-custom-script.sh');
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
        task_completed: 'takefive notify --agent claude --event task_completed',
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
    expect(adapter.mapLifecycleEvent('stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('done')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('task_finish')).toBe('task_completed');

    expect(adapter.mapLifecycleEvent('prompt')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('user_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('userprompt')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('permission_request')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('approval_required')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permissionrequest')).toBe('waiting_permission');

    expect(adapter.mapLifecycleEvent('error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('fatal')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('exception')).toBe('task_failed');

    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });
});
