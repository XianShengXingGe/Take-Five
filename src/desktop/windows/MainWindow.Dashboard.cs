using System;
using System.Drawing;
using System.Windows.Forms;

namespace TakeFive
{
    public partial class TakeFiveMainWindow
    {
        #region Main Dashboard View (4 Cards)
        private void RenderDashboardView()
        {
            dashboardView = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                BackColor = Color.Transparent
            };

            var cardAgents = CreateAgentsStatusCard();
            var cardRules = CreateNotificationRulesCard();
            var cardSystem = CreateSystemOptionsCard();
            var cardSupport = CreateSupportCard();

            dashboardView.Controls.Add(cardSupport);
            dashboardView.Controls.Add(cardSystem);
            dashboardView.Controls.Add(cardRules);
            dashboardView.Controls.Add(cardAgents);

            cardSupport.BringToFront();
            cardSystem.BringToFront();
            cardRules.BringToFront();
            cardAgents.BringToFront();

            contentHost.Controls.Add(dashboardView);
        }

        private FluentCard CreateAgentsStatusCard()
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(16, 14, 16, 14)
            };

            var titleLbl = new Label
            {
                Text = L10n.Tr("agents.title", lang),
                Font = FluentTheme.Font(11f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 12),
                AutoSize = true
            };
            card.Controls.Add(titleLbl);

            bool allEnabled = appController.IsAllEnabled();
            var masterToggleBtn = new FluentPillButton
            {
                Text = allEnabled ? "🔕 " + L10n.Tr("agents.mute_all", lang) : "🔔 " + L10n.Tr("agents.enable_all", lang),
                Location = new Point(card.Width - 116, 10),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            masterToggleBtn.Click += (s, e) =>
            {
                appController.ToggleAll();
            };
            card.Controls.Add(masterToggleBtn);

            var divider = new Panel
            {
                Location = new Point(14, 40),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };
            card.Controls.Add(divider);

            agentRows.Clear();
            int top = 50;
            foreach (var agent in appController.DynamicAgents)
            {
                var rowPanel = new Panel
                {
                    Location = new Point(14, top),
                    Size = new Size(card.Width - 28, 48),
                    Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                    BackColor = FluentTheme.SubCardBackground
                };

                bool detected = agent.Detected || agent.Installed;

                var agentIcon = new PictureBox
                {
                    Location = new Point(10, 12),
                    Size = new Size(24, 24),
                    SizeMode = PictureBoxSizeMode.Zoom,
                    Image = appController.GetAgentBitmap(agent.Id, detected)
                };

                var nameLbl = new Label
                {
                    Text = agent.DisplayName,
                    Font = FluentTheme.Font(9.5f, FontStyle.Bold),
                    ForeColor = FluentTheme.TextPrimary,
                    Location = new Point(42, 6),
                    AutoSize = true
                };

                var subtitleLbl = new Label
                {
                    Text = L10n.Tr("agents.desc." + agent.Id, lang),
                    Font = FluentTheme.Font(8f),
                    ForeColor = FluentTheme.TextSecondary,
                    Location = new Point(42, 26),
                    AutoSize = true
                };

                var statusBadge = new FluentInfoBadge
                {
                    IsDetected = detected,
                    Text = detected ? L10n.Tr("agents.detected", lang) : L10n.Tr("agents.undetected", lang),
                    Location = new Point(rowPanel.Width - 128, 14),
                    Anchor = AnchorStyles.Top | AnchorStyles.Right
                };

                var toggle = new FluentToggleSwitch
                {
                    Location = new Point(rowPanel.Width - 54, 13),
                    Anchor = AnchorStyles.Top | AnchorStyles.Right,
                    Checked = agent.Enabled
                };
                var agentId = agent.Id;
                toggle.CheckedChanged += (s, e) =>
                {
                    appController.ToggleAgent(agentId, toggle.Checked);
                };

                rowPanel.Controls.Add(agentIcon);
                rowPanel.Controls.Add(nameLbl);
                rowPanel.Controls.Add(subtitleLbl);
                rowPanel.Controls.Add(statusBadge);
                rowPanel.Controls.Add(toggle);
                card.Controls.Add(rowPanel);

                agentRows.Add(new AgentRowItem
                {
                    Agent = agent,
                    IconBox = agentIcon,
                    NameLabel = nameLbl,
                    SubtitleLabel = subtitleLbl,
                    StatusBadge = statusBadge,
                    Toggle = toggle
                });

                top += 54;
            }

            card.Height = top + 10;
            return card;
        }

        private FluentCard CreateNotificationRulesCard()
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 158,
                Padding = new Padding(16, 14, 16, 14)
            };

            var titleLbl = new Label
            {
                Text = L10n.Tr("rules.title", lang),
                Font = FluentTheme.Font(11f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 12),
                AutoSize = true
            };
            card.Controls.Add(titleLbl);

            var subLbl = new Label
            {
                Text = L10n.Tr("rules.description", lang),
                Font = FluentTheme.Font(8.5f, FontStyle.Regular),
                ForeColor = FluentTheme.TextMuted,
                Location = new Point(card.Width - 340, 14),
                Size = new Size(326, 20),
                TextAlign = ContentAlignment.TopRight,
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            card.Controls.Add(subLbl);

            var divider = new Panel
            {
                Location = new Point(14, 38),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };
            card.Controls.Add(divider);

            rulePickers.Clear();
            int colWidth = (card.Width - 28 - 12) / 2;
            int col1X = 14;
            int col2X = 14 + colWidth + 12;

            AddRuleRow(card, "task_completed", L10n.Tr("rules.task_completed", lang), "✔", FluentTheme.PrimaryAccent, col1X, 48, colWidth);
            AddRuleRow(card, "waiting_permission", L10n.Tr("rules.waiting_permission", lang), "🔒", Color.FromArgb(168, 85, 247), col2X, 48, colWidth);
            AddRuleRow(card, "waiting_input", L10n.Tr("rules.waiting_input", lang), "❓", Color.FromArgb(245, 158, 11), col1X, 98, colWidth);
            AddRuleRow(card, "task_failed", L10n.Tr("rules.task_failed", lang), "✖", Color.FromArgb(239, 68, 68), col2X, 98, colWidth);

            return card;
        }

        private void AddRuleRow(Panel container, string eventType, string title, string iconSymbol, Color iconColor, int x, int y, int width)
        {
            string lang = appController.Language;
            var rowPanel = new Panel
            {
                Location = new Point(x, y),
                Size = new Size(width, 42),
                BackColor = FluentTheme.SubCardBackground,
                Anchor = (x > 100) ? (AnchorStyles.Top | AnchorStyles.Right) : (AnchorStyles.Top | AnchorStyles.Left)
            };

            var iconLbl = new Label
            {
                Text = iconSymbol,
                Font = FluentTheme.Font(10f, FontStyle.Bold),
                ForeColor = iconColor,
                Location = new Point(8, 11),
                Size = new Size(18, 18),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var titleLbl = new Label
            {
                Text = title,
                Font = FluentTheme.Font(9f, FontStyle.Regular),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(28, 12),
                AutoSize = true
            };

            string initialLevel = appController.GetEventRuleLevel(eventType);
            var picker = new SegmentedLevelPicker(initialLevel, lang)
            {
                Location = new Point(rowPanel.Width - 124, 9),
                Size = new Size(118, 24),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            picker.LevelChanged += (lvl) =>
            {
                appController.UpdateEventRule(eventType, lvl);
            };

            rulePickers[eventType] = picker;

            rowPanel.Controls.Add(iconLbl);
            rowPanel.Controls.Add(titleLbl);
            rowPanel.Controls.Add(picker);
            container.Controls.Add(rowPanel);
        }

        public void UpdateEventRulesFromController()
        {
            foreach (var kv in rulePickers)
            {
                var lvl = appController.GetEventRuleLevel(kv.Key);
                kv.Value.CurrentLevel = lvl;
            }
        }

        private FluentCard CreateSystemOptionsCard()
        {
            string lang = appController.Language;
            var card = new FluentCard
            {
                Dock = DockStyle.Top,
                Height = 276,
                Padding = new Padding(16, 14, 16, 14)
            };

            // Card Title (⚙️ 通用设置)
            var titleLbl = new Label
            {
                Text = L10n.Tr("preferences.title", lang),
                Font = FluentTheme.Font(11f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 12),
                AutoSize = true
            };

            // Re-onboard Button (Setup Wizard)
            var reOnboardBtn = new FluentPillButton
            {
                Text = "⚡ " + L10n.Tr("preferences.re_onboard", lang),
                Location = new Point(card.Width - 110, 8),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            reOnboardBtn.Click += (s, e) =>
            {
                isShowingOnboarding = true;
                onboardingStep = 1;
                RenderOnboardingView();
            };
            card.Controls.Add(reOnboardBtn);

            var topDivider = new Panel
            {
                Location = new Point(14, 38),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // 1. Bark Push Service Header
            var barkTitleLbl = new Label
            {
                Text = L10n.Tr("bark.title", lang),
                Font = FluentTheme.Font(9.5f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 48),
                AutoSize = true
            };

            bool configured = appController.IsBarkConfigured;
            barkStatusLight = new Panel
            {
                Location = new Point(card.Width - 176, 53),
                Size = new Size(8, 8),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                BackColor = Color.Transparent
            };
            barkStatusLight.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                Color dotColor = appController.IsBarkConfigured ? FluentTheme.PrimaryAccent : Color.FromArgb(245, 158, 11);
                if (isCommittingBarkEdit) dotColor = FluentTheme.WarningYellow;
                using (var b = new SolidBrush(dotColor))
                {
                    e.Graphics.FillEllipse(b, 0, 0, 7, 7);
                }
            };

            barkStatusLabel = new Label
            {
                Text = configured ? L10n.Tr("bark.status_connected", lang) : L10n.Tr("bark.status_unconfigured", lang),
                Font = FluentTheme.Font(8.5f, FontStyle.Regular),
                ForeColor = configured ? FluentTheme.PrimaryAccent : Color.FromArgb(245, 158, 11),
                Location = new Point(card.Width - 162, 48),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                AutoSize = true
            };

            string ep = appController.BarkEndpoint;

            // Wide resident Bark input box
            barkEditBox = new TextBox
            {
                Location = new Point(14, 76),
                Size = new Size(card.Width - 28 - 72 - 95 - 12, 28),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                Font = FluentTheme.Font(9f),
                BackColor = FluentTheme.InputBackground,
                ForeColor = FluentTheme.TextPrimary,
                BorderStyle = BorderStyle.FixedSingle,
                Text = ep ?? ""
            };

            // Right-click context menu for barkEditBox
            barkContextMenu = new ContextMenuStrip();
            var pasteMenuItem = new ToolStripMenuItem(L10n.Tr("bark.paste", lang) + " (Ctrl+V)");
            pasteMenuItem.Click += (s, e) => PasteFromClipboard();

            var copyMenuItem = new ToolStripMenuItem(L10n.Tr("bark.copy", lang) + " (Ctrl+C)");
            copyMenuItem.Click += (s, e) =>
            {
                if (!string.IsNullOrEmpty(barkEditBox.SelectedText))
                {
                    Clipboard.SetText(barkEditBox.SelectedText);
                }
                else if (!string.IsNullOrEmpty(barkEditBox.Text))
                {
                    Clipboard.SetText(barkEditBox.Text);
                }
            };
            var cutMenuItem = new ToolStripMenuItem(L10n.Tr("bark.cut", lang) + " (Ctrl+X)");
            cutMenuItem.Click += (s, e) =>
            {
                if (!string.IsNullOrEmpty(barkEditBox.SelectedText))
                {
                    Clipboard.SetText(barkEditBox.SelectedText);
                    barkEditBox.SelectedText = "";
                    CommitBarkEdit(false);
                }
            };
            var selectAllMenuItem = new ToolStripMenuItem(L10n.Tr("bark.select_all", lang) + " (Ctrl+A)");
            selectAllMenuItem.Click += (s, e) => barkEditBox.SelectAll();

            var clearMenuItem = new ToolStripMenuItem(L10n.Tr("bark.clear", lang));
            clearMenuItem.Click += (s, e) =>
            {
                barkEditBox.Text = "";
                CommitBarkEdit(false);
            };

            barkContextMenu.Items.Add(pasteMenuItem);
            barkContextMenu.Items.Add(copyMenuItem);
            barkContextMenu.Items.Add(cutMenuItem);
            barkContextMenu.Items.Add(new ToolStripSeparator());
            barkContextMenu.Items.Add(selectAllMenuItem);
            barkContextMenu.Items.Add(clearMenuItem);
            barkEditBox.ContextMenuStrip = barkContextMenu;

            barkEditBox.KeyDown += (s, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    CommitBarkEdit(true);
                }
                else if (e.KeyCode == Keys.Escape)
                {
                    e.SuppressKeyPress = true;
                    CancelBarkEdit();
                }
            };
            barkEditBox.LostFocus += (s, e) =>
            {
                CommitBarkEdit(false);
            };

            // Quick Paste button
            var pasteBtn = new FluentButton
            {
                Text = "📋 " + L10n.Tr("bark.paste", lang),
                IsPrimary = false,
                Size = new Size(72, 28),
                Location = new Point(card.Width - 14 - 95 - 6 - 72, 76),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            headerToolTip.SetToolTip(pasteBtn, L10n.Tr("bark.paste_tooltip", lang));
            pasteBtn.Click += (s, e) => PasteFromClipboard();

            // Test Push button
            testPushButton = new FluentButton
            {
                Text = L10n.Tr("bark.send_test", lang),
                IsPrimary = false,
                Size = new Size(95, 28),
                Location = new Point(card.Width - 14 - 95, 76),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            testPushButton.Click += (s, e) =>
            {
                TriggerTestPush();
            };

            // Feedback / Unconfigured hint label
            barkFeedbackLabel = new Label
            {
                Text = configured ? "" : L10n.Tr("bark.unconfigured_hint", lang),
                Font = FluentTheme.Font(8.5f),
                ForeColor = configured ? FluentTheme.PrimaryAccent : Color.FromArgb(245, 158, 11),
                Location = new Point(14, 108),
                Size = new Size(card.Width - 28, 18),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // Divider between Bark and general preferences
            var midDivider = new Panel
            {
                Location = new Point(14, 132),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // 2. Launch at Windows startup
            var autostartTitle = new Label
            {
                Text = L10n.Tr("preferences.autostart", lang),
                Font = FluentTheme.Font(9.5f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 145),
                AutoSize = true
            };

            var autostartDesc = new Label
            {
                Text = L10n.Tr("preferences.autostart_desc", lang),
                Font = FluentTheme.Font(8f),
                ForeColor = FluentTheme.TextSecondary,
                Location = new Point(14, 167),
                AutoSize = true
            };

            var autostartToggle = new FluentToggleSwitch
            {
                Location = new Point(card.Width - 56, 149),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Checked = appController.IsAutoStartEnabled()
            };
            autostartToggle.CheckedChanged += (s, e) =>
            {
                appController.SetAutoStart(autostartToggle.Checked);
            };

            // Backward compat hidden checkbox for tests
            cbLaunchAtStartup = new CheckBox
            {
                Visible = false,
                Checked = appController.IsAutoStartEnabled()
            };

            // Divider between autostart and language
            var botDivider = new Panel
            {
                Location = new Point(14, 196),
                Size = new Size(card.Width - 28, 1),
                BackColor = FluentTheme.CardBorder,
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // 3. Language Selector
            var langLbl = new Label
            {
                Text = L10n.Tr("preferences.language", lang),
                Font = FluentTheme.Font(9.5f, FontStyle.Bold),
                ForeColor = FluentTheme.TextPrimary,
                Location = new Point(14, 212),
                AutoSize = true
            };

            var langSegmentedControl = new LanguageSegmentedControl(appController.Language)
            {
                Location = new Point(card.Width - 244, 208),
                Anchor = AnchorStyles.Top | AnchorStyles.Right
            };
            langSegmentedControl.LanguageSelected += (newLang) =>
            {
                if (newLang != appController.Language)
                {
                    appController.SetLanguage(newLang);
                }
            };

            // Backward compat hidden combobox for tests
            langComboBox = new ComboBox
            {
                Visible = false
            };

            card.Controls.Add(titleLbl);
            card.Controls.Add(topDivider);
            card.Controls.Add(barkTitleLbl);
            card.Controls.Add(barkStatusLight);
            card.Controls.Add(barkStatusLabel);
            card.Controls.Add(barkEditBox);
            card.Controls.Add(pasteBtn);
            card.Controls.Add(testPushButton);
            card.Controls.Add(barkFeedbackLabel);
            card.Controls.Add(midDivider);
            card.Controls.Add(autostartTitle);
            card.Controls.Add(autostartDesc);
            card.Controls.Add(autostartToggle);
            card.Controls.Add(cbLaunchAtStartup);
            card.Controls.Add(botDivider);
            card.Controls.Add(langLbl);
            card.Controls.Add(langSegmentedControl);
            card.Controls.Add(langComboBox);

            return card;
        }

        private void PasteFromClipboard()
        {
            try
            {
                if (Clipboard.ContainsText())
                {
                    string clip = Clipboard.GetText().Trim();
                    if (!string.IsNullOrEmpty(clip))
                    {
                        barkEditBox.Text = clip;
                        CommitBarkEdit(true);
                    }
                }
            }
            catch { }
        }

        private void StartBarkEditing()
        {
            if (barkEditBox == null) return;
            isBarkEditing = true;
            barkEditBox.Focus();
            barkEditBox.SelectAll();
        }

        private void CancelBarkEdit()
        {
            if (barkEditBox == null) return;
            isBarkEditing = false;
            barkEditBox.Text = appController.BarkEndpoint ?? "";
            barkEditBox.SelectAll();
        }

        private void CommitBarkEdit()
        {
            CommitBarkEdit(false);
        }

        private void CommitBarkEdit(bool forceTest)
        {
            if (isCommittingBarkEdit || barkEditBox == null) return;
            string newEp = barkEditBox.Text.Trim();

            bool isChanged = newEp != (appController.BarkEndpoint ?? "");
            if (!isChanged && !forceTest)
            {
                return;
            }

            if (!isChanged && forceTest)
            {
                if (!string.IsNullOrEmpty(newEp))
                {
                    TriggerTestPush();
                }
                return;
            }

            isCommittingBarkEdit = true;
            barkStatusLight?.Invalidate();
            string lang = appController.Language;
            if (barkStatusLabel != null)
            {
                barkStatusLabel.Text = L10n.Tr("bark.updating", lang);
                barkStatusLabel.ForeColor = FluentTheme.WarningYellow;
            }
            if (barkFeedbackLabel != null)
            {
                barkFeedbackLabel.Text = L10n.Tr("bark.updating", lang);
                barkFeedbackLabel.ForeColor = FluentTheme.WarningYellow;
            }

            appController.SaveBarkCredential(newEp, resSave =>
            {
                isCommittingBarkEdit = false;
                appController.RefreshStatus();
                bool configured = appController.IsBarkConfigured;
                if (barkStatusLabel != null)
                {
                    barkStatusLabel.Text = configured ? L10n.Tr("bark.status_connected", lang) : L10n.Tr("bark.status_unconfigured", lang);
                    barkStatusLabel.ForeColor = configured ? FluentTheme.PrimaryAccent : FluentTheme.DangerRed;
                }
                if (barkFeedbackLabel != null)
                {
                    barkFeedbackLabel.Text = configured ? L10n.Tr("bark.updated", lang) : L10n.Tr("bark.unconfigured_hint", lang);
                    barkFeedbackLabel.ForeColor = configured ? FluentTheme.PrimaryAccent : FluentTheme.TextMuted;
                }
                barkStatusLight?.Invalidate();

                // Automatically trigger connectivity test push
                if (configured)
                {
                    TriggerTestPush();
                }
            });
        }

        private void TriggerTestPush()
        {
            string lang = appController.Language;
            if (testPushButton != null)
            {
                testPushButton.Text = L10n.Tr("bark.sending", lang);
                testPushButton.Enabled = false;
            }
            appController.RunCli("test --quiet", false, resTest =>
            {
                if (testPushButton != null)
                {
                    testPushButton.Text = L10n.Tr("bark.send_test", lang);
                    testPushButton.Enabled = true;
                }
            });
        }
        #endregion
    }
}
