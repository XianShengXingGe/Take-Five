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
    configPath = join(claudeDir, 'settings.json');
    adapter = new ClaudeAdapter();
    mockEnv = {
      HOME: tempDir,
      CLAUDE_CONFIG_DIR: claudeDir,
      TAKEFIVE_CLI_COMMAND: 'takefive',
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
    expect(postStatus.hooks.task_completed).toContain('--event task_completed');
    expect(postStatus.hooks.waiting_input).toContain('--event waiting_input');
    expect(postStatus.hooks.waiting_permission).toContain('--event waiting_permission');
    expect(postStatus.hooks.task_failed).toContain('--event task_failed');
  });

  it('preserves existing user configuration and unrelated custom hooks', async () => {
    const existingConfig = {
      theme: 'dracula',
      autoUpdate: true,
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
    expect(updatedContent.theme).toBe('dracula');
    expect(updatedContent.autoUpdate).toBe(true);
    expect(updatedContent.hooks.Stop[0].hooks.some((h: { command: string }) => h.command === 'echo custom')).toBe(true);
    expect(updatedContent.hooks.Stop[0].hooks.some((h: { command: string }) => h.command.includes('--event task_completed'))).toBe(true);
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
    const pristineConfig = { originalSetting: 123 };
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
      userCustom: 'value',
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: 'takefive notify --agent claude --event task_completed' },
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
    expect(finalContent.userCustom).toBe('value');
    expect(finalContent.hooks.Stop[0].hooks).toEqual([{ type: 'command', command: 'echo custom' }]);
  });

  it('maps lifecycle events to unified types accurately', () => {
    expect(adapter.mapLifecycleEvent('stop')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('task_completed')).toBe('task_completed');
    expect(adapter.mapLifecycleEvent('completed')).toBe('task_completed');

    expect(adapter.mapLifecycleEvent('agent_needs_input')).toBe('waiting_input');
    expect(adapter.mapLifecycleEvent('waiting_input')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('permission_request')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('permissionrequest')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('waiting_permission')).toBe('waiting_permission');

    expect(adapter.mapLifecycleEvent('stopfailure')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('stop_failure')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('task_failed')).toBe('task_failed');
    expect(adapter.mapLifecycleEvent('error')).toBe('task_failed');

    expect(adapter.mapLifecycleEvent('toolconfirmation')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('tool_confirmation')).toBe('waiting_permission');
    expect(adapter.mapLifecycleEvent('notification')).toBe('waiting_input');

    expect(adapter.mapLifecycleEvent('unknown_event')).toBeNull();
  });

  describe('Claude Desktop MCP Integration', () => {
    let desktopDir: string;
    let desktopConfigPath: string;

    beforeEach(() => {
      desktopDir = join(tempDir, 'Library', 'Application Support', 'Claude');
      mkdirSync(desktopDir, { recursive: true });
      desktopConfigPath = join(desktopDir, 'claude_desktop_config.json');
    });

    it('resolves correct Claude Desktop config path across platforms and env overrides', () => {
      const macPath = adapter.getClaudeDesktopConfigPath({ HOME: tempDir });
      expect(macPath).toBe(desktopConfigPath);

      const winPath = adapter.getClaudeDesktopConfigPath({
        USERPROFILE: tempDir,
        APPDATA: join(tempDir, 'AppData', 'Roaming'),
      });
      expect(winPath).toBe(join(tempDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'));

      const customPath = join(tempDir, 'custom-desktop.json');
      expect(adapter.getClaudeDesktopConfigPath({ CLAUDE_DESKTOP_CONFIG_PATH: customPath })).toBe(customPath);
    });

    it('detects Claude Desktop environment when directory or config exists', async () => {
      const detected = await adapter.detectClaudeDesktop({ HOME: tempDir });
      expect(detected).toBe(true);

      const notDetected = await adapter.detectClaudeDesktop({
        HOME: join(tempDir, 'empty-home'),
      });
      expect(notDetected).toBe(false);
    });

    it('safely performs incremental injection into claude_desktop_config.json preserving existing MCP servers', async () => {
      const existingConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        },
        preferences: {
          theme: 'dark',
        },
      };
      writeFileSync(desktopConfigPath, JSON.stringify(existingConfig, null, 2));

      const installResult = await adapter.installClaudeDesktop({
        env: { HOME: tempDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
      });

      expect(installResult.success).toBe(true);
      expect(installResult.backupPath).toBe(`${desktopConfigPath}.takefive.bak`);
      expect(existsSync(installResult.backupPath!)).toBe(true);

      const updated = JSON.parse(readFileSync(desktopConfigPath, 'utf-8'));
      expect(updated.preferences).toEqual({ theme: 'dark' });
      expect(updated.mcpServers.filesystem).toBeDefined();
      expect(updated.mcpServers.takefive).toBeDefined();
      expect(updated.mcpServers.takefive.command).toBe('takefive');
      expect(updated.mcpServers.takefive.args).toEqual(['mcp']);
    });

    it('is idempotent on repeated installClaudeDesktop calls', async () => {
      const firstResult = await adapter.installClaudeDesktop({
        env: { HOME: tempDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
      });
      expect(firstResult.success).toBe(true);
      expect(firstResult.alreadyInstalled).toBe(false);

      const contentAfterFirst = readFileSync(desktopConfigPath, 'utf-8');

      const secondResult = await adapter.installClaudeDesktop({
        env: { HOME: tempDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
      });
      expect(secondResult.success).toBe(true);
      expect(secondResult.alreadyInstalled).toBe(true);
      expect(readFileSync(desktopConfigPath, 'utf-8')).toBe(contentAfterFirst);
    });

    it('uninstalls Take Five MCP from claude_desktop_config.json preserving other tools', async () => {
      const existingConfig = {
        mcpServers: {
          github: { command: 'github-mcp', args: [] },
          takefive: { command: 'takefive', args: ['mcp'] },
        },
      };
      writeFileSync(desktopConfigPath, JSON.stringify(existingConfig, null, 2));

      const uninstallResult = await adapter.uninstallClaudeDesktop({
        env: { HOME: tempDir },
      });

      expect(uninstallResult.success).toBe(true);
      const updated = JSON.parse(readFileSync(desktopConfigPath, 'utf-8'));
      expect(updated.mcpServers.takefive).toBeUndefined();
      expect(updated.mcpServers.github).toBeDefined();
    });
  });

  describe('Hook Payload Parsing and Subagent Suppression', () => {
    it('maps ToolConfirmation to waiting_permission with reason', () => {
      const payload = {
        hook_event_name: 'ToolConfirmation',
        command: 'rm -rf /tmp/test',
      };
      const parsed = adapter.parseHookPayload(payload, 'waiting_permission');
      expect(parsed.eventType).toBe('waiting_permission');
      expect(parsed.reason).toBe('rm -rf /tmp/test');
      expect(parsed.shouldSkip).toBe(false);
    });

    it('suppresses completion events for all subagent markers', () => {
      const markers = [
        { is_subagent: true },
        { subagent: true },
        { agent_type: 'subagent' },
        { parent_session_id: 'session-123' },
        { parent_id: 'parent-456' },
        { hook_name: 'SubagentStop' },
      ];

      for (const marker of markers) {
        const parsed = adapter.parseHookPayload(marker, 'task_completed');
        expect(parsed.shouldSkip).toBe(true);
      }
    });

    it('does not suppress non-subagent task_completed events', () => {
      const payload = {
        'last-assistant-message': 'Project refactor completed successfully.',
        cwd: '/Users/dev/my-project',
      };
      const parsed = adapter.parseHookPayload(payload, 'task_completed');
      expect(parsed.shouldSkip).toBe(false);
      expect(parsed.reason).toBe('Project refactor completed successfully.');
      expect(parsed.projectCwd).toBe('/Users/dev/my-project');
    });
  });
});
