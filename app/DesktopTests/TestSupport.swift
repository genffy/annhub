// Shared fixtures for the Desktop tests: a clock the tests move by hand, valid fragments of
// the kinds a review exercises, an isolated model, and a small HTTP client for the real hub.
//
// Every model built here has its own in-memory store, its own UserDefaults suite and port 0
// (the system picks a free one), so a test run can never touch the user's data or collide with
// a Desktop that is already running on 8765.

import AnnHubCore
import XCTest

let T0 = 1_790_000_000_000
let HOUR = 3_600_000
let DAY = 86_400_000

final class TestClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Int

    init(_ start: Int = T0) { current = start }

    var now: Int {
        lock.lock()
        defer { lock.unlock() }
        return current
    }

    func advance(by ms: Int) {
        lock.lock()
        defer { lock.unlock() }
        current += ms
    }
}

// ── fragments ────────────────────────────────────────────────────────────

func makeRecord(
    kind: String = "concept", content: String = "Backpressure", guess: String? = nil,
    use: String = "检查事件管道为什么在消费者变慢后耗尽内存",
    tags: [String] = ["streams"], host: String = "engineering.example.com", now: Int = T0
) throws -> FragmentRecord {
    let detail: FragmentDetail
    switch kind {
    case "claim":
        detail = .claim(ClaimDetail(stance: "uncertain", evidence: ["团队边界的三个例子"], assumptions: ["组织稳定"]))
    case "procedure":
        detail = .procedure(ProcedureDetail(steps: ["确认影响", "限制扩散", "保存证据"], failureModes: ["过早重启"]))
    case "decision":
        detail = .decision(DecisionDetail(rationale: "协作会引入账号与冲突复杂度", alternatives: ["共享文件"]))
    case "question":
        detail = .question(QuestionDetail(status: "open", hypothesis: "分流降低放弃率"))
    case "inspiration":
        detail = .inspiration(InspirationDetail(form: "idea"))
    case "concept":
        detail = .concept(ConceptDetail(definition: "下游把处理能力回传给上游", boundaries: ["不等于固定速率限流"]))
    default:
        preconditionFailure("makeRecord has no detail for kind \(kind)")
    }
    return try createFragment(
        CreateFragmentInput(
            kind: kind,
            content: content,
            context: FragmentContextInput(
                excerpt: "In streams, \(content) lets the consumer signal demand upstream.",
                sourceUrl: "https://\(host)/posts/\(UUID().uuidString.prefix(8))", sourceHost: host,
                sourceTitle: "Notes on \(content)"),
            processing: FragmentProcessing(
                guess: guess, verified: VerifiedResult(confirmedAt: now, source: "source-material", summary: "对照了原文"),
                use: use),
            detail: detail, tags: tags, now: now))
}

/// The four kinds scenario C (examples.md §5) reviews, in a fixed order.
func scenarioCRecords(now: Int = T0) throws -> [FragmentRecord] {
    [
        try makeRecord(kind: "concept", content: "Backpressure", now: now - 4000),
        try makeRecord(kind: "claim", content: "Most microservice failures are organizational", now: now - 3000),
        try makeRecord(kind: "procedure", content: "Production incident triage", now: now - 2000),
        try makeRecord(kind: "decision", content: "首版不做实时协作", now: now - 1000),
    ]
}

// ── an isolated model ────────────────────────────────────────────────────

@MainActor
struct Harness {
    let model: DesktopModel
    let store: FragmentStore
    let defaults: UserDefaults
    let suite: String
    let clock: TestClock

    /// Another model over the SAME store and preferences: what a relaunch looks like.
    func relaunched(config: DesktopLaunchConfig? = nil) -> DesktopModel {
        DesktopModel(store: store, defaults: defaults, config: config ?? model.config, clock: { clock.now })
    }

    func stop() {
        model.stopHub()
        defaults.removePersistentDomain(forName: suite)
    }
}

@MainActor
func makeHarness(
    fragments: [FragmentRecord] = [], config: DesktopLaunchConfig? = nil, clock: TestClock = TestClock(),
    storeError: String? = nil
) throws -> Harness {
    let suite = "annhub.desktop.test.\(UUID().uuidString)"
    let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
    let store = try FragmentStore(inMemoryDeviceId: "mac-test")
    for record in fragments {
        try store.upsertFragment(record, deviceId: "ext-test", payloadHash: "h-\(record.id)")
    }
    let config = config ?? DesktopLaunchConfig(port: 0, notificationsEnabled: false)
    let model = DesktopModel(
        store: store, defaults: defaults, config: config, storeError: storeError, clock: { clock.now })
    return Harness(model: model, store: store, defaults: defaults, suite: suite, clock: clock)
}

// ── waiting ──────────────────────────────────────────────────────────────

/// Polls `condition` on the main actor until it holds or `timeout` passes.
@MainActor
func waitUntil(timeout: TimeInterval = 8, _ message: String = "", condition: () -> Bool) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if condition() { return true }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return condition()
}

// ── the real hub over HTTP ───────────────────────────────────────────────

struct HubClient {
    let port: UInt16
    let token: String
    var origin: String? = "chrome-extension://" + String(repeating: "a", count: 32)

    private var session: URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.connectionProxyDictionary = [:]
        configuration.timeoutIntervalForRequest = 15
        return URLSession(configuration: configuration)
    }

    func request(
        _ method: String, _ path: String, token: String? = nil, headers: [String: String] = [:], body: Data? = nil
    ) async throws -> (status: Int, json: [String: Any]) {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(token ?? self.token)", forHTTPHeaderField: "Authorization")
        if let origin { request.setValue(origin, forHTTPHeaderField: "Origin") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (status, (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:])
    }

    /// What the extension's `flushPendingDeliveries` sends for one fragment.
    @discardableResult
    func put(_ record: FragmentRecord, token: String? = nil) async throws -> Int {
        let wire = toFragmentWire(record)
        let body = try JSONEncoder().encode(WireValue.object(["deviceId": .string("ext-e2e"), "fragment": wire]))
        return try await request(
            "PUT", "/v1/fragments/\(record.id)", token: token,
            headers: ["Content-Type": "application/json", "X-AnnHub-Sha256": fragmentWireHash(wire)], body: body
        ).status
    }
}

@MainActor
extension Harness {
    /// Starts the model's hub on a free port and returns a client for it.
    func startHub() async throws -> HubClient {
        model.startHub()
        let ready = await waitUntil { model.hubListening }
        XCTAssertTrue(ready, "the hub should come up: \(model.hubState)")
        return HubClient(port: try XCTUnwrap(model.hubPort), token: model.pairToken)
    }
}
