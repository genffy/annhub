// Review-session contract + query mirror (review.md §4/§5, search.md via
// learning-core/review.ts / query.ts).

import XCTest
@testable import AnnHubCore

final class ReviewQueryTests: XCTestCase {
    // ── questions ────────────────────────────────────────────────────────

    func testQuestionRegistryCoversEveryRegisteredKindInBothLanguages() {
        for kind in registeredFragmentKinds {
            for lang in UILanguage.allCases {
                let spec = XCTUnwrapOptional(REVIEW_QUESTIONS[kind]?[lang], "kind \(kind) \(lang)")
                XCTAssertFalse(spec.question.isEmpty)
                XCTAssertEqual(spec.hints.count, 4, "hint ladder is 4 steps for \(kind) \(lang)")
                XCTAssertFalse(spec.hints.contains(where: \.isEmpty))
                XCTAssertEqual(spec.kind, kind)
            }
        }
    }

    /// `review-questions.json` is generated from review.ts: the wording both sides show is one table.
    func testReviewWordingMatchesTheSharedFixture() throws {
        struct Wording: Decodable {
            let kind: String
            let question: String
            let hints: [String]
        }
        let fixture = try JSONDecoder().decode(
            [String: [String: Wording]].self, from: fixtureData("review-questions.json"))
        XCTAssertEqual(Set(fixture.keys), Set(REVIEW_QUESTIONS.keys))
        for (kind, languages) in fixture {
            for lang in UILanguage.allCases {
                let expected = try XCTUnwrap(languages[lang.rawValue], "\(kind) \(lang)")
                let spec = reviewQuestion(for: kind, lang: lang)
                XCTAssertEqual(spec.kind, expected.kind)
                XCTAssertEqual(spec.question, expected.question, "\(kind) \(lang)")
                XCTAssertEqual(spec.hints, expected.hints, "\(kind) \(lang)")
            }
        }
    }

    func testAnUnknownKindGetsAGenericQuestionInEachLanguage() {
        XCTAssertEqual(reviewQuestion(for: "future", lang: .zh).question, "回忆这条碎片的关键内容。")
        XCTAssertEqual(
            reviewQuestion(for: "future", lang: .en).hints,
            ["Topic", "Context", "Original text", "Verification status"])
    }

    func testQuestionTextsMatchContract() {
        XCTAssertEqual(
            reviewQuestion(for: "concept", lang: .zh).question,
            "用自己的话解释它，并给出一个适用边界。"
        )
        XCTAssertEqual(
            reviewQuestion(for: "visual", lang: .zh).hints, ["结构关键词", "文字描述", "原图", "核验确认"]
        )
        XCTAssertEqual(
            reviewQuestion(for: "media-clip", lang: .zh).question,
            "回忆这段媒体材料的要点与时间定位。"
        )
        XCTAssertEqual(
            reviewQuestion(for: "concept", lang: .en).question,
            "Explain it in your own words and give one boundary where it applies."
        )
        // Fourth level per kind (review.ts parity).
        for (kind, last) in [
            ("excerpt", "核验确认"), ("concept", "核验摘要"), ("claim", "核验确认"), ("procedure", "核验确认"),
            ("decision", "核验确认"), ("question", "核验确认"), ("inspiration", "核验确认"),
            ("media-clip", "核验确认"),
        ] {
            XCTAssertEqual(REVIEW_QUESTIONS[kind]?[.zh]?.hints[3], last, kind)
        }
        XCTAssertEqual(REVIEW_QUESTIONS["concept"]?[.en]?.hints[3], "Verification summary")
    }

    // ── hint ladder content (desktop.md §5.3) ────────────────────────────

    func testMaskedExcerptMasksAnswerContent() {
        let fragment = makeFragment(id: "frag_m", content: "hawkish pivot")
        let masked = maskedExcerpt(fragment)
        XCTAssertFalse(masked.contains("hawkish pivot"), "the answer never leaks at L3")
        XCTAssertTrue(masked.contains("﹏﹏﹏"), "masked with the mask marker")
        XCTAssertTrue(masked.contains("Investors rotated out of bonds"), "non-answer part survives")
        // Case-insensitive match; empty content returns the excerpt as-is.
        XCTAssertTrue(maskedExcerpt(makeFragment(id: "frag_m2", content: "  ")).contains("hawkish pivot"))
    }

    func testVerificationHintStatusAndSummary() {
        var fragment = makeFragment(id: "frag_v")
        let withSummary = verificationHint(fragment, lang: .zh)
        XCTAssertTrue(withSummary.contains("已确认"))
        XCTAssertTrue(withSummary.contains("未核验") == false)
        XCTAssertTrue(verificationHint(fragment, lang: .en).contains("confirmed (source:"))

        fragment.processing.verified?.summary = nil
        let withoutSummary = verificationHint(fragment, lang: .zh)
        XCTAssertTrue(withoutSummary.contains("已确认，无摘要 — 回看原始语境"))
        XCTAssertTrue(verificationHint(fragment, lang: .en).contains("Confirmed, no summary"))

        fragment.processing.verified = nil
        XCTAssertTrue(verificationHint(fragment, lang: .zh).contains("未核验"))
        XCTAssertTrue(verificationHint(fragment, lang: .en).contains("not verified"))
    }

    func testDailyLimitClamp() {
        XCTAssertEqual(clampedDailyLimit(20), 20)
        XCTAssertEqual(clampedDailyLimit(5), 5)
        XCTAssertEqual(clampedDailyLimit(50), 50)
        XCTAssertEqual(clampedDailyLimit(4), 5, "below min clamps up")
        XCTAssertEqual(clampedDailyLimit(0), 5)
        XCTAssertEqual(clampedDailyLimit(51), 50, "above max clamps down")
        XCTAssertEqual(clampedDailyLimit(10_000), 50)
    }

    // ── daily queue & session cap ────────────────────────────────────────

    private func dueFragment(
        id: String, nextReviewAt: Int, lapses: Int = 0, createdAt: Int = NOW
    ) -> FragmentRecord {
        var f = makeFragment(id: id)
        f.review.nextReviewAt = nextReviewAt
        f.review.lapses = lapses
        f.createdAt = createdAt
        f.updatedAt = createdAt
        return f
    }

    func testBuildDailyQueueOrderAndCap() {
        let fragments = [
            dueFragment(id: "frag_c", nextReviewAt: NOW - 1000),  // due, latest
            dueFragment(id: "frag_a", nextReviewAt: NOW - 5000),  // due, earliest
            dueFragment(id: "frag_l", nextReviewAt: NOW - 5000, lapses: 3),  // same time, more lapses first
            dueFragment(id: "frag_old", nextReviewAt: NOW - 5000, lapses: 3, createdAt: NOW - 9999),
        ]
        var future = makeFragment(id: "frag_future")
        future.review.nextReviewAt = NOW + 10 * dayMs

        let queue = buildDailyQueue(fragments + [future], now: NOW)  // future excluded: nextReviewAt > now
        XCTAssertEqual(queue.map(\.id), ["frag_old", "frag_l", "frag_a", "frag_c"])

        // Cap: 25 due fragments, dailyLimit 20 → 20.
        let many = (0..<25).map { dueFragment(id: "frag_\($0)", nextReviewAt: NOW - 1000) }
        XCTAssertEqual(buildDailyQueue(many, now: NOW).count, 20)
    }

    func testSessionCap() {
        XCTAssertEqual(sessionCap(dailyRemaining: 20), 13)
        XCTAssertEqual(sessionCap(dailyRemaining: 5), 5)
        XCTAssertEqual(sessionCap(dailyRemaining: 0), 0)
        XCTAssertEqual(DAILY_LIMIT_DEFAULT, 20)
        XCTAssertEqual(DAILY_LIMIT_MIN, 5)
        XCTAssertEqual(DAILY_LIMIT_MAX, 50)
        XCTAssertEqual(SESSION_SECONDS_PER_CARD, 45)
        XCTAssertEqual(SESSION_BUDGET_SECONDS, 600)
    }

    func testReviewSessionStateRoundtripsCodable() throws {
        let state = ReviewSessionState(
            sessionId: "s1",
            fragmentIds: ["a", "b"],
            cursor: 1,
            startedAt: NOW,
            skipped: [ReviewSessionSkip(fragmentId: "a", reason: "碎片已删除")]
        )
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(ReviewSessionState.self, from: data)
        XCTAssertEqual(decoded, state)
    }

    // ── query ────────────────────────────────────────────────────────────

    func testContentWeightBeatsTagWeight() {
        let inContent = makeFragment(id: "frag_c1", content: "alpha", excerpt: "alpha in the excerpt")
        var inTag = makeFragment(id: "frag_c2", content: "beta", excerpt: "beta in the excerpt")
        inTag.tags = ["alpha"]

        let result = runFragmentQuery([inTag, inContent], query: FragmentQuery(search: "alpha"))
        XCTAssertEqual(result.items.map(\.id), ["frag_c1", "frag_c2"])  // score 5 > 3
    }

    func testEveryWordMustHitSomeField() {
        let f = makeFragment(id: "frag_w", content: "alpha", excerpt: "alpha in the excerpt")
        // One unmatched word excludes the record.
        XCTAssertEqual(runFragmentQuery([f], query: FragmentQuery(search: "alpha zzz")).items.count, 0)
        // Both words hit (content + excerpt).
        XCTAssertEqual(runFragmentQuery([f], query: FragmentQuery(search: "alpha excerpt")).items.count, 1)
    }

    func testKindsFilterCombinesWithSearch() {
        let concept = makeFragment(id: "frag_k1", kind: "concept", content: "alpha", excerpt: "alpha excerpt")
        let claim = makeFragment(id: "frag_k2", kind: "claim", content: "alpha", excerpt: "alpha excerpt")
        let result = runFragmentQuery(
            [concept, claim],
            query: FragmentQuery(
                search: "alpha", kinds: ["claim"]
            ))
        XCTAssertEqual(result.items.map(\.id), ["frag_k2"])
        XCTAssertEqual(result.total, 1)
    }

    func testCapturedRangeFilter() {
        var early = makeFragment(id: "frag_e")
        early.context.capturedAt = NOW - 10 * dayMs
        let late = makeFragment(id: "frag_l")
        let result = runFragmentQuery(
            [early, late],
            query: FragmentQuery(
                capturedFrom: NOW - dayMs, capturedTo: NOW + dayMs
            ))
        XCTAssertEqual(result.items.map(\.id), ["frag_l"])
    }

    func testSortIsScoreDescThenCreatedAtDescThenIdAsc() {
        let older = makeFragment(id: "frag_z", createdAt: NOW - 1000)
        let newer = makeFragment(id: "frag_y", createdAt: NOW)
        let sameTime = makeFragment(id: "frag_a", createdAt: NOW)
        let sameTime2 = makeFragment(id: "frag_b", createdAt: NOW)

        // No search → score 0 for all → createdAt desc, then id asc.
        let sorted = runFragmentQuery([older, sameTime, sameTime2, newer]).items
        XCTAssertEqual(sorted.map(\.id), ["frag_a", "frag_b", "frag_y", "frag_z"])
    }

    func testLimitAndCursorPagination() {
        let fragments = (0..<5).map { makeFragment(id: String(format: "frag_%02d", $0)) }
        let page1 = runFragmentQuery(fragments, query: FragmentQuery(limit: 2))
        XCTAssertEqual(page1.items.map(\.id), ["frag_00", "frag_01"])
        XCTAssertEqual(page1.total, 5)

        let page2 = runFragmentQuery(fragments, query: FragmentQuery(limit: 2, cursor: page1.nextCursor))
        XCTAssertEqual(page2.items.map(\.id), ["frag_02", "frag_03"])

        let page3 = runFragmentQuery(fragments, query: FragmentQuery(limit: 2, cursor: page2.nextCursor))
        XCTAssertEqual(page3.items.map(\.id), ["frag_04"])
        XCTAssertNil(page3.nextCursor)
    }

    func testCollectHostsAndTagsFrequencyThenAlpha() {
        var a = makeFragment(id: "f1")
        a.context.sourceHost = "wsj.com"
        a.tags = ["fed", "macro"]
        var b = makeFragment(id: "f2")
        b.context.sourceHost = "wsj.com"
        b.tags = ["fed"]
        var c = makeFragment(id: "f3")
        c.context.sourceHost = "ft.com"
        c.tags = []

        XCTAssertEqual(collectHosts([c, b, a]), ["wsj.com", "ft.com"])
        XCTAssertEqual(collectTags([c, b, a]), ["fed", "macro"])
        XCTAssertEqual(collectKinds([a, b, c]).count, 1)
    }

    // ── R4 visual occlusion helper (pure pixel math) ──────────────────────

    func testPixelateBitmapDimsAndBlockAveraging() {
        // 4x2 RGBA: red left half, blue right half (fixture-png-shaped).
        var rgba: [UInt8] = []
        for _ in 0..<2 {
            for x in 0..<4 {
                rgba += x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]
            }
        }
        let bitmap = OcclusionBitmap(width: 4, height: 2, rgba: rgba)

        let tiny = pixelateBitmap(bitmap, targetWidth: 2)
        XCTAssertEqual(tiny.width, 2)
        XCTAssertEqual(tiny.height, 1, "aspect preserved: 4x2 → 2x1")
        XCTAssertEqual(tiny.rgba.count, 2 * 1 * 4)
        // Two blocks, each the box average of its 2x2 source region.
        XCTAssertEqual(Array(tiny.rgba[0..<4]), [255, 0, 0, 255])
        XCTAssertEqual(Array(tiny.rgba[4..<8]), [0, 0, 255, 255])

        // Mixed region averages channel-wise: left half of row-split block.
        let wide = pixelateBitmap(bitmap, targetWidth: 1)
        XCTAssertEqual(wide.width, 1)
        XCTAssertEqual(wide.height, 1)
        XCTAssertEqual(Array(wide.rgba[0..<4]), [127, 0, 127, 255], "half red + half blue")

        // targetWidth >= source width is a no-op-sized grid (still valid).
        let same = pixelateBitmap(bitmap, targetWidth: 4)
        XCTAssertEqual(same.width, 4)
        XCTAssertEqual(same.height, 2)
        XCTAssertEqual(same.rgba, rgba)

        // mm:ss formatting for media-clip reference display.
        XCTAssertEqual(mmss(0), "00:00")
        XCTAssertEqual(mmss(12_000), "00:12")
        XCTAssertEqual(mmss(45_000), "00:45")
        XCTAssertEqual(mmss(3_661_000), "61:01")
    }
}

/// XCTUnwrap for optionals outside throwing tests.
func XCTUnwrapOptional<T>(_ value: T?, _ message: String = "") -> T {
    guard let value else {
        XCTFail("unexpected nil \(message)")
        fatalError("unreachable after XCTFail")
    }
    return value
}
