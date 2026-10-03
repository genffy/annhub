// Relation suggestion rules + pure accept/modify/reject operations — mirrors
// learning-core/sync.ts `suggestRelations` / `keyOfSuppression` (R2.2,
// docs/v2/desktop.md §7, storage.md §3.3). Suggestions are never confirmed
// implicitly: accepting is an explicit user action that keeps the suggestion
// provenance; rejecting writes a local suppression key.

import Foundation

// ── suggestions ──────────────────────────────────────────────────────────

/// Suggested-relationship rule engine output (R2.2): never confirmed, always
/// with a reason.
public struct RelationSuggestion: Equatable, Identifiable, Sendable {
    public var fromFragmentId: String
    public var toFragmentId: String
    public var suggestedType: String
    public var confidence: Double
    public var reason: String

    public var id: String { "\(fromFragmentId) \(toFragmentId) \(suggestedType)" }

    public init(
        fromFragmentId: String, toFragmentId: String, suggestedType: String,
        confidence: Double, reason: String
    ) {
        self.fromFragmentId = fromFragmentId
        self.toFragmentId = toFragmentId
        self.suggestedType = suggestedType
        self.confidence = confidence
        self.reason = reason
    }
}

public struct SuggestRelationsOptions {
    public var suppressions: [RelationSuppression]
    public var existing: [FragmentRelation]
    public var limit: Int

    public init(
        suppressions: [RelationSuppression] = [],
        existing: [FragmentRelation] = [],
        limit: Int = 20
    ) {
        self.suppressions = suppressions
        self.existing = existing
        self.limit = limit
    }
}

/// Shared-tag/kind/host overlap rules — cheap, local, deterministic.
public func suggestRelations(
    _ fragments: [FragmentRecord],
    options: SuggestRelationsOptions = SuggestRelationsOptions()
) -> [RelationSuggestion] {
    let suppressed = Set(options.suppressions.map(keyOfSuppression))
    let existingKeys = Set(options.existing.map { "\($0.fromFragmentId) \($0.toFragmentId) \($0.type)" })
    var suggestions: [RelationSuggestion] = []
    for i in 0..<fragments.count {
        for j in (i + 1)..<fragments.count {
            let a = fragments[i]
            let b = fragments[j]
            let sharedTags = a.tags.filter { b.tags.contains($0) }
            let sameKind = a.kind == b.kind
            let sameHost = a.context.sourceHost == b.context.sourceHost
            if sharedTags.isEmpty && !sameHost { continue }
            let type: String = sharedTags.count >= 2 || (sameKind && sharedTags.count == 1)
                ? RelationType.similarity.rawValue
                : RelationType.reference.rawValue
            let (from, to) = canonicalRelationEndpoints(from: a.id, to: b.id, type: type)
            let key = "\(from) \(to) \(type)"
            if existingKeys.contains(key) || suppressed.contains(key) { continue }
            let confidence = min(
                0.9,
                0.3 + Double(sharedTags.count) * 0.2 + (sameHost ? 0.1 : 0) + (sameKind ? 0.1 : 0)
            )
            let reason = sameHost
                ? "同来源 \(a.context.sourceHost)\(sharedTags.isEmpty ? "" : "，共享标签 \(sharedTags.joined(separator: "、"))")"
                : "共享标签 \(sharedTags.joined(separator: "、"))"
            suggestions.append(RelationSuggestion(
                fromFragmentId: from, toFragmentId: to, suggestedType: type,
                confidence: confidence, reason: reason
            ))
        }
    }
    // TS Array.prototype.sort is stable — mirror it with the generation order
    // as the tiebreaker before slicing to the limit.
    let ordered = suggestions.enumerated()
        .sorted { lhs, rhs in
            if lhs.element.confidence != rhs.element.confidence {
                return lhs.element.confidence > rhs.element.confidence
            }
            return lhs.offset < rhs.offset
        }
        .map(\.element)
    return Array(ordered.prefix(options.limit))
}

/// Suppression decision key — canonical endpoints + suggested type. Synced in
/// R3 (suppression.sync) so a rejection holds on both ends.
public func keyOfSuppression(
    _ s: RelationSuppression
) -> String {
    let (from, to) = canonicalRelationEndpoints(
        from: s.fromFragmentId, to: s.toFragmentId, type: s.suggestedType
    )
    return "\(from) \(to) \(s.suggestedType)"
}

// ── pure operations (store writes happen in the caller's transaction) ─────

/// Accept (optionually modifying type/note): confirmed with confirmedAt /
/// confirmedBy=user, keeping the suggestion's confidence + reason
/// (storage.md §3.3 — the confirm action is separately attributable).
public func confirmSuggestion(
    _ s: RelationSuggestion,
    type: String? = nil,
    note: String? = nil,
    now: Int? = nil
) -> FragmentRelation {
    let now = now ?? currentMs()
    let resolvedType = type ?? s.suggestedType
    let (from, to) = canonicalRelationEndpoints(
        from: s.fromFragmentId, to: s.toFragmentId, type: resolvedType
    )
    return FragmentRelation(
        id: newId(),
        fromFragmentId: from,
        toFragmentId: to,
        type: resolvedType,
        createdBy: "auto",
        confidence: s.confidence,
        suggestionReason: s.reason,
        note: note,
        status: "confirmed",
        confirmedAt: now,
        confirmedBy: "user",
        createdAt: now,
        updatedAt: now
    )
}

/// Reject: the decision key lands in relation_suppressions; the same
/// suggestion never resurfaces (R2.2 acceptance).
public func rejectSuggestion(
    _ s: RelationSuggestion,
    reason: String? = nil,
    now: Int? = nil
) -> RelationSuppression {
    let now = now ?? currentMs()
    let (from, to) = canonicalRelationEndpoints(
        from: s.fromFragmentId, to: s.toFragmentId, type: s.suggestedType
    )
    return RelationSuppression(
        fromFragmentId: from, toFragmentId: to, suggestedType: s.suggestedType,
        rejectedAt: now, reason: reason
    )
}

/// Manual creation from a fragment detail (desktop.md §7.2): always
/// confirmed; saving clears any suppression for the endpoint pair
/// (re-establish, see FragmentStore.saveRelation).
public func createManualRelation(
    from: String, to: String, type: String, note: String? = nil, now: Int? = nil
) -> FragmentRelation {
    let now = now ?? currentMs()
    let (a, b) = canonicalRelationEndpoints(from: from, to: to, type: type)
    return FragmentRelation(
        id: newId(),
        fromFragmentId: a,
        toFragmentId: b,
        type: type,
        createdBy: "user",
        note: note,
        status: "confirmed",
        confirmedAt: now,
        confirmedBy: "user",
        createdAt: now,
        updatedAt: now
    )
}
