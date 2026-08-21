import { describe, expect, it } from 'vitest';
import { mergeHookCommand, stripHookCommand } from '../src/adapters/hook-utils.js';

describe('hook-utils', () => {
  describe('mergeHookCommand', () => {
    it('returns takeFiveCmd when existing is undefined, null, or empty string', () => {
      const cmd = 'takefive notify --agent claude --event task_completed';
      expect(mergeHookCommand(undefined, cmd)).toBe(cmd);
      expect(mergeHookCommand(null, cmd)).toBe(cmd);
      expect(mergeHookCommand('', cmd)).toBe(cmd);
      expect(mergeHookCommand('   ', cmd)).toBe(cmd);
    });

    it('returns existing command untouched if it already includes takeFiveCmd', () => {
      const cmd = 'takefive notify --agent claude --event task_completed';
      expect(mergeHookCommand(cmd, cmd)).toBe(cmd);
      expect(mergeHookCommand(`echo "done" && ${cmd}`, cmd)).toBe(`echo "done" && ${cmd}`);
    });

    it('chains existing command with && when command is not present', () => {
      const cmd = 'takefive notify --agent claude --event task_completed';
      const existing = 'npm test';
      expect(mergeHookCommand(existing, cmd)).toBe('npm test && takefive notify --agent claude --event task_completed');
    });
  });

  describe('stripHookCommand', () => {
    it('returns undefined when input is not a string', () => {
      expect(stripHookCommand(undefined)).toBeUndefined();
      expect(stripHookCommand(null)).toBeUndefined();
      expect(stripHookCommand(123)).toBeUndefined();
    });

    it('returns undefined when the entire command is the takefive command', () => {
      expect(stripHookCommand('takefive notify --agent claude --event task_completed')).toBeUndefined();
      expect(stripHookCommand('  takefive notify --agent opencode --event waiting_input  ')).toBeUndefined();
    });

    it('removes only the takefive command from chained commands', () => {
      const chained = 'echo "start" && takefive notify --agent claude --event task_completed && npm run build';
      expect(stripHookCommand(chained)).toBe('echo "start" && npm run build');
    });

    it('preserves other user commands if takefive is not present', () => {
      const cmd = 'pytest && make deploy';
      expect(stripHookCommand(cmd)).toBe('pytest && make deploy');
    });
  });
});
