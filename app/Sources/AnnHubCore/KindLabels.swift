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
