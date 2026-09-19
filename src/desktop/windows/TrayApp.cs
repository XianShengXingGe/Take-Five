using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace TakeFive
{
    #region Take Five System Tray Application Controller
    public partial class TakeFiveTrayApp : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private ContextMenuStrip contextMenu;
        private FileSystemWatcher watcher;
        private string configPath;
        private string cliPath;

        private TakeFiveMainWindow mainWindow;
        private List<DynamicAgent> dynamicAgents = new List<DynamicAgent>();
        private Dictionary<string, string> eventRules = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "task_completed", "active" },
            { "waiting_permission", "timeSensitive" },
            { "waiting_input", "timeSensitive" },
            { "task_failed", "timeSensitive" }
        };
        private string language = "system";
        private bool isBarkConfigured = false;
        private string barkEndpoint = null;

        public bool IsBarkConfigured { get { return isBarkConfigured; } }
        public string BarkEndpoint { get { return barkEndpoint; } }
        public List<DynamicAgent> DynamicAgents { get { return dynamicAgents; } }
        public string Language { get { return language; } }

        public TakeFiveTrayApp()
        {
            ResolvePaths();
            RefreshStatus();

            trayIcon = new NotifyIcon
            {
                Text = isBarkConfigured
                    ? (IsAllDisabled() ? L10n.Tr("tip.muted", language) : L10n.Tr("tip.monitoring", language))
                    : L10n.Tr("tip.unconfigured", language),
                Visible = true,
                Icon = GetAppIcon()
            };

            trayIcon.MouseClick += (s, e) =>
            {
                if (e.Button == MouseButtons.Left) ToggleMainWindow();
            };
            trayIcon.DoubleClick += (s, e) => ShowMainWindow();

            BuildMenu();
            UpdateIcon();
            StartWatcher();

            mainWindow = new TakeFiveMainWindow(this);

            if (!isBarkConfigured)
            {
                mainWindow.ShowAndActivate();
            }
        }

        public void ShowMainWindow()
        {
            if (mainWindow != null) mainWindow.ShowAndActivate();
        }

        public void ToggleMainWindow()
        {
            if (mainWindow == null)
            {
                mainWindow = new TakeFiveMainWindow(this);
            }

            if (mainWindow.Visible && mainWindow.WindowState != FormWindowState.Minimized)
            {
                mainWindow.HideToTray();
            }
            else
            {
                mainWindow.ShowAndActivate();
            }
        }

        public string GetEventRuleLevel(string eventType)
        {
            if (eventRules.ContainsKey(eventType)) return eventRules[eventType];
            return eventType == "task_completed" ? "active" : "timeSensitive";
        }

        public void UpdateEventRule(string eventType, string level)
        {
            eventRules[eventType] = level;
            ThreadPool.QueueUserWorkItem(_ =>
            {
                RunCli(string.Format("config --event {0} --level {1} --quiet", eventType, level), false);
                RefreshStatus();
            });
        }

        public void SetLanguage(string newLang)
        {
            language = newLang;
            RunCli(string.Format("config --language {0} --quiet", newLang), false);
            RefreshStatus();
            BuildMenu();
            UpdateIcon();
            if (mainWindow != null) mainWindow.UpdateViewState();
        }

        public string ResolveAssetPath(string fileName)
        {
            var candidates = new List<string>();
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            candidates.Add(Path.Combine(baseDir, "assets", fileName));
            candidates.Add(Path.Combine(baseDir, "assets", "icons", fileName));
            candidates.Add(Path.Combine(baseDir, fileName));
            candidates.Add(Path.Combine(baseDir, "runtime", "assets", fileName));
            candidates.Add(Path.Combine(baseDir, "runtime", "assets", "icons", fileName));

            var r = GetEmbeddedRuntimeDir();
            if (r != null)
            {
                candidates.Add(Path.Combine(r, "assets", fileName));
                candidates.Add(Path.Combine(r, "assets", "icons", fileName));
                candidates.Add(Path.Combine(r, fileName));
            }
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            candidates.Add(Path.Combine(home, ".takefive", "app", "runtime", "assets", fileName));
            candidates.Add(Path.Combine(home, ".takefive", "app", "runtime", "assets", "icons", fileName));
            candidates.Add(Path.Combine(home, ".takefive", "app", "assets", fileName));
            candidates.Add(Path.Combine(home, ".takefive", "app", "assets", "icons", fileName));

            var cwd = Directory.GetCurrentDirectory();
            candidates.Add(Path.Combine(cwd, "assets", fileName));
            candidates.Add(Path.Combine(cwd, "assets", "icons", fileName));
            candidates.Add(Path.Combine(cwd, fileName));

            foreach (var c in candidates)
            {
                if (File.Exists(c)) return c;
            }
            return null;
        }

        public Bitmap GetAgentBitmap(string agentId, bool detected = true)
        {
            string fileName = agentId.ToLowerInvariant() + ".png";
            string path = ResolveAssetPath(fileName);
            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                try
                {
                    using (var orig = Image.FromFile(path))
                    {
                        var bmp = new Bitmap(24, 24, PixelFormat.Format32bppArgb);
                        using (var g = Graphics.FromImage(bmp))
                        {
                            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                            g.SmoothingMode = SmoothingMode.HighQuality;
                            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                            if (!detected)
                            {
                                var matrix = new ColorMatrix(new float[][]
                                {
                                    new float[] {0.299f, 0.299f, 0.299f, 0, 0},
                                    new float[] {0.587f, 0.587f, 0.587f, 0, 0},
                                    new float[] {0.114f, 0.114f, 0.114f, 0, 0},
                                    new float[] {0,      0,      0,      0.55f, 0},
                                    new float[] {0,      0,      0,      0, 1}
                                });
                                using (var ia = new ImageAttributes())
                                {
                                    ia.SetColorMatrix(matrix);
                                    g.DrawImage(orig, new Rectangle(0, 0, 24, 24), 0, 0, orig.Width, orig.Height, GraphicsUnit.Pixel, ia);
                                }
                            }
                            else
                            {
                                g.DrawImage(orig, new Rectangle(0, 0, 24, 24));
                            }
                        }
                        return bmp;
                    }
                }
                catch { }
            }
            return null;
        }

        public Bitmap GetAgentBitmap(string agentId)
        {
            return GetAgentBitmap(agentId, true);
        }

        public Bitmap GetQrBitmap(string channel)
        {
            string fileName = channel.ToLowerInvariant() + "_qr.jpg";
            string path = ResolveAssetPath(fileName);
            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                try
                {
                    using (var orig = Image.FromFile(path))
                    {
                        return new Bitmap(orig, new Size(200, 200));
                    }
                }
                catch { }
            }
            return null;
        }

        public bool IsAllEnabled()
        {
            if (dynamicAgents.Count == 0) return true;
            foreach (var agent in dynamicAgents)
            {
                if (!agent.Enabled) return false;
            }
            return true;
        }

        public bool IsAllDisabled()
        {
            if (dynamicAgents.Count == 0) return false;
            foreach (var agent in dynamicAgents)
            {
                if (agent.Enabled) return false;
            }
            return true;
        }

        private void BuildMenu()
        {
            contextMenu = new ContextMenuStrip();
            string lang = language;

            // 1. 打开主面板
            var openDashItem = new ToolStripMenuItem(L10n.Tr("menu.open_dash", lang));
            openDashItem.Font = new Font(openDashItem.Font, FontStyle.Bold);
            openDashItem.Click += (s, e) => ShowMainWindow();
            contextMenu.Items.Add(openDashItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            // 2. 全局通知
            string masterText;
            if (IsAllEnabled())
                masterText = L10n.Tr("menu.notifications_active", lang);
            else if (IsAllDisabled())
                masterText = L10n.Tr("menu.notifications_muted", lang);
            else
                masterText = L10n.Tr("menu.notifications_partial", lang);

            var masterItem = new ToolStripMenuItem(masterText);
            masterItem.Click += (s, e) => ToggleAll();
            contextMenu.Items.Add(masterItem);

            contextMenu.Items.Add(new ToolStripSeparator());

            // 3. 退出片刻
            var quitItem = new ToolStripMenuItem(L10n.Tr("menu.quit", lang));
            quitItem.Click += (s, e) => Exit();
            contextMenu.Items.Add(quitItem);

            trayIcon.ContextMenuStrip = contextMenu;
        }

        private Icon LoadOriginalAppIcon()
        {
            string iconPath = ResolveAssetPath("app.ico");
            if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
            {
                try
                {
                    return new Icon(iconPath, 32, 32);
                }
                catch { }
            }
            return null;
        }

        public Icon GetAppIcon()
        {
            // 1. Prioritize loading original high-resolution color icon from app.ico
            var originalIcon = LoadOriginalAppIcon();
            if (originalIcon != null)
            {
                return originalIcon;
            }

            // 2. Extract associated color icon from running executable
            try
            {
                var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null)
                {
                    return (Icon)exeIcon.Clone();
                }
            }
            catch { }

            // 3. Fallback to rendered bitmap with unmanaged handle release
            using (var bmp = GetAppBitmap())
            {
                IntPtr hIcon = bmp.GetHicon();
                try
                {
                    using (var temp = Icon.FromHandle(hIcon))
                    {
                        return (Icon)temp.Clone();
                    }
                }
                finally
                {
                    NativeMethods.DestroyIcon(hIcon);
                }
            }
        }

        public Bitmap GetAppBitmap()
        {
            using (var originalIcon = LoadOriginalAppIcon())
            {
                if (originalIcon != null)
                {
                    return originalIcon.ToBitmap();
                }
            }

            string pngPath = ResolveAssetPath("icon.png");
            if (!string.IsNullOrEmpty(pngPath) && File.Exists(pngPath))
            {
                try
                {
                    using (var img = Image.FromFile(pngPath))
                    {
                        return new Bitmap(img, new Size(32, 32));
                    }
                }
                catch { }
            }

            var bmp = new Bitmap(16, 16);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                Color color = FluentTheme.PrimaryAccent;
                using (var pen = new Pen(color, 2f))
                {
                    g.DrawEllipse(pen, 2, 2, 11, 11);
                }
                using (var brush = new SolidBrush(color))
                {
                    g.FillEllipse(brush, 5, 5, 5, 5);
                }
            }
            return bmp;
        }

        private void UpdateIcon()
        {
            var oldIcon = trayIcon.Icon;
            trayIcon.Icon = GetAppIcon();
            if (oldIcon != null)
            {
                try { oldIcon.Dispose(); } catch { }
            }
            trayIcon.Text = isBarkConfigured
                ? (IsAllDisabled() ? L10n.Tr("tip.muted", language) : L10n.Tr("tip.monitoring", language))
                : L10n.Tr("tip.unconfigured", language);
        }

        public void ToggleAll()
        {
            bool next = !IsAllEnabled();
            foreach (var a in dynamicAgents) a.Enabled = next;
            BuildMenu();
            UpdateIcon();
            var cmd = next ? "enable --all --quiet" : "disable --all --quiet";
            RunCli(cmd, false, res =>
            {
                RefreshStatus();
                BuildMenu();
                UpdateIcon();
                if (mainWindow != null && !mainWindow.IsDisposed && mainWindow.Visible)
                {
                    mainWindow.UpdateViewState();
                }
            });
        }

        public void ToggleAgent(string id, bool targetState)
        {
            var agent = dynamicAgents.Find(a => a.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
            if (agent == null) return;
            agent.Enabled = targetState;
            BuildMenu();
            UpdateIcon();
            var cmd = targetState ? string.Format("enable {0} --quiet", id) : string.Format("disable {0} --quiet", id);
            RunCli(cmd, false, res =>
            {
                RefreshStatus();
                BuildMenu();
                UpdateIcon();
                if (mainWindow != null && !mainWindow.IsDisposed && mainWindow.Visible)
                {
                    mainWindow.UpdateViewState();
                }
            });
        }

        public void SendTestPush()
        {
            RunCli("test --quiet", false);
        }

        public void Exit()
        {
            if (watcher != null) watcher.Dispose();
            trayIcon.Visible = false;
            trayIcon.Dispose();
            if (mainWindow != null) mainWindow.Dispose();
            Application.Exit();
        }
    }
    #endregion
}
