// Relation suggestion rules + accept/modify/reject operations — mirrors
// learning-core/__tests__/sync.test.ts suggestion cases (R2.2, desktop.md §7,
// storage.md §3.3).

import XCTest
@testable import AnnHubCore

final class RelationsTests: XCTestCase {
    private func fragment(
        _ id: String, tags: [String], host: String = "wsj.com", kind: String = "concept"
    ) -> FragmentRecord {
        makeFragment(id: id, kind: kind, sourceHost: host, tags: tags)
    }

    // ── suggestion rules ────────────────────────────────────────────────

    func testSharedTagsProduceSimilarityWithConfidenceAndReason() {
        let a = fragment("a", tags: ["fed", "macro"])
        let b = fragment("b", tags: ["macro", "fed"]) // order differs; shared set is what matters
        let suggestions = suggestRelations([a, b])
        XCTAssertEqual(suggestions.count, 1)
        let s = suggestions[0]
        XCTAssertEqual(s.suggestedType, "similarity", "2 shared tags → similarity")
        // min(0.9, 0.3 + 2*0.2 + 0.1 host + 0.1 kind) = 0.9
        XCTAssertEqual(s.confidence, 0.9, accuracy: 1e-9)
        XCTAssertEqual(s.fromFragmentId, "a")
        XCTAssertEqual(s.toFragmentId, "b")
        XCTAssertTrue(s.reason.contains("同来源 wsj.com"))
        XCTAssertTrue(s.reason.contains("共享标签"))
        XCTAssertTrue(s.reason.contains("fed") && s.reason.contains("macro"))
    }

    func testCanonicalEndpointsForSymmetricTypes() {
        let z = fragment("zz", tags: ["fed"], kind: "claim")
        let a = fragment("aa", tags: ["fed"], kind: "claim")
        let suggestions = suggestRelations([z, a])
        XCTAssertEqual(suggestions.count, 1)
        // similarity is symmetric → endpoints stored sorted.
        XCTAssertEqual(suggestions[0].fromFragmentId, "aa")
        XCTAssertEqual(suggestions[0].toFragmentId, "zz")
        XCTAssertEqual(
            keyOfSuppression(RelationSuppression(
                fromFragmentId: "zz", toFragmentId: "aa", suggestedType: "similarity", rejectedAt: NOW
            )),
            "aa zz similarity"
        )
    }

    func testHostOnlyPairSurfacesAsLowConfidenceReference() {
        let a = fragment("a", tags: ["fed"], kind: "concept")
        let c = fragment("c", tags: ["tech"], kind: "inspiration")
        let suggestions = suggestRelations([a, c])
        let ac = suggestions.first {
            ($0.fromFragmentId == "a" && $0.toFragmentId == "c")
                || ($0.fromFragmentId == "c" && $0.toFragmentId == "a")
        }
        XCTAssertEqual(ac?.suggestedType, "reference")
        XCTAssertEqual(ac?.confidence ?? 0, 0.4, accuracy: 1e-9, "host only: 0.3 + 0.1")
        XCTAssertTrue(ac?.reason.contains("同来源") ?? false)

        // Different hosts sharing one tag, different kinds → reference with
        // the tag reason and no host mention.
        let x = fragment("x", tags: ["solo"], host: "wsj.com", kind: "concept")
        let y = fragment("y", tags: ["solo"], host: "ft.com", kind: "decision")
        let cross = suggestRelations([x, y])
        XCTAssertEqual(cross.count, 1)
        XCTAssertEqual(cross[0].suggestedType, "reference")
        XCTAssertEqual(cross[0].confidence, 0.5, accuracy: 1e-9, "tag only: 0.3 + 0.2")
        XCTAssertEqual(cross[0].reason, "共享标签 solo")

        // No shared tags and no shared host → nothing.
        XCTAssertTrue(suggestRelations([
            fragment("p", tags: ["a"], host: "wsj.com"),
            fragment("q", tags: ["b"], host: "ft.com"),
        ]).isEmpty)
    }

    func testSuppressionAndExistingRelationsRespected() {
        let a = fragment("a", tags: ["fed", "macro"])
        let b = fragment("b", tags: ["fed", "macro"])
        let c = fragment("c", tags: ["tech"])
        let suppression = RelationSuppression(
            fromFragmentId: "a", toFragmentId: "b", suggestedType: "reference", rejectedAt: NOW
        )
        let suggestions = suggestRelations(
            [a, b, c],
            options: SuggestRelationsOptions(suppressions: [suppression])
        )
        // reference a/b is suppressed; the higher-confidence similarity may
        // still surface (per the TS test).
        XCTAssertFalse(suggestions.contains {
            $0.fromFragmentId == "a" && $0.toFragmentId == "b" && $0.suggestedType == "reference"
        })
        if let ab = suggestions.first(where: { $0.fromFragmentId == "a" && $0.toFragmentId == "b" }) {
            XCTAssertEqual(ab.suggestedType, "similarity")
        }
        XCTAssertTrue(suggestions.allSatisfy { $0.confidence > 0 && $0.confidence <= 0.9 })
        XCTAssertTrue(suggestions.allSatisfy { !$0.reason.isEmpty })

        // Existing relations (any status) block re-suggesting the same key.
        let withExisting = suggestRelations(
            [a, b],
            options: SuggestRelationsOptions(existing: [
                FragmentRelation(
                    id: "rel_e", fromFragmentId: "a", toFragmentId: "b",
                    type: "similarity", createdBy: "user", status: "confirmed",
                    confirmedAt: NOW, confirmedBy: "user", createdAt: NOW, updatedAt: NOW
                )
            ])
        )
        XCTAssertTrue(withExisting.isEmpty, "existing similarity key is skipped")
    }

    func testSuggestionLimitSortedByConfidence() {
        let fragments = (0..<12).map { fragment("f\($0)", tags: ["t\($0)"], host: "h\($0)") }
            + [fragment("shared1", tags: ["common"]), fragment("shared2", tags: ["common"], host: "solo.com", kind: "decision")]
        // Only the common-tag pair qualifies; limit caps output.
        let suggestions = suggestRelations(fragments, options: .init(limit: 1))
        XCTAssertEqual(suggestions.count, 1)
        XCTAssertEqual(suggestions[0].suggestedType, "reference")
    }

    // ── accept / modify / reject ─────────────────────────────────────────

    func testAcceptKeepsReasonAndSetsConfirmMeta() {
        let s = RelationSuggestion(
            fromFragmentId: "a", toFragmentId: "b", suggestedType: "similarity",
            confidence: 0.7, reason: "同来源 wsj.com，共享标签 fed"
        )
        let accepted = confirmSuggestion(s, now: NOW)
        XCTAssertTrue(validateRelation(accepted).ok, "accepted relation must satisfy the contract")
        XCTAssertEqual(accepted.status, "confirmed")
        XCTAssertEqual(accepted.createdBy, "auto")
        XCTAssertEqual(accepted.confidence, 0.7)
        XCTAssertEqual(accepted.suggestionReason, "同来源 wsj.com，共享标签 fed")
        XCTAssertEqual(accepted.confirmedAt, NOW)
        XCTAssertEqual(accepted.confirmedBy, "user")

        // Modify: user picks a different type; endpoints re-canonicalize.
        let modified = confirmSuggestion(s, type: "reference", note: "我的备注", now: NOW)
        XCTAssertEqual(modified.type, "reference")
        XCTAssertEqual(modified.note, "我的备注")
        XCTAssertEqual(modified.suggestionReason, s.reason, "provenance kept on modify")
        XCTAssertTrue(validateRelation(modified).ok)
    }

    func testRejectSuppressesAndReEstablishClears() throws {
        let store = try freshStore()
        let a = fragment("a", tags: ["fed"])
        let b = fragment("b", tags: ["fed"])
        try store.upsertFragment(a, deviceId: "d", payloadHash: "h1")
        try store.upsertFragment(b, deviceId: "d", payloadHash: "h2")

        let s = RelationSuggestion(
            fromFragmentId: "a", toFragmentId: "b", suggestedType: "similarity",
            confidence: 0.5, reason: "共享标签 fed"
        )
        // Reject → suppression row → suggestion never resurfaces.
        try store.saveSuppression(rejectSuggestion(s, reason: "不对", now: NOW))
        let suppressed = try store.getSuppressions()
        XCTAssertEqual(suppressed.count, 1)
        XCTAssertTrue(
            suggestRelations([a, b], options: .init(suppressions: suppressed)).isEmpty,
            "the stored rejection key blocks the same suggestion"
        )

        // Re-establish: confirming ANY relation for the pair clears the keys.
        let confirmed = createManualRelation(from: "a", to: "b", type: "contrast", now: NOW)
        try store.saveRelation(confirmed)
        XCTAssertTrue(try store.getSuppressions().isEmpty)
        // The rejected similarity suggestion may now surface again.
        XCTAssertFalse(
            suggestRelations([a, b], options: .init(suppressions: try store.getSuppressions())).isEmpty
        )
    }

    func testManualRelationIsCanonicalAndValid() {
        let rel = createManualRelation(from: "zz", to: "aa", type: "contrast", note: "n", now: NOW)
        XCTAssertEqual(rel.fromFragmentId, "aa")
        XCTAssertEqual(rel.toFragmentId, "zz")
        XCTAssertEqual(rel.createdBy, "user")
        XCTAssertEqual(rel.status, "confirmed")
        XCTAssertTrue(validateRelation(rel).ok)
    }
}
