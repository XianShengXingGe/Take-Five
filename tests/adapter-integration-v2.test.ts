import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';
import { CodexAdapter } from '../src/adapters/codex-adapter.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { AntigravityAdapter } from '../src/adapters/antigravity-adapter.js';

describe('official adapter integrations on macOS and Windows paths', () => {
  let home: string;
  const cliCommand = 'takefive-test';

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'takefive-adapters-v2-'));
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('installs Claude Code matcher-group hooks into settings.json', async () => {
    const claudeDir = join(home, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const path = join(claudeDir, 'settings.json');
    writeFileSync(path, JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }));

    const adapter = new ClaudeAdapter();
    const env = { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand };
    expect(adapter.getConfigPath(env)).toBe(path);
    const result = await adapter.install({ env });
    expect(result.success).toBe(true);

    const config = JSON.parse(readFileSync(path, 'utf-8'));
    expect(config.theme).toBe('dark');
    expect(config.hooks.Stop[0].hooks.some((hook: { command: string }) => hook.command === 'echo mine')).toBe(true);
    expect(JSON.stringify(config.hooks)).toContain('PermissionRequest');
    expect(JSON.stringify(config.hooks)).toContain('StopFailure');
    expect(JSON.stringify(config.hooks)).toContain('--hook --quiet');
    expect(config.hooks.Stop[0].hooks.at(-1).async).toBe(true);

    config.afterInstall = 'must survive uninstall';
    writeFileSync(path, JSON.stringify(config));
    await adapter.uninstall({ env });
    const cleaned = JSON.parse(readFileSync(path, 'utf-8'));
    expect(cleaned.afterInstall).toBe('must survive uninstall');
    expect(JSON.stringify(cleaned)).not.toContain('takefive-test');
    expect(JSON.stringify(cleaned)).toContain('echo mine');
  });

  it('refuses to overwrite malformed third-party JSON configuration', async () => {
    const claudeDir = join(home, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const path = join(claudeDir, 'settings.json');
    writeFileSync(path, '{ user config is currently broken');
    const result = await new ClaudeAdapter().install({
      env: { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand },
    });
    expect(result.success).toBe(false);
    expect(readFileSync(path, 'utf-8')).toBe('{ user config is currently broken');
  });

  it('recovers the user backup if an injected config disappears before uninstall', async () => {
    const claudeDir = join(home, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const path = join(claudeDir, 'settings.json');
    writeFileSync(path, JSON.stringify({ theme: 'keep' }));
    const adapter = new ClaudeAdapter();
    const env = { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand };
    await adapter.install({ env });
    rmSync(path);
    const result = await adapter.uninstall({ env });
    expect(result.restoredFromBackup).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ theme: 'keep' });
    expect(existsSync(`${path}.takefive.bak`)).toBe(false);
  });

  it('installs Codex hooks into hooks.json and config.toml', async () => {
    const codexDir = join(home, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const adapter = new CodexAdapter();
    const env = { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand };
    expect(adapter.getConfigPath(env)).toBe(join(codexDir, 'hooks.json'));
    const result = await adapter.install({ env });
    expect(result.hooksInjected).toEqual(['task_completed', 'waiting_permission', 'task_failed']);
    const hooks = JSON.parse(readFileSync(join(codexDir, 'hooks.json'), 'utf-8'));
    expect(hooks.hooks.Stop[0].hooks[0].command).toContain('--event task_completed');
    expect(hooks.hooks.PermissionRequest[0].hooks[0].command).toContain('--event waiting_permission');
    expect(hooks.hooks.Interrupt[0].hooks[0].command).toContain('--event task_failed');
    const tomlContent = readFileSync(join(codexDir, 'config.toml'), 'utf-8');
    expect(tomlContent).toContain('task_completed');
    expect(existsSync(join(codexDir, 'config.json'))).toBe(false);
  });

  it('installs an OpenCode global plugin that covers idle, permission, and error events', async () => {
    const configDir = join(home, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    const adapter = new OpenCodeAdapter();
    const env = { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand };
    const result = await adapter.install({ env });
    expect(result.hooksInjected).toEqual([
      'task_completed',
      'waiting_input',
      'waiting_permission',
      'task_failed',
    ]);
    const source = readFileSync(join(configDir, 'plugins', 'takefive.js'), 'utf-8');
    expect(source).toContain('session.idle');
    expect(source).toContain('question.asked');
    expect(source).toContain('permission.asked');
    expect(source).toContain('session.error');
    expect(source).toContain('takefive-test');
  });

  it('installs a named Antigravity hook with protocol-safe completion, input, permission, and failure handling', async () => {
    const geminiDir = join(home, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    const adapter = new AntigravityAdapter();
    const env = { HOME: home, TAKEFIVE_CLI_COMMAND: cliCommand };
    const result = await adapter.install({ env });
    expect(result.hooksInjected).toEqual(['task_completed', 'waiting_input', 'waiting_permission', 'task_failed']);
    const config = JSON.parse(readFileSync(join(geminiDir, 'config', 'hooks.json'), 'utf-8'));
    expect(config.takefive.enabled).toBe(true);
    expect(config.takefive.Stop[0].command).toContain('--hook');
    expect(config.takefive.PreToolUse.map((group: { matcher: string }) => group.matcher)).toEqual([
      'ask_question',
      'ask_permission',
    ]);

    delete config.takefive.Stop;
    writeFileSync(join(geminiDir, 'config', 'hooks.json'), JSON.stringify(config));
    const repaired = await adapter.install({ env });
    expect(repaired.alreadyInstalled).toBe(false);
    expect(JSON.parse(readFileSync(join(geminiDir, 'config', 'hooks.json'), 'utf-8')).takefive.Stop).toBeDefined();
  });
});
