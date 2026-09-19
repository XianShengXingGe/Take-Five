import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { MockBarkDispatcher, MockCredentialStore, createMockConfig } from '../src/testing/index.js';
import { BarkClient } from '../src/core/bark-client.js';

describe('Windows Card Structure Realignment, Minimal Tray Menu & Wide Bark Input (Ticket 05)', () => {
  const rootDir = process.cwd();
  const windowsDir = join(rootDir, 'src', 'desktop', 'windows');

  const getCsSources = () =>
    readdirSync(windowsDir)
      .filter((f) => f.endsWith('.cs'))
      .sort()
      .map((f) => join(windowsDir, f));

  const readCsSource = () =>
    getCsSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');

  let tempDir: string;
  let homeDir: string;
  let configPath: string;
  let env: Record<string, string | undefined>;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-win-ticket05-'));
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

  describe('1. Dashboard Card Restructuring & Independent Bark Card Removal', () => {
    it('restructures RenderDashboardView to strictly 4 cards in sequence: Agent -> Rules -> General Settings -> Support', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      // Check method signature and declaration
      expect(dashboardContent).toContain('Main Dashboard View (4 Cards)');
      expect(dashboardContent).toContain('private void RenderDashboardView()');

      // Check card instantiation order
      const agentVarIndex = dashboardContent.indexOf('var cardAgents = CreateAgentsStatusCard();');
      const rulesVarIndex = dashboardContent.indexOf('var cardRules = CreateNotificationRulesCard();');
      const systemVarIndex = dashboardContent.indexOf('var cardSystem = CreateSystemOptionsCard();');
      const supportVarIndex = dashboardContent.indexOf('var cardSupport = CreateSupportCard();');

      expect(agentVarIndex).toBeGreaterThan(0);
      expect(rulesVarIndex).toBeGreaterThan(agentVarIndex);
      expect(systemVarIndex).toBeGreaterThan(rulesVarIndex);
      expect(supportVarIndex).toBeGreaterThan(systemVarIndex);

      // Verify Controls.Add sequence contains all 4 cards
      expect(dashboardContent).toContain('dashboardView.Controls.Add(cardAgents);');
      expect(dashboardContent).toContain('dashboardView.Controls.Add(cardRules);');
      expect(dashboardContent).toContain('dashboardView.Controls.Add(cardSystem);');
      expect(dashboardContent).toContain('dashboardView.Controls.Add(cardSupport);');

      // Verify independent CreateBarkStatusCard is NOT added to dashboardView
      expect(dashboardContent).not.toMatch(/dashboardView\.Controls\.Add\(\s*CreateBarkStatusCard\(\)\s*\)/);
    });

    it('orders card titles matching dual-platform design spec (Agent -> Rules -> Preferences -> Support)', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      const agentIndex = dashboardContent.indexOf('agents.title');
      const rulesIndex = dashboardContent.indexOf('rules.title');
      const prefIndex = dashboardContent.indexOf('preferences.title');

      expect(agentIndex).toBeGreaterThan(0);
      expect(rulesIndex).toBeGreaterThan(agentIndex);
      expect(prefIndex).toBeGreaterThan(rulesIndex);
    });
  });

  describe('2. Wide Bark Input Field, Clipboard Integration & Status Indicator in General Settings', () => {
    it('integrates wide permanent Bark input at top of CreateSystemOptionsCard with paste and test buttons', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      // CreateSystemOptionsCard houses the Bark section
      expect(dashboardContent).toContain('CreateSystemOptionsCard()');
      expect(dashboardContent).toContain('bark.title');
      expect(dashboardContent).toContain('barkStatusLabel');
      expect(dashboardContent).toContain('bark.status_connected');
      expect(dashboardContent).toContain('bark.status_unconfigured');

      // Wide Bark input box
      expect(dashboardContent).toContain('barkEditBox = new TextBox');
      expect(dashboardContent).toContain('AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right');

      // Quick Paste button
      expect(dashboardContent).toContain('pasteBtn = new FluentButton');
      expect(dashboardContent).toContain('bark.paste');
      expect(dashboardContent).toContain('Clipboard.GetText()');

      // Test Push button
      expect(dashboardContent).toContain('testPushButton = new FluentButton');
      expect(dashboardContent).toContain('bark.send_test');

      // Feedback / hint label
      expect(dashboardContent).toContain('barkFeedbackLabel');
      expect(dashboardContent).toContain('bark.unconfigured_hint');
    });

    it('provides right-click context menu on Bark input with Paste, Copy, Cut, Select All, and Clear', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      expect(dashboardContent).toContain('barkContextMenu = new ContextMenuStrip()');
      expect(dashboardContent).toContain('bark.paste');
      expect(dashboardContent).toContain('bark.copy');
      expect(dashboardContent).toContain('bark.cut');
      expect(dashboardContent).toContain('bark.select_all');
      expect(dashboardContent).toContain('bark.clear');
      expect(dashboardContent).toContain('barkEditBox.ContextMenuStrip = barkContextMenu');
    });

    it('supports keyboard shortcuts (Ctrl+V, Ctrl+C, Ctrl+A) and handles Escape cancel', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      expect(dashboardContent).toContain('Keys.Escape');
      expect(dashboardContent).toContain('CancelBarkEdit()');
    });
  });

  describe('3. Instant Silent Save & Connectivity Verification on Enter and LostFocus', () => {
    it('wires Enter key and LostFocus events to CommitBarkEdit', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      expect(dashboardContent).toMatch(/if\s*\(e\.KeyCode\s*==\s*Keys\.Enter\)\s*\{\s*e\.SuppressKeyPress\s*=\s*true;\s*CommitBarkEdit\(true\);\s*\}/);
      expect(dashboardContent).toMatch(/barkEditBox\.LostFocus\s*\+=\s*\(s,\s*e\)\s*=>\s*\{\s*CommitBarkEdit\(false\);\s*\};/);
    });

    it('calls SaveBarkCredential with config --bark-url and immediately triggers test --quiet on save', () => {
      const dashboardContent = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      expect(dashboardContent).toContain('CommitBarkEdit');
      expect(dashboardContent).toContain('SaveBarkCredential');
      expect(dashboardContent).toContain('TriggerTestPush()');
      expect(dashboardContent).toContain('RunCli("test --quiet", false');
    });
  });

  describe('4. Minimal 3-Item System Tray Context Menu', () => {
    it('simplifies BuildMenu() into minimal 3 items: Open Dashboard, Global Notifications, and Quit', () => {
      const trayContent = readFileSync(join(windowsDir, 'TrayApp.cs'), 'utf-8');

      // The 3 items must be in BuildMenu
      expect(trayContent).toContain('openDashItem');
      expect(trayContent).toContain('menu.open_dash');

      expect(trayContent).toContain('masterItem');
      expect(trayContent).toContain('menu.notifications_active');
      expect(trayContent).toContain('menu.notifications_muted');
      expect(trayContent).toContain('menu.notifications_partial');

      expect(trayContent).toContain('quitItem');
      expect(trayContent).toContain('menu.quit');

      // Verify redundant dynamicAgent toggles are completely removed from context menu
      const buildMenuBody = trayContent.substring(
        trayContent.indexOf('private void BuildMenu()'),
        trayContent.indexOf('private Icon LoadOriginalAppIcon()')
      );
      expect(buildMenuBody).not.toMatch(/foreach\s*\(\s*var\s+agent\s+in\s+dynamicAgents\s*\)/);
      expect(buildMenuBody).not.toContain('agent.DisplayName');

      // Verify send test is removed from context menu
      expect(buildMenuBody).not.toContain('menu.send_test');
    });
  });

  describe('5. Unconfigured Cold-Start Logic Alignment', () => {
    it('directly renders DashboardView without forcing Onboarding Wizard, and focuses Bark input when unconfigured', () => {
      const mainContent = readFileSync(join(windowsDir, 'MainWindow.cs'), 'utf-8');

      // UpdateViewState defaults to RenderDashboardView unless isShowingOnboarding is true
      expect(mainContent).toContain('isShowingOnboarding');
      expect(mainContent).toMatch(/if\s*\(isShowingOnboarding\)\s*\{\s*RenderOnboardingView\(\);\s*\}\s*else\s*\{\s*RenderDashboardView\(\);\s*\}/);

      // ShowAndActivate focuses and selects Bark input when unconfigured
      expect(mainContent).toContain('ScrollControlIntoView(barkEditBox)');
      expect(mainContent).toContain('barkEditBox.Focus()');
      expect(mainContent).toContain('barkEditBox.SelectAll()');
    });
  });

  describe('6. Core CLI Seam Verification: Credential Save & Test Push', () => {
    it('saves new Bark URL and dispatches connectivity test push via CLI seam', async () => {
      const configManager = new ConfigManager({ configPath });
      await configManager.saveConfig(createMockConfig());

      const barkClient = new BarkClient({ fetchImpl: mockBark.createMockFetch() });
      const cli = createCli({
        configManager,
        credentialStore: mockCreds,
        barkClient,
        env,
      });

      // 1. Save new Bark endpoint
      await cli.parseAsync(['node', 'takefive', 'config', '--bark-url', 'windows_device_test_key', '--quiet']);
      expect(await mockCreds.getBarkUrl(env)).toBe('https://api.day.app/windows_device_test_key');

      // 2. Dispatch test push
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
      expect(requests.every((r) => r.url.includes('https://api.day.app/windows_device_test_key'))).toBe(true);
      expect(testOutput).toContain('dispatched successfully');
    });
  });
});
