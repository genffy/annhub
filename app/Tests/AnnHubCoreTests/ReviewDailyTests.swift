// Daily suggestion budget, session wrap-up and the reminder setting
// (docs/v2/review.md §5, desktop.md §5.5 / §8).

import XCTest
@testable import AnnHubCore

final class ReviewDailyTests: XCTestCase {
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    /// Monday 2026-09-28 00:00 UTC.
    private let monday = 1_790_553_600_000
    private var now: Int { monday + 12 * 3_600_000 } // Monday noon

    private func fragment(_ id: String, dueAt: Int, createdAt: Int = 1) -> FragmentRecord {
        var record = makeFragment(id: id)
        record.createdAt = createdAt
        record.review.nextReviewAt = dueAt
        return record
    }

    private func log(_ id: String, _ fragmentId: String, _ rating: ReviewRating, hint: Bool = false, at ms: Int) -> ReviewLog {
        ReviewLog(
            id: id, target: ReviewTarget(fragmentId: fragmentId), rating: rating, reviewedAt: ms,
            previousIntervalDays: 1, nextIntervalDays: 2, usedHint: hint, schedulerVersion: schedulerVersion
        )
    }

    // ── daily plan ───────────────────────────────────────────────────────

    func testPlanSuggestsUpToTheLimitAndHoldsTheRestBack() {
        let fragments = (1...8).map { fragment("f\($0)", dueAt: now - $0 * 1000) }
        let plan = dailyReviewPlan(fragments: fragments, logs: [], now: now, dailyLimit: 5, calendar: utc)
        XCTAssertEqual(plan.due.count, 8)
        XCTAssertEqual(plan.suggested.count, 5)
        XCTAssertEqual(plan.beyondLimit, 3)
        XCTAssertFalse(plan.limitReached)
        // Most overdue first (stable queue order).
        XCTAssertEqual(plan.suggested.first?.id, "f8")
    }

    func testRatingsTodayConsumeTheBudgetAndReachTheLimit() {
        let fragments = (1...3).map { fragment("f\($0)", dueAt: now - 1000) }
        // Two distinct fragments rated today (f9 twice counts once); one rated yesterday.
        let logs = [
            log("a", "f8", .good, at: monday + 1000),
            log("b", "f9", .again, at: monday + 2000),
            log("c", "f9", .good, at: monday + 3000),
            log("d", "f7", .good, at: monday - 1000),
        ]
        let plan = dailyReviewPlan(fragments: fragments, logs: logs, now: now, dailyLimit: 5, calendar: utc)
        XCTAssertEqual(plan.ratedToday, 2)
        XCTAssertEqual(plan.remaining, 3)

        // Three more distinct ratings today use up the 5-card allowance.
        let more = logs + (1...3).map { log("m\($0)", "r\($0)", .good, at: monday + 10_000 + $0) }
        let full = dailyReviewPlan(fragments: fragments, logs: more, now: now, dailyLimit: 5, calendar: utc)
        XCTAssertEqual(full.remaining, 0)
        XCTAssertTrue(full.suggested.isEmpty)
        XCTAssertEqual(full.beyondLimit, 3)
        XCTAssertTrue(full.limitReached, "cap used up while due items remain")
        XCTAssertEqual(full.due.count, 3, "due items stay available for 再来一轮")
    }

    func testLimitIsClampedAndNothingDueIsNotLimitReached() {
        let none = dailyReviewPlan(fragments: [fragment("f1", dueAt: now + 5000)], logs: [], now: now, dailyLimit: 1, calendar: utc)
        XCTAssertEqual(none.dailyLimit, DAILY_LIMIT_MIN)
        XCTAssertTrue(none.due.isEmpty)
        XCTAssertFalse(none.limitReached)
    }

    // ── wrap-up ──────────────────────────────────────────────────────────

    func testWrapUpCountsOnlyThisSessionsRatingsAndListsTheNextDueDays() {
        let started = now - 600_000
        let session = ReviewSessionState(
            sessionId: "s1", fragmentIds: ["f1", "f2", "f3"], cursor: 3, startedAt: started,
            skipped: [ReviewSessionSkip(fragmentId: "f3", reason: "碎片已删除")]
        )
        let logs = [
            log("a", "f1", .good, hint: true, at: started + 1000),
            log("b", "f2", .again, hint: true, at: started + 2000),
            log("x", "other", .good, at: started + 3000), // not in this session
            log("y", "f1", .good, at: started - 10_000), // before the session started
        ]
        let tomorrow = monday + 24 * 3_600_000
        let fragments = [
            fragment("f1", dueAt: tomorrow + 3_600_000),
            fragment("f2", dueAt: tomorrow + 7_200_000),
            fragment("f4", dueAt: monday + 6 * 24 * 3_600_000 + 1000), // Sunday
            fragment("f5", dueAt: now - 1000), // still due now
        ]
        let wrap = sessionWrapUp(session: session, logs: logs, fragments: fragments, now: now, calendar: utc)
        XCTAssertEqual(wrap.rated, 2)
        XCTAssertEqual(wrap.usedHint, 2)
        XCTAssertEqual(wrap.again, 1)
        XCTAssertEqual(wrap.skipped, 1)
        XCTAssertEqual(wrap.dueNow, 1)
        XCTAssertEqual(wrap.upcoming, [
            UpcomingDue(dayStart: tomorrow, count: 2),
            UpcomingDue(dayStart: monday + 6 * 24 * 3_600_000, count: 1),
        ])
        XCTAssertEqual(relativeDayLabel(dayStart: wrap.upcoming[0].dayStart, now: now, calendar: utc), "明天")
        XCTAssertEqual(relativeDayLabel(dayStart: wrap.upcoming[1].dayStart, now: now, calendar: utc), "周日")
    }

    func testWrapUpKeepsOnlyTheNextThreeDueDays() {
        let session = ReviewSessionState(sessionId: "s", fragmentIds: [], cursor: 0, startedAt: now)
        let fragments = (1...5).map { fragment("f\($0)", dueAt: monday + $0 * 24 * 3_600_000 + 1000) }
        let wrap = sessionWrapUp(session: session, logs: [], fragments: fragments, now: now, calendar: utc)
        XCTAssertEqual(wrap.upcoming.count, 3)
        XCTAssertEqual(wrap.upcoming.map(\.dayStart), [1, 2, 3].map { monday + $0 * 24 * 3_600_000 })
    }

    func testRelativeDayLabels() {
        let day = 24 * 3_600_000
        XCTAssertEqual(relativeDayLabel(dayStart: monday, now: now, calendar: utc), "今天")
        XCTAssertEqual(relativeDayLabel(dayStart: monday + day, now: now, calendar: utc), "明天")
        XCTAssertEqual(relativeDayLabel(dayStart: monday + 2 * day, now: now, calendar: utc), "周三")
        XCTAssertEqual(relativeDayLabel(dayStart: monday + 6 * day, now: now, calendar: utc), "周日")
        XCTAssertEqual(relativeDayLabel(dayStart: monday + 7 * day, now: now, calendar: utc), "10月5日")
        // Past days (the 最近由扩展写入 list): 昨天, a weekday within the week, then a date.
        XCTAssertEqual(relativeDayLabel(dayStart: monday - day, now: now, calendar: utc), "昨天")
        XCTAssertEqual(relativeDayLabel(dayStart: monday - 4 * day, now: now, calendar: utc), "周四")
        XCTAssertEqual(relativeDayLabel(dayStart: monday - 7 * day, now: now, calendar: utc), "9月21日")
    }

    // ── reminder ─────────────────────────────────────────────────────────

    func testReminderDefaultsOffAt2030AndClampsTheTime() throws {
        let fallback = ReviewReminder()
        XCTAssertFalse(fallback.enabled)
        XCTAssertEqual(fallback.timeLabel, "20:30")

        XCTAssertEqual(ReviewReminder(enabled: true, hour: 31, minute: -4).timeLabel, "23:00")
        XCTAssertEqual(ReviewReminder(enabled: true, hour: 7, minute: 5).timeLabel, "07:05")

        let data = try JSONEncoder().encode(ReviewReminder(enabled: true, hour: 8, minute: 15))
        XCTAssertEqual(try JSONDecoder().decode(ReviewReminder.self, from: data), ReviewReminder(enabled: true, hour: 8, minute: 15))
        let wild = Data(#"{"enabled":true,"hour":99,"minute":99}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ReviewReminder.self, from: wild).timeLabel, "23:59")
    }

    // ── kind labels ──────────────────────────────────────────────────────

    func testEveryReviewableKindHasAChineseLabel() {
        XCTAssertEqual(Set(KIND_LABELS.keys), Set(REVIEW_QUESTIONS.keys))
        XCTAssertEqual(kindLabel("concept"), "概念")
        XCTAssertEqual(kindLabel("excerpt"), "摘录")
        XCTAssertEqual(kindLabel("media-clip"), "媒体片段")
        XCTAssertEqual(kindLabel("future-kind"), "future-kind")
    }

    // ── review status filter ─────────────────────────────────────────────

    func testReviewStatusIsExclusiveAndDueWins() {
        func fragment(_ id: String, phase: ReviewPhase, dueAt: Int) -> FragmentRecord {
            var record = makeFragment(id: id)
            record.review.state = phase
            record.review.nextReviewAt = dueAt
            return record
        }
        let later = now + 1000
        let all = [
            fragment("new-due", phase: .new, dueAt: now),
            fragment("new-later", phase: .new, dueAt: later),
            fragment("again-later", phase: .relearning, dueAt: later),
            fragment("learning-later", phase: .learning, dueAt: later),
            fragment("review-later", phase: .review, dueAt: later),
            fragment("review-due", phase: .review, dueAt: now - 5),
        ]
        XCTAssertEqual(all.map { reviewStatus(of: $0, now: now) }, [.due, .new, .learning, .learning, .scheduled, .due])
        XCTAssertEqual(ReviewStatus.allCases.map(\.label), ["到期", "新建", "学习中", "复习中"])

        XCTAssertEqual(filterByReviewStatus(all, statuses: [], now: now).count, 6, "empty set = no filter")
        XCTAssertEqual(filterByReviewStatus(all, statuses: [.due], now: now).map(\.id), ["new-due", "review-due"])
        XCTAssertEqual(
            filterByReviewStatus(all, statuses: [.new, .scheduled], now: now).map(\.id),
            ["new-later", "review-later"], "values within a dimension combine with OR"
        )
    }
}
