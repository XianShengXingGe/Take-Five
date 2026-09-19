import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { type StatusReport } from '../src/cli/commands/status.js';
import { OsCredentialStore } from '../src/core/credential-store.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { BarkClient } from '../src/core/bark-client.js';
import { MockCredentialStore, MockBarkDispatcher, createMockConfig } from '../src/testing/index.js';
import type { PromptDriver } from '../src/cli/prompt-driver.js';

describe('Platform diagnostics for unsupported environments', () => {
  let tempDir: string;
  let configPath: string;
  let homeDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-platform-test-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('OsCredentialStore platform diagnostics', () => {
    it('accurately identifies macOS and Windows as supported', () => {
      const darwinStore = new OsCredentialStore({ platform: 'darwin' });
      const winStore = new OsCredentialStore({ platform: 'win32' });

      expect(darwinStore.isSupported()).toBe(true);
      expect(darwinStore.getPlatform()).toBe('darwin');
      expect(winStore.isSupported()).toBe(true);
      expect(winStore.getPlatform()).toBe('win32');
    });

    it('identifies Linux, FreeBSD, and OpenBSD as unsupported', () => {
      const linuxStore = new OsCredentialStore({ platform: 'linux' });
      const freebsdStore = new OsCredentialStore({ platform: 'freebsd' });

      expect(linuxStore.isSupported()).toBe(false);
      expect(linuxStore.getPlatform()).toBe('linux');
      expect(freebsdStore.isSupported()).toBe(false);
      expect(freebsdStore.getPlatform()).toBe('freebsd');
    });

    it('throws actionable error on setBarkUrl with unsupported platform', async () => {
      const store = new OsCredentialStore({ platform: 'linux' });
      await expect(store.setBarkUrl('https://api.day.app/SECRET_KEY/')).rejects.toThrowError(
        /Unsupported platform "linux": OS-level secure credential storage requires macOS Keychain or Windows Credential Manager/,
      );
    });
  });

  describe('CLI takefive status diagnostics on unsupported platform', () => {
    it('prints platform warning message when running on unsupported OS', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(
        createMockConfig({
          language: 'en',
        }),
      );

      const mockCreds = new MockCredentialStore(null, { supported: false, platform: 'linux' });

      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        env: { LANG: 'en_US.UTF-8' },
      });

      let output = '';
      const originalLog = console.log;
      console.log = (msg: unknown) => {
        output += String(msg) + '\n';
      };

      try {
        await cli.parseAsync(['node', 'takefive', 'status']);
      } finally {
        console.log = originalLog;
      }

      expect(output).toContain('Platform "linux" is unsupported for secure credential storage');
      expect(output).toContain('macOS Keychain or Windows Credential Manager is required');
    });

    it('includes platform diagnostic fields in --json output', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(
        createMockConfig({
          language: 'en',
        }),
      );

      const mockCreds = new MockCredentialStore(null, { supported: false, platform: 'linux' });

      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
      });

      let output = '';
      const originalLog = console.log;
      console.log = (msg: unknown) => {
        output += String(msg) + '\n';
      };

      try {
        await cli.parseAsync(['node', 'takefive', 'status', '--json']);
      } finally {
        console.log = originalLog;
      }

      const parsed: StatusReport = JSON.parse(output);
      expect(parsed.bark.platform).toBe('linux');
      expect(parsed.bark.platformSupported).toBe(false);
    });
  });

  describe('CLI takefive install diagnostics on unsupported platform', () => {
    it('displays upfront platform compatibility note during installation wizard', async () => {
      const configManager = new ConfigManager({ configPath });
      const mockCreds = new MockCredentialStore(null, { supported: false, platform: 'linux' });
      const mockBark = new MockBarkDispatcher();

      const notesRecorded: { message: string; title?: string }[] = [];
      const mockPrompt: PromptDriver = {
        intro: () => {},
        outro: () => {},
        note: (message: string, title?: string) => {
          notesRecorded.push({ message, title });
        },
        spinner: () => ({
          start: () => {},
          stop: () => {},
          message: () => {},
        }),
        select: async () => 'cancel',
        password: async () => 'https://api.day.app/TEST_KEY/',
        confirm: async () => true,
        text: async () => '',
        isCancel: () => false,
        cancel: () => {},
      };

      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient: new BarkClient({ fetchImpl: mockBark.createMockFetch() }),
        promptDriver: mockPrompt,
        agentDetectorOptions: { platform: 'linux', homedir: homeDir, existsFn: () => false },
        env: { LANG: 'en_US.UTF-8' },
      });

      await cli.parseAsync(['node', 'takefive', 'install']);

      const platformNote = notesRecorded.find(
        (n) => n.title?.includes('Platform') || n.message.includes('secure credential storage is unsupported'),
      );
      expect(platformNote).toBeDefined();
      expect(platformNote?.message).toContain('linux');
    });

    it('cancels gracefully with clear message when OsCredentialStore throws in force_save', async () => {
      const configManager = new ConfigManager({ configPath });
      const store = new OsCredentialStore({ platform: 'linux' });
      const mockBark = new MockBarkDispatcher();
      mockBark.simulateError(new Error('Network unreachable'));

      const cancelledReasons: string[] = [];
      const mockPrompt: PromptDriver = {
        intro: () => {},
        outro: () => {},
        note: () => {},
        spinner: () => ({
          start: () => {},
          stop: () => {},
          message: () => {},
        }),
        select: async () => 'force_save',
        password: async () => 'https://api.day.app/INVALID_TOKEN/',
        confirm: async () => true,
        text: async () => '',
        isCancel: () => false,
        cancel: (msg?: string) => {
          if (msg) cancelledReasons.push(msg);
        },
      };

      const cli = createCli({
        configManager,
        credentialStore: store,
        barkClient: new BarkClient({ fetchImpl: mockBark.createMockFetch() }),
        promptDriver: mockPrompt,
        agentDetectorOptions: { platform: 'linux', homedir: homeDir, existsFn: () => false },
        env: { LANG: 'en_US.UTF-8' },
      });

      await cli.parseAsync(['node', 'takefive', 'install']);

      expect(cancelledReasons.length).toBeGreaterThan(0);
      expect(cancelledReasons[0]).toContain('Unsupported platform "linux"');
      expect(cancelledReasons[0]).toContain('OS-level secure credential storage requires macOS Keychain or Windows Credential Manager');
    });

    it('cancels with actionable error when network push succeeds but OsCredentialStore fails to save', async () => {
      const configManager = new ConfigManager({ configPath });
      const store = new OsCredentialStore({ platform: 'linux' });
      const mockBark = new MockBarkDispatcher(); // Successful push

      const cancelledReasons: string[] = [];
      const mockPrompt: PromptDriver = {
        intro: () => {},
        outro: () => {},
        note: () => {},
        spinner: () => ({
          start: () => {},
          stop: () => {},
          message: () => {},
        }),
        select: async () => 'cancel',
        password: async () => 'https://api.day.app/VALID_TOKEN/',
        confirm: async () => true,
        text: async () => '',
        isCancel: () => false,
        cancel: (msg?: string) => {
          if (msg) cancelledReasons.push(msg);
        },
      };

      const cli = createCli({
        configManager,
        credentialStore: store,
        barkClient: new BarkClient({ fetchImpl: mockBark.createMockFetch() }),
        promptDriver: mockPrompt,
        agentDetectorOptions: { platform: 'linux', homedir: homeDir, existsFn: () => false },
        env: { LANG: 'en_US.UTF-8' },
      });

      await cli.parseAsync(['node', 'takefive', 'install']);

      expect(cancelledReasons.length).toBeGreaterThan(0);
      expect(cancelledReasons[0]).toContain('Unsupported platform "linux"');
      expect(cancelledReasons[0]).toContain('OS-level secure credential storage requires macOS Keychain or Windows Credential Manager');
    });
  });
});
