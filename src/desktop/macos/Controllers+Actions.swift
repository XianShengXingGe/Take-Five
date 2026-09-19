import Cocoa
import SwiftUI

// MARK: - Actions, Synchronization & File Watcher Extensions
extension TakeFiveMenuBarApp {
    // MARK: - CLI Status Refresh & Synchronization
    func refreshStatus() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            if let jsonString = self.runCli(args: ["status", "--json"]),
               let data = jsonString.data(using: .utf8),
               let report = try? JSONDecoder().decode(CliStatusReport.self, from: data) {
                self.applyStatusReport(report)
            } else {
                self.fallbackLocalConfigRead()
            }

            self.checkAutostartStatus()

            DispatchQueue.main.async {
                self.setupMenu()
                self.updateStatusIcon()
            }
        }
    }

    private func applyStatusReport(_ report: CliStatusReport) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.appState.isBarkConfigured = report.bark?.configured ?? false
            let endpoint = report.bark?.endpoint ?? ""
            self.appState.barkEndpoint = endpoint
            if self.appState.editingBarkText.isEmpty && !endpoint.isEmpty {
                self.appState.editingBarkText = endpoint
            }
            self.appState.activeLanguage = report.config?.language ?? "system"

            let enabledMap = report.config?.enabledAgents ?? [:]
            var list: [DynamicAgent] = []
            if let agentsMap = report.agents {
                let sortedKeys = agentsMap.keys.sorted()
                for key in sortedKeys {
                    let info = agentsMap[key]!
                    let isEnabled = enabledMap[key] ?? true
                    list.append(DynamicAgent(
                        id: key,
                        displayName: info.displayName,
                        enabled: isEnabled,
                        detected: info.detected ?? false,
                        installed: info.installed ?? false
                    ))
                }
            }
            if !list.isEmpty {
                self.appState.dynamicAgents = list
            }

            if let events = report.config?.events {
                for (evt, info) in events {
                    if let lvl = info.level {
                        self.appState.eventRules[evt] = lvl
                    }
                }
            }
        }
    }

    // MARK: - Actions
    func toggleAgent(id: String, enabled: Bool) {
        if let idx = appState.dynamicAgents.firstIndex(where: { $0.id == id }) {
            appState.dynamicAgents[idx].enabled = enabled
        }
        updateStatusIcon()
        setupMenu()

        let cmd = enabled ? "enable" : "disable"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runCli(args: [cmd, id, "--quiet"])
            self?.refreshStatus()
        }
    }

    func toggleAllAgents(enable: Bool) {
        for idx in 0..<appState.dynamicAgents.count {
            appState.dynamicAgents[idx].enabled = enable
        }
        updateStatusIcon()
        setupMenu()

        let cmd = enable ? "enable" : "disable"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runCli(args: [cmd, "--all", "--quiet"])
            self?.refreshStatus()
        }
    }

    @objc func toggleAllMenuAction() {
        toggleAllAgents(enable: !appState.isAllEnabled)
    }

    @objc func toggleAgentMenuAction(_ sender: NSMenuItem) {
        guard let agentId = sender.representedObject as? String else { return }
        let targetState = sender.state != .on
        toggleAgent(id: agentId, enabled: targetState)
    }

    func updateEventRule(eventType: String, level: String) {
        appState.eventRules[eventType] = level
        saveEventRuleToLocalConfig(eventType: eventType, level: level)
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runCli(args: ["config", "--event", eventType, "--level", level, "--quiet"])
            self?.refreshStatus()
        }
    }

    private func saveEventRuleToLocalConfig(eventType: String, level: String) {
        let path = configPath
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              var json = (try? JSONSerialization.jsonObject(with: data, options: .mutableContainers)) as? [String: Any] else {
            return
        }
        var events = json["events"] as? [String: [String: Any]] ?? [:]
        var eventObj = events[eventType] ?? ["enabled": true]
        eventObj["level"] = level
        events[eventType] = eventObj
        json["events"] = events
        if let outputData = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) {
            try? outputData.write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }

    func changeLanguage(_ newLang: String) {
        appState.activeLanguage = newLang
        setupMenu()
        updateStatusIcon()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.runCli(args: ["config", "--language", newLang, "--quiet"])
            self?.refreshStatus()
        }
    }

    @objc func sendTestPush() {
        sendTestPush(initialMessage: nil)
    }

    func sendTestPush(initialMessage: String? = nil) {
        let lang = appState.activeLanguage
        appState.isTestingPush = true
        appState.testStatusMessage = initialMessage ?? L10n.tr("bark.testing", lang: lang)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let result = self.executeCli(args: ["test"])
            DispatchQueue.main.async {
                self.appState.isTestingPush = false
                if result.success && (result.output.contains("dispatched successfully") || result.output.contains("✔")) {
                    self.appState.testStatusMessage = L10n.tr("bark.test_success", lang: lang)
                } else {
                    self.appState.testStatusMessage = L10n.tr("bark.test_fail", lang: lang) + result.firstErrorMessage
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
                    self.appState.testStatusMessage = ""
                }
            }
        }
    }

    func testBarkConnectivity(url: String) {
        let lang = appState.activeLanguage
        appState.isTestingPush = true
        appState.testStatusMessage = L10n.tr("bark.testing", lang: lang)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let trimmed = url.trimmingCharacters(in: .whitespacesAndNewlines)
            let result = self.executeCli(args: ["test", "--url", trimmed])

            DispatchQueue.main.async {
                self.appState.isTestingPush = false
                if result.success && (result.output.contains("dispatched successfully") || result.output.contains("✔")) {
                    self.appState.testStatusMessage = L10n.tr("bark.test_success", lang: lang)
                } else {
                    self.appState.testStatusMessage = L10n.tr("bark.test_fail", lang: lang) + result.firstErrorMessage
                }
            }
        }
    }

    func updateBarkUrl(_ newUrl: String) {
        let trimmed = newUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if trimmed == appState.barkEndpoint { return }

        let lang = appState.activeLanguage
        appState.testStatusMessage = L10n.tr("bark.updating", lang: lang)

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let result = self.executeCli(args: ["config", "--bark-url", trimmed, "--quiet"])

            DispatchQueue.main.async {
                if result.success {
                    self.appState.barkEndpoint = trimmed
                    self.appState.editingBarkText = trimmed
                    self.appState.isBarkConfigured = true
                    self.refreshStatus()
                    self.sendTestPush(initialMessage: L10n.tr("bark.updated", lang: lang))
                } else {
                    self.appState.testStatusMessage = L10n.tr("bark.update_failed", lang: lang) + ": " + result.firstErrorMessage
                    DispatchQueue.main.asyncAfter(deadline: .now() + 4.0) {
                        self.appState.testStatusMessage = ""
                    }
                }
            }
        }
    }

    func finishOnboarding() {
        appState.isSavingOnboarding = true

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let barkUrl = self.appState.onboardingBarkUrl.trimmingCharacters(in: .whitespacesAndNewlines)

            self.runCli(args: ["install", "--bark-url", barkUrl, "--yes"])

            for (agentId, isEnabled) in self.appState.onboardingSelectedAgents {
                self.runCli(args: [isEnabled ? "enable" : "disable", agentId, "--quiet"])
            }

            if self.appState.onboardingAutostart {
                self.toggleAutostart(enable: true)
            }

            DispatchQueue.main.async {
                self.appState.isSavingOnboarding = false
                self.appState.viewMode = .dashboard
                self.refreshStatus()
            }
        }
    }

    // MARK: - Autostart Management
    func checkAutostartStatus() {
        let exists = fileManager.fileExists(atPath: launchAgentPlistPath)
        DispatchQueue.main.async { [weak self] in
            self?.appState.isAutostartEnabled = exists
        }
    }

    func toggleAutostart(enable: Bool) {
        appState.isAutostartEnabled = enable

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
            let launchDir = (home as NSString).appendingPathComponent("Library/LaunchAgents")
            let plistPath = self.launchAgentPlistPath

            if enable {
                try? self.fileManager.createDirectory(atPath: launchDir, withIntermediateDirectories: true, attributes: nil)
                let execPath = ProcessInfo.processInfo.arguments.first ?? "/usr/local/bin/takefive"
                let plistContent = """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                <plist version="1.0">
                <dict>
                    <key>Label</key>
                    <string>com.takefive.menubar</string>
                    <key>ProgramArguments</key>
                    <array>
                        <string>\(execPath)</string>
                    </array>
                    <key>RunAtLoad</key>
                    <true/>
                    <key>KeepAlive</key>
                    <false/>
                </dict>
                </plist>
                """
                try? plistContent.write(toFile: plistPath, atomically: true, encoding: .utf8)
            } else {
                try? self.fileManager.removeItem(atPath: plistPath)
            }

            self.runCli(args: ["config", "--autostart", enable ? "true" : "false", "--quiet"])
        }
    }

    @objc func quitApp() {
        NSApp.terminate(nil)
    }

    // MARK: - Terminal Advanced Configuration
    @objc func openTerminalConfig() {
        let terminalScript: String
        if let bin = cliPath, fileManager.isExecutableFile(atPath: bin), !bin.contains("dist/cli.js") {
            terminalScript = "if command -v takefive >/dev/null 2>&1; then takefive config; else '\(bin)' config; fi"
        } else {
            terminalScript = "takefive config"
        }

        let appleScriptSource = """
        tell application "Terminal"
            activate
            do script "\(terminalScript)"
        end tell
        """

        var errorDict: NSDictionary?
        if let script = NSAppleScript(source: appleScriptSource) {
            script.executeAndReturnError(&errorDict)
            if errorDict == nil {
                return
            }
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        proc.arguments = ["-e", appleScriptSource]
        try? proc.run()
    }

    // MARK: - File System Watcher & Debouncer
    func scheduleDebouncedRefresh() {
        refreshDebounceWorkItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.refreshStatus()
        }
        refreshDebounceWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: item)
    }

    func startFileWatcher() {
        stopFileWatcher()

        let dirUrl = URL(fileURLWithPath: configPath).deletingLastPathComponent()
        if !fileManager.fileExists(atPath: dirUrl.path) {
            try? fileManager.createDirectory(at: dirUrl, withIntermediateDirectories: true, attributes: nil)
        }

        if !fileManager.fileExists(atPath: configPath) {
            try? "{}".write(toFile: configPath, atomically: true, encoding: .utf8)
        }

        let fd = open(configPath, O_EVTONLY)
        guard fd >= 0 else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.startFileWatcher()
            }
            return
        }

        fileDescriptor = fd
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .delete, .rename, .attrib, .extend, .link],
            queue: DispatchQueue.main
        )

        source.setEventHandler { [weak self] in
            guard let self = self else { return }
            let events = self.fileMonitorSource?.data ?? []
            if events.contains(.delete) || events.contains(.rename) {
                self.startFileWatcher()
            }
            self.scheduleDebouncedRefresh()
        }

        source.setCancelHandler {
            close(fd)
        }

        fileMonitorSource = source
        source.resume()
    }

    func stopFileWatcher() {
        refreshDebounceWorkItem?.cancel()
        refreshDebounceWorkItem = nil
        fileMonitorSource?.cancel()
        fileMonitorSource = nil
        fileDescriptor = -1
    }
}
