import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Returns the root directory where Take Five stores its configuration and cache files.
 * Defaults to ~/.takefive unless overridden by TAKEFIVE_HOME environment variable.
 */
export function getTakeFiveHome(env: Record<string, string | undefined> = process.env): string {
  if (env.TAKEFIVE_HOME && env.TAKEFIVE_HOME.trim().length > 0) {
    return env.TAKEFIVE_HOME.trim();
  }
  return join(homedir(), '.takefive');
}

/**
 * Returns the path to the Take Five config file (~/.takefive/config.json).
 */
export function getConfigPath(env: Record<string, string | undefined> = process.env): string {
  return join(getTakeFiveHome(env), 'config.json');
}

/**
 * Returns the path to the Take Five debounce cache file (~/.takefive/cache.json).
 */
export function getCachePath(env: Record<string, string | undefined> = process.env): string {
  return join(getTakeFiveHome(env), 'cache.json');
}
