import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupUserLaunchers } from '../src/core/launcher-cleanup.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('launcher cleanup', () => {
  it('removes only the Take Five macOS launcher', async () => {
    const home = mkdtempSync(join(tmpdir(), 'takefive-launcher-mac-'));
    roots.push(home);
    const bin = join(home, '.local', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'takefive'), 'owned');
    writeFileSync(join(bin, 'other-tool'), 'keep');
    writeFileSync(
      join(home, '.zshrc'),
      '# custom\nexport PATH="/custom/bin:$PATH"\n# Take Five PATH\nexport PATH="$HOME/.local/bin:$PATH"\n',
    );
    await cleanupUserLaunchers({ HOME: home }, 'darwin');
    expect(existsSync(join(bin, 'takefive'))).toBe(false);
    expect(existsSync(join(bin, 'other-tool'))).toBe(true);
    expect(readFileSync(join(home, '.zshrc'), 'utf-8')).toBe(
      '# custom\nexport PATH="/custom/bin:$PATH"\n',
    );
  });

  it('removes the dedicated Windows launcher directory', async () => {
    const home = mkdtempSync(join(tmpdir(), 'takefive-launcher-win-'));
    roots.push(home);
    const localAppData = join(home, 'AppData', 'Local');
    const bin = join(localAppData, 'TakeFive', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'takefive.cmd'), 'owned');
    await cleanupUserLaunchers({ USERPROFILE: home, LOCALAPPDATA: localAppData }, 'win32', async () => undefined);
    expect(existsSync(join(localAppData, 'TakeFive'))).toBe(false);
  });
});
