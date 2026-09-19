import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Windows Native Fluent Design 2 Tray App & Dashboard (Ticket 04)', () => {
  const windowsDir = join(process.cwd(), 'src', 'desktop', 'windows');
  const getCsSources = () =>
    readdirSync(windowsDir)
      .filter((f) => f.endsWith('.cs'))
      .sort()
      .map((f) => join(windowsDir, f));
  const readCsSource = () =>
    getCsSources()
      .map((p) => readFileSync(p, 'utf-8'))
      .join('\n');

  it('verifies src/desktop/windows sources exist and are populated', () => {
    expect(existsSync(windowsDir)).toBe(true);
    expect(getCsSources().length).toBeGreaterThan(0);
    const content = readCsSource();
    expect(content.length).toBeGreaterThan(1000);
  });

  describe('Fluent Design System 2 & Windows 11 DWM Specifications', () => {
    it('declares DWM P/Invoke attributes for Mica/Acrylic and 8px rounded corners', () => {
      const content = readCsSource();

      // P/Invoke DwmSetWindowAttribute
      expect(content).toContain('DwmSetWindowAttribute');

      // Windows 11 DWM Attribute constants
      expect(content).toContain('DWMWA_USE_IMMERSIVE_DARK_MODE = 20');
      expect(content).toContain('DWMWA_WINDOW_CORNER_PREFERENCE = 33');
      expect(content).toContain('DWMWA_SYSTEMBACKDROP_TYPE = 38');
      expect(content).toContain('DWMWA_BORDER_COLOR = 34');

      // 8px standard rounded corners (DWMWCP_ROUND)
      expect(content).toContain('DWMWCP_ROUND = 2');

      // Mica & Acrylic backdrop types
      expect(content).toContain('DWMSBT_MAINWINDOW = 2');
      expect(content).toContain('DWMSBT_TRANSIENTWINDOW = 3');
    });

    it('implements Segoe UI Variable typography and 8px rounded geometry', () => {
      const content = readCsSource();

      // Font stack targeting Windows 11 Segoe UI Variable
      expect(content).toContain('Segoe UI Variable Text');
      expect(content).toContain('Segoe UI Variable Display');

      // 8px rounded rectangle path generator
      expect(content).toContain('CreateRoundedRectangle');
      expect(content).toContain('CornerRadius { get; set; } = 8');
    });

    it('implements Fluent 2 custom controls (Cards with hover elevation, WinUI 3 Toggle Switch, Modern Buttons)', () => {
      const content = readCsSource();

      // Custom controls
      expect(content).toContain('class FluentCard : Panel');
      expect(content).toContain('class FluentButton : Button');
      expect(content).toContain('class FluentToggleSwitch : Control');

      // Micro-animation / hover elevation
      expect(content).toContain('IsHovered');
      expect(content).toContain('CardHoverBackground');
      expect(content).toContain('CardBorderHover');

      // Brand Mint Green accent #10B981
      expect(content).toContain('16, 185, 129');
    });

    it('sets ControlStyles.SupportsTransparentBackColor on custom controls with transparent backgrounds to prevent startup crash', () => {
      const content = readCsSource();

      // Controls setting BackColor = Color.Transparent or drawing transparent background must enable SupportsTransparentBackColor
      expect(content).toMatch(/class FluentVersionBadge[\s\S]*?ControlStyles\.SupportsTransparentBackColor/);
      expect(content).toMatch(/class FluentToggleSwitch[\s\S]*?ControlStyles\.SupportsTransparentBackColor/);
      expect(content).toMatch(/class SegmentedLevelPicker[\s\S]*?ControlStyles\.SupportsTransparentBackColor/);
      expect(content).toMatch(/class FluentCard[\s\S]*?ControlStyles\.SupportsTransparentBackColor/);
    });
  });

  describe('Window Chrome, Top-Right Controls, and Hide-to-Tray', () => {
    it('places window controls at top-right and handles Close with HideToTray', () => {
      const content = readCsSource();

      // FluentWindowControls docked to top-right
      expect(content).toContain('class FluentWindowControls : Panel');
      expect(content).toContain('windowControls = new FluentWindowControls');
      expect(content).toContain('Dock = DockStyle.Right');

      // Minimize and Close buttons
      expect(content).toContain('MinimizeButton');
      expect(content).toContain('CloseButton');

      // Intercept UserClosing and trigger HideToTray
      expect(content).toContain('OnFormClosing(FormClosingEventArgs e)');
      expect(content).toContain('CloseReason.UserClosing');
      expect(content).toContain('e.Cancel = true');
      expect(content).toContain('HideToTray()');
    });

    it('sets ShowInTaskbar to false and minimizes directly to system tray without taskbar entry or stub (Ticket 04)', () => {
      const content = readCsSource();

      expect(content).toContain('ShowInTaskbar = false');
      expect(content).toMatch(/MinimizeClicked\s*\+=\s*\(s,\s*e\)\s*=>\s*HideToTray\(\)/);
      expect(content).toMatch(/if\s*\(WindowState\s*==\s*FormWindowState\.Minimized\)\s*\{\s*HideToTray\(\);\s*WindowState\s*=\s*FormWindowState\.Normal;\s*\}/);
    });

    it('supports NotifyIcon left-click toggle, double-click open, and right-click context menu', () => {
      const content = readCsSource();

      // NotifyIcon event wiring
      expect(content).toContain('trayIcon.MouseClick +=');
      expect(content).toContain('MouseButtons.Left');
      expect(content).toContain('ToggleMainWindow()');
      expect(content).toContain('trayIcon.DoubleClick +=');
      expect(content).toContain('ShowMainWindow()');

      // Context menu
      expect(content).toContain('new ContextMenuStrip()');
      expect(content).toContain('masterItem.Click += (s, e) => ToggleAll()');
      expect(content).toContain('menu.open_dash');
      expect(content).not.toContain('RunCliInteractive("config")');
      expect(content).toContain('RunCli("test --quiet", false)');
    });
  });

  describe('4-Step Onboarding Wizard', () => {
    it('provides all 4 onboarding wizard steps for novice users', () => {
      const content = readCsSource();

      // Step 1: Welcome & Brand philosophy
      expect(content).toContain('第 1/4 步 · 欢迎使用片刻');
      expect(content).toContain('wizard.hero');
      expect(content).toContain('RenderOnboardingStep1_Welcome');

      // Step 2: Bark setup & connectivity test
      expect(content).toContain('第 2/4 步 · 绑定 Bark 推送通道');
      expect(content).toContain('RenderOnboardingStep2_Bark');
      expect(content).toContain('SaveBarkCredential');

      // Step 3: Agent detection & activation
      expect(content).toContain('第 3/4 步 · 激活智能体');
      expect(content).toContain('RenderOnboardingStep3_Agents');

      // Step 4: Finish & resident in tray
      expect(content).toContain('第 4/4 步 · 准备就绪');
      expect(content).toContain('RenderOnboardingStep4_Finish');
      expect(content).toContain('preferences.autostart');
    });
  });

  describe('Main Configuration Dashboard', () => {
    it('renders Bark status section in system options card with endpoint and instant test button', () => {
      const content = readCsSource();

      expect(content).toContain('CreateSystemOptionsCard');
      expect(content).toContain('bark.title');
      expect(content).toContain('bark.status_connected');
      expect(content).toContain('testPushButton');
    });

    it('implements inline Bark address editing with Enter/LostFocus commit, Esc cancel, and removes separate edit modal (Ticket 04)', () => {
      const content = readCsSource();

      // Independent edit button and modal removed
      expect(content).not.toContain('PromptEditBark()');
      expect(content).not.toContain('editBtn');

      // Inline TextBox and state management
      expect(content).toContain('barkEditBox');
      expect(content).toContain('StartBarkEditing()');
      expect(content).toContain('CancelBarkEdit()');
      expect(content).toContain('CommitBarkEdit()');

      // Keyboard & focus events
      expect(content).toContain('Keys.Enter');
      expect(content).toContain('Keys.Escape');
      expect(content).toContain('LostFocus');

      // Core Seam config command and automatic test push on save
      expect(content).toContain('config --bark-url');
      expect(content).toMatch(/SaveBarkCredential\([\s\S]*?config --bark-url/);
      expect(content).toMatch(/CommitBarkEdit[\s\S]*?SaveBarkCredential[\s\S]*?test --quiet/);
    });

    it('renders 4 coding agent switch cards with detection badges and instant toggles', () => {
      const content = readCsSource();

      expect(content).toContain('CreateAgentsStatusCard');
      expect(content).toContain('agents.title');
      expect(content).toContain('OpenAI Codex');
      expect(content).toContain('Antigravity');
      expect(content).toContain('Claude Code');
      expect(content).toContain('OpenCode');
    });

    it('renders notification level rules and system options', () => {
      const content = readCsSource();

      expect(content).toContain('CreateNotificationRulesCard');
      expect(content).toContain('rules.task_completed');
      expect(content).toContain('rules.waiting_permission');
      expect(content).toContain('rules.waiting_input');
      expect(content).toContain('rules.task_failed');

      expect(content).toContain('CreateSystemOptionsCard');
      expect(content).toContain('reOnboardBtn');
    });
  });

  describe('CLI Seam and Real-Time Synchronization', () => {
    it('communicates with TakeFive core via standard CLI Seam', () => {
      const content = readCsSource();

      expect(content).toContain('status --json');
      expect(content).toContain('enable --all --quiet');
      expect(content).toContain('disable --all --quiet');
      expect(content).toContain('enable {0} --quiet');
      expect(content).toContain('disable {0} --quiet');
      expect(content).toContain('test --quiet');
    });

    it('maintains live synchronization via FileSystemWatcher on config.json', () => {
      const content = readCsSource();

      expect(content).toContain('new FileSystemWatcher');
      expect(content).toContain('watcher.Changed +=');
      expect(content).toContain('RefreshStatus()');
      expect(content).toContain('BuildMenu()');
      expect(content).toContain('UpdateIcon()');
    });

    it('manages Windows Startup shortcut for auto-start resident behavior', () => {
      const content = readCsSource();

      expect(content).toContain('SpecialFolder.Startup');
      expect(content).toContain('TakeFiveTray.lnk');
      expect(content).toContain('IsAutoStartEnabled');
      expect(content).toContain('SetAutoStart');
    });
  });

  describe('Windows Desktop Stability and Resource Cleanup (Ticket 01)', () => {
    it('declares DestroyIcon P/Invoke and safely releases unmanaged HICON handles in GetAppIcon and UpdateIcon', () => {
      const content = readCsSource();

      // Native DestroyIcon declaration from user32.dll
      expect(content).toMatch(/\[DllImport\("user32\.dll"[^\]]*\)\]\s+public static extern bool DestroyIcon\(IntPtr\s+hIcon\);/);

      // Safe release pattern in GetAppIcon
      expect(content).toContain('NativeMethods.DestroyIcon(hIcon)');
      expect(content).toContain('Icon.FromHandle(hIcon)');

      // Disposal of previous Icon in UpdateIcon
      expect(content).toMatch(/oldIcon\??\.Dispose\(\)/);
    });

    it('refactors RunCli to execute external CLI calls asynchronously in background threads and dispatch UI refresh via BeginInvoke', () => {
      const content = readCsSource();

      // ThreadPool or background task execution
      expect(content).toMatch(/ThreadPool\.QueueUserWorkItem/);

      // UI thread dispatch via BeginInvoke
      expect(content).toContain('InvokeOnUI');
      expect(content).toMatch(/BeginInvoke/);

      // Non-blocking toggle operations
      expect(content).toContain('RunCli(cmd, false');
    });

    it('replaces fragile IndexOf string slicing in RefreshStatus with robust structured JSON parsing', () => {
      const content = readCsSource();

      // Checks for dedicated JsonParser class
      expect(content).toContain('class JsonParser');
      expect(content).toContain('JsonParser.Parse');

      // Verifies RefreshStatus no longer contains fragile IndexOf slices
      const refreshSection = content.substring(
        content.indexOf('public void RefreshStatus()'),
        content.indexOf('public void RefreshStatus()') + 2000
      );
      expect(refreshSection).not.toContain('json.IndexOf(');
      expect(refreshSection).not.toContain('.Split(');
      expect(refreshSection).toContain('configured');
      expect(refreshSection).toContain('endpoint');
      expect(refreshSection).toContain('language');
      expect(refreshSection).toContain('enabledAgents');
      expect(refreshSection).toContain('events');
    });
  });

  describe('Windows 11 Fluent 2 Theme Adaptation & Color Tray Icon (Ticket 04)', () => {
    it('implements dynamic system theme sensing via registry AppsUseLightTheme and UserPreferenceChanged', () => {
      const content = readCsSource();

      // Registry subkey and value inspection
      expect(content).toContain('Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize');
      expect(content).toContain('AppsUseLightTheme');
      expect(content).toContain('IsDarkMode');

      // ThemeChanged event and live SystemEvents listener
      expect(content).toContain('ThemeChanged');
      expect(content).toContain('UserPreferenceChanged');
      expect(content).toContain('RefreshTheme');

      // MainWindow subscription to ThemeChanged and dynamic DWMWA_USE_IMMERSIVE_DARK_MODE toggling
      expect(content).toContain('FluentTheme.ThemeChanged += OnThemeChanged');
      expect(content).toMatch(/int\s+darkMode\s*=\s*FluentTheme\.IsDarkMode\s*\?\s*1\s*:\s*0/);
    });

    it('provides complete Fluent 2 light and dark color palette and adaptive tokens', () => {
      const content = readCsSource();

      // Background tokens
      expect(content).toContain('WindowBackground');
      expect(content).toContain('TitleBarBackground');
      expect(content).toContain('CardBackground');
      expect(content).toContain('CardHoverBackground');
      expect(content).toContain('SubCardBackground');
      expect(content).toContain('InputBackground');

      // Border and text tokens
      expect(content).toContain('CardBorder');
      expect(content).toContain('CardBorderHover');
      expect(content).toContain('SubCardBorder');
      expect(content).toContain('TextPrimary');
      expect(content).toContain('TextSecondary');
      expect(content).toContain('TextMuted');

      // Control tokens
      expect(content).toContain('ButtonStandard');
      expect(content).toContain('SwitchTrackOff');
      expect(content).toContain('SwitchThumbOff');
      expect(content).toContain('SegmentedBackground');
      expect(content).toContain('SegmentedBorder');
    });

    it('implements Segoe UI Variable font ladder with Display, Text, and Small optical sizes', () => {
      const content = readCsSource();

      expect(content).toContain('Segoe UI Variable Display');
      expect(content).toContain('Segoe UI Variable Text');
      expect(content).toContain('Segoe UI Variable Small');
      expect(content).toContain('CaptionFont');
      expect(content).toContain('DisplayFont');
      expect(content).toContain('Font(');
    });

    it('loads original high-resolution color app.ico directly for brand tray icon', () => {
      const content = readCsSource();

      // GetAppIcon loads app.ico directly
      expect(content).toContain('ResolveAssetPath("app.ico")');
      expect(content).toMatch(/new\s+Icon\(iconPath,\s*32,\s*32\)/);

      // Safe fallback pattern to unmanaged handles preserved
      expect(content).toContain('NativeMethods.DestroyIcon(hIcon)');
      expect(content).toContain('Icon.FromHandle(hIcon)');
    });

    it('accurately updates tray Tooltip for monitoring, muted, and unconfigured states', () => {
      const content = readCsSource();

      // Localization keys for the 3 states
      expect(content).toContain('片刻 · 监控中');
      expect(content).toContain('片刻 · 已静音');
      expect(content).toContain('片刻 · 未配置');

      // Dynamic tooltip assignment in constructor and UpdateIcon
      expect(content).toMatch(/trayIcon\.Text\s*=\s*isBarkConfigured[\s\S]*?tip\.muted[\s\S]*?tip\.monitoring[\s\S]*?tip\.unconfigured/);
    });
  });
});

