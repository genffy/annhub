// Normalization — mirrors learning-core/normalize.ts (contract §4).
// Order matters and must not be changed: NFKC first, trailing punctuation
// trim last. This is the ONLY implementation on the Apple side.

import Foundation

/// NFKC via Unicode compatibility composition.
/// → lowercase → curly-quote folding → dash folding → whitespace collapse →
/// trim outer whitespace/punctuation.
public func normalizeContent(_ raw: String) -> String {
    var s = raw.precomposedStringWithCompatibilityMapping
    s = s.lowercased()
    s = foldCharacters(s)
    s = collapseWhitespace(s)
    s = trimOuterWhitespaceAndPunctuation(s)
    return s
}

private func foldCharacters(_ s: String) -> String {
    var out = String()
    out.reserveCapacity(s.count)
    for ch in s {
        switch ch {
        case "‘", "’": out.append("'")
        case "“", "”": out.append("\"")
        case "‐", "‑", "‒", "–", "—", "―": out.append("-")
        default: out.append(ch)
        }
    }
    return out
}

private func collapseWhitespace(_ s: String) -> String {
    s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
}

/// `^[\s\p{P}]+|[\s\p{P}]+$` — Unicode general category P* plus whitespace.
private func trimOuterWhitespaceAndPunctuation(_ s: String) -> String {
    var chars = Array(s)
    while let first = chars.first, first.isWhitespace || first.isPunctuation {
        chars.removeFirst()
    }
    while let last = chars.last, last.isWhitespace || last.isPunctuation {
        chars.removeLast()
    }
    return String(chars)
}

extension Character {
    /// General category P* (connector/dash/open/close/initial/final/other punctuation).
    var isUnicodePunctuation: Bool {
        unicodeScalars.contains { scalar in
            switch scalar.properties.generalCategory {
            case .connectorPunctuation, .dashPunctuation, .openPunctuation,
                 .closePunctuation, .initialPunctuation, .finalPunctuation,
                 .otherPunctuation:
                return true
            default:
                return false
            }
        }
    }

    /// Mirrors the TS `\p{P}` intent for trimming. Symbols (S*) are NOT
    /// punctuation — same as ICU \p{P}.
    var isPunctuation: Bool { isUnicodePunctuation }
}

/// Only 'www.' is stripped — mobile.twitter.com vs twitter.com are
/// intentionally different hosts (site rules may differ).
public func normalizeHost(url: String) -> String? {
    guard let url = URL(string: url.trimmingCharacters(in: .whitespacesAndNewlines)),
          let rawHost = url.host
    else { return nil }
    let host = rawHost.lowercased()
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
}

/// Dedupe key for "same fragment captured again in the same context".
/// The separator is \u{0} (never a space or '|' — both can occur inside
/// content/excerpt and would collide).
public func dedupeKeyOf(content: String, sourceUrl: String, excerpt: String) -> String {
    [normalizeContent(content), sourceUrl, normalizeContent(excerpt)].joined(separator: "\u{0}")
}

public func dedupeKey(_ f: FragmentRecord) -> String {
    dedupeKeyOf(content: f.normalizedContent, sourceUrl: f.context.sourceUrl, excerpt: f.context.excerpt)
}

/// Lowercase, trim, drop empties and duplicates, cap at 20 entries.
public func dedupeTags(_ tags: [String]) -> [String] {
    var seen = Set<String>()
    var result: [String] = []
    for raw in tags {
        let tag = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if tag.isEmpty || seen.contains(tag) { continue }
        seen.insert(tag)
        result.append(tag)
        if result.count >= 20 { break }
    }
    return result
}
