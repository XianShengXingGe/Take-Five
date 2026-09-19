using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace TakeFive
{
    #region Main Window Form (Fluent Design 2 Desktop Experience)
    public partial class TakeFiveMainWindow : Form
    {
        private readonly TakeFiveTrayApp appController;
        private Panel headerPanel;
        private FluentWindowControls windowControls;
        private Label titleLabel;
        private FluentVersionBadge versionBadge;
        private ToolTip headerToolTip = new ToolTip();
        private Panel contentHost;

        // Views
        private Panel dashboardView;
        private Panel onboardingView;
        private int onboardingStep = 1;
        private bool isShowingOnboarding = false;

        // Dashboard controls
        private Label barkStatusLabel;
        private Panel barkStatusLight;
        private TextBox barkEditBox;
        private Label barkFeedbackLabel;
        private ContextMenuStrip barkContextMenu;
        private bool isBarkEditing = false;
        public bool IsBarkEditing => isBarkEditing;
        private bool isCommittingBarkEdit = false;
        private FluentButton testPushButton;
        private List<AgentRowItem> agentRows = new List<AgentRowItem>();
        private Dictionary<string, SegmentedLevelPicker> rulePickers = new Dictionary<string, SegmentedLevelPicker>(StringComparer.OrdinalIgnoreCase);
        private CheckBox cbLaunchAtStartup;
        private ComboBox langComboBox;
        private Label toastLabel;

        // Onboarding controls
        private TextBox obBarkUrlBox;
        private Label obTestResultLabel;
        private Dictionary<string, FluentToggleSwitch> obAgentToggles = new Dictionary<string, FluentToggleSwitch>();
        private CheckBox obStartupCheckbox;

        private class AgentRowItem
        {
            public DynamicAgent Agent;
            public PictureBox IconBox;
            public Label NameLabel;
            public Label SubtitleLabel;
            public FluentInfoBadge StatusBadge;
            public FluentToggleSwitch Toggle;
        }

        public TakeFiveMainWindow(TakeFiveTrayApp controller)
        {
            appController = controller;

            string lang = appController.Language;
            Text = L10n.Tr("app.name", lang);
            Size = new Size(580, 680);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.None;
            BackColor = FluentTheme.WindowBackground;
            ForeColor = FluentTheme.TextPrimary;
            Font = FluentTheme.Font(9.5f);
            ShowInTaskbar = false;
            Icon = controller.GetAppIcon();

            ApplyFluentDwmAttributes();
            BuildWindowChrome();
            BuildContentHost();

            FluentTheme.ThemeChanged += OnThemeChanged;

            UpdateViewState();
        }

        private void ApplyFluentDwmAttributes()
        {
            try
            {
                var handle = Handle;
                int darkMode = FluentTheme.IsDarkMode ? 1 : 0;
                NativeMethods.DwmSetWindowAttribute(handle, NativeMethods.DWMWA_USE_IMMERSIVE_DARK_MODE, ref darkMode, sizeof(int));
                int cornerRound = NativeMethods.DWMWCP_ROUND;
                NativeMethods.DwmSetWindowAttribute(handle, NativeMethods.DWMWA_WINDOW_CORNER_PREFERENCE, ref cornerRound, sizeof(int));
                int backdropType = NativeMethods.DWMSBT_TRANSIENTWINDOW;
                NativeMethods.DwmSetWindowAttribute(handle, NativeMethods.DWMWA_SYSTEMBACKDROP_TYPE, ref backdropType, sizeof(int));
                int borderColor = ColorTranslator.ToWin32(FluentTheme.CardBorder);
                NativeMethods.DwmSetWindowAttribute(handle, NativeMethods.DWMWA_BORDER_COLOR, ref borderColor, sizeof(int));
            }
            catch { }
        }

        private void BuildWindowChrome()
        {
            headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 46,
                BackColor = FluentTheme.TitleBarBackground
            };

            headerPanel.MouseDown += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    NativeMethods.ReleaseCapture();
                    NativeMethods.SendMessage(Handle, NativeMethods.WM_NCLBUTTONDOWN, (IntPtr)NativeMethods.HTCAPTION, IntPtr.Zero);
                }
            };

            var iconBox = new PictureBox
            {
                Size = new Size(20, 20),
                Location = new Point(14, 13),
                SizeMode = PictureBoxSizeMode.Zoom,
                Image = appController.GetAppBitmap()
            };

            string lang = appController.Language;
            titleLabel = new Label
            {
                Text = L10n.Tr("app.name", lang),
                AutoSize = true,
                Font = FluentTheme.DisplayFont(11f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary
            };
            titleLabel.MouseDown += (s, e) =>
            {
                if (e.Button == MouseButtons.Left)
                {
                    NativeMethods.ReleaseCapture();
                    NativeMethods.SendMessage(Handle, NativeMethods.WM_NCLBUTTONDOWN, (IntPtr)NativeMethods.HTCAPTION, IntPtr.Zero);
                }
            };

            versionBadge = new FluentVersionBadge
            {
                VersionText = lang == "en" ? $"{AppVersion.DisplayVersion} ↗" : $"{AppVersion.DisplayVersion} 版本 ↗"
            };
            headerToolTip.SetToolTip(versionBadge, L10n.Tr("header.visit_github", lang));
            versionBadge.Click += (s, e) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "https://github.com/XianShengXingGe/Take-Five",
                        UseShellExecute = true
                    });
                }
                catch { }
            };

            windowControls = new FluentWindowControls
            {
                Dock = DockStyle.Right
            };
            windowControls.MinimizeClicked += (s, e) => HideToTray();
            windowControls.CloseClicked += (s, e) => HideToTray();

            headerPanel.Controls.Add(iconBox);
            headerPanel.Controls.Add(titleLabel);
            headerPanel.Controls.Add(versionBadge);
            headerPanel.Controls.Add(windowControls);

            headerPanel.Resize += (s, e) => CenterHeaderTitle();
            CenterHeaderTitle();

            Controls.Add(headerPanel);
        }

        private void CenterHeaderTitle()
        {
            if (titleLabel == null || versionBadge == null || headerPanel == null) return;
            int spacing = 8;
            int totalW = titleLabel.Width + spacing + versionBadge.Width;
            int startX = (headerPanel.Width - totalW) / 2;
            int startY = (headerPanel.Height - titleLabel.Height) / 2;
            titleLabel.Location = new Point(startX, startY);
            versionBadge.Location = new Point(startX + titleLabel.Width + spacing, (headerPanel.Height - versionBadge.Height) / 2);
        }

        private void BuildContentHost()
        {
            contentHost = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                Padding = new Padding(20, 14, 20, 16),
                BackColor = Color.Transparent
            };
            Controls.Add(contentHost);
        }

        public void UpdateViewState()
        {
            string lang = appController.Language;
            Text = L10n.Tr("app.name", lang);
            titleLabel.Text = L10n.Tr("app.name", lang);
            headerToolTip.SetToolTip(versionBadge, L10n.Tr("header.visit_github", lang));
            CenterHeaderTitle();

            contentHost.SuspendLayout();
            contentHost.Controls.Clear();

            if (isShowingOnboarding)
            {
                RenderOnboardingView();
            }
            else
            {
                RenderDashboardView();
            }

            contentHost.ResumeLayout(true);
        }

        #region Window Lifetime
        public void ShowAndActivate()
        {
            if (!Visible) Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            UpdateEventRulesFromController();
            BringToFront();
            Activate();

            if (!appController.IsBarkConfigured && barkEditBox != null)
            {
                try
                {
                    contentHost.ScrollControlIntoView(barkEditBox);
                    barkEditBox.Focus();
                    barkEditBox.SelectAll();
                }
                catch { }
            }
        }

        public void HideToTray()
        {
            Hide();
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (WindowState == FormWindowState.Minimized)
            {
                HideToTray();
                WindowState = FormWindowState.Normal;
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                HideToTray();
            }
            else
            {
                base.OnFormClosing(e);
            }
        }

        private static readonly uint WM_TAKEFIVE_ACTIVATE = NativeMethods.RegisterWindowMessage("TAKEFIVE_ACTIVATE_WINDOW");

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == (int)WM_TAKEFIVE_ACTIVATE)
            {
                ShowAndActivate();
                return;
            }
            base.WndProc(ref m);
        }

        private void OnThemeChanged(object sender, EventArgs e)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => OnThemeChanged(sender, e)));
                return;
            }

            ApplyFluentDwmAttributes();
            BackColor = FluentTheme.WindowBackground;
            ForeColor = FluentTheme.TextPrimary;
            if (headerPanel != null) headerPanel.BackColor = FluentTheme.TitleBarBackground;
            if (titleLabel != null) titleLabel.ForeColor = FluentTheme.TextPrimary;
            UpdateViewState();
            Invalidate(true);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                FluentTheme.ThemeChanged -= OnThemeChanged;
                headerToolTip?.Dispose();
                barkContextMenu?.Dispose();
            }
            base.Dispose(disposing);
        }
        #endregion
    }
    #endregion
}
