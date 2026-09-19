import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from '../src/core/config-manager.js';
import { DEFAULT_CONFIG } from '../src/types/config.js';

describe('ConfigManager', () => {
  let tempDir: string;
  let configFilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-config-'));
    configFilePath = join(tempDir, 'config.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns default configuration if config file does not exist', async () => {
    const manager = new ConfigManager({ configPath: configFilePath });
    const config = await manager.loadConfig();

    expect(config.version).toBe('1.0.0');
    expect(config.language).toBe('system');
    expect(config.debounceSeconds).toBe(2);
    expect(config.events.task_completed.enabled).toBe(true);
    expect(config.enabledAgents.claude).toBe(true);
  });

  it('saves configuration and reloads persisted changes', async () => {
    const manager = new ConfigManager({ configPath: configFilePath });
    const initialConfig = await manager.loadConfig();

    const modifiedConfig = {
      ...initialConfig,
      language: 'zh-CN' as const,
      debounceSeconds: 5,
      events: {
        ...initialConfig.events,
        task_completed: {
          enabled: false,
          level: 'passive' as const,
          title: '已完工',
        },
      },
    };

    await manager.saveConfig(modifiedConfig);

    const reloaded = await manager.loadConfig();
    expect(reloaded.language).toBe('zh-CN');
    expect(reloaded.debounceSeconds).toBe(5);
    expect(reloaded.events.task_completed.enabled).toBe(false);
    expect(reloaded.events.task_completed.title).toBe('已完工');
    expect(reloaded.enabledAgents.claude).toBe(true);
  });

  it('merges partial config with defaults when fields are missing', async () => {
    // Write partial JSON to file
    writeFileSync(
      configFilePath,
      JSON.stringify({
        language: 'en',
      }),
      'utf-8',
    );

    const manager = new ConfigManager({ configPath: configFilePath });
    const config = await manager.loadConfig();

    expect(config.language).toBe('en');
    expect(config.debounceSeconds).toBe(2);
    expect(config.events.task_completed.enabled).toBe(true);
    expect(config.icons.claude).toBe(DEFAULT_CONFIG.icons.claude);
  });

  it('recovers with default configuration if config file is corrupted JSON', async () => {
    writeFileSync(configFilePath, '{ corrupted...', 'utf-8');

    const manager = new ConfigManager({ configPath: configFilePath });
    const config = await manager.loadConfig();

    expect(config.version).toBe('1.0.0');
    expect(config.language).toBe('system');
  });
});
