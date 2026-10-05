// Four-tier scheduler math (review.md §3) + factory gating.

import XCTest
@testable import AnnHubCore

final class SchedulerTests: XCTestCase {
    func testAgainResetsAndLapses() {
        var review = ReviewState(
            state: .review, repetitions: 3, lapses: 0, intervalDays: 10, easeFactor: 2.5, nextReviewAt: NOW)
        review = scheduleReview(review, rating: .again, now: NOW)
        XCTAssertEqual(review.intervalDays, 1)
        XCTAssertEqual(review.repetitions, 0)
        XCTAssertEqual(review.lapses, 1)
        XCTAssertEqual(review.easeFactor, 2.3, accuracy: 0.0001)
        XCTAssertEqual(review.state, .relearning)
        XCTAssertEqual(review.nextReviewAt, NOW + dayMs)
    }

    func testHardGrowsBy1_2WithEaseFloor() {
        let review = ReviewState(
            state: .review, repetitions: 1, lapses: 0, intervalDays: 5, easeFactor: 2.5, nextReviewAt: NOW)
        let hard = scheduleReview(review, rating: .hard, now: NOW)
        XCTAssertEqual(hard.intervalDays, 6)  // round(5 * 1.2)
        XCTAssertEqual(hard.easeFactor, 2.35, accuracy: 0.0001)

        let floored = scheduleReview(
            ReviewState(state: .review, repetitions: 1, lapses: 0, intervalDays: 5, easeFactor: 1.3, nextReviewAt: NOW),
            rating: .hard, now: NOW
        )
        XCTAssertEqual(floored.easeFactor, 1.3, accuracy: 0.0001)  // floor 1.3
    }

    func testGoodLadderFirstTwoRepetitions() {
        let fresh = ReviewState(
            state: .new, repetitions: 0, lapses: 0, intervalDays: 0, easeFactor: 2.5, nextReviewAt: NOW)
        let first = scheduleReview(fresh, rating: .good, now: NOW)
        XCTAssertEqual(first.intervalDays, 1)
        XCTAssertEqual(first.repetitions, 1)

        let second = scheduleReview(first, rating: .good, now: NOW)
        XCTAssertEqual(second.intervalDays, 6)
        XCTAssertEqual(second.repetitions, 2)

        let third = scheduleReview(second, rating: .good, now: NOW)
        XCTAssertEqual(third.intervalDays, 15)  // round(6 * 2.5)
        XCTAssertEqual(third.state, .review)
    }

    func testEasyFirstRepetitionAndEaseGrowth() {
        let fresh = ReviewState(
            state: .new, repetitions: 0, lapses: 0, intervalDays: 0, easeFactor: 2.5, nextReviewAt: NOW)
        let easy = scheduleReview(fresh, rating: .easy, now: NOW)
        XCTAssertEqual(easy.intervalDays, 4)
        XCTAssertEqual(easy.easeFactor, 2.65, accuracy: 0.0001)
    }

    func testRateFragmentReturnsLogWithSchedulerVersion() {
        let fragment = makeFragment()
        let rated = rateFragment(fragment, rating: .good, usedHint: true, now: NOW + 1000)
        XCTAssertEqual(rated.fragment.review.intervalDays, 1)
        XCTAssertEqual(rated.fragment.updatedAt, NOW + 1000)
        XCTAssertEqual(rated.log.rating, .good)
        XCTAssertEqual(rated.log.usedHint, true)
        XCTAssertEqual(rated.log.schedulerVersion, "four-tier-v1")
        XCTAssertEqual(rated.log.previousIntervalDays, 0)
        XCTAssertEqual(rated.log.nextIntervalDays, 1)
        XCTAssertEqual(rated.log.target.fragmentId, fragment.id)
        XCTAssertEqual(rated.log.target.type, "fragment")
    }

    func testPreviewIntervalMatchesSchedule() {
        let review = ReviewState(
            state: .review, repetitions: 2, lapses: 0, intervalDays: 6, easeFactor: 2.5, nextReviewAt: NOW)
        XCTAssertEqual(previewInterval(review, rating: .good, now: NOW), 15)
        XCTAssertEqual(previewInterval(review, rating: .hard, now: NOW), 7)  // round(6*1.2)
        XCTAssertEqual(previewInterval(review, rating: .easy, now: NOW), 20)  // round(6*2.5*1.3)
        XCTAssertEqual(previewInterval(review, rating: .again, now: NOW), 1)
    }

    // ── factory ──────────────────────────────────────────────────────────

    func testCreateFragmentDefaults() throws {
        let record = try createFragment(
            CreateFragmentInput(
                kind: "concept",
                content: "  Hawkish  Pivot  ",
                context: FragmentContextInput(
                    excerpt: "The Fed made a hawkish pivot and stocks fell sharply today.",
                    sourceUrl: "https://www.wsj.com/markets",
                    sourceHost: "wsj.com",
                    capturedAt: NOW - 50
                ),
                processing: FragmentProcessing(
                    verified: VerifiedResult(confirmedAt: NOW, source: "source-material"),
                    use: "在下周的宏观复盘里解释债券抛售。"
                ),
                detail: .concept(ConceptDetail(definition: "转向更紧缩")),
                tags: ["Fed", "fed", "Macro"],
                now: NOW
            ))
        XCTAssertEqual(record.schemaVersion, 4)
        XCTAssertEqual(record.captureRevision, 1)
        XCTAssertEqual(record.content, "Hawkish  Pivot")  // trimmed, NOT collapsed
        XCTAssertEqual(record.normalizedContent, "hawkish pivot")
        XCTAssertEqual(record.context.capturedAt, NOW - 50)  // explicit capturedAt wins
        XCTAssertEqual(record.createdAt, NOW)
        XCTAssertEqual(record.review.state, .new)
        XCTAssertEqual(record.review.easeFactor, 2.5)
        XCTAssertEqual(record.review.nextReviewAt, NOW)
        XCTAssertEqual(record.tags, ["fed", "macro"])
        XCTAssertEqual(schedulerVersion, "four-tier-v1")
    }

    func testCreateFragmentDefaultsCapturedAtToNow() throws {
        let record = try createFragment(
            CreateFragmentInput(
                kind: "inspiration",
                content: "把复盘写成给未来自己的信",
                context: FragmentContextInput(
                    excerpt: "把复盘写成给未来自己的信：假设一年后的自己会追问今天的假设。",
                    sourceUrl: "annhub://manual/note_1",
                    sourceHost: "manual"
                ),
                processing: FragmentProcessing(
                    verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                    use: "下次写复盘时用这个视角。"
                ),
                detail: .inspiration(InspirationDetail(form: "reflection")),
                now: NOW
            ))
        XCTAssertEqual(record.context.capturedAt, NOW)
    }

    func testFactoryThrowsOnInvalidInput() {
        XCTAssertThrowsError(
            try createFragment(
                CreateFragmentInput(
                    kind: "concept",
                    content: "hawkish pivot",
                    context: FragmentContextInput(
                        excerpt: "Nothing relevant here.",
                        sourceUrl: "https://www.wsj.com/markets",
                        sourceHost: "wsj.com"
                    ),
                    processing: FragmentProcessing(
                        verified: VerifiedResult(confirmedAt: NOW, source: "manual"),
                        use: "用于验证。"
                    ),
                    detail: .concept(ConceptDetail()),
                    now: NOW
                ))
        ) { error in
            XCTAssertEqual((error as? FragmentValidationError)?.code, .excerptMissingContent)
        }
    }
}
