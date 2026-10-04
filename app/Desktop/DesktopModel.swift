// The Desktop's app state: the SQLite-backed library, the review session, the
// preferences and the localhost hub. Views render it; rules live in AnnHubCore.

import AnnHubCore
import SwiftUI
import UserNotifications

/// Sync bookkeeping for the system page's technical section (R3).
struct DesktopSyncInfo: Equatable {
    var pendingChanges = 0
    var pulledCursor = 0
    var lastPulledAt: Int?
    var events = EventsStats()
}

/// Where the card on screen stands: how many rungs of the hint ladder are open and whether
/// the answer has been revealed. It lives in the model, not in the view, because it carries a
/// fact the rating must record — a hint was used (review.md §4). Closing and reopening the
/// review sheet must not hand out a free retry, and a quit in the middle of a card must not
/// either: it is saved with the session, tied to the card it belongs to.
struct ReviewCardState: Equatable, Codable {
    var fragmentId: String?
    var hintLevel = 0
    var revealed = false

    var usedHint: Bool { hintLevel > 0 }
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
            content.body = t(.reminderBody)
            var when = DateComponents()
            when.hour = reminder.hour
            when.minute = reminder.minute
            let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
            center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
        }
    }
}

func nowMs() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
}

@MainActor
final class DesktopModel: ObservableObject {
    static let sessionDefaultsKey = "annhub.desktop.reviewSession"
    static let pairTokenDefaultsKey = "annhub.desktop.pairToken"
    static let dailyLimitDefaultsKey = "annhub.desktop.dailyLimit"
    static let reminderDefaultsKey = "annhub.desktop.reviewReminder"
    static let deviceIdDefaultsKey = "annhub.desktop.deviceId"
    static let cardDefaultsKey = "annhub.desktop.reviewCard"

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
            defaults.set(dailyLimit, forKey: Self.dailyLimitDefaultsKey)
        }
    }
    /// 每日复习提醒 (desktop.md §8.2); every change reschedules the notification.
    @Published var reminder: ReviewReminder {
        didSet {
            if let data = try? JSONEncoder().encode(reminder) {
                defaults.set(data, forKey: Self.reminderDefaultsKey)
            }
            applyReminder()
        }
    }
    @Published var stats = StoreStats(
        fragments: 0, reviewLogs: 0, assets: 0, outbox: 0, deletions: 0
    )
    /// The listener's real state — "ready" only after the socket is bound.
    @Published private(set) var hubStatus: HubServer.State = .idle
    @Published var session: ReviewSessionState?
    @Published private(set) var card = ReviewCardState()
    /// Facts about the round that just ended (desktop.md §5.5); nil otherwise.
    @Published var wrapUp: SessionWrapUp?
    @Published var detailFragment: FragmentRecord?
    /// The code the extension needs; generated and persisted by Desktop.
    @Published private(set) var pairToken: String
    /// Fragments that arrived from a device (not made on this Mac); refreshed by reload().
    @Published private(set) var deliveredFragmentCount = 0
    /// Bumped by every reload() so views that cache a query result can refresh it.
    @Published private(set) var revision = 0
    /// Set when the on-disk store could not be opened. The hub then stays down so the
    /// extension keeps its queue instead of handing data to a store that will not keep it.
    @Published private(set) var storeError: String?
    /// A fragment another surface (the command palette) wants the library to show.
    @Published var focusedFragmentId: String?
    /// The page the user picked; nil until they pick one, then the default applies.
    @Published var selectedSection: DesktopSection?
    /// ⌘K
    @Published var paletteVisible = false
    /// Text the palette opens with (only set by `--annhub-palette`).
    private(set) var paletteInitialQuery: String?
    /// The review session sheet; lives here so the palette and 今日 open the same one.
    @Published var reviewSheetPresented = false

    let store: FragmentStore
    let hub: DesktopHub
    let config: DesktopLaunchConfig
    private let defaults: UserDefaults
    private let clock: () -> Int
    private var server: HubServer?
    private var refreshWork: DispatchWorkItem?
    private var refreshDelay: TimeInterval = DesktopModel.minRefreshDelay

    private static let minRefreshDelay: TimeInterval = 0.15
    private static let maxRefreshDelay: TimeInterval = 2

    /// Shared instance: strongly held so the hub starts with the app even
    /// before MenuBarExtra first evaluates its content.
    static let shared: DesktopModel = live()

    static func live(config: DesktopLaunchConfig = .parse(CommandLine.arguments)) -> DesktopModel {
        // Inside an XCTest host the app must never reach the user's files.
        let underTest = NSClassFromString("XCTestCase") != nil
        let defaults =
            underTest
            ? (UserDefaults(suiteName: "annhub.desktop.xctest-host") ?? .standard) : config.makeDefaults()
        var storeError: String?
        let store: FragmentStore
        let deviceId = stableDeviceId(defaults)
        if underTest {
            store = (try? FragmentStore(inMemoryDeviceId: deviceId))!
        } else {
            let directory = config.resolvedDataDirectory()
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                store = try FragmentStore(
                    path: directory.appending(path: "desktop-fragment-store.sqlite").path, deviceId: deviceId
                )
            } catch {
                storeError = t(.storeOpenFailed, ["error": error.localizedDescription])
                store = (try? FragmentStore(inMemoryDeviceId: deviceId))!
            }
        }
        var effective = config
        if underTest {
            effective.port = 0
            effective.notificationsEnabled = false
        }
        return DesktopModel(store: store, defaults: defaults, config: effective, storeError: storeError)
    }

    /// One id per install, so the system page and `/health` stop changing at every launch.
    private static func stableDeviceId(_ defaults: UserDefaults) -> String {
        if let stored = defaults.string(forKey: deviceIdDefaultsKey), !stored.isEmpty { return stored }
        let created = "mac-" + UUID().uuidString.prefix(6)
        defaults.set(created, forKey: deviceIdDefaultsKey)
        return created
    }

    init(
        store: FragmentStore,
        defaults: UserDefaults = .standard,
        config: DesktopLaunchConfig = DesktopLaunchConfig(),
        storeError: String? = nil,
        clock: @escaping () -> Int = nowMs
    ) {
        self.store = store
        self.defaults = defaults
        self.config = config
        self.storeError = storeError
        self.clock = clock
        // Pairing (storage.md §8): Desktop generates the code and remembers it
        // across launches; the user types it into the extension.
        let stored = defaults.string(forKey: Self.pairTokenDefaultsKey) ?? ""
        // Only the configured extension ids may call the hub from a browser (storage.md §8): the
        // build's own, plus any a test or automation adds for the unpacked build it loads.
        let allowlist = ExtensionAllowlist.admitted(extra: config.extraExtensionIds)
        for entry in allowlist.rejected {
            NSLog("AnnHub: ignoring \"%@\" in the extension id list: it is not a Chrome extension id", entry)
        }
        let hub = DesktopHub(store: store, pairToken: stored, allowedExtensionIds: allowlist.ids)
        self.hub = hub
        self.pairToken = hub.pairToken
        let storedLimit = defaults.integer(forKey: Self.dailyLimitDefaultsKey)
        self.dailyLimit = clampedDailyLimit(storedLimit == 0 ? DAILY_LIMIT_DEFAULT : storedLimit)
        if let data = defaults.data(forKey: Self.reminderDefaultsKey),
            let saved = try? JSONDecoder().decode(ReviewReminder.self, from: data)
        {
            self.reminder = saved
        } else {
            self.reminder = ReviewReminder()
        }
        applyReminder()
        // The saved card is matched against the session's current fragment, so the library
        // is read first; reload() then settles the rest (and skips cards deleted meanwhile).
        fragments = (try? store.getFragments()) ?? []
        restoreSession()
        restoreCard()
        reload()
        applyInitialUIState()
    }

    /// `--annhub-section` / `--annhub-palette`: where a screenshot or an E2E run starts.
    private func applyInitialUIState() {
        if let name = config.initialSection, let match = DesktopSection(rawValue: name) {
            selectedSection = match
        }
        if let query = config.initialPaletteQuery {
            paletteInitialQuery = query
            paletteVisible = true
        }
    }

    private func applyReminder() {
        guard config.notificationsEnabled else { return }
        ReviewReminderNotifier.apply(reminder)
    }

    // ── local hub ────────────────────────────────────────────────────────

    func startHub() {
        guard server == nil, storeError == nil else { return }
        let server = HubServer(hub: hub, port: config.port)
        server.onStateChange = { [weak self] state in
            Task { @MainActor in self?.hubStateChanged(state) }
        }
        server.onRequestHandled = { [weak self] request, _ in
            // A request refused from its header block (nil) still shows on the system page.
            let quiet = request?.method == "GET" && request?.path == "/health"
            Task { @MainActor in self?.scheduleRefresh(quiet: quiet) }
        }
        self.server = server
        server.start()
    }

    func stopHub() {
        server?.stop()
        server = nil
        hubStatus = .idle
    }

    /// 重试启动: after a port conflict clears up, or from the system page.
    func restartHub() {
        stopHub()
        startHub()
    }

    private func hubStateChanged(_ state: HubServer.State) {
        hubStatus = state
        if case .ready(let port) = state { writeReadyFile(port: port) }
    }

    /// Automation hook (`--annhub-ready-file`): lets a harness that asked for port 0 find
    /// the hub and its pairing code. Never written in a normal launch.
    private func writeReadyFile(port: UInt16) {
        guard let url = config.readyFile else { return }
        let info = DesktopReadyInfo(
            pid: ProcessInfo.processInfo.processIdentifier, port: Int(port), pairToken: pairToken,
            dataDirectory: config.resolvedDataDirectory().path
        )
        if let data = try? JSONEncoder().encode(info) {
            try? data.write(to: url, options: .atomic)
        }
    }

    /// The local service is up and bound to loopback.
    var hubListening: Bool { hubStatus.isReady }

    var hubPort: UInt16? { server?.port }

    /// 127.0.0.1:8765 while listening, otherwise the reason it is not.
    var hubState: String {
        if let storeError { return storeError }
        switch hubStatus {
        case .idle: return t(.hubNotStarted)
        case .starting: return t(.hubStarting)
        case .ready(let port): return "127.0.0.1:\(port)"
        case .failed(let failure): return t(.hubFailed, ["error": failure.message()])
        }
    }

    var hubFailed: Bool {
        if storeError != nil { return true }
        if case .failed = hubStatus { return true }
        return false
    }

    // ── refresh after the hub wrote ──────────────────────────────────────

    /// The hub stores deliveries on its own queue; the views only learn about them
    /// through here. A burst of requests (a reconnecting extension flushing its queue)
    /// collapses into one reload, and a slow reload widens the gap before the next.
    func scheduleRefresh(quiet: Bool = false) {
        guard refreshWork == nil else { return }
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.refreshWork = nil
                let started = Date()
                self.reload()
                self.refreshDelay = min(
                    max(Self.minRefreshDelay, Date().timeIntervalSince(started) * 3), Self.maxRefreshDelay)
            }
        }
        refreshWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (quiet ? 1 : refreshDelay), execute: work)
    }

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
        if case .ready(let port) = hubStatus { writeReadyFile(port: port) }
    }

    private func syncPairToken() {
        let token = hub.pairToken
        if token != pairToken { pairToken = token }
        if token != defaults.string(forKey: Self.pairTokenDefaultsKey) {
            defaults.set(token, forKey: Self.pairTokenDefaultsKey)
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
        deliveredFragmentCount = (try? store.deliveredFragmentCount()) ?? 0
        syncPairToken()
        skipDeletedCards()
        pruneFinishedSession()
        revision += 1
    }

    /// A card whose fragment was deleted (in the library, in another window) is skipped with a
    /// reason and the session goes on (desktop.md §5.4) — it never sits on a card that cannot
    /// be shown.
    private func skipDeletedCards() {
        var skippedAny = false
        while var live = session, live.cursor < live.fragmentIds.count {
            let id = live.fragmentIds[live.cursor]
            if fragments.contains(where: { $0.id == id }) { break }
            live.skipped.append(ReviewSessionSkip(fragmentId: id, reason: t(.skipDeleted)))
            live.cursor += 1
            session = live
            skippedAny = true
        }
        guard skippedAny else { return }
        persistSession()
        finishSessionIfComplete()
        syncCardToSession()
    }

    // ── derived state ────────────────────────────────────────────────────

    /// Today's allowance and the full due queue (review.md §5).
    var dailyPlan: DailyReviewPlan {
        dailyReviewPlan(fragments: fragments, logs: reviewLogs, now: clock(), dailyLimit: dailyLimit)
    }

    /// 本周成功提取的碎片 (M-18) — the only statistic on the 今日 page.
    var weeklyRetrieved: Int {
        weeklyRetrievedFragmentCount(reviewLogs, now: clock())
    }

    var latestFragments: [FragmentRecord] {
        Array(fragments.sorted { $0.createdAt > $1.createdAt }.prefix(5))
    }

    // ── navigation & ⌘K ──────────────────────────────────────────────────

    /// 首次安装且没有数据时默认进入「碎片库」空状态 (desktop.md §2).
    var section: DesktopSection {
        selectedSection ?? (fragments.isEmpty ? .library : .today)
    }

    func go(_ section: DesktopSection) {
        selectedSection = section
    }

    /// Shows one fragment in the library (picked from the command palette).
    func openFragment(_ id: String) {
        paletteVisible = false
        focusedFragmentId = id
        go(.library)
    }

    /// What the palette needs to know to list only the commands that can run.
    var paletteContext: PaletteContext {
        PaletteContext(
            dueCount: dailyPlan.due.count,
            resume: resumableSession.map { PaletteContext.Resume(cursor: $0.cursor, total: $0.fragmentIds.count) }
        )
    }

    func run(_ command: PaletteCommandID) {
        paletteVisible = false
        switch command {
        case .goToday: go(.today)
        case .goLibrary: go(.library)
        case .goSystem: go(.system)
        case .startReview, .resumeReview:
            go(.today)
            reviewSheetPresented = true
        case .openPreferences: AppPresence.openPreferences()
        case .copyPairCode: copyPairToken()
        }
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
            startedAt: clock(),
            skipped: []
        )
        wrapUp = nil
        persistSession()
        setCard(ReviewCardState(fragmentId: ids.first))
        return true
    }

    var currentFragment: FragmentRecord? {
        guard let session, session.cursor < session.fragmentIds.count else { return nil }
        let id = session.fragmentIds[session.cursor]
        return fragments.first { $0.id == id }
    }

    /// A session that can be picked up again (今日 shows 继续复习 n/m).
    var resumableSession: ReviewSessionState? {
        guard let session, session.cursor < session.fragmentIds.count else { return nil }
        return session
    }

    // ── the card on screen (desktop.md §5.1, §5.3) ───────────────────────

    /// 提示 n/4 → 再给一级提示. Any rung counts as a hint used.
    func openNextHint() {
        guard currentFragment != nil, !card.revealed, card.hintLevel < REVIEW_HINT_LEVELS else { return }
        setCard(ReviewCardState(fragmentId: card.fragmentId, hintLevel: card.hintLevel + 1, revealed: false))
    }

    func revealCard() {
        guard currentFragment != nil, !card.revealed else { return }
        setCard(ReviewCardState(fragmentId: card.fragmentId, hintLevel: card.hintLevel, revealed: true))
    }

    /// Rating buttons and the keys 1…4 exist only after the reveal (desktop.md §5.1): before
    /// that this does nothing. A hint opened on this card is written to the log.
    @discardableResult
    func rateCard(_ rating: ReviewRating) -> Bool {
        guard card.revealed else { return false }
        return rateCurrent(rating, usedHint: card.usedHint)
    }

    func skipCard(reason: String) {
        skipCurrent(reason: reason)
    }

    /// The card shown now is the session's current one; any state left over from another
    /// card is dropped.
    func syncCardToSession() {
        guard let current = currentFragment else {
            if card != ReviewCardState() { setCard(ReviewCardState()) }
            return
        }
        if card.fragmentId != current.id { setCard(ReviewCardState(fragmentId: current.id)) }
    }

    private func setCard(_ next: ReviewCardState) {
        card = next
        if let data = try? JSONEncoder().encode(next), next.fragmentId != nil {
            defaults.set(data, forKey: Self.cardDefaultsKey)
        } else {
            defaults.removeObject(forKey: Self.cardDefaultsKey)
        }
    }

    /// After a restart: the saved card state applies only if it still belongs to the card the
    /// restored session is on.
    private func restoreCard() {
        guard let data = defaults.data(forKey: Self.cardDefaultsKey),
            let saved = try? JSONDecoder().decode(ReviewCardState.self, from: data),
            let current = currentFragment, saved.fragmentId == current.id
        else {
            defaults.removeObject(forKey: Self.cardDefaultsKey)
            card = currentFragment.map { ReviewCardState(fragmentId: $0.id) } ?? ReviewCardState()
            return
        }
        card = saved
    }

    /// Rating commits in the store FIRST; only then does the cursor move
    /// (review.md §5). Deleted mid-session fragments are skipped with a reason.
    func rateCurrent(_ rating: ReviewRating, usedHint: Bool) -> Bool {
        guard let session, session.cursor < session.fragmentIds.count else { return false }
        let id = session.fragmentIds[session.cursor]
        // Fragment deleted in another window: skip, do not crash the session.
        let existing: FragmentRecord? = (try? store.getFragment(id: id)) ?? nil
        guard existing != nil else {
            skipCurrent(reason: t(.skipDeleted))
            return false
        }
        do {
            _ = try store.rateFragment(id: id, rating: rating, usedHint: usedHint, now: clock())
        } catch {
            return false
        }
        reload()  // the new review state and log
        // The reload may itself have moved the session (a later card was deleted); advance the
        // live one, not the copy taken before.
        guard var live = self.session, live.cursor < live.fragmentIds.count, live.fragmentIds[live.cursor] == id else {
            syncCardToSession()
            return true
        }
        live.cursor += 1
        self.session = live
        persistSession()
        finishSessionIfComplete()
        syncCardToSession()
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
        syncCardToSession()
    }

    /// The last card ends the session: keep its facts for the wrap-up screen,
    /// then drop the persisted session so 今日 stops offering to resume it.
    private func finishSessionIfComplete() {
        guard let session, session.cursor >= session.fragmentIds.count else { return }
        wrapUp = sessionWrapUp(session: session, logs: reviewLogs, fragments: fragments, now: clock())
        self.session = nil
        defaults.removeObject(forKey: Self.sessionDefaultsKey)
        defaults.removeObject(forKey: Self.cardDefaultsKey)
    }

    private func pruneFinishedSession() {
        guard let session else { return }
        if session.cursor >= session.fragmentIds.count {
            self.session = nil
            defaults.removeObject(forKey: Self.sessionDefaultsKey)
        }
    }

    private func persistSession() {
        guard let session else { return }
        if let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: Self.sessionDefaultsKey)
        }
    }

    private func restoreSession() {
        guard let data = defaults.data(forKey: Self.sessionDefaultsKey),
            let restored = try? JSONDecoder().decode(ReviewSessionState.self, from: data)
        else { return }
        session = restored
    }

    // ── library ──────────────────────────────────────────────────────────

    func deleteLocal(_ id: String) {
        try? store.deleteFragment(id: id, now: clock())
        reload()
    }

    /// 批量删除: one transaction, then a single refresh. Returns how many were deleted.
    @discardableResult
    func deleteLocal(ids: [String]) -> Int {
        let deleted = (try? store.deleteFragments(ids: ids, now: clock())) ?? 0
        reload()
        return deleted
    }

    /// 批量添加标签 / 移除标签: Desktop-local (see LocalTags.swift), never sent to the extension.
    func editTags(add: Bool, tags: [String], ids: [String]) -> BatchTagResult? {
        defer { reload() }
        if add { return try? store.addLocalTags(tags, to: ids, now: clock()) }
        return try? store.removeLocalTags(tags, from: ids, now: clock())
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
        if hubFailed {
            items.append(t(.attentionHubDown, ["state": hubState]))
        }
        if missingAttachmentCount > 0 {
            items.append(t(.attentionMissingImages, ["count": missingAttachmentCount]))
        }
        if let last = recentDeliveries.last, last.status == 401 {
            items.append(t(.attentionRejected))
        }
        return items
    }
}
