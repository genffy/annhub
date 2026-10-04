// User-facing kind names (kinds.md §4 headings; D-13: excerpt is always
// 摘录 / "Excerpt"). Wire values stay the English contract names.

import Foundation

/// The text key of every kind's display name.
public let KIND_TEXT: [String: UIText] = [
    "concept": .kindConcept,
    "claim": .kindClaim,
    "procedure": .kindProcedure,
    "decision": .kindDecision,
    "question": .kindQuestion,
    "inspiration": .kindInspiration,
    "visual": .kindVisual,
    "media-clip": .kindMediaClip,
    "excerpt": .kindExcerpt,
]

/// The display name of a kind; an unknown kind shows its raw value.
public func kindLabel(_ kind: String, lang: UILanguage = .current) -> String {
    KIND_TEXT[kind].map { t($0, lang: lang) } ?? kind
}

/// How a verification was done (fragments.md §7): the user's reading of the source,
/// a manual check, or a model suggestion the user accepted.
public func verifiedSourceLabel(_ source: String, lang: UILanguage = .current) -> String {
    switch source {
    case "source-material": return t(.verifiedSourceMaterial, lang: lang)
    case "llm": return t(.verifiedModel, lang: lang)
    case "manual": return t(.verifiedManual, lang: lang)
    default: return source
    }
}
