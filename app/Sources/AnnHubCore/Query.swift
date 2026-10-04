// Unified fragment search / filter / sort / pagination — mirrors
// learning-core/query.ts (docs/v2/search.md).
//
// Same-dimension filters are OR, cross-dimension AND; search combines with
// filters. Candidates are filtered in memory after the store narrows by
// index; results must pass through this rule set regardless of caches.

import Foundation

public struct FragmentQueryFilters: Sendable {
    public var search: String?
    public var kinds: [String]?
    public var hosts: [String]?
    public var tags: [String]?
    /// [start, end) UTC epoch ms (search.md §2).
    public var capturedFrom: Int?
    public var capturedTo: Int?

    public init(
        search: String? = nil,
        kinds: [String]? = nil,
        hosts: [String]? = nil,
        tags: [String]? = nil,
        capturedFrom: Int? = nil,
        capturedTo: Int? = nil
    ) {
        self.search = search
        self.kinds = kinds
        self.hosts = hosts
        self.tags = tags
        self.capturedFrom = capturedFrom
        self.capturedTo = capturedTo
    }
}

public struct FragmentQuery: Sendable {
    public var filters: FragmentQueryFilters
    public var limit: Int?
    /// Opaque stable-sort cursor from a previous page.
    public var cursor: String?

    public init(
        search: String? = nil,
        kinds: [String]? = nil,
        hosts: [String]? = nil,
        tags: [String]? = nil,
        capturedFrom: Int? = nil,
        capturedTo: Int? = nil,
        limit: Int? = nil,
        cursor: String? = nil
    ) {
        self.filters = FragmentQueryFilters(
            search: search, kinds: kinds, hosts: hosts, tags: tags,
            capturedFrom: capturedFrom, capturedTo: capturedTo
        )
        self.limit = limit
        self.cursor = cursor
    }
}

public struct FragmentQueryResult {
    public var items: [FragmentRecord]
    public var nextCursor: String?
    /// Count after filters + search, before pagination.
    public var total: Int

    public init(items: [FragmentRecord], nextCursor: String? = nil, total: Int) {
        self.items = items
        self.nextCursor = nextCursor
        self.total = total
    }
}

let pageDefault = 50
let pageMax = 200

// Field weights per search.md §3: content=5, 理解/核验/应用=4, tags=3,
// sourceTitle=2, excerpt/sourceHost/sourceUrl=1.
struct WeightedField {
    var weight: Int
    var text: String
}

func haystack(_ fragment: FragmentRecord) -> [WeightedField] {
    [
        WeightedField(weight: 5, text: fragment.content),
        WeightedField(weight: 4, text: fragment.processing.guess ?? ""),
        WeightedField(weight: 4, text: fragment.processing.verified?.summary ?? ""),
        WeightedField(weight: 4, text: fragment.processing.use),
        WeightedField(weight: 3, text: fragment.tags.joined(separator: " ")),
        WeightedField(weight: 2, text: fragment.context.sourceTitle ?? ""),
        WeightedField(weight: 1, text: fragment.context.excerpt),
        WeightedField(weight: 1, text: fragment.context.sourceHost),
        WeightedField(weight: 1, text: fragment.context.sourceUrl),
    ]
    .map { WeightedField(weight: $0.weight, text: normalizeContent($0.text)) }
}

/// Whitespace word split; each word must substring-hit some field (search.md §2).
func splitWords(_ query: String) -> [String] {
    normalizeContent(query)
        .split(whereSeparator: { $0.isWhitespace })
        .map(String.init)
}

func searchScore(_ fields: [WeightedField], words: [String]) -> Int? {
    var score = 0
    for word in words {
        var best = 0
        for field in fields where field.text.contains(word) && field.weight > best {
            best = field.weight
        }
        if best == 0 { return nil }  // a word hit nothing — record excluded
        score += best
    }
    return score
}

/// Returns the search score, or nil when the fragment is excluded.
public func passesFilters(
    _ fragment: FragmentRecord,
    _ filters: FragmentQueryFilters,
    words: [String]
) -> Int? {
    if let kinds = filters.kinds, !kinds.isEmpty, !kinds.contains(fragment.kind) { return nil }
    if let hosts = filters.hosts, !hosts.isEmpty, !hosts.contains(fragment.context.sourceHost) { return nil }
    if let tags = filters.tags, !tags.isEmpty, !tags.contains(where: fragment.tags.contains) { return nil }
    let capturedAt = fragment.context.capturedAt
    if let capturedFrom = filters.capturedFrom, capturedAt < capturedFrom { return nil }
    if let capturedTo = filters.capturedTo, capturedAt >= capturedTo { return nil }
    if words.isEmpty { return 0 }
    return searchScore(haystack(fragment), words: words)
}

struct QuerySortKey {
    var score: Int
    var createdAt: Int
    var id: String
}

func compareQueryKeys(_ a: QuerySortKey, _ b: QuerySortKey) -> Bool {
    // score desc → createdAt desc → id asc.
    if a.score != b.score { return a.score > b.score }
    if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
    return a.id < b.id
}

/// Cursor payload encodes as a JSON array `[score, createdAt, id]` — the
/// same opaque shape as learning-core/query.ts.
struct CursorPayload: Encodable {
    var score: Int
    var createdAt: Int
    var id: String

    func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(score)
        try c.encode(createdAt)
        try c.encode(id)
    }
}

func encodeQueryCursor(_ key: QuerySortKey) -> String {
    guard
        let data = try? JSONEncoder().encode(
            CursorPayload(
                score: key.score, createdAt: key.createdAt, id: key.id
            ))
    else { return "[]" }
    return String(data: data, encoding: .utf8) ?? "[]"
}

func decodeQueryCursor(_ cursor: String) -> QuerySortKey? {
    guard let data = cursor.data(using: .utf8),
        let triple = try? JSONDecoder().decode([JSONValueBox].self, from: data),
        triple.count == 3,
        let score = triple[0].intValue,
        let createdAt = triple[1].intValue,
        let id = triple[2].stringValue
    else { return nil }
    return QuerySortKey(score: score, createdAt: createdAt, id: id)
}

/// JSONValue-like box just for cursor decoding (score/createdAt/id triple).
struct JSONValueBox: Decodable {
    let intValue: Int?
    let stringValue: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        intValue = try? c.decode(Int.self)
        stringValue = try? c.decode(String.self)
    }
}

public func runFragmentQuery(
    _ fragments: [FragmentRecord],
    query: FragmentQuery = FragmentQuery()
) -> FragmentQueryResult {
    let words = splitWords(query.filters.search ?? "")
    let limit = min(max(1, query.limit ?? pageDefault), pageMax)

    var keyed: [(fragment: FragmentRecord, key: QuerySortKey)] = []
    for fragment in fragments {
        guard let score = passesFilters(fragment, query.filters, words: words) else { continue }
        keyed.append((fragment, QuerySortKey(score: score, createdAt: fragment.createdAt, id: fragment.id)))
    }
    keyed.sort { compareQueryKeys($0.key, $1.key) }

    let cursorKey = query.cursor.flatMap(decodeQueryCursor)
    var startIndex = 0
    if let cursorKey {
        // First entry strictly AFTER the cursor key — mirrors the TS
        // `findIndex(entry => compareKeys(entry.key, cursorKey) > 0)`, where
        // "after" means the cursor sorts before the entry.
        if let idx = keyed.firstIndex(where: { compareQueryKeys(cursorKey, $0.key) }) {
            startIndex = idx
        } else {
            startIndex = keyed.count
        }
    }

    let page = Array(keyed.dropFirst(startIndex))
    let items = page.prefix(limit).map(\.fragment)
    var nextCursor: String?
    if !items.isEmpty, page.count > items.count {
        nextCursor = encodeQueryCursor(page[items.count - 1].key)
    }
    return FragmentQueryResult(items: items, nextCursor: nextCursor, total: keyed.count)
}

// ── distinct filter-chip sources ─────────────────────────────────────────

/// Distinct hosts, frequency desc then alpha.
public func collectHosts(_ fragments: [FragmentRecord]) -> [String] {
    collectCounts(fragments.map(\.context.sourceHost))
}

/// Distinct tags, frequency desc then alpha.
public func collectTags(_ fragments: [FragmentRecord]) -> [String] {
    collectCounts(fragments.flatMap(\.tags))
}

public func collectKinds(_ fragments: [FragmentRecord]) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for f in fragments where !seen.contains(f.kind) {
        seen.insert(f.kind)
        out.append(f.kind)
    }
    return out
}

private func collectCounts(_ values: [String]) -> [String] {
    var counts: [String: Int] = [:]
    for value in values {
        counts[value, default: 0] += 1
    }
    return
        counts
        .sorted { a, b in
            if a.value != b.value { return a.value > b.value }
            return a.key < b.key
        }
        .map(\.key)
}

public func countNewThisWeek(_ fragments: [FragmentRecord], now: Int) -> Int {
    let weekAgo = now - 7 * dayMs
    return fragments.filter { $0.createdAt >= weekAgo }.count
}
