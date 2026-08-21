import type { BarkPushPayload, BarkPushResponse } from '../types/bark.js';

export interface RecordedBarkRequest {
  url: string;
  payload: BarkPushPayload;
  headers?: Record<string, string>;
  timestamp: number;
}

export type SimulatedResponseHandler = (
  url: string,
  payload: BarkPushPayload,
) => Promise<BarkPushResponse> | BarkPushResponse;

function createEmptyPayload(body = ''): BarkPushPayload {
  return {
    title: '',
    subtitle: '',
    body,
    group: '',
    level: 'active',
    icon: '',
  };
}

/**
 * In-memory MockBarkDispatcher for hermetic testing of Bark push notifications.
 */
export class MockBarkDispatcher {
  private requests: RecordedBarkRequest[] = [];
  private customHandler: SimulatedResponseHandler | null = null;
  private defaultResponse: BarkPushResponse = {
    code: 200,
    message: 'success',
  };
  private simulatedError: Error | null = null;

  /**
   * Dispatches a Bark payload in memory and returns a mock response.
   */
  async dispatch(
    url: string,
    payload: BarkPushPayload,
    headers?: Record<string, string>,
  ): Promise<BarkPushResponse> {
    this.requests.push({
      url,
      payload: { ...payload },
      headers: headers ? { ...headers } : undefined,
      timestamp: Date.now(),
    });

    if (this.simulatedError) {
      throw this.simulatedError;
    }

    if (this.customHandler) {
      return await this.customHandler(url, payload);
    }

    return {
      ...this.defaultResponse,
      timestamp: Date.now(),
    };
  }

  /**
   * Creates a mock `fetch` implementation that captures calls and returns a standard `Response`.
   */
  createMockFetch(): typeof fetch {
    const mockFetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      let url: string;
      let rawBody: string | undefined;

      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
        try {
          rawBody = await input.clone().text();
        } catch {
          rawBody = undefined;
        }
      }

      if (typeof init?.body === 'string') {
        rawBody = init.body;
      }

      let payload: BarkPushPayload;
      if (typeof rawBody === 'string' && rawBody.length > 0) {
        try {
          payload = JSON.parse(rawBody) as BarkPushPayload;
        } catch {
          payload = createEmptyPayload(rawBody);
        }
      } else {
        payload = createEmptyPayload();
      }

      const headers: Record<string, string> = {};
      const sourceHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined);

      if (sourceHeaders) {
        if (sourceHeaders instanceof Headers) {
          sourceHeaders.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (Array.isArray(sourceHeaders)) {
          sourceHeaders.forEach(([k, v]) => {
            headers[k] = v;
          });
        } else {
          Object.assign(headers, sourceHeaders);
        }
      }

      try {
        const responseData = await this.dispatch(url, payload, headers);
        return new Response(JSON.stringify(responseData), {
          status: responseData.code === 200 ? 200 : responseData.code,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(String(err));
      }
    };

    return mockFetch as typeof fetch;
  }

  /**
   * Returns all recorded requests.
   */
  getRequests(): readonly RecordedBarkRequest[] {
    return [...this.requests];
  }

  /**
   * Returns all dispatched payloads.
   */
  getPayloads(): BarkPushPayload[] {
    return this.requests.map((r) => r.payload);
  }

  /**
   * Returns the most recently dispatched request or undefined.
   */
  getLastRequest(): RecordedBarkRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /**
   * Returns the most recently dispatched payload or undefined.
   */
  getLastPayload(): BarkPushPayload | undefined {
    return this.requests[this.requests.length - 1]?.payload;
  }

  /**
   * Total number of dispatched requests.
   */
  getRequestCount(): number {
    return this.requests.length;
  }

  /**
   * Configures the default response returned on successful dispatches.
   */
  setDefaultResponse(response: BarkPushResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Sets a custom handler function for dynamic responses.
   */
  setHandler(handler: SimulatedResponseHandler | null): void {
    this.customHandler = handler;
  }

  /**
   * Simulates a network error that will be thrown upon dispatch.
   */
  simulateError(error: Error | null): void {
    this.simulatedError = error;
  }

  /**
   * Resets all recorded requests, error simulations, and handlers.
   */
  reset(): void {
    this.requests = [];
    this.simulatedError = null;
    this.customHandler = null;
    this.defaultResponse = {
      code: 200,
      message: 'success',
    };
  }
}
