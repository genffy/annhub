// Output workshop domain — mirrors learning-core/__tests__/output.test.ts
// (docs/v2/output.md, storage.md §3.2, desktop.md §6).

import XCTest
@testable import AnnHubCore

final class OutputTests: XCTestCase {
    var f1: FragmentRecord { makeFragment(id: "f1", content: "hawkish pivot", tags: ["fed"]) }
    var f2: FragmentRecord {
        makeFragment(id: "f2", content: "量化宽松", tags: ["fed"], createdAt: NOW - 30 * dayMs, updatedAt: NOW)
    }

    var f3: FragmentRecord { makeFragment(id: "f3", content: "供应链压力", tags: ["macro"]) }

    // ── templates + creation (desktop.md §6.2) ──────────────────────────

    func testTaskTemplatesCoverAllSixTypesWithPromptsAndConstraints() {
        XCTAssertEqual(TASK_TEMPLATES.count, 6)
        XCTAssertEqual(
            Set(TASK_TEMPLATES.keys), Set(writingTaskTypes),
            "exactly the six contract task types"
        )
        for type in writingTaskTypes {
            let template = TASK_TEMPLATES[type]
            XCTAssertTrue(template?.prompt.contains("{topic}") ?? false, type)
            XCTAssertFalse(template?.constraints.isEmpty ?? true, type)
            XCTAssertFalse(template?.label.isEmpty ?? true, type)
            XCTAssertFalse(template?.fits.isEmpty ?? true, type)
        }
        XCTAssertEqual(TASK_TEMPLATES["explanation"]?.label, "解释")
        XCTAssertEqual(TASK_TEMPLATES["article"]?.constraints, ["有明确论点", "引用至少两个碎片"])
    }

    func testCreateWritingTaskInterpolatesTopicAndStartsEmpty() {
        let task = createWritingTask(CreateWritingTaskInput(
            taskType: "explanation", topic: "利率传导", fragmentIds: ["f1"], now: NOW
        ))
        XCTAssertTrue(task.prompt.contains("利率传导"))
        XCTAssertFalse(task.prompt.contains("{topic}"))
        XCTAssertEqual(task.draftContent, "")
        XCTAssertTrue(task.submissions.isEmpty)
        XCTAssertEqual(task.fragmentIds, ["f1"])
        XCTAssertEqual(task.createdAt, NOW)
        XCTAssertEqual(task.updatedAt, NOW)
        // Custom prompt/constraints win over the template.
        let custom = createWritingTask(CreateWritingTaskInput(
            taskType: "plan", topic: "x", fragmentIds: [],
            prompt: "自定义 {topic} 提示", constraints: ["自定义约束"], now: NOW
        ))
        XCTAssertEqual(custom.prompt, "自定义 x 提示")
        XCTAssertEqual(custom.constraints, ["自定义约束"])
    }

    // ── submissions + feedback layering (storage.md §3.2) ───────────────

    func testAppendSubmissionImmutableAndDraftResets() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f2"], now: NOW
        ))
        task.draftContent = "草稿"
        task = appendSubmission(task, "第一版正文", now: NOW + 1000)
        let afterFirst = task
        task.draftContent = "第二版草稿"
        task = appendSubmission(task, "第二版正文", now: NOW + 2000)

        XCTAssertEqual(task.submissions.map(\.content), ["第一版正文", "第二版正文"])
        XCTAssertEqual(task.draftContent, "")
        // Immutable: the previous version is untouched by the second submit.
        XCTAssertEqual(afterFirst.submissions.count, 1)
        XCTAssertEqual(afterFirst.submissions[0].content, "第一版正文")
        XCTAssertEqual(task.submissions[0].content, "第一版正文")
        XCTAssertNotEqual(task.submissions[0].id, task.submissions[1].id)
    }

    func testLocalPresenceRecordsCluesOnlyNeverUsedOrCorrect() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "analysis", topic: "x", fragmentIds: ["f1", "f3"], now: NOW
        ))
        task = appendSubmission(task, "文中提到了 hawkish pivot 的转向。", now: NOW + 100)
        let assessments = localPresenceAssessments(task, [f1, f2, f3])
        XCTAssertEqual(assessments.count, 2, "only task fragments")

        let a1 = assessments.first { $0.fragmentId == "f1" }
        XCTAssertEqual(a1?.source, "local")
        XCTAssertEqual(a1?.presence, true)
        XCTAssertNil(a1?.used)
        XCTAssertNil(a1?.correct)
        XCTAssertNil(a1?.confirmedByUser)

        let a3 = assessments.first { $0.fragmentId == "f3" }
        XCTAssertEqual(a3?.presence, false)
        XCTAssertEqual(a1?.assessedAt, NOW + 100)
    }

    func testFeedbackCompletenessPendingPartialComplete() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "plan", topic: "x", fragmentIds: ["f1", "f2"], now: NOW
        ))
        XCTAssertEqual(feedbackCompleteness(task), .pending)
        task = appendSubmission(task, "正文", now: NOW + 100)
        XCTAssertEqual(feedbackCompleteness(task), .pending)
        task = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: true),
        ], now: NOW + 200)
        XCTAssertEqual(feedbackCompleteness(task), .partial)
        task = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f2", used: false),
        ], now: NOW + 300)
        XCTAssertEqual(feedbackCompleteness(task), .complete)
        // Confirmations for fragments outside the task are ignored.
        _ = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "zzz", used: true),
        ], now: NOW + 400)
        XCTAssertEqual(feedbackCompleteness(task), .complete)
    }

    func testConfirmAssessmentsMergesIntoLastSubmissionKeepingPresence() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f3"], now: NOW
        ))
        task = appendSubmission(task, "hawkish pivot 出现在正文。", now: NOW + 100)
        task = seedLocalPresence(task, [f1, f3])
        task = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: true),
        ], now: NOW + 200)

        XCTAssertEqual(task.submissions.count, 1)
        let last = task.submissions[0]
        let manual = last.assessments.first { $0.fragmentId == "f1" }
        XCTAssertEqual(manual?.source, "manual")
        XCTAssertEqual(manual?.used, true)
        XCTAssertEqual(manual?.correct, true)
        XCTAssertEqual(manual?.confirmedByUser, true)
        XCTAssertEqual(manual?.presence, true, "presence clue survives the merge")
        // Local-only assessment for f3 remains.
        let local = last.assessments.first { $0.fragmentId == "f3" && $0.source == "local" }
        XCTAssertEqual(local?.presence, false)
    }

    func testTaskStatusDerivesDraftWordsAndCompletion() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1"], now: NOW
        ))
        var status = taskStatus(task)
        XCTAssertFalse(status.completed)
        XCTAssertEqual(status.completeness, .pending)
        XCTAssertEqual(status.submissionCount, 0)
        XCTAssertEqual(status.draftWords, 0)

        task.draftContent = "  第一版 草稿 内容  "
        status = taskStatus(task)
        XCTAssertEqual(status.draftWords, 3)
        XCTAssertFalse(status.completed)

        task = appendSubmission(task, "正文", now: NOW + 100)
        status = taskStatus(task)
        XCTAssertTrue(status.completed)
        XCTAssertEqual(status.submissionCount, 1)
        XCTAssertEqual(status.draftWords, 0)
    }

    // ── reverse recommendation (desktop.md §6.1) ─────────────────────────

    private func futureReview() -> ReviewState {
        ReviewState(
            state: .review, repetitions: 2, lapses: 0, intervalDays: 6,
            easeFactor: 2.5, lastReviewedAt: NOW, nextReviewAt: NOW + dayMs
        )
    }

    func testRecommendForTaskRanksWithVisibleReasonsAndNeverAppliedPrecedence() {
        var applied = makeFragment(id: "fA", content: "hawkish pivot 应用过", createdAt: NOW - 5 * dayMs, updatedAt: NOW)
        applied.review = futureReview()
        var fresh = makeFragment(id: "fB", content: "hawkish pivot 未应用", createdAt: NOW - 6 * dayMs, updatedAt: NOW)
        fresh.review = futureReview()
        var overdue = makeFragment(id: "fC", content: "hawkish pivot 已到期", createdAt: NOW - 7 * dayMs, updatedAt: NOW)
        overdue.review = ReviewState(
            state: .review, repetitions: 1, lapses: 0, intervalDays: 1,
            easeFactor: 2.5, lastReviewedAt: NOW - 2 * dayMs, nextReviewAt: NOW - 1000
        )
        var lapse = makeFragment(id: "fD", content: "hawkish pivot 遗忘", createdAt: NOW - 8 * dayMs, updatedAt: NOW)
        lapse.review = ReviewState(
            state: .relearning, repetitions: 0, lapses: 3, intervalDays: 1,
            easeFactor: 2.5, lastReviewedAt: NOW, nextReviewAt: NOW + dayMs
        )
        var unrelated = makeFragment(
            id: "fX", content: "完全无关", excerpt: "完全无关的摘录。",
            sourceUrl: "https://example.com/unrelated", sourceHost: "example.com",
            sourceTitle: nil, createdAt: NOW, updatedAt: NOW
        )
        unrelated.processing.guess = nil
        unrelated.processing.verified?.summary = nil

        let results = recommendForTask(
            "hawkish pivot",
            [applied, fresh, overdue, lapse, unrelated],
            options: RecommendForTaskOptions(
                relatedTo: { id in id == "fA" ? ["r1", "r2", "r3", "r4"] : [] },
                appliedFragmentIds: ["fA"],
                now: NOW
            )
        )

        // All query hits rank; the unrelated fragment is excluded by search.
        XCTAssertEqual(results.map(\.fragment.id), ["fC", "fD", "fA", "fB"])
        XCTAssertTrue(results[0].reason.contains("命中任务主题"))
        XCTAssertTrue(results[0].reason.contains("已到期"))
        XCTAssertTrue(results[1].reason.contains("近期遗忘"))
        XCTAssertTrue(results[2].reason.contains("与已选碎片存在 3 条确认关系"), "relation boost capped at 3")
        XCTAssertTrue(results[3].reason.contains("从未应用"))
        // Reasons join with '；'.
        XCTAssertEqual(results[0].reason.components(separatedBy: "；").first, "命中任务主题")
    }

    func testRecommendForTaskRespectsLimit() {
        let many = (0..<20).map {
            makeFragment(id: "frag_\($0)", content: "hawkish pivot \($0)", createdAt: NOW, updatedAt: NOW)
        }
        XCTAssertEqual(recommendForTask("hawkish", many, options: .init(now: NOW)).count, 8)
        XCTAssertEqual(recommendForTask("hawkish", many, options: .init(limit: 3, now: NOW)).count, 3)
    }

    func testIncorrectlyAppliedFragmentsOutrankCorrectlyAppliedOnes() {
        // R2.3: both applied; g2 was used-but-incorrect → bigger boost.
        let pool = [
            makeFragment(id: "g1", content: "hawkish pivot 正确", tags: ["fed"], createdAt: NOW, updatedAt: NOW),
            makeFragment(id: "g2", content: "hawkish pivot 用错", tags: ["fed"], createdAt: NOW, updatedAt: NOW),
        ]
        let results = recommendForTask(
            "hawkish",
            pool,
            options: RecommendForTaskOptions(
                appliedFragmentIds: ["g1", "g2"],
                incorrectFragmentIds: ["g2"],
                now: NOW
            )
        )
        XCTAssertEqual(results.map(\.fragment.id), ["g2", "g1"])
        XCTAssertTrue(
            results.first { $0.fragment.id == "g2" }?.reason.contains("此前用错") ?? false
        )
        XCTAssertFalse(
            results.first { $0.fragment.id == "g1" }?.reason.contains("从未应用") ?? true,
            "applied fragments keep the never-applied branch off"
        )
    }

    func testIncorrectFragmentIdsDerivation() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f2", "f3"], now: NOW
        ))
        task = appendSubmission(task, "正文", now: NOW + 100)
        task = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: true),
            AssessmentConfirmation(fragmentId: "f2", used: true, correct: false),
            AssessmentConfirmation(fragmentId: "f3", used: false),
        ], now: NOW + 200)
        XCTAssertEqual(incorrectFragmentIds([task]), ["f2"], "only confirmed used-but-incorrect")
        XCTAssertEqual(appliedFragmentIds([task]), ["f1", "f2"])
    }

    // ── question bridge + applied metrics (R2.1/R2.3) ────────────────────

    func testQuestionDraftFromFeedbackUsesWritingTaskSource() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "retrospective", topic: "x", fragmentIds: ["f1"], now: NOW
        ))
        task = appendSubmission(task, "正文", now: NOW + 100)
        let draft = questionDraftFromFeedback(task, f1, "边界条件没说清", now: NOW + 200)

        XCTAssertEqual(draft.kind, "question")
        XCTAssertEqual(draft.sourceUrl, "annhub://writing-task/\(task.id)")
        XCTAssertEqual(draft.detail.status, "open")
        XCTAssertEqual(draft.detail.hypothesis, "边界条件没说清")
        XCTAssertEqual(draft.verified.source, "manual")
        XCTAssertEqual(draft.verified.confirmedAt, NOW + 200)
        XCTAssertEqual(draft.use, "在下次输出同主题任务前先回答这个问题。")
        // excerpt starts with content; both mention the feedback.
        XCTAssertTrue(draft.excerpt.hasPrefix(draft.content))
        XCTAssertTrue(draft.content.contains("hawkish pivot"))
        XCTAssertTrue(draft.content.contains("边界条件没说清"))
        XCTAssertEqual(draft.sourceTitle, task.prompt)

        // The draft produces a valid fragment through the shared factory.
        let record = try! createFragment(CreateFragmentInput(
            kind: draft.kind,
            content: draft.content,
            context: FragmentContextInput(
                excerpt: draft.excerpt,
                sourceUrl: draft.sourceUrl,
                sourceHost: "writing-task",
                sourceTitle: draft.sourceTitle,
                capturedAt: NOW + 200
            ),
            processing: FragmentProcessing(verified: draft.verified, use: draft.use),
            detail: .question(draft.detail),
            now: NOW + 200
        ))
        XCTAssertTrue(validateFragment(record).ok)
    }

    func testWeeklyAppliedNeedsCorrectTrueAndSameISOWeek() throws {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f2"], now: NOW
        ))
        // Submit seconds after capture: guaranteed to sit in NOW's ISO week
        // (NOW is mid-weekday UTC; local ±12h keeps the weekday).
        task = appendSubmission(task, "正文", now: NOW + 60_000)
        task = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: true),
            AssessmentConfirmation(fragmentId: "f2", used: false),
        ], now: NOW + 60_100)
        XCTAssertEqual(weeklyAppliedCounts([task], now: NOW + 60_200)["f1"], 1)
        XCTAssertNil(weeklyAppliedCounts([task], now: NOW + 60_200)["f2"])

        // metrics.md §4 排除：correct 未知或 false 即使 used=true 也不计。
        var unknown = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1"], now: NOW
        ))
        unknown = appendSubmission(unknown, "正文", now: NOW + 60_000)
        unknown = confirmAssessments(unknown, [
            AssessmentConfirmation(fragmentId: "f1", used: true) // correct 未定
        ], now: NOW + 60_100)
        XCTAssertTrue(weeklyAppliedCounts([unknown], now: NOW + 60_200).isEmpty)

        var biased = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1"], now: NOW
        ))
        biased = appendSubmission(biased, "正文", now: NOW + 60_000)
        biased = confirmAssessments(biased, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: false)
        ], now: NOW + 60_100)
        XCTAssertTrue(weeklyAppliedCounts([biased], now: NOW + 60_200).isEmpty)

        // 跨 ISO 周（提交早于本周周一）不计 — mirror of output.test.ts.
        let lastWeek = isoWeekStart(NOW) - dayMs
        var stale = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1"], now: lastWeek - 60_000
        ))
        stale = appendSubmission(stale, "正文", now: lastWeek)
        stale = confirmAssessments(stale, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: true)
        ], now: lastWeek + 100)
        XCTAssertTrue(weeklyAppliedCounts([stale], now: NOW).isEmpty)

        // applied ids / days count any confirmed used (correct-agnostic).
        XCTAssertEqual(appliedFragmentIds([task]), ["f1"])
        XCTAssertEqual(daysToFirstApplication(f1, [task]), 0)
        XCTAssertNil(daysToFirstApplication(f3, [task]), "从未应用 → nil")
    }

    func testIsoWeekStartIsMondayMidnightLocal() {
        let weekStart = isoWeekStart(NOW)
        // Inside the same week: the start precedes NOW and is at most 7 days back.
        XCTAssertLessThanOrEqual(weekStart, NOW)
        XCTAssertGreaterThan(weekStart, NOW - 7 * dayMs)
        // ISO week starts Monday (weekday 2), local midnight.
        let date = Date(timeIntervalSince1970: Double(weekStart) / 1000)
        var calendar = Calendar(identifier: .iso8601)
        calendar.firstWeekday = 2
        XCTAssertEqual(calendar.component(.weekday, from: date), 2, "Monday")
        XCTAssertEqual(calendar.dateComponents([.hour, .minute, .second], from: date).hour, 0)
        // Idempotent: the week start of the week start is itself.
        XCTAssertEqual(isoWeekStart(weekStart + dayMs / 2), weekStart)
    }

    // ── duplicate-fragmentId safety (crash fix) ──────────────────────────

    func testConfirmAssessmentsSurvivesDuplicateAssessmentsLastWins() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1"], now: NOW
        ))
        task = appendSubmission(task, "正文", now: NOW + 100)
        // Duplicate fragmentIds in the last submission must not trap
        // Dictionary(uniqueKeysWithValues:) — last entry wins.
        var last = task.submissions[0]
        last.assessments = [
            FragmentUseAssessment(
                fragmentId: "f1", source: "manual", used: true, correct: true,
                feedback: "第一条", confirmedByUser: true, assessedAt: NOW + 100
            ),
            FragmentUseAssessment(
                fragmentId: "f1", source: "manual", used: false,
                feedback: "第二条", confirmedByUser: true, assessedAt: NOW + 150
            ),
        ]
        task.submissions[0] = last

        let updated = confirmAssessments(task, [
            AssessmentConfirmation(fragmentId: "f1", used: true, correct: false),
        ], now: NOW + 200)
        let merged = updated.submissions[0].assessments
        XCTAssertEqual(merged.count, 1, "duplicates collapse to one entry")
        XCTAssertEqual(merged[0].used, true)
        XCTAssertEqual(merged[0].correct, false)
        XCTAssertEqual(
            merged[0].feedback, "第二条", "the LAST duplicate's fields carry over"
        )
    }

    func testMergeLlmAssessmentsDedupesAndCarriesTaskLevelStrings() {
        var task = createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f3"], now: NOW
        ))
        task = appendSubmission(task, "正文", now: NOW + 100)
        task = seedLocalPresence(task, [f1, f3])
        let duplicated = [
            FragmentUseAssessment(fragmentId: "f1", source: "llm", suggestion: "第一次", assessedAt: NOW),
            FragmentUseAssessment(fragmentId: "f1", source: "llm", suggestion: "第二次", assessedAt: NOW),
            FragmentUseAssessment(fragmentId: "f3", source: "llm", suggestion: "唯一", assessedAt: NOW),
            FragmentUseAssessment(fragmentId: "ghost", source: "llm", suggestion: "未知", assessedAt: NOW),
        ]
        let updated = mergeLlmAssessments(
            task, duplicated,
            overallFeedback: "整体可用，结构需调整",
            suggestedRevision: "建议补充结论段",
            now: NOW + 200
        )
        let last = updated.submissions[0]
        let llmEntries = last.assessments.filter { $0.source == "llm" }
        XCTAssertEqual(llmEntries.count, 2, "duplicates collapse; unknown ids never enter")
        XCTAssertEqual(
            llmEntries.first { $0.fragmentId == "f1" }?.suggestion, "第二次",
            "last duplicate wins"
        )
        XCTAssertEqual(last.overallFeedback, "整体可用，结构需调整")
        XCTAssertEqual(last.suggestedRevision, "建议补充结论段")
        // The local layer survives untouched.
        XCTAssertTrue(last.assessments.contains { $0.fragmentId == "f3" && $0.source == "local" })
    }

    // ── this-week boost requires the first review (output.md §2 #3) ───────

    func testRecentButReviewedFragmentGetsThePlusOneBoost() {
        func reviewed(_ id: String, repetitions: Int) -> FragmentRecord {
            var f = makeFragment(id: id, content: "hawkish pivot \(id)", createdAt: NOW - 2 * dayMs, updatedAt: NOW)
            f.review = ReviewState(
                state: .review, repetitions: repetitions, lapses: 0, intervalDays: 3,
                easeFactor: 2.5, lastReviewedAt: NOW, nextReviewAt: NOW + dayMs
            )
            return f
        }
        let pool = [reviewed("fresh_unreviewed", repetitions: 0), reviewed("fresh_reviewed", repetitions: 1)]
        let results = recommendForTask(
            "hawkish",
            pool,
            options: RecommendForTaskOptions(
                appliedFragmentIds: [], now: NOW
            )
        )
        // Same signals except repetitions: the reviewed one ranks first.
        XCTAssertEqual(results.map(\.fragment.id).first, "fresh_reviewed")
    }

    func testPresenceClueMatchesLongContentByDistinctiveHead() {
        let long = String(repeating: "很长的内容", count: 20) // > 40 UTF-16 units
        XCTAssertTrue(presenceClue(fragmentContent: long, in: "开头是\(long)结尾"))
        XCTAssertFalse(presenceClue(fragmentContent: long, in: "完全没有出现这段文字"))
        // Whitespace runs and case fold before matching.
        XCTAssertTrue(presenceClue(fragmentContent: "Hawkish  Pivot", in: "hawkish\npivot 出现了"))
    }
}
