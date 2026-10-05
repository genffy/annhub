// The review session as the user lives it (desktop.md §5, review.md §4/§5), including
// acceptance scenario C of examples.md §5: four due fragments of four kinds, reviewed in a row,
// quit in the middle of the third and reopened.

import AnnHubCore
import XCTest

@MainActor
final class ReviewFlowTests: DesktopTestCase {
    private var harnesses: [Harness] = []

    override func tearDown() async throws {
        for harness in harnesses { harness.stop() }
        harnesses = []
    }

    private func harness(_ fragments: [FragmentRecord], clock: TestClock = TestClock()) throws -> Harness {
        let made = try makeHarness(fragments: fragments, clock: clock)
        harnesses.append(made)
        return made
    }

    // ── scenario C ───────────────────────────────────────────────────────

    func testScenarioC_FourCardsThatDifferAndAResumeAtTheThird() throws {
        let records = try scenarioCRecords()
        let h = try harness(records)
        let model = h.model
        XCTAssertEqual(model.dailyPlan.due.count, 4)
        XCTAssertTrue(model.startReviewSession())
        let order = try XCTUnwrap(model.session).fragmentIds
        XCTAssertEqual(order, records.map(\.id), "the stable queue order: oldest due first")

        // Four different questions and four different ladders, each as kinds.md lists them.
        let cards = order.compactMap { id in model.fragments.first { $0.id == id } }
        XCTAssertEqual(cards.map(\.kind), ["concept", "claim", "procedure", "decision"])
        XCTAssertEqual(Set(cards.map { reviewQuestion(for: $0.kind).question }).count, 4)
        XCTAssertEqual(
            cards.map { reviewQuestion(for: $0.kind).hints },
            [
                ["关键词", "上下文", "定义与示例", "核验摘要"],
                ["主题", "证据片段", "原文", "核验确认"],
                ["步骤数", "首步", "完整流程", "核验确认"],
                ["结论", "约束", "理由", "核验确认"],
            ])
        for level in 1...3 {
            XCTAssertEqual(
                Set(cards.map { reviewHint(level: level, for: $0).text }).count, 4, "level \(level) differs per card")
        }

        // Card 1: one hint, then reveal, then rate. The hint is on the record.
        XCTAssertEqual(model.currentFragment?.id, order[0])
        model.openNextHint()
        XCTAssertEqual(model.card.hintLevel, 1)
        XCTAssertFalse(model.rateCard(.good), "rating buttons exist only after the reveal")
        XCTAssertTrue(try h.store.getReviewLogs().isEmpty)
        model.revealCard()
        XCTAssertTrue(model.rateCard(.good))

        // Card 2: no hint.
        XCTAssertEqual(model.currentFragment?.id, order[1])
        XCTAssertEqual(model.card, ReviewCardState(fragmentId: order[1]), "a fresh card starts clean")
        model.revealCard()
        XCTAssertTrue(model.rateCard(.hard))

        // Card 3: two hints, then the app quits.
        XCTAssertEqual(model.currentFragment?.id, order[2])
        model.openNextHint()
        model.openNextHint()
        XCTAssertEqual(try XCTUnwrap(model.session).cursor, 2)
        XCTAssertEqual(try h.store.getReviewLogs().count, 2)

        // Reopen: same store, same preferences.
        let again = h.relaunched()
        XCTAssertEqual(again.resumableSession?.cursor, 2, "今日 offers 继续复习 3/4")
        XCTAssertEqual(again.resumableSession?.fragmentIds.count, 4)
        XCTAssertEqual(again.currentFragment?.id, order[2], "continues from the third card")
        XCTAssertEqual(again.card.hintLevel, 2, "the hints already used stay used")
        XCTAssertFalse(again.card.revealed)
        XCTAssertEqual(again.paletteContext.resume, PaletteContext.Resume(cursor: 2, total: 4))

        again.revealCard()
        XCTAssertTrue(again.rateCard(.good))
        XCTAssertEqual(again.currentFragment?.id, order[3])
        again.revealCard()
        XCTAssertTrue(again.rateCard(.easy))

        // Done: four ratings, none repeated, hints recorded where they were used.
        XCTAssertNil(again.session)
        XCTAssertNil(again.resumableSession)
        let logs = try h.store.getReviewLogs().sorted { $0.reviewedAt < $1.reviewedAt }
        XCTAssertEqual(logs.count, 4)
        XCTAssertEqual(Set(logs.map(\.target.fragmentId)), Set(order), "already-rated cards were not submitted again")
        let byFragment = Dictionary(uniqueKeysWithValues: logs.map { ($0.target.fragmentId, $0) })
        XCTAssertEqual(byFragment[order[0]]?.usedHint, true)
        XCTAssertEqual(byFragment[order[1]]?.usedHint, false)
        XCTAssertEqual(byFragment[order[2]]?.usedHint, true, "hints opened before the quit still count")
        XCTAssertEqual(byFragment[order[3]]?.usedHint, false)

        let wrap = try XCTUnwrap(again.wrapUp)
        XCTAssertEqual(wrap.rated, 4)
        XCTAssertEqual(wrap.usedHint, 2)
        XCTAssertEqual(wrap.again, 0)
        XCTAssertEqual(wrap.skipped, 0)
    }

    // ── hints are facts, not decoration ──────────────────────────────────

    func testClosingTheSheetOrQuittingNeverGivesAFreeRetry() throws {
        let h = try harness([try makeRecord()])
        h.model.startReviewSession()
        h.model.openNextHint()
        XCTAssertTrue(h.model.card.usedHint)

        h.model.syncCardToSession()  // what the sheet does every time it appears
        XCTAssertEqual(h.model.card.hintLevel, 1, "reopening the sheet keeps the hint")

        let again = h.relaunched()
        XCTAssertEqual(again.card.hintLevel, 1)
        again.revealCard()
        XCTAssertTrue(again.rateCard(.good))
        XCTAssertEqual(try h.store.getReviewLogs().first?.usedHint, true)
    }

    func testHintsStopAtFourAndCannotBeOpenedAfterTheReveal() throws {
        let h = try harness([try makeRecord()])
        h.model.startReviewSession()
        for _ in 0..<7 { h.model.openNextHint() }
        XCTAssertEqual(h.model.card.hintLevel, REVIEW_HINT_LEVELS)
        h.model.revealCard()
        let revealed = h.model.card
        h.model.openNextHint()
        XCTAssertEqual(h.model.card, revealed, "no more rungs once the answer is out")
    }

    func testTheCardNeverCarriesOverToTheNextOne() throws {
        let h = try harness(try scenarioCRecords())
        h.model.startReviewSession()
        h.model.openNextHint()
        h.model.revealCard()
        XCTAssertTrue(h.model.rateCard(.good))
        XCTAssertEqual(h.model.card.hintLevel, 0)
        XCTAssertFalse(h.model.card.revealed)
        h.model.skipCard(reason: "手动跳过")
        XCTAssertEqual(h.model.card, ReviewCardState(fragmentId: h.model.currentFragment?.id))
        XCTAssertEqual(h.model.session?.skipped.map(\.reason), ["手动跳过"])
    }

    func testAStaleSavedCardIsIgnoredWhenTheSessionMovedOn() throws {
        let records = try scenarioCRecords()
        let h = try harness(records)
        h.model.startReviewSession()
        h.model.openNextHint()
        // The saved card belongs to card 1; forge a session already on card 2.
        var moved = try XCTUnwrap(h.model.session)
        moved.cursor = 1
        h.defaults.set(try JSONEncoder().encode(moved), forKey: DesktopModel.sessionDefaultsKey)
        let again = h.relaunched()
        XCTAssertEqual(again.currentFragment?.id, records[1].id)
        XCTAssertEqual(again.card.hintLevel, 0, "hint state belongs to a card, not to the sheet")
    }

    // ── fragments that vanish ────────────────────────────────────────────

    func testAFragmentDeletedMidSessionIsSkippedNotACrash() throws {
        let records = try scenarioCRecords()
        let h = try harness(records)
        let model = h.model
        model.startReviewSession()
        model.revealCard()
        XCTAssertTrue(model.rateCard(.good))  // card 1 done; now on card 2 (claim)

        model.deleteLocal(records[1].id)  // deleted from the library while reviewing
        XCTAssertEqual(model.currentFragment?.id, records[2].id, "the deleted card is skipped at once")
        XCTAssertEqual(model.session?.cursor, 2)
        XCTAssertEqual(model.session?.skipped.map(\.fragmentId), [records[1].id])
        XCTAssertEqual(model.session?.skipped.map(\.reason), ["碎片已删除"])

        model.revealCard()
        XCTAssertTrue(model.rateCard(.good))
        model.revealCard()
        XCTAssertTrue(model.rateCard(.good))
        XCTAssertNil(model.session)
        XCTAssertEqual(model.wrapUp?.rated, 3)
        XCTAssertEqual(model.wrapUp?.skipped, 1)
    }

    func testDeletingEveryRemainingCardEndsTheSessionCleanly() throws {
        let records = try scenarioCRecords()
        let h = try harness(records)
        h.model.startReviewSession()
        h.model.deleteLocal(ids: records.map(\.id))
        XCTAssertNil(h.model.session)
        XCTAssertNil(h.model.currentFragment)
        XCTAssertEqual(h.model.wrapUp?.rated, 0)
        XCTAssertEqual(h.model.wrapUp?.skipped, 4)
        XCTAssertEqual(h.defaults.data(forKey: DesktopModel.sessionDefaultsKey), nil, "nothing left to resume")
    }

    // ── the day's allowance ──────────────────────────────────────────────

    func testTheDailyCapLimitsTheSuggestionButNeverTheUser() throws {
        let records = try (0..<8).map { try makeRecord(content: "card \($0)", now: T0 - $0 * 1000) }
        let h = try harness(records)
        h.model.dailyLimit = 5
        XCTAssertEqual(h.model.dailyPlan.suggested.count, 5)
        XCTAssertEqual(h.model.dailyPlan.beyondLimit, 3)

        XCTAssertTrue(h.model.startReviewSession())
        XCTAssertEqual(h.model.session?.fragmentIds.count, 5, "a session holds the suggested amount")
        for _ in 0..<5 {
            h.model.revealCard()
            XCTAssertTrue(h.model.rateCard(.good))
        }
        XCTAssertTrue(h.model.dailyPlan.limitReached, "5 / 5 with 3 still due → 建议量 5 / 5")
        XCTAssertFalse(h.model.startReviewSession(), "the plain button has nothing left to suggest")
        XCTAssertTrue(h.model.startReviewSession(overflow: true), "再来一轮（超出建议量） still works")
        XCTAssertEqual(h.model.session?.fragmentIds.count, 3)
    }

    func testTheDailyLimitIsClampedAndRemembered() throws {
        let h = try harness([])
        h.model.dailyLimit = 3
        XCTAssertEqual(h.model.dailyLimit, 5)
        h.model.dailyLimit = 99
        XCTAssertEqual(h.model.dailyLimit, 50)
        h.model.dailyLimit = 30
        XCTAssertEqual(h.relaunched().dailyLimit, 30)
    }

    func testRatingsFeedTheWeeklyCountAndTheNextDueDates() throws {
        let clock = TestClock()
        let h = try harness(try scenarioCRecords(), clock: clock)
        h.model.startReviewSession()
        h.model.revealCard()
        XCTAssertTrue(h.model.rateCard(.good))
        h.model.revealCard()
        XCTAssertTrue(h.model.rateCard(.again))
        XCTAssertEqual(h.model.weeklyRetrieved, 1, "again never counts as a successful retrieval (M-18)")
        let rated = h.model.fragments.filter { $0.review.lastReviewedAt != nil }
        XCTAssertEqual(rated.count, 2)
        XCTAssertTrue(rated.allSatisfy { $0.review.nextReviewAt > clock.now }, "both are scheduled for later")
    }
}
