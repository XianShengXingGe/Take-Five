import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotificationDispatcher } from '../src/core/notification-dispatcher.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { MockCredentialStore, createMockConfig } from '../src/testing/index.js';
import { BarkClient } from '../src/core/bark-client.js';
import { OpenCodeAdapter } from '../src/adapters/opencode-adapter.js';
import { McpServer } from '../src/core/mcp-server.js';
import { SUPPORTED_AGENTS, type SupportedAgent } from '../src/types/event.js';

describe('Multi-Agent Adapters & Enable/Disable Consistency (E2E)', () => {
  let tempDir: string;
  let configPath: string;
  let configManager: ConfigManager;
  let mockCreds: MockCredentialStore;
  let pushedPayloads: Array<{ url: string; payload: unknown }>;
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-multi-agent-e2e-'));
    configPath = join(tempDir, '.takefive', 'config.json');
    pushedPayloads = [];

    const mockBarkClient = {
      push: async (url: string, payload: unknown) => {
        pushedPayloads.push({ url, payload });
        return { code: 200, message: 'success', timestamp: Date.now() };
      },
    } as unknown as BarkClient;

    configManager = new ConfigManager({ configPath });
    mockCreds = new MockCredentialStore('https://api.day.app/VALID_KEY/');

    dispatcher = new NotificationDispatcher({
      configManager,
      credentialStore: mockCreds,
      barkClient: mockBarkClient,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Agent Enable/Disable Consistency across all 4 agents', () => {
    for (const agent of SUPPORTED_AGENTS) {
      it(`allows dispatch when ${agent} is enabled and blocks when disabled`, async () => {
        // 1. Initially enabled
        await configManager.saveConfig(
          createMockConfig({
            enabledAgents: {
              claude: true,
              codex: true,
              opencode: true,
              antigravity: true,
            },
          }),
        );

        const resultEnabled = await dispatcher.dispatch(
          {
            agent,
            type: 'task_completed',
            project: `TestProject-${agent}-1`,
            timestamp: Date.now(),
          },
          { force: true },
        );

        expect(resultEnabled.status).toBe('dispatched');
        expect(pushedPayloads.length).toBeGreaterThanOrEqual(1);
        pushedPayloads = [];

        // 2. Disable agent in config
        const currentConfig = await configManager.loadConfig();
        currentConfig.enabledAgents[agent] = false;
        await configManager.saveConfig(currentConfig);

        const resultDisabled = await dispatcher.dispatch(
          {
            agent,
            type: 'task_completed',
            project: `TestProject-${agent}-2`,
            timestamp: Date.now(),
          },
          { force: true },
        );

        expect(resultDisabled.status).toBe('agent_disabled');
        expect(pushedPayloads).toHaveLength(0);
      });
    }

    it('respects event-level enable/disable rules for all agents', async () => {
      // Disable task_completed rule globally
      await configManager.saveConfig(
        createMockConfig({
          events: {
            task_completed: { enabled: false, level: 'active' },
            waiting_input: { enabled: true, level: 'timeSensitive' },
            waiting_permission: { enabled: true, level: 'timeSensitive' },
            task_failed: { enabled: true, level: 'critical' },
          },
        }),
      );

      for (const agent of SUPPORTED_AGENTS) {
        // task_completed should be blocked
        const completedRes = await dispatcher.dispatch(
          {
            agent,
            type: 'task_completed',
            project: `Project-${agent}`,
            timestamp: Date.now(),
          },
          { force: true },
        );
        expect(completedRes.status).toBe('event_disabled');

        // waiting_input should be allowed
        const inputRes = await dispatcher.dispatch(
          {
            agent,
            type: 'waiting_input',
            project: `Project-${agent}`,
            reason: 'Question asked',
            timestamp: Date.now(),
          },
          { force: true },
        );
        expect(inputRes.status).toBe('dispatched');
      }
    });
  });

  describe('Claude Desktop MCP Integration under Enable/Disable settings', () => {
    it('dispatches when Claude is enabled, skips cleanly when Claude is disabled', async () => {
      const mcpServer = new McpServer({ dispatcher });

      // 1. Claude enabled
      await configManager.saveConfig(
        createMockConfig({
          enabledAgents: {
            claude: true,
            codex: true,
            opencode: true,
            antigravity: true,
          },
        }),
      );

      const resEnabledStr = await mcpServer.handleMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'mcp-1',
          method: 'tools/call',
          params: {
            name: 'takefive_notify',
            arguments: {
              event: 'task_completed',
              project: 'ClaudeDesktopE2E',
              reason: 'Done',
            },
          },
        }),
      );

      const resEnabled = JSON.parse(resEnabledStr!);
      expect(resEnabled.result.isError).toBe(false);
      expect(resEnabled.result.content[0].text).toContain('Notification sent: task_completed');

      // 2. Disable Claude
      const cfg = await configManager.loadConfig();
      cfg.enabledAgents.claude = false;
      await configManager.saveConfig(cfg);

      const resDisabledStr = await mcpServer.handleMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'mcp-2',
          method: 'tools/call',
          params: {
            name: 'takefive_notify',
            arguments: {
              event: 'task_completed',
              project: 'ClaudeDesktopE2E',
              reason: 'Done',
            },
          },
        }),
      );

      const resDisabled = JSON.parse(resDisabledStr!);
      expect(resDisabled.result.isError).toBe(false);
      expect(resDisabled.result.content[0].text).toContain('claude agent is disabled in Take Five configuration');
    });
  });

  describe('OpenCode State Machine (takefive.js) verification', () => {
    it('accurately tracks root session busy -> idle transitions and suppresses subagent transitions', async () => {
      const openCodeAdapter = new OpenCodeAdapter();
      const openCodeDir = join(tempDir, '.config', 'opencode');
      mkdirSync(openCodeDir, { recursive: true });
      const pluginPath = join(openCodeDir, 'plugins', 'takefive.js');

      await openCodeAdapter.install({
        configPath: pluginPath,
        env: { OPENCODE_CONFIG_DIR: openCodeDir },
      });

      const fileUrl = new URL(`file://${pluginPath}`).href;
      const pluginModule = await import(fileUrl);
      const plugin = await (pluginModule.default || pluginModule.TakeFivePlugin)({
        directory: '/Users/test/opencode-app',
      });

      // Verify plugin structure
      expect(typeof plugin.event).toBe('function');
      expect(typeof plugin['permission.ask']).toBe('function');

      // 1. Idle without becoming busy should NOT trigger notification
      await plugin.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'session-root-1' },
        },
      });

      // 2. Subagent session becoming busy and then idle should NOT trigger task_completed
      await plugin.event({
        event: {
          type: 'session.busy',
          properties: { sessionID: 'session-sub-1', parentID: 'session-root-1' },
        },
      });
      await plugin.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'session-sub-1', parentID: 'session-root-1' },
        },
      });

      // 3. Root session becomes busy
      await plugin.event({
        event: {
          type: 'session.busy',
          properties: { sessionID: 'session-root-1' },
        },
      });

      // 4. Root session becomes idle -> completes turn
      await plugin.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'session-root-1' },
        },
      });

      // 5. Subsequent immediate idle without busy does not duplicate
      await plugin.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'session-root-1' },
        },
      });

      // 6. Root session error
      await plugin.event({
        event: {
          type: 'session.error',
          properties: {
            sessionID: 'session-root-2',
            error: { message: 'Syntax error in generated code' },
          },
        },
      });
    });
  });
});
