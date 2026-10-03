// Optional L4 output feedback via an OpenAI-compatible chat completions API —
// docs/v2/ai.md. LLM is OPTIONAL: every failure degrades to 待确认 and never
// blocks task completion; the model never writes `correct=false` on its own
// authority, and its output is recorded with modelId + promptVersion.
//
// Minimal egress (ai.md §2 输出反馈): the user's current submission and the
// target fragments only — no review history, no unrelated fragments, no
// attachments. API keys never enter logs or sync events. Before ANY call the
// UI shows the pre-send preview built by `buildLlmFeedbackPreview` (ai.md §5
// 单次外发前可预览) and results are cached per (task, submission,
// promptVersion, modelId) (ai.md §6 缓存相同输入与 Prompt 版本的结果).

import Foundation

/// Bumped v2: the JSON example gained the optional task-level
/// overallFeedback / suggestedRevision fields (and lost a stray '}').
/// Prompt behavior is pinned per version — never change it silently.
public let outputFeedbackPromptVersion = "output-feedback-v2"

public enum LlmFeedbackError: Error, Equatable, Sendable {
    /// No provider configured (baseUrl/apiKey/model empty) — degrade locally.
    case unconfigured
    /// Transport failure (offline, timeout).
    case network
    /// Non-200 HTTP status (auth failure, quota…).
    case http(Int)
    /// Response was not valid JSON / could not be extracted.
    case parse
    /// JSON parsed but failed the schema (unknown fragmentId, bad shape).
    case schema
}

/// One submission's model output: per-fragment suggestions plus the optional
/// task-level strings from the envelope. None of it auto-confirms anything.
public struct LlmFeedbackResult: Equatable, Sendable {
    public var assessments: [FragmentUseAssessment]
    public var overallFeedback: String?
    public var suggestedRevision: String?

    public init(
        assessments: [FragmentUseAssessment],
        overallFeedback: String? = nil,
        suggestedRevision: String? = nil
    ) {
        self.assessments = assessments
        self.overallFeedback = overallFeedback
        self.suggestedRevision = suggestedRevision
    }
}

public protocol LlmFeedbackProviding: Sendable {
    /// Per-submission model suggestions; pure w.r.t. store state — callers
    /// merge via mergeLlmAssessments.
    func provide(
        task: WritingTaskRecord,
        fragments: [FragmentRecord],
        submission: OutputSubmission
    ) async -> Result<LlmFeedbackResult, LlmFeedbackError>
}

public struct LlmProviderConfig: Equatable, Codable, Sendable {
    public var baseUrl: String
    public var apiKey: String
    public var model: String

    public init(baseUrl: String = "", apiKey: String = "", model: String = "") {
        self.baseUrl = baseUrl
        self.apiKey = apiKey
        self.model = model
    }

    public var isConfigured: Bool {
        !baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !apiKey.isEmpty
            && !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

// ── pre-send preview (ai.md §5) ───────────────────────────────────────────

/// Exactly what the preview sheet shows AND what leaves the machine: the task
/// prompt, the target fragments (content + kind only) and the submission
/// text. Pure builder — the sheet renders this before 确认发送.
public struct LlmFeedbackPreview: Equatable, Sendable {
    public struct Target: Equatable, Sendable {
        public var fragmentId: String
        public var content: String
        public var kind: String

        public init(fragmentId: String, content: String, kind: String) {
            self.fragmentId = fragmentId
            self.content = content
            self.kind = kind
        }
    }

    public var taskPrompt: String
    public var targets: [Target]
    public var submissionContent: String

    public init(taskPrompt: String, targets: [Target], submissionContent: String) {
        self.taskPrompt = taskPrompt
        self.targets = targets
        self.submissionContent = submissionContent
    }
}

public func buildLlmFeedbackPreview(
    task: WritingTaskRecord,
    fragments: [FragmentRecord],
    submission: OutputSubmission
) -> LlmFeedbackPreview {
    let byId = Dictionary(fragments.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    return LlmFeedbackPreview(
        taskPrompt: task.prompt,
        targets: task.fragmentIds.compactMap { id in
            byId[id].map { LlmFeedbackPreview.Target(fragmentId: id, content: $0.content, kind: $0.kind) }
        },
        submissionContent: submission.content
    )
}

// ── result cache (ai.md §6) ───────────────────────────────────────────────

/// Cache of LLM feedback keyed by (task id, submission id, promptVersion,
/// modelId): repeated clicks on the same submission must not re-call the
/// provider; a new submission naturally misses (different submission id) and
/// `invalidateTask` clears a task's entries when it is re-submitted.
public final class LlmFeedbackCache: @unchecked Sendable {
    public struct Key: Hashable, Sendable {
        public var taskId: String
        public var submissionId: String
        public var promptVersion: String
        public var modelId: String

        public init(taskId: String, submissionId: String, promptVersion: String, modelId: String) {
            self.taskId = taskId
            self.submissionId = submissionId
            self.promptVersion = promptVersion
            self.modelId = modelId
        }
    }

    private var storage: [Key: LlmFeedbackResult] = [:]
    private let lock = NSLock()

    public init() {}

    public func cached(
        taskId: String, submissionId: String, promptVersion: String, modelId: String
    ) -> LlmFeedbackResult? {
        lock.lock()
        defer { lock.unlock() }
        return storage[Key(
            taskId: taskId, submissionId: submissionId, promptVersion: promptVersion, modelId: modelId
        )]
    }

    public func store(
        _ result: LlmFeedbackResult,
        taskId: String, submissionId: String, promptVersion: String, modelId: String
    ) {
        lock.lock()
        defer { lock.unlock() }
        storage[Key(
            taskId: taskId, submissionId: submissionId, promptVersion: promptVersion, modelId: modelId
        )] = result
    }

    /// New submission (or task deletion) drops the task's stale entries.
    public func invalidateTask(taskId: String) {
        lock.lock()
        defer { lock.unlock() }
        storage = storage.filter { $0.key.taskId != taskId }
    }
}

/// Cache-first orchestration: reuse the stored result for the same
/// (task, submission, promptVersion, modelId); only on a miss call the
/// provider, and only successful results are cached (failures retry on the
/// next click).
public func fetchLlmFeedback(
    task: WritingTaskRecord,
    fragments: [FragmentRecord],
    submission: OutputSubmission,
    promptVersion: String,
    modelId: String,
    cache: LlmFeedbackCache,
    provider: LlmFeedbackProviding
) async -> Result<LlmFeedbackResult, LlmFeedbackError> {
    if let hit = cache.cached(
        taskId: task.id, submissionId: submission.id, promptVersion: promptVersion, modelId: modelId
    ) {
        return .success(hit)
    }
    let result = await provider.provide(task: task, fragments: fragments, submission: submission)
    if case .success(let value) = result {
        cache.store(
            value,
            taskId: task.id, submissionId: submission.id,
            promptVersion: promptVersion, modelId: modelId
        )
    }
    return result
}

// ── strict response parsing (ai.md §3: parse -> validate -> domain result) ─

struct LlmFeedbackEnvelope: Decodable {
    struct Item: Decodable {
        var fragmentId: String
        var used: Bool?
        var correct: Bool?
        var suggestion: String?
    }

    var assessments: [Item]
    var overallFeedback: String?
    var suggestedRevision: String?
}

/// Strictly parses a model response body into per-fragment assessments plus
/// the optional task-level strings (unknown keys ignored). Unknown
/// fragmentIds or an unusable shape → .schema (never raw model text into
/// business fields). Duplicate fragmentIds collapse last-wins so duplicates
/// never enter a submission.
public func parseLlmFeedbackResponse(
    _ body: Data,
    task: WritingTaskRecord,
    fragments: [FragmentRecord],
    submissionContent: String,
    modelId: String,
    now: Int? = nil
) -> Result<LlmFeedbackResult, LlmFeedbackError> {
    guard let envelope = try? JSONDecoder().decode(LlmFeedbackEnvelope.self, from: body) else {
        return .failure(.parse)
    }
    let known = Set(task.fragmentIds)
    let valid = envelope.assessments.filter { known.contains($0.fragmentId) }
    guard !envelope.assessments.isEmpty, !valid.isEmpty else { return .failure(.schema) }
    let now = now ?? currentMs()
    // Last-wins dedupe by fragmentId (TS Map semantics).
    var indexOf: [String: Int] = [:]
    var deduped: [LlmFeedbackEnvelope.Item] = []
    for item in valid {
        if let idx = indexOf[item.fragmentId] {
            deduped[idx] = item
        } else {
            indexOf[item.fragmentId] = deduped.count
            deduped.append(item)
        }
    }
    return .success(LlmFeedbackResult(
        assessments: deduped.map { item in
            FragmentUseAssessment(
                fragmentId: item.fragmentId,
                source: "llm",
                presence: fragments
                    .first { $0.id == item.fragmentId }
                    .map { presenceClue(fragmentContent: $0.content, in: submissionContent) },
                used: item.used,
                correct: item.correct,
                suggestion: item.suggestion,
                modelId: modelId,
                promptVersion: outputFeedbackPromptVersion,
                confirmedByUser: false,
                assessedAt: now
            )
        },
        overallFeedback: envelope.overallFeedback,
        suggestedRevision: envelope.suggestedRevision
    ))
}

// ── OpenAI-compatible provider (chat completions) ────────────────────────

public final class OpenAICompatibleLlmFeedback: LlmFeedbackProviding, @unchecked Sendable {
    public var config: LlmProviderConfig
    public var promptVersion: String { outputFeedbackPromptVersion }
    private let session: URLSession

    public init(config: LlmProviderConfig, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    public func provide(
        task: WritingTaskRecord,
        fragments: [FragmentRecord],
        submission: OutputSubmission
    ) async -> Result<LlmFeedbackResult, LlmFeedbackError> {
        guard config.isConfigured else { return .failure(.unconfigured) }
        let request: URLRequest
        do {
            request = try buildRequest(task: task, fragments: fragments, submission: submission)
        } catch {
            return .failure(.unconfigured)
        }
        let data: Data
        let status: Int
        do {
            let (body, response) = try await session.data(for: request)
            data = body
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            return .failure(.network)
        }
        guard status == 200 else { return .failure(.http(status)) }
        // Chat completions wrap the payload in choices[0].message.content —
        // extract the inner JSON (one strict parse, no retry; ai.md §3).
        let inner: Data
        do {
            let decoded = try JSONDecoder().decode(ChatCompletionResponse.self, from: data)
            guard let text = decoded.choices.first?.message.content,
                  let stripped = stripCodeFence(text).data(using: .utf8)
            else { return .failure(.parse) }
            inner = stripped
        } catch {
            return .failure(.parse)
        }
        return parseLlmFeedbackResponse(
            inner, task: task, fragments: fragments,
            submissionContent: submission.content, modelId: config.model
        )
    }

    struct ChatCompletionResponse: Decodable {
        struct Choice: Decodable {
            struct Message: Decodable {
                var content: String?
            }

            var message: Message
        }

        var choices: [Choice]
    }

    func buildRequest(
        task: WritingTaskRecord, fragments: [FragmentRecord], submission: OutputSubmission
    ) throws -> URLRequest {
        var base = config.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        if base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: "\(base)/chat/completions") else {
            throw LlmFeedbackError.unconfigured
        }
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // The key rides the Authorization header only — never logged, never
        // persisted to the store or sync events.
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")

        let targetIds = task.fragmentIds
        let byId = Dictionary(fragments.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        // Minimal egress: content + kind only (ai.md §2) — the same fields
        // the pre-send preview shows.
        let targets = targetIds.compactMap { byId[$0] }
            .map { f in
                "{\"fragmentId\":\(jsonString(f.id)),\"content\":\(jsonString(f.content)),\"kind\":\(jsonString(f.kind))}"
            }
            .joined(separator: ",")
        let system = "你是写作反馈助手。逐条判断每个目标碎片在用户正文中的使用情况。"
            + "只输出 JSON：{\"assessments\":[{\"fragmentId\":string,\"used\":boolean|null,\"correct\":boolean|null,\"suggestion\":string|null}],"
            + "\"overallFeedback\":string|null,\"suggestedRevision\":string|null}。"
            + "无法可靠判断时对应字段用 null，不要编造。"
        let user = "任务提示：\(task.prompt)\n目标碎片：[\(targets)]\n用户正文：\(jsonString(submission.content))"
        let body: [String: Any] = [
            "model": config.model,
            "temperature": 0.2,
            "response_format": ["type": "json_object"],
            "messages": [
                ["role": "system", "content": system],
                ["role": "user", "content": user],
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        return request
    }

    func stripCodeFence(_ text: String) -> String {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("```") {
            if let firstNewline = trimmed.firstIndex(of: "\n") {
                trimmed = String(trimmed[trimmed.index(after: firstNewline)...])
            }
            if trimmed.hasSuffix("```") {
                trimmed = String(trimmed.dropLast(3))
            }
        }
        return trimmed.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

func jsonString(_ value: String) -> String {
    let data = (try? JSONEncoder.learningCore().encode(value)) ?? Data("\"\"".utf8)
    return String(data: data, encoding: .utf8) ?? "\"\""
}
