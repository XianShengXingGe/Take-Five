import { Command } from 'commander';
import { McpServer } from '../../core/mcp-server.js';
import type { NotificationDispatcher } from '../../core/notification-dispatcher.js';

export async function runMcpAction(
  dispatcher: NotificationDispatcher,
  env?: Record<string, string | undefined>,
): Promise<void> {
  const server = new McpServer({
    dispatcher,
    env,
  });
  await server.listen();
}

export function registerMcpCommand(
  program: Command,
  dispatcher: NotificationDispatcher,
  env?: Record<string, string | undefined>,
): void {
  program
    .command('mcp')
    .description('Run Take Five Model Context Protocol (MCP) server over stdio for Claude Desktop')
    .action(async () => {
      await runMcpAction(dispatcher, env);
    });
}

