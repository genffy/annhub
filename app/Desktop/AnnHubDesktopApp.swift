// AnnHub Desktop — native macOS menu-bar app and local learning client.
// Three pages (今日 / 碎片库 / 系统), the review session (visual occlusion +
// media-clip), a preferences window (daily limit, review reminder) and the
// localhost hub with bidirectional sync endpoints. Output workshop and
// relations left the product with D-10.

import SwiftUI
import Network
import UserNotifications
import AnnHubCore

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

        WindowGroup("AnnHub") {
            RootSidebarView()
                .environmentObject(model)
                .frame(minWidth: 980, minHeight: 600)
        }
        .defaultSize(width: 1080, height: 680)

        // 偏好设置 (desktop.md §8.2): the standard settings window, Cmd+,.
        Settings {
            PreferencesView().environmentObject(model)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    static weak var model: DesktopModel?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Start the local hub with the app (LSUIElement: menu bar only).
        // Eagerly touch the shared model — see AnnHubDesktopApp for why.
        Self.model?.startHub()
        DesktopModel.shared.startHub()
        // Demo affordance: bring the main window forward for screenshots.
        // LSUIElement apps never instantiate the WindowGroup window on their
        // own, so host the same root view in a plain NSWindow instead.
        if CommandLine.arguments.contains("--annhub-show-window"), let model = Self.model {
            NSApp.setActivationPolicy(.regular)
            let host = NSHostingController(
                rootView: RootSidebarView().environmentObject(model)
            )
            let window = NSWindow(contentViewController: host)
            window.setContentSize(NSSize(width: 1080, height: 680))
            window.center()
            window.title = "AnnHub"
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            // Demo affordance: render the window offscreen to a PNG and exit.
            // cacheDisplay avoids the Screen Recording TCC gate entirely.
            if let flag = CommandLine.arguments.first(where: { $0.hasPrefix("--annhub-shot=") }) {
                let path = String(flag.dropFirst("--annhub-shot=".count))
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    guard let view = window.contentView else { return }
                    view.needsLayout = true
                    view.layoutSubtreeIfNeeded()
                    view.needsDisplay = true
                    let rect = view.bounds
                    guard let rep = view.bitmapImageRepForCachingDisplay(in: rect) else { return }
                    view.cacheDisplay(in: rect, to: rep)
                    if let png = rep.representation(using: .png, properties: [:]) {
                        try? png.write(to: URL(fileURLWithPath: path))
                    }
                    exit(0)
                }
            }
        }
    }
}

// ── app state ────────────────────────────────────────────────────────────

/// Sync bookkeeping for the system page's technical section (R3).
struct DesktopSyncInfo: Equatable {
    var pendingChanges = 0
    var pulledCursor = 0
    var lastPulledAt: Int?
    var events = EventsStats()
}

/// The daily review reminder (desktop.md §8.1) — the only notification
/// Desktop sends. One repeating calendar notification; no counts, streaks or
/// marketing in its text.
enum ReviewReminderNotifier {
    static let identifier = "annhub.desktop.dailyReviewReminder"

    static func apply(_ reminder: ReviewReminder) {
        // Only a real app bundle can talk to the notification center.
        guard Bundle.main.bundleIdentifier != nil else { return }
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        guard reminder.enabled else { return }
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = "AnnHub"
            content.body = "到了复习的时间，打开 AnnHub 查看今天的复习。"
            var when = DateComponents()
            when.hour = reminder.hour
            when.minute = reminder.minute
            let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
            center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
        }
    }
}

@MainActor
final class DesktopModel: ObservableObject {
    static let sessionDefaultsKey = "annhub.desktop.reviewSession"
    static let pairTokenDefaultsKey = "annhub.desktop.pairToken"
    static let dailyLimitDefaultsKey = "annhub.desktop.dailyLimit"
    static let reminderDefaultsKey = "annhub.desktop.reviewReminder"

    @Published var fragments: [FragmentRecord] = []
    @Published var reviewLogs: [ReviewLog] = []
    @Published var syncInfo = DesktopSyncInfo()
    /// 每日建议上限 (review.md §5), clamped to 5...50 and persisted in
    /// UserDefaults; the preferences window exposes the slider.
    @Published var dailyLimit: Int {
        didSet {
            let clamped = clampedDailyLimit(dailyLimit)
            if clamped != dailyLimit {
                dailyLimit = clamped
                return
            }
            UserDefaults.standard.set(dailyLimit, forKey: Self.dailyLimitDefaultsKey)
        }
    }
    /// 每日复习提醒 (desktop.md §8.2); every change reschedules the notification.
    @Published var reminder: ReviewReminder {
        didSet {
            if let data = try? JSONEncoder().encode(reminder) {
                UserDefaults.standard.set(data, forKey: Self.reminderDefaultsKey)
            }
            ReviewReminderNotifier.apply(reminder)
        }
    }
    @Published var stats = StoreStats(
        fragments: 0, reviewLogs: 0, assets: 0, outbox: 0, deletions: 0
    )
    @Published var hubState = "未启动"
    @Published var session: ReviewSessionState?
    /// Facts about the round that just ended (desktop.md §5.5); nil otherwise.
    @Published var wrapUp: SessionWrapUp?
    @Published var detailFragment: FragmentRecord?
    /// The code the extension needs; generated and persisted by Desktop.
    @Published private(set) var pairToken: String
    /// Fragments the extension delivered (excludes demo seeds); refreshed by reload().
    @Published private(set) var deliveredFragmentCount = 0
    /// Bumped by every reload() so views that cache a query result can refresh it.
    @Published private(set) var revision = 0

    let store: FragmentStore
    let hub: DesktopHub
    private var server: HubServer?

    /// Shared instance: strongly held so the hub starts with the app even
    /// before MenuBarExtra first evaluates its content.
    static let shared: DesktopModel = live()

    static func live() -> DesktopModel {
        let appSupport = URL.applicationSupportDirectory.appending(path: "AnnHub")
        try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true)
        let store =
            (try? FragmentStore(
                path: appSupport.appending(path: "desktop-fragment-store.sqlite").path,
                deviceId: "mac-" + UUID().uuidString.prefix(6)
            )) ?? (try! FragmentStore(path: ":memory:", deviceId: "mac-fallback"))
        if CommandLine.arguments.contains(DemoSeed.launchArgument) {
            DemoSeed.seedIfNeeded(store)
        }
        let model = DesktopModel(store: store)
        AppDelegate.model = model
        return model
    }

    init(store: FragmentStore) {
        self.store = store
        // Pairing (storage.md §8): Desktop generates the code and remembers it
        // across launches; the user types it into the extension.
        let stored = UserDefaults.standard.string(forKey: Self.pairTokenDefaultsKey) ?? ""
        let hub = DesktopHub(store: store, pairToken: stored)
        self.hub = hub
        self.pairToken = hub.pairToken
        let storedLimit = UserDefaults.standard.integer(forKey: Self.dailyLimitDefaultsKey)
        self.dailyLimit = clampedDailyLimit(storedLimit == 0 ? DAILY_LIMIT_DEFAULT : storedLimit)
        if let data = UserDefaults.standard.data(forKey: Self.reminderDefaultsKey),
            let saved = try? JSONDecoder().decode(ReviewReminder.self, from: data)
        {
            self.reminder = saved
        } else {
            self.reminder = ReviewReminder()
        }
        ReviewReminderNotifier.apply(reminder)
        restoreSession()
        reload()
    }

    func startHub() {
        guard server == nil else { return }
        server = HubServer(port: 8765, hub: hub)
        server?.start { [weak self] error in
            Task { @MainActor in
                self?.hubState = error == nil ? "127.0.0.1:8765" : "启动失败：\(error!.localizedDescription)"
            }
        }
        hubState = "127.0.0.1:8765"
    }

    /// The local service is up and bound to loopback.
    var hubListening: Bool { hubState.hasPrefix("127.0.0.1") }

    // ── pairing (desktop.md §6) ──────────────────────────────────────────

    func copyPairToken() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(pairToken, forType: .string)
    }

    /// 重新生成: the old code stops working at once; data and pending
    /// deliveries stay.
    func rotatePairToken() {
        hub.rotatePairToken()
        syncPairToken()
    }

    private func syncPairToken() {
        let token = hub.pairToken
        if token != pairToken { pairToken = token }
        if token != UserDefaults.standard.string(forKey: Self.pairTokenDefaultsKey) {
            UserDefaults.standard.set(token, forKey: Self.pairTokenDefaultsKey)
        }
    }

    func reload() {
        fragments = (try? store.getFragments()) ?? []
        reviewLogs = (try? store.getReviewLogs()) ?? []
        stats = (try? store.stats()) ?? stats
        syncInfo = DesktopSyncInfo(
            pendingChanges: (try? store.pendingChangeCount()) ?? 0,
            pulledCursor: store.pulledCursor(),
            lastPulledAt: store.lastPulledAt(),
            events: hub.eventsStats
        )
        deliveredFragmentCount =
            fragments.filter { fragment in
                guard let delivery = try? store.fragmentDelivery(id: fragment.id) else { return false }
                return !delivery.deviceId.isEmpty && delivery.deviceId != DemoSeed.demoDeviceId
            }.count
        syncPairToken()
        pruneFinishedSession()
        revision += 1
    }

    // ── derived state ────────────────────────────────────────────────────

    /// Today's allowance and the full due queue (review.md §5).
    var dailyPlan: DailyReviewPlan {
        dailyReviewPlan(fragments: fragments, logs: reviewLogs, now: nowMs(), dailyLimit: dailyLimit)
    }

    /// 本周成功提取的碎片 (M-18) — the only statistic on the 今日 page.
    var weeklyRetrieved: Int {
        weeklyRetrievedFragmentCount(reviewLogs)
    }

    var latestFragments: [FragmentRecord] {
        Array(fragments.sorted { $0.createdAt > $1.createdAt }.prefix(5))
    }

    // ── review session (desktop.md §5) ───────────────────────────────────

    /// Starts a session from today's suggested amount; `overflow` goes past a
    /// used-up cap (再来一轮) — due dates are never changed either way.
    @discardableResult
    func startReviewSession(overflow: Bool = false) -> Bool {
        let plan = dailyPlan
        let pool = overflow ? plan.due : plan.suggested
        guard !pool.isEmpty else { return false }
        let cap = sessionCap(dailyRemaining: pool.count)
        let ids = Array(pool.prefix(cap).map(\.id))
        session = ReviewSessionState(
            sessionId: newId(),
            fragmentIds: ids,
            cursor: 0,
            startedAt: nowMs(),
            skipped: []
        )
        wrapUp = nil
        persistSession()
        return true
    }

    var currentFragment: FragmentRecord? {
        guard let session, session.cursor < session.fragmentIds.count else { return nil }
        let id = session.fragmentIds[session.cursor]
        return fragments.first { $0.id == id }
    }

    /// Rating commits in the store FIRST; only then does the cursor move
    /// (review.md §5). Deleted mid-session fragments are skipped with a reason.
    func rateCurrent(_ rating: ReviewRating, usedHint: Bool) -> Bool {
        guard var session, session.cursor < session.fragmentIds.count else { return false }
        let id = session.fragmentIds[session.cursor]
        // Fragment deleted in another window: skip, do not crash the session.
        let existing: FragmentRecord? = (try? store.getFragment(id: id)) ?? nil
        guard existing != nil else {
            skipCurrent(reason: "碎片已删除")
            return false
        }
        do {
            _ = try store.rateFragment(id: id, rating: rating, usedHint: usedHint)
        } catch {
            return false
        }
        reload()
        session.cursor += 1
        self.session = session
        persistSession()
        finishSessionIfComplete()
        return true
    }

    func skipCurrent(reason: String) {
        guard var session, session.cursor < session.fragmentIds.count else { return }
        let id = session.fragmentIds[session.cursor]
        session.skipped.append(ReviewSessionSkip(fragmentId: id, reason: reason))
        session.cursor += 1
        self.session = session
        persistSession()
        finishSessionIfComplete()
    }

    /// The last card ends the session: keep its facts for the wrap-up screen,
    /// then drop the persisted session so 今日 stops offering to resume it.
    private func finishSessionIfComplete() {
        guard let session, session.cursor >= session.fragmentIds.count else { return }
        wrapUp = sessionWrapUp(session: session, logs: reviewLogs, fragments: fragments, now: nowMs())
        self.session = nil
        UserDefaults.standard.removeObject(forKey: Self.sessionDefaultsKey)
    }

    private func pruneFinishedSession() {
        guard let session else { return }
        if session.cursor >= session.fragmentIds.count {
            self.session = nil
            UserDefaults.standard.removeObject(forKey: Self.sessionDefaultsKey)
        }
    }

    private func persistSession() {
        guard let session else { return }
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: Self.sessionDefaultsKey)
        }
    }

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: Self.sessionDefaultsKey),
            let restored = try? JSONDecoder().decode(ReviewSessionState.self, from: data)
        else { return }
        session = restored
    }

    // ── library ──────────────────────────────────────────────────────────

    func deleteLocal(_ id: String) {
        try? store.deleteFragment(id: id, now: nowMs())
        reload()
    }

    func assetImage(assetId: String) -> NSImage? {
        guard let asset = try? store.getAsset(id: assetId) else { return nil }
        return NSImage(data: asset.bytes)
    }

    func assetMissing(_ assetId: String) -> Bool {
        ((try? store.assetExists(id: assetId)) ?? false) == false
    }

    var missingAttachmentCount: Int {
        (try? store.missingAttachmentCount()) ?? 0
    }

    var recentDeliveries: [DeliveryOutcome] {
        hub.recentDeliveries
    }

    var lastConnectionAt: Int? { hub.lastConnectionAt }

    /// What the system page lists under 需要处理 — only things the user can act on.
    var attentionItems: [String] {
        var items: [String] = []
        if hubState.hasPrefix("启动失败") {
            items.append("本地服务没有启动（\(hubState)）")
        }
        if missingAttachmentCount > 0 {
            items.append("有 \(missingAttachmentCount) 张图片尚未到达，扩展重试后会补上")
        }
        if let last = recentDeliveries.last, last.status == 401 || last.status == 403 {
            items.append("最近一次写入被拒绝：扩展里的配对码与这里不一致，请重新输入")
        }
        return items
    }
}

func nowMs() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
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
            Button("打开主窗口") {
                NSApp.activate(ignoringOtherApps: true)
                for window in NSApp.windows where window.canBecomeMain {
                    window.makeKeyAndOrderFront(nil)
                }
            }
            SettingsLink { Text("偏好设置…") }
                .keyboardShortcut(",", modifiers: .command)
                .simultaneousGesture(TapGesture().onEnded { NSApp.activate(ignoringOtherApps: true) })
            Button("退出 AnnHub") { NSApp.terminate(nil) }
        }
        .padding(12)
        .frame(width: 300)
        .tint(.annBrand)
        .onAppear { model.startHub() }
    }
}

// MARK: - Hub server (thin NWListener transport; protocol logic in AnnHubCore)

/// Moves bytes. What may be read, from whom and how much is decided by `HubRequestFramer` and
/// `DesktopHub.preflight` in Core, where it is unit-tested; this class only bounds time and
/// connection count, which need a socket.
final class HubServer: @unchecked Sendable {
    /// A request that has not arrived in full by then is dropped (a client trickling bytes).
    private static let requestDeadline: TimeInterval = 20
    /// Simultaneous connections. The extension delivers one item at a time.
    private static let maxConnections = 32
    private static let receiveChunkBytes = 64 * 1024

    private let port: UInt16
    private let hub: DesktopHub
    private var listener: NWListener?
    private let connectionLock = NSLock()
    private var activeConnections = Set<ObjectIdentifier>()

    init(port: UInt16, hub: DesktopHub) {
        self.port = port
        self.hub = hub
    }

    func start(onError: @escaping (Error?) -> Void) {
        let params = NWParameters.tcp
        // Loopback only — the Desktop hub never listens on other interfaces
        // (storage.md §8).
        params.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!
        )
        // NOTE: on this macOS (darwin 25.x) NWListener(using:on:) combined with
        // requiredLocalEndpoint returns nil — the port rides in the endpoint.
        guard let listener = try? NWListener(using: params) else {
            onError(HubError.bindFailed)
            return
        }
        self.listener = listener
        listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection: connection)
        }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state { onError(error) }
        }
        listener.start(queue: DispatchQueue(label: "annhub.hub"))
    }

    enum HubError: LocalizedError {
        case bindFailed
        var errorDescription: String? { "无法监听 127.0.0.1:8765（端口被占用？）" }
    }

    /// Per-connection state, mutated in place so a 10 MB upload is not copied chunk by chunk.
    private final class ConnectionState {
        var framer: HubRequestFramer
        let deadline: DispatchWorkItem

        init(framer: HubRequestFramer, deadline: DispatchWorkItem) {
            self.framer = framer
            self.deadline = deadline
        }
    }

    private func admit(_ connection: NWConnection) -> Bool {
        connectionLock.lock()
        defer { connectionLock.unlock() }
        guard activeConnections.count < Self.maxConnections else { return false }
        activeConnections.insert(ObjectIdentifier(connection))
        return true
    }

    private func forget(_ connection: NWConnection) {
        connectionLock.lock()
        defer { connectionLock.unlock() }
        activeConnections.remove(ObjectIdentifier(connection))
    }

    private func handle(connection: NWConnection) {
        guard admit(connection) else {
            connection.cancel()
            return
        }
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let connection else { return }
            switch state {
            case .cancelled, .failed:
                self?.forget(connection)
            default:
                break
            }
        }
        let deadline = DispatchWorkItem { [weak connection] in connection?.cancel() }
        DispatchQueue.global().asyncAfter(deadline: .now() + Self.requestDeadline, execute: deadline)
        connection.start(queue: .global())
        receive(connection: connection, state: ConnectionState(framer: HubRequestFramer(hub: hub), deadline: deadline))
    }

    private func receive(connection: NWConnection, state: ConnectionState) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: Self.receiveChunkBytes) {
            [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                switch state.framer.feed(data) {
                case .reject(let response):
                    state.deadline.cancel()
                    self.send(connection: connection, response: response)
                    return
                case .request(let request):
                    state.deadline.cancel()
                    self.send(connection: connection, response: self.hub.handle(request))
                    return
                case .needMore:
                    break
                }
            }
            if error == nil && !isComplete {
                self.receive(connection: connection, state: state)
            } else {
                state.deadline.cancel()
                connection.cancel()
            }
        }
    }

    private func send(connection: NWConnection, response: HubResponse) {
        var head = "HTTP/1.1 \(response.status) \(Self.reasonPhrase(response.status))\r\n"
        head += "Content-Type: \(response.contentType)\r\n"
        head += "Content-Length: \(response.body.count)\r\n"
        head += "Connection: close\r\n\r\n"
        var payload = Data(head.utf8)
        payload.append(response.body)
        connection.send(
            content: payload,
            completion: .contentProcessed { _ in
                connection.cancel()
            })
    }

    static func reasonPhrase(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 201: return "Created"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 409: return "Conflict"
        case 410: return "Gone"
        case 413: return "Payload Too Large"
        case 422: return "Unprocessable Entity"
        case 431: return "Request Header Fields Too Large"
        case 500: return "Internal Server Error"
        case 501: return "Not Implemented"
        default: return "OK"
        }
    }
}
