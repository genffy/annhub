// The hint ladder of a review card (desktop.md §5.3, kinds.md §3/§4): four levels,
// coarse to fine. The LABEL of each level is per kind (`REVIEW_QUESTIONS[kind].hints`);
// this file produces what is shown under that label, from the fragment's own fields.
//
// A level never shows more than its label promises, so the ladder really climbs:
// a concept's L1 is its keywords, not its definition. L4 is the same for every kind —
// the verification status, with the summary or, without one, the original context.
// Everything the user reads goes through `t()`, so the ladder speaks the interface language.

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
public func reviewHints(upTo level: Int, for fragment: FragmentRecord, lang: UILanguage = .current) -> [ReviewHint] {
    guard level >= 1 else { return [] }
    return (1...min(level, REVIEW_HINT_LEVELS)).map { reviewHint(level: $0, for: fragment, lang: lang) }
}

public func reviewHint(level: Int, for fragment: FragmentRecord, lang: UILanguage = .current) -> ReviewHint {
    let level = min(max(level, 1), REVIEW_HINT_LEVELS)
    let labels = reviewQuestion(for: fragment.kind, lang: lang).hints
    let title = labels.indices.contains(level - 1) ? labels[level - 1] : ""
    if level == REVIEW_HINT_LEVELS {
        return ReviewHint(level: level, title: title, text: verificationHint(fragment, lang: lang))
    }
    var asset: String?
    let text: String
    switch fragment.kind {
    case "excerpt": text = excerptHint(level, fragment, lang)
    case "concept": text = conceptHint(level, fragment, lang)
    case "claim": text = claimHint(level, fragment, lang)
    case "procedure": text = procedureHint(level, fragment, lang)
    case "decision": text = decisionHint(level, fragment, lang)
    case "question": text = questionHint(level, fragment, lang)
    case "visual":
        text = visualHint(level, fragment, lang)
        if level == 3 { asset = fragment.attachmentIds.first }
    case "inspiration": text = inspirationHint(level, fragment, lang)
    case "media-clip": text = mediaClipHint(level, fragment, lang)
    default: text = genericHint(level, fragment, lang)
    }
    return ReviewHint(level: level, title: title, text: text, assetId: asset)
}

// ── shared pieces ────────────────────────────────────────────────────────

/// "《Backpressure in Streams》· engineering.example.com"
func sourceLine(_ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    if let title = fragment.context.sourceTitle, !title.isEmpty {
        return t(.sourceWithTitle, ["title": title, "host": fragment.context.sourceHost], lang: lang)
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

/// "Label: text" on one line, the colon and spacing of the interface language.
private func line(_ label: UIText, _ text: String, _ lang: UILanguage) -> String {
    t(.labeledLine, ["label": t(label, lang: lang), "text": text], lang: lang)
}

/// "Label:" and then the text on the lines below.
private func block(_ label: UIText, _ text: String, _ lang: UILanguage) -> String {
    t(.labeledBlock, ["label": t(label, lang: lang), "text": text], lang: lang)
}

/// The excerpt with the answer content masked; if the content never appears in it the
/// excerpt is the surrounding context as it stands.
private func surroundingContext(_ fragment: FragmentRecord) -> String {
    maskedExcerpt(fragment)
}

// ── per kind ─────────────────────────────────────────────────────────────

private func genericHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    switch level {
    case 1: return tagLine(fragment) ?? sourceLine(fragment, lang)
    case 2: return sourceLine(fragment, lang)
    default: return fragment.context.excerpt
    }
}

/// 来源与出处 → 前后文语境 → 原文本身 → 核验确认
private func excerptHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    switch level {
    case 1: return sourceLine(fragment, lang)
    case 2: return surroundingContext(fragment)
    default: return fragment.content
    }
}

/// 关键词 → 上下文 → 定义与示例 → 核验摘要
private func conceptHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    let detail = fragment.conceptDetail
    switch level {
    case 1:
        if let tags = tagLine(fragment) { return tags }
        // No tags: say what the fragment does hold, without giving it away.
        var parts: [String] = []
        let boundaries = nonEmpty(detail?.boundaries).count
        let examples = nonEmpty(detail?.examples).count
        let counterExamples = nonEmpty(detail?.counterExamples).count
        if boundaries > 0 { parts.append(t(.hintBoundaryCount, ["count": boundaries], lang: lang)) }
        if examples > 0 { parts.append(t(.hintExampleCount, ["count": examples], lang: lang)) }
        if counterExamples > 0 { parts.append(t(.hintCounterExampleCount, ["count": counterExamples], lang: lang)) }
        return parts.isEmpty
            ? t(.hintConceptThink, lang: lang)
            : t(.hintRecorded, ["parts": parts.joined(separator: t(.tagSeparator, lang: lang))], lang: lang)
    case 2:
        return sourceLine(fragment, lang) + "\n" + surroundingContext(fragment)
    default:
        var lines: [String] = []
        if let definition = detail?.definition, !definition.isEmpty {
            lines.append(line(.fieldDefinition, definition, lang))
        }
        let examples = nonEmpty(detail?.examples)
        if !examples.isEmpty { lines.append(block(.fieldExamples, bulleted(examples), lang)) }
        let boundaries = nonEmpty(detail?.boundaries)
        if !boundaries.isEmpty { lines.append(block(.fieldBoundaries, bulleted(boundaries), lang)) }
        return lines.isEmpty
            ? t(.hintNoDefinition, ["excerpt": fragment.context.excerpt], lang: lang) : lines.joined(separator: "\n")
    }
}

/// 主题 → 证据片段 → 原文 → 核验确认
private func claimHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    let detail = fragment.claimDetail
    switch level {
    case 1:
        var text = tagLine(fragment) ?? sourceLine(fragment, lang)
        if let stance = detail?.stance, let label = stanceDisplayName(stance, lang: lang) {
            text += "\n" + t(.hintYourStance, ["stance": label], lang: lang)
        }
        return text
    case 2:
        let evidence = nonEmpty(detail?.evidence)
        guard let first = evidence.first else { return t(.hintNoEvidence, lang: lang) }
        return evidence.count > 1
            ? t(.hintFirstOfEvidence, ["first": first, "count": evidence.count], lang: lang) : first
    default:
        return fragment.context.excerpt
    }
}

/// 步骤数 → 首步 → 完整流程 → 核验确认
private func procedureHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    let steps = nonEmpty(fragment.procedureDetail?.steps)
    switch level {
    case 1:
        var text = t(.hintStepCount, ["count": steps.count], lang: lang)
        let prerequisites = nonEmpty(fragment.procedureDetail?.prerequisites)
        if !prerequisites.isEmpty {
            text +=
                t(.clauseSeparator, lang: lang) + t(.hintPreconditionCount, ["count": prerequisites.count], lang: lang)
        }
        return text
    case 2:
        return steps.first.map { t(.hintFirstStep, ["step": $0], lang: lang) } ?? t(.hintNoSteps, lang: lang)
    default:
        var text = steps.isEmpty ? t(.hintNoSteps, lang: lang) : numbered(steps)
        let failures = nonEmpty(fragment.procedureDetail?.failureModes)
        if !failures.isEmpty { text += "\n" + block(.fieldFailureModes, bulleted(failures), lang) }
        return text
    }
}

/// 结论 → 约束 → 理由 → 核验确认
private func decisionHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    let detail = fragment.decisionDetail
    switch level {
    case 1:
        return fragment.content
    case 2:
        // The constraints are what the user inferred when saving (理解), else the
        // background the decision came out of.
        if let guess = fragment.processing.guess, !guess.isEmpty {
            return t(.hintInferredConstraint, ["guess": guess], lang: lang)
        }
        return t(.hintOriginalBackground, ["context": surroundingContext(fragment)], lang: lang)
    default:
        var text = detail?.rationale ?? t(.hintNoRationale, lang: lang)
        let alternatives = nonEmpty(detail?.alternatives)
        if !alternatives.isEmpty {
            text += "\n" + line(.fieldAlternatives, alternatives.joined(separator: t(.tagSeparator, lang: lang)), lang)
        }
        return text
    }
}

/// 主题 → 最近证据 → 当前结论 → 核验确认
private func questionHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    let detail = fragment.questionDetail
    switch level {
    case 1:
        var text = tagLine(fragment) ?? sourceLine(fragment, lang)
        if let status = detail?.status {
            text += "\n" + line(.fieldStatus, questionStatusLabel(status, lang: lang), lang)
        }
        return text
    case 2:
        return nonEmpty(detail?.evidence).last ?? t(.hintNoEvidenceYet, lang: lang)
    default:
        if detail?.status == "answered", let answer = detail?.answer, !answer.isEmpty {
            return line(.fieldAnswer, answer, lang)
        }
        var lines: [String] = []
        if let hypothesis = detail?.hypothesis, !hypothesis.isEmpty {
            lines.append(line(.fieldHypothesis, hypothesis, lang))
        }
        if let next = detail?.nextStep, !next.isEmpty { lines.append(line(.fieldNextStep, next, lang)) }
        return lines.isEmpty ? t(.hintNoConclusion, lang: lang) : lines.joined(separator: "\n")
    }
}

/// 结构关键词 → 文字描述 → 原图 → 核验确认
private func visualHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    switch level {
    case 1:
        return tagLine(fragment) ?? t(.hintImageCount, ["count": max(fragment.attachmentIds.count, 1)], lang: lang)
    case 2:
        return fragment.content
    default:
        return fragment.attachmentIds.isEmpty ? t(.hintNoImage, lang: lang) : t(.hintImageBelow, lang: lang)
    }
}

/// 触发背景 → 原记录 → 后续修订 → 核验确认
private func inspirationHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    switch level {
    case 1:
        return triggerBackground(fragment, lang: lang)
    case 2:
        return fragment.content
    default:
        let revisions = fragment.captureRevision - 1
        return revisions > 0
            ? t(.hintRevised, ["count": revisions, "version": fragment.captureRevision], lang: lang)
            : t(.hintNoRevisions, lang: lang)
    }
}

/// The excerpt of an inspiration starts with the idea itself and then adds the
/// background that triggered it (fragments.md §6); this is the part after the idea.
func triggerBackground(_ fragment: FragmentRecord, lang: UILanguage = .current) -> String {
    let excerpt = fragment.context.excerpt
    let content = fragment.content.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !content.isEmpty, excerpt.hasPrefix(content) else { return excerpt }
    let rest = excerpt.dropFirst(content.count)
        .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "—-–:：")))
    return rest.isEmpty ? t(.hintNoTrigger, lang: lang) : rest
}

/// 主题 → 要点 → 原片段 → 核验确认
private func mediaClipHint(_ level: Int, _ fragment: FragmentRecord, _ lang: UILanguage) -> String {
    switch level {
    case 1:
        return sourceLine(fragment, lang)
    case 2:
        return fragment.content
    default:
        var prefix = ""
        if let clip = fragment.mediaClipDetail { prefix = "\(mmss(clip.startMs)) – \(mmss(clip.endMs))\n" }
        return prefix + fragment.context.excerpt
    }
}
