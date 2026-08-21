import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SupportedAgent } from '../types/event.js';
import { getCachePath } from './paths.js';

export interface DebounceResult {
  debounced: boolean;
  elapsedMs?: number;
  remainingMs?: number;
}

export interface DebouncerOptions {
  cachePath?: string;
  debounceSeconds?: number;
}

export interface DebounceCacheData {
  version: '1.0.0';
  timestamps: Record<string, number>;
}

/**
 * Manages event cooldown timestamps in ~/.takefive/cache.json to prevent notification flooding.
 */
export class Debouncer {
  private cachePath: string;
  private debounceSeconds: number;

  constructor(options: DebouncerOptions = {}) {
    this.cachePath = options.cachePath ?? getCachePath();
    this.debounceSeconds = options.debounceSeconds ?? 2;
  }

  /**
   * Checks whether the event from the given agent and project should be debounced.
   * If not debounced, updates the cache with the current timestamp.
   */
  async checkAndRecord(
    agent: SupportedAgent,
    project: string,
    now: number = Date.now(),
  ): Promise<DebounceResult> {
    const key = `${agent}:${project}`;
    const cache = this.readCache();
    const lastTimestamp = cache.timestamps[key];
    const windowMs = this.debounceSeconds * 1000;

    if (typeof lastTimestamp === 'number' && lastTimestamp > 0) {
      const elapsed = now - lastTimestamp;
      if (elapsed < windowMs) {
        return {
          debounced: true,
          elapsedMs: elapsed,
          remainingMs: windowMs - elapsed,
        };
      }
    }

    cache.timestamps[key] = now;
    this.writeCache(cache, now);

    return {
      debounced: false,
      elapsedMs: typeof lastTimestamp === 'number' ? now - lastTimestamp : undefined,
    };
  }

  private readCache(): DebounceCacheData {
    if (!existsSync(this.cachePath)) {
      return { version: '1.0.0', timestamps: {} };
    }

    try {
      const raw = readFileSync(this.cachePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && typeof data.timestamps === 'object') {
        return {
          version: '1.0.0',
          timestamps: { ...data.timestamps },
        };
      }
    } catch {
      // Return fresh cache on read error or corrupted file
    }

    return { version: '1.0.0', timestamps: {} };
  }

  private writeCache(data: DebounceCacheData, now: number = Date.now()): void {
    try {
      const dir = dirname(this.cachePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Prune stale entries older than 24 hours to prevent cache file growth
      const maxAgeMs = 24 * 60 * 60 * 1000;
      const prunedTimestamps: Record<string, number> = {};
      for (const [k, ts] of Object.entries(data.timestamps)) {
        if (typeof ts === 'number' && now - ts < maxAgeMs) {
          prunedTimestamps[k] = ts;
        }
      }

      const payload: DebounceCacheData = {
        version: '1.0.0',
        timestamps: prunedTimestamps,
      };

      writeFileSync(this.cachePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Inability to write cache shouldn't crash notification dispatch
    }
  }
}
