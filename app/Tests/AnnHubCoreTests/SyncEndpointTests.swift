// R3 bidirectional endpoints (storage.md §9): POST /v1/events idempotency
// and routing, GET /v1/changes cursor pagination, echo exclusion, and payload
// field-name parity with learning-core/sync.ts DesktopChange.

import XCTest
@testable import AnnHubCore

final class SyncEndpointTests: XCTestCase {
    let token = "pair-token-1"

    // ── lightweight Decodable mirrors of the sync.ts DesktopChange shapes;
    // decoding a served page through them proves the field names travel
    // exactly (fragmentId / review / log, camelCase).
    struct SyncChangeWire: Decodable {
        var seq: Int
        var type: String
        var fragmentId: String?
        var review: ReviewState?
        var log: ReviewLog?
    }

    struct ChangesPageWire: Decodable {
        var changes: [SyncChangeWire]
        var nextCursor: Int?
    }

    private func makeHub() throws -> (FragmentStore, DesktopHub) {
        let store = try freshStore()
        return (store, DesktopHub(store: store, pairToken: token))
    }

    private func eventsBody(deviceId: String, events: [[String: Any]]) throws -> Data {
        try JSONSerialization.data(
            withJSONObject: ["deviceId": deviceId, "events": events],
            options: [.sortedKeys]
        )
    }

    /// WireValue → JSONSerialization object (event payloads are decoded as
    /// WireValue inside the hub, then re-encoded; the test builds them the
    /// same way the extension would).
    private func wireAny(_ value: WireValue) throws -> Any {
        let data = try JSONEncoder.learningCore().encode(value)
        return try JSONSerialization.jsonObject(with: data)
    }

    @discardableResult
    private func postEvents(
        _ hub: DesktopHub, deviceId: String = "device_1", events: [[String: Any]]
    ) throws -> [String: Any] {
        let response = hub.handle(HubRequest(
            method: "POST", path: "/v1/events",
            bearerToken: token, body: try eventsBody(deviceId: deviceId, events: events)
        ))
        XCTAssertEqual(response.status, 200)
        return try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any]
        )
    }

    private func getChanges(
        _ hub: DesktopHub, cursor: Int, limit: Int? = nil, authorized: Bool = true
    ) throws -> (status: Int, page: ChangesPageWire?) {
        var path = "/v1/changes?cursor=\(cursor)"
        if let limit { path += "&limit=\(limit)" }
        let response = hub.handle(HubRequest(
            method: "GET", path: path, bearerToken: authorized ? token : nil
        ))
        return (response.status, response.decode(ChangesPageWire.self))
    }

    // ── auth ─────────────────────────────────────────────────────────────

    func testEventsAndChangesRequireAuth() throws {
        let (_, hub) = try makeHub()
        XCTAssertEqual(
            hub.handle(HubRequest(method: "POST", path: "/v1/events", body: Data("{}".utf8))).status,
            401
        )
        XCTAssertEqual(
            hub.handle(HubRequest(method: "GET", path: "/v1/changes")).status,
            401
        )
        // Malformed authorized bodies still 422, not 401.
        XCTAssertEqual(
            hub.handle(HubRequest(
                method: "POST", path: "/v1/events", bearerToken: token, body: Data("not json".utf8)
            )).status,
            422
        )
    }

    // ── POST /v1/events ──────────────────────────────────────────────────

    func testEventsBatchIsIdempotentPerDeviceAndEventId() throws {
        let (store, hub) = try makeHub()
        let record = makeFragment(id: "frag_ev1")
        let events: [[String: Any]] = [
            [
                "eventId": "ev-1", "type": "fragment.created",
                "payload": try wireAny(toFragmentWire(record)), "createdAt": NOW,
            ],
            [
                "eventId": "ev-2", "type": "fragment.updated",
                "payload": try wireAny(toFragmentWire(record)), "createdAt": NOW + 1,
            ],
        ]

        let first = try postEvents(hub, events: events)
        XCTAssertEqual(first["applied"] as? Int, 2)
        XCTAssertEqual(first["duplicates"] as? Int, 0)
        XCTAssertEqual((first["skipped"] as? [[String: Any]])?.count, 0)
        XCTAssertEqual(try store.getFragments().map(\.id), ["frag_ev1"])

        // Exact same batch again → all duplicates, no double-writes.
        let second = try postEvents(hub, events: events)
        XCTAssertEqual(second["applied"] as? Int, 0)
        XCTAssertEqual(second["duplicates"] as? Int, 2)
        XCTAssertEqual(try store.getFragments().count, 1)

        // A different device replaying the same eventIds applies anew.
        let other = try postEvents(hub, deviceId: "device_2", events: events)
        XCTAssertEqual(other["duplicates"] as? Int, 0)
    }

    func testUnknownFragmentReviewEventIsSkippedWithReason() throws {
        let (_, hub) = try makeHub()
        let review = createReviewState(now: NOW)
        let log = ReviewLog(
            id: "log_x", target: ReviewTarget(fragmentId: "ghost"),
            rating: .good, reviewedAt: NOW, previousIntervalDays: 0,
            nextIntervalDays: 1, usedHint: false, schedulerVersion: schedulerVersion
        )
        let event: [[String: Any]] = [[
            "eventId": "ev-r1",
            "type": "review.rated",
            "payload": try JSONSerialization.jsonObject(with: JSONEncoder.learningCore().encode(
                ReviewRatedPayload(fragmentId: "ghost", review: review, log: log)
            )),
            "createdAt": NOW,
        ]]

        let result = try postEvents(hub, events: event)
        XCTAssertEqual(result["applied"] as? Int, 0)
        let skipped = try XCTUnwrap(result["skipped"] as? [[String: Any]])
        XCTAssertEqual(skipped.count, 1)
        XCTAssertEqual(skipped[0]["eventId"] as? String, "ev-r1")
        XCTAssertEqual(skipped[0]["reason"] as? String, "UNKNOWN_FRAGMENT")

        // Not marked applied — the same event retried after the fragment
        // exists still skips (still unknown), never becomes a duplicate.
        let again = try postEvents(hub, events: event)
        XCTAssertEqual(again["duplicates"] as? Int, 0)
        XCTAssertEqual(again["applied"] as? Int, 0)
    }

    // ── stale review guard (storage.md §9, mirrors learning-core/sync.ts) ─

    private func reviewEvent(
        fragmentId: String, eventId: String, reviewedAt: Int, repetitions: Int
    ) throws -> [String: Any] {
        let review = ReviewState(
            state: .review, repetitions: repetitions, lapses: 0, intervalDays: 9,
            easeFactor: 2.5, lastReviewedAt: reviewedAt, nextReviewAt: reviewedAt + dayMs
        )
        let log = ReviewLog(
            id: "log_\(eventId)", target: ReviewTarget(fragmentId: fragmentId),
            rating: .good, reviewedAt: reviewedAt, previousIntervalDays: 0,
            nextIntervalDays: 9, usedHint: false, schedulerVersion: schedulerVersion
        )
        return [
            "eventId": eventId,
            "type": "review.rated",
            "payload": try JSONSerialization.jsonObject(with: JSONEncoder.learningCore().encode(
                ReviewRatedPayload(fragmentId: fragmentId, review: review, log: log)
            )),
            "createdAt": reviewedAt,
        ]
    }

    func testStaleExternalRatingKeepsNewerLocalStateAndStillRecordsLog() throws {
        let (store, hub) = try makeHub()
        let record = makeFragment(id: "frag_stale")
        let put = hub.handle(HubRequest(
            method: "PUT", path: "/v1/fragments/frag_stale",
            bearerToken: token, body: try putFragmentBody(deviceId: "device_1", record: record)
        ))
        XCTAssertEqual(put.status, 201)

        // Local rating at NOW + 1000 (repetitions 1).
        let rated = try store.rateFragment(id: "frag_stale", rating: .good, usedHint: false, now: NOW + 1000)
        XCTAssertEqual(rated.fragment.review.repetitions, 1)
        let updatedAtAfterLocal = try XCTUnwrap(store.getFragment(id: "frag_stale")).updatedAt

        // An OLDER extension rating arrives later — state stays local, the log
        // still records, and updatedAt never moves backwards.
        let result = try postEvents(hub, events: [
            try reviewEvent(
                fragmentId: "frag_stale", eventId: "ev-old",
                reviewedAt: NOW - 5000, repetitions: 7
            ),
        ])
        XCTAssertEqual(result["applied"] as? Int, 1)
        let after = try XCTUnwrap(store.getFragment(id: "frag_stale"))
        XCTAssertEqual(after.review.repetitions, 1, "older rating never overwrites newer state")
        XCTAssertEqual(after.review.lastReviewedAt, NOW + 1000)
        XCTAssertGreaterThanOrEqual(after.updatedAt, updatedAtAfterLocal)
        XCTAssertEqual(try store.reviewLogCount(fragmentId: "frag_stale"), 2, "log still records")

        // A NEWER external rating DOES apply.
        _ = try postEvents(hub, events: [
            try reviewEvent(
                fragmentId: "frag_stale", eventId: "ev-new",
                reviewedAt: NOW + 2000, repetitions: 3
            ),
        ])
        XCTAssertEqual(try store.getFragment(id: "frag_stale")?.review.repetitions, 3)
        XCTAssertEqual(try store.reviewLogCount(fragmentId: "frag_stale"), 3)
    }

    func testFragmentEventsRouteLikePutAndPreserveReview() throws {
        let (store, hub) = try makeHub()
        let record = makeFragment(id: "frag_route")
        _ = try postEvents(hub, events: [[
            "eventId": "e1", "type": "fragment.created",
            "payload": try wireAny(toFragmentWire(record)), "createdAt": NOW,
        ]])
        // Desktop review happens…
        let rated = try store.rateFragment(id: "frag_route", rating: .good, usedHint: false, now: NOW + 1000)
        XCTAssertEqual(rated.fragment.review.repetitions, 1)

        // …an extension fragment.updated with the SAME revision + same wire
        // (idempotent) must NOT clobber the review.
        let replay = try postEvents(hub, events: [[
            "eventId": "e2", "type": "fragment.updated",
            "payload": try wireAny(toFragmentWire(record)), "createdAt": NOW + 2000,
        ]])
        XCTAssertEqual(replay["applied"] as? Int, 1)
        XCTAssertEqual(try store.getFragment(id: "frag_route")?.review.repetitions, 1)

        // A NEWER revision replaces capture fields but keeps the review.
        var rev2 = record
        rev2.captureRevision = 2
        rev2.content = "hawkish pivot updated"
        rev2.normalizedContent = normalizeContent(rev2.content)
        rev2.context.excerpt = "Investors saw a hawkish pivot updated stance on rates."
        rev2.updatedAt = NOW + 3000
        _ = try postEvents(hub, events: [[
            "eventId": "e3", "type": "fragment.updated",
            "payload": try wireAny(toFragmentWire(rev2)), "createdAt": NOW + 3000,
        ]])
        let stored = try XCTUnwrap(store.getFragment(id: "frag_route"))
        XCTAssertEqual(stored.content, "hawkish pivot updated")
        XCTAssertEqual(stored.captureRevision, 2)
        XCTAssertEqual(stored.review.repetitions, 1, "review domain survives capture updates")
    }

    func testEventTypesOutsideTheContractAreSkippedAsUnknown() throws {
        let (store, hub) = try makeHub()
        // The output workshop and relations left the product (D-10): their
        // events are not part of the contract any more and store nothing.
        let result = try postEvents(hub, events: [
            ["eventId": "e-w", "type": "writing.created", "payload": ["id": "task_1"], "createdAt": NOW],
            ["eventId": "e-r", "type": "relation.created", "payload": ["id": "rel_1"], "createdAt": NOW + 1],
        ])
        XCTAssertEqual(result["applied"] as? Int, 0)
        let skipped = try XCTUnwrap(result["skipped"] as? [[String: Any]])
        XCTAssertEqual(skipped.compactMap { $0["reason"] as? String }, ["UNKNOWN_TYPE", "UNKNOWN_TYPE"])
        XCTAssertEqual(try store.changeLogCount(), 0)
        XCTAssertFalse(try store.isApplied(deviceId: "device_1", eventId: "e-w"), "skipped events leave no applied marker")
    }

    // ── GET /v1/changes ──────────────────────────────────────────────────

    /// One delivered fragment plus `ratings` Desktop ratings → `ratings` review.rated rows.
    @discardableResult
    private func seedDesktopMutations(_ store: FragmentStore, ratings: Int = 1) throws -> FragmentRecord {
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
        for index in 0..<ratings {
            _ = try store.rateFragment(id: record.id, rating: .good, usedHint: false, now: NOW + 10 + index)
        }
        return record
    }

    func testChangesCursorPaginationIsMonotonic() throws {
        let (store, hub) = try makeHub()
        let record = try seedDesktopMutations(store, ratings: 2)
        try store.deleteFragment(id: record.id, now: NOW + 50) // fragment.deleted
        XCTAssertEqual(try store.changeLogCount(), 3)

        // Page through with limit 2 — ascending seq, nextCursor monotonic.
        var cursor = 0
        var all: [SyncChangeWire] = []
        var pages = 0
        while true {
            let (status, page) = try getChanges(hub, cursor: cursor, limit: 2)
            XCTAssertEqual(status, 200)
            let page_ = try XCTUnwrap(page)
            if page_.changes.isEmpty {
                XCTAssertNil(page_.nextCursor, "drained feed omits nextCursor")
                break
            }
            XCTAssertEqual(page_.changes.map(\.seq), Array(page_.changes.map(\.seq)).sorted())
            XCTAssertTrue(page_.changes.allSatisfy { $0.seq > cursor })
            all.append(contentsOf: page_.changes)
            let next = try XCTUnwrap(page_.nextCursor)
            XCTAssertGreaterThan(next, cursor)
            cursor = next
            pages += 1
            XCTAssertLessThan(pages, 10, "pagination must terminate")
        }
        XCTAssertEqual(all.map(\.type), ["review.rated", "review.rated", "fragment.deleted"])

        // Pulling again from the last cursor is empty.
        let (status, page) = try getChanges(hub, cursor: cursor)
        XCTAssertEqual(status, 200)
        XCTAssertTrue(try XCTUnwrap(page).changes.isEmpty)
    }

    func testChangesEchoExclusionPutAndEventsNeverAppear() throws {
        let (store, hub) = try makeHub()
        // Extension PUT (via the R1 endpoint) — no change rows.
        let record = makeFragment(id: "frag_echo")
        let put = hub.handle(HubRequest(
            method: "PUT", path: "/v1/fragments/frag_echo",
            bearerToken: token, body: try putFragmentBody(deviceId: "device_1", record: record)
        ))
        XCTAssertEqual(put.status, 201)
        XCTAssertEqual(try store.changeLogCount(), 0, "extension PUT never feeds back")

        // Extension event ingestion — also no change rows.
        _ = try postEvents(hub, events: [[
            "eventId": "e-echo", "type": "fragment.created",
            "payload": try wireAny(toFragmentWire(makeFragment(id: "frag_echo2"))),
            "createdAt": NOW,
        ]])
        XCTAssertEqual(try store.changeLogCount(), 0)

        // Desktop rating DOES appear.
        _ = try store.rateFragment(id: "frag_echo", rating: .good, usedHint: false, now: NOW + 5)
        XCTAssertEqual(try store.changeLogCount(), 1)
        let (_, page) = try getChanges(hub, cursor: 0)
        let changes = try XCTUnwrap(page).changes
        XCTAssertEqual(changes.count, 1)
        XCTAssertEqual(changes[0].type, "review.rated")
        XCTAssertEqual(changes[0].fragmentId, "frag_echo")
    }

    func testChangesPayloadFieldNamesMatchSyncShapesExactly() throws {
        let (store, hub) = try makeHub()
        let record = try seedDesktopMutations(store)
        try store.deleteFragment(id: record.id, now: NOW + 80)

        // Every change decodes into the sync.ts DesktopChange mirror struct —
        // wrong/missing field names would fail decoding.
        let (_, page) = try getChanges(hub, cursor: 0)
        let changes = try XCTUnwrap(page).changes
        XCTAssertEqual(changes.map(\.type), ["review.rated", "fragment.deleted"])

        let rated = changes[0]
        XCTAssertEqual(rated.fragmentId, record.id)
        XCTAssertEqual(rated.review?.repetitions, 1, "review state AFTER the rating")
        XCTAssertEqual(rated.log?.target.fragmentId, record.id)
        XCTAssertEqual(rated.log?.schedulerVersion, schedulerVersion)

        let deleted = changes[1]
        XCTAssertEqual(deleted.fragmentId, record.id)
        XCTAssertNil(deleted.review)
        XCTAssertNil(deleted.log)
    }

    func testChangesPulledCursorAdvances() throws {
        let (store, hub) = try makeHub()
        try seedDesktopMutations(store, ratings: 2)
        XCTAssertEqual(try store.pendingChangeCount(), 2)
        let (_, page) = try getChanges(hub, cursor: 0, limit: 1)
        let next = try XCTUnwrap(page?.nextCursor)
        XCTAssertEqual(try store.pulledCursor(), next)
        XCTAssertEqual(try store.pendingChangeCount(), 1, "approximate pending = total - pulled")
        XCTAssertNotNil(store.lastPulledAt())
    }
}
