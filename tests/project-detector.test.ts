import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProjectName } from '../src/core/project-detector.js';

describe('ProjectDetector', () => {
  it('prefers explicit project parameter if provided', () => {
    const project = detectProjectName({
      explicitProject: 'my-custom-project',
      cwd: '/some/other/path',
      env: { TAKEFIVE_PROJECT: 'env-project' },
    });
    expect(project).toBe('my-custom-project');
  });

  it('prefers TAKEFIVE_PROJECT environment variable when explicit project is absent', () => {
    const project = detectProjectName({
      cwd: '/some/other/path',
      env: { TAKEFIVE_PROJECT: 'env-project' },
    });
    expect(project).toBe('env-project');
  });

  it('detects git root directory name when running inside nested git repo', () => {
    const baseTemp = mkdtempSync(join(tmpdir(), 'takefive-git-test-'));
    const gitRepoDir = join(baseTemp, 'my-repo');
    const nestedSubDir = join(gitRepoDir, 'packages', 'deep', 'src');

    try {
      mkdirSync(join(gitRepoDir, '.git'), { recursive: true });
      mkdirSync(nestedSubDir, { recursive: true });

      const project = detectProjectName({ cwd: nestedSubDir });
      expect(project).toBe('my-repo');
    } finally {
      rmSync(baseTemp, { recursive: true, force: true });
    }
  });

  it('falls back to current directory basename if no git root is found', () => {
    const baseTemp = mkdtempSync(join(tmpdir(), 'takefive-nogit-test-'));
    const nonGitDir = join(baseTemp, 'workspace-folder');

    try {
      mkdirSync(nonGitDir, { recursive: true });

      const project = detectProjectName({ cwd: nonGitDir });
      expect(project).toBe('workspace-folder');
    } finally {
      rmSync(baseTemp, { recursive: true, force: true });
    }
  });

  it('handles root directory cleanly without infinite loop', () => {
    const project = detectProjectName({ cwd: '/' });
    expect(project).toBeDefined();
    expect(typeof project).toBe('string');
  });
});
