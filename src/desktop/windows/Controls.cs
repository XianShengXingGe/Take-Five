using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace TakeFive
{
    #region Custom Fluent Controls
    public class FluentCard : Panel
    {
        private bool isHovered = false;
        public bool IsHovered => isHovered;
        public int CornerRadius { get; set; } = 8;
        public Color? CustomBackgroundColor { get; set; }

        public FluentCard()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Padding = new Padding(16);
            Margin = new Padding(0, 0, 0, 10);
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
            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, CornerRadius))
            {
                Color bg = CustomBackgroundColor ?? (isHovered ? FluentTheme.CardHoverBackground : FluentTheme.CardBackground);
                using (var brush = new SolidBrush(bg))
                {
                    e.Graphics.FillPath(brush, path);
                }

                Color border = isHovered ? FluentTheme.CardBorderHover : FluentTheme.CardBorder;
                using (var pen = new Pen(border, 1f))
                {
                    e.Graphics.DrawPath(pen, path);
                }
            }
        }
    }

    public class FluentButton : Button
    {
        public bool IsPrimary { get; set; } = false;
        public int CornerRadius { get; set; } = 6;
        private bool isHovered = false;
        private bool isPressed = false;

        public FluentButton()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Font = FluentTheme.Font(9f, FontStyle.Regular);
            Cursor = Cursors.Hand;
            Size = new Size(110, 32);
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
            isPressed = false;
            Invalidate();
        }

        protected override void OnMouseDown(MouseEventArgs mevent)
        {
            base.OnMouseDown(mevent);
            isPressed = true;
            Invalidate();
        }

        protected override void OnMouseUp(MouseEventArgs mevent)
        {
            base.OnMouseUp(mevent);
            isPressed = false;
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs pevent)
        {
            pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var bounds = new Rectangle(0, 0, Width - 1, Height - 1);

            using (var path = FluentTheme.CreateRoundedRectangle(bounds, CornerRadius))
            {
                Color bg;
                Color textCol = FluentTheme.TextPrimary;

                if (IsPrimary)
                {
                    if (isPressed) bg = Color.FromArgb(4, 120, 87);
                    else if (isHovered) bg = FluentTheme.PrimaryAccentHover;
                    else bg = FluentTheme.PrimaryAccent;
                    textCol = Color.White;
                }
                else
                {
                    if (isPressed) bg = FluentTheme.ButtonStandardPressed;
                    else if (isHovered) bg = FluentTheme.ButtonStandardHover;
                    else bg = FluentTheme.ButtonStandard;
                }

                using (var brush = new SolidBrush(bg))
                {
                    pevent.Graphics.FillPath(brush, path);
                }

                if (!IsPrimary)
                {
                    using (var pen = new Pen(isHovered ? FluentTheme.CardBorderHover : FluentTheme.CardBorder, 1f))
                    {
                        pevent.Graphics.DrawPath(pen, path);
                    }
                }

                TextRenderer.DrawText(
                    pevent.Graphics,
                    Text,
                    Font,
                    bounds,
                    textCol,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine
                );
            }
        }
    }

    public class FluentToggleSwitch : Control
    {
        private bool isChecked = true;
        private bool isHovered = false;

        public event EventHandler CheckedChanged;

        public bool Checked
        {
            get { return isChecked; }
            set
            {
                if (isChecked != value)
                {
                    isChecked = value;
                    Invalidate();
                    if (CheckedChanged != null) CheckedChanged(this, EventArgs.Empty);
                }
            }
        }

        public FluentToggleSwitch()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.SupportsTransparentBackColor, true);
            Size = new Size(42, 22);
            Cursor = Cursors.Hand;
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

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            Checked = !Checked;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

            int trackW = 40;
            int trackH = 20;
            var trackRect = new Rectangle(1, 1, trackW, trackH);
            int radius = trackH / 2;

            using (var path = FluentTheme.CreateRoundedRectangle(trackRect, radius))
            {
                Color trackColor = isChecked
                    ? (isHovered ? FluentTheme.PrimaryAccentHover : FluentTheme.PrimaryAccent)
                    : (isHovered ? (FluentTheme.IsDarkMode ? Color.FromArgb(75, 75, 75) : Color.FromArgb(185, 185, 185)) : FluentTheme.SwitchTrackOff);

                using (var brush = new SolidBrush(trackColor))
                {
                    e.Graphics.FillPath(brush, path);
                }

                if (!isChecked)
                {
                    using (var pen = new Pen(FluentTheme.CardBorderHover, 1f))
                    {
                        e.Graphics.DrawPath(pen, path);
                    }
                }
            }

            int thumbSize = 14;
            int thumbY = 4;
            int thumbX = isChecked ? (trackW - thumbSize - 2) : 4;
            var thumbRect = new Rectangle(thumbX, thumbY, thumbSize, thumbSize);

            using (var thumbBrush = new SolidBrush(isChecked ? Color.White : FluentTheme.SwitchThumbOff))
            {
                e.Graphics.FillEllipse(thumbBrush, thumbRect);
            }
        }
    }

    public class FluentWindowControls : Panel
    {
        public Button MinimizeButton { get; private set; }
        public Button CloseButton { get; private set; }

        public event EventHandler MinimizeClicked;
        public event EventHandler CloseClicked;

        public FluentWindowControls()
        {
            Height = 36;
            Width = 92;
            BackColor = Color.Transparent;

            MinimizeButton = CreateHeaderButton("—", false);
            MinimizeButton.Location = new Point(0, 0);
            MinimizeButton.Click += (s, e) => { if (MinimizeClicked != null) MinimizeClicked(this, EventArgs.Empty); };

            CloseButton = CreateHeaderButton("✕", true);
            CloseButton.Location = new Point(46, 0);
            CloseButton.Click += (s, e) => { if (CloseClicked != null) CloseClicked(this, EventArgs.Empty); };

            Controls.Add(MinimizeButton);
            Controls.Add(CloseButton);
        }

        private Button CreateHeaderButton(string text, bool isClose)
        {
            var btn = new Button
            {
                Text = text,
                Size = new Size(46, 36),
                FlatStyle = FlatStyle.Flat,
                Font = FluentTheme.Font(10f, FontStyle.Regular),
                ForeColor = FluentTheme.TextSecondary,
                BackColor = Color.Transparent,
                Cursor = Cursors.Default
            };
            btn.FlatAppearance.BorderSize = 0;
            btn.FlatAppearance.MouseOverBackColor = isClose ? FluentTheme.DangerRed : FluentTheme.CaptionButtonHover;
            btn.FlatAppearance.MouseDownBackColor = isClose ? Color.FromArgb(190, 10, 25) : FluentTheme.CaptionButtonPressed;

            btn.MouseEnter += (s, e) => { if (isClose) btn.ForeColor = Color.White; };
            btn.MouseLeave += (s, e) => { btn.ForeColor = FluentTheme.TextSecondary; };

            return btn;
        }
    }
    #endregion
}
