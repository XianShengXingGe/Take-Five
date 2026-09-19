import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class BackupManager {
  getBackupPath(filePath: string): string {
    return `${filePath}.takefive.bak`;
  }

  async hasBackup(filePath: string): Promise<boolean> {
    try {
      await stat(this.getBackupPath(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createBackup(filePath: string): Promise<string | null> {
    const backupPath = this.getBackupPath(filePath);
    if (await this.hasBackup(filePath)) {
      return backupPath;
    }
    if (!(await this.fileExists(filePath))) {
      return null;
    }
    await copyFile(filePath, backupPath);
    return backupPath;
  }

  async restoreBackup(filePath: string): Promise<boolean> {
    const backupPath = this.getBackupPath(filePath);
    if (!(await this.hasBackup(filePath))) {
      return false;
    }
    await copyFile(backupPath, filePath);
    await rm(backupPath, { force: true });
    return true;
  }

  async removeBackup(filePath: string): Promise<boolean> {
    const backupPath = this.getBackupPath(filePath);
    if (!(await this.hasBackup(filePath))) {
      return false;
    }
    await rm(backupPath, { force: true });
    return true;
  }

  async readJson<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Reads optional JSON while surfacing malformed or unreadable user files. */
  async readJsonStrict<T = Record<string, unknown>>(filePath: string): Promise<T | null> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async readText(filePath: string): Promise<string | null> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async atomicWriteJson(filePath: string, data: unknown): Promise<void> {
    const parentDir = dirname(filePath);
    await mkdir(parentDir, { recursive: true });

    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    const serialized = JSON.stringify(data, null, 2) + '\n';

    await writeFile(tempPath, serialized, 'utf-8');
    await rename(tempPath, filePath);
  }

  async atomicWriteText(filePath: string, data: string): Promise<void> {
    const parentDir = dirname(filePath);
    await mkdir(parentDir, { recursive: true });

    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(tempPath, data, 'utf-8');
    await rename(tempPath, filePath);
  }

  async removeFile(filePath: string): Promise<void> {
    await rm(filePath, { force: true });
  }
}
