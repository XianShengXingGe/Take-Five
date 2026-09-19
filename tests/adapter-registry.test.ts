import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAllAdapters,
  getAdapter,
  detectInstalledAdapters,
  ClaudeAdapter,
  OpenCodeAdapter,
  CodexAdapter,
  AntigravityAdapter,
} from '../src/adapters/index.js';

describe('Adapter Registry', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-registry-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('instantiates all available adapters', () => {
    const adapters = createAllAdapters();
    expect(adapters).toHaveLength(4);
    expect(adapters.some((a) => a.id === 'claude')).toBe(true);
    expect(adapters.some((a) => a.id === 'opencode')).toBe(true);
    expect(adapters.some((a) => a.id === 'codex')).toBe(true);
    expect(adapters.some((a) => a.id === 'antigravity')).toBe(true);
  });

  it('retrieves specific adapter by id', () => {
    const claude = getAdapter('claude');
    expect(claude).toBeInstanceOf(ClaudeAdapter);
    expect(claude?.id).toBe('claude');
    expect(claude?.displayName).toBe('Claude Code');

    const opencode = getAdapter('opencode');
    expect(opencode).toBeInstanceOf(OpenCodeAdapter);
    expect(opencode?.id).toBe('opencode');
    expect(opencode?.displayName).toBe('OpenCode');

    const codex = getAdapter('codex');
    expect(codex).toBeInstanceOf(CodexAdapter);
    expect(codex?.id).toBe('codex');
    expect(codex?.displayName).toBe('OpenAI Codex');

    const antigravity = getAdapter('antigravity');
    expect(antigravity).toBeInstanceOf(AntigravityAdapter);
    expect(antigravity?.id).toBe('antigravity');
    expect(antigravity?.displayName).toBe('Google Antigravity');
  });

  it('detects installed adapters in filesystem environment', async () => {
    const initial = await detectInstalledAdapters({ HOME: tempDir });
    expect(initial).toHaveLength(0);

    mkdirSync(join(tempDir, '.claude'), { recursive: true });
    const afterClaude = await detectInstalledAdapters({ HOME: tempDir });
    expect(afterClaude).toHaveLength(1);
    expect(afterClaude[0].id).toBe('claude');

    mkdirSync(join(tempDir, '.opencode'), { recursive: true });
    const afterTwo = await detectInstalledAdapters({ HOME: tempDir });
    expect(afterTwo).toHaveLength(2);
    expect(afterTwo.map((a) => a.id)).toEqual(['claude', 'opencode']);

    mkdirSync(join(tempDir, '.codex'), { recursive: true });
    const afterThree = await detectInstalledAdapters({ HOME: tempDir });
    expect(afterThree).toHaveLength(3);
    expect(afterThree.map((a) => a.id)).toEqual(['claude', 'opencode', 'codex']);

    mkdirSync(join(tempDir, '.gemini'), { recursive: true });
    const afterAll = await detectInstalledAdapters({ HOME: tempDir });
    expect(afterAll).toHaveLength(4);
    expect(afterAll.map((a) => a.id)).toEqual(['claude', 'opencode', 'codex', 'antigravity']);
  });
});
