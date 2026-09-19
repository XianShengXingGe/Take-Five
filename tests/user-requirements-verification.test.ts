import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import {
  MockBarkDispatcher,
  MockCredentialStore,
  createMockConfig,
} from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { NotificationDispatcher } from '../src/core/notification-dispatcher.js';
import { BarkClient } from '../src/core/bark-client.js';
import { Debouncer } from '../src/core/debouncer.js';
import { TemplateEngine } from '../src/core/template-engine.js';
import { CodexAdapter, parseTomlNotify, updateTomlNotify, removeTomlNotify, isTakeFiveNotifyArray, extractChainedNotify } from '../src/adapters/codex-adapter.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { ClaudeAdapter } from '../src/adapters/claude-adapter.js';

describe('TDD User Requirements Verification', () => {
  let tempDir: string;
  let configPath: string;
  let cachePath: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-tdd-verification-'));
    configPath = join(tempDir, 'config.json');
    cachePath = join(tempDir, 'cache.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/USER_SECRET_KEY/');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function setupEnvironment() {
    const configManager = new ConfigManager({ configPath });
    const debouncer = new Debouncer({ cachePath, debounceSeconds: 0 }); // 0s debounce for precise event count checks
    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
    const templateEngine = new TemplateEngine();

    const dispatcher = new NotificationDispatcher({
      configManager,
      debouncer,
      barkClient,
      credentialStore: mockCreds,
      templateEngine,
    });

    const cli = createCli({ dispatcher, configManager });
    return { cli, configManager, debouncer, barkClient, dispatcher };
  }

  describe('Requirement 1: Codex (GPT) Single Turn Completion Gating', () => {
    it('simulates a multi-step conversation: intermediate steps are skipped, and ONLY the final agent-turn-complete outputs a notification', async () => {
      const { cli, configManager } = setupEnvironment();
      await configManager.saveConfig(createMockConfig({ language: 'zh-CN' }));

      // Step 1: LLM pauses to call tool "read_file" (Stop hook fired without agent-turn-complete)
      const intermediateStep1Payload = JSON.stringify({
        event: 'Stop',
        stop_reason: 'tool_use',
        tool: 'read_file',
        last_assistant_message: 'Let me read the file first...',
      });
      await cli.parseAsync([
        'node',
        'cli.js',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        intermediateStep1Payload,
      ]);
      expect(mockBark.getRequests()).toHaveLength(0);

      // Step 2: LLM pauses to call tool "file_edit" (Stop hook fired without agent-turn-complete)
      const intermediateStep2Payload = JSON.stringify({
        event: 'Stop',
        stop_reason: 'tool_use',
        tool: 'file_edit',
        last_assistant_message: 'Now making the code changes...',
      });
      await cli.parseAsync([
        'node',
        'cli.js',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        intermediateStep2Payload,
      ]);
      expect(mockBark.getRequests()).toHaveLength(0);

      // Step 3: LLM pauses to call tool "exec_command" (Stop hook fired without agent-turn-complete)
      const intermediateStep3Payload = JSON.stringify({
        event: 'Stop',
        stop_reason: 'tool_use',
        tool: 'exec_command',
        last_assistant_message: 'Running the tests...',
      });
      await cli.parseAsync([
        'node',
        'cli.js',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        intermediateStep3Payload,
      ]);
      expect(mockBark.getRequests()).toHaveLength(0);

      // Step 4: Subagent finishes child task during the round (should be skipped)
      const subagentPayload = JSON.stringify({
        event: 'Stop',
        is_subagent: true,
        parent_id: 'parent-123',
        last_assistant_message: 'Subagent research completed',
      });
      await cli.parseAsync([
        'node',
        'cli.js',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        subagentPayload,
      ]);
      expect(mockBark.getRequests()).toHaveLength(0);

      // Step 5: The entire conversation turn actually finishes (official Codex notify callback)
      const finalTurnCompletePayload = JSON.stringify({
        type: 'agent-turn-complete',
        'thread-id': 'thread-abc-123',
        'turn-id': 'turn-001',
        cwd: '/Users/test/my-awesome-project',
        'last-assistant-message': '所有的代码修改和测试均已完成并通过验证！',
      });
      await cli.parseAsync([
        'node',
        'cli.js',
        'notify',
        '--agent',
        'codex',
        '--event',
        'task_completed',
        '--hook',
        '--quiet',
        finalTurnCompletePayload,
      ]);

      // Assert that throughout the 5 steps, EXACTLY ONE notification was sent
      const dispatched = mockBark.getRequests();
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].payload.title).toBe('✅ 任务完成');
      expect(dispatched[0].payload.subtitle).toBe('Codex · my-awesome-project');
      expect(dispatched[0].payload.body).toBe('所有的代码修改和测试均已完成并通过验证！');
    });

    it('Codex adapter handles kebab-case, snake_case, and camelCase assistant message variants', () => {
      const adapter = new CodexAdapter();

      const kebabParsed = adapter.parseHookPayload(
        {
          type: 'agent-turn-complete',
          'last-assistant-message': 'Kebab finished',
          cwd: '/workspace/app',
        },
        'task_completed',
      );
      expect(kebabParsed.shouldSkip).toBe(false);
      expect(kebabParsed.reason).toBe('Kebab finished');
      expect(kebabParsed.projectCwd).toBe('/workspace/app');

      const snakeParsed = adapter.parseHookPayload(
        {
          type: 'agent-turn-complete',
          last_assistant_message: 'Snake finished',
          cwd: '/workspace/app',
        },
        'task_completed',
      );
      expect(snakeParsed.shouldSkip).toBe(false);
      expect(snakeParsed.reason).toBe('Snake finished');

      const camelParsed = adapter.parseHookPayload(
        {
          type: 'agent-turn-complete',
          lastAssistantMessage: 'Camel finished',
          cwd: '/workspace/app',
        },
        'task_completed',
      );
      expect(camelParsed.shouldSkip).toBe(false);
      expect(camelParsed.reason).toBe('Camel finished');
    });
  });

  describe('Requirement 2: OpenCode Idle Suppression When Not Actively Running', () => {
    it('simulates OpenCode plugin lifecycle: suppresses idle on launch/background, triggers ONLY after being busy', async () => {
      const adapter = new OpenCodeAdapter();
      const pluginSource = (adapter as any).buildPluginSource();

      // Verify that the generated plugin code maintains busySessions state
      expect(pluginSource).toContain('const busySessions = new Set()');
      expect(pluginSource).toContain('busySessions.add(sessionID)');
      expect(pluginSource).toContain('busySessions.has(sessionID)');
      expect(pluginSource).toContain('busySessions.delete(sessionID)');

      // Simulate plugin execution logic in JS runtime
      const mockPluginNotify = vi.fn();
      const busySessions = new Set<string>();

      const handleEvent = (event: any, directory?: string) => {
        if (!event || !event.type) return;
        const sessionID = event.properties?.sessionID || event.properties?.session?.id || event.properties?.id || 'root';
        const isSubagent = Boolean(
          event.properties?.parentID ||
          event.properties?.parentSessionID ||
          event.properties?.session?.parentID,
        );
        const status = event.properties?.status;
        const statusType = typeof status === 'object' && status !== null ? status.type : status;

        if (statusType === 'busy' || event.type === 'session.busy' || event.type === 'message.part.added' || event.type === 'user.prompt') {
          if (!isSubagent) {
            busySessions.add(sessionID);
          }
        }

        const isIdle = event.type === 'session.idle' || (
          event.type === 'session.status' && statusType === 'idle'
        );

        if (isIdle && !isSubagent) {
          if (busySessions.has(sessionID)) {
            busySessions.delete(sessionID);
            mockPluginNotify('task_completed', directory);
          }
        }
      };

      // Case A: OpenCode launches or user opens window (session starts as idle without user prompt)
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-1', status: 'idle' } });
      handleEvent({ type: 'session.idle', properties: { sessionID: 'sess-1' } });
      // Case B: Background file change occurs
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-1', status: { type: 'idle' } } });
      expect(mockPluginNotify).not.toHaveBeenCalled();

      // Case C: User actually inputs a prompt and agent begins working
      handleEvent({ type: 'user.prompt', properties: { sessionID: 'sess-1' } });
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-1', status: 'busy' } });
      expect(mockPluginNotify).not.toHaveBeenCalled();

      // Case D: Subagent runs during the task and completes
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-sub', parentID: 'sess-1', status: 'busy' } });
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-sub', parentID: 'sess-1', status: 'idle' } });
      expect(mockPluginNotify).not.toHaveBeenCalled();

      // Case E: Main session finishes work and transitions back to idle
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-1', status: 'idle' } }, '/workspace/my-project');
      expect(mockPluginNotify).toHaveBeenCalledTimes(1);
      expect(mockPluginNotify).toHaveBeenCalledWith('task_completed', '/workspace/my-project');

      // Case F: Subsequent idle signals while sitting in background
      handleEvent({ type: 'session.status', properties: { sessionID: 'sess-1', status: 'idle' } });
      expect(mockPluginNotify).toHaveBeenCalledTimes(1);
    });
  });

  describe('Requirement 3: Codex TOML Configuration Integrity and Chaining Safety', () => {
    it('manages config.toml notify array cleanly without infinite --chain nesting or syntax errors', () => {
      const initialToml = [
        'model = "gpt-5.6-sol"',
        'notify = [ "/usr/local/bin/SkyComputerUseClient", "turn-ended" ]',
        '',
        '[desktop]',
        'dock-icon-preference = "app-default"',
      ].join('\n');

      const parsedInitial = parseTomlNotify(initialToml);
      expect(parsedInitial).toEqual(['/usr/local/bin/SkyComputerUseClient', 'turn-ended']);
      expect(isTakeFiveNotifyArray(parsedInitial)).toBe(false);

      const chained = extractChainedNotify(parsedInitial);
      expect(chained).toEqual(['/usr/local/bin/SkyComputerUseClient', 'turn-ended']);

      // First installation
      const takeFiveCmd = ['node', '/app/dist/cli.js', 'notify', '--agent', 'codex', '--event', 'task_completed', '--hook', '--quiet'];
      if (chained && chained.length > 0) {
        takeFiveCmd.push('--chain', ...chained);
      }
      const updatedToml = updateTomlNotify(initialToml, takeFiveCmd);
      expect(updatedToml).toContain('notify = [ "node", "/app/dist/cli.js", "notify", "--agent", "codex", "--event", "task_completed", "--hook", "--quiet", "--chain", "/usr/local/bin/SkyComputerUseClient", "turn-ended" ]');
      expect(updatedToml).not.toContain(']"]');

      // Second installation (re-install / repair) must NOT nest --chain again
      const parsedSecond = parseTomlNotify(updatedToml);
      expect(isTakeFiveNotifyArray(parsedSecond)).toBe(true);
      const secondaryFromSecond = extractChainedNotify(parsedSecond);
      expect(secondaryFromSecond).toEqual(['/usr/local/bin/SkyComputerUseClient', 'turn-ended']);

      // Uninstall should cleanly restore the original SkyComputerUseClient
      const uninstalledToml = removeTomlNotify(updatedToml, secondaryFromSecond);
      expect(uninstalledToml).toContain('notify = [ "/usr/local/bin/SkyComputerUseClient", "turn-ended" ]');
      expect(uninstalledToml).not.toContain('takefive');
      expect(uninstalledToml).not.toContain('dist/cli.js');
    });
  });

  describe('Requirement 4: Claude Code Subagent Suppression', () => {
    it('skips subagent stops in Claude Code', () => {
      const adapter = new ClaudeAdapter();

      const subagent1 = adapter.parseHookPayload(
        {
          hook_name: 'SubagentStop',
          is_subagent: true,
        },
        'task_completed',
      );
      expect(subagent1.shouldSkip).toBe(true);

      const subagent2 = adapter.parseHookPayload(
        {
          hook_name: 'Stop',
          agent_type: 'subagent',
        },
        'task_completed',
      );
      expect(subagent2.shouldSkip).toBe(true);

      const mainTurn = adapter.parseHookPayload(
        {
          hook_name: 'Stop',
          last_assistant_message: 'Claude completed main turn',
        },
        'task_completed',
      );
      expect(mainTurn.shouldSkip).toBe(false);
      expect(mainTurn.reason).toBe('Claude completed main turn');
    });
  });
});
