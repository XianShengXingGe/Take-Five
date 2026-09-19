import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';

describe('OpenCodeAdapter', () => {
  let tempDir: string;
  let openCodeDir: string;
  let pluginPath: string;
  let adapter: OpenCodeAdapter;
  let mockEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-opencode-test-'));
    openCodeDir = join(tempDir, '.config', 'opencode');
    mkdirSync(openCodeDir, { recursive: true });
    pluginPath = join(openCodeDir, 'plugins', 'takefive.js');
    adapter = new OpenCodeAdapter();
    mockEnv = {
      HOME: tempDir,
      OPENCODE_CONFIG_DIR: openCodeDir,
      TAKEFIVE_CLI_COMMAND: 'takefive',
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
    expect(adapter.getConfigPath(mockEnv)).toBe(pluginPath);

    const customPath = join(tempDir, 'custom-opencode-plugin.js');
    expect(adapter.getConfigPath({ OPENCODE_PLUGIN_PATH: customPath })).toBe(customPath);
  });

  it('injects hooks into empty config and detects status', async () => {
    const initialStatus = await adapter.getHookStatus(mockEnv);
    expect(initialStatus.detected).toBe(true);
    expect(initialStatus.installed).toBe(false);

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.alreadyInstalled).toBe(false);
    expect(installResult.hooksInjected).toEqual([
      'task_completed',
      'waiting_input',
      'waiting_permission',
      'task_failed',
    ]);

    const postStatus = await adapter.getHookStatus(mockEnv);
    expect(postStatus.installed).toBe(true);
    expect(postStatus.hooks.task_completed).toBe('OpenCode plugin: task_completed');
    expect(postStatus.hooks.waiting_input).toBe('OpenCode plugin: waiting_input');
    expect(postStatus.hooks.waiting_permission).toBe('OpenCode plugin: waiting_permission');
    expect(postStatus.hooks.task_failed).toBe('OpenCode plugin: task_failed');
  });

  it('creates backup when existing plugin is overwritten', async () => {
    mkdirSync(join(openCodeDir, 'plugins'), { recursive: true });
    writeFileSync(pluginPath, '// original custom plugin');

    const installResult = await adapter.install({ env: mockEnv });
    expect(installResult.success).toBe(true);
    expect(installResult.backupPath).toBe(`${pluginPath}.takefive.bak`);
    expect(existsSync(installResult.backupPath!)).toBe(true);

    const backupContent = readFileSync(installResult.backupPath!, 'utf-8');
    expect(backupContent).toBe('// original custom plugin');

    const updatedContent = readFileSync(pluginPath, 'utf-8');
    expect(updatedContent).toContain('TakeFivePlugin');
  });

  it('is completely idempotent on repeated install calls', async () => {
    const firstRun = await adapter.install({ env: mockEnv });
    expect(firstRun.success).toBe(true);
    expect(firstRun.alreadyInstalled).toBe(false);

    const firstContent = readFileSync(pluginPath, 'utf-8');

    const secondRun = await adapter.install({ env: mockEnv });
    expect(secondRun.success).toBe(true);
    expect(secondRun.alreadyInstalled).toBe(true);

    const secondContent = readFileSync(pluginPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
  });

  it('restores configuration from backup on uninstall', async () => {
    mkdirSync(join(openCodeDir, 'plugins'), { recursive: true });
    writeFileSync(pluginPath, '// original plugin');

    await adapter.install({ env: mockEnv });
    expect(existsSync(`${pluginPath}.takefive.bak`)).toBe(true);

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(true);
    expect(existsSync(`${pluginPath}.takefive.bak`)).toBe(false);

    const restoredContent = readFileSync(pluginPath, 'utf-8');
    expect(restoredContent).toBe('// original plugin');
  });

  it('removes plugin file on uninstall when no backup exists', async () => {
    await adapter.install({ env: mockEnv });
    expect(existsSync(pluginPath)).toBe(true);

    const uninstallResult = await adapter.uninstall({ env: mockEnv });
    expect(uninstallResult.success).toBe(true);
    expect(uninstallResult.restoredFromBackup).toBe(false);
    expect(existsSync(pluginPath)).toBe(false);
  });

  it('maps OpenCode lifecycle triggers to unified types', () => {
    expect(adapter.mapLifecycleEvent('session.idle')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('task_completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('question.asked')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('question.v2.asked')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('waiting_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('permission.asked')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permission.v2.asked')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permission.ask')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('waiting_permission')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('session.error')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('task_failed')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });

  it('generates a valid ESM plugin that executes in standard Node.js runtime and dispatches notifications', async () => {
    await adapter.install({ env: mockEnv });
    const fileUrl = new URL(`file://${pluginPath}`).href;
    const pluginModule = await import(fileUrl);

    // Verify exports
    expect(typeof pluginModule.TakeFivePlugin).toBe('function');
    expect(typeof pluginModule.default).toBe('function');

    // Verify execution in Node.js environment without Bun
    const pluginInstance = await (pluginModule.default || pluginModule.TakeFivePlugin)({ directory: tempDir });
    expect(typeof pluginInstance.event).toBe('function');
    expect(typeof pluginInstance['permission.ask']).toBe('function');

    // Test calling the event handlers without throwing
    await pluginInstance.event({ event: { type: 'session.idle' } });
    await pluginInstance.event({
      event: {
        type: 'question.asked',
        properties: { questions: [{ question: 'Should we proceed?' }] },
      },
    });
    await pluginInstance.event({
      event: {
        type: 'question.v2.asked',
        properties: { question: 'Confirm?' },
      },
    });
    await pluginInstance.event({ event: { type: 'permission.asked', properties: { permission: 'bash' } } });
    await pluginInstance.event({ event: { type: 'permission.v2.asked', properties: { action: 'file_edit' } } });
    await pluginInstance['permission.ask']({ permission: 'network' });
    await pluginInstance.event({ event: { type: 'session.error', properties: { error: { message: 'test error' } } } });
  });

  it('uses cross-platform path delimiter in the generated plugin', async () => {
    await adapter.install({ env: mockEnv });
    const source = readFileSync(pluginPath, 'utf-8');
    expect(source).toContain('import { delimiter } from "node:path"');
    expect(source).toContain('delimiter');
  });
});


