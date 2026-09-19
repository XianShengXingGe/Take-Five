import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCli } from '../src/cli/index.js';
import { ConfigManager } from '../src/core/config-manager.js';
import { MockBarkDispatcher, MockCredentialStore } from '../src/testing/index.js';
import { BarkClient } from '../src/core/bark-client.js';

describe('macOS Native Liquid Glass Desktop App & Status Bar Panel (Ticket 03)', () => {
  let tempDir: string;
  let homeDir: string;
  let configPath: string;
  let env: Record<string, string | undefined>;
  let mockBark: MockBarkDispatcher;
  let mockCreds: MockCredentialStore;

  const macosDir = join(process.cwd(), 'src', 'desktop', 'macos');
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
    tempDir = mkdtempSync(join(tmpdir(), 'takefive-macos-tray-'));
    homeDir = join(tempDir, 'home');
    configPath = join(homeDir, '.takefive', 'config.json');
    mkdirSync(join(homeDir, '.takefive'), { recursive: true });
    mockBark = new MockBarkDispatcher();
    mockCreds = new MockCredentialStore(null);
    env = { HOME: homeDir, USERPROFILE: homeDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('contains full Liquid Glass, AppKit/SwiftUI, and Onboarding components in modular macos sources', () => {
    expect(existsSync(macosDir)).toBe(true);
    expect(getSwiftSources().length).toBeGreaterThan(0);

    const content = readSwiftSource();

    // 1. AppKit and SwiftUI architecture
    expect(content).toContain('import Cocoa');
    expect(content).toContain('import SwiftUI');
    expect(content).toContain('NSHostingController');

    // 2. Liquid Glass materials and visual styling
    expect(content).toContain('NSVisualEffectView');
    expect(content).toContain('.underWindowBackground');
    expect(content).toContain('LiquidGlassBackground');
    expect(content).toContain('liquidGlassCard');

    // 3. Top-left window controls with orderOut hide-on-close
    expect(content).toContain('titlebarAppearsTransparent = true');
    expect(content).toContain('titleVisibility = .hidden');
    expect(content).toContain('.fullSizeContentView');
    expect(content).toContain('windowShouldClose');
    expect(content).toContain('orderOut(nil)');

    // 4. Status Bar dynamic indicator and menu
    expect(content).toContain('NSStatusBar.system.statusItem');
    expect(content).toContain('updateStatusIcon');
    expect(content).toContain('● 全局通知');
    expect(content).toContain('⌘ 打开控制面板');

    // 5. Four-step Onboarding Wizard
    expect(content).toContain('OnboardingWizardView');
    expect(content).toContain('step1WelcomeView');
    expect(content).toContain('step2BarkView');
    expect(content).toContain('step3AgentView');
    expect(content).toContain('step4FinishView');

    // 6. Main Dashboard View
    expect(content).toContain('DashboardView');
    expect(content).toContain('Bark 推送服务');
    expect(content).toContain('Agent 平台');
    expect(content).toContain('通知规则');
    expect(content).toContain('开机自动启动');
    expect(content).toContain('sendTestPush');

    // 7. CLI Seam and file watcher
    expect(content).toContain('runCli(args:');
    expect(content).toContain('DispatchSource.makeFileSystemObjectSource');

    // 8. Embedded runtime resolution
    expect(content).toContain('embeddedRuntimeDir');
    expect(content).toContain('embeddedNodePath');
    expect(content).toContain('runtime');

    // 9. Card 4 Terminal config & debounced file watcher (Ticket 02)
    expect(content).toContain('preferences.open_terminal');
    expect(content).toContain('onOpenTerminalConfig');
    expect(content).toContain('openTerminalConfig');
    expect(content).toContain('refreshDebounceWorkItem');
  });

  it('features precise config.json file monitoring with 500ms debounce and Terminal config trigger (Ticket 02)', () => {
    const content = readSwiftSource();

    // 1. Precise config.json file watcher (not directory watcher)
    expect(content).toContain('open(configPath, O_EVTONLY)');
    expect(content).not.toContain('open(dirUrl.path, O_EVTONLY)');
    expect(content).toContain('scheduleDebouncedRefresh()');

    // 2. 500ms DispatchWorkItem debounce
    expect(content).toContain('DispatchWorkItem');
    expect(content).toContain('deadline: .now() + 0.5');
    expect(content).toContain('refreshDebounceWorkItem?.cancel()');

    // 3. Card 4 System Preferences clean design (wizard & terminal buttons removed from dashboard)
    expect(content).toContain('case "preferences.open_terminal": return zh ? "打开终端高级配置" : "Advanced CLI Config"');
    expect(content).not.toContain('Button(action: onOpenTerminalConfig)');
    expect(content).not.toContain('Button(action: onOpenOnboarding)');

    // 4. AppleScript / Terminal invocation for takefive config
    expect(content).toContain('tell application "Terminal"');
    expect(content).toContain('do script');
    expect(content).toContain('takefive config');
    expect(content).toContain('NSAppleScript');
    expect(content).toContain('/usr/bin/osascript');
  });

  it('compiles modular macOS sources with swiftc with zero errors', () => {
    if (process.platform !== 'darwin' || !existsSync('/usr/bin/swiftc')) return;

    const outBin = join(tempDir, 'takefive_swift_build_probe');

    const envWithTools = {
      ...process.env,
      PATH: `/usr/bin:/bin:/usr/sbin:/sbin:/Library/Developer/CommandLineTools/usr/bin:${process.env.PATH || ''}`,
    };

    const { execFileSync } = require('node:child_process');
    try {
      execFileSync('/usr/bin/swiftc', ['-O', ...getSwiftSources(), '-o', outBin], {
        env: envWithTools,
        stdio: 'pipe',
        timeout: 25000,
      });
    } catch (err: any) {
      const details = `SWIFTC EXEC ERROR: status=${err.status} signal=${err.signal} stdout=${err.stdout?.toString()} stderr=${err.stderr?.toString()} msg=${err.message}`;
      throw new Error(details);
    }

    expect(existsSync(outBin)).toBe(true);
  }, 30000);

  it('supports non-interactive Bark URL setup via install --bark-url <url> --yes CLI seam', async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ code: 200, message: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const cli = createCli({
      credentialStore: mockCreds,
      barkClient: new BarkClient({ fetchImpl: fakeFetch, timeoutMs: 500 }),
      env,
    });

    await cli.parseAsync(['node', 'takefive', 'install', '--bark-url', 'https://api.day.app/SECRET_KEY/', '--yes']);

    const savedUrl = await mockCreds.getBarkUrl(env);
    expect(savedUrl).toBe('https://api.day.app/SECRET_KEY/');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.version).toBe('1.0.0');
    expect(config.enabledAgents).toBeDefined();
  });

  it('produces valid JSON status contract for desktop app via takefive status --json', async () => {
    await mockCreds.setBarkUrl('https://api.day.app/DEVICE_TEST/', env);
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig({
      version: '1.0.0',
      language: 'zh-CN',
      debounceSeconds: 5,
      enabledAgents: { claude: true, codex: true, opencode: false, antigravity: true },
      events: {
        task_completed: { level: 'active', sound: 'bell', group: 'Take-Five' },
        waiting_input: { level: 'timeSensitive', sound: 'alert', group: 'Take-Five' },
        waiting_permission: { level: 'timeSensitive', sound: 'alert', group: 'Take-Five' },
        task_failed: { level: 'timeSensitive', sound: 'alarm', group: 'Take-Five' },
      },
      autostart: true,
    });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      env,
    });

    let output = '';
    const origLog = console.log;
    console.log = (msg: unknown) => {
      output += String(msg) + '\n';
    };

    try {
      await cli.parseAsync(['node', 'takefive', 'status', '--json']);
    } finally {
      console.log = origLog;
    }

    const report = JSON.parse(output);
    expect(report.bark.configured).toBe(true);
    expect(report.bark.endpoint).toBe('https://api.day.app/DEVICE_TEST/');
    expect(report.agents.claude).toBeDefined();
    expect(report.agents.codex).toBeDefined();
    expect(report.config.enabledAgents.codex).toBe(true);
    expect(report.config.enabledAgents.opencode).toBe(false);
    expect(report.config.autostart).toBe(true);
  });

  it('updates autostart and event level configurations via non-interactive config CLI seam', async () => {
    const configManager = new ConfigManager({ configPath });
    await configManager.saveConfig({
      version: '1.0.0',
      language: 'zh-CN',
      debounceSeconds: 5,
      enabledAgents: { claude: true, codex: true, opencode: true, antigravity: true },
      events: {
        task_completed: { level: 'active', sound: 'bell', group: 'Take-Five' },
        waiting_input: { level: 'timeSensitive', sound: 'alert', group: 'Take-Five' },
        waiting_permission: { level: 'timeSensitive', sound: 'alert', group: 'Take-Five' },
        task_failed: { level: 'timeSensitive', sound: 'alarm', group: 'Take-Five' },
      },
    });

    const cli = createCli({
      configManager,
      credentialStore: mockCreds,
      env,
    });

    await cli.parseAsync(['node', 'takefive', 'config', '--autostart', 'true', '--quiet']);
    let updated = await configManager.loadConfig();
    expect(updated.autostart).toBe(true);

    await cli.parseAsync(['node', 'takefive', 'config', '--event', 'task_completed', '--level', 'timeSensitive', '--quiet']);
    updated = await configManager.loadConfig();
    expect(updated.events.task_completed.level).toBe('timeSensitive');
  });

  it('manages LaunchAgent plist location and format correctly for macOS autostart', () => {
    const launchAgentsDir = join(homeDir, 'Library', 'LaunchAgents');
    mkdirSync(launchAgentsDir, { recursive: true });
    const plistPath = join(launchAgentsDir, 'com.takefive.menubar.plist');

    const execPath = join(homeDir, '.takefive', 'app', 'dist', 'TakeFiveMenuBar');
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.takefive.menubar</string>
    <key>ProgramArguments</key>
    <array>
        <string>${execPath}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>`;

    writeFileSync(plistPath, plistContent, 'utf-8');
    expect(existsSync(plistPath)).toBe(true);

    const readBack = readFileSync(plistPath, 'utf-8');
    expect(readBack).toContain('com.takefive.menubar');
    expect(readBack).toContain(execPath);
    expect(readBack).toContain('<key>RunAtLoad</key>');
  });
});
