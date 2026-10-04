// Process-level knobs of one Desktop instance: where it keeps its state, which port
// its hub binds, which preferences domain it reads. A normal launch passes none of
// them. Automation (tests, E2E, screenshots) passes them so a run never touches the
// user's real data or collides with a Desktop that is already running.
//
// Arguments (all `--name=value`, except the flags):
//   --annhub-data-dir=PATH        directory of the SQLite store (created if missing)
//   --annhub-port=N               hub port; 0 picks a free one (read it from the ready file)
//   --annhub-defaults-suite=NAME  UserDefaults suite instead of the app's own domain
//   --annhub-ready-file=PATH      JSON written once the hub is listening (automation only)
//   --annhub-no-window            start in the menu bar only (the hub still runs)
//   --annhub-shot=PATH            render the main window to a PNG and exit
//   --annhub-section=NAME         start on today | library | system (screenshots, E2E)
//   --annhub-palette=TEXT         start with the ⌘K palette open on this query (screenshots)
//   --annhub-diagnostics=DIR      SIGUSR1 writes DIR/state.json, SIGUSR2 writes DIR/window.png
//                                 (what a harness reads from a running instance; nothing is sent anywhere)
//   --annhub-demo-seed            fill an EMPTY store with demo fragments (needs --annhub-data-dir)
//   --annhub-no-notifications     never talk to the notification center

import Foundation

public struct DesktopLaunchConfig: Equatable, Sendable {
    public static let defaultPort: UInt16 = 8765
    public static let defaultDirectoryName = "AnnHub"

    public var dataDirectory: URL?
    public var port: UInt16
    public var defaultsSuite: String?
    public var readyFile: URL?
    public var openWindowAtLaunch: Bool
    public var screenshotPath: String?
    public var initialSection: String?
    public var diagnosticsDirectory: URL?
    public var initialPaletteQuery: String?
    public var demoSeed: Bool
    public var notificationsEnabled: Bool

    public init(
        dataDirectory: URL? = nil,
        port: UInt16 = DesktopLaunchConfig.defaultPort,
        defaultsSuite: String? = nil,
        readyFile: URL? = nil,
        openWindowAtLaunch: Bool = true,
        screenshotPath: String? = nil,
        initialSection: String? = nil,
        diagnosticsDirectory: URL? = nil,
        initialPaletteQuery: String? = nil,
        demoSeed: Bool = false,
        notificationsEnabled: Bool = true
    ) {
        self.dataDirectory = dataDirectory
        self.port = port
        self.defaultsSuite = defaultsSuite
        self.readyFile = readyFile
        self.openWindowAtLaunch = openWindowAtLaunch
        self.screenshotPath = screenshotPath
        self.initialSection = initialSection
        self.diagnosticsDirectory = diagnosticsDirectory
        self.initialPaletteQuery = initialPaletteQuery
        self.demoSeed = demoSeed
        self.notificationsEnabled = notificationsEnabled
    }

    /// Demo rows are only ever written into a store the caller pointed at explicitly:
    /// `--annhub-demo-seed` on its own would fill the user's real (empty) store.
    public var demoSeedAllowed: Bool {
        demoSeed && dataDirectory != nil
    }

    /// Where the SQLite file lives: the explicit directory, or the app's own folder in
    /// Application Support.
    public func resolvedDataDirectory(applicationSupport: URL = .applicationSupportDirectory) -> URL {
        dataDirectory ?? applicationSupport.appending(path: Self.defaultDirectoryName)
    }

    public func makeDefaults() -> UserDefaults {
        defaultsSuite.flatMap { UserDefaults(suiteName: $0) } ?? .standard
    }

    public static func parse(_ arguments: [String]) -> DesktopLaunchConfig {
        var config = DesktopLaunchConfig()
        for argument in arguments {
            switch argument {
            case "--annhub-no-window":
                config.openWindowAtLaunch = false
            case "--annhub-demo-seed":
                config.demoSeed = true
            case "--annhub-no-notifications":
                config.notificationsEnabled = false
            default:
                if let value = value(of: "--annhub-data-dir=", in: argument), !value.isEmpty {
                    config.dataDirectory = URL(fileURLWithPath: (value as NSString).expandingTildeInPath)
                } else if let value = value(of: "--annhub-port=", in: argument), let port = UInt16(value) {
                    config.port = port
                } else if let value = value(of: "--annhub-defaults-suite=", in: argument), !value.isEmpty {
                    config.defaultsSuite = value
                } else if let value = value(of: "--annhub-ready-file=", in: argument), !value.isEmpty {
                    config.readyFile = URL(fileURLWithPath: (value as NSString).expandingTildeInPath)
                } else if let value = value(of: "--annhub-shot=", in: argument), !value.isEmpty {
                    config.screenshotPath = value
                } else if let value = value(of: "--annhub-section=", in: argument), !value.isEmpty {
                    config.initialSection = value
                } else if let value = value(of: "--annhub-palette=", in: argument) {
                    config.initialPaletteQuery = value
                } else if let value = value(of: "--annhub-diagnostics=", in: argument), !value.isEmpty {
                    config.diagnosticsDirectory = URL(fileURLWithPath: (value as NSString).expandingTildeInPath)
                }
            }
        }
        return config
    }

    private static func value(of prefix: String, in argument: String) -> String? {
        argument.hasPrefix(prefix) ? String(argument.dropFirst(prefix.count)) : nil
    }
}

/// What a harness reads from `--annhub-ready-file` to find a Desktop it just started.
public struct DesktopReadyInfo: Codable, Equatable, Sendable {
    public var pid: Int32
    public var port: Int
    public var pairToken: String
    public var dataDirectory: String

    public init(pid: Int32, port: Int, pairToken: String, dataDirectory: String) {
        self.pid = pid
        self.port = port
        self.pairToken = pairToken
        self.dataDirectory = dataDirectory
    }
}
