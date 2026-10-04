// FragmentStore v4: roundtrip, assets, deletions, persistence across reopen,
// outbox, change feed and the rating transaction (docs/v2/storage.md §6).

import XCTest
import SQLite3
@testable import AnnHubCore

final class StoreTests: XCTestCase {
    func testRoundtripAllKindsIncludingDetailJSON() throws {
        let store = try freshStore()
        for kind in enabledFragmentKinds {
            let record = makeFragment(id: "frag_\(kind)", kind: kind)
            try store.upsertFragment(record, deviceId: "device_1", payloadHash: "hash_\(kind)")
            let loaded = try XCTUnwrap(store.getFragment(id: record.id))
            XCTAssertEqual(loaded, record, "kind \(kind) must roundtrip losslessly")
            XCTAssertEqual(loaded.kind, kind)
        }
        XCTAssertEqual(try store.getFragments().count, enabledFragmentKinds.count)
    }

    func testRoundtripPreservesOptionalContextFields() throws {
        let store = try freshStore()
        var record = makeFragment(id: "frag_opts")
        record.context.sourceTitle = nil
        record.context.locator = .image(assetId: "asset_fix1", rect: [0.1, 0.1, 0.5, 0.4])
        record.processing.guess = "紧缩立场的转变"
        record.processing.verified?.summary = "指向更紧缩的货币政策立场"
        record.processing.verified?.references = ["https://wsj.com/x"]
        try store.upsertFragment(record, deviceId: "d", payloadHash: "h")
        let loaded = try XCTUnwrap(store.getFragment(id: "frag_opts"))
        XCTAssertNil(loaded.context.sourceTitle)
        XCTAssertEqual(loaded.context.locator, .image(assetId: "asset_fix1", rect: [0.1, 0.1, 0.5, 0.4]))
        XCTAssertEqual(loaded.processing.verified?.summary, "指向更紧缩的货币政策立场")
    }

    // ── assets ───────────────────────────────────────────────────────────

    private func fixtureAsset() throws -> (meta: AssetMetaFixture, bytes: Data) {
        let meta = try JSONDecoder().decode(AssetMetaFixture.self, from: fixtureData("asset-meta.json"))
        let bytes = try fixtureData("asset.png")
        return (meta, bytes)
    }

    func testAssetPutGetBytesEqualityAndIdempotence() throws {
        let store = try freshStore()
        let (meta, bytes) = try fixtureAsset()
        XCTAssertEqual(bytes.count, meta.byteLength)

        let asset = ImageAsset(
            id: "asset_fix1", mimeType: meta.mimeType, byteLength: bytes.count,
            sha256: sha256Hex(bytes), width: meta.width, height: meta.height, createdAt: NOW
        )
        XCTAssertEqual(try store.putAsset(asset, bytes: bytes), .inserted)
        let loaded = try XCTUnwrap(store.getAsset(id: "asset_fix1"))
        XCTAssertEqual(loaded.bytes, bytes) // byte equality
        XCTAssertEqual(loaded.metadata.sha256, meta.sha256)

        // Same id + same hash → idempotent confirmation, not an error.
        XCTAssertEqual(try store.putAsset(asset, bytes: bytes), .duplicate)
        XCTAssertTrue(try store.assetExists(id: "asset_fix1"))

        // Same id + different hash → conflict.
        var mutated = bytes
        mutated[0] ^= 0xFF
        XCTAssertThrowsError(try store.putAsset(ImageAsset(
            id: "asset_fix1", mimeType: meta.mimeType, byteLength: mutated.count,
            sha256: sha256Hex(mutated), width: 0, height: 0, createdAt: NOW
        ), bytes: mutated)) { error in
            XCTAssertEqual(error as? StoreError, .assetConflict(existingSha256: meta.sha256))
        }
    }

    func testMissingAttachmentCount() throws {
        let store = try freshStore()
        let (_, bytes) = try fixtureAsset()
        try store.putAsset(ImageAsset(
            id: "asset_fix1", mimeType: "image/png", byteLength: bytes.count,
            sha256: sha256Hex(bytes), width: 4, height: 2, createdAt: NOW
        ), bytes: bytes)
        try store.upsertFragment(makeFragment(id: "v1", kind: "visual"), deviceId: "d", payloadHash: "h")
        try store.upsertFragment(makeFragment(id: "v2", kind: "visual", detail: wireObject(
            ("attachmentIds", wireStrings(["asset_missing"]))
        )), deviceId: "d", payloadHash: "h")
        // Text fragments never count.
        try store.upsertFragment(makeFragment(id: "c1"), deviceId: "d", payloadHash: "h")
        XCTAssertEqual(try store.missingAttachmentCount(), 1)
    }

    // ── delete ───────────────────────────────────────────────────────────

    func testDeleteFragmentCascadesToReviewLogsAndMarksDeletion() throws {
        let store = try freshStore()
        let a = makeFragment(id: "frag_a")
        let b = makeFragment(id: "frag_b")
        try store.upsertFragment(a, deviceId: "device_1", payloadHash: "h1")
        try store.upsertFragment(b, deviceId: "device_1", payloadHash: "h2")
        _ = try store.rateFragment(id: "frag_a", rating: .good, usedHint: false, now: NOW)

        try store.deleteFragment(id: "frag_a", now: NOW)

        XCTAssertNil(try store.getFragment(id: "frag_a"))
        XCTAssertFalse(try store.isDeleted(id: "frag_b"))
        XCTAssertTrue(try store.isDeleted(id: "frag_a"))
        XCTAssertEqual(try store.getReviewLogs().count, 0) // logs cascade
        XCTAssertEqual(try store.getLocalDeletions().map(\.fragmentId), ["frag_a"])
    }

    // ── persistence across reopen ───────────────────────────────────────

    func testFileBackedStorePersistsAcrossReopen() throws {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "annhub-store-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let dbPath = dir.appending(path: "store.sqlite").path

        do {
            let store = try FragmentStore(path: dbPath, deviceId: "swift-device")
            try store.upsertFragment(makeFragment(id: "persisted_1"), deviceId: "device_1", payloadHash: "h")
            _ = try store.rateFragment(id: "persisted_1", rating: .good, usedHint: false, now: NOW)
        }
        let reopened = try FragmentStore(path: dbPath, deviceId: "swift-device")
        XCTAssertEqual(try reopened.getFragments().map(\.id), ["persisted_1"])
        XCTAssertEqual(try reopened.reviewLogCount(fragmentId: "persisted_1"), 1)
        XCTAssertEqual(try reopened.changeLogCount(), 1)
    }

    // ── outbox (storage.md §3.4/§9) ───────────────────────────────────────

    func testDesktopMutationsNeverEnqueueOutboxRows() throws {
        let store = try freshStore()
        XCTAssertEqual(try store.outboxCount(), 0)
        let record = try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "hawkish pivot",
            context: FragmentContextInput(
                excerpt: "hawkish pivot in the excerpt.",
                sourceUrl: "https://www.wsj.com/markets",
                sourceHost: "wsj.com",
                capturedAt: NOW
            ),
            processing: FragmentProcessing(
                verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                use: "用于验证。"
            ),
            detail: .concept(ConceptDetail()),
            now: NOW
        ))
        _ = try store.rateFragment(id: record.id, rating: .good, usedHint: false, now: NOW)
        let (_, bytes) = try fixtureAsset()
        _ = try store.putAsset(ImageAsset(
            id: "asset_fix1", mimeType: "image/png", byteLength: bytes.count,
            sha256: sha256Hex(bytes), width: 0, height: 0, createdAt: NOW
        ), bytes: bytes)
        // The authoritative feed is change_log; outbox_events stays empty and
        // the 待发送事件 counter derives from change rows beyond the cursor.
        XCTAssertEqual(try store.outboxCount(), 0)
        XCTAssertEqual(try store.pendingChangeCount(), try store.changeLogCount())
    }

    // ── rating transaction ───────────────────────────────────────────────

    func testRateFragmentWritesFragmentAndLogInOneTransaction() throws {
        let store = try freshStore()
        let record = try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "hawkish pivot",
            context: FragmentContextInput(
                excerpt: "hawkish pivot excerpt.",
                sourceUrl: "https://www.wsj.com/markets",
                sourceHost: "wsj.com",
                capturedAt: NOW
            ),
            processing: FragmentProcessing(
                verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                use: "用于验证。"
            ),
            detail: .concept(ConceptDetail()),
            now: NOW
        ))
        let rated = try store.rateFragment(id: record.id, rating: .good, usedHint: true, now: NOW + 1000)
        XCTAssertEqual(rated.fragment.review.repetitions, 1)
        XCTAssertEqual(rated.log.usedHint, true)
        XCTAssertEqual(rated.log.target.fragmentId, record.id)

        let stored = try XCTUnwrap(store.getFragment(id: record.id))
        XCTAssertEqual(stored.review.repetitions, 1)
        XCTAssertEqual(try store.reviewLogCount(fragmentId: record.id), 1)
    }

    func testFragmentRevisionAndStats() throws {
        let store = try freshStore()
        XCTAssertNil(try store.fragmentRevision(id: "nope"))
        try store.upsertFragment(makeFragment(id: "frag_r"), deviceId: "d", payloadHash: "h")
        XCTAssertEqual(try store.fragmentRevision(id: "frag_r"), 1)
        var rev2 = makeFragment(id: "frag_r")
        rev2.captureRevision = 2
        try store.upsertFragment(rev2, deviceId: "d", payloadHash: "h2")
        XCTAssertEqual(try store.fragmentRevision(id: "frag_r"), 2)

        let stats = try store.stats()
        XCTAssertEqual(stats.fragments, 1)
        XCTAssertEqual(stats.outbox, 0, "hub deliveries enqueue no outbox rows")
        XCTAssertEqual(stats.changes, 0, "hub deliveries never append change rows")
    }

    // ── change feed (R3, storage.md §9) ──────────────────────────────────

    private func seedLocalFragment(_ store: FragmentStore, id: String = "frag_c1") throws -> FragmentRecord {
        try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "hawkish pivot",
            context: FragmentContextInput(
                excerpt: "hawkish pivot excerpt.",
                sourceUrl: "https://www.wsj.com/markets",
                sourceHost: "wsj.com",
                capturedAt: NOW
            ),
            processing: FragmentProcessing(
                verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                use: "用于验证。"
            ),
            detail: .concept(ConceptDetail()),
            now: NOW
        ))
    }

    func testChangeLogRowsWrittenWithDesktopMutationsOnly() throws {
        let store = try freshStore()
        let record = try seedLocalFragment(store)
        // Seeding goes through the delivery path: no change row (echo exclusion).
        XCTAssertEqual(try store.changeLogCount(), 0)

        // Rating appends review.rated in the same transaction.
        _ = try store.rateFragment(id: record.id, rating: .good, usedHint: false, now: NOW + 10)
        XCTAssertEqual(try store.changeLogCount(), 1)
        XCTAssertEqual(try store.changes(after: 0, limit: 10)[0].type, "review.rated")

        // Extension-path upsert never appends (echo exclusion).
        try store.upsertFragment(makeFragment(id: "frag_ext"), deviceId: "device_1", payloadHash: "h")
        XCTAssertEqual(try store.changeLogCount(), 1)

        // A Desktop delete is informational only (the extension keeps its copy).
        try store.deleteFragment(id: record.id, now: NOW + 40)
        XCTAssertEqual(try store.changeLogCount(), 2)
        XCTAssertEqual(try store.changes(after: 1, limit: 10)[0].type, "fragment.deleted")
    }

    func testAppliedEventsIdempotencyTable() throws {
        let store = try freshStore()
        XCTAssertTrue(try store.markApplied(deviceId: "d1", eventId: "e1", now: NOW))
        XCTAssertTrue(try store.isApplied(deviceId: "d1", eventId: "e1"))
        XCTAssertFalse(try store.markApplied(deviceId: "d1", eventId: "e1", now: NOW))
        XCTAssertFalse(try store.isApplied(deviceId: "d2", eventId: "e1"), "scoped per device")
    }
}
