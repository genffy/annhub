// LLM output feedback (docs/v2/ai.md): prompt v2 contract, strict envelope
// parsing incl. the optional task-level strings, duplicate-fragmentId
// safety, pre-send preview parity with the actual request, and the
// (task, submission, promptVersion, modelId) result cache with a mock
// provider.

import XCTest
@testable import AnnHubCore

final class LlmFeedbackTests: XCTestCase {
    private var fragments: [FragmentRecord] {
        [makeFragment(id: "f1"), makeFragment(id: "f2", content: "量化宽松")]
    }

    private var task: WritingTaskRecord {
        createWritingTask(CreateWritingTaskInput(
            taskType: "article", topic: "x", fragmentIds: ["f1", "f2"], now: NOW
        ))
    }

    private var submission: OutputSubmission {
        OutputSubmission(
            id: "sub_1", content: "正文中提到了 hawkish pivot。", submittedAt: NOW, assessments: []
        )
    }

    // ── prompt contract (v2) ─────────────────────────────────────────────

    func testPromptVersionIsV2AndExampleJSONIsBalanced() throws {
        XCTAssertEqual(outputFeedbackPromptVersion, "output-feedback-v2")
        let provider = OpenAICompatibleLlmFeedback(config: LlmProviderConfig(
            baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "test-model"
        ))
        let request = try provider.buildRequest(task: task, fragments: fragments, submission: submission)
        let body = try XCTUnwrap(request.httpBody)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        )
        let messages = try XCTUnwrap(object["messages"] as? [[String: Any]])
        let system = try XCTUnwrap(messages.first { $0["role"] as? String == "system" }?["content"] as? String)
        // The v1 stray '}' is gone — the example's braces balance.
        XCTAssertEqual(system.filter { $0 == "{" }.count, system.filter { $0 == "}" }.count)
        XCTAssertTrue(system.contains("overallFeedback"), "v2 invites the task-level strings")
        XCTAssertTrue(system.contains("suggestedRevision"))
        XCTAssertFalse(system.contains("}]}}"), "no doubled closing brace")
        // Version pinned per result.
        XCTAssertEqual(provider.promptVersion, "output-feedback-v2")
    }

    // ── strict parsing (ai.md §3) ────────────────────────────────────────

    private func parse(_ json: String) throws -> Result<LlmFeedbackResult, LlmFeedbackError> {
        try parseLlmFeedbackResponse(
            Data(json.utf8),
            task: task,
            fragments: fragments,
            submissionContent: submission.content,
            modelId: "test-model",
            now: NOW
        )
    }

    func testParseV2EnvelopeWithTaskLevelStringsAndUnknownKeysIgnored() throws {
        let result = try parse("""
        {"assessments":[{"fragmentId":"f1","used":true,"correct":true,"suggestion":"引用到位",
                         "unknownField":"ignored"}],
         "overallFeedback":"整体结构清晰",
         "suggestedRevision":"建议补充数据来源",
         "somethingElse":42}
        """)
        guard case .success(let feedback) = result else {
            return XCTFail("expected success, got \(result)")
        }
        XCTAssertEqual(feedback.assessments.count, 1)
        XCTAssertEqual(feedback.assessments[0].fragmentId, "f1")
        XCTAssertEqual(feedback.assessments[0].modelId, "test-model")
        XCTAssertEqual(feedback.assessments[0].promptVersion, "output-feedback-v2")
        XCTAssertEqual(feedback.overallFeedback, "整体结构清晰")
        XCTAssertEqual(feedback.suggestedRevision, "建议补充数据来源")
    }

    func testParseTaskLevelStringsOptional() throws {
        let result = try parse("""
        {"assessments":[{"fragmentId":"f1","used":null,"correct":null,"suggestion":null}]}
        """)
        guard case .success(let feedback) = result else {
            return XCTFail("expected success, got \(result)")
        }
        XCTAssertNil(feedback.overallFeedback)
        XCTAssertNil(feedback.suggestedRevision)
    }

    func testParseDeduplicatesFragmentIdsLastWinsAndFiltersUnknown() throws {
        let result = try parse("""
        {"assessments":[{"fragmentId":"f1","used":true,"suggestion":"第一"},
                         {"fragmentId":"ghost","used":true,"suggestion":"未知"},
                         {"fragmentId":"f1","used":false,"suggestion":"第二"},
                         {"fragmentId":"f2","used":true,"suggestion":"唯一"}]}
        """)
        guard case .success(let feedback) = result else {
            return XCTFail("expected success, got \(result)")
        }
        XCTAssertEqual(feedback.assessments.map(\.fragmentId), ["f1", "f2"])
        XCTAssertEqual(
            feedback.assessments.first { $0.fragmentId == "f1" }?.suggestion, "第二",
            "last duplicate wins"
        )
    }

    func testParseRejectsEmptyOrAllUnknownShapes() throws {
        if case .success = try parse("{\"assessments\":[]}") {
            XCTFail("empty assessments must be .schema")
        }
        if case .success = try parse("{\"assessments\":[{\"fragmentId\":\"ghost\"}]}") {
            XCTFail("only-unknown ids must be .schema")
        }
        if case .success = try parse("not json at all") {
            XCTFail("invalid JSON must be .parse")
        }
    }

    func testStripCodeFence() {
        let provider = OpenAICompatibleLlmFeedback(config: LlmProviderConfig())
        XCTAssertEqual(provider.stripCodeFence("```json\n{\"a\":1}\n```"), "{\"a\":1}")
        XCTAssertEqual(provider.stripCodeFence("  {\"a\":1}  "), "{\"a\":1}")
    }

    // ── pre-send preview parity (ai.md §5) ───────────────────────────────

    func testPreviewMatchesExactlyWhatTheRequestSends() throws {
        let preview = buildLlmFeedbackPreview(task: task, fragments: fragments, submission: submission)
        XCTAssertEqual(preview.taskPrompt, task.prompt)
        XCTAssertEqual(preview.submissionContent, submission.content)
        XCTAssertEqual(preview.targets.map(\.fragmentId), ["f1", "f2"])
        // Deleted/missing targets drop out of the preview.
        let partial = buildLlmFeedbackPreview(
            task: task, fragments: [fragments[0]], submission: submission
        )
        XCTAssertEqual(partial.targets.map(\.fragmentId), ["f1"])

        // The actual outgoing request carries exactly the preview fields:
        // task prompt, each target's content+kind, submission text — nothing
        // else from the fragments (no tags/excerpt/review).
        let provider = OpenAICompatibleLlmFeedback(config: LlmProviderConfig(
            baseUrl: "https://api.example.com/v1", apiKey: "sk-test", model: "test-model"
        ))
        let request = try provider.buildRequest(task: task, fragments: fragments, submission: submission)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody))) as? [String: Any]
        )
        let messages = try XCTUnwrap(object["messages"] as? [[String: Any]])
        let user = try XCTUnwrap(messages.first { $0["role"] as? String == "user" }?["content"] as? String)
        XCTAssertTrue(user.contains(preview.taskPrompt))
        XCTAssertTrue(user.contains(preview.submissionContent))
        for target in preview.targets {
            XCTAssertTrue(user.contains("\"content\":\(jsonString(target.content))"))
            XCTAssertTrue(user.contains("\"kind\":\(jsonString(target.kind))"))
            XCTAssertTrue(user.contains("\"fragmentId\":\(jsonString(target.fragmentId))"))
        }
        // No extra fragment fields ride along (minimal egress, ai.md §2).
        XCTAssertFalse(user.contains("excerpt"))
        XCTAssertFalse(user.contains("nextReviewAt"))
        XCTAssertFalse(user.contains("tags"))
    }

    // ── result cache (ai.md §6) ──────────────────────────────────────────

    func testCacheReusesResultAndInvalidatesOnNewSubmission() async throws {
        final class CountingMockProvider: LlmFeedbackProviding, @unchecked Sendable {
            private(set) var calls = 0
            let result = LlmFeedbackResult(
                assessments: [
                    FragmentUseAssessment(
                        fragmentId: "f1", source: "llm", used: true,
                        suggestion: "建议", assessedAt: NOW
                    ),
                ],
                overallFeedback: "整体反馈",
                suggestedRevision: "修改建议"
            )

            func provide(
                task: WritingTaskRecord, fragments: [FragmentRecord], submission: OutputSubmission
            ) async -> Result<LlmFeedbackResult, LlmFeedbackError> {
                calls += 1
                return .success(result)
            }
        }

        let provider = CountingMockProvider()
        let cache = LlmFeedbackCache()
        let promptVersion = outputFeedbackPromptVersion
        let modelId = "test-model"
        // One stable task — the cache key includes task.id.
        let task = self.task

        // First click — provider called, result cached.
        let first = await fetchLlmFeedback(
            task: task, fragments: fragments, submission: submission,
            promptVersion: promptVersion, modelId: modelId,
            cache: cache, provider: provider
        )
        XCTAssertEqual(provider.calls, 1)
        guard case .success(let firstResult) = first else { return XCTFail() }
        XCTAssertEqual(firstResult.overallFeedback, "整体反馈")

        // Repeated clicks on the SAME submission — cache hit, no re-call.
        for _ in 0..<3 {
            let again = await fetchLlmFeedback(
                task: task, fragments: fragments, submission: submission,
                promptVersion: promptVersion, modelId: modelId,
                cache: cache, provider: provider
            )
            guard case .success(let cached) = again else { return XCTFail() }
            XCTAssertEqual(cached, firstResult)
        }
        XCTAssertEqual(provider.calls, 1, "repeated clicks never re-call the provider")

        // Different model/prompt version → different key → re-called.
        _ = await fetchLlmFeedback(
            task: task, fragments: fragments, submission: submission,
            promptVersion: promptVersion, modelId: "other-model",
            cache: cache, provider: provider
        )
        XCTAssertEqual(provider.calls, 2)

        // A NEW submission invalidates the task's entries.
        let newSubmission = OutputSubmission(
            id: "sub_2", content: "第二版正文", submittedAt: NOW + 100, assessments: []
        )
        _ = await fetchLlmFeedback(
            task: task, fragments: fragments, submission: newSubmission,
            promptVersion: promptVersion, modelId: modelId,
            cache: cache, provider: provider
        )
        XCTAssertEqual(provider.calls, 3, "new submission misses the cache")

        // Explicit invalidation (submit path) drops the task's entries.
        cache.invalidateTask(taskId: task.id)
        _ = await fetchLlmFeedback(
            task: task, fragments: fragments, submission: newSubmission,
            promptVersion: promptVersion, modelId: modelId,
            cache: cache, provider: provider
        )
        XCTAssertEqual(provider.calls, 4)
    }

    func testCacheStoresOnlySuccesses() async throws {
        final class FailingMockProvider: LlmFeedbackProviding, @unchecked Sendable {
            private(set) var calls = 0
            func provide(
                task: WritingTaskRecord, fragments: [FragmentRecord], submission: OutputSubmission
            ) async -> Result<LlmFeedbackResult, LlmFeedbackError> {
                calls += 1
                return .failure(.network)
            }
        }
        let provider = FailingMockProvider()
        let cache = LlmFeedbackCache()
        for _ in 0..<2 {
            _ = await fetchLlmFeedback(
                task: task, fragments: fragments, submission: submission,
                promptVersion: outputFeedbackPromptVersion, modelId: "m",
                cache: cache, provider: provider
            )
        }
        XCTAssertEqual(provider.calls, 2, "failures are never cached — retry stays possible")
    }
}
