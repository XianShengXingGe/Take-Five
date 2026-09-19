using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace TakeFive
{
    #region Pickers and Badges
    public class SegmentedLevelPicker : Control
    {
        private string currentLevel = "active";
        private string lang = "system";
        public event Action<string> LevelChanged;

        private float currentProgress = 0.0f;
        private float targetProgress = 0.0f;
        private System.Windows.Forms.Timer animTimer;

        public string CurrentLevel
        {
            get { return currentLevel; }
            set
            {
                if (!string.Equals(currentLevel, value, StringComparison.OrdinalIgnoreCase))
                {
                    currentLevel = value;
                    targetProgress = currentLevel.Equals("timeSensitive", StringComparison.OrdinalIgnoreCase) ? 1.0f : 0.0f;
                    animTimer?.Start();
                    Invalidate();
                }
            }
        }

        public SegmentedLevelPicker(string initialLevel, string language)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            currentLevel = string.IsNullOrEmpty(initialLevel) ? "active" : initialLevel;
            lang = language;
            targetProgress = currentLevel.Equals("timeSensitive", StringComparison.OrdinalIgnoreCase) ? 1.0f : 0.0f;
            currentProgress = targetProgress;
            Size = new Size(130, 24);
            Cursor = Cursors.Hand;

            animTimer = new System.Windows.Forms.Timer { Interval = 16 };
            animTimer.Tick += (s, e) =>
            {
                float diff = targetProgress - currentProgress;
                if (Math.Abs(diff) < 0.02f)
                {
                    currentProgress = targetProgress;
                    animTimer.Stop();
                }
                else
                {
                    currentProgress += diff * 0.35f;
                }
                Invalidate();
            };
        }

        public void UpdateLanguage(string newLang)
        {
            lang = newLang;
            Invalidate();
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            base.OnMouseClick(e);
            int half = Width / 2;
            string target = e.X < half ? "active" : "timeSensitive";
            if (!string.Equals(target, currentLevel, StringComparison.OrdinalIgnoreCase))
            {
                currentLevel = target;
                targetProgress = target.Equals("timeSensitive", StringComparison.OrdinalIgnoreCase) ? 1.0f : 0.0f;
                animTimer?.Start();
                Invalidate();
                LevelChanged?.Invoke(target);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);

            // Container background & subtle border
            using (var path = FluentTheme.CreateRoundedRectangle(bounds, Height / 2))
            using (var brush = new SolidBrush(FluentTheme.SegmentedBackground))
            using (var pen = new Pen(FluentTheme.SegmentedBorder, 1f))
            {
                e.Graphics.FillPath(brush, path);
                e.Graphics.DrawPath(pen, path);
            }

            int halfW = Width / 2;
            int pillW = halfW - 2;
            float pillX = 1.0f + currentProgress * (halfW - 1);
            var pillRect = new Rectangle((int)Math.Round(pillX), 1, pillW, Height - 3);

            // Interpolate pill color between Active (Fluent Green #22C55E) and Time-Sensitive (Fluent Red #EF4444)
            Color activeColor = FluentTheme.FluentGreen;
            Color tsColor = FluentTheme.FluentRed;
            int r = (int)(activeColor.R + (tsColor.R - activeColor.R) * currentProgress);
            int g = (int)(activeColor.G + (tsColor.G - activeColor.G) * currentProgress);
            int b = (int)(activeColor.B + (tsColor.B - activeColor.B) * currentProgress);
            Color pillColor = Color.FromArgb(Math.Max(0, Math.Min(255, r)), Math.Max(0, Math.Min(255, g)), Math.Max(0, Math.Min(255, b)));

            using (var pillPath = FluentTheme.CreateRoundedRectangle(pillRect, (Height - 3) / 2))
            {
                using (var pillBrush = new SolidBrush(pillColor))
                {
                    e.Graphics.FillPath(pillBrush, pillPath);
                }

                // Micro-glow selection shadow & border (softened low-saturation glow)
                using (var glowPen = new Pen(Color.FromArgb(50, pillColor), 1.2f))
                {
                    e.Graphics.DrawPath(glowPen, pillPath);
                }
            }

            string activeLabel = L10n.Tr("rules.level_active", lang);
            string timeSensitiveLabel = L10n.Tr("rules.level_timeSensitive", lang);

            var leftRect = new Rectangle(0, 0, halfW, Height);
            var rightRect = new Rectangle(halfW, 0, halfW, Height);

            Color text1Color = currentProgress < 0.5f ? Color.White : FluentTheme.TextMuted;
            Color text2Color = currentProgress >= 0.5f ? Color.White : FluentTheme.TextMuted;

            TextRenderer.DrawText(e.Graphics, activeLabel, FluentTheme.Font(8f, currentProgress < 0.5f ? FontStyle.Bold : FontStyle.Regular),
                leftRect, text1Color, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

            TextRenderer.DrawText(e.Graphics, timeSensitiveLabel, FluentTheme.Font(8f, currentProgress >= 0.5f ? FontStyle.Bold : FontStyle.Regular),
                rightRect, text2Color, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                animTimer?.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    public class FluentVersionBadge : Control
    {
        private bool isHovered = false;
        private string versionText = AppVersion.DisplayVersion + " 版本 ↗";

        public string VersionText
        {
            get => versionText;
            set
            {
                versionText = value;
                RecalculateSize();
                Invalidate();
            }
        }

        public FluentVersionBadge()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            Cursor = Cursors.Hand;
            Font = FluentTheme.CaptionFont(8f, FontStyle.Bold);
            BackColor = Color.Transparent;
            RecalculateSize();
        }

        private void RecalculateSize()
        {
            var size = TextRenderer.MeasureText(versionText, Font);
            Size = new Size(size.Width + 14, 20);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            isHovered = true;
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            isHovered = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            int radius = (Height - 1) / 2;

            Color bgColor = FluentTheme.BadgeBackground(isHovered);
            Color borderColor = FluentTheme.BadgeBorder(isHovered);
            Color textColor = FluentTheme.BadgeText(isHovered);

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, radius))
            {
                using (var brush = new SolidBrush(bgColor))
                {
                    e.Graphics.FillPath(brush, path);
                }
                using (var pen = new Pen(borderColor, 1f))
                {
                    e.Graphics.DrawPath(pen, path);
                }
            }

            TextRenderer.DrawText(
                e.Graphics,
                versionText,
                Font,
                bounds,
                textColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding
            );
        }
    }

    public class FluentInfoBadge : Control
    {
        private bool isDetected = false;
        private string text = "";

        public bool IsDetected
        {
            get => isDetected;
            set
            {
                if (isDetected != value)
                {
                    isDetected = value;
                    Invalidate();
                }
            }
        }

        public override string Text
        {
            get => text;
            set
            {
                if (text != value)
                {
                    text = value;
                    RecalculateSize();
                    Invalidate();
                }
            }
        }

        public FluentInfoBadge()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Font = FluentTheme.CaptionFont(8f, FontStyle.Regular);
            Size = new Size(54, 19);
        }

        private void RecalculateSize()
        {
            if (string.IsNullOrEmpty(text)) return;
            var sz = TextRenderer.MeasureText(text, Font);
            Size = new Size(sz.Width + 14, 19);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            int radius = (Height - 1) / 2;

            Color bg = isDetected ? FluentTheme.StatusDetectedBackground : FluentTheme.StatusUndetectedBackground;
            Color border = isDetected ? FluentTheme.StatusDetectedBorder : FluentTheme.StatusUndetectedBorder;
            Color textColor = isDetected ? FluentTheme.StatusDetectedText : FluentTheme.StatusUndetectedText;

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, radius))
            {
                using (var brush = new SolidBrush(bg))
                {
                    e.Graphics.FillPath(brush, path);
                }
                using (var pen = new Pen(border, 1f))
                {
                    e.Graphics.DrawPath(pen, path);
                }
            }

            TextRenderer.DrawText(
                e.Graphics,
                text,
                Font,
                bounds,
                textColor,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding
            );
        }
    }

    public class LanguageSegmentedControl : Control
    {
        private string selectedLanguage = "system";
        private int hoverIndex = -1;
        public event Action<string> LanguageSelected;

        private static readonly string[] LangCodes = { "system", "zh-CN", "en" };
        private static readonly string[] LangLabels = { "跟随系统", "简体中文", "English" };

        public string SelectedLanguage
        {
            get => selectedLanguage;
            set
            {
                if (!string.Equals(selectedLanguage, value, StringComparison.OrdinalIgnoreCase))
                {
                    selectedLanguage = value;
                    Invalidate();
                }
            }
        }

        public LanguageSegmentedControl(string currentLang)
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
            selectedLanguage = string.IsNullOrEmpty(currentLang) ? "system" : currentLang;
            Size = new Size(230, 26);
            Font = FluentTheme.Font(8.5f, FontStyle.Regular);
        }

        protected override void OnMouseMove(MouseEventArgs e)
        {
            base.OnMouseMove(e);
            int newHover = GetIndexAt(e.X);
            if (newHover != hoverIndex)
            {
                hoverIndex = newHover;
                Invalidate();
            }
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            hoverIndex = -1;
            Invalidate();
        }

        protected override void OnMouseClick(MouseEventArgs e)
        {
            base.OnMouseClick(e);
            int idx = GetIndexAt(e.X);
            if (idx >= 0 && idx < LangCodes.Length)
            {
                string target = LangCodes[idx];
                if (!string.Equals(selectedLanguage, target, StringComparison.OrdinalIgnoreCase))
                {
                    selectedLanguage = target;
                    Invalidate();
                    LanguageSelected?.Invoke(target);
                }
            }
        }

        private int GetIndexAt(int x)
        {
            int segmentW = Width / 3;
            int idx = x / segmentW;
            return Math.Max(0, Math.Min(2, idx));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            int radius = (Height - 1) / 2;

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, radius))
            using (var brush = new SolidBrush(FluentTheme.SegmentedBackground))
            using (var pen = new Pen(FluentTheme.SegmentedBorder, 1f))
            {
                e.Graphics.FillPath(brush, path);
                e.Graphics.DrawPath(pen, path);
            }

            int segmentW = Width / 3;
            int activeIndex = Array.IndexOf(LangCodes, selectedLanguage);
            if (activeIndex < 0) activeIndex = 0;

            var pillRect = new Rectangle(activeIndex * segmentW + 2, 2, segmentW - 4, Height - 5);
            using (var pillPath = FluentTheme.CreateRoundedRectangle(pillRect, (Height - 5) / 2))
            using (var pillBrush = new SolidBrush(FluentTheme.AccentBlue))
            {
                e.Graphics.FillPath(pillBrush, pillPath);
            }

            for (int i = 0; i < 3; i++)
            {
                var textRect = new Rectangle(i * segmentW, 0, segmentW, Height);
                bool isActive = (i == activeIndex);
                Color textCol = isActive ? Color.White : (i == hoverIndex ? FluentTheme.TextPrimary : FluentTheme.TextSecondary);
                var fontStyle = isActive ? FontStyle.Bold : FontStyle.Regular;

                using (var f = FluentTheme.Font(8.5f, fontStyle))
                {
                    TextRenderer.DrawText(
                        e.Graphics,
                        LangLabels[i],
                        f,
                        textRect,
                        textCol,
                        TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding
                    );
                }
            }
        }
    }

    public class FluentPillButton : Control
    {
        private bool isHovered = false;
        private string text = "";

        public override string Text
        {
            get => text;
            set
            {
                text = value;
                RecalculateSize();
                Invalidate();
            }
        }

        public FluentPillButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Cursor = Cursors.Hand;
            Font = FluentTheme.CaptionFont(8.5f, FontStyle.Regular);
            Size = new Size(88, 24);
        }

        private void RecalculateSize()
        {
            var sz = TextRenderer.MeasureText(text, Font);
            Size = new Size(sz.Width + 18, 24);
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            base.OnMouseEnter(e);
            isHovered = true;
            Invalidate();
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            base.OnMouseLeave(e);
            isHovered = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
            int radius = (Height - 1) / 2;

            Color bg = isHovered ? FluentTheme.ChipHoverBackground : FluentTheme.ChipBackground;
            Color border = FluentTheme.ChipBorder;
            Color textCol = FluentTheme.TextPrimary;

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, radius))
            {
                using (var b = new SolidBrush(bg))
                {
                    e.Graphics.FillPath(b, path);
                }
                using (var p = new Pen(border, 1f))
                {
                    e.Graphics.DrawPath(p, path);
                }
            }

            TextRenderer.DrawText(
                e.Graphics,
                text,
                Font,
                bounds,
                textCol,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding
            );
        }
    }
    #endregion
}
