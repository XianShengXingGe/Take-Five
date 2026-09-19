import { describe, expect, it, beforeEach } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { McpServer, TAKEFIVE_MCP_TOOL_NAME, TAKEFIVE_MCP_TOOL_DEFINITION } from '../src/core/mcp-server.js';
import { NotificationDispatcher } from '../src/core/notification-dispatcher.js';
import { MockCredentialStore, createMockConfig } from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { BarkClient } from '../src/core/bark-client.js';

describe('McpServer', () => {
  let dispatcher: NotificationDispatcher;
  let mockCreds: MockCredentialStore;
  let pushedPayloads: Array<{ url: string; payload: unknown }>;

  beforeEach(() => {
    pushedPayloads = [];
    mockCreds = new MockCredentialStore('https://api.day.app/TEST_KEY/');

    const mockBarkClient = {
      push: async (url: string, payload: unknown) => {
        pushedPayloads.push({ url, payload });
        return { code: 200, message: 'success', timestamp: Date.now() };
      },
    } as unknown as BarkClient;

    dispatcher = new NotificationDispatcher({
      credentialStore: mockCreds,
      barkClient: mockBarkClient,
    });
  });

  it('exposes correct tool definition and schema', () => {
    expect(TAEFIVE_TOOL_CHECK()).toBe(true);
    expect(TAKEFIVE_MCP_TOOL_NAME).toBe('takefive_notify');
    expect(TAKEFIVE_MCP_TOOL_DEFINITION.name).toBe('takefive_notify');
    expect(TAKEFIVE_MCP_TOOL_DEFINITION.inputSchema.properties.event.enum).toContain('task_completed');
    expect(TAKEFIVE_MCP_TOOL_DEFINITION.inputSchema.properties.event.enum).toContain('waiting_input');
    expect(TAKEFIVE_MCP_TOOL_DEFINITION.inputSchema.properties.event.enum).toContain('waiting_permission');
    expect(TAKEFIVE_MCP_TOOL_DEFINITION.inputSchema.properties.event.enum).toContain('task_failed');
  });

  function TAEFIVE_TOOL_CHECK() {
    return Boolean(TAKEFIVE_MCP_TOOL_DEFINITION.description.includes('Bark'));
  }

  it('handles MCP initialize lifecycle request', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'claude-desktop', version: '1.0.0' },
        },
      }),
    );

    expect(responseStr).not.toBeNull();
    const response = JSON.parse(responseStr!);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.serverInfo.name).toBe('takefive');
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.capabilities.tools).toBeDefined();
  });

  it('ignores notifications without response', async () => {
    const server = new McpServer({ dispatcher });
    const initNotification = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    );
    expect(initNotification).toBeNull();

    const shortInit = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialized',
      }),
    );
    expect(shortInit).toBeNull();
  });

  it('handles ping request', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'ping-1',
        method: 'ping',
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe('ping-1');
    expect(response.result).toEqual({});
  });

  it('handles tools/list request returning takefive_notify', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe(2);
    expect(response.result.tools).toHaveLength(1);
    expect(response.result.tools[0].name).toBe('takefive_notify');
  });

  it('handles tools/call for takefive_notify and sends notification via dispatcher', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'takefive_notify',
          arguments: {
            event: 'task_completed',
            project: 'ClaudeDesktopApp',
            reason: 'All components compiled successfully',
          },
        },
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe(3);
    expect(response.result.isError).toBe(false);
    expect(response.result.content[0].text).toContain('Notification sent: task_completed (ClaudeDesktopApp)');

    expect(pushedPayloads).toHaveLength(1);
    const sent = pushedPayloads[0].payload as { title: string; subtitle: string; body: string };
    expect(sent.subtitle).toContain('Claude Code · ClaudeDesktopApp');
    expect(sent.body).toBe('All components compiled successfully');
  });

  it('defaults to task_completed when event is omitted', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'takefive_notify',
          arguments: {
            reason: 'Finished job',
          },
        },
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.result.isError).toBe(false);
    expect(response.result.content[0].text).toContain('Notification sent: task_completed');
  });

  it('returns isError: true for unknown tool name', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'some_other_tool',
          arguments: {},
        },
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe(5);
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('Unknown tool: some_other_tool');
  });

  it('returns error when Bark URL is not configured', async () => {
    const unconfiguredCreds = new MockCredentialStore(null);
    const unconfiguredDispatcher = new NotificationDispatcher({
      credentialStore: unconfiguredCreds,
    });
    const server = new McpServer({ dispatcher: unconfiguredDispatcher });

    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'takefive_notify',
          arguments: {
            project: 'UnconfiguredProject',
          },
        },
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toContain('Bark URL is not configured');
  });

  it('returns Method not found (-32601) for unhandled methods', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'resources/list',
      }),
    );

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe(7);
    expect(response.error.code).toBe(-32601);
  });

  it('returns Parse error (-32700) for malformed JSON', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage('{ invalid json');

    const response = JSON.parse(responseStr!);
    expect(response.id).toBeNull();
    expect(response.error.code).toBe(-32700);
  });

  it('returns Invalid Request (-32600) when jsonrpc is missing or method is not string', async () => {
    const server = new McpServer({ dispatcher });
    const responseStr = await server.handleMessage(JSON.stringify({ id: 8, method: 123 }));

    const response = JSON.parse(responseStr!);
    expect(response.id).toBe(8);
    expect(response.error.code).toBe(-32600);
  });

  it('streams messages over input and output streams via listen()', async () => {
    const input = new Readable({
      read() {},
    });

    let outputData = '';
    const output = new Writable({
      write(chunk, _encoding, callback) {
        outputData += chunk.toString();
        callback();
      },
    });

    const server = new McpServer({
      dispatcher,
      input,
      output,
    });

    const listenPromise = server.listen();

    input.push(JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'ping' }) + '\n');
    input.push(null); // End stream

    await listenPromise;

    expect(outputData).toContain('"id":10');
    expect(outputData).toContain('"result":{}');
  });
});
