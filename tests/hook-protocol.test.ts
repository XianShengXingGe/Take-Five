import { describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { parseHookPayload, registerNotifyCommand } from '../src/cli/commands/notify.js';
import { handleAntigravityHookPayload } from '../src/adapters/antigravity-adapter.js';

function dispatcher(status: 'dispatched' | 'failed' = 'dispatched') {
  return {
    dispatch: vi.fn(async () => status === 'failed' ? { status, error: 'offline' } : { status }),
  };
}

describe('hook protocol safety', () => {
  it('allows an Antigravity Stop hook to finish after notification dispatch', async () => {
    const mock = dispatcher();
    const response = await handleAntigravityHookPayload(
      { fullyIdle: true, terminationReason: 'model_stop' },
      mock as never,
    );
    expect(mock.dispatch).toHaveBeenCalledOnce();
    expect(response).toEqual({ decision: 'stop' });
  });

  it('extracts host-provided human context for waiting and failure notifications', () => {
    expect(parseHookPayload(JSON.stringify({ message: 'Choose a branch' }), { agent: 'claude', event: 'waiting_input' }).reason).toBe('Choose a branch');
    expect(parseHookPayload(JSON.stringify({ tool_input: { description: 'Allow network?' } }), { agent: 'codex', event: 'waiting_permission' }).reason).toBe('Allow network?');
  });

  it('returns an Antigravity PreToolUse decision and never fails the host on push errors', async () => {
    const program = new Command();
    const mock = dispatcher('failed');
    registerNotifyCommand(program, mock as never, undefined, async () => JSON.stringify({
      workspacePaths: ['/workspace/app'],
      toolCall: { name: 'ask_question', args: { questions: [{ question: 'Choose one' }] } },
    }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = 0;
    await program.parseAsync(['node', 'takefive', 'notify', '--agent', 'antigravity', '--event', 'waiting_input', '--hook', '--quiet']);
    expect(log).toHaveBeenCalledWith('{"decision":"ask"}');
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it('returns an Antigravity Stop decision and suppresses premature completion', async () => {
    const program = new Command();
    const mock = dispatcher();
    registerNotifyCommand(program, mock as never, undefined, async () => JSON.stringify({
      fullyIdle: false,
      terminationReason: 'model_stop',
    }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program.parseAsync(['node', 'takefive', 'notify', '--agent', 'antigravity', '--event', 'task_completed', '--hook', '--quiet']);
    expect(mock.dispatch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('{"decision":"stop"}');
    log.mockRestore();
  });
});
