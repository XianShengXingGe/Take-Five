import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCli } from '../src/cli/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { MockBarkDispatcher, MockCredentialStore, createMockConfig } from '../src/testing/index.js';
import { BarkClient } from '../src/core/bark-client.js';

describe('macOS Template Bell Icon, 3-Item Status Menu & Clipboard-Enabled Bark Input (Ticket 03)', () => {
  let tempDir: string;
  let homeDir: string;
  let configPath: string;
  let env: Record<string, string | undefined>;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  const rootDir = process.cwd();
  const macosDir = join(rootDir, 'src', 'desktop', 'macos');
  const buildDmgPath = join(rootDir, 'scripts', 'build-dmg.sh');

  const getSwiftSources = () =>
    readdirSync(macosDir)
      .filter((f) => f.endsWith('.swift'))
      .sort()
      .map((f) => join(macosDir, f));

  const readSwiftSource = () =>
    getSwiftSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-macos-ticket03-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
    mkdirSync(join(homeDir, '.takefive'), { recursive: true });
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore('https://api.day.app/ORIGINAL_KEY');
    env = { HOME: homeDir, USERPROFILE: homeDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('1. Pure Menu Bar Accessory Process & Packaging Configuration', () => {
    it('configures LSUIElement true in build-dmg.sh Info.plist template', () => {
      const dmgScript = readFileSync(buildDmgPath, 'utf-8');
      expect(dmgScript).toMatch(/<key>LSUIElement<\/key>\s*<true\/>/);
      expect(dmgScript).not.toMatch(/<key>LSUIElement<\/key>\s*<false\/>/);
    });

    it('sets activation policy to accessory and initializes system Edit menu at entry point', () => {
      const mainContent = readFileSync(join(macosDir, 'main.swift'), 'utf-8');
      const controllerContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      expect(mainContent).toContain('setActivationPolicy(.accessory)');
      expect(controllerContent).toContain('setActivationPolicy(.accessory)');
      expect(controllerContent).toContain('setupSystemEditMenu()');
    });
  });

  describe('2. Menu Bar Click Handling, Floating Window & Life Cycle', () => {
    it('handles left click to toggle main window and right click for context menu', () => {
      const controllerContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      // Status button action setup
      expect(controllerContent).toContain('button.action = #selector(statusItemClicked(_:))');
      expect(controllerContent).toContain('.leftMouseUp');
      expect(controllerContent).toContain('.rightMouseUp');

      // statusItemClicked method handling
      expect(controllerContent).toContain('func statusItemClicked(');
      expect(controllerContent).toContain('.rightMouseUp');
      expect(controllerContent).toContain('showMainWindow');

      // NSMenuDelegate to cleanly detach menu on close
      expect(controllerContent).toContain('NSMenuDelegate');
      expect(controllerContent).toContain('func menuDidClose(');
      expect(controllerContent).toContain('statusItem.menu = nil');
    });

    it('configures floating window level and orderOut hide on close', () => {
      const controllerContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      expect(controllerContent).toContain('window.level = .floating');
      expect(controllerContent).toContain('windowShouldClose');
      expect(controllerContent).toContain('sender.orderOut(nil)');
      expect(controllerContent).toContain('return false');
    });
  });

  describe('3. 18x18 Template Bell Icon & Minimal 3-Item Status Menu (Ticket 03)', () => {
    it('renders 18x18 monochrome vector template bell with monitoring, muted slash and badge states', () => {
      const controllerContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      expect(controllerContent).toContain('NSSize(width: 18, height: 18)');
      expect(controllerContent).toContain('image.isTemplate = true');
      expect(controllerContent).toContain('bell.fill');
      expect(controllerContent).toContain('bell.slash.fill');
      expect(controllerContent).toContain('bell.badge.fill');
      expect(controllerContent).toContain('button.image = image');
    });

    it('configures minimal 3-item status menu without individual agent toggles or send test push', () => {
      const controllerContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      // 3 items present in setupMenu
      expect(controllerContent).toContain('menu.open_dash');
      expect(controllerContent).toContain('toggleAllMenuAction');
      expect(controllerContent).toContain('menu.quit');

      // Redundant items removed from menu
      expect(controllerContent).not.toMatch(/for agent in appState\.dynamicAgents/);
      expect(controllerContent).not.toContain('menu.send_test');
    });
  });

  describe('4. Dashboard Card Restructuring & Wide Bark Input Field (Ticket 03)', () => {
    it('restructures cards in exact order: Agent Platform -> Rules -> General Preferences -> Support', () => {
      const dashboardContent = readFileSync(join(macosDir, 'DashboardView.swift'), 'utf-8');

      const agentIndex = dashboardContent.indexOf('agents.title');
      const rulesIndex = dashboardContent.indexOf('rules.title');
      const prefIndex = dashboardContent.indexOf('preferences.title');
      const supportIndex = dashboardContent.indexOf('SupportCommunityCard');

      expect(agentIndex).toBeGreaterThan(0);
      expect(rulesIndex).toBeGreaterThan(agentIndex);
      expect(prefIndex).toBeGreaterThan(rulesIndex);
      expect(supportIndex).toBeGreaterThan(prefIndex);
    });

    it('integrates wide permanent Bark input at top of General Settings with paste, clear, and test buttons', () => {
      const dashboardContent = readFileSync(join(macosDir, 'DashboardView.swift'), 'utf-8');

      // InlineBarkTextField is now permanent in preferences
      expect(dashboardContent).toContain('InlineBarkTextField(');
      expect(dashboardContent).toContain('onUpdateBarkUrl');
      expect(dashboardContent).toContain('doc.on.clipboard'); // Paste button icon
      expect(dashboardContent).toContain('xmark.circle.fill'); // Clear button icon
      expect(dashboardContent).toContain('bark.send_test');
      expect(dashboardContent).toContain('preferences.autostart');
      expect(dashboardContent).toContain('preferences.language');
    });

    it('implements AccessoryBarkTextField and InlineBarkTextField with Cmd+V/C/X/A and context menu', () => {
      const componentsContent = readFileSync(join(macosDir, 'Components.swift'), 'utf-8');

      expect(componentsContent).toContain('AccessoryBarkTextField');
      expect(componentsContent).toContain('performKeyEquivalent');
      expect(componentsContent).toContain('rightMouseDown');
      expect(componentsContent).toContain('InlineBarkTextField');
      expect(componentsContent).toContain('NSViewRepresentable');
      expect(componentsContent).toContain('NSTextFieldDelegate');
      expect(componentsContent).toContain('selectAll(nil)');
      expect(componentsContent).toContain('cancelOperation');
      expect(componentsContent).toContain('insertNewline');
      expect(componentsContent).toContain('controlTextDidEndEditing');
    });
  });

  describe('5. Core Seam Invocation & Immediate Test Push', () => {
    it('defines updateBarkUrl calling config --bark-url and immediately sending test push', () => {
      const actionsContent = readFileSync(join(macosDir, 'Controllers+Actions.swift'), 'utf-8');

      expect(actionsContent).toContain('func updateBarkUrl(');
      expect(actionsContent).toContain('config');
      expect(actionsContent).toContain('--bark-url');
      expect(actionsContent).toContain('--quiet');
      expect(actionsContent).toContain('sendTestPush()');
    });

    it('includes localized strings for inline bark editing in L10n', () => {
      const l10nContent = readFileSync(join(macosDir, 'L10n.swift'), 'utf-8');

      expect(l10nContent).toContain('bark.edit_tooltip');
      expect(l10nContent).toContain('bark.updating');
      expect(l10nContent).toContain('bark.updated');
      expect(l10nContent).toContain('bark.update_failed');
    });

    it('verifies CLI seam: updates credential and sends test push sequentially', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
        env,
      });

      // 1. Update bark-url via core CLI seam
      await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'new_device_test_key', '--quiet']);
      expect(await mockCreds.getBarkUrl(env)).toBe('https://api.day.app/new_device_test_key');

      // 2. Dispatch test push immediately using the updated credentials
      let testOutput = '';
      const origLog = console.log;
      console.log = (msg: unknown) => {
        testOutput += String(msg) + '\n';
      };

      try {
        await cli.parseAsync(['node', 'takefive', 'test']);
      } finally {
        console.log = origLog;
      }

      const requests = mockBark.getRequests();
      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(requests.every((r) => r.url.includes('https://api.day.app/new_device_test_key'))).toBe(true);
      expect(testOutput).toContain('dispatched successfully');
    });
  });

  describe('6. Native Swift Sources Compilation', () => {
    it('compiles all macOS modular Swift sources cleanly with swiftc', () => {
      if (process.platform !== 'darwin' || !existsSync('/usr/bin/swiftc')) return;

      const outBin = join(tempDir, 'takefive_ticket03_build_probe');
      const envWithTools = {
        ...process.env,
        PATH: `/usr/bin:/bin:/usr/sbin:/sbin:/Library/Developer/CommandLineTools/usr/bin:${process.env.PATH || ''}`,
      };

      try {
        execFileSync('/usr/bin/swiftc', ['-O', ...getSwiftSources(), '-o', outBin], {
          env: envWithTools,
          stdio: 'pipe',
          timeout: 30000,
        });
      } catch (err: any) {
        const details = `SWIFTC EXEC ERROR: status=${err.status} signal=${err.signal} stdout=${err.stdout?.toString()} stderr=${err.stderr?.toString()} msg=${err.message}`;
        throw new Error(details);
      }

      expect(existsSync(outBin)).toBe(true);
    }, 35000);
  });
});
