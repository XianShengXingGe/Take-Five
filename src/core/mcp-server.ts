import { createInterface, type Interface } from 'node:readline';
import type { NotificationDispatcher } from './notification-dispatcher.js';
import {
  isUnifiedEventType,
  type UnifiedEventType,
} from '../types/event.js';
import { VERSION } from '../version.js';

export interface McpServerOptions {
  dispatcher?: NotificationDispatcher;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  env?: Record<string, string | undefined>;
}

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export const TAKEFIVE_MCP_TOOL_NAME = 'takefive_notify';

export const TAKEFIVE_MCP_TOOL_DEFINITION = {
  name: TAKEFIVE_MCP_TOOL_NAME,
  description:
    'Send a smart mobile push notification via Take Five (Bark) when a task finishes, needs user input/permission, or encounters an error.',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'string',
        enum: ['task_completed', 'waiting_input', 'waiting_permission', 'task_failed'],
        description: "Lifecycle event type for the notification. Defaults to 'task_completed'.",
      },
      project: {
        type: 'string',
        description: 'Project or workspace name. Optional (auto-detected if omitted).',
      },
      reason: {
        type: 'string',
        description: 'Optional summary, question, or details to include in the push notification.',
      },
    },
    required: [],
  },
};

/**
 * Lightweight JSON-RPC 2.0 Model Context Protocol (MCP) server
 * enabling Claude Desktop to trigger Take Five push notifications.
 */
export class McpServer {
  private dispatcher?: NotificationDispatcher;
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;
  private rl?: Interface;
  private env?: Record<string, string | undefined>;

  constructor(options: McpServerOptions = {}) {
    this.dispatcher = options.dispatcher;
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.env = options.env;
  }

  /**
   * Set or update the notification dispatcher instance.
   */
  setDispatcher(dispatcher: NotificationDispatcher): void {
    this.dispatcher = dispatcher;
  }

  /**
   * Starts listening for JSON-RPC messages on the configured input stream.
   */
  async listen(): Promise<void> {
    return new Promise((resolve) => {
      this.rl = createInterface({
        input: this.input,
        terminal: false,
      });

      this.rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const responseJson = await this.handleMessage(trimmed);
        if (responseJson) {
          this.output.write(responseJson + '\n');
        }
      });

      this.rl.on('close', () => {
        resolve();
      });
    });
  }

  /**
   * Stops listening and closes the stream interface.
   */
  close(): void {
    this.rl?.close();
    this.rl = undefined;
  }

  /**
   * Handles a single raw JSON-RPC string message.
   * Returns a JSON-serialized response string, or null if the message is a notification.
   */
  async handleMessage(rawMessage: string): Promise<string | null> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(rawMessage) as JsonRpcRequest;
    } catch {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    }

    if (!request || typeof request !== 'object' || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      const id = request && typeof request === 'object' && 'id' in request ? (request.id as string | number) : null;
      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' },
      });
    }

    const isNotification = request.id === undefined;

    switch (request.method) {
      case 'initialize': {
        const result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'takefive',
            version: VERSION,
          },
        };
        return JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result });
      }

      case 'notifications/initialized':
      case 'initialized': {
        // Notification: client acknowledged initialization
        return null;
      }

      case 'ping': {
        return JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result: {} });
      }

      case 'tools/list': {
        const result = {
          tools: [TAKEFIVE_MCP_TOOL_DEFINITION],
        };
        return JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result });
      }

      case 'tools/call': {
        const response = await this.handleToolCall(request.id ?? null, request.params);
        return JSON.stringify(response);
      }

      default: {
        if (isNotification) return null;
        return JSON.stringify({
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: { code: -32601, message: `Method not found: ${request.method}` },
        });
      }
    }
  }

  private async handleToolCall(
    id: string | number | null,
    params?: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    const toolName = params?.name;
    if (toolName !== TAKEFIVE_MCP_TOOL_NAME) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${String(toolName)}`,
            },
          ],
          isError: true,
        },
      };
    }

    const args = (params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Record<
      string,
      unknown
    >;

    let eventType: UnifiedEventType = 'task_completed';
    if (typeof args.event === 'string' && isUnifiedEventType(args.event)) {
      eventType = args.event;
    }

    const project = typeof args.project === 'string' ? args.project.trim() : undefined;
    const reason = typeof args.reason === 'string' ? args.reason.trim() : undefined;

    if (!this.dispatcher) {
      // Lazy load dispatcher if not explicitly injected
      const { NotificationDispatcher } = await import('./notification-dispatcher.js');
      this.dispatcher = new NotificationDispatcher();
    }

    const dispatchResult = await this.dispatcher.dispatch(
      {
        agent: 'claude',
        type: eventType,
        project: project || '',
        reason,
        timestamp: Date.now(),
      },
      { force: false },
    );

    let contentText = '';
    let isError = false;

    switch (dispatchResult.status) {
      case 'dispatched':
        contentText = `Notification sent: ${eventType}${project ? ` (${project})` : ''}`;
        break;
      case 'debounced':
        contentText = 'Notification skipped: debounced within cooldown window.';
        break;
      case 'agent_disabled':
        contentText = 'Notification skipped: claude agent is disabled in Take Five configuration.';
        break;
      case 'event_disabled':
        contentText = `Notification skipped: ${eventType} event is disabled in Take Five configuration.`;
        break;
      case 'missing_credential':
        contentText = 'Failed to send notification: Bark URL is not configured.';
        isError = true;
        break;
      case 'failed':
      default:
        contentText = `Failed to send notification: ${dispatchResult.error || 'Unknown error'}`;
        isError = true;
        break;
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: contentText,
          },
        ],
        isError,
      },
    };
  }
}
