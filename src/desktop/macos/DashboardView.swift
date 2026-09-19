import Cocoa
import SwiftUI

// MARK: - Main Dashboard View
struct DashboardView: View {
    @ObservedObject var state: AppState
    var onToggleAgent: (String, Bool) -> Void
    var onToggleAll: (Bool) -> Void
    var onSendTest: () -> Void
    var onUpdateEventRule: (String, String) -> Void
    var onToggleAutostart: (Bool) -> Void
    var onChangeLanguage: (String) -> Void
    var onOpenOnboarding: () -> Void
    var onOpenTerminalConfig: () -> Void
    var onRefresh: () -> Void
    var onUpdateBarkUrl: (String) -> Void

    private var lang: String { state.activeLanguage }

    var body: some View {
        ZStack {
            VStack(spacing: 16) {
                // Header Bar with Window Dragging Space & Traffic Light Clearance
                ZStack {
                    // 1. Mathematically Centered Title + Clickable Version Pill (Bottom Layer)
                    HStack {
                        Spacer()
                        HStack(spacing: 8) {
                            Image(systemName: "bell.badge.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.blue)

                            Text(L10n.tr("app.name", lang: lang))
                                .font(.system(size: 16, weight: .bold, design: .rounded))

                            Button(action: {
                                if let url = URL(string: "https://github.com/XianShengXingGe/Take-Five") {
                                    NSWorkspace.shared.open(url)
                                }
                            }) {
                                HStack(spacing: 3) {
                                    Text(L10n.isZh(lang) ? "\(AppVersion.displayVersion) 版本" : AppVersion.displayVersion)
                                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                    Image(systemName: "arrow.up.right")
                                        .font(.system(size: 8, weight: .semibold))
                                }
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2.5)
                                .background(Capsule().fill(Color.blue.opacity(0.18)))
                                .overlay(Capsule().stroke(Color.blue.opacity(0.35), lineWidth: 0.8))
                                .foregroundColor(.blue)
                            }
                            .buttonStyle(.plain)
                            .onHover { inside in
                                if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            }
                            .help(L10n.tr("header.visit_github", lang: lang))
                        }
                        Spacer()
                    }

                    // 2. Traffic Light Clearance on the left (purely transparent space)
                    HStack {
                        Spacer().frame(width: 68)
                        Spacer()
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)

                ScrollView(.vertical, showsIndicators: true) {
                    VStack(spacing: 14) {
                        // Card 1: Coding Agents Status & Switches
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Label(L10n.tr("agents.title", lang: lang), systemImage: "cpu")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundColor(.primary)

                                Spacer()

                                Button(action: {
                                    onToggleAll(!state.isAllEnabled)
                                }) {
                                    HStack(spacing: 4) {
                                        Image(systemName: state.isAllEnabled ? "bell.fill" : "bell.slash.fill")
                                            .font(.system(size: 11))
                                        Text(state.isAllEnabled ? L10n.tr("agents.mute_all", lang: lang) : L10n.tr("agents.enable_all", lang: lang))
                                            .font(.system(size: 11, weight: .medium))
                                    }
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Capsule().fill(Color.secondary.opacity(0.15)))
                                }
                                .buttonStyle(.plain)
                            }

                            Divider().opacity(0.4)

                            VStack(spacing: 10) {
                                ForEach(state.dynamicAgents) { agent in
                                    HStack {
                                        AgentIconView(id: agent.id, isDetected: agent.detected || agent.installed)

                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack(spacing: 6) {
                                                Text(agent.displayName)
                                                    .font(.system(size: 13, weight: .medium))
                                                if agent.detected {
                                                    Text(L10n.tr("agents.detected", lang: lang))
                                                        .font(.system(size: 9, weight: .semibold))
                                                        .padding(.horizontal, 5)
                                                        .padding(.vertical, 1.5)
                                                        .background(Capsule().fill(Color.green.opacity(0.15)))
                                                        .foregroundColor(.green)
                                                } else {
                                                    Text(L10n.tr("agents.undetected", lang: lang))
                                                        .font(.system(size: 9, weight: .regular))
                                                        .padding(.horizontal, 5)
                                                        .padding(.vertical, 1.5)
                                                        .background(Capsule().fill(Color.secondary.opacity(0.12)))
                                                        .foregroundColor(.secondary)
                                                }
                                            }
                                            Text(agentSubtitle(for: agent.id))
                                                .font(.system(size: 10))
                                                .foregroundColor(.secondary)
                                        }

                                        Spacer()

                                        Toggle("", isOn: Binding(
                                            get: { agent.enabled },
                                            set: { newValue in
                                                onToggleAgent(agent.id, newValue)
                                            }
                                        ))
                                        .toggleStyle(SwitchToggleStyle(tint: .blue))
                                        .labelsHidden()
                                    }
                                    if agent.id != state.dynamicAgents.last?.id {
                                        Divider().opacity(0.2)
                                    }
                                }
                            }
                        }
                        .padding(14)
                        .liquidGlassCard()

                        // Card 2: Unified Notification Rules Matrix (Interactive customization)
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Label(L10n.tr("rules.title", lang: lang), systemImage: "slider.horizontal.3")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundColor(.primary)

                                Spacer()

                                Text(L10n.tr("rules.description", lang: lang))
                                    .font(.system(size: 10.5))
                                    .foregroundColor(.secondary)
                            }

                            Divider().opacity(0.4)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                ruleRow(tag: "task_completed", titleKey: "rules.task_completed", icon: "checkmark.circle.fill", color: Color(red: 0.28, green: 0.56, blue: 0.44))
                                ruleRow(tag: "waiting_permission", titleKey: "rules.waiting_permission", icon: "lock.shield.fill", color: .purple)
                                ruleRow(tag: "waiting_input", titleKey: "rules.waiting_input", icon: "questionmark.circle.fill", color: .orange)
                                ruleRow(tag: "task_failed", titleKey: "rules.task_failed", icon: "xmark.circle.fill", color: Color(red: 0.70, green: 0.36, blue: 0.36))
                            }
                        }
                        .padding(14)
                        .liquidGlassCard()

                        // Card 3: System Preferences & Controls (⚙️ 通用设置) [// Card 4: System Preferences & Controls]
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Label(L10n.tr("preferences.title", lang: lang), systemImage: "gearshape")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundColor(.primary)

                                Spacer()
                            }

                            Divider().opacity(0.4)

                            // 1. Bark Push Service (置顶)
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Label(L10n.tr("bark.title", lang: lang), systemImage: "iphone.radiowaves.left.and.right")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(.primary.opacity(0.85))

                                    Spacer()

                                    HStack(spacing: 6) {
                                        Circle()
                                            .fill(state.isBarkConfigured ? Color.green : Color.orange)
                                            .frame(width: 8, height: 8)
                                        Text(state.isBarkConfigured ? L10n.tr("bark.status_connected", lang: lang) : L10n.tr("bark.status_unconfigured", lang: lang))
                                            .font(.system(size: 11.5, weight: .medium))
                                            .foregroundColor(state.isBarkConfigured ? .green : .orange)
                                    }
                                }

                                if !state.isBarkConfigured {
                                    HStack(spacing: 8) {
                                        Image(systemName: "info.circle.fill")
                                            .font(.system(size: 12))
                                            .foregroundColor(.orange)
                                        Text(L10n.isZh(lang) ? "尚未配置 Bark 推送服务。在下方填入您的 Bark 地址或设备 Key 以开启推送。" : "Bark push service is not configured. Enter your Bark URL or Key below to enable notifications.")
                                            .font(.system(size: 11, weight: .regular))
                                            .foregroundColor(.secondary)
                                            .fixedSize(horizontal: false, vertical: true)
                                        Spacer()
                                    }
                                    .padding(8)
                                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.orange.opacity(0.08)))
                                    .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Color.orange.opacity(0.25), lineWidth: 0.5))
                                }

                                // Wide Permanent Bark Input Row
                                HStack(spacing: 8) {
                                    InlineBarkTextField(
                                        text: $state.editingBarkText,
                                        placeholder: L10n.tr("bark.edit_placeholder", lang: lang),
                                        onCommit: { newValue in
                                            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                                            if !trimmed.isEmpty && trimmed != state.barkEndpoint {
                                                onUpdateBarkUrl(trimmed)
                                            }
                                        },
                                        onCancel: {
                                            state.editingBarkText = state.barkEndpoint
                                        }
                                    )
                                    .frame(minHeight: 28, idealHeight: 30, maxHeight: 32)

                                    // Quick Paste Button
                                    Button(action: {
                                        if let clip = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines), !clip.isEmpty {
                                            state.editingBarkText = clip
                                            if clip != state.barkEndpoint {
                                                onUpdateBarkUrl(clip)
                                            }
                                        }
                                    }) {
                                        HStack(spacing: 4) {
                                            Image(systemName: "doc.on.clipboard")
                                                .font(.system(size: 11))
                                            Text(L10n.isZh(lang) ? "粘贴" : "Paste")
                                                .font(.system(size: 11, weight: .medium))
                                        }
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 5)
                                        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(NSColor.controlBackgroundColor).opacity(0.8)))
                                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Color(NSColor.separatorColor).opacity(0.5), lineWidth: 0.5))
                                        .foregroundColor(.primary)
                                    }
                                    .buttonStyle(.plain)
                                    .help(L10n.isZh(lang) ? "从剪贴板一键粘贴并保存" : "Paste from clipboard and save")

                                    // Quick Clear Button
                                    if !state.editingBarkText.isEmpty {
                                        Button(action: {
                                            state.editingBarkText = ""
                                        }) {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.system(size: 13))
                                                .foregroundColor(.secondary)
                                                .padding(4)
                                        }
                                        .buttonStyle(.plain)
                                        .help(L10n.isZh(lang) ? "清空输入框" : "Clear input")
                                    }

                                    // Send Test Button
                                    Button(action: onSendTest) {
                                        HStack(spacing: 4) {
                                            if state.isTestingPush {
                                                ProgressView()
                                                    .scaleEffect(0.6)
                                                    .frame(width: 14, height: 14)
                                            } else {
                                                Image(systemName: "paperplane.fill")
                                                    .font(.system(size: 11))
                                            }
                                            Text(L10n.tr("bark.send_test", lang: lang))
                                                .font(.system(size: 11.5, weight: .medium))
                                        }
                                        .padding(.horizontal, 9)
                                        .padding(.vertical, 5)
                                        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.blue.opacity(0.15)))
                                        .foregroundColor(.blue)
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(state.isTestingPush)
                                    .help(L10n.tr("bark.send_test", lang: lang))
                                }

                                if !state.testStatusMessage.isEmpty {
                                    Text(state.testStatusMessage)
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                        .transition(.opacity)
                                }
                            }

                            Divider().opacity(0.2)

                            // 2. Launch at login (开机自启)
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(L10n.tr("preferences.autostart", lang: lang))
                                        .font(.system(size: 13, weight: .medium))
                                    Text(L10n.tr("preferences.autostart_desc", lang: lang))
                                        .font(.system(size: 11))
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                Toggle("", isOn: Binding(
                                    get: { state.isAutostartEnabled },
                                    set: { newValue in
                                        onToggleAutostart(newValue)
                                    }
                                ))
                                .toggleStyle(SwitchToggleStyle(tint: .blue))
                                .labelsHidden()
                            }

                            Divider().opacity(0.2)

                            // 3. Language Switcher (语言设置)
                            HStack {
                                Text(L10n.tr("preferences.language", lang: lang))
                                    .font(.system(size: 12, weight: .medium))

                                Spacer()

                                LanguageSegmentedControl(activeLang: state.activeLanguage, onSelect: { selected in
                                    onChangeLanguage(selected)
                                })
                            }
                        }
                        .padding(14)
                        .liquidGlassCard()

                        // Card 4: Support & Community [// Card 5: Support & Community]
                        SupportCommunityCard(state: state, onOpenDonate: {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.8)) {
                                state.showDonationModal = true
                            }
                        })
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                    .onAppear {
                        if state.editingBarkText.isEmpty && !state.barkEndpoint.isEmpty {
                            state.editingBarkText = state.barkEndpoint
                        }
                    }
                    .onReceive(state.$barkEndpoint) { newEndpoint in
                        if !newEndpoint.isEmpty {
                            state.editingBarkText = newEndpoint
                        }
                    }
                }
            }

            // Modal Overlay
            if state.showDonationModal {
                DonationModalView(state: state)
                    .transition(.opacity)
            }
        }
    }

    private func agentSubtitle(for id: String) -> String {
        return L10n.tr("agents.desc.\(id)", lang: lang)
    }

    private func ruleRow(tag: String, titleKey: String, icon: String, color: Color) -> some View {
        let currentLvl = state.eventRules[tag] ?? (tag == "task_completed" ? "active" : "timeSensitive")
        return HStack(spacing: 6) {
            Image(systemName: icon)
                .foregroundColor(color)
                .font(.system(size: 13))

            Text(L10n.tr(titleKey, lang: lang))
                .font(.system(size: 11, weight: .medium))
                .lineLimit(1)

            Spacer()

            RuleLevelSegmentedPicker(tag: tag, currentLevel: currentLvl, lang: lang, onSelect: { newLvl in
                onUpdateEventRule(tag, newLvl)
            })
        }
        .padding(7)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(NSColor.controlBackgroundColor).opacity(0.6)))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Color(NSColor.separatorColor).opacity(0.4), lineWidth: 0.5))
    }
}
