import Cocoa
import SwiftUI

// MARK: - Window Delegate (orderOut on close)
final class TakeFiveWindowDelegate: NSObject, NSWindowDelegate {
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }
}

// MARK: - Menu Bar Controller & App Delegate
final class TakeFiveMenuBarApp: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var statusMenu: NSMenu = NSMenu()
    var mainWindow: NSWindow?
    let windowDelegate = TakeFiveWindowDelegate()
    let appState = AppState()
    let cliRunner = CliRunner.shared

    var fileMonitorSource: DispatchSourceFileSystemObject?
    var fileDescriptor: Int32 = -1
    var refreshDebounceWorkItem: DispatchWorkItem?
    let fileManager = FileManager.default

    var embeddedRuntimeDir: String? { cliRunner.embeddedRuntimeDir }
    var embeddedNodePath: String? { cliRunner.embeddedNodePath }
    var cliPath: String? { cliRunner.cliPath }
    var configPath: String { cliRunner.configPath }
    var launchAgentPlistPath: String { cliRunner.launchAgentPlistPath }

    func executeCli(args: [String]) -> CliResult {
        return cliRunner.executeCli(args: args)
    }

    @discardableResult
    func runCli(args: [String]) -> String? {
        return cliRunner.runCli(args: args)
    }

    func fallbackLocalConfigRead() {
        cliRunner.fallbackLocalConfigRead(state: appState)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        setupSystemEditMenu()
        setupStatusItem()
        setupMainWindow()
        refreshStatus()
        startFileWatcher()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self else { return }
            self.appState.viewMode = .dashboard
            if !self.appState.isBarkConfigured {
                self.showMainWindow()
            }
        }
    }

    private func setupSystemEditMenu() {
        let mainMenu = NSMenu()
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")

        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redoItem = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(redoItem)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)
        NSApp.mainMenu = mainMenu
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopFileWatcher()
    }

    // MARK: - Window Management
    func setupMainWindow() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 580, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.isReleasedWhenClosed = false
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "片刻"
        window.isMovableByWindowBackground = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.level = .floating
        window.delegate = windowDelegate

        let rootView = TakeFiveAppView(
            state: appState,
            onToggleAgent: { [weak self] agentId, enabled in
                self?.toggleAgent(id: agentId, enabled: enabled)
            },
            onToggleAll: { [weak self] enable in
                self?.toggleAllAgents(enable: enable)
            },
            onSendTest: { [weak self] in
                self?.sendTestPush()
            },
            onUpdateEventRule: { [weak self] eventType, level in
                self?.updateEventRule(eventType: eventType, level: level)
            },
            onToggleAutostart: { [weak self] enable in
                self?.toggleAutostart(enable: enable)
            },
            onChangeLanguage: { [weak self] newLang in
                self?.changeLanguage(newLang)
            },
            onOpenOnboarding: { [weak self] in
                self?.appState.viewMode = .onboarding(step: 1)
                self?.showMainWindow()
            },
            onOpenTerminalConfig: { [weak self] in
                self?.openTerminalConfig()
            },
            onRefresh: { [weak self] in
                self?.refreshStatus()
            },
            onTestBark: { [weak self] url in
                self?.testBarkConnectivity(url: url)
            },
            onUpdateBarkUrl: { [weak self] url in
                self?.updateBarkUrl(url)
            },
            onFinishOnboarding: { [weak self] in
                self?.finishOnboarding()
            },
            onDismissOnboarding: { [weak self] in
                self?.appState.viewMode = .dashboard
            }
        )

        window.contentViewController = NSHostingController(rootView: rootView)
        self.mainWindow = window
    }

    @objc func showMainWindow() {
        guard let win = mainWindow else { return }
        NSApp.activate(ignoringOtherApps: true)
        win.makeKeyAndOrderFront(nil)
    }

    // MARK: - Status Bar Item & Menu
    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.target = self
            button.action = #selector(statusItemClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        updateStatusIcon()
        setupMenu()
    }

    func updateStatusIcon() {
        guard let button = statusItem.button else { return }

        let size = NSSize(width: 18, height: 18)
        let isConfigured = appState.isBarkConfigured
        let isAllMuted = appState.isAllDisabled
        let lang = appState.activeLanguage

        let symbolName: String
        if !isConfigured {
            symbolName = "bell.badge.fill"
        } else if isAllMuted {
            symbolName = "bell.slash.fill"
        } else {
            symbolName = "bell.fill"
        }

        let image = NSImage(size: size, flipped: false) { rect in
            if let symbol = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil) {
                let symSize = symbol.size
                let maxDim: CGFloat = 15.0
                let scale = min(maxDim / symSize.width, maxDim / symSize.height)
                let targetWidth = symSize.width * scale
                let targetHeight = symSize.height * scale
                let destRect = NSRect(
                    x: (rect.width - targetWidth) / 2.0,
                    y: (rect.height - targetHeight) / 2.0,
                    width: targetWidth,
                    height: targetHeight
                )
                symbol.draw(in: destRect)
                return true
            }

            // Fallback: draw 18x18 monochrome vector template bell with NSBezierPath
            NSColor.black.setFill()
            NSColor.black.setStroke()

            let dome = NSBezierPath()
            dome.move(to: NSPoint(x: 5, y: 6))
            dome.curve(to: NSPoint(x: 9, y: 14), controlPoint1: NSPoint(x: 5, y: 11), controlPoint2: NSPoint(x: 7, y: 14))
            dome.curve(to: NSPoint(x: 13, y: 6), controlPoint1: NSPoint(x: 11, y: 14), controlPoint2: NSPoint(x: 13, y: 11))
            dome.close()
            dome.fill()

            let rim = NSBezierPath(roundedRect: NSRect(x: 4, y: 4.5, width: 10, height: 2), xRadius: 1, yRadius: 1)
            rim.fill()

            let clapper = NSBezierPath(ovalIn: NSRect(x: 7.5, y: 3, width: 3, height: 3))
            clapper.fill()

            if !isConfigured {
                let dot = NSBezierPath(ovalIn: NSRect(x: 12.5, y: 11.5, width: 4, height: 4))
                dot.fill()
            } else if isAllMuted {
                let slash = NSBezierPath()
                slash.move(to: NSPoint(x: 3.5, y: 14.5))
                slash.line(to: NSPoint(x: 14.5, y: 3.5))
                slash.lineWidth = 1.6
                slash.stroke()
            }
            return true
        }

        image.isTemplate = true
        button.image = image
        button.toolTip = isConfigured
            ? (isAllMuted ? L10n.tr("tip.muted", lang: lang) : L10n.tr("tip.monitoring", lang: lang))
            : L10n.tr("tip.unconfigured", lang: lang)
    }

    func setupMenu() {
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        let lang = appState.activeLanguage

        let dashItem = NSMenuItem(title: L10n.tr("menu.open_dash", lang: lang), action: #selector(showMainWindow), keyEquivalent: "o")
        dashItem.target = self
        menu.addItem(dashItem)

        menu.addItem(NSMenuItem.separator())

        let masterTitle: String
        if appState.isAllEnabled {
            masterTitle = L10n.tr("menu.notifications_active", lang: lang)
        } else if appState.isAllDisabled {
            masterTitle = L10n.tr("menu.notifications_muted", lang: lang)
        } else {
            masterTitle = L10n.tr("menu.notifications_partial", lang: lang)
        }

        let masterItem = NSMenuItem(title: masterTitle, action: #selector(toggleAllMenuAction), keyEquivalent: "")
        masterItem.target = self
        menu.addItem(masterItem)

        menu.addItem(NSMenuItem.separator())

        let quitItem = NSMenuItem(title: L10n.tr("menu.quit", lang: lang), action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        self.statusMenu = menu
    }

    func menuDidClose(_ menu: NSMenu) {
        statusItem.menu = nil
    }

    @objc func statusItemClicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else {
            showMainWindow()
            return
        }
        if event.type == .rightMouseUp || (event.type == .leftMouseUp && event.modifierFlags.contains(.control)) {
            statusItem.menu = statusMenu
            statusItem.button?.performClick(nil)
        } else {
            if let win = mainWindow, win.isVisible && win.isKeyWindow {
                win.orderOut(nil)
            } else {
                showMainWindow()
            }
        }
    }
}
