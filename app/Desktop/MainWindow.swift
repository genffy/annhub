// The main window and the app's presence on the Mac.
//
// AnnHub lives in the menu bar (LSUIElement): no Dock icon, and the local hub keeps running
// with no window open. A SwiftUI `WindowGroup` is not created on its own for such an app —
// a normal launch had no window at all and 打开主窗口 had nothing to bring forward — so the
// main window is owned here, in AppKit, and created on demand.
//
// While a window is open the app is a regular Mac app: Dock icon, menu bar, ⌘, ⌘K ⌘1…3 and
// the standard Edit menu (copy and paste in text fields). When the last window closes it goes
// back to the menu bar and keeps listening.

import AppKit
import SwiftUI

enum AppPresence {
    static func policy(hasVisibleWindow: Bool) -> NSApplication.ActivationPolicy {
        hasVisibleWindow ? .regular : .accessory
    }

    /// A window the user can see and work in. The menu-bar panel and status item are not titled.
    static func isUserWindow(_ window: NSWindow) -> Bool {
        window.isVisible && window.styleMask.contains(.titled) && !(window is NSPanel)
    }

    /// Recomputes the policy; `closing` is a window that is about to disappear.
    @MainActor
    static func refresh(excluding closing: NSWindow? = nil) {
        let visible = NSApp.windows.contains { $0 !== closing && isUserWindow($0) }
        let wanted = policy(hasVisibleWindow: visible)
        if NSApp.activationPolicy() != wanted { NSApp.setActivationPolicy(wanted) }
    }

    /// Opens the standard settings window (⌘,).
    @MainActor
    static func openPreferences() {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
}

@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    static let shared = MainWindowController()

    private(set) var window: NSWindow?

    /// Brings the main window forward, creating it the first time.
    func show(model: DesktopModel) {
        let window = self.window ?? makeWindow(model: model)
        self.window = window
        NSApp.setActivationPolicy(.regular)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    var isVisible: Bool { window?.isVisible ?? false }

    private func makeWindow(model: DesktopModel) -> NSWindow {
        let host = NSHostingController(rootView: RootSidebarView().environmentObject(model))
        let window = NSWindow(contentViewController: host)
        window.title = "AnnHub"
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.setContentSize(NSSize(width: 1240, height: 760))
        window.contentMinSize = NSSize(width: 980, height: 600)
        // Closing hides; the next 打开主窗口 brings the same window (and its state) back.
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        // The saved frame goes to the app's own preferences domain. A run that was pointed at its
        // own domain (tests, E2E) must not leave anything in the user's.
        if model.config.defaultsSuite == nil {
            window.setFrameAutosaveName("AnnHubMainWindow")
        }
        return window
    }

    func windowWillClose(_ notification: Notification) {
        let closing = notification.object as? NSWindow
        // Let the window finish closing first, then drop back to the menu bar.
        DispatchQueue.main.async { AppPresence.refresh(excluding: closing) }
    }
}
