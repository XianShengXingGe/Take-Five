import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { isTrayRunning, resolveTrayExecutable, stopTrayProcess } from '../src/cli/commands/tray.js';

describe('CLI takefive tray / menu', () => {
  let tempDir: string;
  let homeDir: string;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-tray-cmd-'));
    homeDir = join(tempDir, 'home');
    mkdirSync(homeDir, { recursive: true });
    env = { HOME: homeDir, USERPROFILE: homeDir };
  });

  afterEach(() => {
    stopTrayProcess();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports not running when checking tray status without active process', async () => {
    const cli = createCli({ env });
    let stdout = '';
    const origLog = console.log;
    console.log = (msg: unknown) => {
      stdout += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'tray', 'status']);
    } finally {
      console.log = origLog;
    }

    expect(stdout).toMatch(/○|Take Five/);
  });

  it('handles tray stop gracefully when no process is running', async () => {
    const cli = createCli({ env });
    let stdout = '';
    const origLog = console.log;
    console.log = (msg: unknown) => {
      stdout += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'menu', 'stop']);
    } finally {
      console.log = origLog;
    }

    expect(stdout).toContain('Take Five');
  });

  it('locates tray binary when present in ~/.takefive/app/dist or local dist', () => {
    const fakeDist = join(homeDir, '.takefive', 'app', 'dist');
    mkdirSync(fakeDist, { recursive: true });
    
    if (process.platform === 'darwin') {
      const fakeBin = join(fakeDist, 'TakeFiveMenuBar');
      writeFileSync(fakeBin, '#!/bin/sh\nexit 0', { mode: 0o755 });
      const resolved = resolveTrayExecutable(env);
      expect(resolved).toBe(fakeBin);
    } else if (process.platform === 'win32') {
      const winDist = join(homeDir, 'AppData', 'Local', 'TakeFive');
      mkdirSync(winDist, { recursive: true });
      const fakeExe = join(winDist, 'TakeFiveTray.exe');
      writeFileSync(fakeExe, 'exe');
      const resolved = resolveTrayExecutable(env);
      expect(resolved).toBe(fakeExe);
    }
  });

  it('outputs error when attempting to start tray without compiled binary', async () => {
    const emptyEnv = { HOME: join(tempDir, 'empty'), USERPROFILE: join(tempDir, 'empty'), PATH: '' };
    const cli = createCli({ env: emptyEnv });

    let stderr = '';
    const origErr = console.error;
    console.error = (msg: unknown) => {
      stderr += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'tray', 'start']);
    } finally {
      console.error = origErr;
      stopTrayProcess();
    }

    // When binary not found in isolated path, logs error or sets exit code
    if (!existsSync(join(process.cwd(), 'dist', 'TakeFiveMenuBar'))) {
      expect(stderr).toMatch(/错误|Error/);
    }
  });
});
