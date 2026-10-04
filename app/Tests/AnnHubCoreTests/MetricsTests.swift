// Weekly Retrieved Fragments, M-18 (docs/v2/metrics.md §4).

import XCTest
@testable import AnnHubCore

final class MetricsTests: XCTestCase {
    /// Monday 2026-09-28 00:00 UTC; the calendar below is pinned to UTC so the
    /// ISO-week boundary is deterministic on any machine.
    private let mondayStart = 1_790_553_600_000
    private var utc: Calendar {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func log(_ id: String, _ fragmentId: String, _ rating: ReviewRating, at ms: Int) -> ReviewLog {
        ReviewLog(
            id: id, target: ReviewTarget(fragmentId: fragmentId), rating: rating, reviewedAt: ms,
            previousIntervalDays: 1, nextIntervalDays: 2, usedHint: false, schedulerVersion: schedulerVersion
        )
    }

    func testIsoWeekStartIsMondayMidnight() {
        let thursday = mondayStart + 3 * dayMs + 19 * 3_600_000
        XCTAssertEqual(isoWeekStart(thursday, calendar: utc), mondayStart)
        XCTAssertEqual(isoWeekStart(mondayStart, calendar: utc), mondayStart)
        XCTAssertEqual(
            isoWeekStart(mondayStart - 1, calendar: utc), mondayStart - 7 * dayMs, "Sunday belongs to the previous week"
        )
    }

    func testCountsDistinctFragmentsWithGoodOrEasyThisWeek() {
        let now = mondayStart + 3 * dayMs
        let logs = [
            log("l1", "frag_a", .good, at: mondayStart + 1_000),
            log("l2", "frag_a", .easy, at: mondayStart + 2_000),  // same fragment again → counted once
            log("l3", "frag_b", .easy, at: mondayStart + dayMs),
            log("l4", "frag_c", .again, at: mondayStart + dayMs),  // not a success
            log("l5", "frag_d", .hard, at: mondayStart + dayMs),  // not a success
            log("l6", "frag_e", .good, at: mondayStart - 1),  // last week
            log("l7", "frag_f", .good, at: now + 1),  // future-dated: outside [weekStart, now]
        ]
        XCTAssertEqual(weeklyRetrievedFragmentCount(logs, now: now, calendar: utc), 2)
    }

    func testNoLogsMeansZero() {
        XCTAssertEqual(weeklyRetrievedFragmentCount([], now: mondayStart + dayMs, calendar: utc), 0)
    }

    func testDeletedFragmentLogsAreRemovedWithTheFragment() throws {
        let store = try freshStore()
        try store.upsertFragment(makeFragment(id: "frag_keep"), deviceId: "d", payloadHash: "h")
        try store.upsertFragment(makeFragment(id: "frag_drop"), deviceId: "d", payloadHash: "h")
        let now = mondayStart + dayMs
        _ = try store.rateFragment(id: "frag_keep", rating: .good, usedHint: false, now: now)
        _ = try store.rateFragment(id: "frag_drop", rating: .easy, usedHint: false, now: now)
        XCTAssertEqual(weeklyRetrievedFragmentCount(try store.getReviewLogs(), now: now, calendar: utc), 2)

        try store.deleteFragment(id: "frag_drop", now: now)
        XCTAssertEqual(
            weeklyRetrievedFragmentCount(try store.getReviewLogs(), now: now, calendar: utc), 1,
            "deleted fragments are excluded")
    }
}
