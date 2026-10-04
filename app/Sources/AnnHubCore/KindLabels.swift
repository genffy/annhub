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
