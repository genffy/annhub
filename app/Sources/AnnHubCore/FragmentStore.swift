// FragmentStore — Desktop-side persistence, SQLite per docs/v2/storage.md §6.
//
// Semantics mirrored from the contract:
//   - fragments: capture fields + review_json; locally created rows carry
//     empty source_device_id / source_payload_hash (only hub writes fill them)
//   - rateFragment persists fragment + log in ONE transaction
//   - Desktop delete removes fragment + review_logs + relations in one tx and
//     writes the fragment_deletions marker (later PUTs of the same id → 410)
//   - assets hold image BLOBs; putAsset is idempotent per (id, sha256)
//   - outbox events enqueue transactionally; only confirmed ids may be pruned
//
// Legacy data: the v3 store (no capture_revision column) has no user data to
// migrate — on open, an old-shape database file is renamed to
// "<name>-v3-backup.sqlite" and a fresh v4 store is created next to it.

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
    public var writingTasks: Int
    public var relations: Int
    public var assets: Int
    public var outbox: Int
    public var deletions: Int
    public var changes: Int

    public init(
        fragments: Int, reviewLogs: Int, writingTasks: Int,
        relations: Int, assets: Int, outbox: Int, deletions: Int,
        changes: Int = 0
    ) {
        self.fragments = fragments
        self.reviewLogs = reviewLogs
        self.writingTasks = writingTasks
        self.relations = relations
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

    public init(path: String, deviceId: String) throws {
        self.deviceId = deviceId
        self.path = path
        try openDatabase()

        // v4 switch: a fragments table without capture_revision is a v3-era
        // file. There is no legacy user data to migrate — move the whole file
        // aside and start fresh (storage.md §11.3).
        if try fragmentsTableNeedsV4Reset() {
            try closeDatabase()
            try moveLegacyFileAside()
            try openDatabase()
        }

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

    private func closeDatabase() throws {
        guard let db else { return }
        guard sqlite3_close_v2(db) == SQLITE_OK else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
        self.db = nil
    }

    private func moveLegacyFileAside() throws {
        guard path != ":memory:", !path.isEmpty else { return }
        let fm = FileManager.default
        let url = URL(fileURLWithPath: path)
        let backup = URL(fileURLWithPath: backupPath(for: path))
        if fm.fileExists(atPath: backup.path) {
            try? fm.removeItem(at: backup)
        }
        if fm.fileExists(atPath: url.path) {
            try fm.moveItem(at: url, to: backup)
        }
        // Best-effort: stale WAL sidecars would resurrect old pages.
        for suffix in ["-wal", "-shm"] {
            let side = URL(fileURLWithPath: path + suffix)
            let sideBackup = URL(fileURLWithPath: backupPath(for: path) + suffix)
            if fm.fileExists(atPath: side.path) {
                try? fm.moveItem(at: side, to: sideBackup)
            }
        }
    }

    private func backupPath(for path: String) -> String {
        let url = URL(fileURLWithPath: path)
        let stem = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension.isEmpty ? "sqlite" : url.pathExtension
        return url.deletingLastPathComponent()
            .appending(path: "\(stem)-v3-backup.\(ext)").path
    }

    private func fragmentsTableNeedsV4Reset() throws -> Bool {
        guard tableExists("fragments") else { return false }
        return !(try tableHasColumn("fragments", "capture_revision"))
    }

    // ── schema (storage.md §6) ────────────────────────────────────────────

    private func createSchema() throws {
        try execute("""
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
        CREATE TABLE IF NOT EXISTS writing_tasks (
          id           TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          updated_at   INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS relations (
          id                TEXT PRIMARY KEY,
          from_fragment_id  TEXT NOT NULL,
          to_fragment_id    TEXT NOT NULL,
          type              TEXT NOT NULL,
          created_by        TEXT NOT NULL,
          confidence        REAL,
          note              TEXT,
          suggestion_reason TEXT,
          status            TEXT NOT NULL,
          confirmed_at      INTEGER,
          confirmed_by      TEXT,
          created_at        INTEGER NOT NULL,
          updated_at        INTEGER NOT NULL,
          UNIQUE (from_fragment_id, to_fragment_id, type)
        );
        CREATE TABLE IF NOT EXISTS relation_suppressions (
          from_fragment_id TEXT NOT NULL,
          to_fragment_id   TEXT NOT NULL,
          suggested_type   TEXT NOT NULL,
          rejected_at      INTEGER NOT NULL,
          reason           TEXT,
          PRIMARY KEY (from_fragment_id, to_fragment_id, suggested_type)
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
        """)
    }

    private func tableExists(_ table: String) -> Bool {
        guard let stmt = try? prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"),
              sqlite3_bind_text(stmt, 1, table, -1, SQLITE_TRANSIENT) == SQLITE_OK
        else { return false }
        defer { sqlite3_finalize(stmt) }
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    private func tableHasColumn(_ table: String, _ column: String) throws -> Bool {
        let stmt = try prepare("PRAGMA table_info(\(table))")
        defer { sqlite3_finalize(stmt) }
        while sqlite3_step(stmt) == SQLITE_ROW {
            if columnText(stmt, 1) == column { return true }
        }
        return false
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
        let stmt = try prepare("""
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

    /// Local creation through the shared factory: validate → write → change
    /// row (fragment.created, full record incl. review) in one transaction.
    /// Desktop-created rows carry the desktop-local device constant and an
    /// empty payload hash (only hub deliveries fill it). No outbox row: the
    /// authoritative Desktop→extension feed is change_log (storage.md §3.4/§9).
    @discardableResult
    public func saveFragment(_ input: CreateFragmentInput) throws -> FragmentRecord {
        let record = try createFragment(input) // throws on invalid
        try transaction {
            try insertFragmentRow(record, deviceId: desktopLocalDeviceId, payloadHash: "")
            try appendChange(.fragmentCreated, payload: FragmentCreatedPayload(fragment: record), now: record.createdAt)
        }
        return record
    }

    /// Full-row upsert for hub deliveries (review already resolved by caller;
    /// newer-revision updates keep the stored review, first writes initialize
    /// it). Hub deliveries never feed the change log (echo exclusion) and no
    /// longer enqueue outbox rows — the extension already owns these facts.
    public func upsertFragment(_ record: FragmentRecord, deviceId: String, payloadHash: String) throws {
        try transaction {
            try insertFragmentRow(record, deviceId: deviceId, payloadHash: payloadHash)
        }
    }

    public func getFragment(id: String) throws -> FragmentRecord? {
        let stmt = try prepare("SELECT * FROM fragments WHERE id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        guard sqlite3_step(stmt) == SQLITE_ROW else { return nil }
        return try fragmentFromRow(stmt)
    }

    public func getFragments() throws -> [FragmentRecord] {
        let stmt = try prepare("SELECT * FROM fragments ORDER BY created_at DESC, id ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [FragmentRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(try fragmentFromRow(stmt))
        }
        return out
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

    public func isDeleted(id: String) throws -> Bool {
        let stmt = try prepare("SELECT 1 FROM fragment_deletions WHERE fragment_id = ? LIMIT 1")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        return sqlite3_step(stmt) == SQLITE_ROW
    }

    /// Desktop delete (storage.md §10): fragment + review logs + relations in
    /// one transaction, plus the local deletion marker (later PUTs → 410) and
    /// an informational fragment.deleted change row (the extension keeps its
    /// own copy; deletes never propagate).
    public func deleteFragment(id: String, now: Int? = nil) throws {
        let now = now ?? currentMs()
        try transaction {
            for sql in [
                "DELETE FROM fragments WHERE id = ?",
                "DELETE FROM review_logs WHERE target_fragment_id = ?",
                "DELETE FROM relations WHERE from_fragment_id = ? OR to_fragment_id = ?",
            ] {
                let stmt = try prepare(sql)
                defer { sqlite3_finalize(stmt) }
                bindText(stmt, 1, id)
                if sql.contains("OR to_fragment_id") { bindText(stmt, 2, id) }
                guard sqlite3_step(stmt) == SQLITE_DONE else {
                    throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
                }
            }
            let marker = try prepare("""
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
    public func rateFragment(id: String, rating: ReviewRating, usedHint: Bool, now: Int? = nil) throws -> RatedFragment {
        // The fragment read lives INSIDE the BEGIN IMMEDIATE transaction:
        // read-modify-write must be atomic vs extension PUTs on other queues
        // (a concurrent write between read and write would be lost).
        var ratedBox: RatedFragment?
        try transaction {
            guard let fragment = try getFragment(id: id) else {
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
        guard var fragment = try getFragment(id: fragmentId) else {
            throw StoreError.notFound("fragment not found: \(fragmentId)")
        }
        let isNewer = fragment.review.lastReviewedAt == nil
            || log.reviewedAt >= fragment.review.lastReviewedAt!
        if isNewer {
            fragment.review = review
        }
        fragment.updatedAt = max(fragment.updatedAt, log.reviewedAt)
        try transaction {
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
        let stmt = try prepare("""
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
            out.append(ReviewLog(
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

    // ── writing tasks (storage.md §3.2) ──────────────────────────────────

    /// Desktop save: appends a change row (writing.created while the task has
    /// no submissions / writing.submitted after the first submission — payload
    /// is the full task JSON) in the same transaction. Extension ingestion
    /// (/v1/events) passes emitChange: false (echo exclusion).
    @discardableResult
    public func saveWritingTask(_ task: WritingTaskRecord, emitChange: Bool = true) throws -> WritingTaskRecord {
        let changeType: DesktopChangeType = task.submissions.isEmpty ? .writingCreated : .writingSubmitted
        try transaction {
            let stmt = try prepare("""
            INSERT OR REPLACE INTO writing_tasks (id, payload_json, updated_at) VALUES (?,?,?)
            """)
            defer { sqlite3_finalize(stmt) }
            bindText(stmt, 1, task.id)
            try bindJSON(stmt, 2, task)
            sqlite3_bind_int64(stmt, 3, Int64(task.updatedAt))
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
            if emitChange {
                try appendChange(changeType, payload: WritingChangedPayload(task: task), now: task.updatedAt)
            }
        }
        return task
    }

    /// List ordered by createdAt desc (desktop.md §6 history).
    public func getWritingTasks() throws -> [WritingTaskRecord] {
        let stmt = try prepare("SELECT payload_json FROM writing_tasks")
        defer { sqlite3_finalize(stmt) }
        var out: [WritingTaskRecord] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            if let data = columnText(stmt, 0).data(using: .utf8),
               let task = try? decoder.decode(WritingTaskRecord.self, from: data)
            {
                out.append(task)
            }
        }
        return out.sorted { a, b in
            if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
            return a.id < b.id
        }
    }

    public func getWritingTask(id: String) throws -> WritingTaskRecord? {
        try getWritingTasks().first { $0.id == id }
    }

    // ── relations (storage.md §3.3) ──────────────────────────────────────

    /// Desktop save: CONFIRMED relations append a change row
    /// (relation.created when the confirmed shape is new to the feed /
    /// relation.updated when an already-confirmed row changed) and clear any
    /// endpoint suppression — re-establishing a rejected pair removes the
    /// rejection. Suggested rows never travel. Extension ingestion passes
    /// emitChange: false.
    public func saveRelation(_ relation: FragmentRelation, emitChange: Bool = true) throws {
        let stored = try relationById(id: relation.id)
        try transaction {
            let stmt = try prepare("""
            INSERT OR REPLACE INTO relations
              (id, from_fragment_id, to_fragment_id, type, created_by, confidence,
               note, suggestion_reason, status, confirmed_at, confirmed_by,
               created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """)
            defer { sqlite3_finalize(stmt) }
            bindText(stmt, 1, relation.id)
            bindText(stmt, 2, relation.fromFragmentId)
            bindText(stmt, 3, relation.toFragmentId)
            bindText(stmt, 4, relation.type)
            bindText(stmt, 5, relation.createdBy)
            if let confidence = relation.confidence {
                sqlite3_bind_double(stmt, 6, confidence)
            } else {
                sqlite3_bind_null(stmt, 6)
            }
            if let note = relation.note {
                bindText(stmt, 7, note)
            } else {
                sqlite3_bind_null(stmt, 7)
            }
            if let reason = relation.suggestionReason {
                bindText(stmt, 8, reason)
            } else {
                sqlite3_bind_null(stmt, 8)
            }
            bindText(stmt, 9, relation.status)
            if let confirmedAt = relation.confirmedAt {
                sqlite3_bind_int64(stmt, 10, Int64(confirmedAt))
            } else {
                sqlite3_bind_null(stmt, 10)
            }
            if let confirmedBy = relation.confirmedBy {
                bindText(stmt, 11, confirmedBy)
            } else {
                sqlite3_bind_null(stmt, 11)
            }
            sqlite3_bind_int64(stmt, 12, Int64(relation.createdAt))
            sqlite3_bind_int64(stmt, 13, Int64(relation.updatedAt))
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
            if relation.status == "confirmed" {
                clearSuppressionsForEndpoints(relation.fromFragmentId, relation.toFragmentId)
                if emitChange {
                    // A previously suggested row becoming confirmed is NEW to
                    // the feed (suggested never traveled).
                    let alreadyFed = stored?.status == "confirmed"
                    try appendChange(
                        alreadyFed ? .relationUpdated : .relationCreated,
                        payload: RelationChangedPayload(relation: relation),
                        now: relation.updatedAt
                    )
                }
            }
        }
    }

    /// Desktop delete: removes the row and appends relation.deleted
    /// (single-relation deletes sync; endpoints are untouched, storage.md §9).
    public func deleteRelation(id: String, emitChange: Bool = true, now: Int? = nil) throws {
        let now = now ?? currentMs()
        try transaction {
            let stmt = try prepare("DELETE FROM relations WHERE id = ?")
            defer { sqlite3_finalize(stmt) }
            bindText(stmt, 1, id)
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
            if emitChange {
                try appendChange(
                    .relationDeleted,
                    payload: RelationDeletedPayload(relationId: id),
                    now: now
                )
            }
        }
    }

    private func relationById(id: String) throws -> FragmentRelation? {
        try getRelations().first { $0.id == id }
    }

    /// Relations touching one endpoint (either direction), oldest first.
    public func relationsForFragment(id: String) throws -> [FragmentRelation] {
        try getRelations().filter { $0.fromFragmentId == id || $0.toFragmentId == id }
    }

    public func getRelations() throws -> [FragmentRelation] {
        let stmt = try prepare("SELECT * FROM relations ORDER BY created_at ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [FragmentRelation] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(FragmentRelation(
                id: columnText(stmt, 0),
                fromFragmentId: columnText(stmt, 1),
                toFragmentId: columnText(stmt, 2),
                type: columnText(stmt, 3),
                createdBy: columnText(stmt, 4),
                confidence: sqlite3_column_type(stmt, 5) == SQLITE_NULL ? nil : columnDouble(stmt, 5),
                suggestionReason: sqlite3_column_type(stmt, 7) == SQLITE_NULL ? nil : columnText(stmt, 7),
                note: sqlite3_column_type(stmt, 6) == SQLITE_NULL ? nil : columnText(stmt, 6),
                status: columnText(stmt, 8),
                confirmedAt: sqlite3_column_type(stmt, 9) == SQLITE_NULL ? nil : columnInt(stmt, 9),
                confirmedBy: sqlite3_column_type(stmt, 10) == SQLITE_NULL ? nil : columnText(stmt, 10),
                createdAt: columnInt(stmt, 11),
                updatedAt: columnInt(stmt, 12)
            ))
        }
        return out
    }

    /// Desktop suppression write: stores the decision key and appends
    /// suppression.sync so the rejection holds on the extension too (R3).
    public func saveSuppression(_ suppression: RelationSuppression, emitChange: Bool = true) throws {
        try transaction {
            let stmt = try prepare("""
            INSERT OR REPLACE INTO relation_suppressions
              (from_fragment_id, to_fragment_id, suggested_type, rejected_at, reason)
            VALUES (?,?,?,?,?)
            """)
            defer { sqlite3_finalize(stmt) }
            bindText(stmt, 1, suppression.fromFragmentId)
            bindText(stmt, 2, suppression.toFragmentId)
            bindText(stmt, 3, suppression.suggestedType)
            sqlite3_bind_int64(stmt, 4, Int64(suppression.rejectedAt))
            if let reason = suppression.reason {
                bindText(stmt, 5, reason)
            } else {
                sqlite3_bind_null(stmt, 5)
            }
            guard sqlite3_step(stmt) == SQLITE_DONE else {
                throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
            }
            if emitChange {
                try appendChange(
                    .suppressionSync,
                    payload: SuppressionSyncPayload(suppression: suppression),
                    now: suppression.rejectedAt
                )
            }
        }
    }

    public func getSuppressions() throws -> [RelationSuppression] {
        let stmt = try prepare("SELECT * FROM relation_suppressions ORDER BY rejected_at ASC")
        defer { sqlite3_finalize(stmt) }
        var out: [RelationSuppression] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(RelationSuppression(
                fromFragmentId: columnText(stmt, 0),
                toFragmentId: columnText(stmt, 1),
                suggestedType: columnText(stmt, 2),
                rejectedAt: columnInt(stmt, 3),
                reason: sqlite3_column_type(stmt, 4) == SQLITE_NULL ? nil : columnText(stmt, 4)
            ))
        }
        return out
    }

    /// Re-establish clears suppression: a confirmed relation for a previously
    /// rejected endpoint pair removes the rejection keys (both orientations).
    func clearSuppressionsForEndpoints(_ from: String, _ to: String) {
        let sql = """
        DELETE FROM relation_suppressions
        WHERE (from_fragment_id = ? AND to_fragment_id = ?)
           OR (from_fragment_id = ? AND to_fragment_id = ?)
        """
        guard let stmt = try? prepare(sql) else { return }
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, from)
        bindText(stmt, 2, to)
        bindText(stmt, 3, to)
        bindText(stmt, 4, from)
        _ = sqlite3_step(stmt)
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
            let stmt = try prepare("""
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

    // ── outbox (storage.md §3.4, retired for Desktop-local mutations) ────
    // Desktop-local mutations STOP enqueueing outbox_events rows: the
    // authoritative Desktop→extension feed is change_log (§9) and the system
    // page 待发送事件 counter derives from change_log rows with
    // seq > pulledCursor. The table stays for schema continuity with older
    // databases; new rows are never written.

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
        let stmt = try prepare("""
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
        let stmt = try prepare("""
        SELECT seq, type, payload_json, created_at FROM change_log
        WHERE seq > ? ORDER BY seq ASC LIMIT ?
        """)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int64(stmt, 1, Int64(cursor))
        sqlite3_bind_int64(stmt, 2, Int64(max(1, limit)))
        var out: [ChangeLogRow] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(ChangeLogRow(
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
        let stmt = try prepare("""
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
        let stmt = try prepare("""
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
        guard let stmt = try? prepare("""
        INSERT OR REPLACE INTO sync_state (key, value) VALUES (?,?)
        """) else { return }
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, key)
        sqlite3_bind_int64(stmt, 2, Int64(value))
        _ = sqlite3_step(stmt)
    }

    // ── transactions & stats ─────────────────────────────────────────────

    func transaction(_ body: () throws -> Void) throws {
        try execute("BEGIN IMMEDIATE")
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
            writingTasks: try countRows("writing_tasks"),
            relations: try countRows("relations"),
            assets: try countRows("assets"),
            outbox: try countRows("outbox_events"),
            deletions: try countRows("fragment_deletions"),
            changes: try countRows("change_log")
        )
    }
}
