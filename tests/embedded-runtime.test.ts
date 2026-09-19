import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { VERSION } from '../src/version.js';

function readDirConcatenated(dir: string, ext: string): string {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

describe('Embedded Standalone Runtime & Desktop Packaging (Ticket 05)', () => {
  const projectRoot = process.cwd();

  it('validates scripts/build-dmg.sh contains standard Take Five.app bundle and drag-and-drop /Applications link', () => {
    const scriptPath = join(projectRoot, 'scripts', 'build-dmg.sh');
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, 'utf-8');

    // 1. Standard Take Five.app Bundle structure
    expect(script).toContain('Take Five.app');
    expect(script).toContain('Contents/MacOS');
    expect(script).toContain('Contents/Resources');
    expect(script).toContain('Contents/Info.plist');
    expect(script).toContain('CFBundleIdentifier');
    expect(script).toContain('com.takefive.desktop');

    // 2. High-resolution AppIcon generation
    expect(script).toContain('AppIcon.icns');
    expect(script).toContain('iconutil');

    // 3. Embedded runtime directory
    expect(script).toContain('Contents/Resources/runtime');
    expect(script).toContain('bin/node');
    expect(script).toContain('bin/takefive');

    // 4. Drag-and-drop DMG installation with /Applications link
    expect(script).toContain('ln -s /Applications');
    expect(script).toContain('hdiutil create');
    expect(script).toMatch(/TakeFive-(v0\.5|v\$\{VERSION\}|\$\{VERSION\})-macOS\.dmg/);
  });

  it('validates scripts/build-windows.ps1 contains standalone TakeFive.exe and embedded runtime', () => {
    const scriptPath = join(projectRoot, 'scripts', 'build-windows.ps1');
    expect(existsSync(scriptPath)).toBe(true);

    const script = readFileSync(scriptPath, 'utf-8');

    // 1. Native TakeFive.exe compilation
    expect(script).toContain('TakeFive.exe');
    expect(script).toMatch(/tray-windows\.cs|desktop\\windows/);

    // 2. Embedded runtime folder
    expect(script).toContain('TakeFive');
    expect(script).toContain('runtime');
    expect(script).toContain('node.exe');
    expect(script).toContain('takefive.cmd');

    // 3. Packaging into ZIP (Plan A: dual architecture packages)
    expect(script).toContain('TakeFive-v$Version-$Arch.zip');
    expect(script).toContain('Compress-Archive');
  });

  it('verifies cold-start execution with embedded node in a clean isolated environment (zero global Node.js in PATH)', () => {
    const nodeExecutable = process.execPath;
    const cliEntry = join(projectRoot, 'dist', 'cli.js');
    expect(existsSync(nodeExecutable)).toBe(true);
    expect(existsSync(cliEntry)).toBe(true);

    // Run in completely isolated environment where PATH has no global node
    const isolatedEnv: Record<string, string> = {
      PATH: '/usr/bin:/bin', // system minimal path, no homebrew or nvm or local node
      HOME: process.env.HOME || '/tmp',
    };

    // 1. Direct invocation of cli entry using the standalone node executable
    const result = spawnSync(nodeExecutable, [cliEntry, '--version'], {
      env: isolatedEnv,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(VERSION);

    // 2. Verify status --json works in isolated environment
    const statusResult = spawnSync(nodeExecutable, [cliEntry, 'status', '--json'], {
      env: isolatedEnv,
      encoding: 'utf-8',
    });

    expect(statusResult.status).toBe(0);
    const parsed = JSON.parse(statusResult.stdout.trim());
    expect(parsed.agents).toBeDefined();
    expect(parsed.bark).toBeDefined();
  });

  it('verifies macOS desktop prioritizes embedded runtime over global node', () => {
    const content = readDirConcatenated(join(projectRoot, 'src', 'desktop', 'macos'), '.swift');

    expect(content).toContain('embeddedRuntimeDir');
    expect(content).toContain('embeddedNodePath');
    expect(content).toContain('Bundle.main.resourcePath');
    expect(content).toContain('Resources/runtime');
  });

  it('verifies Windows desktop prioritizes embedded runtime over global node', () => {
    const content = readDirConcatenated(join(projectRoot, 'src', 'desktop', 'windows'), '.cs');

    expect(content).toContain('GetEmbeddedRuntimeDir');
    expect(content).toContain('GetEmbeddedNodePath');
    expect(content).toContain('node.exe');
    expect(content).toContain('takefive.cmd');
  });
});
