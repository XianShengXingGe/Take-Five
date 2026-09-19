import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OsCredentialStore,
  type CommandRunner,
} from '../src/core/credential-store.js';

describe('OsCredentialStore', () => {
  describe('macOS platform', () => {
    it('retrieves stored Bark URL via security CLI', async () => {
      const executedCommands: string[] = [];
      const runner: CommandRunner = async (cmd, args) => {
        executedCommands.push(`${cmd} ${args.join(' ')}`);
        return { stdout: 'https://api.day.app/SECRET_KEY/\n', stderr: '', exitCode: 0 };
      };

      const store = new OsCredentialStore({ platform: 'darwin', runner });
      const url = await store.getBarkUrl();

      expect(url).toBe('https://api.day.app/SECRET_KEY/');
      expect(executedCommands[0]).toContain('security find-generic-password');
      expect(executedCommands[0]).toContain('-s com.takefive.cli');
      expect(executedCommands[0]).toContain('-a bark_url');
    });

    it('returns null when security CLI returns item not found (exit code != 0)', async () => {
      const runner: CommandRunner = async () => {
        return { stdout: '', stderr: 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.', exitCode: 44 };
      };

      const store = new OsCredentialStore({ platform: 'darwin', runner });
      const url = await store.getBarkUrl({ TAKEFIVE_HOME: '/tmp/takefive-test-empty-cred' });

      expect(url).toBeNull();
    });

    it('saves Bark URL using security add-generic-password -U', async () => {
      const executedCommands: string[] = [];
      const runner: CommandRunner = async (cmd, args) => {
        executedCommands.push(`${cmd} ${args.join(' ')}`);
        return { stdout: '', stderr: '', exitCode: 0 };
      };

      const store = new OsCredentialStore({ platform: 'darwin', runner });
      await store.setBarkUrl('https://api.day.app/NEW_KEY/');

      expect(executedCommands.length).toBe(1);
      expect(executedCommands[0]).toContain('security add-generic-password');
      expect(executedCommands[0]).toContain('-s com.takefive.cli');
      expect(executedCommands[0]).toContain('-a bark_url');
      expect(executedCommands[0]).toContain('-w https://api.day.app/NEW_KEY/');
      expect(executedCommands[0]).toContain('-U');
    });

    it('deletes Bark URL using security delete-generic-password', async () => {
      const executedCommands: string[] = [];
      const runner: CommandRunner = async (cmd, args) => {
        executedCommands.push(`${cmd} ${args.join(' ')}`);
        return { stdout: '', stderr: '', exitCode: 0 };
      };

      const store = new OsCredentialStore({ platform: 'darwin', runner });
      await store.deleteBarkUrl();

      expect(executedCommands.length).toBe(1);
      expect(executedCommands[0]).toContain('security delete-generic-password');
      expect(executedCommands[0]).toContain('-s com.takefive.cli');
      expect(executedCommands[0]).toContain('-a bark_url');
    });
  });

  describe('Windows platform', () => {
    it('prioritizes reading ~/.takefive/.credential file without invoking PowerShell', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'takefive-cred-win-fast-'));
      try {
        const credFile = join(tempDir, '.credential');
        writeFileSync(credFile, JSON.stringify({ barkUrl: 'https://api.day.app/LOCAL_FAST_KEY/' }), 'utf-8');

        const executedCommands: string[] = [];
        const runner: CommandRunner = async (cmd, args) => {
          executedCommands.push(`${cmd} ${args.join(' ')}`);
          return { stdout: '', stderr: '', exitCode: 0 };
        };

        const store = new OsCredentialStore({ platform: 'win32', runner });
        const url = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });

        expect(url).toBe('https://api.day.app/LOCAL_FAST_KEY/');
        expect(executedCommands.length).toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('falls back to PowerShell when ~/.takefive/.credential is missing', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'takefive-cred-win-missing-'));
      try {
        const executedCommands: string[] = [];
        const runner: CommandRunner = async (cmd, args) => {
          executedCommands.push(`${cmd} ${args.join(' ')}`);
          return { stdout: 'https://api.day.app/WIN_PS_KEY/\r\n', stderr: '', exitCode: 0 };
        };

        const store = new OsCredentialStore({ platform: 'win32', runner });
        const url = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });

        expect(url).toBe('https://api.day.app/WIN_PS_KEY/');
        expect(executedCommands.length).toBe(1);
        expect(executedCommands[0]).toContain('powershell');

        // And verifies it self-healed by writing the fallback file
        const credFile = join(tempDir, '.credential');
        const content = JSON.parse(readFileSync(credFile, 'utf-8'));
        expect(content.barkUrl).toBe('https://api.day.app/WIN_PS_KEY/');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('falls back to PowerShell when ~/.takefive/.credential is corrupted', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'takefive-cred-win-corrupt-'));
      try {
        const credFile = join(tempDir, '.credential');
        writeFileSync(credFile, 'corrupted JSON! {not valid', 'utf-8');

        const executedCommands: string[] = [];
        const runner: CommandRunner = async (cmd, args) => {
          executedCommands.push(`${cmd} ${args.join(' ')}`);
          return { stdout: 'https://api.day.app/RECOVERED_KEY/\r\n', stderr: '', exitCode: 0 };
        };

        const store = new OsCredentialStore({ platform: 'win32', runner });
        const url = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });

        expect(url).toBe('https://api.day.app/RECOVERED_KEY/');
        expect(executedCommands.length).toBe(1);
        expect(executedCommands[0]).toContain('powershell');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('serves subsequent getBarkUrl calls directly from in-memory cache', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'takefive-cred-mem-cache-'));
      try {
        const credFile = join(tempDir, '.credential');
        writeFileSync(credFile, JSON.stringify({ barkUrl: 'https://api.day.app/INITIAL_KEY/' }), 'utf-8');

        let runnerCallCount = 0;
        const runner: CommandRunner = async () => {
          runnerCallCount++;
          return { stdout: '', stderr: '', exitCode: 0 };
        };

        const store = new OsCredentialStore({ platform: 'win32', runner });
        const url1 = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });
        expect(url1).toBe('https://api.day.app/INITIAL_KEY/');

        // Tamper or delete file on disk - in-memory cache should still return the URL
        writeFileSync(credFile, 'deleted or corrupt', 'utf-8');
        const url2 = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });
        expect(url2).toBe('https://api.day.app/INITIAL_KEY/');
        expect(runnerCallCount).toBe(0);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('updates in-memory cache on setBarkUrl and invalidates on deleteBarkUrl', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'takefive-cred-lifecycle-'));
      try {
        let runnerCallCount = 0;
        const runner: CommandRunner = async () => {
          runnerCallCount++;
          return { stdout: '', stderr: '', exitCode: 0 };
        };

        const store = new OsCredentialStore({ platform: 'win32', runner });
        await store.setBarkUrl('https://api.day.app/NEW_WIN_KEY/', { TAKEFIVE_HOME: tempDir });

        // First get should read memory cache directly (no runner calls)
        const callsBefore = runnerCallCount;
        const url = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });
        expect(url).toBe('https://api.day.app/NEW_WIN_KEY/');
        expect(runnerCallCount).toBe(callsBefore);

        // Delete should invalidate memory and file
        await store.deleteBarkUrl({ TAKEFIVE_HOME: tempDir });
        const urlAfterDelete = await store.getBarkUrl({ TAKEFIVE_HOME: tempDir });
        expect(urlAfterDelete).toBeNull();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('saves and deletes Bark URL on Windows', async () => {
      const executedCommands: string[] = [];
      const runner: CommandRunner = async (cmd, args) => {
        executedCommands.push(`${cmd} ${args.join(' ')}`);
        return { stdout: '', stderr: '', exitCode: 0 };
      };

      const store = new OsCredentialStore({ platform: 'win32', runner });
      await store.setBarkUrl('https://api.day.app/WIN_KEY/');
      await store.deleteBarkUrl();

      expect(executedCommands.length).toBe(2);
    });
  });

  describe('Unsupported platforms (e.g. Linux, BSD)', () => {
    it('reports isSupported() as false', () => {
      const store = new OsCredentialStore({ platform: 'linux' });
      expect(store.isSupported()).toBe(false);
      expect(store.getPlatform()).toBe('linux');
    });

    it('returns null when getBarkUrl is called', async () => {
      const store = new OsCredentialStore({ platform: 'linux' });
      const url = await store.getBarkUrl();
      expect(url).toBeNull();
    });

    it('throws an informative error when setBarkUrl is invoked', async () => {
      const store = new OsCredentialStore({ platform: 'linux' });
      await expect(store.setBarkUrl('https://api.day.app/KEY/')).rejects.toThrow(
        /Unsupported platform "linux": OS-level secure credential storage requires macOS Keychain or Windows Credential Manager/,
      );
    });

    it('handles deleteBarkUrl safely without throwing', async () => {
      const store = new OsCredentialStore({ platform: 'linux' });
      await expect(store.deleteBarkUrl()).resolves.toBeUndefined();
    });
  });
});
