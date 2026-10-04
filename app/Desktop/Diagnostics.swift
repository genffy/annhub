// What a harness can read from a running Desktop (E2E, real-device checks). Off unless the
// process was started with `--annhub-diagnostics=DIR`: then SIGUSR1 writes DIR/state.json and
// SIGUSR2 renders the main window to DIR/window.png. Only counts, states and window facts —
// no fragment text, no pairing code — and nothing leaves the machine.
//
// A harness without Accessibility permission cannot press keys from outside. It can leave
// DIR/keys.txt before SIGUSR1: the app then plays those keys into its own event queue
// (`NSApp.sendEvent`, no system permission involved) and writes the state afterwards. One key per
// line: `cmd+k`, `escape`, `down`, `return`, `cmd+,`, or `type:some text`.

import AnnHubCore
import AppKit

struct DesktopDiagnostics: Codable, Equatable {
    var section: String
    var fragmentCount: Int
    var deliveredFragmentCount: Int
    var dueCount: Int
    var resumeCursor: Int?
    var resumeTotal: Int?
    /// idle | starting | ready:PORT | failed:portInUse:PORT | failed:DESCRIPTION
    var hub: String
    /// The interface language in force: zh or en (D-15).
    var language: String
    var paletteVisible: Bool
    var reviewSheetPresented: Bool
    var recentDeliveryStatuses: [Int]
    var hasConnected: Bool
    /// regular (Dock icon, menu bar) while a window is open, accessory (menu bar only) otherwise
    var activationPolicy: String
    var visibleWindowCount: Int
    var mainWindowVisible: Bool

    @MainActor
    static func capture(model: DesktopModel) -> DesktopDiagnostics {
        let hub: String
        switch model.hubStatus {
        case .idle: hub = "idle"
        case .starting: hub = "starting"
        case .ready(let port): hub = "ready:\(port)"
        case .failed(.portInUse(let port)): hub = "failed:portInUse:\(port)"
        case .failed(.other(let description)): hub = "failed:\(description)"
        }
        let policy: String
        switch NSApp.activationPolicy() {
        case .regular: policy = "regular"
        case .accessory: policy = "accessory"
        case .prohibited: policy = "prohibited"
        @unknown default: policy = "unknown"
        }
        let resume = model.resumableSession
        return DesktopDiagnostics(
            section: model.section.rawValue,
            fragmentCount: model.fragments.count,
            deliveredFragmentCount: model.deliveredFragmentCount,
            dueCount: model.dailyPlan.due.count,
            resumeCursor: resume?.cursor,
            resumeTotal: resume?.fragmentIds.count,
            hub: hub,
            language: UILanguage.current.rawValue,
            paletteVisible: model.paletteVisible,
            reviewSheetPresented: model.reviewSheetPresented,
            recentDeliveryStatuses: model.recentDeliveries.map(\.status),
            hasConnected: model.lastConnectionAt != nil,
            activationPolicy: policy,
            visibleWindowCount: NSApp.windows.filter(AppPresence.isUserWindow).count,
            mainWindowVisible: MainWindowController.shared.isVisible
        )
    }
}

@MainActor
final class DiagnosticsServer {
    private var sources: [DispatchSourceSignal] = []

    func start(directory: URL, model: DesktopModel) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        listen(SIGUSR1) {
            Task { @MainActor in
                let keys = directory.appending(path: "keys.txt")
                if let script = try? String(contentsOf: keys, encoding: .utf8) {
                    try? FileManager.default.removeItem(at: keys)
                    await KeySimulator.play(script.split(separator: "\n").map(String.init))
                }
                let state = DesktopDiagnostics.capture(model: model)
                if let data = try? JSONEncoder().encode(state) {
                    try? data.write(to: directory.appending(path: "state.json"), options: .atomic)
                }
            }
        }
        listen(SIGUSR2) {
            Self.renderMainWindow(to: directory.appending(path: "window.png"))
        }
    }

    private func listen(_ signalNumber: Int32, _ handler: @escaping @MainActor () -> Void) {
        signal(signalNumber, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
        source.setEventHandler { MainActor.assumeIsolated { handler() } }
        source.resume()
        sources.append(source)
    }

    /// cacheDisplay needs no Screen Recording permission. Materials (the sidebar, the toolbar)
    /// are not captured by it; the page content is.
    @discardableResult
    static func renderMainWindow(to url: URL) -> Bool {
        guard let view = MainWindowController.shared.window?.contentView else { return false }
        view.needsLayout = true
        view.layoutSubtreeIfNeeded()
        view.needsDisplay = true
        let rect = view.bounds
        guard let rep = view.bitmapImageRepForCachingDisplay(in: rect) else { return false }
        view.cacheDisplay(in: rect, to: rep)
        guard let png = rep.representation(using: .png, properties: [:]) else { return false }
        return (try? png.write(to: url, options: .atomic)) != nil
    }
}

/// Plays keys into the app's own event queue, addressed to the main window (or the key window).
@MainActor
enum KeySimulator {
    static func play(_ lines: [String]) async {
        for line in lines where !line.trimmingCharacters(in: .whitespaces).isEmpty {
            if line.hasPrefix("type:") {
                for character in line.dropFirst("type:".count) {
                    post(characters: String(character), keyCode: 0, flags: [])
                    try? await Task.sleep(for: .milliseconds(30))
                }
            } else if let key = parse(line) {
                post(characters: key.characters, keyCode: key.keyCode, flags: key.flags)
            }
            // SwiftUI applies a key's effect on the next turns of the run loop.
            try? await Task.sleep(for: .milliseconds(150))
        }
    }

    private struct Key {
        var characters: String
        var keyCode: UInt16
        var flags: NSEvent.ModifierFlags
    }

    private static func parse(_ spec: String) -> Key? {
        var flags: NSEvent.ModifierFlags = []
        var name = spec.trimmingCharacters(in: .whitespaces).lowercased()
        while let plus = name.firstIndex(of: "+"), name.distance(from: name.startIndex, to: plus) > 0 {
            switch name[..<plus] {
            case "cmd": flags.insert(.command)
            case "shift": flags.insert(.shift)
            case "alt": flags.insert(.option)
            case "ctrl": flags.insert(.control)
            default: return nil
            }
            name = String(name[name.index(after: plus)...])
        }
        func function(_ code: Int) -> String { String(UnicodeScalar(UInt16(code)).map(Character.init) ?? " ") }
        switch name {
        case "escape": return Key(characters: "\u{1B}", keyCode: 53, flags: flags)
        case "return": return Key(characters: "\r", keyCode: 36, flags: flags)
        case "tab": return Key(characters: "\t", keyCode: 48, flags: flags)
        case "space": return Key(characters: " ", keyCode: 49, flags: flags)
        case "up":
            return Key(
                characters: function(NSUpArrowFunctionKey), keyCode: 126, flags: flags.union([.function, .numericPad]))
        case "down":
            return Key(
                characters: function(NSDownArrowFunctionKey), keyCode: 125,
                flags: flags.union([.function, .numericPad]))
        case ",": return Key(characters: ",", keyCode: 43, flags: flags)
        case "1": return Key(characters: "1", keyCode: 18, flags: flags)
        case "2": return Key(characters: "2", keyCode: 19, flags: flags)
        case "3": return Key(characters: "3", keyCode: 20, flags: flags)
        case "4": return Key(characters: "4", keyCode: 21, flags: flags)
        case "k": return Key(characters: "k", keyCode: 40, flags: flags)
        default: return nil
        }
    }

    private static func post(characters: String, keyCode: UInt16, flags: NSEvent.ModifierFlags) {
        let window = NSApp.keyWindow ?? MainWindowController.shared.window
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            guard
                let event = NSEvent.keyEvent(
                    with: type, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                    windowNumber: window?.windowNumber ?? 0, context: nil, characters: characters,
                    charactersIgnoringModifiers: characters, isARepeat: false, keyCode: keyCode)
            else { continue }
            NSApp.sendEvent(event)
        }
    }
}
