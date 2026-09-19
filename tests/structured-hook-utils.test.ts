import { describe, expect, it } from 'vitest';
import { listTakeFiveCommands, removeTakeFiveHooks, upsertCommandHook } from '../src/adapters/structured-hook-utils.js';

describe('structured hook merging', () => {
  it('recognizes Take Five by its notify arguments even with a renamed executable', () => {
    const hooks = { Stop: [{ hooks: [{ type: 'command', command: '"C:/Tools/tf.exe" notify --agent codex --event task_completed --hook --quiet' }] }] };
    expect(listTakeFiveCommands(hooks, 'Stop')).toHaveLength(1);
    expect(removeTakeFiveHooks(hooks)).toBe(1);
    expect(hooks).toEqual({});
  });

  it('upserts without removing foreign handlers', () => {
    const hooks: Record<string, any> = { Stop: [{ hooks: [{ type: 'command', command: 'echo keep' }] }] };
    upsertCommandHook(hooks, 'Stop', 'takefive notify --agent codex --event task_completed --hook --quiet');
    expect(JSON.stringify(hooks)).toContain('echo keep');
    expect(JSON.stringify(hooks)).toContain('takefive notify');
    expect((hooks.Stop[0].hooks[1] as { async?: boolean }).async).toBeUndefined();

    upsertCommandHook(hooks, 'Stop', 'takefive notify --agent claude --event task_completed --hook --quiet', undefined, { isAsync: true });
    expect((hooks.Stop[0].hooks[1] as { async?: boolean }).async).toBe(true);
  });
});
