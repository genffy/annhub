// FragmentStore — Desktop-side persistence, SQLite per docs/v2/storage.md §6.
//
// Semantics mirrored from the contract:
//   - fragments: capture fields + review_json; locally created rows carry
//     empty source_device_id / source_payload_hash (only hub writes fill them)
//   - rateFragment persists fragment + log in ONE transaction
//   - Desktop delete removes fragment + review_logs in one tx and writes the
//     fragment_deletions marker (later PUTs of the same id → 410)
//   - assets hold image BLOBs; putAsset is idempotent per (id, sha256)
//   - outbox events enqueue transactionally; only confirmed ids may be pruned
//
import Foundation
import SQLite3

public enum StoreError: Error, Equatable {
    case validation(code: String)
    case sqlite(String)
    case assetConflict(existingSha256: String)
    case notFound(String)
}

public struct StoreStats: Equatable, Sendable {
    public var fragments: Int
    public var reviewLogs: Int
    public var assets: Int
    public var outbox: Int
    public var deletions: Int
    public var changes: Int

    public init(
        fragments: Int, reviewLogs: Int, assets: Int, outbox: Int, deletions: Int,
        changes: Int = 0
    ) {
        self.fragments = fragments
        self.reviewLogs = reviewLogs
        self.assets = assets
        self.outbox = outbox
        self.deletions = deletions
        self.changes = changes
    }
}

/// Delivery bookkeeping for a stored fragment (storage.md §8).
public struct FragmentDelivery: Equatable, Sendable {
    public var revision: Int
    public var payloadHash: String
    public var deviceId: String

    public init(revision: Int, payloadHash: String, deviceId: String) {
        self.revision = revision
        self.payloadHash = payloadHash
        self.deviceId = deviceId
    }
}

public enum AssetPutOutcome: Equatable, Sendable {
    case inserted
    /// Same id already stored with the same sha256 — idempotent confirmation.
    case duplicate
}

public final class FragmentStore: @unchecked Sendable {
    var db: OpaquePointer?
    public let deviceId: String
    let encoder = JSONEncoder.learningCore()
    let decoder = JSONDecoder.learningCore()
    private let path: String
    private let transactionLock = NSRecursiveLock()
    private var transactionDepth = 0

    public init(path: String, deviceId: String) throws {
        self.deviceId = deviceId
        self.path = path
        try openDatabase()
        try execute("PRAGMA journal_mode = WAL")
        try execute("PRAGMA busy_timeout = 5000")
        try createSchema()
    }

    deinit {
        if let db { sqlite3_close_v2(db) }
    }

    public convenience init(inMemoryDeviceId: String) throws {
        try self.init(path: ":memory:", deviceId: inMemoryDeviceId)
    }

    private func openDatabase() throws {
        if db != nil { return }
        var dbPointer: OpaquePointer?
        let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path, &dbPointer, flags, nil) == SQLITE_OK else {
            let message = dbPointer.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            throw StoreError.sqlite("open failed: \(message)")
        }
        db = dbPointer
    }

    // ── schema (storage.md §6) ────────────────────────────────────────────

    private func createSchema() throws {
        try execute(
            """
            CREATE TABLE IF NOT EXISTS fragments (
              id                  TEXT PRIMARY KEY,
              schema_version      INTEGER NOT NULL,
              capture_revision    INTEGER NOT NULL,
              kind                TEXT NOT NULL,
              content             TEXT NOT NULL,
              normalized_content  TEXT NOT NULL,
              context_json        TEXT NOT NULL,
              processing_json     TEXT NOT NULL,
              detail_json         TEXT NOT NULL,
              review_json         TEXT NOT NULL,
              tags_json           TEXT NOT NULL,
              source_device_id    TEXT NOT NULL,
              source_payload_hash TEXT NOT NULL,
              created_at          INTEGER NOT NULL,
              updated_at          INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS review_logs (
              id                     TEXT PRIMARY KEY,
              target_fragment_id     TEXT NOT NULL,
              rating                 TEXT NOT NULL,
              reviewed_at            INTEGER NOT NULL,
              previous_interval_days INTEGER NOT NULL,
              next_interval_days     INTEGER NOT NULL,
              used_hint              INTEGER NOT NULL,
              scheduler_version      TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS outbox_events (
              event_id        TEXT PRIMARY KEY,
              device_id       TEXT NOT NULL,
              type            TEXT NOT NULL,
              payload_json    TEXT NOT NULL,
              created_at      INTEGER NOT NULL,
              attempts        INTEGER NOT NULL,
              last_attempt_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS assets (
              id          TEXT PRIMARY KEY,
              mime_type   TEXT NOT NULL,
              byte_length INTEGER NOT NULL,
              sha256      TEXT NOT NULL,
              width       INTEGER NOT NULL,
              height      INTEGER NOT NULL,
              created_at  INTEGER NOT NULL,
              bytes       BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fragment_deletions (
              fragment_id TEXT PRIMARY KEY,
              deleted_at  INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS change_log (
              seq          INTEGER PRIMARY KEY AUTOINCREMENT,
              type         TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at   INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS applied_events (
              event_id   TEXT NOT NULL,
              device_id  TEXT NOT NULL,
              applied_at INTEGER NOT NULL,
              PRIMARY KEY (event_id, device_id)
            );
            CREATE TABLE IF NOT EXISTS sync_state (
              key   TEXT PRIMARY KEY,
              value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS fragment_local_tags (
              fragment_id TEXT NOT NULL,
              tag         TEXT NOT NULL,
              op          TEXT NOT NULL CHECK (op IN ('add', 'remove')),
              updated_at  INTEGER NOT NULL,
              PRIMARY KEY (fragment_id, tag)
            );
            """)
    }

    // ── low-level helpers ────────────────────────────────────────────────

    func execute(_ sql: String) throws {
        var errMsg: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, sql, nil, nil, &errMsg) == SQLITE_OK else {
            let message = errMsg.map { String(cString: $0) } ?? "unknown"
            sqlite3_free(errMsg)
            throw StoreError.sqlite(message)
        }
    }

    func prepare(_ sql: String) throws -> OpaquePointer {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
        return stmt!
    }

    func bindText(_ stmt: OpaquePointer, _ index: Int32, _ value: String) {
        // Explicit byte length: keys and text can contain \u{0}, which a
        // C-string (-1) binding would truncate at the first NUL.
        Array(value.utf8).withUnsafeBufferPointer { buffer in
            _ = sqlite3_bind_text(stmt, index, buffer.baseAddress, Int32(buffer.count), SQLITE_TRANSIENT)
        }
    }

    func bindJSON<T: Encodable>(_ stmt: OpaquePointer, _ index: Int32, _ value: T) throws {
        let data = try encoder.encode(value)
        bindText(stmt, index, String(data: data, encoding: .utf8) ?? "{}")
    }

    func columnText(_ stmt: OpaquePointer, _ index: Int32) -> String {
        guard let cString = sqlite3_column_text(stmt, index) else { return "" }
        let count = Int(sqlite3_column_bytes(stmt, index))
        return String(decoding: UnsafeBufferPointer(start: cString, count: count), as: UTF8.self)
    }

    func columnInt(_ stmt: OpaquePointer, _ index: Int32) -> Int {
        Int(sqlite3_column_int64(stmt, index))
    }

    func columnDouble(_ stmt: OpaquePointer, _ index: Int32) -> Double {
        sqlite3_column_double(stmt, index)
    }

    let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    // ── fragments ────────────────────────────────────────────────────────

    private func insertFragmentRow(
        _ f: FragmentRecord, deviceId: String, payloadHash: String
    ) throws {
        let stmt = try prepare(
            """
            INSERT OR REPLACE INTO fragments
              (id, schema_version, capture_revision, kind, content, normalized_content,
               context_json, processing_json, detail_json, review_json, tags_json,
               source_device_id, source_payload_hash, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """)
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, f.id)
        sqlite3_bind_int(stmt, 2, Int32(f.schemaVersion))
        sqlite3_bind_int64(stmt, 3, Int64(f.captureRevision))
        bindText(stmt, 4, f.kind)
        bindText(stmt, 5, f.content)
        bindText(stmt, 6, f.normalizedContent)
        try bindJSON(stmt, 7, f.context)
        try bindJSON(stmt, 8, f.processing)
        try bindJSON(stmt, 9, f.detail)
        try bindJSON(stmt, 10, f.review)
        try bindJSON(stmt, 11, f.tags)
        bindText(stmt, 12, deviceId)
        bindText(stmt, 13, payloadHash)
        sqlite3_bind_int64(stmt, 14, Int64(f.createdAt))
        sqlite3_bind_int64(stmt, 15, Int64(f.updatedAt))
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
    }

    private func fragmentFromRow(_ stmt: OpaquePointer) throws -> FragmentRecord {
        FragmentRecord(
            schemaVersion: columnInt(stmt, 1),
            id: columnText(stmt, 0),
            captureRevision: columnInt(stmt, 2),
            kind: columnText(stmt, 3),
            content: columnText(stmt, 4),
            normalizedContent: columnText(stmt, 5),
            context: try decoder.decode(FragmentContext.self, from: columnText(stmt, 6).data(using: .utf8)!),
            processing: try decoder.decode(FragmentProcessing.self, from: columnText(stmt, 7).data(using: .utf8)!),
            detail: try decoder.decode(WireValue.self, from: columnText(stmt, 8).data(using: .utf8)!),
            tags: try decoder.decode([String].self, from: columnText(stmt, 10).data(using: .utf8)!),
            review: try decoder.decode(ReviewState.self, from: columnText(stmt, 9).data(using: .utf8)!),
            createdAt: columnInt(stmt, 13),
            updatedAt: columnInt(stmt, 14)
        )
    }

    /// Full-row upsert for hub deliveries (review already resolved by caller;
    /// newer-revision updates keep the stored review, first writes initialize
    /// it). Hub deliveries never feed the change log (echo exclusion) and no
    /// longer enqueue outbox rows — the extension already owns these facts.
    public func upsertFragment(_ record: FragmentRecord, deviceId: String, payloadHash: String) throws {
        try transaction {
            try insertFragmentRow(record, deviceId: deviceId, payloadHash: payloadHash)
            // A new revision may have changed the extension's tags under a local edit.
            try pruneLocalTagEdits(fragmentId: record.id)
        }
    }

    /// The record as stored — the extension's tags, no Desktop-local tag edits. Every
    /// internal read-modify-write starts from this one, so a rating never bakes a local
    /// tag edit into the extension-owned capture fields.
    public func storedFragment(id: String) throws -> FragmentRecord? {
        let stmt = try prepare("SELECT * FROM fragments WHERE id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return try fragmentFromRow(stmt)
    }

    /// The record as the user sees it: capture fields plus Desktop-local tag edits.
    public func getFragment(id: String) throws -> FragmentRecord? {
        guard var record = try storedFragment(id: id) else { return nil }
        let edits = try localTagEdits(for: id)
        if !edits.isEmpty { record.tags = applyLocalTagEdits(record.tags, edits: edits) }
        return record
    }

    public func getFragments() throws -> [FragmentRecord] {
        let stmt = try prepare("SELECT * FROM fragments ORDER BY created_at DESC, id ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [FragmentRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(try fragmentFromRow(stmt))
        }
        let edits = try allLocalTagEdits()
        guard !edits.isEmpty else { return out }
        return out.map { record in
            guard let own = edits[record.id] else { return record }
            var edited = record
            edited.tags = applyLocalTagEdits(record.tags, edits: own)
            return edited
        }
    }

    /// Query through the shared rule set (Query.swift).
    public func listFragments(_ query: FragmentQuery = FragmentQuery()) throws -> FragmentQueryResult {
        runFragmentQuery(try getFragments(), query: query)
    }

    /// Stored capture revision for a delivered fragment, nil when absent.
    public func fragmentRevision(id: String) throws -> Int? {
        let stmt = try prepare("SELECT capture_revision FROM fragments WHERE id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return columnInt(stmt, 0)
    }

    /// Delivery bookkeeping (revision + stored payload hash + device id).
    public func fragmentDelivery(id: String) throws -> FragmentDelivery? {
        let stmt = try prepare(
            "SELECT capture_revision, source_payload_hash, source_device_id FROM fragments WHERE id = ? LIMIT 1"
        )
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return FragmentDelivery(
            revision: columnInt(stmt, 0),
            payloadHash: columnText(stmt, 1),
            deviceId: columnText(stmt, 2)
        )
    }

    /// Fragments that arrived from an extension: rows with a source device, minus the
    /// demo seed. One aggregate query — the Desktop refreshes this after every delivery.
    public func deliveredFragmentCount(excludingDevice excluded: String = "") throws -> Int {
        let stmt = try prepare(
            "SELECT COUNT(*) FROM fragments WHERE source_device_id <> '' AND source_device_id <> ?"
        )
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, excluded)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return columnInt(stmt, 0)
    }

    public func isDeleted(id: String) throws -> Bool {
        let stmt = try prepare("SELECT 1 FROM fragment_deletions WHERE fragment_id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    /// Desktop delete (storage.md §10): fragment + review logs in one
    /// transaction, plus the local deletion marker (later PUTs → 410) and an
    /// informational fragment.deleted change row (the extension keeps its own
    /// copy; deletes never propagate).
    public func deleteFragment(id: String, now: Int? = nil) throws {
        let now = now ?? currentMs()
        try transaction {
            for sql in [
                "DELETE FROM fragments WHERE id = ?",
                "DELETE FROM review_logs WHERE target_fragment_id = ?",
                "DELETE FROM fragment_local_tags WHERE fragment_id = ?",
            ] {
                let stmt = try prepare(sql)
                defer { sqlite3_finalize(stmt) }
                bindText(stmt, 1, id)
                guard sqlite3_step(stmt) == SQLITE_DONE else {
                    throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
                }
            }
            let marker = try prepare(
                """
                INSERT OR REPLACE INTO fragment_deletions (fragment_id, deleted_at) VALUES (?,?)
                """)
            defer { sqlite3_finalize(marker) }
            bindText(marker, 1, id)
            sqlite3_bind_int64(marker, 2, Int64(now))
            guard sqlite3_step(marker) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
            try appendChange(.fragmentDeleted, payload: FragmentDeletedPayload(fragmentId: id), now: now)
        }
    }

    public func getLocalDeletions() throws -> [LocalDeletion] {
        let stmt = try prepare("SELECT fragment_id, deleted_at FROM fragment_deletions ORDER BY deleted_at ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [LocalDeletion] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(LocalDeletion(fragmentId: columnText(stmt, 0), deletedAt: columnInt(stmt, 1)))
        }
        return out
    }

    // ── review (fragment + log in ONE transaction, storage.md §3.1) ──────

    @discardableResult
    public func rateFragment(id: String, rating: ReviewRating, usedHint: Bool, now: Int? = nil) throws -> RatedFragment
    {
        // The fragment read lives INSIDE the BEGIN IMMEDIATE transaction:
        // read-modify-write must be atomic vs extension PUTs on other queues
        // (a concurrent write between read and write would be lost).
        var ratedBox: RatedFragment?
        try transaction {
            guard let fragment = try storedFragment(id: id) else {
                throw StoreError.notFound("fragment not found: \(id)")
            }
            let rated = AnnHubCore.rateFragment(fragment, rating: rating, usedHint: usedHint, now: now)
            try insertFragmentRow(
                rated.fragment,
                deviceId: try storedDeviceId(id: id),
                payloadHash: try storedPayloadHash(id: id)
            )
            try insertReviewLog(rated.log)
            try appendChange(
                .reviewRated,
                payload: ReviewRatedPayload(
                    fragmentId: id, review: rated.fragment.review, log: rated.log
                ),
                now: rated.log.reviewedAt
            )
            ratedBox = rated
        }
        return ratedBox!
    }

    /// Extension-relayed review ingestion (/v1/events review.rated): stores
    /// the log but appends NO change row (echo exclusion — the feed only
    /// carries Desktop-originated mutations). Stale guard mirrors
    /// learning-core/sync.ts: the event's ReviewState only applies when the
    /// local fragment has never been reviewed or the event is at least as new
    /// as the local lastReviewedAt; an older rating keeps the local state
    /// (the log still records, idempotent by id). updatedAt never moves
    /// backwards.
    public func applyExternalReview(fragmentId: String, review: ReviewState, log: ReviewLog) throws {
        // Read inside the transaction: the read-modify-write must be atomic against a
        // rating or a delivery on another queue.
        try transaction {
            guard var fragment = try storedFragment(id: fragmentId) else {
                throw StoreError.notFound("fragment not found: \(fragmentId)")
            }
            let isNewer =
                fragment.review.lastReviewedAt == nil
                || log.reviewedAt >= fragment.review.lastReviewedAt!
            if isNewer {
                fragment.review = review
            }
            fragment.updatedAt = max(fragment.updatedAt, log.reviewedAt)
            try insertFragmentRow(
                fragment,
                deviceId: try storedDeviceId(id: fragmentId),
                payloadHash: try storedPayloadHash(id: fragmentId)
            )
            try insertReviewLog(log)
        }
    }

    private func storedDeviceId(id: String) throws -> String {
        try fragmentDelivery(id: id)?.deviceId ?? ""
    }

    private func storedPayloadHash(id: String) throws -> String {
        try fragmentDelivery(id: id)?.payloadHash ?? ""
    }

    func insertReviewLog(_ log: ReviewLog) throws {
        let stmt = try prepare(
            """
            INSERT OR REPLACE INTO review_logs
              (id, target_fragment_id, rating, reviewed_at, previous_interval_days,
               next_interval_days, used_hint, scheduler_version)
            VALUES (?,?,?,?,?,?,?,?)
            """)
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, log.id)
        bindText(stmt, 2, log.target.fragmentId)
        bindText(stmt, 3, log.rating.rawValue)
        sqlite3_bind_int64(stmt, 4, Int64(log.reviewedAt))
        sqlite3_bind_int(stmt, 5, Int32(log.previousIntervalDays))
        sqlite3_bind_int(stmt, 6, Int32(log.nextIntervalDays))
        sqlite3_bind_int(stmt, 7, log.usedHint ? 1 : 0)
        bindText(stmt, 8, log.schedulerVersion)
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
    }

    public func getReviewLogs() throws -> [ReviewLog] {
        let stmt = try prepare("SELECT * FROM review_logs ORDER BY reviewed_at ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [ReviewLog] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(
                ReviewLog(
                    id: columnText(stmt, 0),
                    target: ReviewTarget(fragmentId: columnText(stmt, 1)),
                    rating: ReviewRating(rawValue: columnText(stmt, 2)) ?? .good,
                    reviewedAt: columnInt(stmt, 3),
                    previousIntervalDays: columnInt(stmt, 4),
                    nextIntervalDays: columnInt(stmt, 5),
                    usedHint: columnInt(stmt, 6) != 0,
                    schedulerVersion: columnText(stmt, 7)
                ))
        }
        return out
    }

    public func reviewLogCount(fragmentId: String) throws -> Int {
        let stmt = try prepare("SELECT COUNT(*) FROM review_logs WHERE target_fragment_id = ?")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, fragmentId)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return columnInt(stmt, 0)
    }

    // ── assets (storage.md §3.5/§6) ──────────────────────────────────────

    /// Idempotent per (id, sha256); same id with a different hash conflicts.
    @discardableResult
    public func putAsset(_ asset: ImageAsset, bytes: Data) throws -> AssetPutOutcome {
        if let existing = try getAsset(id: asset.id) {
            if existing.metadata.sha256 == asset.sha256 { return .duplicate }
            throw StoreError.assetConflict(existingSha256: existing.metadata.sha256)
        }
        try transaction {
            let stmt = try prepare(
                """
                INSERT INTO assets (id, mime_type, byte_length, sha256, width, height, created_at, bytes)
                VALUES (?,?,?,?,?,?,?,?)
                """)
            defer { sqlite3_finalize(stmt) }
            bindText(stmt, 1, asset.id)
            bindText(stmt, 2, asset.mimeType)
            sqlite3_bind_int64(stmt, 3, Int64(asset.byteLength))
            bindText(stmt, 4, asset.sha256)
            sqlite3_bind_int(stmt, 5, Int32(asset.width))
            sqlite3_bind_int(stmt, 6, Int32(asset.height))
            sqlite3_bind_int64(stmt, 7, Int64(asset.createdAt))
            bytes.withUnsafeBytes { buffer in
                _ = sqlite3_bind_blob(stmt, 8, buffer.baseAddress, Int32(buffer.count), SQLITE_TRANSIENT)
            }
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
        }
        return .inserted
    }

    public func assetExists(id: String) throws -> Bool {
        let stmt = try prepare("SELECT 1 FROM assets WHERE id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    public func getAsset(id: String) throws -> (metadata: ImageAsset, bytes: Data)? {
        let stmt = try prepare("SELECT * FROM assets WHERE id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        let byteCount = Int(sqlite3_column_bytes(stmt, 7))
        let bytes: Data
        if let blob = sqlite3_column_blob(stmt, 7), byteCount > 0 {
            bytes = Data(bytes: blob, count: byteCount)
        } else {
            bytes = Data()
        }
        return (
            ImageAsset(
                id: columnText(stmt, 0),
                mimeType: columnText(stmt, 1),
                byteLength: columnInt(stmt, 2),
                sha256: columnText(stmt, 3),
                width: columnInt(stmt, 4),
                height: columnInt(stmt, 5),
                createdAt: columnInt(stmt, 6)
            ),
            bytes
        )
    }

    /// Visual fragments whose attachment ids are not all present in the
    /// assets table — the Desktop "附件缺失" derivation (storage.md §3.5).
    public func missingAttachmentCount() throws -> Int {
        var missing = 0
        for fragment in try getFragments() where fragment.kind == "visual" {
            let ids = fragment.attachmentIds
            if ids.isEmpty { continue }
            for assetId in ids {
                if !(try assetExists(id: assetId)) {
                    missing += 1
                    break
                }
            }
        }
        return missing
    }

    // ── outbox (storage.md §3.4) ─────────────────────────────────────────
    // Desktop-local mutations do not enqueue outbox_events rows: the
    // authoritative Desktop→extension feed is change_log (§9) and the system
    // page 待发送事件 counter derives from change_log rows with
    // seq > pulledCursor.

    public func outboxCount() throws -> Int {
        let stmt = try prepare("SELECT COUNT(*) FROM outbox_events")
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return columnInt(stmt, 0)
    }

    // ── change feed (storage.md §9, R3) ─────────────────────────────────
    // One row per DESKTOP-side mutation, appended in the same transaction as
    // the mutation itself. Extension-originated PUT/event ingestion never
    // appends (echo exclusion).

    func appendChange<P: Encodable>(_ type: DesktopChangeType, payload: P, now: Int) throws {
        let data = try encoder.encode(payload)
        let stmt = try prepare(
            """
            INSERT INTO change_log (type, payload_json, created_at) VALUES (?,?,?)
            """)
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, type.rawValue)
        bindText(stmt, 2, String(data: data, encoding: .utf8) ?? "{}")
        sqlite3_bind_int64(stmt, 3, Int64(now))
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
    }

    /// Rows with seq > cursor, ascending, at most `limit`.
    public func changes(after cursor: Int, limit: Int) throws -> [ChangeLogRow] {
        let stmt = try prepare(
            """
            SELECT seq, type, payload_json, created_at FROM change_log
            WHERE seq > ? ORDER BY seq ASC LIMIT ?
            """)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int64(stmt, 1, Int64(cursor))
        sqlite3_bind_int64(stmt, 2, Int64(max(1, limit)))
        var out: [ChangeLogRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(
                ChangeLogRow(
                    seq: columnInt(stmt, 0),
                    type: columnText(stmt, 1),
                    payloadJson: columnText(stmt, 2),
                    createdAt: columnInt(stmt, 3)
                ))
        }
        return out
    }

    public func changeLogCount() throws -> Int {
        try countRows("change_log")
    }

    public func maxChangeSeq() throws -> Int {
        let stmt = try prepare("SELECT COALESCE(MAX(seq), 0) FROM change_log")
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return columnInt(stmt, 0)
    }

    /// Desktop 变更队列条数: rows not yet pulled by the extension (approximate
    /// per storage.md §9 — total minus the last pulled cursor).
    public func pendingChangeCount() throws -> Int {
        max(0, try changeLogCount() - pulledCursor())
    }

    // ── /v1/events idempotency ───────────────────────────────────────────

    /// true when newly recorded (first (deviceId, eventId) pair); false when
    /// the event was already applied.
    @discardableResult
    public func markApplied(deviceId: String, eventId: String, now: Int? = nil) throws -> Bool {
        let now = now ?? currentMs()
        let stmt = try prepare(
            """
            INSERT OR IGNORE INTO applied_events (event_id, device_id, applied_at) VALUES (?,?,?)
            """)
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, eventId)
        bindText(stmt, 2, deviceId)
        sqlite3_bind_int64(stmt, 3, Int64(now))
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
        return Int(sqlite3_changes(db)) > 0
    }

    public func isApplied(deviceId: String, eventId: String) throws -> Bool {
        let stmt = try prepare(
            """
            SELECT 1 FROM applied_events WHERE event_id = ? AND device_id = ? LIMIT 1
            """)
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, eventId)
        bindText(stmt, 2, deviceId)
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    // ── sync cursor bookkeeping (system page) ────────────────────────────

    private static let pulledCursorKey = "pulled_cursor"
    private static let lastPulledAtKey = "last_pulled_at"

    public func pulledCursor() -> Int {
        syncStateValue(Self.pulledCursorKey) ?? 0
    }

    public func lastPulledAt() -> Int? {
        syncStateValue(Self.lastPulledAtKey)
    }

    /// Advance-only cursor update, recorded when the extension pulls a page.
    public func setPulledCursor(_ seq: Int, at now: Int? = nil) {
        let now = now ?? currentMs()
        let next = max(pulledCursor(), seq)
        setSyncState(Self.pulledCursorKey, next)
        if let existing = lastPulledAt(), existing > now { return }
        setSyncState(Self.lastPulledAtKey, now)
    }

    private func syncStateValue(_ key: String) -> Int? {
        guard let stmt = try? prepare("SELECT value FROM sync_state WHERE key = ?"),
            sqlite3_bind_text(stmt, 1, key, -1, SQLITE_TRANSIENT) == SQLITE_OK
        else { return nil }
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return columnInt(stmt, 0)
    }

    private func setSyncState(_ key: String, _ value: Int) {
        guard
            let stmt = try? prepare(
                """
                INSERT OR REPLACE INTO sync_state (key, value) VALUES (?,?)
                """)
        else { return }
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, key)
        sqlite3_bind_int64(stmt, 2, Int64(value))
        _ = sqlite3_step(stmt)
    }

    // ── transactions & stats ─────────────────────────────────────────────

    /// One transaction at a time per store. The hub's queues and the main thread share
    /// this single connection, so two `BEGIN IMMEDIATE`s from different threads would
    /// otherwise collide (a rating or a delivery would fail). The lock is re-entrant: a
    /// transaction opened inside another one joins it, which lets batch operations compose
    /// the single-fragment ones.
    func transaction(_ body: () throws -> Void) throws {
        transactionLock.lock()
        defer { transactionLock.unlock() }
        if transactionDepth > 0 {
            try body()
            return
        }
        try execute("BEGIN IMMEDIATE")
        transactionDepth = 1
        defer { transactionDepth = 0 }
        do {
            try body()
            try execute("COMMIT")
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    private func countRows(_ table: String) throws -> Int {
        let stmt = try prepare("SELECT COUNT(*) FROM \(table)")
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else { return 0 }
        return columnInt(stmt, 0)
    }

    public func stats() throws -> StoreStats {
        StoreStats(
            fragments: try countRows("fragments"),
            reviewLogs: try countRows("review_logs"),
            assets: try countRows("assets"),
            outbox: try countRows("outbox_events"),
            deletions: try countRows("fragment_deletions"),
            changes: try countRows("change_log")
        )
    }
}
