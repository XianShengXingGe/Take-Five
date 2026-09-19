import Cocoa
import SwiftUI

// MARK: - Coding Agent Real Icon View
struct AgentIconView: View {
    let id: String
    var isDetected: Bool = true

    var body: some View {
        Group {
            if let img = loadAssetImage(named: "\(id).png") {
                Image(nsImage: img)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .stroke(Color(NSColor.separatorColor), lineWidth: 1.0)
                    )
                    .grayscale(isDetected ? 0.0 : 1.0)
                    .opacity(isDetected ? 1.0 : 0.55)
            } else {
                Image(systemName: fallbackSymbol(for: id))
                    .font(.system(size: 15))
                    .frame(width: 24, height: 24)
                    .foregroundColor(isDetected ? .primary : .secondary)
            }
        }
    }

    private func fallbackSymbol(for id: String) -> String {
        switch id {
        case "codex": return "chevron.left.forwardslash.chevron.right"
        case "antigravity": return "sparkles"
        case "claude": return "bubble.left.and.bubble.right.fill"
        case "opencode": return "curlybraces"
        default: return "cpu"
        }
    }
}

// MARK: - Rule Level Segmented Pill Selector
struct RuleLevelSegmentedPicker: View {
    let tag: String
    let currentLevel: String
    let lang: String
    var onSelect: (String) -> Void
    @Namespace private var segmentAnimation

    var body: some View {
        HStack(spacing: 2) {
            segmentButton(title: L10n.tr("rules.level_active", lang: lang), level: "active")
            segmentButton(title: L10n.tr("rules.level_timeSensitive", lang: lang), level: "timeSensitive")
        }
        .padding(2)
        .background(
            Capsule()
                .fill(Color.secondary.opacity(0.12))
        )
    }

    private func segmentButton(title: String, level: String) -> some View {
        let isSelected = currentLevel == level
        return Button(action: {
            if !isSelected {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
                    onSelect(level)
                }
            }
        }) {
            Text(title)
                .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    ZStack {
                        if isSelected {
                            Capsule()
                                .fill(
                                    level == "timeSensitive"
                                        ? LinearGradient(colors: [Color(red: 0.70, green: 0.34, blue: 0.34), Color(red: 0.58, green: 0.25, blue: 0.26)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                        : LinearGradient(colors: [Color(red: 0.25, green: 0.52, blue: 0.42), Color(red: 0.18, green: 0.42, blue: 0.33)], startPoint: .topLeading, endPoint: .bottomTrailing)
                                )
                                .matchedGeometryEffect(id: "activePill_\(tag)", in: segmentAnimation)
                                .shadow(
                                    color: (level == "timeSensitive" ? Color(red: 0.65, green: 0.30, blue: 0.30) : Color(red: 0.20, green: 0.48, blue: 0.38)).opacity(0.25),
                                    radius: 3,
                                    x: 0,
                                    y: 1
                                )
                        }
                    }
                )
                .foregroundColor(isSelected ? .white : .secondary)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Language Segmented Control (3 Options)
struct LanguageSegmentedControl: View {
    let activeLang: String
    var onSelect: (String) -> Void

    var body: some View {
        HStack(spacing: 3) {
            langButton(title: "跟随系统", langCode: "system")
            langButton(title: "简体中文", langCode: "zh-CN")
            langButton(title: "English", langCode: "en")
        }
        .padding(3)
        .background(Capsule().fill(Color.secondary.opacity(0.12)))
    }

    private func langButton(title: String, langCode: String) -> some View {
        let isSelected = activeLang == langCode
        return Button(action: {
            if !isSelected { onSelect(langCode) }
        }) {
            Text(title)
                .font(.system(size: 10.5, weight: isSelected ? .semibold : .regular))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.blue : Color.clear)
                )
                .foregroundColor(isSelected ? .white : .secondary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Social Link Row View (Aligned with 简贴)
struct SocialLinkRow: View {
    let item: SocialLinkItem
    let lang: String
    @ObservedObject var state: AppState

    private var isCopied: Bool {
        state.copiedItemId == item.id
    }

    private var isHovered: Bool {
        state.hoveredSocialId == item.id
    }

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: item.iconSystemName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(item.accentColor)
                    .frame(width: 18, height: 18)

                Text(item.localizedPlatform(lang: lang))
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.primary.opacity(0.85))

                Text(item.displayText)
                    .font(.system(size: 12, weight: .regular, design: .rounded))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer(minLength: 4)

            if let url = item.openURL {
                Button(action: {
                    NSWorkspace.shared.open(url)
                }) {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up.forward.square")
                            .font(.system(size: 11))
                        Text(L10n.isZh(lang) ? "直达" : "Open")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(.primary.opacity(0.75))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .liquidGlassBadge(isCapsule: true)
                }
                .buttonStyle(.plain)
                .help(L10n.isZh(lang) ? "点击打开 \(item.localizedPlatform(lang: lang))" : "Click to open \(item.localizedPlatform(lang: lang))")
            }

            Button(action: copyToClipboard) {
                HStack(spacing: 3) {
                    Image(systemName: isCopied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 11, weight: isCopied ? .bold : .regular))
                    Text(isCopied ? (L10n.isZh(lang) ? "已复制" : "Copied") : (L10n.isZh(lang) ? "复制" : "Copy"))
                        .font(.system(size: 11, weight: isCopied ? .bold : .medium))
                }
                .foregroundColor(isCopied ? .green : .primary.opacity(0.75))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .liquidGlassBadge(isCapsule: true, tintColor: isCopied ? .green : nil)
            }
            .buttonStyle(.plain)
            .help(isCopied ? (L10n.isZh(lang) ? "已复制到剪贴板" : "Copied to clipboard") : (L10n.isZh(lang) ? "复制 \(item.copyValue)" : "Copy \(item.copyValue)"))
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .liquidGlassRow(cornerRadius: 10, isHovered: isHovered)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                state.hoveredSocialId = hovering ? item.id : ""
            }
        }
    }

    private func copyToClipboard() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(item.copyValue, forType: .string)

        withAnimation(.easeInOut(duration: 0.15)) {
            state.copiedItemId = item.id
            state.copiedMessage = "✅ \(item.copyValue) " + L10n.tr("support.copied", lang: lang)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation(.easeInOut(duration: 0.2)) {
                if state.copiedItemId == item.id {
                    state.copiedItemId = ""
                }
                state.copiedMessage = ""
            }
        }
    }
}

// MARK: - Accessory-Aware Bark NSTextField Subclass
final class AccessoryBarkTextField: NSTextField {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if event.modifierFlags.contains(.command) {
            let chars = event.charactersIgnoringModifiers?.lowercased()
            switch chars {
            case "v":
                if let editor = currentEditor() as? NSTextView {
                    editor.paste(nil)
                    return true
                } else if NSApp.sendAction(#selector(NSText.paste(_:)), to: nil, from: self) {
                    return true
                } else if let clip = NSPasteboard.general.string(forType: .string) {
                    self.stringValue = clip
                    NotificationCenter.default.post(name: NSControl.textDidChangeNotification, object: self)
                    return true
                }
            case "c":
                if let editor = currentEditor() as? NSTextView {
                    editor.copy(nil)
                    return true
                } else if NSApp.sendAction(#selector(NSText.copy(_:)), to: nil, from: self) {
                    return true
                }
            case "x":
                if let editor = currentEditor() as? NSTextView {
                    editor.cut(nil)
                    return true
                } else if NSApp.sendAction(#selector(NSText.cut(_:)), to: nil, from: self) {
                    return true
                }
            case "a":
                if let editor = currentEditor() as? NSTextView {
                    editor.selectAll(nil)
                    return true
                } else if NSApp.sendAction(#selector(NSText.selectAll(_:)), to: nil, from: self) {
                    return true
                }
            case "z":
                if event.modifierFlags.contains(.shift) {
                    if NSApp.sendAction(Selector(("redo:")), to: nil, from: self) {
                        return true
                    }
                } else {
                    if NSApp.sendAction(Selector(("undo:")), to: nil, from: self) {
                        return true
                    }
                }
            default:
                break
            }
        }
        return super.performKeyEquivalent(with: event)
    }

    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu()
        menu.addItem(withTitle: "剪切 (Cut)", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        menu.addItem(withTitle: "复制 (Copy)", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        menu.addItem(withTitle: "粘贴 (Paste)", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "全选 (Select All)", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }
}

// MARK: - Inline Bark Seamless TextField (Ticket 03)
struct InlineBarkTextField: NSViewRepresentable {
    @Binding var text: String
    var placeholder: String = ""
    var onCommit: (String) -> Void
    var onCancel: () -> Void

    class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: InlineBarkTextField
        var didFinish = false

        init(_ parent: InlineBarkTextField) {
            self.parent = parent
        }

        func controlTextDidChange(_ obj: Notification) {
            if let textField = obj.object as? NSTextField {
                parent.text = textField.stringValue
            }
        }

        func controlTextDidEndEditing(_ obj: Notification) {
            if !didFinish {
                didFinish = true
                if let textField = obj.object as? NSTextField {
                    parent.onCommit(textField.stringValue)
                }
            }
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.cancelOperation(_:)) {
                didFinish = true
                parent.onCancel()
                return true
            } else if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                didFinish = true
                parent.onCommit(textView.string)
                return true
            }
            return false
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSTextField {
        let textField = AccessoryBarkTextField()
        textField.stringValue = text
        textField.placeholderString = placeholder
        textField.delegate = context.coordinator
        textField.isBordered = true
        textField.bezelStyle = .roundedBezel
        textField.focusRingType = .exterior
        textField.font = .monospacedSystemFont(ofSize: 12, weight: .medium)
        textField.maximumNumberOfLines = 1
        DispatchQueue.main.async {
            textField.currentEditor()?.selectAll(nil)
        }
        return textField
    }

    func updateNSView(_ nsView: NSTextField, context: Context) {
        context.coordinator.parent = self
        if nsView.stringValue != text && !(nsView.currentEditor() != nil) {
            nsView.stringValue = text
        }
        nsView.placeholderString = placeholder
    }
}

