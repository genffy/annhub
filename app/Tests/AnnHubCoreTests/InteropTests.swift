// Cross-language interop: consume every fixture under Fixtures/ — the
// fragment-put payloads, the canonical JSON hashes, the rejection matrix and
// the asset bytes must all behave identically on the Swift side.

import XCTest
@testable import AnnHubCore

final class InteropTests: XCTestCase {
    func testConceptFixtureParsesValidatesAndHashes() throws {
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-concept.json"))
        XCTAssertEqual(body.deviceId, "device_1")
        let record = try decodeRecord(from: body.fragment)

        XCTAssertEqual(record.schemaVersion, 4)
        XCTAssertEqual(record.id, "eDiLZ7Nxg_6Q")
        XCTAssertEqual(record.kind, "concept")
        XCTAssertEqual(record.captureRevision, 1)
        XCTAssertEqual(record.content, "hawkish pivot")
        XCTAssertEqual(record.normalizedContent, "hawkish pivot")
        XCTAssertEqual(record.context.sourceHost, "wsj.com")
        XCTAssertEqual(record.processing.guess, "紧缩立场的转变")
        XCTAssertEqual(record.processing.verified?.source, "source-material")
        XCTAssertEqual(record.processing.verified?.confirmedAt, 1768999999000)
        XCTAssertEqual(record.tags, ["fed", "macro"])
        XCTAssertEqual(record.conceptDetail?.definition, "央行转向更紧缩政策")
        XCTAssertTrue(validateFragment(record).ok)

        // Hash parity with the TS-produced fixture.
        let canonical = try JSONDecoder().decode(CanonicalFixture.self, from: fixtureData("fragment-canonical.json"))
        XCTAssertEqual(fragmentWireHash(toFragmentWire(record)), canonical.concept.sha256)
        XCTAssertEqual(canonicalJson(body.fragment), canonical.concept.canonical)
    }

    func testVisualFixtureLocatorAndAttachment() throws {
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-visual.json"))
        let record = try decodeRecord(from: body.fragment)

        XCTAssertEqual(record.kind, "visual")
        XCTAssertEqual(record.context.locator, .image(assetId: "asset_fix1", rect: nil))
        XCTAssertEqual(record.attachmentIds, ["asset_fix1"])
        XCTAssertTrue(validateFragment(record).ok)

        let canonical = try JSONDecoder().decode(CanonicalFixture.self, from: fixtureData("fragment-canonical.json"))
        XCTAssertEqual(fragmentWireHash(toFragmentWire(record)), canonical.visual.sha256)
        XCTAssertEqual(canonicalJson(body.fragment), canonical.visual.canonical)
    }

    func testMediaClipFixtureValidatesAndHashes() throws {
        let body = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-media-clip.json"))
        let record = try decodeRecord(from: body.fragment)

        XCTAssertEqual(record.kind, "media-clip")
        XCTAssertTrue(enabledFragmentKinds.contains("media-clip"), "R4 enables media-clip")
        XCTAssertEqual(record.context.locator, .time(startMs: 12000, endMs: 45000))
        XCTAssertEqual(record.mediaClipDetail?.startMs, 12000)
        XCTAssertEqual(record.mediaClipDetail?.endMs, 45000)
        XCTAssertEqual(record.tags, ["podcast"])
        XCTAssertTrue(validateFragment(record).ok)

        let canonical = try JSONDecoder().decode(CanonicalFixture.self, from: fixtureData("fragment-canonical.json"))
        XCTAssertEqual(fragmentWireHash(toFragmentWire(record)), canonical.mediaClip.sha256)
        XCTAssertEqual(canonicalJson(body.fragment), canonical.mediaClip.canonical)
    }

    func testRejectionFixturesEachYieldExpectedCode() throws {
        let rejections = try JSONDecoder().decode(
            RejectionsFixture.self, from: fixtureData("fragment-put-rejections.json")
        )
        XCTAssertFalse(rejections.cases.isEmpty)
        for testCase in rejections.cases {
            let record = try decodeRecord(from: testCase.body.fragment)
            let result = validateFragment(record)
            XCTAssertFalse(result.ok, "case \(testCase.name) must fail")
            XCTAssertEqual(result.code?.rawValue, testCase.expectedCode, "case \(testCase.name)")
        }
    }

    func testAssetFixtureBytesMatchMeta() throws {
        let meta = try JSONDecoder().decode(AssetMetaFixture.self, from: fixtureData("asset-meta.json"))
        let bytes = try fixtureData("asset.png")

        XCTAssertEqual(bytes.count, 94)
        XCTAssertEqual(meta.byteLength, 94)
        XCTAssertEqual(sha256Hex(bytes), meta.sha256)
        XCTAssertEqual(meta.mimeType, "image/png")
        XCTAssertEqual(meta.width, 4)
        XCTAssertEqual(meta.height, 2)
    }

    func testFixtureDeliversThroughHubEndToEnd() throws {
        // Fragment first, then the referenced image (storage.md §8 ordering).
        let store = try freshStore()
        let hub = DesktopHub(store: store, pairToken: "tok")
        let conceptBody = try fixtureData("fragment-put-concept.json")
        let putFragment = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/fragments/eDiLZ7Nxg_6Q",
                bearerToken: "tok", body: conceptBody
            ))
        XCTAssertEqual(putFragment.status, 201)

        let visualBody = try fixtureData("fragment-put-visual.json")
        let putVisual = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/fragments/RruKgJsHbg0V",
                bearerToken: "tok", body: visualBody
            ))
        XCTAssertEqual(putVisual.status, 201)

        let clipBody = try fixtureData("fragment-put-media-clip.json")
        let putClip = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/fragments/XrjLmqIJmR4G",
                bearerToken: "tok", body: clipBody
            ))
        XCTAssertEqual(putClip.status, 201)

        let meta = try JSONDecoder().decode(AssetMetaFixture.self, from: fixtureData("asset-meta.json"))
        let bytes = try fixtureData("asset.png")
        let putAsset = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/assets/asset_fix1",
                bearerToken: "tok",
                headers: [
                    "Content-Type": meta.mimeType,
                    "X-AnnHub-Sha256": meta.sha256,
                    "X-AnnHub-Byte-Length": String(meta.byteLength),
                ],
                body: bytes
            ))
        XCTAssertEqual(putAsset.status, 201)
        XCTAssertEqual(try store.getFragments().count, 3)
        XCTAssertEqual(try store.missingAttachmentCount(), 0)
    }
}
