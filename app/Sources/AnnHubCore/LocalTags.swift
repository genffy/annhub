// Desktop-local tag edits (desktop.md §4.4 批量操作).
//
// `tags` are capture fields: the extension owns them and replaces them whenever it
// delivers a newer revision (storage.md §8), and only the extension may bump
// `captureRevision`. A tag the user adds or removes on the Desktop therefore cannot
// live in the delivered row — the next delivery would silently wipe it. It lives in
// its own table instead and is merged in when records are read:
//
//     effective tags = (delivered tags − removed) + added
//
// Edits never leave the Desktop (like a local delete), never change the delivery
// hash, and are dropped with the fragment. After a delivery they are re-checked
// against the new tags, so an edit that the extension has since made moot goes away.

import Foundation
import SQLite3

public enum LocalTagOp: String, Sendable {
    case add
    case remove
}

public struct LocalTagEdit: Equatable, Sendable {
    public var tag: String
    public var op: LocalTagOp
    public var updatedAt: Int

    public init(tag: String, op: LocalTagOp, updatedAt: Int) {
        self.tag = tag
        self.op = op
        self.updatedAt = updatedAt
    }
}

public let MAX_TAGS_PER_FRAGMENT = 20
public let MAX_TAG_UTF16_LENGTH = 32

/// What the user typed → the tag as stored: trimmed, a leading `#` dropped, lowercased
/// (like `dedupeTags`), 1 to 32 UTF-16 units. nil when nothing usable is left.
public func normalizeLocalTag(_ raw: String) -> String? {
    var tag = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    while tag.hasPrefix("#") { tag.removeFirst() }
    tag = tag.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !tag.isEmpty, tag.utf16.count <= MAX_TAG_UTF16_LENGTH else { return nil }
    return tag
}

/// Splits user input such as "retry, #reliability  streams" into distinct normalized tags.
public func parseTagInput(_ text: String) -> [String] {
    var seen = Set<String>()
    return
        text
        .split(whereSeparator: { ",，、;；".contains($0) || $0.isWhitespace })
        .compactMap { normalizeLocalTag(String($0)) }
        .filter { seen.insert($0).inserted }
}

/// Delivered tags with the local edits applied. Removed tags drop out; added tags follow
/// in the order they were added; a tag never appears twice.
public func applyLocalTagEdits(_ base: [String], edits: [LocalTagEdit]) -> [String] {
    let removed = Set(edits.filter { $0.op == .remove }.map(\.tag))
    var result = base.filter { !removed.contains($0) }
    var present = Set(result)
    // Oldest first; edits made in the same millisecond keep the order they arrived in.
    let additions = edits.filter { $0.op == .add }.enumerated()
        .sorted { ($0.element.updatedAt, $0.offset) < ($1.element.updatedAt, $1.offset) }
        .map(\.element)
    for edit in additions where present.insert(edit.tag).inserted {
        result.append(edit.tag)
    }
    return result
}

/// Outcome of one batch tag operation.
public struct BatchTagResult: Equatable, Sendable {
    /// Fragments whose tags changed.
    public var updated = 0
    /// Fragments that already had the requested result.
    public var unchanged = 0
    /// Fragments that could not take the change: gone, or already at 20 tags.
    public var skipped: [String] = []

    public init(updated: Int = 0, unchanged: Int = 0, skipped: [String] = []) {
        self.updated = updated
        self.unchanged = unchanged
        self.skipped = skipped
    }
}

extension FragmentStore {
    // ── reads ────────────────────────────────────────────────────────────

    func localTagEdits(for id: String) throws -> [LocalTagEdit] {
        let stmt = try prepare(
            "SELECT tag, op, updated_at FROM fragment_local_tags WHERE fragment_id = ? ORDER BY updated_at, rowid")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, id)
        var out: [LocalTagEdit] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            out.append(edit(from: stmt))
        }
        return out
    }

    func allLocalTagEdits() throws -> [String: [LocalTagEdit]] {
        let stmt = try prepare(
            "SELECT tag, op, updated_at, fragment_id FROM fragment_local_tags ORDER BY updated_at, rowid")
        defer { sqlite3_finalize(stmt) }
        var out: [String: [LocalTagEdit]] = [:]
        while sqlite3_step(stmt) == SQLITE_ROW {
            out[columnText(stmt, 3), default: []].append(edit(from: stmt))
        }
        return out
    }

    private func edit(from stmt: OpaquePointer) -> LocalTagEdit {
        LocalTagEdit(
            tag: columnText(stmt, 0),
            op: LocalTagOp(rawValue: columnText(stmt, 1)) ?? .add,
            updatedAt: columnInt(stmt, 2)
        )
    }

    /// Fragments with at least one local edit (diagnostics and tests).
    public func locallyTaggedFragmentIds() throws -> [String] {
        try exclusive {
            let stmt = try prepare("SELECT DISTINCT fragment_id FROM fragment_local_tags ORDER BY fragment_id")
            defer { sqlite3_finalize(stmt) }
            var out: [String] = []
            while sqlite3_step(stmt) == SQLITE_ROW { out.append(columnText(stmt, 0)) }
            return out
        }
    }

    // ── writes ───────────────────────────────────────────────────────────

    /// Adds `tags` to every listed fragment (batch 添加标签). A fragment that already has
    /// 20 tags is skipped rather than silently losing one; an unknown id is skipped too.
    @discardableResult
    public func addLocalTags(_ tags: [String], to ids: [String], now: Int? = nil) throws -> BatchTagResult {
        let wanted = try requireTags(tags)
        let now = now ?? currentMs()
        var result = BatchTagResult()
        try transaction {
            for id in Self.distinct(ids) {
                guard let stored = try storedFragment(id: id) else {
                    result.skipped.append(id)
                    continue
                }
                let edits = try localTagEdits(for: id)
                let effective = applyLocalTagEdits(stored.tags, edits: edits)
                let missing = wanted.filter { !effective.contains($0) }
                if missing.isEmpty {
                    result.unchanged += 1
                    continue
                }
                if effective.count + missing.count > MAX_TAGS_PER_FRAGMENT {
                    result.skipped.append(id)
                    continue
                }
                for tag in missing {
                    if stored.tags.contains(tag) {
                        // It was delivered and the user removed it: adding it back undoes that.
                        try deleteLocalTagEdit(fragmentId: id, tag: tag)
                    } else {
                        try upsertLocalTagEdit(fragmentId: id, tag: tag, op: .add, now: now)
                    }
                }
                result.updated += 1
            }
        }
        return result
    }

    /// Removes `tags` from every listed fragment (batch 移除标签).
    @discardableResult
    public func removeLocalTags(_ tags: [String], from ids: [String], now: Int? = nil) throws -> BatchTagResult {
        let wanted = try requireTags(tags)
        let now = now ?? currentMs()
        var result = BatchTagResult()
        try transaction {
            for id in Self.distinct(ids) {
                guard let stored = try storedFragment(id: id) else {
                    result.skipped.append(id)
                    continue
                }
                let effective = applyLocalTagEdits(stored.tags, edits: try localTagEdits(for: id))
                let present = wanted.filter { effective.contains($0) }
                if present.isEmpty {
                    result.unchanged += 1
                    continue
                }
                for tag in present {
                    if stored.tags.contains(tag) {
                        try upsertLocalTagEdit(fragmentId: id, tag: tag, op: .remove, now: now)
                    } else {
                        // A tag only this Desktop added: forget it.
                        try deleteLocalTagEdit(fragmentId: id, tag: tag)
                    }
                }
                result.updated += 1
            }
        }
        return result
    }

    /// Deletes several fragments in ONE transaction (batch 删除): all of them or none.
    /// Each gets its own deletion marker, so old extension requests stay refused (410).
    @discardableResult
    public func deleteFragments(ids: [String], now: Int? = nil) throws -> Int {
        let now = now ?? currentMs()
        var deleted = 0
        try transaction {
            for id in Self.distinct(ids) where try storedFragment(id: id) != nil {
                try deleteFragment(id: id, now: now)
                deleted += 1
            }
        }
        return deleted
    }

    /// After a delivery: an edit the new delivered tags made moot is dropped — a removal of a
    /// tag the extension no longer sends, an addition the extension now sends itself.
    func pruneLocalTagEdits(fragmentId: String) throws {
        guard let stored = try storedFragment(id: fragmentId) else { return }
        for edit in try localTagEdits(for: fragmentId) {
            let delivered = stored.tags.contains(edit.tag)
            if (edit.op == .remove && !delivered) || (edit.op == .add && delivered) {
                try deleteLocalTagEdit(fragmentId: fragmentId, tag: edit.tag)
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private func requireTags(_ tags: [String]) throws -> [String] {
        var seen = Set<String>()
        let normalized = tags.compactMap(normalizeLocalTag).filter { seen.insert($0).inserted }
        guard !normalized.isEmpty else { throw StoreError.validation(code: FragmentErrorCode.tagInvalid.rawValue) }
        return normalized
    }

    private static func distinct(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { seen.insert($0).inserted }
    }

    private func upsertLocalTagEdit(fragmentId: String, tag: String, op: LocalTagOp, now: Int) throws {
        let stmt = try prepare(
            "INSERT OR REPLACE INTO fragment_local_tags (fragment_id, tag, op, updated_at) VALUES (?,?,?,?)")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, fragmentId)
        bindText(stmt, 2, tag)
        bindText(stmt, 3, op.rawValue)
        sqlite3_bind_int64(stmt, 4, Int64(now))
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
    }

    private func deleteLocalTagEdit(fragmentId: String, tag: String) throws {
        let stmt = try prepare("DELETE FROM fragment_local_tags WHERE fragment_id = ? AND tag = ?")
        defer { sqlite3_finalize(stmt) }
        bindText(stmt, 1, fragmentId)
        bindText(stmt, 2, tag)
        guard sqlite3_step(stmt) == SQLITE_DONE else {
            throw StoreError.sqlite(String(cString: sqlite3_errmsg(db)))
        }
    }
}
