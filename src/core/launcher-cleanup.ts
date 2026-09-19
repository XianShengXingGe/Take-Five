import { execFile } from 'node:child_process';
import { lstat, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MACOS_PATH_BLOCK = /^# Take Five PATH\r?\nexport PATH="\$HOME\/\.local\/bin:\$PATH"\r?\n?/gm;

export type PowerShellRunner = (script: string) => Promise<void>;

const defaultPowerShellRunner: PowerShellRunner = async (script) => {
  await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      windowsHide: true,
    },
  );
};

/** Removes launchers created by the macOS and Windows installers. */
export async function cleanupUserLaunchers(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  runPowerShell: PowerShellRunner = defaultPowerShellRunner,
): Promise<void> {
  const home = env.USERPROFILE?.trim() || env.HOME?.trim() || homedir();

  if (platform === 'darwin') {
    // Terminate any running menu bar process
    try {
      await execFileAsync('pkill', ['-f', 'TakeFiveMenuBar']);
    } catch {}

    const launchAgent = join(home, 'Library', 'LaunchAgents', 'com.takefive.menubar.plist');
    await rm(launchAgent, { force: true });

    const launcher = join(home, '.local', 'bin', 'takefive');
    await rm(launcher, { force: true });

    for (const rcName of ['.zshrc', '.bash_profile']) {
      const rcPath = join(home, rcName);
      try {
        const source = await readFile(rcPath, 'utf-8');
        const cleaned = source.replace(MACOS_PATH_BLOCK, '');
        if (cleaned !== source) await writeFile(rcPath, cleaned, 'utf-8');
      } catch {
        // The shell profile may not exist or may not be writable.
      }
    }

    // Remove the optional system link only when it points to Take Five's user launcher.
    const systemLink = '/usr/local/bin/takefive';
    try {
      const stats = await lstat(systemLink);
      if (stats.isSymbolicLink()) {
        const target = resolve('/usr/local/bin', await readlink(systemLink));
        if (target === resolve(launcher)) await rm(systemLink, { force: true });
      }
    } catch {
      // The link is optional and may be outside the user's write permissions.
    }
    return;
  }

  if (platform === 'win32') {
    // Terminate any running tray process
    try {
      await execFileAsync('taskkill', ['/f', '/im', 'TakeFiveTray.exe']);
    } catch {}

    const startupLink = join(
      home,
      'AppData',
      'Roaming',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'TakeFiveTray.lnk',
    );
    await rm(startupLink, { force: true });

    const localAppData = env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local');
    const installRoot = join(localAppData, 'TakeFive');
    const binDir = join(installRoot, 'bin');
    const escaped = binDir.replace(/'/g, "''");
    try {
      await runPowerShell(
        `$bin = '${escaped}'; ` +
        `$path = [Environment]::GetEnvironmentVariable('Path', 'User'); ` +
        `$next = (($path -split ';') | Where-Object { $_ -and $_ -ne $bin }) -join ';'; ` +
        `[Environment]::SetEnvironmentVariable('Path', $next, 'User')`,
      );
    } finally {
      await rm(installRoot, { recursive: true, force: true });
    }
  }
}
