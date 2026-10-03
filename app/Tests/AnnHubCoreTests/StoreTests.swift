// FragmentStore v4: roundtrip, assets, deletions, legacy-file backup,
// outbox, and the rating transaction (docs/v2/storage.md §6).

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

    func testLocalSaveFragmentFillsDeliveryDefaults() throws {
        let store = try freshStore()
        let record = try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "  hawkish pivot  ",
            context: FragmentContextInput(
                excerpt: "The Fed made a hawkish pivot and stocks fell sharply today.",
                sourceUrl: "https://www.wsj.com/markets",
                sourceHost: "wsj.com",
                capturedAt: NOW
            ),
            processing: FragmentProcessing(
                verified: VerifiedResult(confirmedAt: NOW, source: "source-material"),
                use: "在下周的宏观复盘里解释债券抛售。"
            ),
            detail: .concept(ConceptDetail(definition: "转向更紧缩")),
            tags: ["Fed", "fed"],
            now: NOW
        ))
        XCTAssertEqual(record.content, "hawkish pivot") // trimmed by factory
        XCTAssertEqual(record.tags, ["fed"]) // deduped + lowercased
        XCTAssertEqual(record.captureRevision, 1)
        let delivery = try XCTUnwrap(store.fragmentDelivery(id: record.id))
        // Desktop-created rows carry the desktop-local device constant (R3):
        // they are distinguishable from extension deliveries, with no hash.
        XCTAssertEqual(delivery.deviceId, desktopLocalDeviceId)
        XCTAssertEqual(delivery.payloadHash, "")
        // No outbox row: the authoritative Desktop feed is change_log (§3.4).
        XCTAssertEqual(try store.outboxCount(), 0)
        // One change-feed row (fragment.created, full payload).
        XCTAssertEqual(try store.changeLogCount(), 1)
    }

    func testSaveFragmentThrowsOnInvalid() throws {
        let store = try freshStore()
        XCTAssertThrowsError(try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "hawkish pivot",
            context: FragmentContextInput(
                excerpt: "Completely different excerpt without the content.",
                sourceUrl: "https://www.wsj.com/markets",
                sourceHost: "wsj.com"
            ),
            processing: FragmentProcessing(
                verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                use: "用于验证。"
            ),
            detail: .concept(ConceptDetail()),
            now: NOW
        )))
        XCTAssertTrue(try store.getFragments().isEmpty)
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

    func testDeleteFragmentCascadesAndMarksDeletion() throws {
        let store = try freshStore()
        let a = makeFragment(id: "frag_a")
        let b = makeFragment(id: "frag_b")
        try store.upsertFragment(a, deviceId: "device_1", payloadHash: "h1")
        try store.upsertFragment(b, deviceId: "device_1", payloadHash: "h2")
        _ = try store.rateFragment(id: "frag_a", rating: .good, usedHint: false, now: NOW)
        try store.saveRelation(validRelation(from: "frag_a", to: "frag_b"))

        try store.deleteFragment(id: "frag_a", now: NOW)

        XCTAssertNil(try store.getFragment(id: "frag_a"))
        XCTAssertFalse(try store.isDeleted(id: "frag_b"))
        XCTAssertTrue(try store.isDeleted(id: "frag_a"))
        XCTAssertEqual(try store.getReviewLogs().count, 0) // logs cascade
        XCTAssertEqual(try store.getRelations().count, 0) // relations cascade
        XCTAssertEqual(try store.getLocalDeletions().map(\.fragmentId), ["frag_a"])
    }

    // ── legacy DB file moved aside ───────────────────────────────────────

    func testLegacyV3DatabaseFileIsMovedAside() throws {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "annhub-store-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }

        let dbPath = dir.appending(path: "legacy.sqlite").path
        let backupPath = dir.appending(path: "legacy-v3-backup.sqlite").path

        // Create an old-shape v3 database (no capture_revision column).
        var db: OpaquePointer?
        XCTAssertEqual(sqlite3_open(dbPath, &db), SQLITE_OK)
        XCTAssertEqual(
            sqlite3_exec(db, """
            CREATE TABLE fragments (
              id TEXT PRIMARY KEY,
              schema_version INTEGER NOT NULL,
              kind TEXT NOT NULL,
              content TEXT NOT NULL,
              normalized_content TEXT NOT NULL,
              dedupe_key TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );
            INSERT INTO fragments VALUES ('old_1', 3, 'chunk', 'x', 'x', 'k', 1, 1);
            """, nil, nil, nil),
            SQLITE_OK
        )
        sqlite3_close(db)
        db = nil

        let store = try FragmentStore(path: dbPath, deviceId: "swift-device")
        XCTAssertTrue(FileManager.default.fileExists(atPath: backupPath), "v3 file must be renamed to <name>-v3-backup.sqlite")
        XCTAssertTrue(try store.getFragments().isEmpty, "fresh v4 store starts empty")
        // The fresh store is usable.
        try store.upsertFragment(makeFragment(id: "new_1"), deviceId: "d", payloadHash: "h")
        XCTAssertEqual(try store.getFragments().map(\.id), ["new_1"])
    }

    func testFreshDatabasePathStartsClean() throws {
        let dir = FileManager.default.temporaryDirectory
            .appending(path: "annhub-store-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let dbPath = dir.appending(path: "fresh.sqlite").path
        _ = try FragmentStore(path: dbPath, deviceId: "d")
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appending(path: "fresh-v3-backup.sqlite").path))
    }

    // ── outbox (retired for Desktop-local mutations, storage.md §3.4/§9) ──

    func testDesktopLocalMutationsNeverEnqueueOutboxRows() throws {
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
        _ = try store.saveWritingTask(createWritingTask(CreateWritingTaskInput(
            taskType: "plan", topic: "x", fragmentIds: [], now: NOW
        )))
        try store.saveRelation(validRelation())
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
        XCTAssertEqual(try store.changeLogCount(), 1)
        XCTAssertEqual(try store.changes(after: 0, limit: 10).first?.type, "fragment.created")

        // Rating appends review.rated in the same transaction.
        _ = try store.rateFragment(id: record.id, rating: .good, usedHint: false, now: NOW + 10)
        XCTAssertEqual(try store.changeLogCount(), 2)
        let ratedRow = try store.changes(after: 1, limit: 10)[0]
        XCTAssertEqual(ratedRow.type, "review.rated")

        // Extension-path upsert never appends (echo exclusion).
        try store.upsertFragment(makeFragment(id: "frag_ext"), deviceId: "device_1", payloadHash: "h")
        XCTAssertEqual(try store.changeLogCount(), 2)

        // Suggested relations never travel; confirmed ones do.
        try store.saveRelation(validAutoRelation(id: "rel_s", from: record.id, to: "frag_ext"))
        XCTAssertEqual(try store.changeLogCount(), 2, "suggested rows append nothing")
        let confirmed = validRelation(id: "rel_c1", from: record.id, to: "frag_ext")
        try store.saveRelation(confirmed)
        XCTAssertEqual(try store.changeLogCount(), 3)
        XCTAssertEqual(try store.changes(after: 2, limit: 10)[0].type, "relation.created")
        var updated = confirmed
        updated.note = "改"
        updated.updatedAt = NOW + 20
        try store.saveRelation(updated)
        XCTAssertEqual(try store.changeLogCount(), 4)
        XCTAssertEqual(try store.changes(after: 3, limit: 10)[0].type, "relation.updated")

        // Suppression syncs; single-relation delete syncs; fragment delete is
        // informational.
        try store.saveSuppression(RelationSuppression(
            fromFragmentId: "a", toFragmentId: "b", suggestedType: "similarity", rejectedAt: NOW
        ))
        XCTAssertEqual(try store.changeLogCount(), 5)
        try store.deleteRelation(id: "rel_c1", now: NOW + 30)
        XCTAssertEqual(try store.changeLogCount(), 6)
        try store.deleteFragment(id: record.id, now: NOW + 40)
        XCTAssertEqual(try store.changeLogCount(), 7)
        XCTAssertEqual(try store.changes(after: 6, limit: 10)[0].type, "fragment.deleted")

        // Echo-off ingestion paths append nothing either.
        _ = try store.saveWritingTask(createWritingTask(CreateWritingTaskInput(
            taskType: "plan", topic: "x", fragmentIds: [], now: NOW
        )), emitChange: false)
        XCTAssertEqual(try store.changeLogCount(), 7)
    }

    func testChangeLogAtomicOnFailedMutation() throws {
        let store = try freshStore()
        // Excerpt misses the content → factory validation throws.
        XCTAssertThrowsError(try store.saveFragment(CreateFragmentInput(
            kind: "concept",
            content: "hawkish pivot",
            context: FragmentContextInput(
                excerpt: "完全无关的摘录",
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
        )))
        XCTAssertEqual(try store.changeLogCount(), 0, "no row when validation fails")
    }

    func testWritingTaskRoundtripOrderingAndChangeTypes() throws {
        let store = try freshStore()
        let older = createWritingTask(CreateWritingTaskInput(
            taskType: "plan", topic: "旧", fragmentIds: ["f1"], now: NOW - dayMs
        ))
        var newer = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "新", fragmentIds: ["f1"], now: NOW
        ))
        try store.saveWritingTask(older)
        try store.saveWritingTask(newer)
        newer.draftContent = "草稿"
        try store.saveWritingTask(newer)
        newer = appendSubmission(newer, "正文", now: NOW + 100)
        try store.saveWritingTask(newer)

        // Roundtrip.
        let loaded = try XCTUnwrap(store.getWritingTask(id: newer.id))
        XCTAssertEqual(loaded, newer)
        XCTAssertEqual(loaded.draftContent, "")
        XCTAssertEqual(loaded.submissions.map(\.content), ["正文"])

        // List ordered by createdAt desc (desktop.md §6 history).
        XCTAssertEqual(try store.getWritingTasks().map(\.taskType), ["article", "plan"])

        // Change rows: created (x2 draft saves while no submissions), then
        // submitted after the first submission.
        let types = try store.changes(after: 0, limit: 20).map(\.type)
        XCTAssertEqual(types, ["writing.created", "writing.created", "writing.created", "writing.submitted"])

        // Ingestion path stores without change rows.
        var ingested = older
        ingested = appendSubmission(ingested, "扩展回传", now: NOW + 200)
        _ = try store.saveWritingTask(ingested, emitChange: false)
        XCTAssertEqual(try store.changeLogCount(), 4)
        XCTAssertEqual(try store.getWritingTask(id: older.id)?.submissions.count, 1)
    }

    func testAppliedEventsIdempotencyTable() throws {
        let store = try freshStore()
        XCTAssertTrue(try store.markApplied(deviceId: "d1", eventId: "e1", now: NOW))
        XCTAssertTrue(try store.isApplied(deviceId: "d1", eventId: "e1"))
        XCTAssertFalse(try store.markApplied(deviceId: "d1", eventId: "e1", now: NOW))
        XCTAssertFalse(try store.isApplied(deviceId: "d2", eventId: "e1"), "scoped per device")
    }

    func testRelationsListingByEndpoint() throws {
        let store = try freshStore()
        let record = try seedLocalFragment(store)
        try store.upsertFragment(makeFragment(id: "frag_b2"), deviceId: "d", payloadHash: "h")
        try store.upsertFragment(makeFragment(id: "frag_c3"), deviceId: "d", payloadHash: "h")
        try store.saveRelation(validRelation(id: "r1", from: record.id, to: "frag_b2"))
        try store.saveRelation(validRelation(id: "r2", from: "frag_c3", to: record.id, type: "evidence"))
        try store.saveRelation(validRelation(id: "r3", from: "frag_b2", to: "frag_c3"))

        let around = try store.relationsForFragment(id: record.id)
        XCTAssertEqual(Set(around.map(\.id)), ["r1", "r2"], "both directions, others excluded")
    }
}
