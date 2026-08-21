import type { BarkPushPayload, BarkPushResponse } from '../types/bark.js';

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
