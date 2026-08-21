import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  KEYCHAIN_BARK_URL_ACCOUNT,
  KEYCHAIN_SERVICE_NAME,
  type CredentialStore,
} from '../types/credential.js';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  file: string,
  args: string[],
) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (file, args) => {
  try {
    const result = await execFileAsync(file, args, { encoding: 'utf-8' });
    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: 0,
    };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? '',
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
    };
  }
};

export interface OsCredentialStoreOptions {
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  serviceName?: string;
  accountName?: string;
}

/**
 * Production CredentialStore implementation using macOS Keychain and Windows Credential Manager.
 */
export class OsCredentialStore implements CredentialStore {
  private platform: NodeJS.Platform;
  private runner: CommandRunner;
  private serviceName: string;
  private accountName: string;

  constructor(options: OsCredentialStoreOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runner ?? defaultRunner;
    this.serviceName = options.serviceName ?? KEYCHAIN_SERVICE_NAME;
    this.accountName = options.accountName ?? KEYCHAIN_BARK_URL_ACCOUNT;
  }

  async getBarkUrl(): Promise<string | null> {
    if (this.platform === 'darwin') {
      const result = await this.runner('security', [
        'find-generic-password',
        '-s',
        this.serviceName,
        '-a',
        this.accountName,
        '-w',
      ]);

      if (result.exitCode === 0 && result.stdout) {
        return result.stdout.trim();
      }
      return null;
    }

    if (this.platform === 'win32') {
      const target = `${this.serviceName}:${this.accountName}`;
      const psScript = `
        $target = "${target}";
        Add-Type -AssemblyName System.Security;
        $cred = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new().Retrieve($target, "${this.accountName}");
        if ($cred) { $cred.Password }
      `.trim();

      const result = await this.runner('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ]);

      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return result.stdout.trim();
      }
      return null;
    }

    return null;
  }

  async setBarkUrl(url: string): Promise<void> {
    if (this.platform === 'darwin') {
      const result = await this.runner('security', [
        'add-generic-password',
        '-s',
        this.serviceName,
        '-a',
        this.accountName,
        '-w',
        url,
        '-U',
      ]);

      if (result.exitCode !== 0) {
        throw new Error(`Failed to save Bark URL to macOS Keychain: ${result.stderr}`);
      }
      return;
    }

    if (this.platform === 'win32') {
      const target = `${this.serviceName}:${this.accountName}`;
      const psScript = `
        $target = "${target}";
        $user = "${this.accountName}";
        $url = "${url}";
        Add-Type -AssemblyName System.Security;
        $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();
        try {
          $existing = $vault.Retrieve($target, $user);
          if ($existing) { $vault.Remove($existing); }
        } catch {}
        $cred = [Windows.Security.Credentials.PasswordCredential,Windows.Security.Credentials,ContentType=WindowsRuntime]::new($target, $user, $url);
        $vault.Add($cred);
      `.trim();

      const result = await this.runner('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ]);

      if (result.exitCode !== 0) {
        throw new Error(`Failed to save Bark URL to Windows Credential Manager: ${result.stderr}`);
      }
      return;
    }
  }

  async deleteBarkUrl(): Promise<void> {
    if (this.platform === 'darwin') {
      const result = await this.runner('security', [
        'delete-generic-password',
        '-s',
        this.serviceName,
        '-a',
        this.accountName,
      ]);

      // Ignore exitCode != 0 (e.g. item not found when deleting)
      return;
    }

    if (this.platform === 'win32') {
      const target = `${this.serviceName}:${this.accountName}`;
      const psScript = `
        $target = "${target}";
        Add-Type -AssemblyName System.Security;
        $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();
        try {
          $cred = $vault.Retrieve($target, "${this.accountName}");
          if ($cred) { $vault.Remove($cred); }
        } catch {}
      `.trim();

      await this.runner('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ]);
    }
  }
}
