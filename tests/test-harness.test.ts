import { describe, expect, it } from 'vitest';
import {
  MockBarkDispatcher,
  MockCredentialStore,
  createMockBarkPayload,
  createMockConfig,
  createMockUnifiedEvent,
} from '../src/testing/index.js';

describe('MockCredentialStore', () => {
  it('initializes with null or provided value', async () => {
    const store1 = new MockCredentialStore();
    expect(await store1.getBarkUrl()).toBeNull();

    const store2 = new MockCredentialStore('https://api.day.app/token123');
    expect(await store2.getBarkUrl()).toBe('https://api.day.app/token123');
  });

  it('updates and deletes credentials in memory', async () => {
    const store = new MockCredentialStore();

    await store.setBarkUrl('https://api.day.app/key-abc');
    expect(await store.getBarkUrl()).toBe('https://api.day.app/key-abc');

    await store.deleteBarkUrl();
    expect(await store.getBarkUrl()).toBeNull();
  });

  it('records call history accurately', async () => {
    const store = new MockCredentialStore();

    await store.getBarkUrl();
    await store.setBarkUrl('https://api.day.app/key-123');
    await store.deleteBarkUrl();

    const history = store.getCallHistory();
    expect(history.length).toBe(3);
    expect(history[0]?.method).toBe('getBarkUrl');
    expect(history[1]?.method).toBe('setBarkUrl');
    expect(history[1]?.argument).toBe('https://api.day.app/key-123');
    expect(history[2]?.method).toBe('deleteBarkUrl');

    expect(store.getCallCount()).toBe(3);
    expect(store.getCallCount('getBarkUrl')).toBe(1);
    expect(store.getCallCount('setBarkUrl')).toBe(1);
    expect(store.getCallCount('deleteBarkUrl')).toBe(1);
  });

  it('simulates errors when configured', async () => {
    const store = new MockCredentialStore();
    const testError = new Error('Keychain locked');

    store.simulateError('getBarkUrl', testError);
    await expect(store.getBarkUrl()).rejects.toThrow('Keychain locked');

    store.simulateError('getBarkUrl', null);
    await expect(store.getBarkUrl()).resolves.toBeNull();
  });

  it('resets internal state', async () => {
    const store = new MockCredentialStore('https://api.day.app/old');
    await store.setBarkUrl('https://api.day.app/new');

    store.reset('https://api.day.app/fresh');
    expect(await store.getBarkUrl()).toBe('https://api.day.app/fresh');
    expect(store.getCallCount()).toBe(1);
  });
});

describe('MockBarkDispatcher', () => {
  it('dispatches and records payloads in memory', async () => {
    const dispatcher = new MockBarkDispatcher();
    const payload = createMockBarkPayload({
      title: '✅ Custom Title',
      body: 'Custom body text',
    });

    const response = await dispatcher.dispatch('https://api.day.app/push', payload, {
      'X-Test-Header': 'val',
    });

    expect(response.code).toBe(200);
    expect(response.message).toBe('success');
    expect(dispatcher.getRequestCount()).toBe(1);
    expect(dispatcher.getLastPayload()).toEqual(payload);
    expect(dispatcher.getLastRequest()?.url).toBe('https://api.day.app/push');
    expect(dispatcher.getLastRequest()?.headers).toEqual({ 'X-Test-Header': 'val' });
  });

  it('supports custom handler for dynamic responses', async () => {
    const dispatcher = new MockBarkDispatcher();
    dispatcher.setHandler((url, payload) => {
      if (url.includes('invalid')) {
        return { code: 400, message: 'Invalid device token' };
      }
      return { code: 200, message: `Dispatched: ${payload.title}` };
    });

    const successRes = await dispatcher.dispatch('https://api.day.app/valid', createMockBarkPayload());
    expect(successRes.code).toBe(200);
    expect(successRes.message).toBe('Dispatched: ✅ 任务完成');

    const failRes = await dispatcher.dispatch('https://api.day.app/invalid', createMockBarkPayload());
    expect(failRes.code).toBe(400);
    expect(failRes.message).toBe('Invalid device token');
  });

  it('simulates network errors', async () => {
    const dispatcher = new MockBarkDispatcher();
    dispatcher.simulateError(new Error('Network timeout'));

    await expect(
      dispatcher.dispatch('https://api.day.app/push', createMockBarkPayload()),
    ).rejects.toThrow('Network timeout');
  });

  it('provides a mock fetch implementation compatible with global fetch', async () => {
    const dispatcher = new MockBarkDispatcher();
    const mockFetch = dispatcher.createMockFetch();

    const payload = createMockBarkPayload({ title: 'Fetch Test' });
    const response = await mockFetch('https://api.day.app/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { code: number; message: string };
    expect(data.code).toBe(200);
    expect(dispatcher.getLastPayload()?.title).toBe('Fetch Test');
  });

  it('handles Request instances in mock fetch', async () => {
    const dispatcher = new MockBarkDispatcher();
    const mockFetch = dispatcher.createMockFetch();

    const payload = createMockBarkPayload({ title: 'Request Object Test' });
    const request = new Request('https://api.day.app/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Custom': '1' },
      body: JSON.stringify(payload),
    });

    const response = await mockFetch(request);
    expect(response.status).toBe(200);
    expect(dispatcher.getLastPayload()?.title).toBe('Request Object Test');
    expect(dispatcher.getLastRequest()?.headers?.['x-custom']).toBe('1');
  });

  it('resets dispatcher state', async () => {
    const dispatcher = new MockBarkDispatcher();
    await dispatcher.dispatch('https://api.day.app/push', createMockBarkPayload());
    expect(dispatcher.getRequestCount()).toBe(1);

    dispatcher.reset();
    expect(dispatcher.getRequestCount()).toBe(0);
    expect(dispatcher.getLastRequest()).toBeUndefined();
    expect(dispatcher.getLastPayload()).toBeUndefined();
  });
});

describe('Test Fixture Generators', () => {
  it('creates default UnifiedEvent fixture with overrides', () => {
    const defaultEv = createMockUnifiedEvent();
    expect(defaultEv.type).toBe('task_completed');
    expect(defaultEv.agent).toBe('claude');
    expect(defaultEv.project).toBe('Take-Five');
    expect(typeof defaultEv.timestamp).toBe('number');

    const customEv = createMockUnifiedEvent({
      type: 'task_failed',
      agent: 'antigravity',
      reason: 'Rate limit exceeded',
    });
    expect(customEv.type).toBe('task_failed');
    expect(customEv.agent).toBe('antigravity');
    expect(customEv.reason).toBe('Rate limit exceeded');
  });

  it('creates default BarkPushPayload fixture with overrides', () => {
    const defaultPayload = createMockBarkPayload();
    expect(defaultPayload.title).toBe('✅ 任务完成');
    expect(defaultPayload.level).toBe('active');

    const customPayload = createMockBarkPayload({
      level: 'critical',
      sound: 'alarm.caf',
    });
    expect(customPayload.level).toBe('critical');
    expect(customPayload.sound).toBe('alarm.caf');
  });

  it('creates default TakeFiveConfig fixture with overrides', () => {
    const config = createMockConfig({
      debounceSeconds: 5,
      language: 'en',
    });
    expect(config.debounceSeconds).toBe(5);
    expect(config.language).toBe('en');
    expect(config.events.task_completed.enabled).toBe(true);
  });
});
