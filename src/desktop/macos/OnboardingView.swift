import Cocoa
import SwiftUI

// MARK: - Four-Step Onboarding Wizard View
struct OnboardingWizardView: View {
    @ObservedObject var state: AppState
    var onTestBark: (String) -> Void
    var onFinishOnboarding: () -> Void
    var onDismiss: () -> Void

    private var lang: String { state.activeLanguage }

    var body: some View {
        VStack(spacing: 0) {
            // Header Bar with Window Traffic Light Clearance
            HStack {
                Spacer().frame(width: 68)
                Text(L10n.tr("wizard.title", lang: lang))
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.secondary)
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.secondary.opacity(0.8))
                }
                .buttonStyle(.plain)
                .help("跳过向导")
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            // Step Indicator
            HStack(spacing: 8) {
                stepIndicator(step: 1, title: L10n.tr("wizard.step1", lang: lang))
                stepLine(active: currentStep >= 2)
                stepIndicator(step: 2, title: L10n.tr("wizard.step2", lang: lang))
                stepLine(active: currentStep >= 3)
                stepIndicator(step: 3, title: L10n.tr("wizard.step3", lang: lang))
                stepLine(active: currentStep >= 4)
                stepIndicator(step: 4, title: L10n.tr("wizard.step4", lang: lang))
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 10)

            Divider().opacity(0.3)

            // Step Content
            VStack {
                switch currentStep {
                case 1:
                    step1WelcomeView
                case 2:
                    step2BarkView
                case 3:
                    step3AgentView
                default:
                    step4FinishView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
        }
    }

    private var currentStep: Int {
        if case .onboarding(let step) = state.viewMode {
            return step
        }
        return 1
    }

    private func stepIndicator(step: Int, title: String) -> some View {
        let isDone = currentStep > step
        let isCurrent = currentStep == step

        return HStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(isDone ? Color.green : (isCurrent ? Color.blue : Color.secondary.opacity(0.2)))
                    .frame(width: 20, height: 20)
                if isDone {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                } else {
                    Text("\(step)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(isCurrent ? .white : .secondary)
                }
            }
            Text(title)
                .font(.system(size: 11, weight: isCurrent ? .bold : .regular))
                .foregroundColor(isCurrent ? .primary : .secondary)
        }
    }

    private func stepLine(active: Bool) -> some View {
        Rectangle()
            .fill(active ? Color.blue : Color.secondary.opacity(0.2))
            .frame(height: 2)
            .frame(maxWidth: .infinity)
    }

    // Step 1: Welcome
    private var step1WelcomeView: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "cup.and.saucer.fill")
                .font(.system(size: 52))
                .foregroundColor(.blue)
                .padding()
                .background(Circle().fill(Color.blue.opacity(0.12)))

            VStack(spacing: 8) {
                Text(L10n.tr("wizard.hero", lang: lang))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .multilineTextAlignment(.center)
                Text(L10n.tr("wizard.hero_sub", lang: lang))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 10) {
                featureBullet(icon: "bolt.shield.fill", text: L10n.isZh(lang) ? "亚秒级 Bark 推送，多步骤复杂推理保持绝对静音" : "Sub-second Bark push with complex multi-step reasoning kept silent")
                featureBullet(icon: "lock.shield.fill", text: L10n.isZh(lang) ? "终端等待授权或提问时，即刻向手机发送高敏提醒" : "Instant high-priority alerts when agents await input or approval")
                featureBullet(icon: "sparkles", text: L10n.isZh(lang) ? "全面融合 Apple 最新 Liquid Glass 液体磨砂玻璃规范" : "Engineered with Apple Liquid Glass aesthetic standards")
            }
            .padding(16)
            .liquidGlassCard()

            Spacer()

            HStack {
                Spacer()
                Button(action: {
                    state.viewMode = .onboarding(step: 2)
                }) {
                    HStack(spacing: 6) {
                        Text(L10n.tr("wizard.start", lang: lang))
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12))
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue))
                    .foregroundColor(.white)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func featureBullet(icon: String, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(.blue)
                .frame(width: 18)
            Text(text)
                .font(.system(size: 12))
                .foregroundColor(.primary)
            Spacer()
        }
    }

    // Step 2: Bark Setup
    private var step2BarkView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.tr("wizard.bark_title", lang: lang))
                .font(.system(size: 16, weight: .bold, design: .rounded))

            Text(L10n.tr("wizard.bark_desc", lang: lang))
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                Text(L10n.isZh(lang) ? "Bark 服务器或 Key" : "Bark Server or Device Key")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)

                TextField(L10n.isZh(lang) ? "例如: https://api.day.app/YOUR_KEY/ 或 单独密钥" : "e.g., https://api.day.app/YOUR_KEY/ or Key", text: $state.onboardingBarkUrl)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .font(.system(size: 13, design: .monospaced))

                Text(L10n.isZh(lang) ? "支持官方推送服务及任何自建 Bark 服务端。凭证保存在系统级安全存储。" : "Supports official Day.app and custom self-hosted Bark servers.")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            .padding(14)
            .liquidGlassCard()

            HStack(spacing: 12) {
                Button(action: {
                    onTestBark(state.onboardingBarkUrl)
                }) {
                    HStack(spacing: 5) {
                        if state.isTestingPush {
                            ProgressView()
                                .scaleEffect(0.6)
                                .frame(width: 14, height: 14)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 11))
                        }
                        Text(L10n.tr("wizard.test_conn", lang: lang))
                            .font(.system(size: 12, weight: .medium))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.blue.opacity(0.15)))
                    .foregroundColor(.blue)
                }
                .buttonStyle(.plain)
                .disabled(state.isTestingPush || state.onboardingBarkUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if !state.testStatusMessage.isEmpty {
                    Text(state.testStatusMessage)
                        .font(.system(size: 11))
                        .foregroundColor(state.testStatusMessage.contains("失败") || state.testStatusMessage.contains("Failed") ? .red : .green)
                }

                Spacer()
            }

            Spacer()

            HStack {
                Button(action: {
                    state.viewMode = .onboarding(step: 1)
                }) {
                    Text(L10n.tr("wizard.prev", lang: lang))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: {
                    state.viewMode = .onboarding(step: 3)
                }) {
                    HStack(spacing: 6) {
                        Text(L10n.tr("wizard.next", lang: lang))
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12))
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue))
                    .foregroundColor(.white)
                }
                .buttonStyle(.plain)
                .disabled(state.onboardingBarkUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    // Step 3: Agent Detection
    private var step3AgentView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L10n.tr("wizard.agent_title", lang: lang))
                .font(.system(size: 16, weight: .bold, design: .rounded))

            Text(L10n.tr("wizard.agent_desc", lang: lang))
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            VStack(spacing: 10) {
                ForEach(state.dynamicAgents) { agent in
                    HStack {
                        AgentIconView(id: agent.id, isDetected: agent.detected || agent.installed)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(agent.displayName)
                                .font(.system(size: 13, weight: .medium))
                            Text(agent.detected ? (L10n.isZh(lang) ? "已在本机检测到配置文件" : "Config detected on system") : (L10n.isZh(lang) ? "未检测到，随时可通过 CLI 手动开启" : "Not detected; can be enabled later"))
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        Toggle("", isOn: Binding(
                            get: { state.onboardingSelectedAgents[agent.id] ?? agent.enabled },
                            set: { newValue in
                                state.onboardingSelectedAgents[agent.id] = newValue
                            }
                        ))
                        .toggleStyle(SwitchToggleStyle(tint: .blue))
                        .labelsHidden()
                    }
                    if agent.id != state.dynamicAgents.last?.id {
                        Divider().opacity(0.3)
                    }
                }
            }
            .padding(14)
            .liquidGlassCard()

            Spacer()

            HStack {
                Button(action: {
                    state.viewMode = .onboarding(step: 2)
                }) {
                    Text(L10n.tr("wizard.prev", lang: lang))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: {
                    state.viewMode = .onboarding(step: 4)
                }) {
                    HStack(spacing: 6) {
                        Text(L10n.tr("wizard.next", lang: lang))
                            .font(.system(size: 13, weight: .semibold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 12))
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.blue))
                    .foregroundColor(.white)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // Step 4: Finish & Launch
    private var step4FinishView: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 54))
                .foregroundColor(.green)

            VStack(spacing: 6) {
                Text(L10n.tr("wizard.finish_title", lang: lang))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                Text(L10n.tr("wizard.finish_desc", lang: lang))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L10n.tr("preferences.autostart", lang: lang))
                            .font(.system(size: 13, weight: .medium))
                        Text(L10n.isZh(lang) ? "推荐开启，确保 Coding Agent 任何时候都能唤醒推送" : "Recommended: ensures pushes wake up anytime")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Toggle("", isOn: $state.onboardingAutostart)
                        .toggleStyle(SwitchToggleStyle(tint: .blue))
                        .labelsHidden()
                }

                Divider().opacity(0.3)

                HStack(spacing: 8) {
                    Image(systemName: "menubar.arrow.up.rectangle")
                        .font(.system(size: 14))
                        .foregroundColor(.blue)
                    Text(L10n.isZh(lang) ? "关闭窗口仅将其隐藏到菜单栏，后台通知依然持续生效。" : "Closing window hides to menu bar; background pushes remain active.")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
            .padding(16)
            .liquidGlassCard()

            Spacer()

            HStack {
                Button(action: {
                    state.viewMode = .onboarding(step: 3)
                }) {
                    Text(L10n.tr("wizard.prev", lang: lang))
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Button(action: onFinishOnboarding) {
                    HStack(spacing: 6) {
                        if state.isSavingOnboarding {
                            ProgressView()
                                .scaleEffect(0.6)
                                .frame(width: 14, height: 14)
                        }
                        Text(L10n.tr("wizard.finish_btn", lang: lang))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .padding(.horizontal, 22)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.green))
                    .foregroundColor(.white)
                }
                .buttonStyle(.plain)
                .disabled(state.isSavingOnboarding)
            }
        }
    }
}
