import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';

describe('OpenCodeAdapter', () => {
  let tempDir: string;
  let openCodeDir: string;
  let configPath: string;
  let adapter: OpenCodeAdapter;
  let mockEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-opencode-test-'));
    openCodeDir = join(tempDir, '.opencode');
    mkdirSync(openCodeDir, { recursive: true });
    configPath = join(openCodeDir, 'config.json');
    adapter = new OpenCodeAdapter();
    mockEnv = {
      HOME: tempDir,
      OPENCODE_CONFIG_DIR: openCodeDir,
    };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects OpenCode environment when directory exists', async () => {
    const detected = await adapter.detectEnvironment(mockEnv);
    expect(detected).toBe(true);

    const nonExistentEnv = { HOME: join(tempDir, 'does-not-exist') };
    const notDetected = await adapter.detectEnvironment(nonExistentEnv);
    expect(notDetected).toBe(false);
  });

  it('resolves correct config path from env overrides', () => {
    expect(adapter.getConfigPath(mockEnv)).toBe(configPath);

    const customPath = join(tempDir, 'custom-opencode-config.json');
    expect(adapter.getConfigPath({ OPENCODE_CONFIG_PATH: customPath })).toBe(customPath);
  });

  it('injects hooks into empty config and detects status', async () => {
    const initialStatus = await adapter.getHookStatus(mockEnv);
    expect(initialStatus.detected).toBe(true);
    expect(initialStatus.installed).toBe(false);

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.alreadyInstalled).toBe(false);
    expect(installResult.hooksInjected).toHaveLength(4);

    const postStatus = await adapter.getHookStatus(mockEnv);
    expect(postStatus.installed).toBe(true);
    expect(postStatus.hooks.task_completed).toBe('takefive notify --agent opencode --event task_completed');
    expect(postStatus.hooks.waiting_input).toBe('takefive notify --agent opencode --event waiting_input');
    expect(postStatus.hooks.waiting_permission).toBe('takefive notify --agent opencode --event waiting_permission');
    expect(postStatus.hooks.task_failed).toBe('takefive notify --agent opencode --event task_failed');
  });

  it('preserves existing user configuration and custom hooks', async () => {
    const existingConfig = {
      theme: 'github-dark',
      hooks: {
        existingHook: 'echo 1',
      },
    };
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.backupPath).toBe(`${configPath}.takefive.bak`);
    expect(existsSync(installResult.backupPath!)).toBe(true);

    const updatedContent = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updatedContent.theme).toBe('github-dark');
    expect(updatedContent.hooks.existingHook).toBe('echo 1');
    expect(updatedContent.hooks.task_completed).toBe('takefive notify --agent opencode --event task_completed');
  });

  it('chains hooks non-destructively when user already has an identically named hook key', async () => {
    const existingConfig = {
      hooks: {
        task_completed: 'opencode-cleanup.sh',
      },
    };
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);

    const updated = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updated.hooks.task_completed).toBe(
      'opencode-cleanup.sh && takefive notify --agent opencode --event task_completed',
    );

    // Surgical uninstall should restore the original script
    rmSync(`${configPath}.takefive.bak`, { force: true });
    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);

    const uninstalled = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(uninstalled.hooks.task_completed).toBe('opencode-cleanup.sh');
  });

  it('is completely idempotent on repeated install calls', async () => {
    const initialConfig = { userSetting: 'preserve-me' };
    writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

    const firstRun = await adapter.install({ env: mockEnv });
    expect(firstRun.success).toBe(true);
    expect(firstRun.alreadyInstalled).toBe(false);

    const firstContent = readFileSync(configPath, 'utf-8');

    const secondRun = await adapter.install({ env: mockEnv });
    expect(secondRun.success).toBe(true);
    expect(secondRun.alreadyInstalled).toBe(true);

    const secondContent = readFileSync(configPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
  });

  it('restores configuration from backup on uninstall', async () => {
    const pristineConfig = { original: true };
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

  it('maps OpenCode lifecycle triggers to unified types', () => {
    expect(adapter.mapLifecycleEvent('task_completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('session_end')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('prompt_user')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('tool_permission')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('task_error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });
});
