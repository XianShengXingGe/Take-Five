import { describe, expect, it } from 'vitest';
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
      const url = await store.getBarkUrl();

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
    it('retrieves stored Bark URL via PowerShell Credential Manager', async () => {
      const executedCommands: string[] = [];
      const runner: CommandRunner = async (cmd, args) => {
        executedCommands.push(`${cmd} ${args.join(' ')}`);
        return { stdout: 'https://api.day.app/WIN_KEY/\r\n', stderr: '', exitCode: 0 };
      };

      const store = new OsCredentialStore({ platform: 'win32', runner });
      const url = await store.getBarkUrl();

      expect(url).toBe('https://api.day.app/WIN_KEY/');
      expect(executedCommands[0]).toContain('powershell');
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
});
