// ⌘K search and commands (desktop.md §9), the three saved views (§4.1, fragments.md §9)
// and the kind-specific detail block (§4.3). All pure: the SwiftUI layer renders them.

import XCTest

@testable import AnnHubCore

// ── saved views ──────────────────────────────────────────────────────────

final class SavedViewTests: XCTestCase {
    private func review(
        _ state: ReviewPhase = .review, lapses: Int = 0, due: Int
    ) -> ReviewState {
        ReviewState(
            state: state, repetitions: 1, lapses: lapses, intervalDays: 1, easeFactor: 2.5,
            lastReviewedAt: NOW - 1000, nextReviewAt: due)
    }

    private func fragment(_ id: String, _ review: ReviewState) -> FragmentRecord {
        makeFragment(id: id, review: review)
    }

    private func log(_ id: String, _ fragmentId: String, _ rating: ReviewRating, at: Int) -> ReviewLog {
        ReviewLog(
            id: id, target: ReviewTarget(fragmentId: fragmentId), rating: rating, reviewedAt: at,
            previousIntervalDays: 0, nextIntervalDays: 1, usedHint: false, schedulerVersion: schedulerVersion)
    }

    func testANewFragmentIsNewAndDueButNotInNeedOfWork() {
        let f = fragment("a", createReviewState(now: NOW))
        XCTAssertTrue(isInSavedView(.new, fragment: f, latestRating: nil, now: NOW))
        XCTAssertTrue(isInSavedView(.due, fragment: f, latestRating: nil, now: NOW))
        XCTAssertFalse(isInSavedView(.needsWork, fragment: f, latestRating: nil, now: NOW))
    }

    func testAComfortablyScheduledCardIsInNoView() {
        let f = fragment("a", review(due: NOW + 86_400_000))
        for view in SavedView.allCases {
            XCTAssertFalse(isInSavedView(view, fragment: f, latestRating: .good, now: NOW), view.label)
        }
    }

    func testDueIsDecidedByTheClockNotStored() {
        let f = fragment("a", review(due: NOW + 1000))
        XCTAssertFalse(isInSavedView(.due, fragment: f, latestRating: .good, now: NOW))
        XCTAssertTrue(isInSavedView(.due, fragment: f, latestRating: .good, now: NOW + 1000), "<= now")
    }

    func testNeedsWorkWhenTheLastRatingWasAgainOrHard() {
        let f = fragment("a", review(due: NOW + 86_400_000))
        XCTAssertTrue(isInSavedView(.needsWork, fragment: f, latestRating: .again, now: NOW))
        XCTAssertTrue(isInSavedView(.needsWork, fragment: f, latestRating: .hard, now: NOW))
        XCTAssertFalse(isInSavedView(.needsWork, fragment: f, latestRating: .good, now: NOW))
        XCTAssertFalse(isInSavedView(.needsWork, fragment: f, latestRating: .easy, now: NOW))
    }

    func testAnyLapseKeepsACardInNeedsWork() {
        let f = fragment("a", review(lapses: 1, due: NOW + 86_400_000))
        XCTAssertTrue(
            isInSavedView(.needsWork, fragment: f, latestRating: .good, now: NOW), "fragments.md §9: lapses > 0")
    }

    func testTheLatestRatingIsTheMostRecentOneWithAStableTieBreak() {
        let ratings = latestRatings([
            log("l1", "a", .again, at: NOW),
            log("l2", "a", .good, at: NOW + 10),
            log("l3", "b", .hard, at: NOW),
            log("l4", "b", .easy, at: NOW),  // same instant: the larger id wins, on any machine
            log("l0", "c", .good, at: NOW + 99),
        ])
        XCTAssertEqual(ratings["a"], .good)
        XCTAssertEqual(ratings["b"], .easy)
        XCTAssertEqual(ratings["c"], .good)
        XCTAssertNil(ratings["d"])
    }

    func testFilteringAndCountingFromTheSameFacts() {
        let fragments = [
            fragment("new", createReviewState(now: NOW)),
            fragment("hard", review(due: NOW + 86_400_000)),
            fragment("lapsed", review(lapses: 2, due: NOW - 1)),
            fragment("fine", review(due: NOW + 86_400_000)),
        ]
        let logs = [
            log("l1", "hard", .hard, at: NOW - 5), log("l2", "lapsed", .good, at: NOW - 4),
            log("l3", "fine", .good, at: NOW - 3),
        ]
        func ids(_ view: SavedView?) -> [String] {
            filterBySavedView(fragments, view: view, logs: logs, now: NOW).map(\.id)
        }
        XCTAssertEqual(ids(nil), ["new", "hard", "lapsed", "fine"])
        XCTAssertEqual(ids(.new), ["new"])
        XCTAssertEqual(ids(.due), ["new", "lapsed"])
        XCTAssertEqual(ids(.needsWork), ["hard", "lapsed"])
        let counts = savedViewCounts(fragments, logs: logs, now: NOW)
        XCTAssertEqual(counts, [.new: 1, .due: 2, .needsWork: 2])
    }

    func testViewsFollowTheStoreAfterRealRatings() throws {
        let store = try freshStore()
        for id in ["a", "b"] {
            try store.upsertFragment(makeFragment(id: id), deviceId: "ext-1", payloadHash: "h")
        }
        try store.rateFragment(id: "a", rating: .again, usedHint: false, now: NOW)
        try store.rateFragment(id: "b", rating: .good, usedHint: true, now: NOW)
        let counts = savedViewCounts(try store.getFragments(), logs: try store.getReviewLogs(), now: NOW)
        XCTAssertEqual(counts[.needsWork], 1, "again → relearning, lapses 1")
        XCTAssertEqual(counts[.new], 0, "both have been rated")
        XCTAssertEqual(counts[.due], 0, "both were scheduled for later")
    }
}

// ── command palette ──────────────────────────────────────────────────────

final class CommandPaletteTests: XCTestCase {
    private func library() -> [FragmentRecord] {
        [
            makeFragment(
                id: "f_retry", content: "重试风暴", excerpt: "重试风暴会放大故障", use: "复盘时检查客户端重试是否放大了流量",
                tags: ["reliability"], createdAt: NOW - 30),
            makeFragment(
                id: "f_backoff", content: "退避加抖动", excerpt: "指数退避加随机抖动", use: "重试前先确认幂等键",
                sourceTitle: "Exponential Backoff And Jitter", tags: ["retry", "reliability"], createdAt: NOW - 20),
            makeFragment(
                id: "f_idem", content: "幂等", excerpt: "同一请求重复执行结果不变", use: "给支付接口加幂等键", tags: ["api"],
                createdAt: NOW - 10),
            makeFragment(
                id: "f_other", content: "熔断", excerpt: "快速失败保护下游", use: "评审服务治理方案", tags: ["resilience"], createdAt: NOW
            ),
        ]
    }

    func testAnEmptyQueryListsTheNewestFragmentsAndEveryAvailableCommand() {
        let results = paletteSearch("   ", fragments: library(), context: PaletteContext(dueCount: 4))
        XCTAssertTrue(results.isRecent)
        XCTAssertEqual(results.fragments.map(\.id), ["f_other", "f_idem", "f_backoff", "f_retry"])
        XCTAssertTrue(results.fragments.allSatisfy { $0.matchedFields.isEmpty && $0.snippet == nil })
        XCTAssertEqual(
            results.commands.map(\.id),
            [.startReview, .goToday, .goLibrary, .goSystem, .openPreferences, .copyPairCode])
        XCTAssertEqual(results.commands.first?.detail, "4 条到期")
    }

    func testEveryWordMustHitButMayLandInDifferentFields() {
        // "重试" is in f_backoff's tags/use, "幂等" in its use; both are in the 应用 text of f_backoff only.
        let results = paletteSearch("重试 幂等", fragments: library())
        XCTAssertEqual(results.fragments.map(\.id), ["f_backoff"])
        XCTAssertEqual(results.totalFragments, 1)

        let acrossFields = paletteSearch("风暴 reliability", fragments: library())
        XCTAssertEqual(acrossFields.fragments.map(\.id), ["f_retry"], "content word + tag word")
        XCTAssertTrue(paletteSearch("重试 不存在的词", fragments: library()).fragments.isEmpty)
    }

    func testHitsAreRankedByTheSharedContractNotByCommandOrder() {
        let results = paletteSearch("重试", fragments: library())
        // content=5 (f_retry), then 应用/tags (f_backoff: use 4 + ... ) — same order as the library list.
        let expected = runFragmentQuery(library(), query: FragmentQuery(search: "重试")).items.map(\.id)
        XCTAssertEqual(results.fragments.map(\.id), expected)
        XCTAssertEqual(results.fragments.first?.id, "f_retry")
    }

    func testTheMatchedFieldsAreNamedHighestWeightFirst() throws {
        let hit = try XCTUnwrap(paletteSearch("重试", fragments: library()).fragments.first { $0.id == "f_retry" })
        XCTAssertEqual(hit.matchedFields, [.content, .use, .excerpt])
        XCTAssertEqual(hit.matchLabel, "内容 · 应用 · 摘录")

        let viaTag = try XCTUnwrap(paletteSearch("retry", fragments: library()).fragments.first)
        XCTAssertEqual(viaTag.id, "f_backoff")
        XCTAssertEqual(viaTag.matchedFields, [.tags, .sourceTitle].filter { viaTag.matchedFields.contains($0) })
        XCTAssertTrue(viaTag.matchedFields.contains(.tags))
    }

    func testAHitInThePrivateFieldsShowsAWindowOfTheText() throws {
        let hit = try XCTUnwrap(paletteSearch("幂等键", fragments: library()).fragments.first { $0.id == "f_backoff" })
        XCTAssertFalse(hit.matchedFields.contains(.content))
        let snippet = try XCTUnwrap(hit.snippet)
        XCTAssertTrue(snippet.contains("幂等键"), snippet)

        // When the content carries every word there is nothing to add.
        let direct = try XCTUnwrap(paletteSearch("熔断", fragments: library()).fragments.first)
        XCTAssertNil(direct.snippet)
    }

    func testOnlyAPageOfFragmentsIsListedButAllAreCounted() {
        let many = (0..<30).map { makeFragment(id: "f\($0)", content: "retry \($0)", createdAt: NOW - $0) }
        let results = paletteSearch("retry", fragments: many)
        XCTAssertEqual(results.fragments.count, PALETTE_FRAGMENT_LIMIT)
        XCTAssertEqual(results.totalFragments, 30)
        XCTAssertEqual(paletteSearch("retry", fragments: many, fragmentLimit: 3).fragments.count, 3)
    }

    func testCommandsAppearOnlyWhenTheyCanRun() {
        let none = paletteSearch("", fragments: [], context: PaletteContext(dueCount: 0))
        XCTAssertFalse(none.commands.contains { $0.id == .startReview }, "no due fragments, no 开始复习")
        XCTAssertFalse(none.commands.contains { $0.id == .resumeReview })

        let resumable = paletteSearch(
            "", fragments: [], context: PaletteContext(dueCount: 3, resume: .init(cursor: 2, total: 5)))
        XCTAssertEqual(resumable.commands.first?.id, .resumeReview)
        XCTAssertEqual(resumable.commands.first?.detail, "2/5")
        XCTAssertTrue(resumable.commands.contains { $0.id == .startReview })
    }

    func testCommandsAreFoundByTheirNameOrAKeyword() {
        let context = PaletteContext(dueCount: 5)
        func ids(_ query: String) -> [PaletteCommandID] {
            paletteSearch(query, fragments: [], context: context).commands.map(\.id)
        }
        XCTAssertEqual(ids("复习"), [.startReview])
        XCTAssertEqual(ids("settings"), [.openPreferences])
        XCTAssertEqual(ids("偏好"), [.openPreferences])
        XCTAssertEqual(ids("配对"), [.copyPairCode])
        XCTAssertEqual(ids("system"), [.goSystem])
        XCTAssertEqual(ids("打开"), [.goToday, .goLibrary, .goSystem, .openPreferences])
        XCTAssertEqual(ids("打开 系统"), [.goSystem], "every word must match")
        XCTAssertEqual(ids("zzzz"), [])
    }

    func testTheKeyboardOrderIsFragmentsThenCommandsWithUniqueIds() {
        // "复习" finds a fragment and the 开始复习 command.
        let fragments = library() + [makeFragment(id: "f_srs", content: "间隔复习", createdAt: NOW)]
        let results = paletteSearch("复习", fragments: fragments, context: PaletteContext(dueCount: 2))
        XCTAssertEqual(results.fragments.map(\.id), ["f_srs"])
        XCTAssertEqual(results.commands.map(\.id), [.startReview])
        let items = results.items
        XCTAssertEqual(items.count, results.fragments.count + results.commands.count)
        if case .fragment = items.first {} else { XCTFail("fragments come first") }
        if case .command = items.last {} else { XCTFail("commands come last") }
        XCTAssertEqual(Set(items.map(\.id)).count, items.count)
    }

    func testEqualScoresFallBackToNewestThenId() {
        let same = [
            makeFragment(id: "b", content: "alpha one", createdAt: NOW),
            makeFragment(id: "a", content: "alpha two", createdAt: NOW),
            makeFragment(id: "c", content: "alpha three", createdAt: NOW + 5),
        ]
        XCTAssertEqual(paletteSearch("alpha", fragments: same).fragments.map(\.id), ["c", "a", "b"])
    }

    func testSearchFieldsKeepTheContractWeights() {
        XCTAssertEqual(SearchField.allCases.map(\.weight), [5, 4, 4, 4, 3, 2, 1, 1, 1])
        XCTAssertEqual(SearchField.content.label, "内容")
        XCTAssertEqual(SearchField.sourceHost.label, SearchField.sourceUrl.label)
    }
}

// ── the kind-specific detail block ───────────────────────────────────────

final class KindDetailTests: XCTestCase {
    private func fields(_ kind: String, detail: WireValue, excerpt: String = "e", tags: [String] = []) -> [String:
        [String]]
    {
        let f = makeFragment(kind: kind, content: "c", excerpt: excerpt + " c", detail: detail, tags: tags)
        return Dictionary(uniqueKeysWithValues: kindDetailFields(f).map { ($0.label, $0.lines) })
    }

    func testProcedureShowsNumberedStepsPrerequisitesAndFailureModes() {
        let f = makeFragment(
            kind: "procedure",
            detail: wireObject(
                ("steps", wireStrings(["确认影响", "限制扩散"])), ("prerequisites", wireStrings(["值班权限"])),
                ("failureModes", wireStrings(["过早重启"]))))
        let result = kindDetailFields(f)
        XCTAssertEqual(result.map(\.label), ["步骤", "前置条件", "失败条件"])
        XCTAssertTrue(result[0].numbered)
        XCTAssertEqual(result[0].lines, ["确认影响", "限制扩散"])
        XCTAssertFalse(result[1].numbered)
    }

    func testClaimQuestionAndDecisionFields() {
        XCTAssertEqual(
            fields(
                "claim",
                detail: wireObject(
                    ("stance", .string("oppose")), ("evidence", wireStrings(["数据"])),
                    ("assumptions", wireStrings(["稳定"])))),
            ["立场": ["反对"], "证据": ["数据"], "前提": ["稳定"]])
        XCTAssertEqual(
            fields(
                "question",
                detail: wireObject(
                    ("status", .string("answered")), ("answer", .string("会")), ("evidence", wireStrings(["a", "b"])))),
            ["状态": ["已回答"], "证据": ["a", "b"], "答案": ["会"]])
        XCTAssertEqual(
            fields(
                "decision",
                detail: wireObject(
                    ("rationale", .string("复杂度")), ("alternatives", wireStrings(["共享文件"])),
                    ("consequences", wireStrings(["无协作"])))),
            ["理由": ["复杂度"], "备选方案": ["共享文件"], "后果": ["无协作"]])
    }

    func testConceptAndExcerptAndInspirationAndMediaClip() {
        XCTAssertEqual(
            fields(
                "concept",
                detail: wireObject(
                    ("definition", .string("定义")), ("boundaries", wireStrings(["边界"])),
                    ("examples", wireStrings(["例"])),
                    ("counterExamples", wireStrings(["反例"])))),
            ["定义": ["定义"], "适用边界": ["边界"], "示例": ["例"], "反例": ["反例"]])
        XCTAssertEqual(fields("excerpt", detail: wireObject(("note", .string("为何保留")))), ["备注": ["为何保留"]])
        let inspiration = makeFragment(
            kind: "inspiration", content: "提醒应让我看见判断的变化", excerpt: "提醒应让我看见判断的变化 — 设计今日页时发现任务计数不够",
            detail: wireObject(("form", .string("reflection"))))
        XCTAssertEqual(
            kindDetailFields(inspiration),
            [
                KindDetailField(label: "形式", lines: ["随感"]),
                KindDetailField(label: "触发背景", lines: ["设计今日页时发现任务计数不够"]),
            ])
        XCTAssertEqual(
            fields(
                "media-clip", detail: wireObject(("startMs", .int(65_000)), ("endMs", .int(130_000))), excerpt: "转写"),
            ["时间区间": ["01:05 – 02:10"], "转写节选": ["转写 c"]])
    }

    func testEmptyValuesAreLeftOutAndVisualHasNoFieldBlock() {
        XCTAssertTrue(fields("concept", detail: wireObject()).isEmpty)
        XCTAssertTrue(fields("procedure", detail: wireObject(("steps", wireStrings(["", "  "])))).isEmpty)
        XCTAssertTrue(fields("visual", detail: wireObject(("attachmentIds", wireStrings(["a"])))).isEmpty)
        XCTAssertTrue(fields("unknown-kind", detail: wireObject()).isEmpty)
    }
}
