using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace TakeFive
{
    #region Native Interop & Fluent Design 2 DWM APIs
    internal static class NativeMethods
    {
        [DllImport("dwmapi.dll", EntryPoint = "DwmSetWindowAttribute")]
        public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr hIcon);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern uint RegisterWindowMessage(string lpString);

        [DllImport("user32.dll")]
        public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        public static readonly IntPtr HWND_BROADCAST = (IntPtr)0xffff;

        public const int WM_NCLBUTTONDOWN = 0xA1;
        public const int HTCAPTION = 0x2;

        public const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
        public const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        public const int DWMWA_BORDER_COLOR = 34;
        public const int DWMWA_CAPTION_COLOR = 35;
        public const int DWMWA_TEXT_COLOR = 36;
        public const int DWMWA_SYSTEMBACKDROP_TYPE = 38;

        public const int DWMWCP_ROUND = 2;       // 8px standard rounded corners
        public const int DWMSBT_MAINWINDOW = 2;      // Mica
        public const int DWMSBT_TRANSIENTWINDOW = 3; // Acrylic / Mica
    }
    #endregion

    #region Fluent Design 2 Theme & Colors
    public static class FluentTheme
    {
        private const string PersonalizeSubKey = @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
        private const string AppsUseLightThemeKey = "AppsUseLightTheme";

        public static bool IsDarkMode { get; private set; } = true;
        public static event EventHandler ThemeChanged;

        // Dynamic Backgrounds
        public static Color WindowBackground => IsDarkMode ? Color.FromArgb(32, 32, 32) : Color.FromArgb(243, 243, 243);
        public static Color TitleBarBackground => IsDarkMode ? Color.FromArgb(26, 26, 26) : Color.FromArgb(234, 234, 234);
        public static Color CardBackground => IsDarkMode ? Color.FromArgb(43, 43, 43) : Color.FromArgb(255, 255, 255);
        public static Color CardHoverBackground => IsDarkMode ? Color.FromArgb(52, 52, 52) : Color.FromArgb(249, 249, 249);
        public static Color CardBorder => IsDarkMode ? Color.FromArgb(60, 60, 60) : Color.FromArgb(229, 229, 229);
        public static Color CardBorderHover => IsDarkMode ? Color.FromArgb(85, 85, 85) : Color.FromArgb(204, 204, 204);

        public static Color SubCardBackground => IsDarkMode ? Color.FromArgb(36, 36, 36) : Color.FromArgb(248, 249, 250);
        public static Color SubCardBorder => IsDarkMode ? Color.FromArgb(51, 51, 51) : Color.FromArgb(229, 231, 235);
        public static Color InputBackground => IsDarkMode ? Color.FromArgb(40, 40, 40) : Color.FromArgb(255, 255, 255);
        public static Color InputBorder => IsDarkMode ? Color.FromArgb(60, 60, 60) : Color.FromArgb(209, 213, 219);

        // Accent Colors
        public static readonly Color PrimaryAccent = Color.FromArgb(16, 185, 129);       // Mint Green #10B981
        public static readonly Color PrimaryAccentHover = Color.FromArgb(5, 150, 105);
        public static readonly Color AccentBlue = Color.FromArgb(0, 120, 212);
        public static readonly Color FluentGreen = Color.FromArgb(56, 138, 107);        // Muted Sage Green #388A6B
        public static readonly Color FluentRed = Color.FromArgb(178, 89, 89);            // Muted Crimson #B25959
        public static readonly Color DangerRed = Color.FromArgb(232, 17, 35);
        public static readonly Color WarningYellow = Color.FromArgb(245, 158, 11);
        public static readonly Color HeartPink = Color.FromArgb(236, 72, 153);

        // Dynamic Typography Colors
        public static Color TextPrimary => IsDarkMode ? Color.FromArgb(255, 255, 255) : Color.FromArgb(26, 26, 26);
        public static Color TextSecondary => IsDarkMode ? Color.FromArgb(160, 160, 160) : Color.FromArgb(94, 94, 94);
        public static Color TextMuted => IsDarkMode ? Color.FromArgb(120, 120, 120) : Color.FromArgb(142, 142, 142);

        // Controls
        public static Color ButtonStandard => IsDarkMode ? Color.FromArgb(50, 50, 50) : Color.FromArgb(240, 240, 240);
        public static Color ButtonStandardHover => IsDarkMode ? Color.FromArgb(65, 65, 65) : Color.FromArgb(229, 229, 229);
        public static Color ButtonStandardPressed => IsDarkMode ? Color.FromArgb(40, 40, 40) : Color.FromArgb(215, 215, 215);
        public static Color CaptionButtonHover => IsDarkMode ? Color.FromArgb(48, 48, 48) : Color.FromArgb(225, 225, 225);
        public static Color CaptionButtonPressed => IsDarkMode ? Color.FromArgb(60, 60, 60) : Color.FromArgb(200, 200, 200);
        public static Color SwitchTrackOff => IsDarkMode ? Color.FromArgb(65, 65, 65) : Color.FromArgb(204, 204, 204);
        public static Color SwitchThumbOff => IsDarkMode ? Color.FromArgb(200, 200, 200) : Color.FromArgb(94, 94, 94);
        public static Color SegmentedBackground => IsDarkMode ? Color.FromArgb(36, 36, 40) : Color.FromArgb(229, 231, 235);
        public static Color SegmentedBorder => IsDarkMode ? Color.FromArgb(56, 56, 62) : Color.FromArgb(209, 213, 219);

        // Badge Tokens
        public static Color BadgeBackground(bool hovered) => IsDarkMode
            ? (hovered ? Color.FromArgb(30, 64, 120) : Color.FromArgb(24, 42, 77))
            : (hovered ? Color.FromArgb(219, 234, 254) : Color.FromArgb(239, 246, 255));
        public static Color BadgeBorder(bool hovered) => IsDarkMode
            ? (hovered ? Color.FromArgb(96, 165, 250) : Color.FromArgb(59, 130, 246))
            : (hovered ? Color.FromArgb(147, 197, 253) : Color.FromArgb(191, 219, 254));
        public static Color BadgeText(bool hovered) => IsDarkMode
            ? (hovered ? Color.White : Color.FromArgb(147, 197, 253))
            : (hovered ? Color.FromArgb(29, 78, 216) : Color.FromArgb(37, 99, 235));

        // InfoBadge Tokens (Detected / Undetected)
        public static Color StatusDetectedBackground => IsDarkMode ? Color.FromArgb(19, 43, 32) : Color.FromArgb(236, 253, 245);
        public static Color StatusDetectedBorder => IsDarkMode ? Color.FromArgb(29, 90, 60) : Color.FromArgb(167, 243, 208);
        public static Color StatusDetectedText => IsDarkMode ? Color.FromArgb(52, 211, 153) : Color.FromArgb(5, 150, 105);

        public static Color StatusUndetectedBackground => IsDarkMode ? Color.FromArgb(43, 43, 43) : Color.FromArgb(243, 244, 246);
        public static Color StatusUndetectedBorder => IsDarkMode ? Color.FromArgb(66, 66, 66) : Color.FromArgb(229, 231, 235);
        public static Color StatusUndetectedText => IsDarkMode ? Color.FromArgb(158, 158, 158) : Color.FromArgb(107, 114, 128);

        // Chip / Capsule Tokens
        public static Color ChipBackground => IsDarkMode ? Color.FromArgb(48, 48, 48) : Color.FromArgb(238, 240, 243);
        public static Color ChipHoverBackground => IsDarkMode ? Color.FromArgb(60, 60, 60) : Color.FromArgb(228, 231, 236);
        public static Color ChipBorder => IsDarkMode ? Color.FromArgb(65, 65, 65) : Color.FromArgb(215, 219, 225);

        // Typography Ladder
        public static string PreferredFontName { get; private set; } = "Segoe UI Variable Text";
        public static string PreferredDisplayFontName { get; private set; } = "Segoe UI Variable Display";
        public static string PreferredCaptionFontName { get; private set; } = "Segoe UI Variable Small";

        static FluentTheme()
        {
            DetectSystemTheme();

            try
            {
                SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
            }
            catch { }

            InitTypography();
        }

        public static void RefreshTheme()
        {
            bool previous = IsDarkMode;
            DetectSystemTheme();
            if (previous != IsDarkMode)
            {
                ThemeChanged?.Invoke(null, EventArgs.Empty);
            }
        }

        private static void OnUserPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
        {
            if (e.Category == UserPreferenceCategory.General ||
                e.Category == UserPreferenceCategory.Window ||
                e.Category == UserPreferenceCategory.Color)
            {
                RefreshTheme();
            }
        }

        private static void DetectSystemTheme()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(PersonalizeSubKey))
                {
                    if (key != null)
                    {
                        object val = key.GetValue(AppsUseLightThemeKey);
                        if (val is int intVal)
                        {
                            IsDarkMode = (intVal == 0);
                            return;
                        }
                    }
                }
            }
            catch { }

            IsDarkMode = true; // Default fallback to dark mode for developers
        }

        private static void InitTypography()
        {
            try
            {
                using (var testFont = new Font("Segoe UI Variable Text", 9f))
                {
                    if (testFont.Name.Equals("Segoe UI Variable Text", StringComparison.OrdinalIgnoreCase))
                    {
                        PreferredFontName = "Segoe UI Variable Text";
                        PreferredDisplayFontName = "Segoe UI Variable Display";
                        PreferredCaptionFontName = "Segoe UI Variable Small";
                        return;
                    }
                }
            }
            catch { }

            try
            {
                using (var testFont = new Font("Segoe UI", 9f))
                {
                    PreferredFontName = "Segoe UI";
                    PreferredDisplayFontName = "Segoe UI";
                    PreferredCaptionFontName = "Segoe UI";
                }
            }
            catch
            {
                PreferredFontName = FontFamily.GenericSansSerif.Name;
                PreferredDisplayFontName = FontFamily.GenericSansSerif.Name;
                PreferredCaptionFontName = FontFamily.GenericSansSerif.Name;
            }
        }

        public static Font Font(float size, FontStyle style = FontStyle.Regular)
        {
            return new Font(PreferredFontName, size, style);
        }

        public static Font DisplayFont(float size, FontStyle style = FontStyle.Regular)
        {
            return new Font(PreferredDisplayFontName, size, style);
        }

        public static Font CaptionFont(float size, FontStyle style = FontStyle.Regular)
        {
            return new Font(PreferredCaptionFontName, size, style);
        }

        public static GraphicsPath CreateRoundedRectangle(Rectangle rect, int radius)
        {
            var path = new GraphicsPath();
            int diameter = radius * 2;
            var arcRect = new Rectangle(rect.Location, new Size(diameter, diameter));

            path.AddArc(arcRect, 180, 90);
            arcRect.X = rect.Right - diameter;
            path.AddArc(arcRect, 270, 90);
            arcRect.Y = rect.Bottom - diameter;
            path.AddArc(arcRect, 0, 90);
            arcRect.X = rect.Left;
            path.AddArc(arcRect, 90, 90);
            path.CloseFigure();
            return path;
        }
    }
    #endregion
}
