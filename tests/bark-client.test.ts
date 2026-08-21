import { describe, expect, it } from 'vitest';
import { BarkClient, normalizeBarkUrl } from '../src/core/bark-client.js';
import { MockBarkDispatcher, createMockBarkPayload } from '../src/testing/index.js';

describe('BarkClient', () => {
  it('dispatches JSON POST payload to Bark endpoint successfully', async () => {
    const mockDispatcher = new MockBarkDispatcher();
    const client = new BarkClient({
      fetchImpl: mockDispatcher.createMockFetch(),
    });

    const payload = createMockBarkPayload();
    const response = await client.push('https://api.day.app/DEMO_KEY/', payload);

    expect(response.code).toBe(200);
    expect(mockDispatcher.getRequestCount()).toBe(1);

    const recorded = mockDispatcher.getLastRequest();
    expect(recorded?.url).toBe('https://api.day.app/DEMO_KEY/');
    expect(recorded?.payload.title).toBe(payload.title);
    expect(recorded?.payload.subtitle).toBe(payload.subtitle);
    expect(recorded?.payload.body).toBe(payload.body);
    expect(recorded?.payload.group).toBe(payload.group);
  });

  it('normalizes URL without trailing slash or path parameters', async () => {
    const mockDispatcher = new MockBarkDispatcher();
    const client = new BarkClient({
      fetchImpl: mockDispatcher.createMockFetch(),
    });

    const payload = createMockBarkPayload();
    await client.push('https://api.day.app/DEMO_KEY', payload);

    const recorded = mockDispatcher.getLastRequest();
    expect(recorded?.url).toBe('https://api.day.app/DEMO_KEY');
  });

  it('throws descriptive error on HTTP failure response', async () => {
    const mockDispatcher = new MockBarkDispatcher();
    mockDispatcher.setDefaultResponse({
      code: 400,
      message: 'device key not found',
    });

    const client = new BarkClient({
      fetchImpl: mockDispatcher.createMockFetch(),
    });

    const payload = createMockBarkPayload();
    await expect(client.push('https://api.day.app/INVALID_KEY/', payload)).rejects.toThrow(
      /device key not found|400/,
    );
  });

  it('throws error when server is unreachable / network fails', async () => {
    const mockDispatcher = new MockBarkDispatcher();
    mockDispatcher.simulateError(new Error('getaddrinfo ENOTFOUND api.day.app'));

    const client = new BarkClient({
      fetchImpl: mockDispatcher.createMockFetch(),
    });

    const payload = createMockBarkPayload();
    await expect(client.push('https://api.day.app/DEMO_KEY/', payload)).rejects.toThrow(
      /ENOTFOUND/,
    );
  });

  describe('normalizeBarkUrl', () => {
    it('handles empty or whitespace strings', () => {
      expect(normalizeBarkUrl('')).toBe('');
      expect(normalizeBarkUrl('   ')).toBe('');
    });

    it('prepends default Bark server when bare key is provided', () => {
      expect(normalizeBarkUrl('my_device_key')).toBe('https://api.day.app/my_device_key');
      expect(normalizeBarkUrl('my_device_key/')).toBe('https://api.day.app/my_device_key/');
    });

    it('preserves full http or https URLs', () => {
      expect(normalizeBarkUrl('https://api.day.app/custom_key/')).toBe('https://api.day.app/custom_key/');
      expect(normalizeBarkUrl('http://192.168.1.100:8080/push')).toBe('http://192.168.1.100:8080/push');
    });
  });
});
