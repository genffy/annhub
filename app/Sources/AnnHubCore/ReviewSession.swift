// Review-session contract — mirrors learning-core/review.ts exactly
// (review.md §4/§5 + desktop.md §5).
//
// Review runs on the Desktop; the Extension never implements this. R1 gives
// every enabled kind exactly one self-eval question; answers are user-judged
// (no automatic long-text grading); hint usage is recorded in
// ReviewLog.usedHint via the rating call.

import Foundation

public struct ReviewQuestionSpec: Equatable, Sendable {
    public var kind: String
    /// Default question shown on the card (desktop.md §5.2).
    public var question: String
    /// Hint ladder, coarse -> fine; using ANY hint sets usedHint (review.md §4).
    public var hints: [String]

    public init(kind: String, question: String, hints: [String]) {
        self.kind = kind
        self.question = question
        self.hints = hints
    }
}

/// Per-kind question + hint ladder; text must match review.ts byte-for-byte.
public let REVIEW_QUESTIONS: [String: ReviewQuestionSpec] = [
    "excerpt": ReviewQuestionSpec(
        kind: "excerpt",
        question: "这段材料的核心观点是什么？为什么值得保留？",
        hints: ["来源与出处", "前后文语境", "原文本身", "核验确认"]
    ),
    "concept": ReviewQuestionSpec(
        kind: "concept",
        question: "用自己的话解释它，并给出一个适用边界。",
        hints: ["关键词", "上下文", "定义与示例", "核验摘要"]
    ),
    "claim": ReviewQuestionSpec(
        kind: "claim",
        question: "这个主张依赖哪些前提和证据？",
        hints: ["主题", "证据片段", "原文", "核验确认"]
    ),
    "procedure": ReviewQuestionSpec(
        kind: "procedure",
        question: "从目标出发重建关键步骤和失败条件。",
        hints: ["步骤数", "首步", "完整流程", "核验确认"]
    ),
    "decision": ReviewQuestionSpec(
        kind: "decision",
        question: "当时有哪些约束，为什么没有选其他方案？",
        hints: ["结论", "约束", "理由", "核验确认"]
    ),
    "question": ReviewQuestionSpec(
        kind: "question",
        question: "当前假设、证据和下一步验证分别是什么？",
        hints: ["主题", "最近证据", "当前结论", "核验确认"]
    ),
    "visual": ReviewQuestionSpec(
        kind: "visual",
        question: "这张图的关键细节、结构或意图是什么？",
        hints: ["结构关键词", "文字描述", "原图", "核验确认"]
    ),
    "inspiration": ReviewQuestionSpec(
        kind: "inspiration",
        question: "当时由什么触发这个想法？现在还认可什么？",
        hints: ["触发背景", "原记录", "后续修订", "核验确认"]
    ),
    "media-clip": ReviewQuestionSpec(
        kind: "media-clip",
        question: "回忆这段媒体材料的要点与时间定位。",
        hints: ["主题", "要点", "原片段", "核验确认"]
    ),
]

public func reviewQuestion(for kind: String) -> ReviewQuestionSpec {
    REVIEW_QUESTIONS[kind]
        ?? ReviewQuestionSpec(
            kind: kind, question: "回忆这条碎片的关键内容。", hints: ["主题", "上下文", "原文", "核验确认"]
        )
}

// ── hint ladder content (desktop.md §5.3) ────────────────────────────────
// Four coarse -> fine levels: L1 kind 结构提示 (the spec label itself),
// L2 sourceTitle + tags, L3 excerpt with the answer content masked, L4
// 核验确认状态 + 摘要. Pure helpers so the ladder is testable.

/// L3: the excerpt's 非答案部分 — every occurrence of the answer content is
/// masked so the surrounding context still reads.
public func maskedExcerpt(_ fragment: FragmentRecord) -> String {
    let content = fragment.content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !content.isEmpty else { return fragment.context.excerpt }
    return fragment.context.excerpt.replacingOccurrences(
        of: content, with: "﹏﹏﹏", options: [.caseInsensitive, .diacriticInsensitive]
    )
}

/// L4: 核验确认状态 + 摘要；无摘要时回看原始语境.
public func verificationHint(_ fragment: FragmentRecord) -> String {
    guard let verified = fragment.processing.verified else {
        return "核验确认状态：未核验"
    }
    let status = "核验确认状态：已确认（来源：\(verifiedSourceLabel(verified.source))）"
    if let summary = verified.summary, !summary.isEmpty {
        return "\(status)\n摘要：\(summary)"
    }
    return "\(status)\n已确认，无摘要 — 回看原始语境：\(fragment.context.excerpt)"
}

// ── daily / session caps (review.md §5) ─────────────────────────────────

public let DAILY_LIMIT_DEFAULT = 20
public let DAILY_LIMIT_MIN = 5
public let DAILY_LIMIT_MAX = 50
/// Single-session estimate: 45s per card, 600s budget.
public let SESSION_SECONDS_PER_CARD = 45
public let SESSION_BUDGET_SECONDS = 600

/// User-configurable daily cap clamped to [5, 50] (review.md §5 /
/// metrics.md §6.2). Out-of-range values snap to the nearest bound.
public func clampedDailyLimit(_ value: Int) -> Int {
    min(max(value, DAILY_LIMIT_MIN), DAILY_LIMIT_MAX)
}

/// min(daily remaining, floor(600 / 45)) = 13 (review.md §5).
public func sessionCap(dailyRemaining: Int) -> Int {
    min(dailyRemaining, SESSION_BUDGET_SECONDS / SESSION_SECONDS_PER_CARD)
}

/// Daily queue ordering: nextReviewAt asc, lapses desc, createdAt asc, id asc
/// (review.md §5) — stable across ends and restarts.
public func dailyQueueOrder(_ a: FragmentRecord, _ b: FragmentRecord) -> Bool {
    if a.review.nextReviewAt != b.review.nextReviewAt {
        return a.review.nextReviewAt < b.review.nextReviewAt
    }
    if a.review.lapses != b.review.lapses {
        return a.review.lapses > b.review.lapses
    }
    if a.createdAt != b.createdAt {
        return a.createdAt < b.createdAt
    }
    return a.id < b.id
}

public func buildDailyQueue(
    _ fragments: [FragmentRecord],
    now: Int,
    dailyLimit: Int = DAILY_LIMIT_DEFAULT
) -> [FragmentRecord] {
    fragments
        .filter { $0.review.nextReviewAt <= now }
        .sorted(by: dailyQueueOrder)
        .prefix(dailyLimit)
        .map { $0 }
}

// ── persisted session (desktop.md §5.4) ─────────────────────────────────

public struct ReviewSessionSkip: Codable, Equatable, Sendable {
    public var fragmentId: String
    public var reason: String

    public init(fragmentId: String, reason: String) {
        self.fragmentId = fragmentId
        self.reason = reason
    }
}

/// Persisted review session: order + cursor survive restarts; the cursor only
/// advances after a rating commits successfully (review.md §5).
public struct ReviewSessionState: Codable, Equatable, Sendable {
    public var sessionId: String
    public var fragmentIds: [String]
    public var cursor: Int
    public var startedAt: Int
    /// Skipped entries with a reason, e.g. fragment deleted mid-session.
    public var skipped: [ReviewSessionSkip]

    public init(
        sessionId: String,
        fragmentIds: [String],
        cursor: Int = 0,
        startedAt: Int,
        skipped: [ReviewSessionSkip] = []
    ) {
        self.sessionId = sessionId
        self.fragmentIds = fragmentIds
        self.cursor = cursor
        self.startedAt = startedAt
        self.skipped = skipped
    }
}
