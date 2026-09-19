import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from '../src/core/config-manager.js';
import { setAgentEnabledState } from '../src/cli/commands/agents.js';

describe('fast agent switches', () => {
  let root: string;
  let manager: ConfigManager;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'takefive-switch-'));
    manager = new ConfigManager({ configPath: join(root, 'config.json') });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('enables and disables one agent without changing the other three', async () => {
    await setAgentEnabledState(manager, ['codex'], false);
    let config = await manager.loadConfig();
    expect(config.enabledAgents).toEqual({ claude: true, codex: false, opencode: true, antigravity: true });

    await setAgentEnabledState(manager, ['codex'], true);
    config = await manager.loadConfig();
    expect(config.enabledAgents.codex).toBe(true);
  });

  it('supports one command to disable or enable all four agents', async () => {
    await setAgentEnabledState(manager, 'all', false);
    expect(Object.values((await manager.loadConfig()).enabledAgents).every((value) => value === false)).toBe(true);
    await setAgentEnabledState(manager, 'all', true);
    expect(Object.values((await manager.loadConfig()).enabledAgents).every((value) => value === true)).toBe(true);
  });

  it('rejects unsupported agent names without saving a partial change', async () => {
    await expect(setAgentEnabledState(manager, ['codex', 'cursor'], false)).rejects.toThrow('cursor');
    expect(Object.values((await manager.loadConfig()).enabledAgents).every((value) => value === true)).toBe(true);
  });
});
