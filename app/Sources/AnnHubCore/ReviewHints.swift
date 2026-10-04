// The hint ladder of a review card (desktop.md §5.3, kinds.md §3/§4): four levels,
// coarse to fine. The LABEL of each level is per kind (`REVIEW_QUESTIONS[kind].hints`);
// this file produces what is shown under that label, from the fragment's own fields.
//
// A level never shows more than its label promises, so the ladder really climbs:
// a concept's L1 is its keywords, not its definition. L4 is the same for every kind —
// the verification status, with the summary or, without one, the original context.

import Foundation

public let REVIEW_HINT_LEVELS = 4

public struct ReviewHint: Equatable, Sendable {
    /// 1...4
    public var level: Int
    /// The ladder label for this kind and level ("关键词", "首步", …).
    public var title: String
    public var text: String
    /// L3 of a `visual` shows the original image; the view loads it by this id.
    public var assetId: String?

    public init(level: Int, title: String, text: String, assetId: String? = nil) {
        self.level = level
        self.title = title
        self.text = text
        self.assetId = assetId
    }
}

/// The hints opened so far: levels 1...`level` (clamped to 1...4).
public func reviewHints(upTo level: Int, for fragment: FragmentRecord) -> [ReviewHint] {
    guard level >= 1 else { return [] }
    return (1...min(level, REVIEW_HINT_LEVELS)).map { reviewHint(level: $0, for: fragment) }
}

public func reviewHint(level: Int, for fragment: FragmentRecord) -> ReviewHint {
    let level = min(max(level, 1), REVIEW_HINT_LEVELS)
    let labels = reviewQuestion(for: fragment.kind).hints
    let title = labels.indices.contains(level - 1) ? labels[level - 1] : ""
    if level == REVIEW_HINT_LEVELS {
        return ReviewHint(level: level, title: title, text: verificationHint(fragment))
    }
    var asset: String?
    let text: String
    switch fragment.kind {
    case "excerpt": text = excerptHint(level, fragment)
    case "concept": text = conceptHint(level, fragment)
    case "claim": text = claimHint(level, fragment)
    case "procedure": text = procedureHint(level, fragment)
    case "decision": text = decisionHint(level, fragment)
    case "question": text = questionHint(level, fragment)
    case "visual":
        text = visualHint(level, fragment)
        if level == 3 { asset = fragment.attachmentIds.first }
    case "inspiration": text = inspirationHint(level, fragment)
    case "media-clip": text = mediaClipHint(level, fragment)
    default: text = genericHint(level, fragment)
    }
    return ReviewHint(level: level, title: title, text: text, assetId: asset)
}

// ── shared pieces ────────────────────────────────────────────────────────

/// "《Backpressure in Streams》· engineering.example.com"
func sourceLine(_ fragment: FragmentRecord) -> String {
    if let title = fragment.context.sourceTitle, !title.isEmpty {
        return "《\(title)》· \(fragment.context.sourceHost)"
    }
    return fragment.context.sourceHost
}

func tagLine(_ fragment: FragmentRecord) -> String? {
    fragment.tags.isEmpty ? nil : fragment.tags.map { "#\($0)" }.joined(separator: " ")
}

private func nonEmpty(_ values: [String]?) -> [String] {
    (values ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

private func bulleted(_ items: [String]) -> String {
    items.map { "· \($0)" }.joined(separator: "\n")
}

private func numbered(_ items: [String]) -> String {
    items.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n")
}

/// The excerpt with the answer content masked; if the content never appears in it the
/// excerpt is the surrounding context as it stands.
private func surroundingContext(_ fragment: FragmentRecord) -> String {
    maskedExcerpt(fragment)
}

// ── per kind ─────────────────────────────────────────────────────────────

private func genericHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    switch level {
    case 1: return tagLine(fragment) ?? sourceLine(fragment)
    case 2: return sourceLine(fragment)
    default: return fragment.context.excerpt
    }
}

/// 来源与出处 → 前后文语境 → 原文本身 → 核验确认
private func excerptHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    switch level {
    case 1: return sourceLine(fragment)
    case 2: return surroundingContext(fragment)
    default: return fragment.content
    }
}

/// 关键词 → 上下文 → 定义与示例 → 核验摘要
private func conceptHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    let detail = fragment.conceptDetail
    switch level {
    case 1:
        if let tags = tagLine(fragment) { return tags }
        var parts: [String] = []
        if !nonEmpty(detail?.boundaries).isEmpty { parts.append("适用边界 \(nonEmpty(detail?.boundaries).count) 条") }
        if !nonEmpty(detail?.examples).isEmpty { parts.append("示例 \(nonEmpty(detail?.examples).count) 个") }
        if !nonEmpty(detail?.counterExamples).isEmpty {
            parts.append("反例 \(nonEmpty(detail?.counterExamples).count) 个")
        }
        return parts.isEmpty ? "想想它出现在什么场景、和哪些概念相邻" : "记录了" + parts.joined(separator: "、")
    case 2:
        return sourceLine(fragment) + "\n" + surroundingContext(fragment)
    default:
        var lines: [String] = []
        if let definition = detail?.definition, !definition.isEmpty { lines.append("定义：\(definition)") }
        let examples = nonEmpty(detail?.examples)
        if !examples.isEmpty { lines.append("示例：\n" + bulleted(examples)) }
        let boundaries = nonEmpty(detail?.boundaries)
        if !boundaries.isEmpty { lines.append("边界：\n" + bulleted(boundaries)) }
        return lines.isEmpty ? "没有记录定义与示例，回看原始语境：\(fragment.context.excerpt)" : lines.joined(separator: "\n")
    }
}

/// 主题 → 证据片段 → 原文 → 核验确认
private func claimHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    let detail = fragment.claimDetail
    switch level {
    case 1:
        var line = tagLine(fragment) ?? sourceLine(fragment)
        if let stance = detail?.stance, let label = stanceDisplayName(stance) { line += "\n你的立场：\(label)" }
        return line
    case 2:
        let evidence = nonEmpty(detail?.evidence)
        guard let first = evidence.first else { return "没有记录证据片段" }
        return evidence.count > 1 ? "\(first)\n（共 \(evidence.count) 条证据，这是其中第一条）" : first
    default:
        return fragment.context.excerpt
    }
}

/// 步骤数 → 首步 → 完整流程 → 核验确认
private func procedureHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    let steps = nonEmpty(fragment.procedureDetail?.steps)
    switch level {
    case 1:
        var line = "共 \(steps.count) 步"
        let prerequisites = nonEmpty(fragment.procedureDetail?.prerequisites)
        if !prerequisites.isEmpty { line += "，前置条件 \(prerequisites.count) 项" }
        return line
    case 2:
        return steps.first.map { "第 1 步：\($0)" } ?? "没有记录步骤"
    default:
        var text = steps.isEmpty ? "没有记录步骤" : numbered(steps)
        let failures = nonEmpty(fragment.procedureDetail?.failureModes)
        if !failures.isEmpty { text += "\n失败条件：\n" + bulleted(failures) }
        return text
    }
}

/// 结论 → 约束 → 理由 → 核验确认
private func decisionHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    let detail = fragment.decisionDetail
    switch level {
    case 1:
        return fragment.content
    case 2:
        // The constraints are what the user inferred when saving (理解), else the
        // background the decision came out of.
        if let guess = fragment.processing.guess, !guess.isEmpty { return "你当时推断的约束：\(guess)" }
        return "原文背景：" + surroundingContext(fragment)
    default:
        var text = detail?.rationale ?? "没有记录理由"
        let alternatives = nonEmpty(detail?.alternatives)
        if !alternatives.isEmpty { text += "\n备选方案：" + alternatives.joined(separator: "、") }
        return text
    }
}

/// 主题 → 最近证据 → 当前结论 → 核验确认
private func questionHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    let detail = fragment.questionDetail
    switch level {
    case 1:
        var line = tagLine(fragment) ?? sourceLine(fragment)
        if let status = detail?.status { line += "\n状态：\(questionStatusLabel(status))" }
        return line
    case 2:
        return nonEmpty(detail?.evidence).last ?? "还没有记录证据"
    default:
        if detail?.status == "answered", let answer = detail?.answer, !answer.isEmpty { return "答案：\(answer)" }
        var lines: [String] = []
        if let hypothesis = detail?.hypothesis, !hypothesis.isEmpty { lines.append("当前假设：\(hypothesis)") }
        if let next = detail?.nextStep, !next.isEmpty { lines.append("下一步验证：\(next)") }
        return lines.isEmpty ? "还没有结论" : lines.joined(separator: "\n")
    }
}

func questionStatusLabel(_ status: String) -> String {
    switch status {
    case "open": return "待验证"
    case "testing": return "验证中"
    case "answered": return "已回答"
    default: return status
    }
}

/// 结构关键词 → 文字描述 → 原图 → 核验确认
private func visualHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    switch level {
    case 1:
        return tagLine(fragment) ?? "共 \(max(fragment.attachmentIds.count, 1)) 张图"
    case 2:
        return fragment.content
    default:
        return fragment.attachmentIds.isEmpty ? "没有关联的原图" : "原图见下方"
    }
}

/// 触发背景 → 原记录 → 后续修订 → 核验确认
private func inspirationHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    switch level {
    case 1:
        return triggerBackground(fragment)
    case 2:
        return fragment.content
    default:
        let revisions = fragment.captureRevision - 1
        return revisions > 0 ? "此后修订过 \(revisions) 次（现为第 \(fragment.captureRevision) 版）" : "没有后续修订"
    }
}

/// The excerpt of an inspiration starts with the idea itself and then adds the
/// background that triggered it (fragments.md §6); this is the part after the idea.
func triggerBackground(_ fragment: FragmentRecord) -> String {
    let excerpt = fragment.context.excerpt
    let content = fragment.content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !content.isEmpty, excerpt.hasPrefix(content) else { return excerpt }
    let rest = excerpt.dropFirst(content.count)
        .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "—-–:：")))
    return rest.isEmpty ? "没有记录触发背景" : rest
}

/// 主题 → 要点 → 原片段 → 核验确认
private func mediaClipHint(_ level: Int, _ fragment: FragmentRecord) -> String {
    switch level {
    case 1:
        return sourceLine(fragment)
    case 2:
        return fragment.content
    default:
        var line = ""
        if let clip = fragment.mediaClipDetail { line = "\(mmss(clip.startMs)) – \(mmss(clip.endMs))\n" }
        return line + fragment.context.excerpt
    }
}
