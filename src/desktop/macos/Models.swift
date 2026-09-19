import Foundation
import SwiftUI

// MARK: - Application Version Single Source of Truth
struct AppVersion {
    static let defaultVersion = "0.6.0"
    static var current: String {
        if let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String, !ver.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return ver.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return defaultVersion
    }
    static var displayVersion: String {
        let v = current
        let parts = v.split(separator: ".")
        let base = (parts.count >= 2) ? "\(parts[0]).\(parts[1])" : v
        return base.hasPrefix("v") ? String(base) : "v\(base)"
    }
}

// MARK: - Data Contracts from CLI Status JSON
struct CliStatusReport: Codable {
    struct BarkInfo: Codable {
        let configured: Bool
        let endpoint: String?
        let platform: String?
        let platformSupported: Bool?
    }
    struct AgentInfo: Codable {
        let displayName: String
        let detected: Bool?
        let installed: Bool?
        let configPath: String?
        let backupExists: Bool?
    }
    struct EventRuleInfo: Codable {
        let level: String?
        let sound: String?
        let group: String?
    }
    struct ConfigInfo: Codable {
        let version: String?
        let language: String?
        let debounceSeconds: Double?
        let enabledAgents: [String: Bool]?
        let events: [String: EventRuleInfo]?
        let autostart: Bool?
    }

    let bark: BarkInfo?
    let agents: [String: AgentInfo]?
    let config: ConfigInfo?
}

struct DynamicAgent: Identifiable, Equatable {
    let id: String
    let displayName: String
    var enabled: Bool
    let detected: Bool
    let installed: Bool
}

enum AppViewMode: Equatable {
    case dashboard
    case onboarding(step: Int)
}

struct CliResult {
    let success: Bool
    let output: String
    let error: String
    let exitCode: Int32

    var firstErrorMessage: String {
        let errDetail = !error.isEmpty ? error : (!output.isEmpty ? output : "Unknown error")
        return errDetail.components(separatedBy: .newlines).first ?? "Failed"
    }
}

struct SocialLinkItem: Identifiable, Equatable {
    let id: String
    let platform: String
    let displayText: String
    let iconSystemName: String
    let openURL: URL?
    let copyValue: String

    var accentColor: Color {
        switch id {
        case "xiaohongshu":
            return Color(red: 0.95, green: 0.18, blue: 0.26)
        case "weibo":
            return Color(red: 0.94, green: 0.40, blue: 0.12)
        case "email":
            return Color(red: 0.18, green: 0.54, blue: 0.96)
        default:
            return Color.blue
        }
    }

    func localizedPlatform(lang: String) -> String {
        switch id {
        case "xiaohongshu": return L10n.tr("support.channel_xiaohongshu", lang: lang)
        case "weibo": return L10n.tr("support.channel_weibo", lang: lang)
        case "email": return L10n.tr("support.channel_email", lang: lang)
        default: return platform
        }
    }

    static let standardItems: [SocialLinkItem] = [
        SocialLinkItem(
            id: "xiaohongshu",
            platform: "小红书",
            displayText: "先声行歌",
            iconSystemName: "bookmark.circle.fill",
            openURL: URL(string: "https://www.xiaohongshu.com/search_result?keyword=%E5%85%88%E5%A3%B0%E8%A1%8C%E6%AD%8C"),
            copyValue: "先声行歌"
        ),
        SocialLinkItem(
            id: "weibo",
            platform: "微博",
            displayText: "@先声行歌",
            iconSystemName: "bubble.middle.bottom.fill",
            openURL: URL(string: "https://weibo.com/u/3207903867"),
            copyValue: "https://weibo.com/u/3207903867"
        ),
        SocialLinkItem(
            id: "email",
            platform: "合作邮箱",
            displayText: "xianshengxingge@163.com",
            iconSystemName: "envelope.circle.fill",
            openURL: URL(string: "mailto:xianshengxingge@163.com"),
            copyValue: "xianshengxingge@163.com"
        )
    ]
}

// MARK: - App State (Observable Source of Truth)
final class AppState: ObservableObject {
    @Published var isBarkConfigured: Bool = false
    @Published var barkEndpoint: String = ""
    @Published var activeLanguage: String = "system"
    @Published var dynamicAgents: [DynamicAgent] = []
    @Published var eventRules: [String: String] = [
        "task_completed": "active",
        "waiting_input": "timeSensitive",
        "waiting_permission": "timeSensitive",
        "task_failed": "timeSensitive"
    ]
    @Published var isAutostartEnabled: Bool = false
    @Published var viewMode: AppViewMode = .dashboard
    @Published var isTestingPush: Bool = false
    @Published var testStatusMessage: String = ""
    @Published var onboardingBarkUrl: String = ""
    @Published var onboardingSelectedAgents: [String: Bool] = [:]
    @Published var onboardingAutostart: Bool = true
    @Published var isSavingOnboarding: Bool = false
    @Published var showDonationModal: Bool = false
    @Published var donationChannel: String = "alipay"
    @Published var copiedMessage: String = ""
    @Published var copiedItemId: String = ""
    @Published var hoveredSocialId: String = ""
    @Published var isEditingBark: Bool = false
    @Published var editingBarkText: String = ""
    @Published var isBarkTargetHovered: Bool = false

    var isAllEnabled: Bool {
        guard !dynamicAgents.isEmpty else { return true }
        return dynamicAgents.allSatisfy { $0.enabled }
    }

    var isAllDisabled: Bool {
        guard !dynamicAgents.isEmpty else { return false }
        return dynamicAgents.allSatisfy { !$0.enabled }
    }

    var maskedBarkUrl: String {
        guard !barkEndpoint.isEmpty else { return L10n.tr("bark.status_unconfigured", lang: activeLanguage) }
        guard let url = URL(string: barkEndpoint) else {
            return String(barkEndpoint.prefix(12)) + "..."
        }
        let host = url.host ?? "api.day.app"
        return "\(host)/••••••"
    }
}
