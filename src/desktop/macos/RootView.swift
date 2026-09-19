import Cocoa
import SwiftUI

// MARK: - Root Application View
struct TakeFiveAppView: View {
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
    var onTestBark: (String) -> Void
    var onUpdateBarkUrl: (String) -> Void
    var onFinishOnboarding: () -> Void
    var onDismissOnboarding: () -> Void

    var body: some View {
        ZStack {
            LiquidGlassBackground(material: .underWindowBackground, blendingMode: .behindWindow)
                .ignoresSafeArea()

            Color(NSColor.windowBackgroundColor).opacity(0.75)
                .ignoresSafeArea()

            switch state.viewMode {
            case .dashboard:
                DashboardView(
                    state: state,
                    onToggleAgent: onToggleAgent,
                    onToggleAll: onToggleAll,
                    onSendTest: onSendTest,
                    onUpdateEventRule: onUpdateEventRule,
                    onToggleAutostart: onToggleAutostart,
                    onChangeLanguage: onChangeLanguage,
                    onOpenOnboarding: onOpenOnboarding,
                    onOpenTerminalConfig: onOpenTerminalConfig,
                    onRefresh: onRefresh,
                    onUpdateBarkUrl: onUpdateBarkUrl
                )
            case .onboarding:
                OnboardingWizardView(
                    state: state,
                    onTestBark: onTestBark,
                    onFinishOnboarding: onFinishOnboarding,
                    onDismiss: onDismissOnboarding
                )
            }
        }
        .frame(minWidth: 540, idealWidth: 580, maxWidth: 640, minHeight: 640, idealHeight: 680, maxHeight: 780)
    }
}
