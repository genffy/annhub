// Desktop-local tag edits and batch delete (desktop.md §4.4), and the guarantee that
// the store's writers — the hub's queues and the main thread — never collide.

import XCTest

@testable import AnnHubCore

final class LocalTagsTests: XCTestCase {
    private func seeded(
        _ ids: [String] = ["frag_a", "frag_b", "frag_c"], tags: [String] = ["fed", "macro"]
    ) throws -> FragmentStore {
        let store = try freshStore()
        for (offset, id) in ids.enumerated() {
            try store.upsertFragment(
                makeFragment(id: id, tags: tags, createdAt: NOW - offset), deviceId: "ext-1", payloadHash: "h-\(id)")
        }
        return store
    }

    private func tags(_ store: FragmentStore, _ id: String) throws -> [String] {
        try XCTUnwrap(try store.getFragment(id: id)).tags
    }

    // ── normalization ────────────────────────────────────────────────────

    func testATypedTagIsNormalizedLikeADeliveredOne() {
        XCTAssertEqual(normalizeLocalTag("#Retry"), "retry")
        XCTAssertEqual(normalizeLocalTag("  ##Reliability  "), "reliability")
        XCTAssertEqual(normalizeLocalTag("流控"), "流控")
        XCTAssertNil(normalizeLocalTag(""))
        XCTAssertNil(normalizeLocalTag(" # "))
        XCTAssertNotNil(normalizeLocalTag(String(repeating: "a", count: 32)))
        XCTAssertNil(normalizeLocalTag(String(repeating: "a", count: 33)), "fragments.md §6: 1 to 32 characters")
    }

    func testTagInputSplitsOnCommasSpacesAndDropsDuplicates() {
        XCTAssertEqual(
            parseTagInput("retry, #Reliability  streams、api；retry"), ["retry", "reliability", "streams", "api"])
        XCTAssertEqual(parseTagInput("  ,, "), [])
    }

    func testEditsAreAppliedOnTopOfTheDeliveredTags() {
        let edits = [
            LocalTagEdit(tag: "macro", op: .remove, updatedAt: 1),
            LocalTagEdit(tag: "later", op: .add, updatedAt: 3),
            LocalTagEdit(tag: "first", op: .add, updatedAt: 2),
            LocalTagEdit(tag: "fed", op: .add, updatedAt: 4),  // already delivered: no duplicate
        ]
        XCTAssertEqual(
            applyLocalTagEdits(["fed", "macro", "rates"], edits: edits), ["fed", "rates", "first", "later"])
        XCTAssertEqual(applyLocalTagEdits(["a"], edits: []), ["a"])
    }

    // ── add / remove ─────────────────────────────────────────────────────

    func testAddedTagsAppearOnEveryReadPath() throws {
        let store = try seeded()
        let result = try store.addLocalTags(["#Retry", "idempotency"], to: ["frag_a", "frag_b"], now: NOW)
        XCTAssertEqual(result, BatchTagResult(updated: 2, unchanged: 0, skipped: []))

        XCTAssertEqual(try tags(store, "frag_a"), ["fed", "macro", "retry", "idempotency"])
        XCTAssertEqual(try tags(store, "frag_c"), ["fed", "macro"], "only the chosen fragments change")
        let all = try store.getFragments()
        XCTAssertEqual(all.first { $0.id == "frag_b" }?.tags, ["fed", "macro", "retry", "idempotency"])

        // The shared query sees them: tag filter, search, and the filter chips.
        XCTAssertEqual(
            try store.listFragments(FragmentQuery(tags: ["retry"])).items.map(\.id).sorted(), ["frag_a", "frag_b"])
        XCTAssertEqual(try store.listFragments(FragmentQuery(search: "idempotency")).total, 2)
        XCTAssertTrue(collectTags(all).contains("retry"))
    }

    func testAddingWhatIsAlreadyThereChangesNothing() throws {
        let store = try seeded()
        let result = try store.addLocalTags(["FED", "macro"], to: ["frag_a"], now: NOW)
        XCTAssertEqual(result, BatchTagResult(updated: 0, unchanged: 1, skipped: []))
        XCTAssertTrue(try store.locallyTaggedFragmentIds().isEmpty)
    }

    func testRemovingADeliveredTagHidesItAndAddingItBackRestoresIt() throws {
        let store = try seeded()
        try store.removeLocalTags(["macro"], from: ["frag_a"], now: NOW)
        XCTAssertEqual(try tags(store, "frag_a"), ["fed"])
        XCTAssertEqual(try tags(store, "frag_b"), ["fed", "macro"])

        let again = try store.removeLocalTags(["macro"], from: ["frag_a"], now: NOW + 1)
        XCTAssertEqual(again, BatchTagResult(updated: 0, unchanged: 1, skipped: []))

        try store.addLocalTags(["macro"], to: ["frag_a"], now: NOW + 2)
        XCTAssertEqual(try tags(store, "frag_a"), ["fed", "macro"])
        XCTAssertTrue(try store.locallyTaggedFragmentIds().isEmpty, "undoing a removal leaves no edit behind")
    }

    func testRemovingATagOnlyTheDesktopAddedForgetsIt() throws {
        let store = try seeded()
        try store.addLocalTags(["mine"], to: ["frag_a"], now: NOW)
        try store.removeLocalTags(["mine"], from: ["frag_a"], now: NOW + 1)
        XCTAssertEqual(try tags(store, "frag_a"), ["fed", "macro"])
        XCTAssertTrue(try store.locallyTaggedFragmentIds().isEmpty)
    }

    func testAFragmentAtTwentyTagsIsSkippedNotTruncated() throws {
        let full = (1...20).map { "t\($0)" }
        let store = try seeded(["frag_full"], tags: full)
        try store.upsertFragment(makeFragment(id: "frag_room", tags: ["fed"]), deviceId: "ext-1", payloadHash: "h")
        let result = try store.addLocalTags(["extra"], to: ["frag_full", "frag_room", "missing"], now: NOW)
        XCTAssertEqual(result.updated, 1)
        XCTAssertEqual(Set(result.skipped), ["frag_full", "missing"])
        XCTAssertEqual(try tags(store, "frag_full"), full)
        XCTAssertEqual(try tags(store, "frag_room"), ["fed", "extra"])
    }

    func testOnlyUnusableTagsAreRejected() throws {
        let store = try seeded()
        for bad in [[""], ["  ", "#"], [String(repeating: "x", count: 40)]] {
            XCTAssertThrowsError(try store.addLocalTags(bad, to: ["frag_a"])) { error in
                XCTAssertEqual(error as? StoreError, .validation(code: "TAG_INVALID"))
            }
            XCTAssertThrowsError(try store.removeLocalTags(bad, from: ["frag_a"]))
        }
        // One good tag among bad ones is applied; the bad ones are dropped.
        XCTAssertEqual(try store.addLocalTags(["ok", "  "], to: ["frag_a"], now: NOW).updated, 1)
        XCTAssertEqual(try tags(store, "frag_a"), ["fed", "macro", "ok"])
    }

    // ── the delivered fields stay the extension's ────────────────────────

    func testARatingDoesNotBakeLocalEditsIntoTheDeliveredTags() throws {
        let store = try seeded(["frag_a"])
        try store.addLocalTags(["mine"], to: ["frag_a"], now: NOW)
        try store.removeLocalTags(["fed"], from: ["frag_a"], now: NOW)

        try store.rateFragment(id: "frag_a", rating: .good, usedHint: false, now: NOW + 10)
        XCTAssertEqual(
            try XCTUnwrap(try store.storedFragment(id: "frag_a")).tags, ["fed", "macro"], "delivered tags untouched")
        XCTAssertEqual(try tags(store, "frag_a"), ["macro", "mine"])

        let log = try XCTUnwrap(try store.getReviewLogs().first)
        let review = try XCTUnwrap(try store.getFragment(id: "frag_a")).review
        try store.applyExternalReview(fragmentId: "frag_a", review: review, log: log)
        XCTAssertEqual(try XCTUnwrap(try store.storedFragment(id: "frag_a")).tags, ["fed", "macro"])
    }

    func testLocalEditsDoNotChangeTheDeliveryHashOrTheIdempotency() throws {
        let store = try freshStore()
        let hub = DesktopHub(store: store, pairToken: "T")
        let record = makeFragment(id: "frag_h", tags: ["fed"])
        func put(_ record: FragmentRecord) throws -> HubResponse {
            hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/fragments/\(record.id)", bearerToken: "T",
                    body: try putFragmentBody(deviceId: "ext-1", record: record)))
        }
        XCTAssertEqual(try put(record).status, 201)
        let hashBefore = try XCTUnwrap(try store.fragmentDelivery(id: "frag_h")).payloadHash

        try store.addLocalTags(["mine"], to: ["frag_h"], now: NOW)
        XCTAssertEqual(try XCTUnwrap(try store.fragmentDelivery(id: "frag_h")).payloadHash, hashBefore)
        let repeated = try put(record)
        XCTAssertEqual(repeated.status, 200, "the same delivery is still an idempotent no-op")
        XCTAssertEqual(try tags(store, "frag_h"), ["fed", "mine"])
    }

    func testANewExtensionRevisionKeepsLocalEditsAndDropsTheOnesItMadeMoot() throws {
        let store = try freshStore()
        let hub = DesktopHub(store: store, pairToken: "T")
        func put(_ record: FragmentRecord) throws -> Int {
            hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/fragments/\(record.id)", bearerToken: "T",
                    body: try putFragmentBody(deviceId: "ext-1", record: record))
            ).status
        }
        var record = makeFragment(id: "frag_r", tags: ["fed", "macro"])
        XCTAssertEqual(try put(record), 201)
        try store.addLocalTags(["mine", "extra"], to: ["frag_r"], now: NOW)  // "extra" will arrive from the extension
        try store.removeLocalTags(["macro"], from: ["frag_r"], now: NOW)  // the extension will drop "macro" itself
        XCTAssertEqual(try tags(store, "frag_r"), ["fed", "mine", "extra"])

        record.captureRevision = 2
        record.tags = ["fed", "extra"]
        XCTAssertEqual(try put(record), 200)

        XCTAssertEqual(try XCTUnwrap(try store.storedFragment(id: "frag_r")).tags, ["fed", "extra"])
        XCTAssertEqual(
            try tags(store, "frag_r"), ["fed", "extra", "mine"], "the user's own tag survives the new revision")
        let remaining = try store.localTagEdits(for: "frag_r")
        XCTAssertEqual(
            remaining.map(\.tag), ["mine"], "the removal of a dropped tag and the add of a delivered one are moot")
    }

    func testAnExtensionRevisionThatBringsBackARemovedTagKeepsItHidden() throws {
        let store = try seeded(["frag_a"])
        try store.removeLocalTags(["macro"], from: ["frag_a"], now: NOW)
        var next = try XCTUnwrap(try store.storedFragment(id: "frag_a"))
        next.captureRevision = 2  // still sends "macro"
        try store.upsertFragment(next, deviceId: "ext-1", payloadHash: "h2")
        XCTAssertEqual(try tags(store, "frag_a"), ["fed"], "a removal the extension did not follow stays in force")
    }

    // ── delete ───────────────────────────────────────────────────────────

    func testDeletingAFragmentDropsItsLocalEdits() throws {
        let store = try seeded()
        try store.addLocalTags(["mine"], to: ["frag_a", "frag_b"], now: NOW)
        try store.deleteFragment(id: "frag_a", now: NOW)
        XCTAssertEqual(try store.locallyTaggedFragmentIds(), ["frag_b"])
    }

    func testBatchDeleteTakesEverythingOrNothingAndRefusesOldRequests() throws {
        let store = try seeded(["frag_a", "frag_b", "frag_c", "frag_d"])
        try store.rateFragment(id: "frag_a", rating: .good, usedHint: false, now: NOW)
        try store.addLocalTags(["mine"], to: ["frag_b"], now: NOW)

        let removed = try store.deleteFragments(ids: ["frag_a", "frag_b", "frag_c", "nope", "frag_a"], now: NOW + 5)
        XCTAssertEqual(removed, 3, "the unknown id and the duplicate are not counted")
        XCTAssertEqual(try store.getFragments().map(\.id), ["frag_d"])
        XCTAssertTrue(try store.getReviewLogs().isEmpty, "review logs go with the fragment")
        XCTAssertTrue(try store.locallyTaggedFragmentIds().isEmpty)
        for id in ["frag_a", "frag_b", "frag_c"] { XCTAssertTrue(try store.isDeleted(id: id), id) }
        XCTAssertFalse(try store.isDeleted(id: "nope"))

        // An old extension request for a deleted id is refused, not resurrected.
        let hub = DesktopHub(store: store, pairToken: "T")
        let retry = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/fragments/frag_b", bearerToken: "T",
                body: try putFragmentBody(deviceId: "ext-1", record: makeFragment(id: "frag_b"))))
        XCTAssertEqual(retry.status, 410)
    }

    func testABatchDeleteThatFailsHalfwayRollsBack() throws {
        let store = try seeded(["frag_a", "frag_b"])
        try store.execute("DROP TABLE change_log")  // the second step of every delete now fails
        XCTAssertThrowsError(try store.deleteFragments(ids: ["frag_a", "frag_b"], now: NOW))
        XCTAssertEqual(try store.getFragments().count, 2, "nothing was deleted")
        XCTAssertTrue(try store.getLocalDeletions().isEmpty, "and no marker was left behind")
    }
}

// ── writers that share one connection ────────────────────────────────────

final class StoreConcurrencyTests: XCTestCase {
    /// The hub's queues and the main thread write to the same store. A rating, a
    /// delivery and a batch edit running at once used to collide on BEGIN IMMEDIATE.
    func testConcurrentWritersNeverFailEachOther() throws {
        let store = try freshStore()
        let hub = DesktopHub(store: store, pairToken: "T")
        let ids = (0..<24).map { "frag_c\($0)" }
        let failures = FailureBox()

        // The hub delivers every fragment first so there is something to rate and tag.
        for id in ids {
            let response = hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/fragments/\(id)", bearerToken: "T",
                    body: try putFragmentBody(deviceId: "ext-1", record: makeFragment(id: id, createdAt: NOW))))
            XCTAssertEqual(response.status, 201)
        }

        DispatchQueue.concurrentPerform(iterations: 4) { worker in
            for round in 0..<40 {
                let id = ids[(round * 5 + worker * 7) % ids.count]
                do {
                    switch worker {
                    case 0:  // the extension re-delivering at a higher revision
                        var next = makeFragment(id: id, createdAt: NOW)
                        next.captureRevision = round + 2
                        let status = hub.handle(
                            HubRequest(
                                method: "PUT", path: "/v1/fragments/\(id)", bearerToken: "T",
                                body: try putFragmentBody(deviceId: "ext-1", record: next))
                        ).status
                        if status >= 500 { failures.add("PUT \(id) -> \(status)") }
                    case 1:  // the user rating cards
                        try store.rateFragment(id: id, rating: round % 2 == 0 ? .good : .hard, usedHint: false)
                    case 2:  // batch tagging
                        try store.addLocalTags(["w\(round % 5)"], to: [id, ids[(round + 1) % ids.count]])
                    default:  // the UI reloading
                        _ = try store.getFragments()
                        _ = try store.getReviewLogs()
                    }
                } catch {
                    failures.add("worker \(worker) round \(round): \(error)")
                }
            }
        }

        XCTAssertEqual(failures.all, [], "no writer may fail because another one was mid-transaction")
        XCTAssertEqual(try store.getFragments().count, ids.count)
        XCTAssertEqual(try store.getReviewLogs().count, 40, "every rating was committed with its log")
    }

    func testTransactionsCanNestAndRollBackTogether() throws {
        let store = try freshStore()
        XCTAssertThrowsError(
            try store.transaction {
                try store.upsertFragment(makeFragment(id: "frag_n1"), deviceId: "d", payloadHash: "h")
                try store.transaction {  // joins the outer one
                    try store.upsertFragment(makeFragment(id: "frag_n2"), deviceId: "d", payloadHash: "h")
                }
                throw StoreError.sqlite("boom")
            })
        XCTAssertTrue(try store.getFragments().isEmpty, "the outer failure undoes the inner work too")

        try store.transaction {
            try store.upsertFragment(makeFragment(id: "frag_n3"), deviceId: "d", payloadHash: "h")
        }
        XCTAssertEqual(try store.getFragments().map(\.id), ["frag_n3"], "a failed transaction leaves the store usable")
    }
}

private final class FailureBox: @unchecked Sendable {
    private let lock = NSLock()
    private var messages: [String] = []

    func add(_ message: String) {
        lock.lock()
        defer { lock.unlock() }
        messages.append(message)
    }

    var all: [String] {
        lock.lock()
        defer { lock.unlock() }
        return messages
    }
}
