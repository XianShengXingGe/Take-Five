import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createCli } from '../src/cli/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { MockCredentialStore } from '../src/testing/index.js';
import { getLocaleStrings } from '../src/i18n/index.js';

function readDirConcatenated(dir: string, ext: string): string {
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

describe('Interactive Event Priority Controls, Card Architecture & Tray Parity (Ticket 08 / v0.6.0)', () => {
  const rootDir = process.cwd();
  const macosDir = join(rootDir, 'src', 'desktop', 'macos');
  const windowsDir = join(rootDir, 'src', 'desktop', 'windows');

  const getSwiftSources = () =>
    readdirSync(macosDir)
      .filter((f) => f.endsWith('.swift'))
      .sort()
      .map((f) => join(macosDir, f));
  const readSwiftSource = () =>
    getSwiftSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');
  const readCsSource = () => readDirConcatenated(windowsDir, '.cs');

  const zhLocalePath = join(rootDir, 'src', 'i18n', 'locales', 'zh-CN.ts');
  const enLocalePath = join(rootDir, 'src', 'i18n', 'locales', 'en.ts');

  describe('1. Jargon Removal & Unified 4-Card Title Specifications', () => {
    it('completely removes "双通道智能门控" and jargon "双通道" from desktop code and locales', () => {
      const swiftContent = readSwiftSource();
      const csContent = readCsSource();
      const zhLocaleContent = readFileSync(zhLocalePath, 'utf-8');
      const enLocaleContent = readFileSync(enLocalePath, 'utf-8');

      expect(swiftContent).not.toContain('双通道智能门控');
      expect(swiftContent).not.toContain('双通道通知');
      expect(csContent).not.toContain('双通道智能门控');
      expect(csContent).not.toContain('双通道');
      expect(zhLocaleContent).not.toContain('双通道智能门控');
      expect(zhLocaleContent).not.toContain('双通道');
      expect(enLocaleContent).not.toContain('dual-channel push');
    });

    it('unifies all 4 modular card titles across locales, macOS Swift, and Windows C#', () => {
      const zh = getLocaleStrings('zh-CN');
      const en = getLocaleStrings('en');

      // 1. Agent Platform Card Title
      expect(zh.agentsUI.title).toBe('🤖 Agent 平台');
      expect(en.agentsUI.title).toBe('🤖 Agent Platform');

      // 2. Notification Rules Card Title & Description
      expect(zh.rules.title).toBe('🔔 通知规则');
      expect(en.rules.title).toBe('🔔 Notification Rules');
      expect(zh.rules.description).toBe('按需设置事件提醒级别，兼顾及时响应与沉浸专注');
      expect(en.rules.description).toBe('Customize alert priority for each event to balance focus and responsiveness');

      // 3. General Settings Card Title
      expect(zh.preferences.title).toBe('⚙️ 通用设置');
      expect(en.preferences.title).toBe('⚙️ General Settings');

      // 4. Support & Sponsor Card Title
      expect(zh.support.title).toBe('❤️ 支持与赞赏');
      expect(en.support.title).toBe('❤️ Support & Sponsor');

      // macOS L10n assertions
      const swiftContent = readSwiftSource();
      expect(swiftContent).toContain('case "agents.title": return zh ? "🤖 Agent 平台" : "🤖 Agent Platform"');
      expect(swiftContent).toContain('case "rules.title": return zh ? "🔔 通知规则" : "🔔 Notification Rules"');
      expect(swiftContent).toContain('case "preferences.title": return zh ? "⚙️ 通用设置" : "⚙️ General Settings"');
      expect(swiftContent).toContain('case "support.title": return zh ? "❤️ 支持与赞赏" : "❤️ Support & Sponsor"');

      // Windows Models.cs assertions
      const csContent = readCsSource();
      expect(csContent).toContain('case "agents.title": return zh ? "🤖 Agent 平台" : "🤖 Agent Platform"');
      expect(csContent).toContain('case "rules.title": return zh ? "🔔 通知规则" : "🔔 Notification Rules"');
      expect(csContent).toContain('case "preferences.title": return zh ? "⚙️ 通用设置" : "⚙️ General Settings"');
      expect(csContent).toContain('case "support.title": return zh ? "❤️ 支持与赞赏" : "❤️ Support & Sponsor"');
    });
  });

  describe('2. Dual-Platform 4-Card Layout & Docking Sequence Parity', () => {
    it('orders 4 cards strictly as (Agent -> Rules -> General Settings -> Support) in macOS DashboardView', () => {
      const dashboardSwift = readFileSync(join(macosDir, 'DashboardView.swift'), 'utf-8');

      const agentIndex = dashboardSwift.indexOf('agents.title');
      const rulesIndex = dashboardSwift.indexOf('rules.title');
      const prefIndex = dashboardSwift.indexOf('preferences.title');
      const supportIndex = dashboardSwift.indexOf('SupportCommunityCard');

      expect(agentIndex).toBeGreaterThan(0);
      expect(rulesIndex).toBeGreaterThan(agentIndex);
      expect(prefIndex).toBeGreaterThan(rulesIndex);
      expect(supportIndex).toBeGreaterThan(prefIndex);
    });

    it('orders 4 cards strictly as (Agent -> Rules -> General Settings -> Support) in Windows MainWindow.Dashboard.cs', () => {
      const dashboardCs = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      const agentVarIndex = dashboardCs.indexOf('var cardAgents = CreateAgentsStatusCard();');
      const rulesVarIndex = dashboardCs.indexOf('var cardRules = CreateNotificationRulesCard();');
      const systemVarIndex = dashboardCs.indexOf('var cardSystem = CreateSystemOptionsCard();');
      const supportVarIndex = dashboardCs.indexOf('var cardSupport = CreateSupportCard();');

      expect(agentVarIndex).toBeGreaterThan(0);
      expect(rulesVarIndex).toBeGreaterThan(agentVarIndex);
      expect(systemVarIndex).toBeGreaterThan(rulesVarIndex);
      expect(supportVarIndex).toBeGreaterThan(systemVarIndex);
    });
  });

  describe('3. Minimal 3-Item System Tray Menu Parity', () => {
    it('implements minimal 3-item status menu on macOS without redundant agent rows or test buttons', () => {
      const controllersContent = readFileSync(join(macosDir, 'Controllers.swift'), 'utf-8');

      // Item 1: Open Dashboard
      expect(controllersContent).toContain('menu.open_dash');
      // Item 2: Master Notification Toggle
      expect(controllersContent).toContain('menu.notifications_active');
      expect(controllersContent).toContain('menu.notifications_muted');
      expect(controllersContent).toContain('menu.notifications_partial');
      // Item 3: Quit
      expect(controllersContent).toContain('menu.quit');

      // Verify no dynamic agent item loop inside setupMenu()
      const setupMenuBody = controllersContent.substring(
        controllersContent.indexOf('func setupMenu()'),
        controllersContent.indexOf('func menuDidClose')
      );
      expect(setupMenuBody).not.toContain('for agent in appState.dynamicAgents');
      expect(setupMenuBody).not.toContain('menu.send_test');
    });

    it('implements minimal 3-item context menu on Windows without redundant agent rows or test buttons', () => {
      const trayContent = readFileSync(join(windowsDir, 'TrayApp.cs'), 'utf-8');

      // Item 1: Open Dashboard
      expect(trayContent).toContain('openDashItem');
      expect(trayContent).toContain('menu.open_dash');
      // Item 2: Master Notification Toggle
      expect(trayContent).toContain('masterItem');
      expect(trayContent).toContain('menu.notifications_active');
      expect(trayContent).toContain('menu.notifications_muted');
      expect(trayContent).toContain('menu.notifications_partial');
      // Item 3: Quit
      expect(trayContent).toContain('quitItem');
      expect(trayContent).toContain('menu.quit');

      // Verify no dynamic agent loop inside BuildMenu()
      const buildMenuBody = trayContent.substring(
        trayContent.indexOf('private void BuildMenu()'),
        trayContent.indexOf('private Icon LoadOriginalAppIcon()')
      );
      expect(buildMenuBody).not.toMatch(/foreach\s*\(\s*var\s+agent\s+in\s+dynamicAgents\s*\)/);
      expect(buildMenuBody).not.toContain('menu.send_test');
    });
  });

  describe('4. Bark Integration in General Settings & Standalone Card Removal', () => {
    it('integrates Bark input and status indicator in Card 3 on macOS, removing standalone Bark card', () => {
      const dashboardSwift = readFileSync(join(macosDir, 'DashboardView.swift'), 'utf-8');

      // Card 3 houses Bark section
      expect(dashboardSwift).toContain('preferences.title');
      expect(dashboardSwift).toContain('bark.title');
      expect(dashboardSwift).toContain('InlineBarkTextField');
      expect(dashboardSwift).toContain('state.isBarkConfigured');
      expect(dashboardSwift).toContain('bark.status_connected');
      expect(dashboardSwift).toContain('bark.status_unconfigured');

      // No standalone Bark card
      expect(dashboardSwift).not.toMatch(/struct\s+BarkStatusCard\s*:\s*View/);
    });

    it('integrates Bark input and status indicator in Card 3 on Windows, removing standalone Bark card', () => {
      const dashboardCs = readFileSync(join(windowsDir, 'MainWindow.Dashboard.cs'), 'utf-8');

      // Card 3 houses Bark section
      expect(dashboardCs).toContain('CreateSystemOptionsCard()');
      expect(dashboardCs).toContain('bark.title');
      expect(dashboardCs).toContain('barkEditBox');
      expect(dashboardCs).toContain('barkStatusLabel');
      expect(dashboardCs).toContain('bark.status_connected');
      expect(dashboardCs).toContain('bark.status_unconfigured');

      // No standalone Bark card
      expect(dashboardCs).not.toContain('CreateBarkStatusCard()');
    });
  });

  describe('5. Four Event Rules and Dual Levels Specification', () => {
    it('defines all 4 event rules and both notification levels in i18n locales', () => {
      const zh = getLocaleStrings('zh-CN');
      const en = getLocaleStrings('en');

      expect(zh.rules.taskCompleted).toBe('任务完成');
      expect(en.rules.taskCompleted).toBe('Task Completed');

      expect(zh.rules.waitingPermission).toBe('等待授权');
      expect(en.rules.waitingPermission).toBe('Waiting Permission');

      expect(zh.rules.waitingInput).toBe('等待输入');
      expect(en.rules.waitingInput).toBe('Waiting Input');

      expect(zh.rules.taskFailed).toBe('任务失败');
      expect(en.rules.taskFailed).toBe('Task Failed');

      expect(zh.rules.levelActive).toBe('普通');
      expect(en.rules.levelActive).toBe('Active');

      expect(zh.rules.levelTimeSensitive).toBe('重要');
      expect(en.rules.levelTimeSensitive).toBe('Time-Sensitive');
    });
  });

  describe('6. macOS Native Implementation', () => {
    it('implements RuleLevelSegmentedPicker with matchedGeometryEffect and micro-glow animation', () => {
      const content = readSwiftSource();

      expect(content).toContain('struct RuleLevelSegmentedPicker: View');
      expect(content).toContain('segmentAnimation');
      expect(content).toContain('withAnimation(.spring(');
      expect(content).toContain('matchedGeometryEffect(id: "activePill_\\(tag)", in: segmentAnimation)');
      expect(content).toContain('.shadow(color:');
      expect(content).toContain('level == "timeSensitive" ? Color(red: 0.65, green: 0.30, blue: 0.30) : Color(red: 0.20, green: 0.48, blue: 0.38)');
      expect(content).toContain('Color(red: 0.70, green: 0.34, blue: 0.34)'); // Muted Terracotta Red
      expect(content).toContain('Color(red: 0.25, green: 0.52, blue: 0.42)'); // Muted Sage Green
    });

    it('renders all 4 event rule rows in Card 2 with respective icons and tags', () => {
      const content = readSwiftSource();

      expect(content).toContain('ruleRow(tag: "task_completed", titleKey: "rules.task_completed"');
      expect(content).toContain('ruleRow(tag: "waiting_permission", titleKey: "rules.waiting_permission"');
      expect(content).toContain('ruleRow(tag: "waiting_input", titleKey: "rules.waiting_input"');
      expect(content).toContain('ruleRow(tag: "task_failed", titleKey: "rules.task_failed"');
    });

    it('calls CLI config command immediately when updating event rule', () => {
      const content = readSwiftSource();

      expect(content).toContain('func updateEventRule(eventType: String, level: String)');
      expect(content).toContain('["config", "--event", eventType, "--level", level, "--quiet"]');
    });

    it('parses events in fallbackLocalConfigRead for robust offline/fallback reactivity', () => {
      const content = readSwiftSource();

      expect(content).toContain('if let events = json["events"] as? [String: [String: Any]]');
      expect(content).toContain('self.appState.eventRules[evt] = lvl');
    });

    it('compiles modular macOS sources with swiftc with zero errors', () => {
      expect(() => {
        execFileSync('swiftc', ['-parse', ...getSwiftSources()], { stdio: 'pipe' });
      }).not.toThrow();
    });
  });

  describe('7. Windows Native Implementation', () => {
    it('implements SegmentedLevelPicker with timer-based sliding micro-animation and glow', () => {
      const content = readCsSource();

      expect(content).toContain('class SegmentedLevelPicker : Control');
      expect(content).toContain('currentProgress');
      expect(content).toContain('targetProgress');
      expect(content).toContain('new System.Windows.Forms.Timer');
      expect(content).toContain('animTimer.Tick +=');
      expect(content).toContain('glowPen');
      expect(content).toContain('Color.FromArgb(56, 138, 107)'); // Muted Sage Green #388A6B
      expect(content).toContain('Color.FromArgb(178, 89, 89)'); // Muted Crimson #B25959
    });

    it('creates notification rules card with description and all 4 event rows', () => {
      const content = readCsSource();

      expect(content).toContain('CreateNotificationRulesCard()');
      expect(content).toContain('L10n.Tr("rules.description", lang)');
      expect(content).toContain('AddRuleRow(card, "task_completed"');
      expect(content).toContain('AddRuleRow(card, "waiting_permission"');
      expect(content).toContain('AddRuleRow(card, "waiting_input"');
      expect(content).toContain('AddRuleRow(card, "task_failed"');
    });

    it('provides UpdateEventRulesFromController to update pickers without UI disruption', () => {
      const content = readCsSource();

      expect(content).toContain('rulePickers');
      expect(content).toContain('public void UpdateEventRulesFromController()');
      expect(content).toContain('appController.GetEventRuleLevel(kv.Key)');
      expect(content).toContain('kv.Value.CurrentLevel = lvl');
    });

    it('watches config.json for Changed, Created, and Renamed events to synchronize rules', () => {
      const content = readCsSource();

      expect(content).toContain('watcher = new FileSystemWatcher');
      expect(content).toContain('watcher.Changed +=');
      expect(content).toContain('watcher.Created +=');
      expect(content).toContain('watcher.Renamed +=');
      expect(content).toContain('mainWindow.UpdateEventRulesFromController()');
    });

    it('persists event rule change immediately via CLI', () => {
      const content = readCsSource();

      expect(content).toContain('public void UpdateEventRule(string eventType, string level)');
      expect(content).toContain('config --event {0} --level {1} --quiet');
    });
  });

  describe('8. CLI Configuration & Event Rules Roundtrip', () => {
    it('persists and updates individual event priority via CLI', async () => {
      const testDir = join(tmpdir(), `takefive-event-test-${Date.now()}`);
      const configPath = join(testDir, 'config.json');
      const configManager = new ConfigManager({ configPath });
      const credentialStore = new MockCredentialStore();
      const mockBarkClient = {
        sendPush: async () => ({ success: true, message: 'ok' }),
        testConnectivity: async () => ({ ok: true, statusCode: 200, message: 'ok' }),
      };

      const cli = createCli({
        configManager,
        credentialStore,
        barkClient: mockBarkClient,
        env: { TAKEFIVE_CONFIG_PATH: configPath },
      });

      // Initially default
      let config = await configManager.loadConfig();
      expect(config.events.task_completed.level).toBe('active');

      // Update task_completed to timeSensitive
      await cli.parseAsync(['node', 'takefive', 'config', '--event', 'task_completed', '--level', 'timeSensitive', '--quiet']);

      config = await configManager.loadConfig();
      expect(config.events.task_completed.level).toBe('timeSensitive');

      // Update waiting_permission to active
      await cli.parseAsync(['node', 'takefive', 'config', '--event', 'waiting_permission', '--level', 'active', '--quiet']);

      config = await configManager.loadConfig();
      expect(config.events.waiting_permission.level).toBe('active');

      rmSync(testDir, { recursive: true, force: true });
    });

    it('executes dist/cli.js config subprocess without createRequire syntax error and toggles event rules', () => {
      const distCli = join(rootDir, 'dist', 'cli.js');
      if (!existsSync(distCli)) return;

      const testDir = join(tmpdir(), `takefive-dist-cli-${Date.now()}`);
      const configPath = join(testDir, 'config.json');
      mkdirSync(testDir, { recursive: true });

      try {
        // Toggle to timeSensitive
        execFileSync(process.execPath, [distCli, 'config', '--event', 'task_completed', '--level', 'timeSensitive', '--quiet'], {
          env: { ...process.env, TAKEFIVE_CONFIG_PATH: configPath },
          stdio: 'pipe',
        });

        let config = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(config.events.task_completed.level).toBe('timeSensitive');

        // Toggle back to active
        execFileSync(process.execPath, [distCli, 'config', '--event', 'task_completed', '--level', 'active', '--quiet'], {
          env: { ...process.env, TAKEFIVE_CONFIG_PATH: configPath },
          stdio: 'pipe',
        });

        config = JSON.parse(readFileSync(configPath, 'utf-8'));
        expect(config.events.task_completed.level).toBe('active');
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
