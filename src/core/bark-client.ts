import type { BarkPushPayload, BarkPushResponse } from '../types/bark.js';

/**
 * Normalizes Bark server URL or device key into a fully qualified Bark push endpoint URL.
 */
export function normalizeBarkUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://api.day.app/${trimmed}`;
}

/**
 * Validates whether the given input is a valid Bark device key or HTTP/HTTPS Bark push URL.
 */
export function isValidBarkUrl(input: unknown): boolean {
  if (typeof input !== 'string') return false;
  // Disallow control characters (newlines, tabs, etc.) anywhere
  if (/[\x00-\x1F\x7F]/.test(input)) return false;

  const trimmed = input.trim();
  if (!trimmed) return false;

  // Disallow any whitespace in trimmed string
  if (/\s/.test(trimmed)) return false;

  // Case 1: Full HTTP or HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }
      if (!parsed.hostname || parsed.hostname.includes('..')) {
        return false;
      }
      // For official Bark domain (api.day.app), a device key in pathname is required
      if (parsed.hostname === 'api.day.app' || parsed.hostname.endsWith('.day.app')) {
        const segments = parsed.pathname.split('/').filter(Boolean);
        if (segments.length === 0) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  // Case 2: Bare device key for api.day.app
  // Must be an alphanumeric/underscore/dash token with optional trailing slash
  return /^[a-zA-Z0-9_-]+(\/)?$/.test(trimmed);
}

/**
 * Masks a Bark URL or device key to safely display in CLI prompts without leaking full secrets.
 */
export function maskBarkUrl(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  try {
    const isFullUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://');
    const url = new URL(isFullUrl ? trimmed : `https://api.day.app/${trimmed}`);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const keyIdx = segments.length - 1;
      const key = segments[keyIdx];
      let maskedKey: string;
      if (key.length <= 6) {
        maskedKey = '***';
      } else if (key.length <= 10) {
        maskedKey = `${key.slice(0, 2)}***${key.slice(-2)}`;
      } else {
        maskedKey = `${key.slice(0, 3)}***${key.slice(-3)}`;
      }
      segments[keyIdx] = maskedKey;
      const trailingSlash = trimmed.endsWith('/') ? '/' : '';
      if (!isFullUrl) {
        return maskedKey;
      }
      return `${url.origin}/${segments.join('/')}${trailingSlash}`;
    }
    return isFullUrl ? url.origin : '***';
  } catch {
    if (trimmed.length <= 6) return '***';
    return `${trimmed.slice(0, 3)}***${trimmed.slice(-3)}`;
  }
}

export interface BarkClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Fast HTTP client dispatching JSON push notification payloads to Bark servers.
 */
export class BarkClient {
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(options: BarkClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /**
   * Pushes a notification payload to the specified Bark URL.
   */
  async push(url: string, payload: BarkPushPayload): Promise<BarkPushResponse> {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error(`Invalid Bark push URL: "${url}"`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let json: Partial<BarkPushResponse>;
      try {
        json = (await response.json()) as Partial<BarkPushResponse>;
      } catch {
        json = { code: response.status, message: response.statusText };
      }

      if (!response.ok || (typeof json.code === 'number' && json.code !== 200)) {
        const errorMsg = json.message || response.statusText || 'Unknown Bark error';
        const errorCode = json.code ?? response.status;
        throw new Error(`Bark dispatch failed (HTTP ${errorCode}): ${errorMsg}`);
      }

      return {
        code: json.code ?? 200,
        message: json.message ?? 'success',
        timestamp: json.timestamp ?? Date.now(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
