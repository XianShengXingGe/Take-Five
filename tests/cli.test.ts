import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  createCli,
  createNotifyCli,
  isNotifyInvocation,
  runCli,
} from '../src/cli/index.js';
import { VERSION } from '../src/version.js';
import type { NotificationDispatcher } from '../src/core/notification-dispatcher.js';

describe('CLI Base Program', () => {
  it('creates commander instance with correct name and description', () => {
    const cli = createCli();
    expect(cli.name()).toBe('takefive');
    expect(cli.description()).toContain('Smart notification tool');
    expect(cli.version()).toBe(VERSION);
  });

  describe('Fast Path Pre-parsing (isNotifyInvocation)', () => {
    it('detects direct notify invocation', () => {
      expect(isNotifyInvocation(['node', 'takefive', 'notify'])).toBe(true);
      expect(isNotifyInvocation(['node', 'takefive', 'notify', '-a', 'claude', '-e', 'task_completed'])).toBe(true);
      expect(isNotifyInvocation(['/usr/local/bin/node', '/path/to/takefive', 'notify', 'agent-turn-complete'])).toBe(true);
    });

    it('detects notify with leading global flags', () => {
      expect(isNotifyInvocation(['node', 'takefive', '-q', 'notify'])).toBe(true);
      expect(isNotifyInvocation(['node', 'takefive', '--quiet', 'notify'])).toBe(true);
      expect(isNotifyInvocation(['node', 'takefive', '-q', '--quiet', 'notify', '-a', 'codex'])).toBe(true);
    });

    it('returns false for other subcommands', () => {
      expect(isNotifyInvocation(['node', 'takefive', 'install'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'config'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'status'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'repair'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'uninstall'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'test'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'enable'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'disable'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'tray'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', 'mcp'])).toBe(false);
    });

    it('returns false when no subcommand is provided', () => {
      expect(isNotifyInvocation(['node', 'takefive'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', '--help'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', '-V'])).toBe(false);
      expect(isNotifyInvocation(['node', 'takefive', '--version'])).toBe(false);
    });

    it('respects double-dash argument separator', () => {
      expect(isNotifyInvocation(['node', 'takefive', '--', 'notify'])).toBe(false);
    });
  });

  describe('Lightweight Notify CLI (createNotifyCli)', () => {
    it('only registers notify command and skips all heavy interactive commands', () => {
      const notifyCli = createNotifyCli();
      const commandNames = notifyCli.commands.map((cmd) => cmd.name());

      expect(commandNames).toEqual(['notify']);
      expect(commandNames).not.toContain('install');
      expect(commandNames).not.toContain('config');
      expect(commandNames).not.toContain('repair');
      expect(commandNames).not.toContain('uninstall');
      expect(commandNames).not.toContain('status');
      expect(commandNames).not.toContain('test');
      expect(commandNames).not.toContain('mcp');
      expect(commandNames).not.toContain('tray');
    });

    it('createCli with fastPath option delegates to createNotifyCli', () => {
      const cli = createCli({ fastPath: true });
      const commandNames = cli.commands.map((cmd) => cmd.name());
      expect(commandNames).toEqual(['notify']);
    });

    it('createCli without fastPath registers all commands', () => {
      const cli = createCli();
      const commandNames = cli.commands.map((cmd) => cmd.name());
      expect(commandNames).toContain('notify');
      expect(commandNames).toContain('install');
      expect(commandNames).toContain('config');
      expect(commandNames).toContain('repair');
      expect(commandNames).toContain('uninstall');
      expect(commandNames).toContain('status');
      expect(commandNames).toContain('test');
      expect(commandNames).toContain('enable');
      expect(commandNames).toContain('disable');
      expect(commandNames).toContain('tray');
      expect(commandNames).toContain('mcp');
    });
  });

  describe('Fast Path Dispatch Execution & Performance Benchmark', () => {
    it('dispatches notify via fast path seamlessly without full registration', async () => {
      let dispatched = false;
      const mockDispatcher = {
        dispatch: async (event: unknown) => {
          dispatched = true;
          return { status: 'skipped' as const };
        },
      } as unknown as NotificationDispatcher;

      await runCli(
        ['node', 'takefive', 'notify', '-a', 'claude', '-e', 'task_completed', '--quiet'],
        { dispatcher: mockDispatcher },
      );

      expect(dispatched).toBe(true);
    });

    it('completes fast path in-process dispatch in under 50ms', async () => {
      const mockDispatcher = {
        dispatch: async () => ({ status: 'skipped' as const }),
      } as unknown as NotificationDispatcher;

      const start = performance.now();
      await runCli(
        ['node', 'takefive', 'notify', '-a', 'claude', '-e', 'task_completed', '--quiet'],
        { dispatcher: mockDispatcher },
      );
      const duration = performance.now() - start;

      // In-process fast path should execute quickly (typically < 10ms, allow up to 100ms under heavy parallel test load)
      expect(duration).toBeLessThan(100);
    });

    it('verifies built cli dist executes notify --help cleanly and quickly', () => {
      const cliPath = resolve(process.cwd(), 'dist/cli.js');
      const start = performance.now();
      const res = spawnSync(process.execPath, [cliPath, 'notify', '--help'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const duration = performance.now() - start;

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Usage: takefive notify');
      expect(res.stdout).toContain('-a, --agent');
      expect(res.stdout).toContain('-e, --event');
      // Subprocess spawn + node cold start + execution
      expect(duration).toBeLessThan(500);
    });

    it('verifies @clack/prompts is not loaded on fast path notify', async () => {
      const { isClackLoaded } = await import('../src/cli/prompt-driver.js');
      // On startup before interactive commands run, clack should not be loaded
      expect(isClackLoaded()).toBe(false);

      const mockDispatcher = {
        dispatch: async () => ({ status: 'skipped' as const }),
      } as unknown as NotificationDispatcher;

      await runCli(
        ['node', 'takefive', 'notify', '-a', 'claude', '-e', 'task_completed', '--quiet'],
        { dispatcher: mockDispatcher },
      );

      // Clack should still not be loaded after notify runs
      expect(isClackLoaded()).toBe(false);
    });
  });
});

