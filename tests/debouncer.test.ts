import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Debouncer } from '../src/core/debouncer.js';

describe('Debouncer', () => {
  let tempDir: string;
  let cacheFilePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-debouncer-'));
    cacheFilePath = join(tempDir, 'cache.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('allows the first event and returns debounced: false', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    const result = await debouncer.checkAndRecord('claude', 'Take-Five', 1000);

    expect(result.debounced).toBe(false);
  });

  it('blocks rapid consecutive events within the debounce window', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });

    const first = await debouncer.checkAndRecord('claude', 'Take-Five', 1000);
    expect(first.debounced).toBe(false);

    // 1000ms later (within 2s debounce window)
    const second = await debouncer.checkAndRecord('claude', 'Take-Five', 2000);
    expect(second.debounced).toBe(true);
    expect(second.elapsedMs).toBe(1000);
  });

  it('allows event after debounce window has passed', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });

    const first = await debouncer.checkAndRecord('claude', 'Take-Five', 1000);
    expect(first.debounced).toBe(false);

    // 2500ms later (> 2s window)
    const second = await debouncer.checkAndRecord('claude', 'Take-Five', 3500);
    expect(second.debounced).toBe(false);
  });

  it('maintains independent debounce state across different agents', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });

    const claude = await debouncer.checkAndRecord('claude', 'Take-Five', 1000);
    const codex = await debouncer.checkAndRecord('codex', 'Take-Five', 1200);

    expect(claude.debounced).toBe(false);
    expect(codex.debounced).toBe(false);
  });

  it('maintains independent debounce state across different projects', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });

    const projectA = await debouncer.checkAndRecord('claude', 'ProjectA', 1000);
    const projectB = await debouncer.checkAndRecord('claude', 'ProjectB', 1200);

    expect(projectA.debounced).toBe(false);
    expect(projectB.debounced).toBe(false);
  });

  it('recovers gracefully if cache file contains corrupted JSON', async () => {
    writeFileSync(cacheFilePath, '{ corrupted_json...', 'utf-8');

    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    const result = await debouncer.checkAndRecord('claude', 'Take-Five', 1000);

    expect(result.debounced).toBe(false);
  });

  it('prunes stale timestamps older than 24 hours when writing cache', async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = 100 * dayMs;

    // Seed cache with a very old entry and a recent entry
    writeFileSync(
      cacheFilePath,
      JSON.stringify({
        version: '1.0.0',
        timestamps: {
          'claude:OldProject': now - (2 * dayMs), // 48h ago (stale)
          'claude:RecentProject': now - (1 * 60 * 1000), // 1m ago (fresh)
        },
      }),
      'utf-8',
    );

    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    await debouncer.checkAndRecord('opencode', 'NewProject', now);

    const { readFileSync } = await import('node:fs');
    const updated = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));

    expect(updated.timestamps['claude:OldProject']).toBeUndefined();
    expect(updated.timestamps['claude:RecentProject']).toBe(now - (1 * 60 * 1000));
    expect(updated.timestamps['opencode:NewProject']).toBe(now);
  });

  it('writes cache atomically without leaving dangling .tmp files', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    await debouncer.checkAndRecord('claude', 'Take-Five', 1000);

    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync(tempDir);

    expect(files).toContain('cache.json');
    const tmpFiles = files.filter((f: string) => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);

    const content = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
    expect(content.timestamps['claude:Take-Five']).toBe(1000);
  });

  it('handles multi-agent concurrent turn completions without corrupting or wiping cache.json', async () => {
    const agents = ['claude', 'codex', 'opencode', 'antigravity'] as const;
    const now = 5000;

    // Simulate 20 concurrent agent hook dispatches on the same shared cache file
    const tasks = [];
    for (let i = 0; i < 20; i++) {
      const agent = agents[i % agents.length];
      const project = `Project-${i}`;
      const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
      tasks.push(debouncer.checkAndRecord(agent, project, now + i * 10));
    }

    const results = await Promise.all(tasks);
    for (const res of results) {
      expect(res.debounced).toBe(false);
    }

    const { readFileSync, readdirSync } = await import('node:fs');
    const raw = readFileSync(cacheFilePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.version).toBe('1.0.0');
    expect(Object.keys(parsed.timestamps).length).toBe(20);
    for (let i = 0; i < 20; i++) {
      const agent = agents[i % agents.length];
      const project = `Project-${i}`;
      expect(parsed.timestamps[`${agent}:${project}`]).toBe(now + i * 10);
    }

    const files = readdirSync(tempDir);
    const tmpFiles = files.filter((f: string) => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);
  });

  it('resilient against preexisting unrelated .tmp files in cache directory', async () => {
    // Seed an orphaned tmp file
    writeFileSync(join(tempDir, 'cache.json.12345.tmp'), '{ partial', 'utf-8');

    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    const result = await debouncer.checkAndRecord('claude', 'Take-Five', 2000);

    expect(result.debounced).toBe(false);

    const { readFileSync } = await import('node:fs');
    const parsed = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
    expect(parsed.timestamps['claude:Take-Five']).toBe(2000);
  });

  it('records lastPruned and preserves entries during normal write intervals', async () => {
    const debouncer = new Debouncer({ cachePath: cacheFilePath, debounceSeconds: 2 });
    const now = 10_000_000;
    await debouncer.checkAndRecord('claude', 'ProjectA', now);

    const { readFileSync } = await import('node:fs');
    const firstWrite = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
    expect(firstWrite.lastPruned).toBe(now);

    // Subsequent write 5 seconds later
    await debouncer.checkAndRecord('codex', 'ProjectB', now + 5000);
    const secondWrite = JSON.parse(readFileSync(cacheFilePath, 'utf-8'));
    expect(secondWrite.lastPruned).toBe(now); // Not updated because within 1 hour
    expect(secondWrite.timestamps['claude:ProjectA']).toBe(now);
    expect(secondWrite.timestamps['codex:ProjectB']).toBe(now + 5000);
  });
});
