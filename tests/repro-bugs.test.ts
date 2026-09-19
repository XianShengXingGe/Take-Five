import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAdapter } from '../src/adapters/codex-adapter.js';
import { MockBarkDispatcher, MockCredentialStore } from '../src/testing/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { BarkClient } from '../src/core/bark-client.js';
import { createCli } from '../src/cli/index.js';
import type { PromptDriver } from '../src/cli/commands/install.js';
import { OsCredentialStore } from '../src/core/credential-store.js';

describe('Bug 1: Codex multiple notifications in a single dialogue turn', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    adapter = new CodexAdapter();
  });

  it('binds Stop to task_completed in hooks.json for dual-channel protection', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'takefive-codex-bindings-'));
    try {
      const mockEnv = { HOME: tempDir, TAKEFIVE_CLI_COMMAND: 'takefive' };
      const status = await adapter.getHookStatus(mockEnv);
      expect(status.hooks.task_completed).toBeUndefined();

      await adapter.install({ env: mockEnv });
      const hooksJsonPath = adapter.getConfigPath(mockEnv);
      const hooksJson = JSON.parse(readFileSync(hooksJsonPath, 'utf-8'));
      
      // Stop hook must be installed in hooks.json as channel A alongside config.toml notify
      expect(hooksJson.hooks?.Stop[0].hooks[0].command).toContain('--event task_completed');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('suppresses task_completed notification when invoked without agent-turn-complete', () => {
    // 1. When Stop hook payload is passed from Codex
    const stopPayload = {
      cwd: '/Users/test/my-project',
      hook_event_name: 'Stop',
      last_assistant_message: 'Calling tool...',
      turn_id: 'turn-123',
      session_id: 'sess-456',
    };
    const parsed = adapter.parseHookPayload(stopPayload, 'task_completed');
    expect(parsed.shouldSkip).toBe(true);

    // 2. When empty stdin is passed (race condition fallback)
    const emptyParsed = adapter.parseHookPayload({}, 'task_completed');
    expect(emptyParsed.shouldSkip).toBe(true);
  });

  it('only allows task_completed when agent-turn-complete or turn-ended is explicitly provided', () => {
    const turnCompletePayload = {
      cwd: '/Users/test/my-project',
      event: 'agent-turn-complete',
      last_assistant_message: 'All done!',
    };
    const parsed = adapter.parseHookPayload(turnCompletePayload, 'task_completed');
    expect(parsed.shouldSkip).toBe(false);
    expect(parsed.eventType).toBe('task_completed');
  });
});

describe('Bug 2: Bark URL persistence and seamless upgrade without re-prompting', () => {
  let tempDir: string;
  let homeDir: string;
  let configPath: string;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-bug2-'));
    homeDir = join(tempDir, 'home');
    mkdirSync(homeDir, { recursive: true });
    configPath = join(homeDir, '.takefive', 'config.json');
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore(null);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prompts user to reuse previously saved Bark URL during update and proceeds with settings', async () => {
    await mockCreds.setBarkUrl('https://api.day.app/EXISTING_SAVED_KEY/');

    const selectPrompts: string[] = [];
    let passwordCalled = false;
    let confirmCalled = false;

    const mockPrompt: PromptDriver = {
      intro: () => {},
      outro: () => {},
      note: () => {},
      cancel: () => {},
      isCancel: () => false,
      password: async () => {
        passwordCalled = true;
        return '';
      },
      text: async () => '',
      select: async (opts) => {
        selectPrompts.push(opts.message);
        if (opts.message.includes('Bark')) {
          // User confirms reusing existing Bark URL
          return 'reuse';
        }
        if (opts.message.includes('语言') || opts.message.includes('Language')) {
          return 'zh-CN';
        }
        return (opts.options[0] as { value: any })?.value;
      },
      confirm: async () => {
        confirmCalled = true;
        return true;
      },
      spinner: () => ({
        start: () => {},
        stop: () => {},
        message: () => {},
      }),
    };

    const configManager = new ConfigManager({ configPath });
    // Pre-existing config simulating an upgrade
    await configManager.saveConfig({
      version: '1.0.0',
      language: 'zh-CN',
      debounceSeconds: 2,
      icons: { claude: '', codex: '', opencode: '', antigravity: '' },
      events: {
        task_completed: { enabled: true, level: 'active' },
        waiting_input: { enabled: true, level: 'timeSensitive' },
        waiting_permission: { enabled: true, level: 'timeSensitive' },
        task_failed: { enabled: true, level: 'timeSensitive' },
      },
      enabledAgents: { claude: true, codex: true, opencode: false, antigravity: false },
    });

    const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      barkClient,
      promptDriver: mockPrompt,
      agentDetectorOptions: { homedir: homeDir },
      env: { HOME: homeDir, TAKEFIVE_CLI_COMMAND: 'takefive' },
    });

    // Run install (as done by upgrade script)
    await cli.parseAsync(['node', 'takefive', 'install']);

    // Must have prompted user to select whether to reuse Bark URL, and to configure language
    expect(selectPrompts.length).toBeGreaterThanOrEqual(2);
    expect(selectPrompts[0]).toContain('Bark');
    // Reusing existing URL means password prompt was not needed
    expect(passwordCalled).toBe(false);
    // Notification rules confirm was called
    expect(confirmCalled).toBe(true);

    // Bark URL must be intact
    expect(await mockCreds.getBarkUrl()).toBe('https://api.day.app/EXISTING_SAVED_KEY/');
  });

  it('OsCredentialStore uses local file fallback when OS keychain is empty or unavailable', async () => {
    const credHome = join(homeDir, '.takefive');
    mkdirSync(credHome, { recursive: true });

    // Simulate Keychain runner returning exitCode 44 (not found)
    const mockRunner = async (file: string, args: string[]) => {
      if (args[0] === 'find-generic-password') {
        return { stdout: '', stderr: 'item not found', exitCode: 44 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    };

    const store = new OsCredentialStore({
      platform: 'darwin',
      runner: mockRunner,
    });

    // Directly write fallback file to simulate prior persistence
    const fallbackPath = join(credHome, '.credential');
    writeFileSync(fallbackPath, JSON.stringify({ barkUrl: 'https://api.day.app/FALLBACK_KEY/' }), 'utf-8');

    // Should recover Bark URL from fallback file even though Keychain returned not found
    const recoveredUrl = await store.getBarkUrl({ TAKEFIVE_HOME: credHome });
    expect(recoveredUrl).toBe('https://api.day.app/FALLBACK_KEY/');
  });
});
