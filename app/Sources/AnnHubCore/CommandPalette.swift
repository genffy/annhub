// ⌘K — one entry, two kinds of result (desktop.md §9, search.md): fragments, matched by the
// shared search contract, and the commands that are available right now. Pure: the view
// only renders what comes back and runs the command the user picks.
//
//  - every search word must hit, in any field; the hit fields are named next to the result
//  - fragments rank by the contract (content 5 … sourceHost/Url/excerpt 1; createdAt desc,
//    id asc); Highlights, Clips and screenshot sets never appear here
//  - a command appears only when it can run: no due fragments, no "start review"
//  - titles and field names are in the interface language; a command is also found by its
//    English keywords and by the Chinese words that name it, whichever language is showing

import Foundation

public struct PaletteFragmentHit: Equatable, Identifiable, Sendable {
    public var fragment: FragmentRecord
    /// Fields in which a search word hit, highest weight first (empty for the recent list).
    public var matchedFields: [SearchField]
    /// A few words around the first hit when the hit is not in the content itself.
    public var snippet: String?

    public var id: String { fragment.id }

    public init(fragment: FragmentRecord, matchedFields: [SearchField], snippet: String?) {
        self.fragment = fragment
        self.matchedFields = matchedFields
        self.snippet = snippet
    }

    /// "Content · Tags" — the labels once each, in rank order.
    public func matchLabel(lang: UILanguage = .current) -> String? {
        var seen = Set<String>()
        let labels = matchedFields.map { $0.label(lang: lang) }.filter { seen.insert($0).inserted }
        return labels.isEmpty ? nil : labels.joined(separator: " · ")
    }
}

public enum PaletteCommandID: String, CaseIterable, Sendable {
    case startReview
    case resumeReview
    case goToday
    case goLibrary
    case goSystem
    case openPreferences
    case copyPairCode
}

public struct PaletteCommand: Equatable, Identifiable, Sendable {
    public var id: PaletteCommandID
    public var title: String
    /// Right-aligned remark: "5 due", "2/5".
    public var detail: String?
    /// Extra words that find it ("settings" finds the preferences command in either language).
    var keywords: [String]

    public init(id: PaletteCommandID, title: String, detail: String? = nil, keywords: [String] = []) {
        self.id = id
        self.title = title
        self.detail = detail
        self.keywords = keywords
    }
}

public enum PaletteItem: Equatable, Identifiable, Sendable {
    case fragment(PaletteFragmentHit)
    case command(PaletteCommand)

    public var id: String {
        switch self {
        case .fragment(let hit): return "fragment:" + hit.id
        case .command(let command): return "command:" + command.id.rawValue
        }
    }
}

public struct PaletteContext: Equatable, Sendable {
    public struct Resume: Equatable, Sendable {
        public var cursor: Int
        public var total: Int
        public init(cursor: Int, total: Int) {
            self.cursor = cursor
            self.total = total
        }
    }

    public var dueCount: Int
    public var resume: Resume?

    public init(dueCount: Int = 0, resume: Resume? = nil) {
        self.dueCount = dueCount
        self.resume = resume
    }
}

public struct PaletteResults: Equatable, Sendable {
    public var fragments: [PaletteFragmentHit]
    /// All matches, of which `fragments` shows the first few.
    public var totalFragments: Int
    public var commands: [PaletteCommand]
    /// True when the query was empty and `fragments` is the recent list.
    public var isRecent: Bool

    public init(
        fragments: [PaletteFragmentHit], totalFragments: Int, commands: [PaletteCommand], isRecent: Bool
    ) {
        self.fragments = fragments
        self.totalFragments = totalFragments
        self.commands = commands
        self.isRecent = isRecent
    }

    /// The keyboard order: fragments, then commands.
    public var items: [PaletteItem] {
        fragments.map(PaletteItem.fragment) + commands.map(PaletteItem.command)
    }
}

/// How many fragments the palette lists before "N more".
public let PALETTE_FRAGMENT_LIMIT = 8

public func paletteSearch(
    _ query: String,
    fragments: [FragmentRecord],
    context: PaletteContext = PaletteContext(),
    fragmentLimit: Int = PALETTE_FRAGMENT_LIMIT,
    lang: UILanguage = .current
) -> PaletteResults {
    let words = normalizeContent(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
    let recent = words.isEmpty
    let result = runFragmentQuery(fragments, query: FragmentQuery(search: query, limit: fragmentLimit))
    let hits = result.items.map { fragment in
        recent
            ? PaletteFragmentHit(fragment: fragment, matchedFields: [], snippet: nil)
            : PaletteFragmentHit(
                fragment: fragment,
                matchedFields: matchedFields(fragment, search: query),
                snippet: hitSnippet(fragment, words: words)
            )
    }
    return PaletteResults(
        fragments: hits,
        totalFragments: result.total,
        commands: availableCommands(context, lang: lang).filter { commandMatches($0, words: words) },
        isRecent: recent
    )
}

/// The commands that can run in this context, in the order the palette lists them.
func availableCommands(_ context: PaletteContext, lang: UILanguage = .current) -> [PaletteCommand] {
    var commands: [PaletteCommand] = []
    if let resume = context.resume {
        commands.append(
            PaletteCommand(
                id: .resumeReview, title: t(.paletteResume, lang: lang), detail: "\(resume.cursor)/\(resume.total)",
                keywords: ["review", "resume", "复习", "继续"]))
    }
    if context.dueCount > 0 {
        commands.append(
            PaletteCommand(
                id: .startReview, title: t(.startReview, lang: lang),
                detail: t(.paletteDue, ["count": context.dueCount], lang: lang),
                keywords: ["review", "start", "复习", "开始"]
            ))
    }
    commands.append(contentsOf: [
        PaletteCommand(id: .goToday, title: t(.paletteGoToday, lang: lang), keywords: ["today", "home", "今日", "今天"]),
        PaletteCommand(
            id: .goLibrary, title: t(.paletteGoLibrary, lang: lang), keywords: ["library", "fragments", "碎片", "碎片库"]),
        PaletteCommand(
            id: .goSystem, title: t(.openSystemPage, lang: lang), keywords: ["system", "hub", "连接", "系统"]),
        PaletteCommand(
            id: .openPreferences, title: t(.paletteOpenPreferences, lang: lang),
            keywords: ["preferences", "settings", "设置", "偏好"]),
        PaletteCommand(
            id: .copyPairCode, title: t(.copyPairingCode, lang: lang), keywords: ["pair", "token", "code", "配对"]),
    ])
    return commands
}

private func commandMatches(_ command: PaletteCommand, words: [String]) -> Bool {
    guard !words.isEmpty else { return true }
    let text = normalizeContent(([command.title] + command.keywords).joined(separator: " "))
    return words.allSatisfy { text.contains($0) }
}

/// A short window around the first hit when the content itself does not carry it, e.g.
/// "…重试前先确认幂等键" for a hit in 应用.
private func hitSnippet(_ fragment: FragmentRecord, words: [String]) -> String? {
    let contentText = normalizeContent(fragment.content)
    if words.allSatisfy({ contentText.contains($0) }) { return nil }
    let fields = SearchField.allCases.filter { $0 != .content }.sorted { $0.weight > $1.weight }
    for field in fields {
        let original = field.text(of: fragment)
        for word in words where normalizeContent(original).contains(word) {
            guard let range = original.range(of: word, options: [.caseInsensitive, .diacriticInsensitive]) else {
                continue
            }
            let start =
                original.index(range.lowerBound, offsetBy: -14, limitedBy: original.startIndex) ?? original.startIndex
            let end = original.index(range.upperBound, offsetBy: 24, limitedBy: original.endIndex) ?? original.endIndex
            let body = original[start..<end].replacingOccurrences(of: "\n", with: " ")
            return (start > original.startIndex ? "…" : "") + body + (end < original.endIndex ? "…" : "")
        }
    }
    return nil
}

/// Where the search words occur in `text`, for highlighting. Case and diacritics are ignored,
/// like the search itself; touching or overlapping hits are merged into one range.
public func highlightRanges(of query: String, in text: String) -> [Range<String.Index>] {
    let words = normalizeContent(query).split(whereSeparator: { $0.isWhitespace }).map(String.init)
    var found: [Range<String.Index>] = []
    for word in words {
        var cursor = text.startIndex
        while cursor < text.endIndex,
            let range = text.range(
                of: word, options: [.caseInsensitive, .diacriticInsensitive], range: cursor..<text.endIndex)
        {
            found.append(range)
            cursor = range.upperBound
        }
    }
    found.sort { $0.lowerBound < $1.lowerBound }
    var merged: [Range<String.Index>] = []
    for range in found {
        if let last = merged.last, range.lowerBound <= last.upperBound {
            merged[merged.count - 1] = last.lowerBound..<max(last.upperBound, range.upperBound)
        } else {
            merged.append(range)
        }
    }
    return merged
}
