// Output workshop domain (L4) — mirrors learning-core/output.ts exactly
// (docs/v2/output.md + storage.md §3.2 + desktop.md §6). Runs on the Desktop;
// pure functions only: templates, task creation, reverse recommendation from a
// real task, local presence clues, feedback completeness and the
// question-draft bridge back into the capture pipeline.

import Foundation

func currentMs() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
}

// ── task templates (desktop.md §6.2) ────────────────────────────────────

public struct WritingTaskTemplate: Equatable, Sendable {
    public var label: String
    public var prompt: String
    public var constraints: [String]
    public var fits: String

    public init(label: String, prompt: String, constraints: [String], fits: String) {
        self.label = label
        self.prompt = prompt
        self.constraints = constraints
        self.fits = fits
    }
}

/// Users can always edit prompt/constraints. Strings match output.ts
/// byte-for-byte (`{topic}` is interpolated at creation).
public let TASK_TEMPLATES: [String: WritingTaskTemplate] = [
    "explanation": WritingTaskTemplate(
        label: "解释",
        prompt: "向指定读者解释一个问题：{topic}",
        constraints: ["先给结论", "用一个例子支撑"],
        fits: "concept、procedure"
    ),
    "analysis": WritingTaskTemplate(
        label: "分析",
        prompt: "比较观点、证据与反例：{topic}",
        constraints: ["呈现至少两种立场", "指出证据的局限"],
        fits: "claim、concept"
    ),
    "plan": WritingTaskTemplate(
        label: "计划",
        prompt: "把方法转成可执行计划：{topic}",
        constraints: ["步骤可验证", "写出失败条件"],
        fits: "procedure、decision"
    ),
    "decision": WritingTaskTemplate(
        label: "决策",
        prompt: "基于约束和证据做选择：{topic}",
        constraints: ["列备选与取舍", "定义验证信号"],
        fits: "claim、decision、question"
    ),
    "retrospective": WritingTaskTemplate(
        label: "复盘",
        prompt: "用过去决定和证据复盘结果：{topic}",
        constraints: ["对照当时的预期", "提炼可复用教训"],
        fits: "decision、question"
    ),
    "article": WritingTaskTemplate(
        label: "文章",
        prompt: "围绕主题形成完整论述：{topic}",
        constraints: ["有明确论点", "引用至少两个碎片"],
        fits: "任意文本碎片，包括灵感"
    ),
]

public let writingTaskTypes: [String] = [
    "explanation", "analysis", "plan", "decision", "retrospective", "article",
]

// ── task creation ────────────────────────────────────────────────────────

public struct CreateWritingTaskInput {
    public var taskType: String
    public var topic: String
    public var fragmentIds: [String]
    public var prompt: String?
    public var constraints: [String]?
    public var now: Int?

    public init(
        taskType: String,
        topic: String,
        fragmentIds: [String],
        prompt: String? = nil,
        constraints: [String]? = nil,
        now: Int? = nil
    ) {
        self.taskType = taskType
        self.topic = topic
        self.fragmentIds = fragmentIds
        self.prompt = prompt
        self.constraints = constraints
        self.now = now
    }
}

public func createWritingTask(_ input: CreateWritingTaskInput) -> WritingTaskRecord {
    let now = input.now ?? currentMs()
    let template = TASK_TEMPLATES[input.taskType]
        ?? WritingTaskTemplate(label: input.taskType, prompt: "{topic}", constraints: [], fits: "")
    return WritingTaskRecord(
        id: newId(),
        fragmentIds: input.fragmentIds,
        taskType: input.taskType,
        prompt: (input.prompt ?? template.prompt).replacingOccurrences(of: "{topic}", with: input.topic),
        constraints: input.constraints ?? template.constraints,
        draftContent: "",
        submissions: [],
        createdAt: now,
        updatedAt: now
    )
}

// ── reverse recommendation (desktop.md §6.1 entry 3) ─────────────────────

public struct RecommendForTaskOptions {
    public var limit: Int?
    /// Confirmed relations boost co-located fragments (R2.2 → output selection).
    public var relatedTo: ((String) -> [String])?
    /// Fragments with user-confirmed used=true in past submissions.
    public var appliedFragmentIds: Set<String>?
    /// Fragments the user marked used-but-incorrect — they get a bigger boost
    /// (R2.3): +4 '此前用错，优先再练' INSTEAD of the never-applied +2.
    public var incorrectFragmentIds: Set<String>?
    public var now: Int?

    public init(
        limit: Int? = nil,
        relatedTo: ((String) -> [String])? = nil,
        appliedFragmentIds: Set<String>? = nil,
        incorrectFragmentIds: Set<String>? = nil,
        now: Int? = nil
    ) {
        self.limit = limit
        self.relatedTo = relatedTo
        self.appliedFragmentIds = appliedFragmentIds
        self.incorrectFragmentIds = incorrectFragmentIds
        self.now = now
    }
}

public struct TaskRecommendation: Equatable, Identifiable, Sendable {
    public var fragment: FragmentRecord
    public var reason: String
    public var id: String { fragment.id }

    public init(fragment: FragmentRecord, reason: String) {
        self.fragment = fragment
        self.reason = reason
    }
}

/**
 The user's real task text is the query; candidates come from the shared
 search contract, then rank by review need / never-applied / confirmed
 relations (R2.3).
 */
public func recommendForTask(
    _ taskText: String,
    _ fragments: [FragmentRecord],
    options: RecommendForTaskOptions = RecommendForTaskOptions()
) -> [TaskRecommendation] {
    let now = options.now ?? currentMs()
    let result = runFragmentQuery(fragments, query: FragmentQuery(search: taskText, limit: 200))
    var scored: [(fragment: FragmentRecord, score: Int, reasons: [String])] = []
    for fragment in result.items {
        var score = 0
        var reasons: [String] = ["命中任务主题"]
        if fragment.review.nextReviewAt <= now {
            score += 8
            reasons.append("已到期")
        }
        if fragment.review.lapses > 0 || fragment.review.state == .relearning {
            score += 4
            reasons.append("近期遗忘")
        }
        if (options.incorrectFragmentIds ?? []).contains(fragment.id) {
            score += 4
            reasons.append("此前用错，优先再练")
        } else if !(options.appliedFragmentIds ?? []).contains(fragment.id) {
            score += 2
            reasons.append("从未应用")
        }
        // 近期新增但已完成首次复习 (output.md §2 #3)
        if fragment.createdAt >= now - 7 * 86_400_000 && fragment.review.repetitions > 0 {
            score += 1
        }
        let related = options.relatedTo?(fragment.id) ?? []
        if !related.isEmpty {
            let capped = min(related.count, 3)
            score += capped
            reasons.append("与已选碎片存在 \(capped) 条确认关系")
        }
        scored.append((fragment, score, reasons))
    }
    let ordered = scored.sorted { a, b in
        if a.score != b.score { return a.score > b.score }
        if a.fragment.createdAt != b.fragment.createdAt {
            return a.fragment.createdAt > b.fragment.createdAt
        }
        return a.fragment.id < b.fragment.id
    }
    return ordered.prefix(options.limit ?? 8).map {
        TaskRecommendation(fragment: $0.fragment, reason: $0.reasons.joined(separator: "；"))
    }
}

// ── submissions + feedback layers (storage.md §3.2) ─────────────────────

/// Appends an immutable submission. Draft stays separate and resets.
public func appendSubmission(_ task: WritingTaskRecord, _ content: String, now: Int? = nil) -> WritingTaskRecord {
    let now = now ?? currentMs()
    var updated = task
    updated.submissions.append(OutputSubmission(
        id: newId(), content: content, submittedAt: now, assessments: []
    ))
    updated.draftContent = ""
    updated.updatedAt = now
    return updated
}

// JS `String.prototype.slice` counts UTF-16 code units — mirror it so long
// contents clip identically on both ends.
func utf16Prefix(_ text: String, _ count: Int) -> String {
    var out = String()
    var used = 0
    for scalar in text.unicodeScalars {
        let width = scalar.value > 0xFFFF ? 2 : 1
        if used + width > count { break }
        out.unicodeScalars.append(scalar)
        used += width
    }
    return out
}

/// `\s+` → single space, trim, lowercase (JS `replace(/\s+/g, ' ').trim().toLowerCase()`).
func normalizeHaystack(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").lowercased()
}

/// Long contents rarely re-appear verbatim; match a distinctive head.
func normalizeNeedle(_ content: String) -> String {
    let head = content.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").lowercased()
    return utf16Prefix(head, 40)
}

/// Live presence clue for a draft/preview text — substring hint only.
public func presenceClue(fragmentContent: String, in text: String) -> Bool {
    normalizeHaystack(text).contains(normalizeNeedle(fragmentContent))
}

/** First local feedback layer: text-presence clues only, never used/correct. */
public func localPresenceAssessments(
    _ task: WritingTaskRecord, _ fragments: [FragmentRecord]
) -> [FragmentUseAssessment] {
    guard let last = task.submissions.last else { return [] }
    return fragments
        .filter { task.fragmentIds.contains($0.id) }
        .map { f in
            FragmentUseAssessment(
                fragmentId: f.id,
                source: "local",
                presence: task.fragmentIds.isEmpty
                    ? false
                    : presenceClue(fragmentContent: f.content, in: last.content),
                assessedAt: last.submittedAt
            )
        }
}

/// Merges user confirmations into the latest submission's assessments.
public struct AssessmentConfirmation: Equatable, Sendable {
    public var fragmentId: String
    public var used: Bool?
    public var correct: Bool?
    public var feedback: String?

    public init(fragmentId: String, used: Bool? = nil, correct: Bool? = nil, feedback: String? = nil) {
        self.fragmentId = fragmentId
        self.used = used
        self.correct = correct
        self.feedback = feedback
    }
}

/// Last-wins dedupe by fragmentId, first-occurrence order — mirrors the TS
/// `new Map(assessments.map(a => [a.fragmentId, a]))` semantics (position of
/// the first occurrence, value of the last). Duplicate fragmentIds in a
/// submission must never trap `Dictionary(uniqueKeysWithValues:)`.
func dedupeAssessments(_ assessments: [FragmentUseAssessment]) -> [FragmentUseAssessment] {
    var out: [FragmentUseAssessment] = []
    var index: [String: Int] = [:]
    for assessment in assessments {
        if let idx = index[assessment.fragmentId] {
            out[idx] = assessment
        } else {
            index[assessment.fragmentId] = out.count
            out.append(assessment)
        }
    }
    return out
}

public func confirmAssessments(
    _ task: WritingTaskRecord,
    _ confirmations: [AssessmentConfirmation],
    now: Int? = nil
) -> WritingTaskRecord {
    guard !task.submissions.isEmpty else { return task }
    let now = now ?? currentMs()
    var updated = task
    var last = updated.submissions.removeLast()
    // Mirror the TS Map: original assessment order first, new confirmations
    // appended; re-confirming an id keeps its position. Dedupe first
    // (last wins) — a submission with duplicate fragmentIds must not crash.
    var ordered = dedupeAssessments(last.assessments)
    var indexById: [String: Int] = Dictionary(
        ordered.enumerated().map { ($1.fragmentId, $0) }, uniquingKeysWith: { first, _ in first }
    )
    for c in confirmations {
        guard task.fragmentIds.contains(c.fragmentId) else { continue }
        let existing = indexById[c.fragmentId].flatMap { ordered[$0] }
        let merged = FragmentUseAssessment(
            fragmentId: c.fragmentId,
            source: "manual",
            presence: existing?.presence,
            used: c.used,
            correct: c.correct,
            feedback: c.feedback ?? existing?.feedback,
            confirmedByUser: true,
            assessedAt: now
        )
        if let idx = indexById[c.fragmentId] {
            ordered[idx] = merged
        } else {
            indexById[c.fragmentId] = ordered.count
            ordered.append(merged)
        }
    }
    last.assessments = ordered
    updated.submissions.append(last)
    updated.updatedAt = now
    return updated
}

/// Desktop-only glue: after appendSubmission, seed the local presence layer
/// into the new last submission (output.md §5).
public func seedLocalPresence(
    _ task: WritingTaskRecord, _ fragments: [FragmentRecord]
) -> WritingTaskRecord {
    guard !task.submissions.isEmpty else { return task }
    var updated = task
    var last = updated.submissions.removeLast()
    var merged = last.assessments.filter { $0.source != "local" }
    merged.append(contentsOf: localPresenceAssessments(task, fragments))
    last.assessments = merged
    updated.submissions.append(last)
    return updated
}

/// Desktop-only glue: replace the LLM layer of the last submission (degrade →
/// keep task completable, ai.md §1/§6). Incoming assessments are deduped by
/// fragmentId (last wins) so duplicates never enter a submission, and the
/// optional task-level model strings (overallFeedback / suggestedRevision,
/// ai.md output-feedback-v2 envelope) ride the same submission.
public func mergeLlmAssessments(
    _ task: WritingTaskRecord,
    _ assessments: [FragmentUseAssessment],
    overallFeedback: String? = nil,
    suggestedRevision: String? = nil,
    now: Int? = nil
) -> WritingTaskRecord {
    guard !task.submissions.isEmpty else { return task }
    let now = now ?? currentMs()
    var updated = task
    var last = updated.submissions.removeLast()
    var merged = dedupeAssessments(last.assessments.filter { $0.source != "llm" })
    let llm = dedupeAssessments(assessments)
        .filter { updated.fragmentIds.contains($0.fragmentId) }
        .map { a -> FragmentUseAssessment in
            var withMeta = a
            withMeta.source = "llm"
            withMeta.assessedAt = now
            return withMeta
        }
    merged.append(contentsOf: llm)
    last.assessments = merged
    if let overallFeedback { last.overallFeedback = overallFeedback }
    if let suggestedRevision { last.suggestedRevision = suggestedRevision }
    updated.submissions.append(last)
    updated.updatedAt = now
    return updated
}

public enum FeedbackCompleteness: String, Codable, Sendable {
    case pending, partial, complete
}

/// Derived per task — never stored as a second boolean (storage.md §3.2).
public func feedbackCompleteness(_ task: WritingTaskRecord) -> FeedbackCompleteness {
    guard let last = task.submissions.last else { return .pending }
    let confirmed = task.fragmentIds.filter { id in
        last.assessments.contains { $0.fragmentId == id && ($0.confirmedByUser ?? false) }
    }
    if confirmed.isEmpty { return .pending }
    return confirmed.count == task.fragmentIds.count ? .complete : .partial
}

public struct TaskStatus: Equatable, Sendable {
    public var completed: Bool
    public var completeness: FeedbackCompleteness
    public var submissionCount: Int
    public var draftWords: Int

    public init(
        completed: Bool, completeness: FeedbackCompleteness,
        submissionCount: Int, draftWords: Int
    ) {
        self.completed = completed
        self.completeness = completeness
        self.submissionCount = submissionCount
        self.draftWords = draftWords
    }
}

public func taskStatus(_ task: WritingTaskRecord) -> TaskStatus {
    let trimmed = task.draftContent.trimmingCharacters(in: .whitespacesAndNewlines)
    let words = trimmed.isEmpty ? 0 : trimmed.split(whereSeparator: { $0.isWhitespace }).count
    return TaskStatus(
        completed: !task.submissions.isEmpty,
        completeness: feedbackCompleteness(task),
        submissionCount: task.submissions.count,
        draftWords: words
    )
}

// ── question bridge (R2.1, fragments.md §7) ─────────────────────────────

/// Draft for the question Fragment created from feedback; feeds the shared
/// factory on save. Mirrors the TS return shape field-for-field.
public struct QuestionFragmentDraft: Equatable, Sendable {
    public var kind: String // always "question"
    public var content: String
    public var excerpt: String
    public var sourceUrl: String
    public var sourceTitle: String?
    public var verified: VerifiedResult
    public var use: String
    public var detail: QuestionDetail

    public init(
        kind: String, content: String, excerpt: String, sourceUrl: String,
        sourceTitle: String?, verified: VerifiedResult, use: String, detail: QuestionDetail
    ) {
        self.kind = kind
        self.content = content
        self.excerpt = excerpt
        self.sourceUrl = sourceUrl
        self.sourceTitle = sourceTitle
        self.verified = verified
        self.use = use
        self.detail = detail
    }
}

/// From feedback, one click creates a question Fragment.
public func questionDraftFromFeedback(
    _ task: WritingTaskRecord,
    _ fragment: FragmentRecord,
    _ feedback: String,
    now: Int? = nil
) -> QuestionFragmentDraft {
    let now = now ?? currentMs()
    let content = utf16Prefix("\(fragment.content) 的这个疑问还需要验证：\(feedback)", 500)
    let label = TASK_TEMPLATES[task.taskType]?.label ?? task.taskType
    let excerpt = "\(content)\n来源：输出任务「\(label)」（\(task.prompt)）中对「\(fragment.content)」的反馈。"
    return QuestionFragmentDraft(
        kind: "question",
        content: content,
        excerpt: excerpt,
        sourceUrl: "annhub://writing-task/\(task.id)",
        sourceTitle: utf16Prefix(task.prompt, 300),
        verified: VerifiedResult(confirmedAt: now, source: "manual"),
        use: "在下次输出同主题任务前先回答这个问题。",
        detail: QuestionDetail(status: "open", hypothesis: feedback)
    )
}

// ── applied metrics (R2.3) ───────────────────────────────────────────────

/// ISO-week start (Monday 00:00) in the local timezone — metrics.md §4.
public func isoWeekStart(_ now: Int? = nil) -> Int {
    let ms = now ?? currentMs()
    // ISO8601 calendar weeks start Monday; dateInterval anchors to the local
    // timezone's midnight (mirrors the TS local-time arithmetic).
    var calendar = Calendar(identifier: .iso8601)
    calendar.firstWeekday = 2
    let date = Date(timeIntervalSince1970: Double(ms) / 1000)
    let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
    return Int(start.timeIntervalSince1970 * 1000)
}

/// Weekly Applied Fragments (metrics.md §4): deduped fragments with a
/// user-confirmed used=true AND correct=true submission inside the current
/// ISO week (Monday 00:00 local → now). Correct-unknown or correct=false
/// never counts.
public func weeklyAppliedCounts(_ tasks: [WritingTaskRecord], now: Int? = nil) -> [String: Int] {
    let now = now ?? currentMs()
    let weekStart = isoWeekStart(now)
    var counts: [String: Int] = [:]
    for task in tasks {
        for submission in task.submissions {
            guard submission.submittedAt >= weekStart, submission.submittedAt <= now else { continue }
            for assessment in submission.assessments
            where isConfirmedUse(assessment) && assessment.correct == true {
                counts[assessment.fragmentId, default: 0] += 1
            }
        }
    }
    return counts
}

/// Fragments with user-confirmed used=true — the 已应用 derived state (fragments.md §9).
public func appliedFragmentIds(_ tasks: [WritingTaskRecord]) -> Set<String> {
    var applied = Set<String>()
    for task in tasks {
        for submission in task.submissions {
            for assessment in submission.assessments where isConfirmedUse(assessment) {
                applied.insert(assessment.fragmentId)
            }
        }
    }
    return applied
}

/// Fragments the user confirmed using INCORRECTLY (used=true, correct=false)
/// — they get a bigger re-practice boost in recommendForTask (R2.3).
public func incorrectFragmentIds(_ tasks: [WritingTaskRecord]) -> Set<String> {
    var incorrect = Set<String>()
    for task in tasks {
        for submission in task.submissions {
            for assessment in submission.assessments
            where (assessment.used ?? false)
                && assessment.correct == false
                && (assessment.confirmedByUser ?? false) {
                incorrect.insert(assessment.fragmentId)
            }
        }
    }
    return incorrect
}

func isConfirmedUse(_ assessment: FragmentUseAssessment) -> Bool {
    (assessment.used ?? false) && (assessment.confirmedByUser ?? false)
}

/// Days from capture to first confirmed application (R2.3); nil when never applied.
public func daysToFirstApplication(_ fragment: FragmentRecord, _ tasks: [WritingTaskRecord]) -> Int? {
    var first: Int?
    for task in tasks {
        for submission in task.submissions {
            for assessment in submission.assessments
            where assessment.fragmentId == fragment.id && isConfirmedUse(assessment) {
                if first == nil || submission.submittedAt < first! {
                    first = submission.submittedAt
                }
            }
        }
    }
    guard let first else { return nil }
    return max(0, Int((Double(first - fragment.createdAt) / 86_400_000).rounded()))
}
