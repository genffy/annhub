// AnnHub Desktop — native macOS menu-bar app and local learning client.
// Three pages (今日 / 碎片库 / 系统), the review session (visual occlusion +
// media-clip), a preferences window (daily limit, review reminder) and the
// localhost hub with bidirectional sync endpoints. Output workshop and
// relations left the product with D-10.
//
// The main window is owned by MainWindowController (MainWindow.swift), not by a SwiftUI
// WindowGroup: an LSUIElement app never gets that window on its own.

import AnnHubCore
import SwiftUI

@main
struct AnnHubDesktopApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    // MenuBarExtra defers @StateObject creation until the panel first opens —
    // the shared instance below guarantees the model (and its localhost hub)
    // exists from didFinishLaunching on, independent of UI laziness.
    @StateObject private var model = DesktopModel.shared

    var body: some Scene {
        MenuBarExtra("AnnHub", systemImage: "brain.head.profile") {
            MenuBarPanel().environmentObject(model)
        }
        .menuBarExtraStyle(.window)

        // 偏好设置 (desktop.md §8.2): the standard settings window, Cmd+,.
        Settings {
            PreferencesView().environmentObject(model)
        }
        .commands { DesktopCommands(model: model) }
    }
}

/// The menu bar of the regular app (visible while a window is open): ⌘1…⌘3 pick a page,
/// ⌘K opens the command palette. Real menu items, so they work wherever focus is and are
/// listed where the user looks for shortcuts.
struct DesktopCommands: Commands {
    @ObservedObject var model: DesktopModel

    var body: some Commands {
        // There is one main window and no documents.
        CommandGroup(replacing: .newItem) {}
        CommandMenu("前往") {
            ForEach(DesktopSection.allCases) { section in
                Button(section.rawValue) { model.go(section) }
                    .keyboardShortcut(section.shortcut, modifiers: .command)
            }
            Divider()
            Button("搜索与命令…") { model.paletteVisible = true }
                .keyboardShortcut("k", modifiers: .command)
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let diagnostics = DiagnosticsServer()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Start the local hub with the app (LSUIElement: menu bar only).
        // Eagerly touch the shared model — see AnnHubDesktopApp for why.
        let model = DesktopModel.shared
        model.startHub()

        // Any window closing (the main one, the settings window) may leave none: go back to the
        // menu bar then. The hub keeps listening either way.
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification, object: nil, queue: .main
        ) { note in
            let closing = note.object as? NSWindow
            DispatchQueue.main.async { MainActor.assumeIsolated { AppPresence.refresh(excluding: closing) } }
        }

        if model.config.openWindowAtLaunch {
            MainWindowController.shared.show(model: model)
        }
        if let path = model.config.screenshotPath {
            Self.scheduleScreenshot(to: path)
        }
        if let directory = model.config.diagnosticsDirectory {
            diagnostics.start(directory: directory, model: model)
        }
    }

    /// Clicking the app icon again (Finder, Spotlight) shows the window.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        MainWindowController.shared.show(model: DesktopModel.shared)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    /// Demo affordance (--annhub-shot): render the main window to a PNG and exit.
    private static func scheduleScreenshot(to path: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            exit(DiagnosticsServer.renderMainWindow(to: URL(fileURLWithPath: path)) ? 0 : 1)
        }
    }
}

// ── menu bar panel ───────────────────────────────────────────────────────

struct MenuBarPanel: View {
    @EnvironmentObject var model: DesktopModel

    /// 最近扩展交付状态 (desktop.md §7): the latest per-item write and its result.
    private var lastDeliveryLabel: String {
        guard let last = model.recentDeliveries.last else { return "暂无" }
        let result = last.status < 300 ? "已接收" : "被拒绝（\(last.status)）"
        return "\(result) · \(relativeAgo(last.at))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AnnHub").font(.headline)
            LabeledContent("本地服务") {
                Text(model.hubListening ? "运行中 · \(model.hubState)" : model.hubState)
            }
            LabeledContent("到期复习") { Text("\(model.dailyPlan.due.count)") }
            LabeledContent("最近交付") { Text(lastDeliveryLabel) }
            LabeledContent("最近连接") {
                Text(model.lastConnectionAt.map(relativeAgo) ?? "暂无")
            }
            Divider()
            Button("打开主窗口") { MainWindowController.shared.show(model: model) }
            Button("偏好设置…") { AppPresence.openPreferences() }
            Button("退出 AnnHub") { NSApp.terminate(nil) }
        }
        .padding(12)
        .frame(width: 300)
        .tint(.annBrand)
        .onAppear { model.startHub() }
    }
}
