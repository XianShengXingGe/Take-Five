import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerConfigCommand } from '../src/cli/commands/config.js';
import { ConfigManager } from '../src/core/config-manager.js';

describe('interactive all-agent switch', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

  it('enables all four agents from the management menu and persists on save', async () => {
    const root = mkdtempSync(join(tmpdir(), 'takefive-config-switch-'));
    roots.push(root);
    const configManager = new ConfigManager({ configPath: join(root, 'config.json') });
    const initial = await configManager.loadConfig();
    for (const agent of Object.keys(initial.enabledAgents)) {
      initial.enabledAgents[agent as keyof typeof initial.enabledAgents] = false;
    }
    await configManager.saveConfig(initial);

    const selections = ['agents', 'enable_all', 'back', 'save_exit'];
    const promptDriver = {
      intro: () => undefined,
      outro: () => undefined,
      note: () => undefined,
      cancel: () => undefined,
      isCancel: () => false,
      select: async () => selections.shift(),
      confirm: async () => true,
      text: async () => '',
      password: async () => '',
      spinner: () => ({ start: () => undefined, stop: () => undefined, message: () => undefined }),
    };

    const program = new Command();
    registerConfigCommand(program, {
      configManager,
      credentialStore: {} as never,
      barkClient: {} as never,
      promptDriver: promptDriver as never,
    });
    await program.parseAsync(['node', 'takefive', 'config']);

    expect(Object.values((await configManager.loadConfig()).enabledAgents).every(Boolean)).toBe(true);
  });
});
