import Cocoa
import SwiftUI
import Foundation

// MARK: - Asset Image Loader Helper
func loadAssetImage(named name: String) -> NSImage? {
    if let path = Bundle.main.path(forResource: name, ofType: nil),
       let img = NSImage(contentsOfFile: path) {
        return img
    }
    if let res = Bundle.main.resourcePath {
        let candidates = [
            (res as NSString).appendingPathComponent(name),
            (res as NSString).appendingPathComponent("runtime/assets/\(name)"),
            (res as NSString).appendingPathComponent("runtime/assets/icons/\(name)"),
            (res as NSString).appendingPathComponent("assets/\(name)"),
            (res as NSString).appendingPathComponent("assets/icons/\(name)")
        ]
        for c in candidates {
            if let img = NSImage(contentsOfFile: c) { return img }
        }
    }
    if let exec = CommandLine.arguments.first {
        let execDir = (exec as NSString).deletingLastPathComponent
        let candidates = [
            (execDir as NSString).appendingPathComponent("../Resources/assets/\(name)"),
            (execDir as NSString).appendingPathComponent("../Resources/assets/icons/\(name)"),
            (execDir as NSString).appendingPathComponent("assets/\(name)"),
            (execDir as NSString).appendingPathComponent("assets/icons/\(name)"),
            (execDir as NSString).appendingPathComponent("../assets/\(name)"),
            (execDir as NSString).appendingPathComponent("../assets/icons/\(name)")
        ]
        for c in candidates {
            if let img = NSImage(contentsOfFile: c) { return img }
        }
    }
    let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
    let candidates = [
        (home as NSString).appendingPathComponent(".takefive/app/runtime/assets/\(name)"),
        (home as NSString).appendingPathComponent(".takefive/app/runtime/assets/icons/\(name)"),
        (home as NSString).appendingPathComponent(".takefive/app/assets/\(name)"),
        (home as NSString).appendingPathComponent(".takefive/app/assets/icons/\(name)")
    ]
    for c in candidates {
        if let img = NSImage(contentsOfFile: c) { return img }
    }
    let cwd = FileManager.default.currentDirectoryPath
    let cwdCandidates = [
        (cwd as NSString).appendingPathComponent("assets/\(name)"),
        (cwd as NSString).appendingPathComponent("assets/icons/\(name)"),
        (cwd as NSString).appendingPathComponent("../assets/\(name)"),
        (cwd as NSString).appendingPathComponent("../assets/icons/\(name)")
    ]
    for c in cwdCandidates {
        if let img = NSImage(contentsOfFile: c) { return img }
    }
    return nil
}

// MARK: - HIG Dynamic Color System
extension Color {
    static let higWindowBackground = Color(NSColor.windowBackgroundColor)
    static let higControlBackground = Color(NSColor.controlBackgroundColor)
    static let higCardBackground = Color(NSColor.controlBackgroundColor)
    static let higSeparator = Color(NSColor.separatorColor)
    static let higBorder = Color(NSColor.separatorColor)
    static let higLabel = Color(NSColor.labelColor)
    static let higSecondaryLabel = Color(NSColor.secondaryLabelColor)
    static let higTertiaryLabel = Color(NSColor.tertiaryLabelColor)
    static let higQuaternaryLabel = Color(NSColor.quaternaryLabelColor)
    static let higControlAccent = Color(NSColor.controlAccentColor)
}

// MARK: - Native Visual Effects (Apple HIG Material)
struct LiquidGlassBackground: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .underWindowBackground
    var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow
    var state: NSVisualEffectView.State = .active

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = state
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
        nsView.state = state
    }
}

// MARK: - Apple HIG Dynamic Card Modifier
struct LiquidGlassCardModifier: ViewModifier {
    @Environment(\.colorScheme) var colorScheme

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color(NSColor.controlBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(Color(NSColor.separatorColor), lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.2 : 0.05), radius: 3, x: 0, y: 1)
    }
}

extension View {
    func liquidGlassCard() -> some View {
        self.modifier(LiquidGlassCardModifier())
    }

    func liquidGlassBadge(isCapsule: Bool = true, tintColor: Color? = nil) -> some View {
        self
            .background(
                Capsule(style: .continuous)
                    .fill((tintColor ?? Color(NSColor.controlAccentColor)).opacity(0.12))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke((tintColor ?? Color(NSColor.controlAccentColor)).opacity(0.25), lineWidth: 0.5)
            )
    }

    func liquidGlassRow(cornerRadius: CGFloat = 8, isHovered: Bool = false) -> some View {
        self
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(isHovered ? Color(NSColor.selectedControlColor).opacity(0.12) : Color(NSColor.controlBackgroundColor).opacity(0.5))
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(isHovered ? Color(NSColor.selectedControlColor).opacity(0.3) : Color(NSColor.separatorColor).opacity(0.35), lineWidth: 0.5)
            )
    }
}

