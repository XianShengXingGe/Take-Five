import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
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
  fingerprintWindowSeconds?: number;
}

export interface DebounceCacheData {
  version: '1.0.0';
  timestamps: Record<string, number>;
  fingerprints?: Record<string, number>;
  lastPruned?: number;
}

/**
 * Manages event cooldown timestamps in ~/.takefive/cache.json to prevent notification flooding.
 */
export class Debouncer {
  private cachePath: string;
  private debounceSeconds: number;
  private fingerprintWindowSeconds: number;

  constructor(options: DebouncerOptions = {}) {
    this.cachePath = options.cachePath ?? getCachePath();
    this.debounceSeconds = options.debounceSeconds ?? 2;
    this.fingerprintWindowSeconds = options.fingerprintWindowSeconds ?? 60;
  }

  /**
   * Checks whether the event with a specific idempotency fingerprint should be debounced.
   * If not debounced, updates the cache with the current timestamp.
   */
  async checkAndRecordFingerprint(
    fingerprint: string,
    now: number = Date.now(),
    windowSeconds: number = this.fingerprintWindowSeconds,
  ): Promise<DebounceResult> {
    const cache = this.readCache();
    const fingerprints = cache.fingerprints || {};
    const lastTimestamp = fingerprints[fingerprint];
    const windowMs = windowSeconds * 1000;

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

    if (!cache.fingerprints) {
      cache.fingerprints = {};
    }
    cache.fingerprints[fingerprint] = now;
    this.writeCache(cache, now);

    return {
      debounced: false,
      elapsedMs: typeof lastTimestamp === 'number' ? now - lastTimestamp : undefined,
    };
  }

  /**
   * Checks whether the event from the given agent and project should be debounced.
   * If not debounced, updates the cache with the current timestamp.
   * Also checks idempotency fingerprint pool (60s window) if fingerprint is provided.
   */
  async checkAndRecord(
    agent: SupportedAgent,
    project: string,
    now: number = Date.now(),
    fingerprint?: string,
  ): Promise<DebounceResult> {
    const key = `${agent}:${project}`;
    const cache = this.readCache();
    const fingerprints = cache.fingerprints || {};

    // 1. Check idempotency fingerprint (60s default window) if provided
    if (fingerprint && fingerprint.trim().length > 0) {
      const fpKey = fingerprint.trim();
      const lastFpTimestamp = fingerprints[fpKey];
      const fpWindowMs = this.fingerprintWindowSeconds * 1000;

      if (typeof lastFpTimestamp === 'number' && lastFpTimestamp > 0) {
        const elapsed = now - lastFpTimestamp;
        if (elapsed < fpWindowMs) {
          return {
            debounced: true,
            elapsedMs: elapsed,
            remainingMs: fpWindowMs - elapsed,
          };
        }
      }
    }

    // 2. Check standard agent:project cooldown window (2s default)
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
    if (fingerprint && fingerprint.trim().length > 0) {
      if (!cache.fingerprints) {
        cache.fingerprints = {};
      }
      cache.fingerprints[fingerprint.trim()] = now;
    }
    this.writeCache(cache, now);

    return {
      debounced: false,
      elapsedMs: typeof lastTimestamp === 'number' ? now - lastTimestamp : undefined,
    };
  }

  private readCache(): DebounceCacheData {
    if (!existsSync(this.cachePath)) {
      return { version: '1.0.0', timestamps: {}, fingerprints: {} };
    }

    try {
      const raw = readFileSync(this.cachePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        return {
          version: '1.0.0',
          timestamps: (typeof data.timestamps === 'object' && data.timestamps !== null) ? { ...data.timestamps } : {},
          fingerprints: (typeof data.fingerprints === 'object' && data.fingerprints !== null) ? { ...data.fingerprints } : {},
          lastPruned: typeof data.lastPruned === 'number' ? data.lastPruned : undefined,
        };
      }
    } catch {
      // Return fresh cache on read error or corrupted file
    }

    return { version: '1.0.0', timestamps: {}, fingerprints: {} };
  }

  private writeCache(data: DebounceCacheData, now: number = Date.now()): void {
    let tmpPath: string | undefined;
    try {
      const dir = dirname(this.cachePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Prune stale entries older than 24 hours periodically (at most once per hour or if uninitialized/large)
      // to eliminate redundant readCache disk I/O and avoid expensive full traversal on every write
      const pruneIntervalMs = 60 * 60 * 1000;
      const shouldPrune =
        !data.lastPruned ||
        now - data.lastPruned >= pruneIntervalMs ||
        Object.keys(data.timestamps).length > 100;

      let timestampsToWrite = data.timestamps;
      let fingerprintsToWrite = data.fingerprints || {};

      if (shouldPrune) {
        const maxAgeMs = 24 * 60 * 60 * 1000;
        const prunedTimestamps: Record<string, number> = {};
        for (const [key, timestamp] of Object.entries(timestampsToWrite)) {
          if (typeof timestamp === 'number' && now - timestamp < maxAgeMs) {
            prunedTimestamps[key] = timestamp;
          }
        }

        const prunedFingerprints: Record<string, number> = {};
        for (const [fp, timestamp] of Object.entries(fingerprintsToWrite)) {
          if (typeof timestamp === 'number' && now - timestamp < maxAgeMs) {
            prunedFingerprints[fp] = timestamp;
          }
        }

        timestampsToWrite = prunedTimestamps;
        fingerprintsToWrite = prunedFingerprints;
        data.lastPruned = now;
      }

      const payload: DebounceCacheData = {
        version: '1.0.0',
        timestamps: timestampsToWrite,
        fingerprints: fingerprintsToWrite,
        lastPruned: data.lastPruned,
      };

      tmpPath = `${this.cachePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
      renameSync(tmpPath, this.cachePath);
    } catch {
      if (tmpPath && existsSync(tmpPath)) {
        try {
          rmSync(tmpPath, { force: true });
        } catch {
          // Inability to clean up tmp file shouldn't crash notification dispatch
        }
      }
    }
  }
}
