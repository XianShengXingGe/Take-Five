using System;
using System.Drawing;
using System.Windows.Forms;

namespace TakeFive
{
    public partial class TakeFiveMainWindow
    {
        #region Onboarding Wizard
        private void RenderOnboardingView()
        {
            onboardingView = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                BackColor = Color.Transparent
            };

            switch (onboardingStep)
            {
                case 1:
                    RenderOnboardingStep1_Welcome(onboardingView);
                    break;
                case 2:
                    RenderOnboardingStep2_Bark(onboardingView);
                    break;
                case 3:
                    RenderOnboardingStep3_Agents(onboardingView);
                    break;
                case 4:
                    RenderOnboardingStep4_Finish(onboardingView);
                    break;
                default:
                    onboardingStep = 1;
                    RenderOnboardingStep1_Welcome(onboardingView);
                    break;
            }

            contentHost.Controls.Add(onboardingView);
        }

        private void RenderOnboardingStep1_Welcome(Panel container)
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 490,
                Padding = new Padding(24)
            };

            var stepLabel = new Label
            {
                Text = L10n.IsZh(lang) ? "第 1/4 步 · 欢迎使用片刻" : "Step 1/4 · Welcome to Take Five",
                Font = FluentTheme.Font(9f, FontStyle.Bold),
                ForeColor = FluentTheme.PrimaryAccent,
                Location = new Point(24, 20),
                AutoSize = true
            };

            var heroTitle = new Label
            {
                Text = L10n.Tr("wizard.hero", lang),
                Font = FluentTheme.DisplayFont(16f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(24, 46),
                Size = new Size(490, 40)
            };

            var desc = new Label
            {
                Text = L10n.Tr("wizard.hero_sub", lang),
                Font = FluentTheme.Font(10f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(24, 94),
                Size = new Size(480, 65)
            };

            var f1 = CreateBulletItem(L10n.IsZh(lang) ? "⚡ 毫秒级零延迟 Bark 手机推送通知" : "⚡ Zero-latency Bark push alerts to mobile", 170);
            var f2 = CreateBulletItem(L10n.IsZh(lang) ? "🤖 深度适配 Codex、Antigravity、OpenCode、Claude 四大智能体" : "🤖 Full support for Codex, Antigravity, OpenCode, Claude", 205);
            var f3 = CreateBulletItem(L10n.IsZh(lang) ? "🔇 智能过程抑制，仅在关键节点提醒" : "🔇 Smart suppression for quiet multi-turn reasoning", 240);
            var f4 = CreateBulletItem(L10n.IsZh(lang) ? "🪟 Windows 11 Fluent Design 2 原生系统托盘常驻" : "🪟 Windows 11 Fluent Design 2 system tray integration", 275);

            var nextBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.start", lang),
                IsPrimary = true,
                Size = new Size(200, 38),
                Location = new Point(24, 340)
            };
            nextBtn.Click += (s, e) =>
            {
                onboardingStep = 2;
                UpdateViewState();
            };

            card.Controls.Add(stepLabel);
            card.Controls.Add(heroTitle);
            card.Controls.Add(desc);
            card.Controls.Add(f1);
            card.Controls.Add(f2);
            card.Controls.Add(f3);
            card.Controls.Add(f4);
            card.Controls.Add(nextBtn);

            container.Controls.Add(card);
        }

        private Control CreateBulletItem(string text, int top)
        {
            return new Label
            {
                Text = "•  " + text,
                Font = FluentTheme.Font(9.5f),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(28, top),
                Size = new Size(470, 26)
            };
        }

        private void RenderOnboardingStep2_Bark(Panel container)
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 490,
                Padding = new Padding(24)
            };

            var stepLabel = new Label
            {
                Text = L10n.IsZh(lang) ? "第 2/4 步 · 绑定 Bark 推送通道" : "Step 2/4 · Connect Bark Push Channel",
                Font = FluentTheme.Font(9f, FontStyle.Bold),
                ForeColor = FluentTheme.PrimaryAccent,
                Location = new Point(24, 20),
                AutoSize = true
            };

            var title = new Label
            {
                Text = L10n.IsZh(lang) ? "填入 Bark 设备 Key 或私有服务器 URL" : "Enter Bark Key or Server URL",
                Font = FluentTheme.Font(14f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(24, 46),
                Size = new Size(480, 30)
            };

            var hint = new Label
            {
                Text = L10n.IsZh(lang) ? "在 iPhone 或 iPad 上打开 Bark App，复制专属链接或设备 Key" : "Open Bark App on iPhone/iPad and copy your device URL or Key",
                Font = FluentTheme.Font(9f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(24, 82),
                Size = new Size(480, 40)
            };

            obBarkUrlBox = new TextBox
            {
                Location = new Point(24, 130),
                Size = new Size(470, 32),
                Font = FluentTheme.Font(10.5f),
                BackColor = FluentTheme.InputBackground,
                ForeColor = FluentTheme.TextPrimary,
                BorderStyle = BorderStyle.FixedSingle,
                Text = appController.BarkEndpoint ?? ""
            };

            var testBtn = new FluentButton
            {
                Text = "🧪 " + (L10n.IsZh(lang) ? "发送连通性测试" : "Test Push"),
                IsPrimary = false,
                Size = new Size(160, 34),
                Location = new Point(24, 180)
            };

            obTestResultLabel = new Label
            {
                Text = "",
                Font = FluentTheme.Font(9f),
                Location = new Point(195, 188),
                Size = new Size(300, 24),
                ForeColor = FluentTheme.TextSecondary
            };

            testBtn.Click += (s, e) =>
            {
                var input = obBarkUrlBox.Text.Trim();
                if (string.IsNullOrEmpty(input))
                {
                    obTestResultLabel.ForeColor = FluentTheme.DangerRed;
                    obTestResultLabel.Text = L10n.IsZh(lang) ? "✖ 请先输入有效的 Bark Key 或 URL" : "✖ Please enter a valid Bark URL";
                    return;
                }

                obTestResultLabel.ForeColor = FluentTheme.WarningYellow;
                obTestResultLabel.Text = L10n.IsZh(lang) ? "⏳ 正在发送测试推送至手机..." : "⏳ Sending test push...";
                testBtn.Enabled = false;

                appController.SaveBarkCredential(input);
                appController.RunCli("test --quiet", false, res =>
                {
                    testBtn.Enabled = true;
                    appController.RefreshStatus();
                    obTestResultLabel.ForeColor = Color.LightGreen;
                    obTestResultLabel.Text = L10n.IsZh(lang) ? "✅ 测试请求已发送！" : "✅ Test push dispatched!";
                });
            };

            var backBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.prev", lang),
                IsPrimary = false,
                Size = new Size(110, 36),
                Location = new Point(24, 380)
            };
            backBtn.Click += (s, e) =>
            {
                onboardingStep = 1;
                UpdateViewState();
            };

            var nextBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.next", lang),
                IsPrimary = true,
                Size = new Size(160, 36),
                Location = new Point(145, 380)
            };
            nextBtn.Click += (s, e) =>
            {
                onboardingStep = 3;
                UpdateViewState();
            };

            card.Controls.Add(stepLabel);
            card.Controls.Add(title);
            card.Controls.Add(hint);
            card.Controls.Add(obBarkUrlBox);
            card.Controls.Add(testBtn);
            card.Controls.Add(obTestResultLabel);
            card.Controls.Add(backBtn);
            card.Controls.Add(nextBtn);

            container.Controls.Add(card);
        }

        private void RenderOnboardingStep3_Agents(Panel container)
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 490,
                Padding = new Padding(24)
            };

            var stepLabel = new Label
            {
                Text = L10n.IsZh(lang) ? "第 3/4 步 · 激活智能体" : "Step 3/4 · Activate Agents",
                Font = FluentTheme.Font(9f, FontStyle.Bold),
                ForeColor = FluentTheme.PrimaryAccent,
                Location = new Point(24, 20),
                AutoSize = true
            };

            var title = new Label
            {
                Text = L10n.IsZh(lang) ? "自动检测与激活 Coding Agents" : "Detect & Enable Coding Agents",
                Font = FluentTheme.Font(14f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(24, 46),
                Size = new Size(480, 30)
            };

            card.Controls.Add(stepLabel);
            card.Controls.Add(title);

            obAgentToggles.Clear();
            int top = 85;
            foreach (var agent in appController.DynamicAgents)
            {
                var rowCard = new FluentCard
                {
                    Location = new Point(24, top),
                    Size = new Size(470, 52),
                    CornerRadius = 6,
                    CustomBackgroundColor = FluentTheme.SubCardBackground
                };

                bool detected = agent.Detected || agent.Installed;

                var iconBox = new PictureBox
                {
                    Location = new Point(10, 14),
                    Size = new Size(24, 24),
                    SizeMode = PictureBoxSizeMode.Zoom,
                    Image = appController.GetAgentBitmap(agent.Id, detected)
                };

                var nameLbl = new Label
                {
                    Text = agent.DisplayName,
                    Font = FluentTheme.Font(10f, FontStyle.Bold),
                    ForeColor = FluentTheme.TextPrimary,
                    Location = new Point(40, 15),
                    AutoSize = true
                };

                var statusLbl = new Label
                {
                    Text = detected ? L10n.Tr("agents.detected", lang) : L10n.Tr("agents.undetected", lang),
                    Font = FluentTheme.Font(8.5f),
                    ForeColor = detected ? FluentTheme.PrimaryAccent : FluentTheme.TextMuted,
                    Location = new Point(190, 17),
                    AutoSize = true
                };

                var toggle = new FluentToggleSwitch
                {
                    Location = new Point(410, 15),
                    Checked = agent.Enabled
                };
                var agentId = agent.Id;
                toggle.CheckedChanged += (s, e) =>
                {
                    appController.ToggleAgent(agentId, toggle.Checked);
                };
                obAgentToggles[agentId] = toggle;

                rowCard.Controls.Add(iconBox);
                rowCard.Controls.Add(nameLbl);
                rowCard.Controls.Add(statusLbl);
                rowCard.Controls.Add(toggle);
                card.Controls.Add(rowCard);

                top += 60;
            }

            var backBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.prev", lang),
                IsPrimary = false,
                Size = new Size(110, 36),
                Location = new Point(24, 380)
            };
            backBtn.Click += (s, e) =>
            {
                onboardingStep = 2;
                UpdateViewState();
            };

            var nextBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.next", lang),
                IsPrimary = true,
                Size = new Size(180, 36),
                Location = new Point(145, 380)
            };
            nextBtn.Click += (s, e) =>
            {
                onboardingStep = 4;
                UpdateViewState();
            };

            card.Controls.Add(backBtn);
            card.Controls.Add(nextBtn);

            container.Controls.Add(card);
        }

        private void RenderOnboardingStep4_Finish(Panel container)
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 490,
                Padding = new Padding(24)
            };

            var stepLabel = new Label
            {
                Text = L10n.IsZh(lang) ? "第 4/4 步 · 准备就绪" : "Step 4/4 · Ready",
                Font = FluentTheme.Font(9f, FontStyle.Bold),
                ForeColor = FluentTheme.PrimaryAccent,
                Location = new Point(24, 20),
                AutoSize = true
            };

            var title = new Label
            {
                Text = L10n.IsZh(lang) ? "一切就绪！尽享从容开发体验" : "Ready to go! Reclaim your focus",
                Font = FluentTheme.Font(14f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(24, 46),
                Size = new Size(480, 30)
            };

            var summary = new Label
            {
                Text = L10n.IsZh(lang)
                    ? "片刻将常驻于右下角系统托盘（Taskbar Tray）。\n当 Agent 需要你时，手机将第一时间响起；不需要你时，请享受片刻属于自己的时光。"
                    : "Take Five is running in your system tray.\nWhenever your coding agent needs you, your phone will alert you instantly.",
                Font = FluentTheme.Font(10f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(24, 88),
                Size = new Size(480, 60)
            };

            obStartupCheckbox = new CheckBox
            {
                Text = L10n.Tr("preferences.autostart", lang),
                Checked = appController.IsAutoStartEnabled(),
                Font = FluentTheme.Font(10f),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(28, 170),
                Size = new Size(450, 30)
            };

            var finishBtn = new FluentButton
            {
                Text = L10n.Tr("wizard.finish", lang),
                IsPrimary = true,
                Size = new Size(240, 42),
                Location = new Point(24, 230)
            };
            finishBtn.Click += (s, e) =>
            {
                if (obStartupCheckbox.Checked != appController.IsAutoStartEnabled())
                {
                    appController.SetAutoStart(obStartupCheckbox.Checked);
                }

                appController.RefreshStatus();
                isShowingOnboarding = false;
                onboardingStep = 1;
                UpdateViewState();
                HideToTray();
            };

            card.Controls.Add(stepLabel);
            card.Controls.Add(title);
            card.Controls.Add(summary);
            card.Controls.Add(obStartupCheckbox);
            card.Controls.Add(finishBtn);

            container.Controls.Add(card);
        }
        #endregion
    }
}
