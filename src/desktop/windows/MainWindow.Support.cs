using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace TakeFive
{
    public partial class TakeFiveMainWindow
    {
        #region Support and Community Card
        private FluentCard CreateSupportCard()
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 226,
                Padding = new Padding(16, 14, 16, 14)
            };

            var titleLbl = new Label
            {
                Text = L10n.Tr("support.title", lang),
                Font = FluentTheme.Font(11f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 12),
                AutoSize = true
            };

            var topDivider = new Panel
            {
                Location = new Point(14, 38),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            var devTitle = new Label
            {
                Text = "☕ " + L10n.Tr("support.dev_title", lang),
                Font = FluentTheme.Font(9.5f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 48),
                AutoSize = true
            };

            var devDesc = new Label
            {
                Text = L10n.Tr("support.dev_desc", lang),
                Font = FluentTheme.Font(8.5f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(14, 68),
                AutoSize = true
            };

            var donateBtn = new FluentButton
            {
                Text = "❤️ " + L10n.Tr("support.donate_button", lang),
                IsPrimary = false,
                Size = new Size(95, 30),
                Location = new Point(card.Width - 110, 48),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            donateBtn.Click += (s, e) =>
            {
                using (var donateForm = new DonationForm(appController))
                {
                    donateForm.ShowDialog(this);
                }
            };

            var midDivider = new Panel
            {
                Location = new Point(14, 94),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // Social Channel Cards (Modern Fluent Rows)
            var xhsRow = CreateSocialRow(
                "🔖",
                L10n.Tr("support.channel_xiaohongshu", lang),
                "先声行歌",
                "https://www.xiaohongshu.com/search_result?keyword=%E5%85%88%E5%A3%B0%E8%A1%8C%E6%AD%8C",
                "先声行歌",
                14,
                104,
                card.Width - 28
            );

            var weiboRow = CreateSocialRow(
                "💬",
                L10n.Tr("support.channel_weibo", lang),
                "@先声行歌",
                "https://weibo.com/u/3207903867",
                "https://weibo.com/u/3207903867",
                14,
                144,
                card.Width - 28
            );

            var emailRow = CreateSocialRow(
                "✉️",
                L10n.Tr("support.channel_email", lang),
                "xianshengxingge@163.com",
                "mailto:xianshengxingge@163.com",
                "xianshengxingge@163.com",
                14,
                184,
                card.Width - 28
            );

            toastLabel = new Label
            {
                Text = "",
                Font = FluentTheme.Font(8.5f),
                ForeColor = FluentTheme.PrimaryAccent,
                Location = new Point(card.Width - 200, 14),
                Size = new Size(180, 18),
                TextAlign = ContentAlignment.MiddleRight,
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };

            card.Controls.Add(titleLbl);
            card.Controls.Add(topDivider);
            card.Controls.Add(devTitle);
            card.Controls.Add(devDesc);
            card.Controls.Add(donateBtn);
            card.Controls.Add(midDivider);
            card.Controls.Add(xhsRow);
            card.Controls.Add(weiboRow);
            card.Controls.Add(emailRow);
            card.Controls.Add(toastLabel);

            return card;
        }

        private Panel CreateSocialRow(string icon, string platform, string displayText, string openUrl, string copyValue, int x, int y, int width)
        {
            string lang = appController.Language;
            var rowPanel = new Panel
            {
                Location = new Point(x, y),
                Size = new Size(width, 34),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                BackColor = FluentTheme.SubCardBackground
            };

            var iconLbl = new Label
            {
                Text = icon,
                Font = FluentTheme.Font(9.5f),
                Location = new Point(8, 7),
                Size = new Size(20, 20),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var platformLbl = new Label
            {
                Text = platform,
                Font = FluentTheme.Font(9f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(32, 8),
                AutoSize = true
            };

            var displayLbl = new Label
            {
                Text = displayText,
                Font = FluentTheme.Font(8.5f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(105, 9),
                AutoSize = true
            };

            var openBtn = new FluentPillButton
            {
                Text = L10n.Tr("support.open_link", lang) + " ↗",
                Location = new Point(rowPanel.Width - 146, 5),
                Size = new Size(68, 24),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            openBtn.Click += (s, e) =>
            {
                try
                {
                    Process.Start(new ProcessStartInfo { FileName = openUrl, UseShellExecute = true });
                }
                catch { }
            };

            var copyBtn = new FluentPillButton
            {
                Text = L10n.Tr("support.copy_link", lang),
                Location = new Point(rowPanel.Width - 72, 5),
                Size = new Size(64, 24),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            copyBtn.Click += (s, e) =>
            {
                try
                {
                    string email = copyValue;
                    Clipboard.SetText(email);
                    copyBtn.Text = L10n.Tr("support.copied", lang) + " ✔";
                    if (toastLabel != null)
                    {
                        toastLabel.Text = L10n.Tr("support.copied", appController.Language);
                    }
                    var t = new Timer { Interval = 2000 };
                    t.Tick += (ts, te) =>
                    {
                        copyBtn.Text = L10n.Tr("support.copy_link", lang);
                        if (toastLabel != null) toastLabel.Text = "";
                        t.Stop();
                        t.Dispose();
                    };
                    t.Start();
                }
                catch { }
            };

            rowPanel.Controls.Add(iconLbl);
            rowPanel.Controls.Add(platformLbl);
            rowPanel.Controls.Add(displayLbl);
            rowPanel.Controls.Add(openBtn);
            rowPanel.Controls.Add(copyBtn);

            return rowPanel;
        }

        private LinkLabel CreateSocialLink(string text, string url, int x, int y)
        {
            var link = new LinkLabel
            {
                Text = text,
                Location = new Point(x, y),
                AutoSize = true,
                Visible = false
            };
            return link;
        }

        private LinkLabel CreateEmailCopyLink(string text, string email, int x, int y)
        {
            var link = new LinkLabel
            {
                Text = text,
                Location = new Point(x, y),
                AutoSize = true,
                Visible = false
            };
            return link;
        }
        #endregion
    }
}

