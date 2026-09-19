import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../src/adapters/codex-adapter.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { readStdin } from '../src/cli/commands/notify.js';

describe('Bug Diagnostics & Feedback Loops', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-bugs-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Bug 1: OpenCode multiple intermediate notifications and non-running idle suppression', () => {
    it('generated OpenCode plugin should ignore subagent/child session idle events and only notify on root session idle after being busy', () => {
      const adapter = new OpenCodeAdapter();
      const pluginSource = (adapter as any).buildPluginSource();

      // Plugin source should inspect parentID / parentSessionID to filter out child session / subagent events
      expect(pluginSource).toContain('parentID');
      // Plugin source should also support session.status idle checking
      expect(pluginSource).toContain('session.status');
      // Plugin source must track busySessions so that opening/idling without active task never triggers push notification
      expect(pluginSource).toContain('busySessions');
    });
  });

  describe('Bug 2: Codex notifications not working', () => {
    it('Codex hooks must NOT have async: true because Codex skips async command hooks', async () => {
      const codexDir = join(tempDir, '.codex');
      mkdirSync(codexDir, { recursive: true });
      const configPath = join(codexDir, 'hooks.json');
      const adapter = new CodexAdapter();
      const mockEnv = {
        HOME: tempDir,
        CODEX_CONFIG_DIR: codexDir,
        TAKEFIVE_CLI_COMMAND: 'takefive',
      };

      await adapter.install({ env: mockEnv });

      const writtenConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const permHooks = writtenConfig.hooks.PermissionRequest[0].hooks;
      for (const hook of permHooks) {
        expect(hook.async).toBeUndefined();
      }
    });

    it('readStdin should pause stdin and resolve cleanly without hanging the event loop', async () => {
      const start = Date.now();
      const result = await readStdin(20);
      const elapsed = Date.now() - start;
      expect(typeof result).toBe('string');
      expect(elapsed).toBeLessThan(500);
    });

    it('should extract last-assistant-message in kebab-case from official Codex agent-turn-complete payload', () => {
      const adapter = new CodexAdapter();
      const payload = {
        type: 'agent-turn-complete',
        'thread-id': '01a04db9-fb00-7f21-b1a2-513ff9c23387',
        'turn-id': '01a05212-06dd-7791-961e-c26652d69a17',
        cwd: '/Users/gd/my-app',
        'last-assistant-message': '开发进展：已完成通知模块的重构与修复。',
      };

      const result = adapter.parseHookPayload(payload, 'task_completed');
      expect(result.shouldSkip).toBe(false);
      expect(result.eventType).toBe('task_completed');
      expect(result.reason).toBe('开发进展：已完成通知模块的重构与修复。');
      expect(result.projectCwd).toBe('/Users/gd/my-app');
    });

    it('should skip intermediate Stop hook events from hooks.json when type is not agent-turn-complete', () => {
      const adapter = new CodexAdapter();
      // Intermediate step where LLM produced interim text before executing tool
      const payload = {
        hook_event_name: 'Stop',
        session_id: '01a04db9-fb00-7f21-b1a2-513ff9c23387',
        turn_id: '01a05212-06dd-7791-961e-c26652d69a17',
        cwd: '/Users/gd/my-app',
        last_assistant_message: '我正在读取文件...',
        stop_hook_active: true,
      };

      const result = adapter.parseHookPayload(payload, 'task_completed');
      expect(result.shouldSkip).toBe(true);
    });

    it('should skip intermediate tool call steps when reason or trigger is tool_call or tool_use', () => {
      const adapter = new CodexAdapter();
      const payload1 = {
        hook_event_name: 'Stop',
        cwd: '/Users/gd/my-app',
        reason: 'tool_call',
        stop_hook_active: true,
      };
      const result1 = adapter.parseHookPayload(payload1, 'task_completed');
      expect(result1.shouldSkip).toBe(true);

      const payload2 = {
        hook_event_name: 'Stop',
        cwd: '/Users/gd/my-app',
        trigger: 'tool_call',
        stop_hook_active: true,
      };
      const result2 = adapter.parseHookPayload(payload2, 'task_completed');
      expect(result2.shouldSkip).toBe(true);
    });

    it('should extract tool_input command or prompt as reason for PermissionRequest', () => {
      const adapter = new CodexAdapter();
      const payload = {
        hook_event_name: 'PermissionRequest',
        cwd: '/Users/gd/my-app',
        tool_name: 'exec_command',
        tool_input: { command: 'git push origin main' },
      };

      const result = adapter.parseHookPayload(payload, 'waiting_permission');
      expect(result.eventType).toBe('waiting_permission');
      expect(result.reason).toBe('git push origin main');
    });

    it('should map request_user_input or ask_question to waiting_input event with prompt text', () => {
      const adapter = new CodexAdapter();
      const payload = {
        hook_event_name: 'PermissionRequest',
        cwd: '/Users/gd/my-app',
        tool_name: 'request_user_input',
        tool_input: { message: '请确认是否发布新版本？' },
      };

      const result = adapter.parseHookPayload(payload, 'waiting_permission');
      expect(result.eventType).toBe('waiting_input');
      expect(result.reason).toBe('请确认是否发布新版本？');
    });

    it('should map Interrupt hook or error termination to task_failed', () => {
      const adapter = new CodexAdapter();
      const payload1 = {
        hook_event_name: 'Interrupt',
        cwd: '/Users/gd/my-app',
        reason: 'interrupted by user',
      };
      const result1 = adapter.parseHookPayload(payload1, 'task_completed');
      expect(result1.eventType).toBe('task_failed');
      expect(result1.reason).toBe('interrupted by user');

      const payload2 = {
        hook_event_name: 'Stop',
        cwd: '/Users/gd/my-app',
        termination_reason: 'error',
        error: 'SyntaxError: unexpected token',
      };
      const result2 = adapter.parseHookPayload(payload2, 'task_completed');
      expect(result2.eventType).toBe('task_failed');
      expect(result2.reason).toBe('SyntaxError: unexpected token');
    });

    it('should parse JSON payload passed as CLI positional argument by Codex notify in config.toml', async () => {
      const { MockBarkDispatcher, MockCredentialStore } = await import('../src/testing/index.js');
      const { ConfigManager } = await import('../src/core/config-manager.js');
      const { Debouncer } = await import('../src/core/debouncer.js');
      const { BarkClient } = await import('../src/core/bark-client.js');
      const { NotificationDispatcher } = await import('../src/core/notification-dispatcher.js');

      const mockBark = new MockBarkDispatcher();
      const mockCreds = new MockCredentialStore('https://api.day.app/SECRET_KEY/');
      const configManager = new ConfigManager({ configPath: join(tempDir, 'config.json') });
      const debouncer = new Debouncer({ cachePath: join(tempDir, 'cache.json'), debounceSeconds: 2 });
      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const dispatcher = new NotificationDispatcher({
        configManager,
        debouncer,
        barkClient,
        credentialStore: mockCreds,
      });

      await configManager.saveConfig({
        version: '1.0.0',
        language: 'zh-CN',
        debounceSeconds: 2,
        icons: { claude: '', codex: '', opencode: '', antigravity: '' },
        events: {
          task_completed: { enabled: true, level: 'passive' },
          waiting_input: { enabled: true, level: 'critical' },
          waiting_permission: { enabled: true, level: 'timeSensitive' },
          task_failed: { enabled: true, level: 'critical' },
        },
        enabledAgents: { claude: true, codex: true, opencode: true, antigravity: true },
      });

      const program = new (await import('commander')).Command();
      const { registerNotifyCommand } = await import('../src/cli/commands/notify.js');
      registerNotifyCommand(program, dispatcher);

      // Simulate Codex CLI executing the notify command with the JSON string as argv argument
      await program.parseAsync([
        'node',
        'takefive',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        JSON.stringify({
          type: 'agent-turn-complete',
          'thread-id': '01a04db9-fb00-7f21-b1a2-513ff9c23387',
          'turn-id': '01a05212-06dd-7791-961e-c26652d69a17',
          cwd: '/Users/gd/my-project',
          'last-assistant-message': '全部任务已完成，请检查结果。',
        }),
      ]);

      const payload = mockBark.getLastPayload();
      expect(payload).toBeDefined();
      expect(payload?.title).toBe('✅ 任务完成');
      expect(payload?.subtitle).toBe('Codex · my-project');
      expect(payload?.body).toBe('全部任务已完成，请检查结果。');
    });
  });

  describe('Bug 3: Claude Code subagents should not trigger task completion', () => {
    it('ClaudeAdapter should skip subagent completion events', async () => {
      const { ClaudeAdapter } = await import('../src/adapters/claude-adapter.js');
      const adapter = new ClaudeAdapter();
      const payload = {
        is_subagent: true,
        agent_type: 'subagent',
        cwd: '/Users/gd/my-app',
        message: 'Subagent finished subtask',
      };

      const result = adapter.parseHookPayload(payload, 'task_completed');
      expect(result.shouldSkip).toBe(true);
    });
  });
});



