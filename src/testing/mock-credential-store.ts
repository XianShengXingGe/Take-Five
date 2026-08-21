import type { CredentialStore } from '../types/credential.js';

export interface CredentialStoreCall {
  method: 'getBarkUrl' | 'setBarkUrl' | 'deleteBarkUrl';
  argument?: string;
  timestamp: number;
}

/**
 * In-memory MockCredentialStore for hermetic unit and integration testing.
 */
export class MockCredentialStore implements CredentialStore {
  private url: string | null = null;
  private calls: CredentialStoreCall[] = [];
  private simulatedErrors: Partial<Record<CredentialStoreCall['method'], Error>> = {};

  constructor(initialUrl: string | null = null) {
    this.url = initialUrl;
  }

  async getBarkUrl(): Promise<string | null> {
    this.recordCall('getBarkUrl');
    const error = this.simulatedErrors.getBarkUrl;
    if (error) {
      throw error;
    }
    return this.url;
  }

  async setBarkUrl(url: string): Promise<void> {
    this.recordCall('setBarkUrl', url);
    const error = this.simulatedErrors.setBarkUrl;
    if (error) {
      throw error;
    }
    this.url = url;
  }

  async deleteBarkUrl(): Promise<void> {
    this.recordCall('deleteBarkUrl');
    const error = this.simulatedErrors.deleteBarkUrl;
    if (error) {
      throw error;
    }
    this.url = null;
  }

  /**
   * Returns a copy of all recorded calls.
   */
  getCallHistory(): readonly CredentialStoreCall[] {
    return [...this.calls];
  }

  /**
   * Returns count of calls for a specific method or total calls if method is omitted.
   */
  getCallCount(method?: CredentialStoreCall['method']): number {
    if (!method) {
      return this.calls.length;
    }
    return this.calls.filter((c) => c.method === method).length;
  }

  /**
   * Simulates an error for a given method invocation.
   */
  simulateError(method: CredentialStoreCall['method'], error: Error | null): void {
    if (error === null) {
      delete this.simulatedErrors[method];
    } else {
      this.simulatedErrors[method] = error;
    }
  }

  /**
   * Resets all stored credentials, call history, and simulated errors.
   */
  reset(initialUrl: string | null = null): void {
    this.url = initialUrl;
    this.calls = [];
    this.simulatedErrors = {};
  }

  private recordCall(method: CredentialStoreCall['method'], argument?: string): void {
    this.calls.push({
      method,
      argument,
      timestamp: Date.now(),
    });
  }
}
