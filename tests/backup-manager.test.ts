import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupManager } from '../src/adapters/backup-manager.js';

describe('BackupManager', () => {
  let tempDir: string;
  let backupManager: BackupManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-backup-test-'));
    backupManager = new BackupManager();
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns standard .takefive.bak path', () => {
    const target = join(tempDir, 'config.json');
    expect(backupManager.getBackupPath(target)).toBe(`${target}.takefive.bak`);
  });

  it('creates backup for existing file', async () => {
    const target = join(tempDir, 'config.json');
    const originalContent = { customKey: 'customValue', hooks: { myHook: 'echo 1' } };
    writeFileSync(target, JSON.stringify(originalContent, null, 2));

    const backupPath = await backupManager.createBackup(target);
    expect(backupPath).toBe(`${target}.takefive.bak`);
    expect(existsSync(backupPath!)).toBe(true);

    const backupContent = JSON.parse(readFileSync(backupPath!, 'utf-8'));
    expect(backupContent).toEqual(originalContent);
  });

  it('preserves existing pristine backup on repeated createBackup calls', async () => {
    const target = join(tempDir, 'config.json');
    const initialContent = { version: 1 };
    writeFileSync(target, JSON.stringify(initialContent));

    await backupManager.createBackup(target);

    // Modify target file
    const modifiedContent = { version: 2, mutated: true };
    writeFileSync(target, JSON.stringify(modifiedContent));

    // Call createBackup again
    const secondBackup = await backupManager.createBackup(target);
    expect(secondBackup).toBe(`${target}.takefive.bak`);

    // Backup content should still be the initial version
    const backupContent = JSON.parse(readFileSync(secondBackup!, 'utf-8'));
    expect(backupContent).toEqual(initialContent);
  });

  it('returns null when creating backup for non-existent file', async () => {
    const target = join(tempDir, 'non-existent.json');
    const backupPath = await backupManager.createBackup(target);
    expect(backupPath).toBeNull();
    expect(await backupManager.hasBackup(target)).toBe(false);
  });

  it('atomically writes and reads json', async () => {
    const target = join(tempDir, 'nested', 'config.json');
    const data = { hello: 'world', count: 42 };

    await backupManager.atomicWriteJson(target, data);
    expect(existsSync(target)).toBe(true);

    const read = await backupManager.readJson(target);
    expect(read).toEqual(data);
  });

  it('restores backup and removes backup file', async () => {
    const target = join(tempDir, 'config.json');
    const pristineData = { original: true };
    writeFileSync(target, JSON.stringify(pristineData));

    await backupManager.createBackup(target);

    // Mutate target
    writeFileSync(target, JSON.stringify({ original: false, corrupted: true }));

    // Restore
    const restored = await backupManager.restoreBackup(target);
    expect(restored).toBe(true);

    const content = JSON.parse(readFileSync(target, 'utf-8'));
    expect(content).toEqual(pristineData);
    expect(await backupManager.hasBackup(target)).toBe(false);
  });

  it('returns false when attempting to restore non-existent backup', async () => {
    const target = join(tempDir, 'config.json');
    const restored = await backupManager.restoreBackup(target);
    expect(restored).toBe(false);
  });
});
