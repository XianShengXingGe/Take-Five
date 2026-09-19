using System;
using System.Drawing;
using System.Windows.Forms;

namespace TakeFive
{
    #region Donation Form (WeChat & Alipay Modal)
    public class DonationForm : Form
    {
        private readonly TakeFiveTrayApp appController;
        private string activeChannel = "alipay";
        private PictureBox qrBox;
        private FluentButton alipayBtn;
        private FluentButton wechatBtn;

        public DonationForm(TakeFiveTrayApp controller)
        {
            appController = controller;
            string lang = controller.Language;

            Text = L10n.Tr("donation.modal_title", lang);
            Size = new Size(340, 430);
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            BackColor = FluentTheme.WindowBackground;
            ForeColor = FluentTheme.TextPrimary;

            ApplyFluentDwmAttributes();
            FluentTheme.ThemeChanged += OnThemeChanged;

            var titleLbl = new Label
            {
                Text = "☕ " + L10n.Tr("donation.modal_title", lang),
                Font = FluentTheme.DisplayFont(12f, FontStyle.Bold),
                Location = new Point(20, 16),
                AutoSize = true
            };

            var subtitleLbl = new Label
            {
                Text = L10n.Tr("donation.modal_subtitle", lang),
                Font = FluentTheme.CaptionFont(8.5f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(22, 42),
                Size = new Size(290, 32)
            };

            alipayBtn = new FluentButton
            {
                Text = L10n.Tr("donation.alipay", lang),
                IsPrimary = true,
                Location = new Point(35, 82),
                Size = new Size(125, 30)
            };
            alipayBtn.Click += (s, e) => SwitchChannel("alipay");

            wechatBtn = new FluentButton
            {
                Text = L10n.Tr("donation.wechat", lang),
                IsPrimary = false,
                Location = new Point(175, 82),
                Size = new Size(125, 30)
            };
            wechatBtn.Click += (s, e) => SwitchChannel("wechat");

            qrBox = new PictureBox
            {
                Location = new Point(65, 126),
                Size = new Size(200, 200),
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = FluentTheme.CardBackground
            };
            LoadQrImage();

            var footerLbl = new Label
            {
                Text = L10n.Tr("donation.footer_note", lang),
                Font = FluentTheme.CaptionFont(8f),
                ForeColor = FluentTheme.TextMuted,
                Location = new Point(20, 340),
                Size = new Size(290, 20),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var topCloseBtn = new Button
            {
                Text = "✕",
                Font = FluentTheme.Font(9f),
                ForeColor = FluentTheme.TextSecondary,
                BackColor = Color.Transparent,
                FlatStyle = FlatStyle.Flat,
                Size = new Size(28, 28),
                Location = new Point(340 - 44, 12),
                Cursor = Cursors.Hand
            };
            topCloseBtn.FlatAppearance.BorderSize = 0;
            topCloseBtn.Click += (s, e) => Close();

            var closeBtn = new FluentButton
            {
                Text = L10n.Tr("donation.close", lang),
                Location = new Point(125, 364),
                Size = new Size(80, 28)
            };
            closeBtn.Click += (s, e) => Close();

            Controls.Add(topCloseBtn);
            Controls.Add(titleLbl);
            Controls.Add(subtitleLbl);
            Controls.Add(alipayBtn);
            Controls.Add(wechatBtn);
            Controls.Add(qrBox);
            Controls.Add(footerLbl);
            Controls.Add(closeBtn);
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyFluentDwmAttributes();
        }

        private void SwitchChannel(string channel)
        {
            activeChannel = channel;
            alipayBtn.IsPrimary = channel == "alipay";
            wechatBtn.IsPrimary = channel == "wechat";
            alipayBtn.Invalidate();
            wechatBtn.Invalidate();
            LoadQrImage();
        }

        private void LoadQrImage()
        {
            var bmp = appController.GetQrBitmap(activeChannel);
            if (bmp != null)
            {
                qrBox.Image = bmp;
            }
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
            }
            catch { }
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
            if (qrBox != null) qrBox.BackColor = FluentTheme.CardBackground;
            Invalidate(true);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            FluentTheme.ThemeChanged -= OnThemeChanged;
            base.OnFormClosed(e);
        }
    }
    #endregion
}
