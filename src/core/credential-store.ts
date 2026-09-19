import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  KEYCHAIN_BARK_URL_ACCOUNT,
  KEYCHAIN_SERVICE_NAME,
  type CredentialStore,
} from '../types/credential.js';
import { getTakeFiveHome } from './paths.js';

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

function escapePsString(str: string): string {
  return str.replace(/[`"$]/g, '`$&');
}

function getFallbackCredPath(env?: Record<string, string | undefined>): string {
  return join(getTakeFiveHome(env), '.credential');
}

function readFallbackBarkUrl(env?: Record<string, string | undefined>): string | null {
  try {
    const filePath = getFallbackCredPath(env);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (typeof parsed?.barkUrl === 'string' && parsed.barkUrl.trim().length > 0) {
      return parsed.barkUrl.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

function writeFallbackBarkUrl(url: string, env?: Record<string, string | undefined>): void {
  try {
    const dir = getTakeFiveHome(env);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const filePath = getFallbackCredPath(env);
    writeFileSync(filePath, JSON.stringify({ barkUrl: url, updatedAt: Date.now() }, null, 2) + '\n', {
      encoding: 'utf-8',
      mode: 0o600,
    });
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function deleteFallbackBarkUrl(env?: Record<string, string | undefined>): void {
  try {
    const filePath = getFallbackCredPath(env);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
  } catch {
    // ignore
  }
}

export interface OsCredentialStoreOptions {
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
  serviceName?: string;
  accountName?: string;
}

/**
 * Production CredentialStore implementation using macOS Keychain and Windows Credential Manager
 * with a secure local ~/.takefive/.credential fallback to ensure URLs are never lost during upgrades.
 */
export class OsCredentialStore implements CredentialStore {
  private platform: NodeJS.Platform;
  private runner: CommandRunner;
  private serviceName: string;
  private accountName: string;
  private cachedBarkUrl: string | null = null;

  constructor(options: OsCredentialStoreOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runner ?? defaultRunner;
    this.serviceName = options.serviceName ?? KEYCHAIN_SERVICE_NAME;
    this.accountName = options.accountName ?? KEYCHAIN_BARK_URL_ACCOUNT;
  }

  isSupported(): boolean {
    return this.platform === 'darwin' || this.platform === 'win32';
  }

  getPlatform(): NodeJS.Platform {
    return this.platform;
  }

  async getBarkUrl(env?: Record<string, string | undefined>): Promise<string | null> {
    if (this.cachedBarkUrl) {
      return this.cachedBarkUrl;
    }

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
        const url = result.stdout.trim();
        if (url.length > 0) {
          writeFallbackBarkUrl(url, env);
          this.cachedBarkUrl = url;
          return url;
        }
      }

      // Fallback: check ~/.takefive/.credential
      const fallbackUrl = readFallbackBarkUrl(env);
      if (fallbackUrl) {
        // Attempt self-healing to OS store
        try {
          await this.runner('security', [
            'add-generic-password',
            '-s',
            this.serviceName,
            '-a',
            this.accountName,
            '-w',
            fallbackUrl,
            '-U',
          ]);
        } catch {
          // ignore
        }
        this.cachedBarkUrl = fallbackUrl;
        return fallbackUrl;
      }

      return null;
    }

    if (this.platform === 'win32') {
      // 1. Fast path: try reading persisted ~/.takefive/.credential (0o600 file) first
      const fileUrl = readFallbackBarkUrl(env);
      if (fileUrl) {
        this.cachedBarkUrl = fileUrl;
        return fileUrl;
      }

      // 2. Fallback: file missing or corrupted -> query Windows Credential Manager via PowerShell
      const target = escapePsString(`${this.serviceName}:${this.accountName}`);
      const user = escapePsString(this.accountName);
      const psScript = `
        $target = "${target}";
        Add-Type -AssemblyName System.Security;
        try {
          $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();
          $cred = $vault.Retrieve($target, "${user}");
          if ($cred) { $cred.Password }
        } catch {}
      `.trim();

      const result = await this.runner('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ]);

      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        const url = result.stdout.trim();
        writeFallbackBarkUrl(url, env);
        this.cachedBarkUrl = url;
        return url;
      }

      return null;
    }

    return null;
  }

  async setBarkUrl(url: string, env?: Record<string, string | undefined>): Promise<void> {
    this.cachedBarkUrl = url;
    writeFallbackBarkUrl(url, env);

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
      const target = escapePsString(`${this.serviceName}:${this.accountName}`);
      const user = escapePsString(this.accountName);
      const safeUrl = escapePsString(url);
      const psScript = `
        $target = "${target}";
        $user = "${user}";
        $url = "${safeUrl}";
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

    throw new Error(
      `Unsupported platform "${this.platform}": OS-level secure credential storage requires macOS Keychain or Windows Credential Manager.`,
    );
  }

  async deleteBarkUrl(env?: Record<string, string | undefined>): Promise<void> {
    this.cachedBarkUrl = null;
    deleteFallbackBarkUrl(env);

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
      const target = escapePsString(`${this.serviceName}:${this.accountName}`);
      const user = escapePsString(this.accountName);
      const psScript = `
        $target = "${target}";
        $user = "${user}";
        Add-Type -AssemblyName System.Security;
        $vault = [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();
        try {
          $cred = $vault.Retrieve($target, $user);
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
