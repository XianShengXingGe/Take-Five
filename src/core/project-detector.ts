import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export interface ProjectDetectorOptions {
  explicitProject?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Finds the Git root directory by walking up from the specified directory.
 */
export function findGitRoot(startDir: string): string | null {
  let currentDir = resolve(startDir);

  while (true) {
    const gitPath = resolve(currentDir, '.git');
    if (existsSync(gitPath)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

function cleanProjectNameCandidate(candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return '';

  const isPath = trimmed.includes('/') || trimmed.includes('\\') || existsSync(trimmed);
  if (!isPath) {
    return trimmed;
  }

  try {
    if (existsSync(trimmed)) {
      const gitRoot = findGitRoot(trimmed);
      if (gitRoot) {
        const gitName = basename(gitRoot);
        if (gitName && gitName !== '/' && gitName !== '\\') {
          return gitName;
        }
      }
      const dirName = basename(resolve(trimmed));
      if (dirName && dirName !== '/' && dirName !== '\\') {
        return dirName;
      }
    }
  } catch {
    // Fall through to string extraction
  }

  const cleaned = trimmed.replace(/[/\\]+$/, '');
  const segments = cleaned.split(/[/\\]/);
  const lastSegment = segments[segments.length - 1]?.trim();
  if (lastSegment && lastSegment.length > 0 && lastSegment !== '/' && lastSegment !== '\\') {
    return lastSegment;
  }

  return trimmed;
}

/**
 * Resolves the active project name from explicit option, TAKEFIVE_PROJECT env var,
 * Git root directory name, or current working directory name.
 */
export function detectProjectName(options: ProjectDetectorOptions = {}): string {
  if (options.explicitProject && options.explicitProject.trim().length > 0) {
    const cleaned = cleanProjectNameCandidate(options.explicitProject);
    if (cleaned.length > 0) return cleaned;
  }

  const env = options.env ?? process.env;
  if (env.TAKEFIVE_PROJECT && env.TAKEFIVE_PROJECT.trim().length > 0) {
    const cleaned = cleanProjectNameCandidate(env.TAKEFIVE_PROJECT);
    if (cleaned.length > 0) return cleaned;
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const gitRoot = findGitRoot(cwd);

  if (gitRoot) {
    const name = basename(gitRoot);
    if (name && name !== '/' && name !== '\\') {
      return name;
    }
  }

  const cwdName = basename(cwd);
  if (cwdName && cwdName !== '/' && cwdName !== '\\') {
    return cwdName;
  }

  return 'workspace';
}
