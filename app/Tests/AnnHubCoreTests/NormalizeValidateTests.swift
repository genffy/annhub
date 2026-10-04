// Normalization + validation gates — mirrors learning-core/normalize.ts and
// validate.ts (docs/v2/fragments.md §6/§7, storage.md §3.3 relations).

import XCTest
@testable import AnnHubCore

final class NormalizeValidateTests: XCTestCase {
    // ── normalization ────────────────────────────────────────────────────

    func testNormalizeOrderAndRules() {
        XCTAssertEqual(normalizeContent("  ‘Hello’—World!!  "), "hello'-world")
        XCTAssertEqual(normalizeContent("ＦＥＤ  ＳＴＡＮＣＥ"), "fed stance")
        XCTAssertEqual(normalizeContent("co‑op\tand\n\u{00A0}café"), "co-op and café")
        XCTAssertEqual(normalizeContent("“quoted” text…"), "quoted\" text")
        XCTAssertEqual(normalizeContent("!!!"), "")
    }

    func testNormalizeHostStripsOnlyWww() {
        XCTAssertEqual(normalizeHost(url: "https://WWW.Wsj.com/articles/x"), "wsj.com")
        XCTAssertEqual(normalizeHost(url: "https://mobile.twitter.com/post"), "mobile.twitter.com")
        XCTAssertNil(normalizeHost(url: "not a url"))
    }

    func testDedupeKeyUsesNulSeparator() {
        let key = dedupeKeyOf(content: "Hawkish  Pivot", sourceUrl: "https://a.com/x", excerpt: "…hawkish pivot…")
        XCTAssertTrue(key.contains("\u{0}"))
        XCTAssertEqual(key.components(separatedBy: "\u{0}").count, 3)
        XCTAssertEqual(key.components(separatedBy: "\u{0}")[0], "hawkish pivot")
    }

    func testDedupeTagsLowercaseTrimCap20() {
        XCTAssertEqual(dedupeTags(["Fed", " fed ", "MACRO", ""]), ["fed", "macro"])
        XCTAssertEqual(dedupeTags((1...25).map { "tag\($0)" }).count, 20)
    }

    // ── kind registry ───────────────────────────────────────────────────

    func testWrongSchemaVersion() {
        var f = makeFragment()
        f.schemaVersion = 3
        expectedValidationError(f, code: .schemaVersionUnsupported)
    }

    func testUnregisteredKind() {
        let f = makeFragment(kind: "bogus")
        expectedValidationError(f, code: .kindNotRegistered)
    }

    func testMediaClipEnabledDetailValidated() {
        XCTAssertTrue(registeredFragmentKinds.contains("media-clip"))
        XCTAssertTrue(enabledFragmentKinds.contains("media-clip"))

        let valid = makeFragment(
            kind: "media-clip",
            locator: .time(startMs: 12000, endMs: 45000),
            detail: wireObject(("startMs", .int(12000)), ("endMs", .int(45000)))
        )
        XCTAssertTrue(validateFragment(valid).ok)

        // Media time ranges start at zero (fragments.md §5): startMs = 0 is a
        // valid range in BOTH the locator and the detail.
        let fromZero = makeFragment(
            kind: "media-clip",
            locator: .time(startMs: 0, endMs: 45000),
            detail: wireObject(("startMs", .int(0)), ("endMs", .int(45000)))
        )
        XCTAssertTrue(validateFragment(fromZero).ok)

        // startMs == endMs still fails — via the locator first (45000/45000)…
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 45000, endMs: 45000),
                detail: wireObject(("startMs", .int(45000)), ("endMs", .int(45000)))
            ),
            code: .locatorInvalid
        )
        // …and via the detail alone (locator fine): equal range, and 0/0
        // (endMs must stay strictly positive).
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 12000, endMs: 45000),
                detail: wireObject(("startMs", .int(45000)), ("endMs", .int(45000)))
            ),
            code: .detailFieldInvalid
        )
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 12000, endMs: 45000),
                detail: wireObject(("startMs", .int(0)), ("endMs", .int(0)))
            ),
            code: .detailFieldInvalid
        )
        // Negative startMs is out of range even though the range is ordered.
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 12000, endMs: 45000),
                detail: wireObject(("startMs", .int(-1000)), ("endMs", .int(45000)))
            ),
            code: .detailFieldInvalid
        )
        // Non-numeric values are rejected the same way.
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 12000, endMs: 45000),
                detail: wireObject(("startMs", .string("soon")), ("endMs", .int(45000)))
            ),
            code: .detailFieldInvalid
        )
        // attachmentIds reuse the visual validator when present.
        expectedValidationError(
            makeFragment(
                kind: "media-clip",
                locator: .time(startMs: 12000, endMs: 45000),
                detail: wireObject(
                    ("startMs", .int(12000)), ("endMs", .int(45000)),
                    ("attachmentIds", wireStrings([]))
                )
            ),
            code: .visualAttachmentRequired
        )
        let withAttachment = makeFragment(
            kind: "media-clip",
            locator: .time(startMs: 12000, endMs: 45000),
            detail: wireObject(
                ("startMs", .int(12000)), ("endMs", .int(45000)),
                ("attachmentIds", wireStrings(["asset_fix1"]))
            )
        )
        XCTAssertTrue(validateFragment(withAttachment).ok)
        XCTAssertEqual(withAttachment.attachmentIds, ["asset_fix1"])
    }

    // ── base ranges ─────────────────────────────────────────────────────

    func testContentGates() {
        var f = makeFragment(content: "   ")
        f.normalizedContent = ""
        expectedValidationError(f, code: .contentRequired)

        f = makeFragment(content: String(repeating: "a", count: 501))
        f.normalizedContent = normalizeContent(f.content)
        f.context.excerpt = f.content
        expectedValidationError(f, code: .contentTooLong)

        f = makeFragment(content: "bad\u{07}control")
        f.normalizedContent = normalizeContent(f.content)
        f.context.excerpt = "bad control \(f.content)"
        expectedValidationError(f, code: .textControlChars)
    }

    func testCaptureRevisionInvalid() {
        var f = makeFragment()
        f.captureRevision = 0
        expectedValidationError(f, code: .captureRevisionInvalid)
    }

    func testSourceUrlAndHost() {
        var f = makeFragment(sourceUrl: "not a url", sourceHost: "")
        expectedValidationError(f, code: .sourceUrlInvalid)

        f = makeFragment(sourceHost: "ft.com")
        expectedValidationError(f, code: .sourceHostMismatch)

        // Local sources: annhub://manual/<id> with host 'manual'.
        f = makeFragment(sourceUrl: "annhub://manual/abc_1", sourceHost: "manual")
        XCTAssertTrue(validateFragment(f).ok)
        f = makeFragment(sourceUrl: "annhub://manual/bad!id", sourceHost: "manual")
        expectedValidationError(f, code: .sourceUrlInvalid)
        f = makeFragment(sourceUrl: "annhub://manual/abc_1", sourceHost: "wsj.com")
        expectedValidationError(f, code: .sourceHostMismatch)
        // The output workshop's local source left the contract (D-10).
        f = makeFragment(sourceUrl: "annhub://writing-task/t1", sourceHost: "writing-task")
        expectedValidationError(f, code: .sourceUrlInvalid)
    }

    func testTagLimits() {
        var f = makeFragment(tags: [String(repeating: "t", count: 33)])
        expectedValidationError(f, code: .tagInvalid)

        f = makeFragment(tags: (1...21).map { "tag\($0)" })
        expectedValidationError(f, code: .tagsTooMany)
    }

    func testTimestampInvalid() {
        var f = makeFragment()
        f.createdAt = 0
        expectedValidationError(f, code: .timestampInvalid)
    }

    // ── normalized / excerpt ────────────────────────────────────────────

    func testNormalizedMismatch() {
        var f = makeFragment()
        f.normalizedContent = "something else"
        expectedValidationError(f, code: .normalizedMismatch)
    }

    func testExcerptGates() {
        var f = makeFragment(excerpt: "   ")
        expectedValidationError(f, code: .excerptRequired)

        f = makeFragment(excerpt: String(repeating: "e", count: 2001) + " hawkish pivot")
        expectedValidationError(f, code: .excerptTooLong)

        // Normalized excerpt must contain normalizedContent.
        f = makeFragment(excerpt: "Investors rotated out of bonds after the Fed signalled a dovish pivot on rates.")
        expectedValidationError(f, code: .excerptMissingContent)
    }

    // ── locator ─────────────────────────────────────────────────────────

    func testLocatorImageRectBounds() {
        var f = makeFragment(locator: .image(assetId: "asset_fix1", rect: [0.5, 0, 0.7, 0.2]))
        expectedValidationError(f, code: .locatorInvalid)

        f = makeFragment(locator: .image(assetId: "asset_fix1", rect: [0, 0, 0, 1]))
        expectedValidationError(f, code: .locatorInvalid)

        f = makeFragment(locator: .image(assetId: "asset_fix1", rect: [0, 0, 1, 1]))
        XCTAssertTrue(validateFragment(f).ok)
    }

    func testLocatorTimeAndPage() {
        var f = makeFragment(locator: .time(startMs: 5000, endMs: 5000))
        expectedValidationError(f, code: .locatorInvalid)

        f = makeFragment(locator: .time(startMs: 5000, endMs: 9000))
        XCTAssertTrue(validateFragment(f).ok)

        f = makeFragment(locator: .page(pageNumber: 0, rect: nil))
        expectedValidationError(f, code: .locatorInvalid)

        f = makeFragment(locator: .page(pageNumber: 2, rect: [0.1, 0.1, 0.5, 0.5]))
        XCTAssertTrue(validateFragment(f).ok)
    }

    // ── verification ────────────────────────────────────────────────────

    func testVerifiedRequired() {
        var f = makeFragment()
        f.processing.verified = nil
        expectedValidationError(f, code: .verifiedRequired)

        f = makeFragment()
        f.processing.verified = VerifiedResult(confirmedAt: 0, source: "manual")
        expectedValidationError(f, code: .verifiedRequired)

        f = makeFragment()
        f.processing.verified = VerifiedResult(confirmedAt: NOW, source: "vibe")
        expectedValidationError(f, code: .verifiedSourceInvalid)
    }

    func testLlmMetaRequiredAndNoBasedOnModel() {
        var f = makeFragment()
        f.processing.verified = VerifiedResult(confirmedAt: NOW, source: "llm")
        expectedValidationError(f, code: .verifiedLlmMetaRequired)

        f.processing.verified = VerifiedResult(
            confirmedAt: NOW, source: "llm",
            modelId: "gpt-x", promptVersion: "p1",
            basedOnModel: ModelMeta(modelId: "gpt-y", promptVersion: "p0")
        )
        expectedValidationError(f, code: .verifiedBasedOnModelInvalid)
    }

    func testBasedOnModelValidWithManual() {
        var f = makeFragment()
        f.processing.verified = VerifiedResult(
            confirmedAt: NOW, source: "manual",
            basedOnModel: ModelMeta(modelId: "gpt-y", promptVersion: "p0")
        )
        XCTAssertTrue(validateFragment(f).ok)

        f.processing.verified = VerifiedResult(
            confirmedAt: NOW, source: "manual",
            basedOnModel: ModelMeta(modelId: " ", promptVersion: "p0")
        )
        expectedValidationError(f, code: .verifiedBasedOnModelInvalid)
    }

    // ── use ─────────────────────────────────────────────────────────────

    func testUseGates() {
        var f = makeFragment(use: "  ")
        expectedValidationError(f, code: .useRequired)

        f = makeFragment(use: String(repeating: "用", count: 5001))
        expectedValidationError(f, code: .useTooLong)

        f = makeFragment(use: " hawkish pivot ")
        expectedValidationError(f, code: .useCopiesContent)

        f = makeFragment(use: makeFragment().context.excerpt)
        expectedValidationError(f, code: .useCopiesExcerpt)
    }

    func testChineseShortUseIsValid() {
        // No per-language token thresholds — any non-copy use passes.
        let f = makeFragment(use: "复盘用")
        XCTAssertTrue(validateFragment(f).ok)
    }

    // ── review state ────────────────────────────────────────────────────

    func testReviewStateInvalid() {
        var f = makeFragment()
        f.review.easeFactor = 1.0
        expectedValidationError(f, code: .reviewStateInvalid)

        f = makeFragment()
        f.review.repetitions = -1
        expectedValidationError(f, code: .reviewStateInvalid)

        // 'learning' stays a legal compatibility state.
        f = makeFragment()
        f.review.state = .learning
        XCTAssertTrue(validateFragment(f).ok)
    }

    // ── detail per kind ─────────────────────────────────────────────────

    func testDetailKindMismatch() {
        var f = makeFragment(detail: .array([]))
        expectedValidationError(f, code: .detailKindMismatch)

        f = makeFragment(detail: .null)
        expectedValidationError(f, code: .detailKindMismatch)
    }

    func testDetailFieldInvalidOnLongNote() {
        let f = makeFragment(kind: "excerpt", detail: wireObject(("note", .string(String(repeating: "n", count: 2001)))))
        expectedValidationError(f, code: .detailFieldInvalid)
    }

    func testAllEnabledKindsValid() {
        for kind in enabledFragmentKinds {
            let f = makeFragmentOf(kind: kind)
            XCTAssertTrue(validateFragment(f).ok, "kind \(kind) should be valid")
        }
    }

    func testClaimStanceIsOptionalButMustBeKnownWhenPresent() {
        // fragments.md §4: the data layer allows an empty stance (the capture form asks for it).
        XCTAssertTrue(validateFragment(makeFragment(kind: "claim", detail: wireObject())).ok)
        let f = makeFragment(kind: "claim", detail: wireObject(("stance", .string("maybe"))))
        expectedValidationError(f, code: .detailFieldInvalid)
    }

    func testProcedureStepsRequired() {
        let f = makeFragment(kind: "procedure", detail: wireObject(("steps", .array([]))))
        expectedValidationError(f, code: .procedureStepsRequired)
    }

    func testDecisionRationaleRequired() {
        let f = makeFragment(kind: "decision", detail: wireObject(("rationale", .string("  "))))
        expectedValidationError(f, code: .decisionRationaleRequired)
    }

    func testQuestionRules() {
        var f = makeFragment(kind: "question", detail: wireObject(("status", .string("unknown"))))
        expectedValidationError(f, code: .questionStatusInvalid)

        f = makeFragment(kind: "question", detail: wireObject(("status", .string("answered"))))
        expectedValidationError(f, code: .questionAnswerRequired)

        f = makeFragment(kind: "question", detail: wireObject(("status", .string("open"))))
        expectedValidationError(f, code: .questionHypothesisRequired)

        f = makeFragment(kind: "question", detail: wireObject(
            ("status", .string("open")),
            ("nextStep", .string("查利率期货"))
        ))
        XCTAssertTrue(validateFragment(f).ok)
    }

    func testVisualAttachmentRules() {
        var f = makeFragment(kind: "visual", detail: wireObject(("attachmentIds", .array([]))))
        expectedValidationError(f, code: .visualAttachmentRequired)

        f = makeFragment(kind: "visual", detail: wireObject(("attachmentIds", wireStrings(["a", "a"]))))
        expectedValidationError(f, code: .detailFieldInvalid)

        f = makeFragment(kind: "visual", detail: wireObject(
            ("attachmentIds", wireStrings((1...11).map { "asset\($0)" }))
        ))
        expectedValidationError(f, code: .detailFieldInvalid)
    }

    func testInspirationFormInvalid() {
        let f = makeFragment(kind: "inspiration", detail: wireObject(("form", .string("poem"))))
        expectedValidationError(f, code: .inspirationFormInvalid)
    }
}
