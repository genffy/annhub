// The hint ladder of a review card (desktop.md §5.3, kinds.md §3/§4; acceptance
// scenario C in examples.md §5): every level's label comes from the kind's card, and
// the text under it comes from that fragment's own fields without running ahead.

import XCTest

@testable import AnnHubCore

final class ReviewHintTests: XCTestCase {
    // ── fixtures: one fully filled fragment per kind ─────────────────────

    private func filled(_ kind: String) -> FragmentRecord {
        switch kind {
        case "excerpt":
            return makeFragment(
                kind: kind, content: "Retries can amplify an outage.",
                excerpt: "Teams learn late that Retries can amplify an outage. Backoff is the usual fix.",
                tags: ["reliability"])
        case "concept":
            return makeFragment(
                kind: kind, content: "Backpressure",
                excerpt: "In streams, Backpressure lets the consumer signal demand upstream.",
                detail: wireObject(
                    ("definition", .string("下游把处理能力回传给上游")),
                    ("boundaries", wireStrings(["不等于固定速率限流"])),
                    ("examples", wireStrings(["Reactive Streams 的 request(n)", "TCP 窗口"])),
                    ("counterExamples", wireStrings(["无界队列"]))),
                tags: ["streams", "flow-control"])
        case "claim":
            return makeFragment(
                kind: kind, content: "Most microservice failures are organizational.",
                excerpt: "As the author puts it: Most microservice failures are organizational, not technical.",
                detail: wireObject(
                    ("stance", .string("uncertain")),
                    ("evidence", wireStrings(["团队边界与部署责任的三个例子", "接口治理案例"])),
                    ("assumptions", wireStrings(["组织结构稳定"]))),
                tags: [])
        case "procedure":
            return makeFragment(
                kind: kind, content: "Production incident triage",
                excerpt: "Triage starts by confirming impact.",
                detail: wireObject(
                    ("steps", wireStrings(["确认影响", "限制扩散", "保存证据", "建立时间线"])),
                    ("prerequisites", wireStrings(["值班权限"])),
                    ("failureModes", wireStrings(["过早重启导致证据丢失"]))),
                tags: [])
        case "decision":
            return makeFragment(
                kind: kind, content: "首版不做实时协作",
                excerpt: "团队讨论后决定：首版不做实时协作，先验证单人本地优先。",
                detail: wireObject(
                    ("rationale", .string("协作会引入账号、权限和冲突复杂度")),
                    ("alternatives", wireStrings(["共享文件", "云工作区"]))),
                tags: [])
        case "question":
            return makeFragment(
                kind: kind, content: "主动加工是否会拉低采集完成率？",
                excerpt: "主动加工是否会拉低采集完成率？待观察。",
                detail: wireObject(
                    ("status", .string("testing")),
                    ("hypothesis", .string("分流能降低放弃率")),
                    ("nextStep", .string("观察 Modal 退出率")),
                    ("evidence", wireStrings(["内测第一周数据", "走查记录"]))),
                tags: [])
        case "visual":
            return makeFragment(
                kind: kind, content: "重试开始后 5 分钟 p99 延迟从 120ms 升到 2s",
                excerpt: "重试开始后 5 分钟 p99 延迟从 120ms 升到 2s，红线标出放大点。",
                detail: wireObject(("attachmentIds", wireStrings(["asset_chart"]))),
                tags: ["latency"])
        case "inspiration":
            return makeFragment(
                kind: kind, content: "提醒应让我看见判断的变化",
                excerpt: "提醒应让我看见判断的变化 — 设计今日页时发现任务计数无法表达理解的演化",
                detail: wireObject(("form", .string("reflection"))), tags: [])
        case "media-clip":
            return makeFragment(
                kind: kind, content: "幂等键应在请求首次落库时生成",
                excerpt: "转写：幂等键应该在请求首次落库的时候生成，并保存到重试窗口结束。",
                detail: wireObject(("startMs", .int(1_040_000)), ("endMs", .int(1_145_000))),
                tags: [])
        default:
            return makeFragment(kind: kind)
        }
    }

    private var allKinds: [String] { REVIEW_QUESTIONS.keys.sorted() }

    // ── structure ────────────────────────────────────────────────────────

    func testEveryKindClimbsFourLevelsLabelledByItsCard() {
        for kind in allKinds {
            let fragment = filled(kind)
            let hints = reviewHints(upTo: 4, for: fragment, lang: .zh)
            XCTAssertEqual(hints.map(\.level), [1, 2, 3, 4], kind)
            XCTAssertEqual(
                hints.map(\.title), reviewQuestion(for: kind, lang: .zh).hints, "\(kind): labels are kinds.md's")
            for hint in hints {
                XCTAssertFalse(
                    hint.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "\(kind) L\(hint.level)")
            }
        }
    }

    func testLevelFourIsTheVerificationForEveryKind() {
        for kind in allKinds {
            let fragment = filled(kind)
            XCTAssertEqual(
                reviewHint(level: 4, for: fragment, lang: .zh).text, verificationHint(fragment, lang: .zh), kind)
        }
    }

    func testUpToLevelOpensTheLadderInOrderAndClamps() {
        let fragment = filled("concept")
        XCTAssertEqual(reviewHints(upTo: 0, for: fragment, lang: .zh), [])
        XCTAssertEqual(reviewHints(upTo: 2, for: fragment, lang: .zh).map(\.level), [1, 2])
        XCTAssertEqual(reviewHints(upTo: 9, for: fragment, lang: .zh).map(\.level), [1, 2, 3, 4])
        XCTAssertEqual(reviewHint(level: 0, for: fragment, lang: .zh).level, 1)
        XCTAssertEqual(reviewHint(level: 9, for: fragment, lang: .zh).level, 4)
    }

    // ── scenario C: the four cards do not look alike ─────────────────────

    func testConceptClaimProcedureDecisionAskAndHintDifferently() {
        let cards = ["concept", "claim", "procedure", "decision"].map(filled)
        XCTAssertEqual(
            Set(cards.map { reviewQuestion(for: $0.kind, lang: .zh).question }).count, 4, "four distinct questions")
        for level in 1...3 {
            let texts = cards.map { reviewHint(level: level, for: $0, lang: .zh).text }
            XCTAssertEqual(Set(texts).count, 4, "L\(level) differs per kind")
            let titles = cards.map { reviewHint(level: level, for: $0, lang: .zh).title }
            XCTAssertEqual(Set(titles).count, level == 3 ? 4 : 4, "L\(level) labels differ per kind")
        }
    }

    // ── what each kind puts under each label ─────────────────────────────

    func testConceptLadder() {
        let fragment = filled("concept")
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "#streams #flow-control")
        let context = reviewHint(level: 2, for: fragment, lang: .zh).text
        XCTAssertTrue(context.contains("WSJ — Fed coverage"), "the source line")
        XCTAssertTrue(context.contains("﹏﹏﹏"), "the term itself is masked")
        XCTAssertFalse(context.contains("Backpressure"))
        let definition = reviewHint(level: 3, for: fragment, lang: .zh).text
        XCTAssertTrue(definition.contains("定义：下游把处理能力回传给上游"))
        XCTAssertTrue(definition.contains("Reactive Streams 的 request(n)"))
        XCTAssertTrue(definition.contains("不等于固定速率限流"))
        XCTAssertTrue(reviewHint(level: 4, for: fragment, lang: .zh).text.contains("已确认"))
    }

    func testConceptKeywordsFallBackToCountsThenToAPrompt() {
        var fragment = filled("concept")
        fragment.tags = []
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "记录了适用边界 1 条、示例 2 个、反例 1 个")
        fragment.detail = wireObject()
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "想想它出现在什么场景、和哪些概念相邻")
        XCTAssertTrue(reviewHint(level: 3, for: fragment, lang: .zh).text.contains("没有记录定义与示例"))
    }

    func testClaimLadder() {
        let fragment = filled("claim")
        let topic = reviewHint(level: 1, for: fragment, lang: .zh).text
        XCTAssertTrue(topic.contains("WSJ — Fed coverage"), "no tags: the source is the topic")
        XCTAssertTrue(topic.contains("你的立场：存疑"))
        let evidence = reviewHint(level: 2, for: fragment, lang: .zh).text
        XCTAssertTrue(evidence.hasPrefix("团队边界与部署责任的三个例子"))
        XCTAssertTrue(evidence.contains("共 2 条证据"))
        XCTAssertEqual(
            reviewHint(level: 3, for: fragment, lang: .zh).text, fragment.context.excerpt, "the original passage")
    }

    func testProcedureLadder() {
        let fragment = filled("procedure")
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "共 4 步，适用条件 1 项")
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, "第 1 步：确认影响")
        let flow = reviewHint(level: 3, for: fragment, lang: .zh).text
        XCTAssertTrue(flow.contains("1. 确认影响\n2. 限制扩散\n3. 保存证据\n4. 建立时间线"))
        XCTAssertTrue(flow.contains("失败模式"))
        XCTAssertTrue(flow.contains("过早重启导致证据丢失"))
    }

    func testDecisionLadder() {
        var fragment = filled("decision")
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "首版不做实时协作")
        let constraints = reviewHint(level: 2, for: fragment, lang: .zh).text
        XCTAssertTrue(constraints.hasPrefix("原文背景："), "no 理解 recorded: the background it came out of")
        fragment.processing.guess = "团队只有两个人，要先验证核心"
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, "你当时推断的约束：团队只有两个人，要先验证核心")
        let rationale = reviewHint(level: 3, for: fragment, lang: .zh).text
        XCTAssertTrue(rationale.contains("协作会引入账号、权限和冲突复杂度"))
        XCTAssertTrue(rationale.contains("备选项：共享文件、云工作区"))
    }

    func testQuestionLadder() {
        var fragment = filled("question")
        XCTAssertTrue(reviewHint(level: 1, for: fragment, lang: .zh).text.contains("状态：验证中"))
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, "走查记录", "the most recent evidence")
        let conclusion = reviewHint(level: 3, for: fragment, lang: .zh).text
        XCTAssertTrue(conclusion.contains("当前假设：分流能降低放弃率"))
        XCTAssertTrue(conclusion.contains("下一步验证：观察 Modal 退出率"))

        fragment.detail = wireObject(("status", .string("answered")), ("answer", .string("会，约下降 8%")))
        XCTAssertEqual(reviewHint(level: 3, for: fragment, lang: .zh).text, "结论：会，约下降 8%")
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, "还没有记录证据")
    }

    func testVisualLadderRevealsTheOriginalImageOnlyAtLevelThree() {
        let fragment = filled("visual")
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "#latency")
        XCTAssertNil(reviewHint(level: 1, for: fragment, lang: .zh).assetId)
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, fragment.content, "the user's description")
        XCTAssertNil(reviewHint(level: 2, for: fragment, lang: .zh).assetId)
        let original = reviewHint(level: 3, for: fragment, lang: .zh)
        XCTAssertEqual(original.assetId, "asset_chart")
        XCTAssertEqual(original.text, "原图见下方")
        XCTAssertNil(reviewHint(level: 4, for: fragment, lang: .zh).assetId)

        var untagged = fragment
        untagged.tags = []
        XCTAssertEqual(reviewHint(level: 1, for: untagged, lang: .zh).text, "共 1 张图")
    }

    func testInspirationLadder() {
        var fragment = filled("inspiration")
        XCTAssertEqual(
            reviewHint(level: 1, for: fragment, lang: .zh).text, "设计今日页时发现任务计数无法表达理解的演化",
            "the trigger background is what follows the idea inside the excerpt")
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, fragment.content)
        XCTAssertEqual(reviewHint(level: 3, for: fragment, lang: .zh).text, "没有后续修订")
        fragment.captureRevision = 3
        XCTAssertEqual(reviewHint(level: 3, for: fragment, lang: .zh).text, "此后修订过 2 次（现为第 3 版）")

        fragment.context.excerpt = fragment.content
        XCTAssertEqual(reviewHint(level: 1, for: fragment, lang: .zh).text, "没有记录触发背景")
    }

    func testMediaClipLadder() {
        let fragment = filled("media-clip")
        XCTAssertTrue(reviewHint(level: 1, for: fragment, lang: .zh).text.contains("wsj.com"))
        XCTAssertEqual(reviewHint(level: 2, for: fragment, lang: .zh).text, fragment.content)
        let clip = reviewHint(level: 3, for: fragment, lang: .zh).text
        XCTAssertTrue(clip.hasPrefix("17:20 – 19:05"), clip)
        XCTAssertTrue(clip.contains("转写：幂等键应该"))
    }

    func testExcerptLadder() {
        let fragment = filled("excerpt")
        XCTAssertTrue(reviewHint(level: 1, for: fragment, lang: .zh).text.contains("wsj.com"))
        let surrounding = reviewHint(level: 2, for: fragment, lang: .zh).text
        XCTAssertTrue(surrounding.contains("﹏﹏﹏"))
        XCTAssertFalse(surrounding.contains("Retries can amplify"))
        XCTAssertEqual(reviewHint(level: 3, for: fragment, lang: .zh).text, "Retries can amplify an outage.")
    }

    // ── the ladder actually climbs ───────────────────────────────────────

    func testNoLevelRunsAheadOfItsLabel() {
        let concept = filled("concept")
        XCTAssertFalse(reviewHints(upTo: 2, for: concept, lang: .zh).map(\.text).joined().contains("下游把处理能力回传给上游"))

        let procedure = filled("procedure")
        let early = reviewHints(upTo: 2, for: procedure, lang: .zh).map(\.text).joined(separator: "\n")
        XCTAssertFalse(early.contains("限制扩散"), "step two is for the full flow")
        XCTAssertFalse(early.contains("过早重启"), "failure modes are for the full flow")

        let decision = filled("decision")
        XCTAssertFalse(reviewHints(upTo: 2, for: decision, lang: .zh).map(\.text).joined().contains("账号、权限"))

        let claim = filled("claim")
        XCTAssertFalse(
            reviewHints(upTo: 2, for: claim, lang: .zh).map(\.text).joined().contains("not technical"),
            "the original passage is for L3")
    }

    func testTheAnswerIsMaskedWhereTheExcerptIsShownEarly() {
        for kind in ["excerpt", "concept"] {
            let fragment = filled(kind)
            let early = reviewHints(upTo: 2, for: fragment, lang: .zh).map(\.text).joined(separator: "\n")
            XCTAssertFalse(early.contains(fragment.content), "\(kind) must not show its content before L3")
        }
    }

    // ── L4 and fallbacks ─────────────────────────────────────────────────

    func testVerificationHintShowsTheContextWhenThereIsNoSummary() {
        var fragment = filled("concept")
        fragment.processing.verified = VerifiedResult(confirmedAt: NOW, source: "manual")
        let hint = verificationHint(fragment, lang: .zh)
        XCTAssertTrue(hint.contains("来源：手工核对"), "the label, not the raw 'manual'")
        XCTAssertTrue(hint.contains("已确认，无摘要 — 回看原始语境："))
        XCTAssertTrue(hint.contains(fragment.context.excerpt))

        fragment.processing.verified?.summary = "对照了定义与边界"
        XCTAssertTrue(verificationHint(fragment, lang: .zh).contains("摘要：对照了定义与边界"))
    }

    func testAnUnknownKindStillGetsALadder() {
        var fragment = filled("concept")
        fragment.kind = "future-kind"
        let hints = reviewHints(upTo: 4, for: fragment, lang: .zh)
        XCTAssertEqual(hints.count, 4)
        XCTAssertEqual(hints.map(\.title), ["主题", "上下文", "原文", "核验确认"])
        XCTAssertTrue(hints.allSatisfy { !$0.text.isEmpty })
    }

    // ── the same ladder in English ───────────────────────────────────────

    func testTheLadderSpeaksEnglishToo() {
        var concept = filled("concept")
        concept.tags = []
        XCTAssertEqual(
            reviewHint(level: 1, for: concept, lang: .en).text, "Recorded: 1 boundary, 2 examples, 1 counterexample")
        XCTAssertEqual(reviewHint(level: 1, for: concept, lang: .en).title, "Keywords")
        let definition = reviewHint(level: 3, for: concept, lang: .en).text
        XCTAssertTrue(definition.hasPrefix("Definition: 下游把处理能力回传给上游"), definition)
        XCTAssertTrue(definition.contains("Examples:\n· Reactive Streams"), definition)
        XCTAssertTrue(definition.contains("Boundaries:\n· 不等于固定速率限流"), definition)
        concept.detail = wireObject()
        XCTAssertEqual(
            reviewHint(level: 1, for: concept, lang: .en).text,
            "Think about the situations it shows up in and which concepts sit next to it")

        XCTAssertTrue(reviewHint(level: 1, for: filled("claim"), lang: .en).text.contains("Your stance: Uncertain"))
        XCTAssertTrue(reviewHint(level: 2, for: filled("claim"), lang: .en).text.contains("(2 pieces of evidence"))

        let procedure = filled("procedure")
        XCTAssertEqual(reviewHint(level: 1, for: procedure, lang: .en).text, "4 steps, 1 precondition")
        XCTAssertEqual(reviewHint(level: 2, for: procedure, lang: .en).text, "Step 1: 确认影响")
        XCTAssertTrue(reviewHint(level: 3, for: procedure, lang: .en).text.contains("Failure modes:\n· 过早重启"))

        var decision = filled("decision")
        XCTAssertTrue(reviewHint(level: 2, for: decision, lang: .en).text.hasPrefix("Original background: "))
        decision.processing.guess = "只有两个人"
        XCTAssertEqual(
            reviewHint(level: 2, for: decision, lang: .en).text, "The constraint you inferred then: 只有两个人")
        XCTAssertTrue(reviewHint(level: 3, for: decision, lang: .en).text.contains("Alternatives: 共享文件, 云工作区"))

        var question = filled("question")
        XCTAssertTrue(reviewHint(level: 1, for: question, lang: .en).text.contains("Status: Testing"))
        question.detail = wireObject(("status", .string("answered")), ("answer", .string("yes")))
        XCTAssertEqual(reviewHint(level: 3, for: question, lang: .en).text, "Conclusion: yes")
        XCTAssertEqual(reviewHint(level: 2, for: question, lang: .en).text, "No evidence has been recorded yet")

        let visual = filled("visual")
        XCTAssertEqual(reviewHint(level: 3, for: visual, lang: .en).text, "The original image is shown below")
        var untagged = visual
        untagged.tags = []
        XCTAssertEqual(reviewHint(level: 1, for: untagged, lang: .en).text, "1 image")

        var inspiration = filled("inspiration")
        XCTAssertEqual(reviewHint(level: 3, for: inspiration, lang: .en).text, "No later revisions")
        inspiration.captureRevision = 3
        XCTAssertEqual(
            reviewHint(level: 3, for: inspiration, lang: .en).text, "Revised 2 times since (now version 3)")
        inspiration.captureRevision = 2
        XCTAssertEqual(reviewHint(level: 3, for: inspiration, lang: .en).text, "Revised 1 time since (now version 2)")
    }

    func testTheSourceLineQuotesTheTitleTheWayEachLanguageDoes() {
        var fragment = filled("excerpt")
        fragment.context.sourceTitle = "Fed coverage"
        XCTAssertEqual(
            reviewHint(level: 1, for: fragment, lang: .zh).text, "《Fed coverage》· \(fragment.context.sourceHost)")
        XCTAssertEqual(
            reviewHint(level: 1, for: fragment, lang: .en).text, "“Fed coverage” · \(fragment.context.sourceHost)")
    }

    func testEveryKindHasAnEnglishLadderWithTheSameShape() {
        for kind in allKinds {
            let fragment = filled(kind)
            let english = reviewHints(upTo: 4, for: fragment, lang: .en)
            XCTAssertEqual(english.map(\.level), [1, 2, 3, 4], kind)
            XCTAssertEqual(english.map(\.title), reviewQuestion(for: kind, lang: .en).hints, kind)
            XCTAssertTrue(english.allSatisfy { !$0.text.isEmpty }, kind)
        }
    }

    func testSourceLabelsAreUserFacing() {
        XCTAssertEqual(verifiedSourceLabel("source-material", lang: .zh), "原文材料")
        XCTAssertEqual(verifiedSourceLabel("manual", lang: .zh), "手工核对")
        XCTAssertEqual(verifiedSourceLabel("llm", lang: .zh), "模型建议（已确认）")
        XCTAssertEqual(verifiedSourceLabel("other", lang: .zh), "other")
        XCTAssertEqual(verifiedSourceLabel("source-material", lang: .en), "Source material")
        XCTAssertEqual(verifiedSourceLabel("manual", lang: .en), "Manual check")
        XCTAssertEqual(verifiedSourceLabel("llm", lang: .en), "Model suggestion (confirmed)")
    }
}
