// AnnHub Desktop — native macOS menu-bar app and local learning client.
// R2/R3/R4: five-page navigation (今日 / 碎片库 / 输出工坊 / 关系 / 系统),
// the review session (visual occlusion + media-clip), the output workshop
// with layered feedback, confirmed relations, and the localhost hub with
// bidirectional sync endpoints.

import SwiftUI
import Network
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

/// Sync bookkeeping for the system page (R3).
struct DesktopSyncInfo: Equatable {
    var pendingChanges = 0
    var pulledCursor = 0
    var lastPulledAt: Int?
    var events = EventsStats()
}

@MainActor
final class DesktopModel: ObservableObject {
    static let sessionDefaultsKey = "annhub.desktop.reviewSession"
    static let pairTokenDefaultsKey = "annhub.desktop.pairToken"
    static let llmDefaultsKey = "annhub.desktop.llmProvider"
    static let dailyLimitDefaultsKey = "annhub.desktop.dailyLimit"

    @Published var fragments: [FragmentRecord] = []
    @Published var reviewLogs: [ReviewLog] = []
    @Published var writingTasks: [WritingTaskRecord] = []
    @Published var relations: [FragmentRelation] = []
    @Published var suppressions: [RelationSuppression] = []
    @Published var syncInfo = DesktopSyncInfo()
    @Published var llmSettings = LlmProviderConfig() {
        didSet { persistLlmSettings() }
    }
    /// 每日复习上限 (review.md §5 / metrics.md §6.2), clamped to 5...50 and
    /// persisted in UserDefaults; the 系统页 exposes the stepper.
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
    @Published var stats = StoreStats(
        fragments: 0, reviewLogs: 0, writingTasks: 0,
        relations: 0, assets: 0, outbox: 0, deletions: 0
    )
    @Published var hubState = "未启动"
    @Published var session: ReviewSessionState?
    @Published var detailFragment: FragmentRecord?

    let store: FragmentStore
    let hub: DesktopHub
    private var server: HubServer?
    private var draftSaveTask: Task<Void, Never>?
    /// ai.md §6: cached per (task, submission, promptVersion, modelId) so a
    /// repeated click never re-calls the provider.
    private let llmFeedbackCache = LlmFeedbackCache()

    /// Shared instance: strongly held so the hub starts with the app even
    /// before MenuBarExtra first evaluates its content.
    static let shared: DesktopModel = live()

    static func live() -> DesktopModel {
        let appSupport = URL.applicationSupportDirectory.appending(path: "AnnHub")
        try? FileManager.default.createDirectory(at: appSupport, withIntermediateDirectories: true)
        let store = (try? FragmentStore(
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
        // Pairing (storage.md §8): the Desktop adopts the first token the
        // extension presents; an adopted token is remembered across launches.
        let stored = UserDefaults.standard.string(forKey: Self.pairTokenDefaultsKey) ?? ""
        self.hub = DesktopHub(store: store, pairToken: stored)
        self.dailyLimit = clampedDailyLimit(
            UserDefaults.standard.integer(forKey: Self.dailyLimitDefaultsKey) == 0
                ? DAILY_LIMIT_DEFAULT
                : UserDefaults.standard.integer(forKey: Self.dailyLimitDefaultsKey)
        )
        loadLlmSettings()
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

    var pairToken: String { hub.pairToken }

    func syncPairToken() {
        let token = hub.pairToken
        if token != UserDefaults.standard.string(forKey: Self.pairTokenDefaultsKey) {
            UserDefaults.standard.set(token, forKey: Self.pairTokenDefaultsKey)
        }
    }

    func reload() {
        fragments = (try? store.getFragments()) ?? []
        reviewLogs = (try? store.getReviewLogs()) ?? []
        writingTasks = (try? store.getWritingTasks()) ?? []
        relations = (try? store.getRelations()) ?? []
        suppressions = (try? store.getSuppressions()) ?? []
        stats = (try? store.stats()) ?? stats
        syncInfo = DesktopSyncInfo(
            pendingChanges: (try? store.pendingChangeCount()) ?? 0,
            pulledCursor: store.pulledCursor(),
            lastPulledAt: store.lastPulledAt(),
            events: hub.eventsStats
        )
        syncPairToken()
        pruneFinishedSession()
    }

    // ── derived state ────────────────────────────────────────────────────

    var dueQueue: [FragmentRecord] {
        buildDailyQueue(fragments, now: nowMs(), dailyLimit: dailyLimit)
    }

    var estimatedMinutes: Int {
        Int(ceil(Double(dueQueue.count * SESSION_SECONDS_PER_CARD) / 60))
    }

    var latestFragments: [FragmentRecord] {
        Array(fragments.sorted { $0.createdAt > $1.createdAt }.prefix(5))
    }

    // ── review session (desktop.md §5) ───────────────────────────────────

    @discardableResult
    func startReviewSession() -> Bool {
        let now = nowMs()
        let queue = dueQueue
        guard !queue.isEmpty else { return false }
        let cap = sessionCap(dailyRemaining: queue.count)
        let ids = Array(queue.prefix(cap).map(\.id))
        session = ReviewSessionState(
            sessionId: newId(),
            fragmentIds: ids,
            cursor: 0,
            startedAt: now,
            skipped: []
        )
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
        return true
    }

    func skipCurrent(reason: String) {
        guard var session, session.cursor < session.fragmentIds.count else { return }
        let id = session.fragmentIds[session.cursor]
        session.skipped.append(ReviewSessionSkip(fragmentId: id, reason: reason))
        session.cursor += 1
        self.session = session
        persistSession()
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

    var deliveredFragmentCount: Int {
        // Fragments delivered by the extension carry a device id; Desktop's
        // own creations carry the desktop-local constant instead.
        fragments.filter { fragment in
            if let delivery = try? store.fragmentDelivery(id: fragment.id) {
                return !delivery.deviceId.isEmpty && delivery.deviceId != desktopLocalDeviceId
            }
            return false
        }.count
    }

    var recentDeliveries: [DeliveryOutcome] {
        hub.recentDeliveries
    }

    var lastConnectionAt: Int? { hub.lastConnectionAt }

    // ── output workshop (desktop.md §6, R2.1) ────────────────────────────

    var resumableDrafts: [WritingTaskRecord] {
        writingTasks.filter { task in
            taskStatus(task).draftWords > 0 && task.submissions.isEmpty
        }
    }

    var appliedFragmentIds: Set<String> { AnnHubCore.appliedFragmentIds(writingTasks) }
    var incorrectFragmentIds: Set<String> { AnnHubCore.incorrectFragmentIds(writingTasks) }

    /// Reverse recommendation for the 主入口 (desktop.md §6.1 entry 3).
    func recommendForTask(_ text: String) -> [TaskRecommendation] {
        AnnHubCore.recommendForTask(
            text,
            fragments,
            options: RecommendForTaskOptions(
                relatedTo: { [weak self] id in
                    self?.confirmedRelations(id).map {
                        $0.fromFragmentId == id ? $0.toFragmentId : $0.fromFragmentId
                    } ?? []
                },
                appliedFragmentIds: appliedFragmentIds,
                incorrectFragmentIds: incorrectFragmentIds,
                now: nowMs()
            )
        )
    }

    @discardableResult
    func createWritingTask(type: String, topic: String, fragmentIds: [String]) -> WritingTaskRecord? {
        let task = AnnHubCore.createWritingTask(CreateWritingTaskInput(
            taskType: type, topic: topic, fragmentIds: fragmentIds, now: nowMs()
        ))
        do {
            _ = try store.saveWritingTask(task)
            reload()
            return task
        } catch {
            return nil
        }
    }

    /// Draft autosave, debounced ~500ms (desktop.md §6.3); every save lands
    /// in the store transactionally with its change-feed row.
    func autosaveDraft(taskId: String, content: String) {
        draftSaveTask?.cancel()
        draftSaveTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            saveDraft(taskId: taskId, content: content)
        }
    }

    func saveDraft(taskId: String, content: String) {
        guard var task = writingTasks.first(where: { $0.id == taskId }) else { return }
        task.draftContent = content
        task.updatedAt = nowMs()
        try? store.saveWritingTask(task)
        reload()
    }

    /// Sheet dismissal flushes the pending debounce SYNCHRONOUSLY (output.md
    /// §4: the user must not lose typed text to the 500ms timer). Already
    /// submitted tasks never re-populate draftContent.
    func flushDraftOnDismiss(taskId: String, content: String) {
        draftSaveTask?.cancel()
        draftSaveTask = nil
        guard let task = writingTasks.first(where: { $0.id == taskId }),
              task.submissions.isEmpty
        else { return }
        saveDraft(taskId: taskId, content: content)
    }

    @discardableResult
    func submitTask(taskId: String, content: String) -> WritingTaskRecord? {
        // A late autosave must not re-populate draftContent on the submitted
        // task (output.md §4) — cancel the pending debounce first.
        draftSaveTask?.cancel()
        draftSaveTask = nil
        guard var task = writingTasks.first(where: { $0.id == taskId }) else { return nil }
        task = appendSubmission(task, content, now: nowMs())
        task = seedLocalPresence(task, fragments)
        do {
            _ = try store.saveWritingTask(task)
            llmFeedbackCache.invalidateTask(taskId: taskId)
            reload()
            return task
        } catch {
            return nil
        }
    }

    /// Per-fragment user confirmation → merged into the last submission.
    func confirmFragmentUse(taskId: String, confirmations: [AssessmentConfirmation]) {
        guard var task = writingTasks.first(where: { $0.id == taskId }) else { return }
        task = confirmAssessments(task, confirmations, now: nowMs())
        try? store.saveWritingTask(task)
        reload()
    }

    /// One-click question Fragment from feedback (R2.1): saved locally with a
    /// fragment.created change row so it syncs to the extension.
    @discardableResult
    func createQuestionFromFeedback(
        task: WritingTaskRecord, fragment: FragmentRecord, feedback: String
    ) -> FragmentRecord? {
        let draft = questionDraftFromFeedback(task, fragment, feedback, now: nowMs())
        do {
            let record = try store.saveFragment(CreateFragmentInput(
                kind: draft.kind,
                content: draft.content,
                context: FragmentContextInput(
                    excerpt: draft.excerpt,
                    sourceUrl: draft.sourceUrl,
                    sourceHost: "writing-task",
                    sourceTitle: draft.sourceTitle,
                    capturedAt: nowMs()
                ),
                processing: FragmentProcessing(verified: draft.verified, use: draft.use),
                detail: .question(draft.detail),
                now: nowMs()
            ))
            reload()
            return record
        } catch {
            return nil
        }
    }

    /// Target slots in task order; a locally deleted fragment stays as nil so
    /// its 待确认 state remains visible (storage.md §10) — mirrors how
    /// relations already render deleted endpoints as 已删除碎片.
    func taskFragmentSlots(_ task: WritingTaskRecord) -> [FragmentRecord?] {
        task.fragmentIds.map { id in fragments.first { $0.id == id } }
    }

    /// Days from capture to first confirmed application (R2.3); nil = 从未应用.
    func daysToFirstApplication(_ fragment: FragmentRecord) -> Int? {
        AnnHubCore.daysToFirstApplication(fragment, writingTasks)
    }

    // ── relations (desktop.md §7, R2.2) ──────────────────────────────────

    var relationSuggestions: [RelationSuggestion] {
        suggestRelations(
            fragments,
            options: SuggestRelationsOptions(suppressions: suppressions, existing: relations)
        )
    }

    var confirmedRelationCount: Int {
        relations.filter { $0.status == "confirmed" }.count
    }

    /// Confirmed relations touching one endpoint, either direction.
    func confirmedRelations(_ fragmentId: String) -> [FragmentRelation] {
        relations.filter {
            $0.status == "confirmed" && ($0.fromFragmentId == fragmentId || $0.toFragmentId == fragmentId)
        }
    }

    /// The other endpoint of a relation, resolved to its record when present.
    func relationEndpointSummary(_ relation: FragmentRelation, of fragmentId: String) -> String {
        let otherId = relation.fromFragmentId == fragmentId ? relation.toFragmentId : relation.fromFragmentId
        if let other = fragments.first(where: { $0.id == otherId }) {
            return String(other.content.prefix(60))
        }
        return "已删除碎片（\(otherId)）"
    }

    func acceptSuggestion(_ suggestion: RelationSuggestion, type: String? = nil, note: String? = nil) {
        let relation = confirmSuggestion(suggestion, type: type, note: note, now: nowMs())
        try? store.saveRelation(relation)
        reload()
    }

    /// 拒绝 → local suppression + suppression.sync change row (R2.2/R3).
    func rejectSuggestion(_ suggestion: RelationSuggestion) {
        let suppression = AnnHubCore.rejectSuggestion(
            suggestion, reason: "用户拒绝建议", now: nowMs()
        )
        try? store.saveSuppression(suppression)
        reload()
    }

    /// 建立关系 from a fragment detail (desktop.md §7.2) — always confirmed;
    /// saving clears any suppression for the pair (re-establish).
    func establishRelation(from: String, to: String, type: String, note: String?) {
        let relation = createManualRelation(from: from, to: to, type: type, note: note, now: nowMs())
        try? store.saveRelation(relation)
        reload()
    }

    func removeRelation(_ relationId: String) {
        try? store.deleteRelation(id: relationId, now: nowMs())
        reload()
    }

    // ── LLM provider settings (ai.md; optional, default OFF) ────────────

    private func loadLlmSettings() {
        if let data = UserDefaults.standard.data(forKey: Self.llmDefaultsKey),
           let config = try? JSONDecoder().decode(LlmProviderConfig.self, from: data) {
            llmSettings = config
        }
    }

    private func persistLlmSettings() {
        if let data = try? JSONEncoder().encode(llmSettings) {
            UserDefaults.standard.set(data, forKey: Self.llmDefaultsKey)
        }
    }

    /// ai.md §5 单次外发前可预览: exactly what the preview sheet lists and
    /// what leaves the machine (task prompt, target fragment 内容+kind,
    /// submission text). Pure builder — no HTTP before 确认发送.
    func llmFeedbackPreview(taskId: String) -> LlmFeedbackPreview? {
        guard let task = writingTasks.first(where: { $0.id == taskId }),
              let submission = task.submissions.last
        else { return nil }
        return buildLlmFeedbackPreview(task: task, fragments: fragments, submission: submission)
    }

    /// 反馈视图的「LLM 反馈」按钮 (desktop.md §6.4 layer 3), called only after
    /// the user confirms the pre-send preview. Cache-first (ai.md §6): a
    /// repeated click on the same submission never re-calls the provider.
    /// Failure degrades to 待确认 and never blocks completion (ai.md §1).
    func requestLlmFeedback(taskId: String) async -> String {
        guard llmSettings.isConfigured else { return "未配置 LLM Provider，保持待确认" }
        guard let task = writingTasks.first(where: { $0.id == taskId }),
              let submission = task.submissions.last
        else { return "没有可分析的提交版本" }
        let provider = OpenAICompatibleLlmFeedback(config: llmSettings)
        let result = await fetchLlmFeedback(
            task: task,
            fragments: fragments,
            submission: submission,
            promptVersion: provider.promptVersion,
            modelId: llmSettings.model,
            cache: llmFeedbackCache,
            provider: provider
        )
        switch result {
        case .success(let feedback):
            var updated = task
            updated = mergeLlmAssessments(
                updated,
                feedback.assessments,
                overallFeedback: feedback.overallFeedback,
                suggestedRevision: feedback.suggestedRevision,
                now: nowMs()
            )
            try? store.saveWritingTask(updated)
            reload()
            return "模型反馈已合并（\(feedback.assessments.count) 条，待你确认）"
        case .failure(let error):
            return "模型反馈不可用，保持待确认（\(llmErrorLabel(error))）"
        }
    }

    private func llmErrorLabel(_ error: LlmFeedbackError) -> String {
        switch error {
        case .unconfigured: return "未配置"
        case .network: return "网络错误"
        case .http(let status): return "HTTP \(status)"
        case .parse: return "响应解析失败"
        case .schema: return "响应格式不符合"
        }
    }

    /// 设置区「测试连接」— reports reachability/auth only, never the key.
    func testLlmConnection() async -> String {
        guard llmSettings.isConfigured else { return "未配置完整（baseUrl / apiKey / model）" }
        let probe = WritingTaskRecord(
            id: "probe", fragmentIds: [], taskType: "article", prompt: "连接测试",
            constraints: [], draftContent: "",
            submissions: [OutputSubmission(
                id: "probe", content: "连接测试", submittedAt: nowMs(), assessments: []
            )],
            createdAt: nowMs(), updatedAt: nowMs()
        )
        let provider = OpenAICompatibleLlmFeedback(config: llmSettings)
        switch await provider.provide(task: probe, fragments: [], submission: probe.submissions[0]) {
        case .success:
            return "连接成功"
        case .failure(.network):
            return "无法连接（网络错误）"
        case .failure(.http(401)), .failure(.http(403)):
            return "鉴权失败（检查 API Key）"
        case .failure(.http(let status)):
            return "服务返回 HTTP \(status)"
        case .failure(.parse), .failure(.schema):
            return "连接成功（探测响应非预期格式）"
        case .failure(.unconfigured):
            return "未配置完整（baseUrl / apiKey / model）"
        }
    }
}

func nowMs() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
}

// ── menu bar panel ───────────────────────────────────────────────────────

struct MenuBarPanel: View {
    @EnvironmentObject var model: DesktopModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AnnHub 本地中枢").font(.headline)
            LabeledContent("中枢地址") { Text(model.hubState) }
            LabeledContent("到期复习") { Text("\(model.dueQueue.count)") }
            LabeledContent("碎片总数") { Text("\(model.fragments.count)") }
            LabeledContent("最近连接") {
                if let at = model.lastConnectionAt {
                    Text(Date(timeIntervalSince1970: Double(at) / 1000), style: .time)
                } else {
                    Text("暂无")
                }
            }
            Divider()
            Button("打开主窗口") {
                NSApp.activate(ignoringOtherApps: true)
                for window in NSApp.windows where window.canBecomeMain {
                    window.makeKeyAndOrderFront(nil)
                }
            }
            Button("退出 AnnHub") { NSApp.terminate(nil) }
        }
        .padding(12)
        .frame(width: 300)
        .onAppear { model.startHub() }
    }
}

// MARK: - Hub server (thin NWListener transport; protocol logic in DesktopHub)

final class HubServer: @unchecked Sendable {
    private let port: UInt16
    private let hub: DesktopHub
    private var listener: NWListener?

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

    private func handle(connection: NWConnection) {
        connection.start(queue: .global())
        receive(connection: connection, buffer: Data())
    }

    private func receive(connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer + (data ?? Data())
            if let headerEnd = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(data: buffer[buffer.startIndex..<headerEnd.lowerBound], encoding: .utf8) ?? ""
                let headers = Self.parseHeaders(head)
                let method = Self.requestMethod(head)
                // The extension's GETs (fetch, no body) carry no
                // Content-Length — only body-carrying methods must declare
                // it. A PUT/POST without the header used to be treated as an
                // empty body and silently 422; reject it instead.
                guard let lengthText = headers["content-length"],
                      let contentLength = Int(lengthText.trimmingCharacters(in: .whitespaces)),
                      contentLength >= 0
                else {
                    if Self.methodCarriesBody(method) {
                        self.send(connection: connection, response: .json(400, ["error": "length required"]))
                        return
                    }
                    let request = Self.parse(head: head, body: Data())
                    self.send(connection: connection, response: self.hub.handle(request))
                    return
                }
                let bodyStart = headerEnd.upperBound
                let received = buffer.distance(from: bodyStart, to: buffer.endIndex)
                if received >= contentLength {
                    // Body = the FIRST contentLength bytes AFTER the header
                    // block (buffer.suffix(contentLength) would instead grab
                    // the tail — wrong once extra bytes trail the body).
                    let bodyEnd = buffer.index(bodyStart, offsetBy: contentLength)
                    let request = Self.parse(head: head, body: Data(buffer[bodyStart..<bodyEnd]))
                    let response = self.hub.handle(request)
                    self.send(connection: connection, response: response)
                    return
                }
            }
            if error == nil && !isComplete {
                self.receive(connection: connection, buffer: buffer)
            } else {
                connection.cancel()
            }
        }
    }

    static func requestMethod(_ head: String) -> String {
        let requestLine = head.split(separator: "\r\n").first?.split(separator: " ") ?? []
        return requestLine.isEmpty ? "GET" : String(requestLine[0])
    }

    /// PUT/POST carry protocol bodies and MUST declare Content-Length; GET
    /// (health / changes) is legitimately bodyless.
    static func methodCarriesBody(_ method: String) -> Bool {
        method.uppercased() == "PUT" || method.uppercased() == "POST"
    }

    static func parseHeaders(_ head: String) -> [String: String] {
        var headers: [String: String] = [:]
        for line in head.split(separator: "\r\n").dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2 {
                headers[parts[0].lowercased()] = parts[1].trimmingCharacters(in: .whitespaces)
            }
        }
        return headers
    }

    static func parse(head: String, body: Data) -> HubRequest {
        let lines = head.split(separator: "\r\n").map(String.init)
        let requestLine = lines.first?.split(separator: " ") ?? []
        let method = requestLine.count > 0 ? String(requestLine[0]) : "GET"
        let path = requestLine.count > 1 ? String(requestLine[1]) : "/"
        var headers = parseHeaders(head)
        var bearer: String?
        if let authorization = headers.removeValue(forKey: "authorization"),
           authorization.lowercased().hasPrefix("bearer ")
        {
            bearer = String(authorization.dropFirst(7))
        }
        return HubRequest(
            method: method, path: path, bearerToken: bearer,
            headers: headers, body: body.isEmpty ? nil : body
        )
    }

    private func send(connection: NWConnection, response: HubResponse) {
        var head = "HTTP/1.1 \(response.status) \(Self.reasonPhrase(response.status))\r\n"
        head += "Content-Type: \(response.contentType)\r\n"
        head += "Content-Length: \(response.body.count)\r\n"
        head += "Connection: close\r\n\r\n"
        var payload = Data(head.utf8)
        payload.append(response.body)
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    static func reasonPhrase(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 201: return "Created"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 404: return "Not Found"
        case 409: return "Conflict"
        case 410: return "Gone"
        case 413: return "Payload Too Large"
        case 422: return "Unprocessable Entity"
        case 500: return "Internal Server Error"
        default: return "OK"
        }
    }
}
