import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Windows release packaging', () => {
  it('builds a zip with a double-click installer and quick management entry', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'build-windows.ps1'), 'utf-8');
    expect(source).toContain('Install Take Five.cmd');
    expect(source).toContain('Manage Take Five.cmd');
    expect(source).toContain('Compress-Archive');
    expect(source).toContain('takefive.cmd');
    expect(source).toContain('SetEnvironmentVariable');
    expect(source).toContain('TakeFive.exe');
    expect(source).toContain('runtime');
    expect(source).toContain('node.exe');
  });

  it('declares embedded runtime contract in Windows tray application', () => {
    const windowsDir = join(process.cwd(), 'src', 'desktop', 'windows');
    const csSource = readdirSync(windowsDir)
      .filter((f) => f.endsWith('.cs'))
      .map((f) => readFileSync(join(windowsDir, f), 'utf-8'))
      .join('\n');
    expect(csSource).toContain('GetEmbeddedRuntimeDir');
    expect(csSource).toContain('GetEmbeddedNodePath');
    expect(csSource).toContain('node.exe');
    expect(csSource).toContain('takefive.cmd');
  });

  it('configures single-file compression in TakeFive.csproj', () => {
    const csproj = readFileSync(join(process.cwd(), 'src', 'desktop', 'windows', 'TakeFive.csproj'), 'utf-8');
    expect(csproj).toContain('<EnableCompressionInSingleFile>true</EnableCompressionInSingleFile>');
  });

  it('supports dual-architecture (win-x64 & win-arm64) in build-windows.sh', () => {
    const bashSource = readFileSync(join(process.cwd(), 'scripts', 'build-windows.sh'), 'utf-8');
    expect(bashSource).toContain('win-x64');
    expect(bashSource).toContain('win-arm64');
    expect(bashSource).toContain('-p:EnableCompressionInSingleFile=true');
    expect(bashSource).toContain('https://nodejs.org/dist/v20.18.0/${ARCH}/node.exe');
    expect(bashSource).toContain('TakeFive-v${VERSION}-${ARCH}.zip');
    expect(bashSource).not.toContain('$APP_FOLDER/TakeFiveTray.exe');
    expect(bashSource).not.toContain('.takefive_bundle');
  });

  it('supports dual-architecture (win-x64 & win-arm64) in build-windows.ps1', () => {
    const psSource = readFileSync(join(process.cwd(), 'scripts', 'build-windows.ps1'), 'utf-8');
    expect(psSource).toContain("'win-x64'");
    expect(psSource).toContain("'win-arm64'");
    expect(psSource).toContain('-p:EnableCompressionInSingleFile=true');
    expect(psSource).toContain('https://nodejs.org/dist/v20.18.0/$Arch/node.exe');
    expect(psSource).toContain('TakeFive-v$Version-$Arch.zip');
    expect(psSource).not.toContain("(Join-Path $AppFolder 'TakeFiveTray.exe')");
    expect(psSource).not.toContain('.takefive_bundle');
  });
});
