import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectInstalledAgents, type DetectedAgents } from '../src/core/agent-detector.js';

describe('AgentDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-agent-detector-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects no agents in an empty home directory', () => {
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.claude.installed).toBe(false);
    expect(result.codex.installed).toBe(false);
    expect(result.opencode.installed).toBe(false);
    expect(result.antigravity.installed).toBe(false);
    expect(result.hasAnyInstalled).toBe(false);
    expect(result.installedAgents).toEqual([]);
  });

  it('detects Claude Code when ~/.claude directory exists', () => {
    mkdirSync(join(tempDir, '.claude'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.claude.installed).toBe(true);
    expect(result.claude.path).toBe(join(tempDir, '.claude'));
    expect(result.installedAgents).toContain('claude');
    expect(result.hasAnyInstalled).toBe(true);
  });

  it('detects Claude Code when ~/.claude.json file exists', () => {
    writeFileSync(join(tempDir, '.claude.json'), '{}', 'utf-8');
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.claude.installed).toBe(true);
    expect(result.claude.path).toBe(join(tempDir, '.claude.json'));
    expect(result.installedAgents).toContain('claude');
  });

  it('detects OpenCode when ~/.opencode directory exists', () => {
    mkdirSync(join(tempDir, '.opencode'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.opencode.installed).toBe(true);
    expect(result.opencode.path).toBe(join(tempDir, '.opencode'));
    expect(result.installedAgents).toContain('opencode');
  });

  it('detects OpenCode when ~/.config/opencode directory exists', () => {
    mkdirSync(join(tempDir, '.config', 'opencode'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.opencode.installed).toBe(true);
    expect(result.opencode.path).toBe(join(tempDir, '.config', 'opencode'));
    expect(result.installedAgents).toContain('opencode');
  });

  it('detects OpenAI Codex when ~/.codex directory exists', () => {
    mkdirSync(join(tempDir, '.codex'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.codex.installed).toBe(true);
    expect(result.codex.path).toBe(join(tempDir, '.codex'));
    expect(result.installedAgents).toContain('codex');
  });

  it('detects Antigravity when ~/.gemini/antigravity directory exists', () => {
    mkdirSync(join(tempDir, '.gemini', 'antigravity'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.antigravity.installed).toBe(true);
    expect(result.antigravity.path).toBe(join(tempDir, '.gemini', 'antigravity'));
    expect(result.installedAgents).toContain('antigravity');
  });

  it('detects Antigravity when ~/.antigravity directory exists', () => {
    mkdirSync(join(tempDir, '.antigravity'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });
    expect(result.antigravity.installed).toBe(true);
    expect(result.antigravity.path).toBe(join(tempDir, '.antigravity'));
    expect(result.installedAgents).toContain('antigravity');
  });

  it('detects multiple installed agents simultaneously', () => {
    mkdirSync(join(tempDir, '.claude'), { recursive: true });
    mkdirSync(join(tempDir, '.gemini', 'antigravity'), { recursive: true });
    const result = detectInstalledAgents({ homedir: tempDir });

    expect(result.claude.installed).toBe(true);
    expect(result.antigravity.installed).toBe(true);
    expect(result.codex.installed).toBe(false);
    expect(result.opencode.installed).toBe(false);
    expect(result.installedAgents).toEqual(['claude', 'antigravity']);
    expect(result.hasAnyInstalled).toBe(true);
  });
});
