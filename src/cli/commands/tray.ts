import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import pc from 'picocolors';
import { detectLanguage, getLocaleStrings } from '../../i18n/index.js';

export interface TrayCommandDependencies {
  env?: Record<string, string | undefined>;
}

export function isTrayRunning(): boolean {
  try {
    if (process.platform === 'darwin') {
      const output = execSync('pgrep -f "TakeFiveMenuBar"', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' });
      return output.trim().length > 0;
    } else if (process.platform === 'win32') {
      const output = execSync('tasklist /fi "imagename eq TakeFiveTray.exe"', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' });
      return output.toLowerCase().includes('takefivetray.exe');
    }
  } catch {
    return false;
  }
  return false;
}

export function stopTrayProcess(): boolean {
  try {
    if (process.platform === 'darwin') {
      execSync('pkill -f "TakeFiveMenuBar"', { stdio: 'ignore' });
      return true;
    } else if (process.platform === 'win32') {
      execSync('taskkill /f /im TakeFiveTray.exe', { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function resolveTrayExecutable(env: Record<string, string | undefined> = process.env): string | null {
  const home = env.HOME || env.USERPROFILE || '';
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(new URL('.', import.meta.url));

  if (process.platform === 'darwin') {
    const candidates = [
      join(home, '.takefive', 'app', 'dist', 'TakeFiveMenuBar'),
      join(currentDir, 'TakeFiveMenuBar'),
      join(currentDir, '..', 'dist', 'TakeFiveMenuBar'),
      join(process.cwd(), 'dist', 'TakeFiveMenuBar'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  } else if (process.platform === 'win32') {
    const candidates = [
      join(home, 'AppData', 'Local', 'TakeFive', 'TakeFiveTray.exe'),
      join(currentDir, 'TakeFiveTray.exe'),
      join(currentDir, '..', 'dist', 'TakeFiveTray.exe'),
      join(process.cwd(), 'dist', 'TakeFiveTray.exe'),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export async function runTrayAction(
  action: string | undefined,
  deps: TrayCommandDependencies = {},
): Promise<void> {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);
  const act = (action || 'start').toLowerCase();

  if (act === 'stop') {
    const wasRunning = isTrayRunning();
    stopTrayProcess();
    if (wasRunning) {
      console.log(pc.green(dict.cli.tray.stopped));
    } else {
      console.log(pc.yellow(dict.cli.tray.notRunning));
    }
    return;
  }

  if (act === 'status') {
    const running = isTrayRunning();
    if (running) {
      console.log(pc.green(`✔ ${dict.cli.tray.running}`));
    } else {
      console.log(pc.gray(`○ ${dict.cli.tray.notRunning}`));
    }
    return;
  }

  // Default: start
  if (isTrayRunning()) {
    console.log(pc.yellow(dict.cli.tray.alreadyRunning));
    return;
  }

  const execPath = resolveTrayExecutable(deps.env);
  if (!execPath) {
    console.error(pc.red(dict.cli.tray.binaryNotFound));
    process.exitCode = 1;
    return;
  }

  try {
    const child = spawn(execPath, [], {
      detached: true,
      stdio: 'ignore',
      env: deps.env || process.env,
    });
    child.unref();
    console.log(pc.green(dict.cli.tray.started));
  } catch (err: unknown) {
    console.error(pc.red(`${dict.cli.tray.startFailed}: ${err instanceof Error ? err.message : String(err)}`));
    process.exitCode = 1;
  }
}

export function registerTrayCommands(program: Command, deps: TrayCommandDependencies = {}): void {
  const lang = detectLanguage(undefined, deps.env);
  const dict = getLocaleStrings(lang);

  program
    .command('tray [action]')
    .alias('menu')
    .description(dict.cli.commands.tray)
    .action(async (action?: string) => {
      await runTrayAction(action, deps);
    });
}
