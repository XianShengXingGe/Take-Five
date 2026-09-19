import { describe, expect, it } from 'vitest';
import { BarkClient, isValidBarkUrl, maskBarkUrl, normalizeBarkUrl } from '../src/core/bark-client.js';
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

  describe('maskBarkUrl', () => {
    it('returns empty string for empty input', () => {
      expect(maskBarkUrl('')).toBe('');
      expect(maskBarkUrl('   ')).toBe('');
    });

    it('masks Bark device keys in full URLs', () => {
      expect(maskBarkUrl('https://api.day.app/abcdef123456/')).toBe('https://api.day.app/abc***456/');
      expect(maskBarkUrl('https://api.day.app/12345678')).toBe('https://api.day.app/12***78');
      expect(maskBarkUrl('https://api.day.app/123456')).toBe('https://api.day.app/***');
      expect(maskBarkUrl('https://api.day.app/abc')).toBe('https://api.day.app/***');
    });

    it('masks custom self-hosted Bark URLs', () => {
      expect(maskBarkUrl('https://bark.example.com:8443/push/abcdef123456/')).toBe('https://bark.example.com:8443/push/abc***456/');
    });
  });

  describe('isValidBarkUrl', () => {
    it('accepts valid device keys', () => {
      expect(isValidBarkUrl('my_device_key')).toBe(true);
      expect(isValidBarkUrl('abcdef123456')).toBe(true);
      expect(isValidBarkUrl('device-key-with-dashes')).toBe(true);
      expect(isValidBarkUrl('my_device_key/')).toBe(true);
    });

    it('accepts valid full http and https URLs', () => {
      expect(isValidBarkUrl('https://api.day.app/custom_key')).toBe(true);
      expect(isValidBarkUrl('https://api.day.app/custom_key/')).toBe(true);
      expect(isValidBarkUrl('http://192.168.1.100:8080/push')).toBe(true);
      expect(isValidBarkUrl('https://bark.example.com/push/mykey')).toBe(true);
      expect(isValidBarkUrl('https://bark.example.com:8443/push/mykey/')).toBe(true);
    });

    it('rejects empty, null, or whitespace inputs', () => {
      expect(isValidBarkUrl('')).toBe(false);
      expect(isValidBarkUrl('   ')).toBe(false);
      expect(isValidBarkUrl(null)).toBe(false);
      expect(isValidBarkUrl(undefined)).toBe(false);
      expect(isValidBarkUrl(12345)).toBe(false);
    });

    it('rejects strings containing whitespace or control characters', () => {
      expect(isValidBarkUrl('invalid key with spaces')).toBe(false);
      expect(isValidBarkUrl('https://api.day.app/key with space')).toBe(false);
      expect(isValidBarkUrl('key\n')).toBe(false);
    });

    it('rejects non-http/https protocols', () => {
      expect(isValidBarkUrl('ftp://api.day.app/key')).toBe(false);
      expect(isValidBarkUrl('file:///tmp/key')).toBe(false);
      expect(isValidBarkUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects malformed URLs and official Bark URLs missing a device key', () => {
      expect(isValidBarkUrl('http://')).toBe(false);
      expect(isValidBarkUrl('https://')).toBe(false);
      expect(isValidBarkUrl('https://api.day.app')).toBe(false);
      expect(isValidBarkUrl('https://api.day.app/')).toBe(false);
      expect(isValidBarkUrl('http://.../')).toBe(false);
    });
  });
});
