// Canonical JSON byte-parity with fixtures/interop/fragment-canonical.json —
// the cross-language wire contract (learning-core/wire.ts mirror).

import XCTest
@testable import AnnHubCore

final class WireCanonicalTests: XCTestCase {
    private func canonicalFixture() throws -> CanonicalFixture {
        try JSONDecoder().decode(CanonicalFixture.self, from: fixtureData("fragment-canonical.json"))
    }

    func testConceptFixtureByteParityThroughModel() throws {
        let fixtures = try canonicalFixture()
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-concept.json"))
        let record = try decodeRecord(from: body.fragment)

        let canonical = canonicalJson(toFragmentWire(record))
        XCTAssertEqual(canonical, fixtures.concept.canonical)
        XCTAssertEqual(sha256Hex(canonical), fixtures.concept.sha256)
        XCTAssertEqual(fragmentWireHash(toFragmentWire(record)), fixtures.concept.sha256)
    }

    func testConceptFixtureByteParityThroughParsedTree() throws {
        let fixtures = try canonicalFixture()
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-concept.json"))
        // Desktop hashes the parsed request tree directly.
        XCTAssertEqual(canonicalJson(body.fragment), fixtures.concept.canonical)
    }

    func testVisualFixtureByteParity() throws {
        let fixtures = try canonicalFixture()
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-visual.json"))
        let record = try decodeRecord(from: body.fragment)

        XCTAssertEqual(canonicalJson(toFragmentWire(record)), fixtures.visual.canonical)
        XCTAssertEqual(fragmentWireHash(toFragmentWire(record)), fixtures.visual.sha256)
        XCTAssertEqual(canonicalJson(body.fragment), fixtures.visual.canonical)
    }

    func testSortedKeysUseCodeUnitOrder() {
        let value = wireObject(
            ("b", .int(2)),
            ("a", .int(1)),
            ("C", .int(3))
        )
        // 'C' (67) < 'a' (97) < 'b' (98) — UTF-16 code-unit order.
        XCTAssertEqual(canonicalJson(value), "{\"C\":3,\"a\":1,\"b\":2}")
    }

    func testControlCharsEscapeAsLowercaseHex() {
        // U+0008 must render as \u0008 (lowercase hex).
        XCTAssertEqual(canonicalJson(.string("a\u{08}b")), "\"a\\u0008b\"")
        XCTAssertEqual(canonicalJson(.string("x\u{7F}")), "\"x\\u007f\"")
        // The short escapes stay short.
        XCTAssertEqual(canonicalJson(.string("a\nb\tc\rd\"e\\f")), "\"a\\nb\\tc\\rd\\\"e\\\\f\"")
    }

    func testNumberFormatting() {
        XCTAssertEqual(canonicalJson(.int(7)), "7")
        XCTAssertEqual(canonicalJson(.int(1769000000000)), "1769000000000")
        XCTAssertEqual(canonicalJson(.double(0.5)), "0.5")
        XCTAssertEqual(canonicalJson(.double(0.123456)), "0.123456")
        // Integer-valued doubles render as digits (JS Number.isInteger).
        XCTAssertEqual(canonicalJson(.double(12.0)), "12")
        // Trailing zeros are trimmed; no exponent.
        XCTAssertEqual(canonicalJson(.double(0.25)), "0.25")
    }

    func testArraysPreserveOrderAndNullBool() {
        XCTAssertEqual(
            canonicalJson(.array([.null, .bool(true), .bool(false), .string("z"), .string("a")])),
            "[null,true,false,\"z\",\"a\"]"
        )
    }

    func testToFragmentWireStripsReview() throws {
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-concept.json"))
        let record = try decodeRecord(from: body.fragment)
        let wire = toFragmentWire(record)
        guard case let .object(fields) = wire else {
            return XCTFail("wire must be an object")
        }
        XCTAssertNil(fields["review"])
        XCTAssertEqual(
            Set(fields.keys),
            Set([
                "schemaVersion", "id", "captureRevision", "kind", "content", "normalizedContent",
                "context", "processing", "detail", "tags", "createdAt", "updatedAt",
            ]))
    }

    func testSha256AbcVector() {
        XCTAssertEqual(
            sha256Hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        XCTAssertEqual(sha256Hex(Data([0x61, 0x62, 0x63])), sha256Hex("abc"))
    }

    func testMaxImageBytes() {
        XCTAssertEqual(MAX_IMAGE_BYTES, 10 * 1024 * 1024)
        XCTAssertEqual(MAX_IMAGE_BYTES, 10_485_760)
    }
}
