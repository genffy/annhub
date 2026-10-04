// User-facing kind names (kinds.md §4 headings; D-13: excerpt is always
// 摘录). Wire values stay the English contract names.

import Foundation

public let KIND_LABELS: [String: String] = [
    "concept": "概念",
    "claim": "论点",
    "procedure": "方法",
    "decision": "决策",
    "question": "问题",
    "inspiration": "灵感",
    "visual": "视觉",
    "media-clip": "媒体片段",
    "excerpt": "摘录",
]

/// The display name of a kind; an unknown kind shows its raw value.
public func kindLabel(_ kind: String) -> String {
    KIND_LABELS[kind] ?? kind
}

/// How a verification was done (fragments.md §7): the user's reading of the source,
/// a manual check, or a model suggestion the user accepted.
public func verifiedSourceLabel(_ source: String) -> String {
    switch source {
    case "source-material": return "原文材料"
    case "llm": return "模型建议（已确认）"
    case "manual": return "手工核对"
    default: return source
    }
}
