import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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
});
