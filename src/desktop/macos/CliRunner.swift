import Foundation

// MARK: - CLI Runner and Runtime Discovery
final class CliRunner {
    static let shared = CliRunner()
    private let fileManager = FileManager.default

    var embeddedRuntimeDir: String? {
        if let custom = ProcessInfo.processInfo.environment["TAKEFIVE_RUNTIME_DIR"], fileManager.fileExists(atPath: custom) {
            return custom
        }
        if let res = Bundle.main.resourcePath {
            let r = (res as NSString).appendingPathComponent("runtime")
            if fileManager.fileExists(atPath: r) { return r }
        }
        if let exec = CommandLine.arguments.first {
            let execDir = (exec as NSString).deletingLastPathComponent
            let bundleRes = ((execDir as NSString).deletingLastPathComponent as NSString).appendingPathComponent("Resources/runtime")
            if fileManager.fileExists(atPath: bundleRes) { return bundleRes }
        }
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        let localRuntime = (home as NSString).appendingPathComponent(".takefive/app")
        if fileManager.fileExists(atPath: localRuntime) { return localRuntime }
        return nil
    }

    var embeddedNodePath: String? {
        if let custom = ProcessInfo.processInfo.environment["TAKEFIVE_NODE_PATH"], fileManager.isExecutableFile(atPath: custom) {
            return custom
        }
        if let r = embeddedRuntimeDir {
            let candidates = [
                (r as NSString).appendingPathComponent("bin/node"),
                (r as NSString).appendingPathComponent("node")
            ]
            for candidate in candidates {
                if fileManager.isExecutableFile(atPath: candidate) {
                    return candidate
                }
            }
        }
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        let sysCandidates = [
            (home as NSString).appendingPathComponent(".local/node/bin/node"),
            (home as NSString).appendingPathComponent(".local/bin/node"),
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node"
        ]
        for candidate in sysCandidates {
            if fileManager.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }

        let nvmDir = (home as NSString).appendingPathComponent(".nvm/versions/node")
        if let versions = try? fileManager.contentsOfDirectory(atPath: nvmDir) {
            for v in versions.sorted().reversed() {
                let p = (nvmDir as NSString).appendingPathComponent("\(v)/bin/node")
                if fileManager.isExecutableFile(atPath: p) {
                    return p
                }
            }
        }

        let fnmPath = (home as NSString).appendingPathComponent(".local/share/fnm/current/bin/node")
        if fileManager.isExecutableFile(atPath: fnmPath) { return fnmPath }
        let asdfPath = (home as NSString).appendingPathComponent(".asdf/shims/node")
        if fileManager.isExecutableFile(atPath: asdfPath) { return asdfPath }

        let shellProc = Process()
        let pipe = Pipe()
        shellProc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        shellProc.arguments = ["-l", "-c", "which node"]
        shellProc.standardOutput = pipe
        shellProc.standardError = FileHandle.nullDevice
        if let _ = try? shellProc.run() {
            shellProc.waitUntilExit()
            if shellProc.terminationStatus == 0 {
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   fileManager.isExecutableFile(atPath: path) {
                    return path
                }
            }
        }

        return nil
    }

    var cliPath: String? {
        if let custom = ProcessInfo.processInfo.environment["TAKEFIVE_CLI_PATH"], fileManager.isExecutableFile(atPath: custom) {
            return custom
        }
        if let r = embeddedRuntimeDir {
            let embeddedCandidates = [
                (r as NSString).appendingPathComponent("bin/takefive"),
                (r as NSString).appendingPathComponent("dist/cli.js")
            ]
            for candidate in embeddedCandidates {
                if fileManager.fileExists(atPath: candidate) {
                    return candidate
                }
            }
        }
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        let candidates = [
            (home as NSString).appendingPathComponent(".local/bin/takefive"),
            (home as NSString).appendingPathComponent(".takefive/bin/takefive"),
            (home as NSString).appendingPathComponent(".takefive/app/dist/cli.js"),
            "/usr/local/bin/takefive",
            "/opt/homebrew/bin/takefive",
            "./dist/cli.js"
        ]
        for path in candidates {
            if fileManager.isExecutableFile(atPath: path) || fileManager.fileExists(atPath: path) {
                return path
            }
        }
        return nil
    }

    var configPath: String {
        if let custom = ProcessInfo.processInfo.environment["TAKEFIVE_CONFIG_PATH"], !custom.isEmpty {
            return custom
        }
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        return (home as NSString).appendingPathComponent(".takefive/config.json")
    }

    var launchAgentPlistPath: String {
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        return (home as NSString).appendingPathComponent("Library/LaunchAgents/com.takefive.menubar.plist")
    }

    func executeCli(args: [String]) -> CliResult {
        guard let cli = cliPath else {
            return CliResult(success: false, output: "", error: "CLI not found", exitCode: -1)
        }
        let process = Process()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        var environment = ProcessInfo.processInfo.environment
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        var pathComponents: [String] = []

        if let node = embeddedNodePath {
            let nodeDir = (node as NSString).deletingLastPathComponent
            pathComponents.append(nodeDir)
        }
        pathComponents.append((home as NSString).appendingPathComponent(".local/bin"))
        pathComponents.append((home as NSString).appendingPathComponent(".local/node/bin"))
        pathComponents.append("/opt/homebrew/bin")
        pathComponents.append("/usr/local/bin")
        if let currentPath = environment["PATH"], !currentPath.isEmpty {
            pathComponents.append(currentPath)
        } else {
            pathComponents.append("/usr/bin:/bin:/usr/sbin:/sbin")
        }
        environment["PATH"] = pathComponents.joined(separator: ":")
        process.environment = environment

        if cli.hasSuffix(".js") {
            if let node = embeddedNodePath {
                process.executableURL = URL(fileURLWithPath: node)
                process.arguments = [cli] + args
            } else {
                process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
                process.arguments = ["node", cli] + args
            }
        } else {
            process.executableURL = URL(fileURLWithPath: cli)
            process.arguments = args
        }

        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        do {
            try process.run()
            process.waitUntilExit()
            let outData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let errData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
            let stdoutStr = String(data: outData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let stderrStr = String(data: errData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let exitCode = process.terminationStatus
            let success = (exitCode == 0)
            return CliResult(success: success, output: stdoutStr, error: stderrStr, exitCode: exitCode)
        } catch {
            return CliResult(success: false, output: "", error: error.localizedDescription, exitCode: -1)
        }
    }

    @discardableResult
    func runCli(args: [String]) -> String? {
        let res = executeCli(args: args)
        if res.success {
            return res.output
        }
        return nil
    }

    func fallbackLocalConfigRead(state: AppState) {
        let home = ProcessInfo.processInfo.environment["HOME"] ?? NSHomeDirectory()
        let credPath = (home as NSString).appendingPathComponent(".takefive/.credential")

        var detectedBarkUrl: String? = nil
        if let credData = try? Data(contentsOf: URL(fileURLWithPath: credPath)),
           let credJson = try? JSONSerialization.jsonObject(with: credData) as? [String: Any],
           let url = credJson["barkUrl"] as? String, !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            detectedBarkUrl = url.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if detectedBarkUrl == nil {
            let keyProc = Process()
            let keyPipe = Pipe()
            keyProc.executableURL = URL(fileURLWithPath: "/usr/bin/security")
            keyProc.arguments = ["find-generic-password", "-s", "takefive", "-a", "bark_url", "-w"]
            keyProc.standardOutput = keyPipe
            keyProc.standardError = FileHandle.nullDevice
            if let _ = try? keyProc.run() {
                keyProc.waitUntilExit()
                if keyProc.terminationStatus == 0 {
                    let kData = keyPipe.fileHandleForReading.readDataToEndOfFile()
                    if let kUrl = String(data: kData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !kUrl.isEmpty {
                        detectedBarkUrl = kUrl
                    }
                }
            }
        }

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            DispatchQueue.main.async {
                if let url = detectedBarkUrl {
                    state.isBarkConfigured = true
                    state.barkEndpoint = url
                }
                if state.dynamicAgents.isEmpty {
                    state.dynamicAgents = [
                        DynamicAgent(id: "claude", displayName: "Claude Code", enabled: true, detected: true, installed: true),
                        DynamicAgent(id: "codex", displayName: "OpenAI Codex", enabled: true, detected: true, installed: true),
                        DynamicAgent(id: "opencode", displayName: "OpenCode", enabled: true, detected: true, installed: true),
                        DynamicAgent(id: "antigravity", displayName: "Antigravity", enabled: true, detected: true, installed: true)
                    ]
                }
            }
            return
        }

        DispatchQueue.main.async {
            if let url = detectedBarkUrl {
                state.isBarkConfigured = true
                state.barkEndpoint = url
            }
            if let lang = json["language"] as? String {
                state.activeLanguage = lang
            }
            let enabledMap = json["enabledAgents"] as? [String: Bool] ?? [:]
            state.dynamicAgents = [
                DynamicAgent(id: "claude", displayName: "Claude Code", enabled: enabledMap["claude"] ?? true, detected: true, installed: true),
                DynamicAgent(id: "codex", displayName: "OpenAI Codex", enabled: enabledMap["codex"] ?? true, detected: true, installed: true),
                DynamicAgent(id: "opencode", displayName: "OpenCode", enabled: enabledMap["opencode"] ?? true, detected: true, installed: true),
                DynamicAgent(id: "antigravity", displayName: "Antigravity", enabled: enabledMap["antigravity"] ?? true, detected: true, installed: true)
            ]

            if let events = json["events"] as? [String: [String: Any]] {
                for (evt, info) in events {
                    if let lvl = info["level"] as? String {
                        state.eventRules[evt] = lvl
                    }
                }
            }
        }
    }
}
