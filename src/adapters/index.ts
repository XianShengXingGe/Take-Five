import type { SupportedAgent } from '../types/event.js';
import type { AgentAdapter } from '../types/adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { OpenCodeAdapter } from './opencode-adapter.js';
import { CodexAdapter } from './codex-adapter.js';
import { AntigravityAdapter } from './antigravity-adapter.js';

export * from './base-adapter.js';
export * from './backup-manager.js';
export * from './hook-utils.js';
export * from './claude-adapter.js';
export * from './opencode-adapter.js';
export * from './codex-adapter.js';
export * from './antigravity-adapter.js';

export function createAllAdapters(): AgentAdapter[] {
  return [
    new ClaudeAdapter(),
    new OpenCodeAdapter(),
    new CodexAdapter(),
    new AntigravityAdapter(),
  ];
}

export function getAdapter(id: SupportedAgent): AgentAdapter | null {
  switch (id) {
    case 'claude':
      return new ClaudeAdapter();
    case 'opencode':
      return new OpenCodeAdapter();
    case 'codex':
      return new CodexAdapter();
    case 'antigravity':
      return new AntigravityAdapter();
    default:
      return null;
  }
}

export async function detectInstalledAdapters(
  env?: Record<string, string | undefined>,
): Promise<AgentAdapter[]> {
  const all = createAllAdapters();
  const detected: AgentAdapter[] = [];

  for (const adapter of all) {
    if (await adapter.detectEnvironment(env)) {
      detected.push(adapter);
    }
  }

  return detected;
}
