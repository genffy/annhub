// Shared test fixtures — v4 contract (fragments.md §3, storage.md §8).

import Foundation
import XCTest
@testable import AnnHubCore

let NOW = 1_769_000_000_000

func wireObject(_ pairs: (String, WireValue)...) -> WireValue {
    .object(Dictionary(uniqueKeysWithValues: pairs.map { ($0.0, $0.1) }))
}

func wireStrings(_ values: [String]) -> WireValue {
    .array(values.map(WireValue.string))
}

/// Valid per-kind detail trees for all 8 enabled kinds.
func makeDetail(kind: String) -> WireValue {
    switch kind {
    case "excerpt":
        return wireObject(("note", .string("为何值得保留")))
    case "concept":
        return wireObject(
            ("definition", .string("央行转向更紧缩政策")),
            ("boundaries", wireStrings(["不等于加息本身"]))
        )
    case "claim":
        return wireObject(
            ("stance", .string("support")),
            ("evidence", wireStrings(["利率期货数据"]))
        )
    case "procedure":
        return wireObject(
            ("steps", wireStrings(["列出数据日历", "核对仓位", "写结论"])),
            ("prerequisites", wireStrings(["本周数据已发布"]))
        )
    case "decision":
        return wireObject(
            ("rationale", .string("波动率升高且信号冲突，先保住本金")),
            ("alternatives", wireStrings(["维持原仓位"]))
        )
    case "question":
        return wireObject(
            ("status", .string("open")),
            ("hypothesis", .string("紧缩会压制长久期债券"))
        )
    case "visual":
        return wireObject(("attachmentIds", wireStrings(["asset_fix1"])))
    case "media-clip":
        return wireObject(
            ("startMs", .int(12000)),
            ("endMs", .int(45000))
        )
    case "inspiration":
        return wireObject(("form", .string("idea")))
    default:
        return wireObject()
    }
}

func makeFragment(
    id: String = "frag_test_01",
    kind: String = "concept",
    content: String = "hawkish pivot",
    excerpt: String = "Investors rotated out of bonds after the Fed signalled a hawkish pivot on rates.",
    use: String = "在下周的宏观复盘里解释债券抛售。",
    sourceUrl: String = "https://www.wsj.com/articles/fed-hawkish-pivot",
    sourceHost: String = "wsj.com",
    sourceTitle: String? = "WSJ — Fed coverage",
    locator: FragmentLocator = .none,
    detail: WireValue? = nil,
    tags: [String] = ["fed", "macro"],
    review: ReviewState? = nil,
    createdAt: Int = NOW,
    updatedAt: Int = NOW
) -> FragmentRecord {
    FragmentRecord(
        id: id,
        captureRevision: 1,
        kind: kind,
        content: content,
        normalizedContent: normalizeContent(content),
        context: FragmentContext(
            excerpt: excerpt,
            sourceUrl: sourceUrl,
            sourceHost: sourceHost,
            sourceTitle: sourceTitle,
            locator: locator,
            capturedAt: NOW
        ),
        processing: FragmentProcessing(
            verified: VerifiedResult(confirmedAt: NOW, source: "source-material"),
            use: use
        ),
        detail: detail ?? makeDetail(kind: kind),
        tags: tags,
        review: review ?? createReviewState(now: NOW),
        createdAt: createdAt,
        updatedAt: updatedAt
    )
}

func makeFragmentOf(kind: String) -> FragmentRecord {
    makeFragment(kind: kind)
}

/// Device id stamped on fragments seeded by tests — the Desktop never creates
/// fragments itself; they always arrive as extension deliveries (desktop.md §3.3).
let testSeedDeviceId = "ext-test"

extension FragmentStore {
    /// Seeds a fragment the way a delivery lands it: factory validation, then a
    /// full-row upsert under an extension device id.
    @discardableResult
    func saveFragment(_ input: CreateFragmentInput) throws -> FragmentRecord {
        let record = try createFragment(input)
        try upsertFragment(record, deviceId: testSeedDeviceId, payloadHash: "")
        return record
    }
}

func freshStore() throws -> FragmentStore {
    try FragmentStore(path: ":memory:", deviceId: "swift-device")
}

// ── fixture loading (Bundle.module "Fixtures") ──────────────────────────

func fixtureData(_ name: String) throws -> Data {
    let url = try XCTUnwrap(
        Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures")
            ?? Bundle.module.url(forResource: name, withExtension: nil)
    )
    return try Data(contentsOf: url)
}

struct PutBodyFixture: Decodable {
    var deviceId: String
    var fragment: WireValue
}

struct CanonicalFixture: Decodable {
    struct Entry: Decodable {
        var canonical: String
        var sha256: String
    }
    var concept: Entry
    var visual: Entry
    var mediaClip: Entry
}

struct RejectionsFixture: Decodable {
    struct Case: Decodable {
        var name: String
        var expectedCode: String
        var body: PutBodyFixture
    }
    var cases: [Case]

    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [Case] = []
        while !c.isAtEnd {
            out.append(try c.decode(Case.self))
        }
        self.cases = out
    }
}

struct AssetMetaFixture: Decodable {
    var sha256: String
    var byteLength: Int
    var mimeType: String
    var width: Int
    var height: Int
}

// ── wire body builders (mirror the extension's PUT payloads) ────────────

/// `{deviceId, fragment}` where the fragment is the record's wire form
/// (capture fields only — no review).
func putFragmentBody(deviceId: String, record: FragmentRecord) throws -> Data {
    try JSONEncoder().encode(
        wireObject(
            ("deviceId", .string(deviceId)),
            ("fragment", toFragmentWire(record))
        ))
}

/// Re-encode an already-parsed fixture body tree.
func putFragmentBody(deviceId: String, fragment: WireValue) throws -> Data {
    try JSONEncoder().encode(
        wireObject(
            ("deviceId", .string(deviceId)),
            ("fragment", fragment)
        ))
}

func decodeRecord(from fragmentTree: WireValue) throws -> FragmentRecord {
    let data = try JSONEncoder.learningCore().encode(fragmentTree)
    return try JSONDecoder.learningCore().decode(FragmentRecord.self, from: data)
}

func expectedValidationError(
    _ record: FragmentRecord, code: FragmentErrorCode,
    file: StaticString = #filePath, line: UInt = #line
) {
    let result = validateFragment(record)
    guard result.ok == false, let got = result.code else {
        XCTFail("expected \(code.rawValue), got ok", file: file, line: line)
        return
    }
    XCTAssertEqual(got, code, file: file, line: line)
}
