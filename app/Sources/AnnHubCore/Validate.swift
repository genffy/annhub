// Runtime validation — mirrors learning-core/validate.ts exactly (v4).
// Target contract: docs/v2/fragments.md §7 (validation order) and §4 (details).
//
// Order (first failure returns, no silent corrections):
//   kind registered → base field ranges → normalizedContent consistent →
//   excerpt contains content → processing.verified confirmed →
//   processing.use non-empty → detail per kind.
//
// No fixed per-language token thresholds: `use` only needs to be non-empty
// and not copy content/excerpt.

import Foundation

public enum FragmentErrorCode: String, Sendable {
    case schemaVersionUnsupported = "SCHEMA_VERSION_UNSUPPORTED"
    case kindNotRegistered = "KIND_NOT_REGISTERED"
    case kindNotImplemented = "KIND_NOT_IMPLEMENTED"
    case contentRequired = "CONTENT_REQUIRED"
    case contentTooLong = "CONTENT_TOO_LONG"
    case textControlChars = "TEXT_CONTROL_CHARS"
    case captureRevisionInvalid = "CAPTURE_REVISION_INVALID"
    case sourceUrlInvalid = "SOURCE_URL_INVALID"
    case sourceHostMismatch = "SOURCE_HOST_MISMATCH"
    case sourceTitleTooLong = "SOURCE_TITLE_TOO_LONG"
    case tagInvalid = "TAG_INVALID"
    case tagsTooMany = "TAGS_TOO_MANY"
    case guessTooLong = "GUESS_TOO_LONG"
    case normalizedMismatch = "NORMALIZED_MISMATCH"
    case excerptRequired = "EXCERPT_REQUIRED"
    case excerptTooLong = "EXCERPT_TOO_LONG"
    case excerptMissingContent = "EXCERPT_MISSING_CONTENT"
    case locatorInvalid = "LOCATOR_INVALID"
    case timestampInvalid = "TIMESTAMP_INVALID"
    case verifiedRequired = "VERIFIED_REQUIRED"
    case verifiedSourceInvalid = "VERIFIED_SOURCE_INVALID"
    case verifiedLlmMetaRequired = "VERIFIED_LLM_META_REQUIRED"
    case verifiedBasedOnModelInvalid = "VERIFIED_BASED_ON_MODEL_INVALID"
    case verifiedSummaryTooLong = "VERIFIED_SUMMARY_TOO_LONG"
    case verifiedNotesTooLong = "VERIFIED_NOTES_TOO_LONG"
    case verifiedReferencesTooMany = "VERIFIED_REFERENCES_TOO_MANY"
    case verifiedReferenceTooLong = "VERIFIED_REFERENCE_TOO_LONG"
    case useRequired = "USE_REQUIRED"
    case useTooLong = "USE_TOO_LONG"
    case useCopiesContent = "USE_COPIES_CONTENT"
    case useCopiesExcerpt = "USE_COPIES_EXCERPT"
    case detailKindMismatch = "DETAIL_KIND_MISMATCH"
    case detailFieldInvalid = "DETAIL_FIELD_INVALID"
    case procedureStepsRequired = "PROCEDURE_STEPS_REQUIRED"
    case decisionRationaleRequired = "DECISION_RATIONALE_REQUIRED"
    case questionStatusInvalid = "QUESTION_STATUS_INVALID"
    case questionAnswerRequired = "QUESTION_ANSWER_REQUIRED"
    case questionHypothesisRequired = "QUESTION_HYPOTHESIS_REQUIRED"
    case visualAttachmentRequired = "VISUAL_ATTACHMENT_REQUIRED"
    case inspirationFormInvalid = "INSPIRATION_FORM_INVALID"
    case reviewStateInvalid = "REVIEW_STATE_INVALID"

}

public struct ValidationResult: Sendable {
    public let ok: Bool
    public let code: FragmentErrorCode?
    public let info: [String: String]

    static let passed = ValidationResult(ok: true, code: nil, info: [:])

    static func fail(_ code: FragmentErrorCode, _ info: [String: String] = [:]) -> ValidationResult {
        ValidationResult(ok: false, code: code, info: info)
    }
}

public struct FragmentValidationError: Error, Sendable {
    public let code: FragmentErrorCode
    public let info: [String: String]
    public init(code: FragmentErrorCode, info: [String: String] = [:]) {
        self.code = code
        self.info = info
    }
}

// ── shared text guards ──────────────────────────────────────────────────

/// C0 control characters except \t \n \r, plus DEL (0x7F).
/// Lone surrogates cannot occur in Swift Strings (UnicodeScalar rejects
/// them at construction), so that half of the TS guard is structural here.
public func textIsCanonicalSafe(_ text: String) -> Bool {
    for scalar in text.unicodeScalars {
        if scalar.value == 0x09 || scalar.value == 0x0A || scalar.value == 0x0D { continue }
        if scalar.value < 0x20 || scalar.value == 0x7F { return false }
    }
    return true
}

/// JS `String.prototype.length` counts UTF-16 code units — mirror it so
/// multi-scalar content hits the same limits on both ends.
func utf16Length(_ text: String) -> Int {
    text.utf16.count
}

/// TS checkText on the generic detail tree: absent → pass; wrong type →
/// DETAIL_FIELD_INVALID; unsafe text → TEXT_CONTROL_CHARS; too long →
/// DETAIL_FIELD_INVALID.
func checkText(_ value: WireValue?, field: String, max: Int) -> ValidationResult? {
    guard let value else { return nil }
    guard case let .string(text) = value else {
        return .fail(.detailFieldInvalid, ["field": field])
    }
    if !textIsCanonicalSafe(text) {
        return .fail(.textControlChars, ["field": field])
    }
    if utf16Length(text) > max {
        return .fail(.detailFieldInvalid, ["field": field, "got": String(utf16Length(text)), "max": String(max)])
    }
    return nil
}

func checkStringList(_ value: WireValue?, field: String, maxItems: Int, maxItem: Int) -> ValidationResult? {
    guard let value else { return nil }
    guard case let .array(items) = value else {
        return .fail(.detailFieldInvalid, ["field": field])
    }
    if items.count > maxItems {
        return .fail(.detailFieldInvalid, ["field": field, "got": String(items.count), "max": String(maxItems)])
    }
    for item in items {
        guard case let .string(text) = item, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .fail(.detailFieldInvalid, ["field": field])
        }
        if let failure = checkText(item, field: field, max: maxItem) { return failure }
    }
    return nil
}

func isFiniteEpoch(_ value: Int) -> Bool {
    value > 0 && value <= Int.max
}

func isNonNegativeInt(_ value: Int) -> Bool {
    value >= 0
}

// ── locator (fragments.md §5) ────────────────────────────────────────────

func validateRect(_ rect: [Double]) -> Bool {
    guard rect.count == 4 else { return false }
    let allValid = rect.allSatisfy { $0.isFinite && $0 >= 0 }
    guard allValid else { return false }
    let (x, y, w, h) = (rect[0], rect[1], rect[2], rect[3])
    return w > 0 && h > 0 && x + w <= 1 && y + h <= 1
}

public func validateLocator(_ locator: FragmentLocator) -> ValidationResult {
    switch locator {
    case .none:
        return .passed
    case let .dom(selector, textOffset):
        let trimmed = selector.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || utf16Length(selector) > 2000 { return .fail(.locatorInvalid) }
        if let textOffset, !isNonNegativeInt(textOffset) { return .fail(.locatorInvalid) }
        return .passed
    case let .image(assetId, rect):
        if assetId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || utf16Length(assetId) > 64 {
            return .fail(.locatorInvalid)
        }
        if let rect, !validateRect(rect) { return .fail(.locatorInvalid) }
        return .passed
    case let .time(startMs, endMs):
        // Media time ranges start at zero (fragments.md §5: 0 <= startMs < endMs):
        // startMs finite non-negative, endMs finite strictly positive.
        if !isNonNegativeInt(startMs) || !isFiniteEpoch(endMs) || startMs >= endMs {
            return .fail(.locatorInvalid)
        }
        return .passed
    case let .page(pageNumber, rect):
        if pageNumber < 1 { return .fail(.locatorInvalid) }
        if let rect, !validateRect(rect) { return .fail(.locatorInvalid) }
        return .passed
    case .invalid:
        return .fail(.locatorInvalid)
    }
}

// ── source URL / host pairing (fragments.md §7) ─────────────────────────

let annhubLocalIdChars = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

func isValidAnnHubLocalId(_ id: String) -> Bool {
    !id.isEmpty && id.unicodeScalars.allSatisfy { annhubLocalIdChars.contains($0) }
}

public func validateSourcePair(sourceUrl: String, sourceHost: String) -> ValidationResult {
    if sourceUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .fail(.sourceUrlInvalid)
    }
    if sourceUrl.hasPrefix("annhub://manual/") {
        let id = String(sourceUrl.dropFirst("annhub://manual/".count))
        if !isValidAnnHubLocalId(id) { return .fail(.sourceUrlInvalid) }
        if sourceHost != "manual" {
            return .fail(.sourceHostMismatch, ["got": sourceHost, "need": "manual"])
        }
        return .passed
    }
    guard let url = URL(string: sourceUrl),
          let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https",
          let host = url.host, !host.isEmpty
    else { return .fail(.sourceUrlInvalid) }
    guard let normalized = normalizeHost(url: sourceUrl) else {
        return .fail(.sourceUrlInvalid)
    }
    if sourceHost != normalized {
        return .fail(.sourceHostMismatch, ["got": sourceHost, "need": normalized])
    }
    return .passed
}

// ── verification (fragments.md §3/§7) ───────────────────────────────────

public func validateVerified(_ verified: VerifiedResult?) -> ValidationResult {
    guard let v = verified else { return .fail(.verifiedRequired) }
    if !isFiniteEpoch(v.confirmedAt) {
        return .fail(.verifiedRequired, ["field": "confirmedAt"])
    }
    let validSources = VerifiedSource.allCases.map(\.rawValue)
    if !validSources.contains(v.source) {
        return .fail(.verifiedSourceInvalid)
    }
    if let failure = checkText(optionalString(v.summary), field: "verified.summary", max: 5000) {
        return failure
    }
    if let failure = checkText(optionalString(v.notes), field: "verified.notes", max: 5000) {
        return failure
    }
    if let references = v.references {
        let tree = WireValue.array(references.map(WireValue.string))
        if let failure = checkStringList(tree, field: "verified.references", maxItems: 10, maxItem: 500) {
            return failure
        }
    }
    if v.source == VerifiedSource.llm.rawValue {
        let modelOk = v.modelId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        let promptOk = v.promptVersion?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
        if !(modelOk == true && promptOk == true) {
            return .fail(.verifiedLlmMetaRequired)
        }
        if v.basedOnModel != nil { return .fail(.verifiedBasedOnModelInvalid) }
    }
    if let modelId = v.modelId, utf16Length(modelId) > 200 {
        return .fail(.detailFieldInvalid, ["field": "verified.modelId"])
    }
    if let promptVersion = v.promptVersion, utf16Length(promptVersion) > 200 {
        return .fail(.detailFieldInvalid, ["field": "verified.promptVersion"])
    }
    if let basedOn = v.basedOnModel {
        if v.source == VerifiedSource.llm.rawValue { return .fail(.verifiedBasedOnModelInvalid) }
        let modelOk = !basedOn.modelId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let promptOk = !basedOn.promptVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if !(modelOk && promptOk) { return .fail(.verifiedBasedOnModelInvalid) }
    }
    return .passed
}

private func optionalString(_ value: String?) -> WireValue? {
    value.map(WireValue.string)
}

// ── per-kind detail validators (fragments.md §4/§7) ─────────────────────

func validateExcerptDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "excerpt"])
    }
    if let failure = checkText(fields["note"], field: "detail.note", max: 2000) { return failure }
    return .passed
}

func validateConceptDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "concept"])
    }
    if let failure = checkText(fields["definition"], field: "detail.definition", max: 2000) { return failure }
    for field in ["boundaries", "examples", "counterExamples"] {
        if let failure = checkStringList(fields[field], field: "detail.\(field)", maxItems: 20, maxItem: 500) {
            return failure
        }
    }
    return .passed
}

func validateClaimDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "claim"])
    }
    // Optional in the data layer (fragments.md §4); the capture form asks for it.
    if let stance = fields["stance"], stance.stringValue.map({ ["support", "oppose", "uncertain"].contains($0) }) != true {
        return .fail(.detailFieldInvalid, ["field": "detail.stance"])
    }
    for field in ["evidence", "assumptions"] {
        if let failure = checkStringList(fields[field], field: "detail.\(field)", maxItems: 20, maxItem: 500) {
            return failure
        }
    }
    return .passed
}

func validateProcedureDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "procedure"])
    }
    guard let steps = fields["steps"]?.arrayValue, !steps.isEmpty else {
        return .fail(.procedureStepsRequired)
    }
    if let failure = checkStringList(.array(steps), field: "detail.steps", maxItems: 20, maxItem: 500) {
        return failure
    }
    for field in ["prerequisites", "failureModes"] {
        if let failure = checkStringList(fields[field], field: "detail.\(field)", maxItems: 20, maxItem: 500) {
            return failure
        }
    }
    return .passed
}

func validateDecisionDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "decision"])
    }
    guard let rationale = fields["rationale"]?.stringValue,
          !rationale.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else { return .fail(.decisionRationaleRequired) }
    if let failure = checkText(fields["rationale"], field: "detail.rationale", max: 2000) { return failure }
    for field in ["alternatives", "consequences"] {
        if let failure = checkStringList(fields[field], field: "detail.\(field)", maxItems: 20, maxItem: 500) {
            return failure
        }
    }
    return .passed
}

func validateQuestionDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "question"])
    }
    let status = fields["status"]?.stringValue
    if status != "open" && status != "testing" && status != "answered" {
        return .fail(.questionStatusInvalid)
    }
    if let failure = checkText(fields["hypothesis"], field: "detail.hypothesis", max: 2000) { return failure }
    if let failure = checkText(fields["nextStep"], field: "detail.nextStep", max: 2000) { return failure }
    if let failure = checkText(fields["answer"], field: "detail.answer", max: 2000) { return failure }
    if let failure = checkStringList(fields["evidence"], field: "detail.evidence", maxItems: 20, maxItem: 500) {
        return failure
    }
    if status == "answered" {
        let answer = fields["answer"]?.stringValue ?? ""
        if answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .fail(.questionAnswerRequired)
        }
    }
    if status != "answered" {
        let hasHypothesis = !(fields["hypothesis"]?.stringValue?
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        let hasNextStep = !(fields["nextStep"]?.stringValue?
            .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        if !hasHypothesis && !hasNextStep { return .fail(.questionHypothesisRequired) }
    }
    return .passed
}

public func validateAttachmentIds(_ ids: WireValue?) -> ValidationResult {
    guard let items = ids?.arrayValue, !items.isEmpty else {
        return .fail(.visualAttachmentRequired)
    }
    if items.count > 10 {
        return .fail(.detailFieldInvalid, ["field": "detail.attachmentIds", "got": String(items.count), "max": "10"])
    }
    var seen = Set<String>()
    for item in items {
        guard let id = item.stringValue,
              !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              utf16Length(id) <= 64
        else { return .fail(.detailFieldInvalid, ["field": "detail.attachmentIds"]) }
        if seen.contains(id) {
            return .fail(.detailFieldInvalid, ["field": "detail.attachmentIds", "duplicate": id])
        }
        seen.insert(id)
    }
    return .passed
}

func validateVisualDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "visual"])
    }
    return validateAttachmentIds(fields["attachmentIds"])
}

/// TS `isFiniteEpoch`: a finite number strictly greater than 0.
func finiteEpochMs(_ value: WireValue?) -> Double? {
    switch value {
    case .int(let i): return i > 0 ? Double(i) : nil
    case .double(let d): return d.isFinite && d > 0 ? d : nil
    default: return nil
    }
}

/// TS `isFiniteNonNegative`: a finite number >= 0 — media time ranges may
/// start at zero (fragments.md §5: 0 <= startMs < endMs).
func finiteNonNegativeMs(_ value: WireValue?) -> Double? {
    switch value {
    case .int(let i): return i >= 0 ? Double(i) : nil
    case .double(let d): return d.isFinite && d >= 0 ? d : nil
    default: return nil
    }
}

/// R4 media-clip: {startMs, endMs[, attachmentIds]} — 0 <= startMs < endMs,
/// both finite (endMs strictly positive); attachments reuse the visual
/// validator when present.
func validateMediaClipDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "media-clip"])
    }
    guard let start = finiteNonNegativeMs(fields["startMs"]),
          let end = finiteEpochMs(fields["endMs"]),
          start < end
    else {
        return .fail(.detailFieldInvalid, ["field": "detail.startMs/endMs", "need": "0 <= startMs < endMs"])
    }
    if let attachments = fields["attachmentIds"] {
        let result = validateAttachmentIds(attachments)
        if !result.ok { return result }
    }
    return .passed
}

func validateInspirationDetail(_ detail: WireValue) -> ValidationResult {
    guard let fields = detail.objectValue else {
        return .fail(.detailKindMismatch, ["kind": "inspiration"])
    }
    let form = fields["form"]?.stringValue
    if form != "idea" && form != "reflection" {
        return .fail(.inspirationFormInvalid)
    }
    return .passed
}

/// Registry of per-kind detail validators — every enabled kind has one
/// (fragments.md §4). Kinds absent here fail with KIND_NOT_IMPLEMENTED.
public let fragmentDetailValidators: [String: (WireValue) -> ValidationResult] = [
    "excerpt": validateExcerptDetail,
    "concept": validateConceptDetail,
    "claim": validateClaimDetail,
    "procedure": validateProcedureDetail,
    "decision": validateDecisionDetail,
    "question": validateQuestionDetail,
    "visual": validateVisualDetail,
    "media-clip": validateMediaClipDetail,
    "inspiration": validateInspirationDetail,
]

public func isKindEnabled(_ kind: String) -> Bool {
    enabledFragmentKinds.contains(kind)
}

// ── base field ranges ───────────────────────────────────────────────────

func validateBaseFields(_ f: FragmentRecord) -> ValidationResult {
    if f.schemaVersion != fragmentSchemaVersion {
        return .fail(.schemaVersionUnsupported, ["got": String(f.schemaVersion), "need": String(fragmentSchemaVersion)])
    }
    if f.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .fail(.detailFieldInvalid, ["field": "id"])
    }
    if f.captureRevision < 1 { return .fail(.captureRevisionInvalid) }

    let trimmedContent = f.content.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedContent.isEmpty { return .fail(.contentRequired) }
    if utf16Length(f.content) > 500 {
        return .fail(.contentTooLong, ["got": String(utf16Length(f.content)), "max": "500"])
    }
    if !textIsCanonicalSafe(f.content) { return .fail(.textControlChars, ["field": "content"]) }

    let source = validateSourcePair(sourceUrl: f.context.sourceUrl, sourceHost: f.context.sourceHost)
    if !source.ok { return source }
    if let title = f.context.sourceTitle {
        if let failure = checkText(.string(title), field: "context.sourceTitle", max: 300) {
            return failure
        }
    }
    for tag in f.tags {
        if utf16Length(tag) < 1 || utf16Length(tag) > 32 {
            return .fail(.tagInvalid, ["tag": tag])
        }
    }
    if f.tags.count > 20 {
        return .fail(.tagsTooMany, ["got": String(f.tags.count), "max": "20"])
    }
    if let guess = f.processing.guess {
        if let failure = checkText(.string(guess), field: "processing.guess", max: 5000) {
            return failure
        }
    }
    if !isFiniteEpoch(f.context.capturedAt) || !isFiniteEpoch(f.createdAt) || !isFiniteEpoch(f.updatedAt) {
        return .fail(.timestampInvalid)
    }
    return .passed
}

func validateReviewState(_ f: FragmentRecord) -> ValidationResult {
    let r = f.review
    // state enum membership (typed, but double-check 'learning' is allowed).
    guard ReviewPhase(rawValue: r.state.rawValue) != nil else { return .fail(.reviewStateInvalid) }
    if !isNonNegativeInt(r.repetitions) || !isNonNegativeInt(r.lapses) || !isNonNegativeInt(r.intervalDays) {
        return .fail(.reviewStateInvalid)
    }
    if !r.easeFactor.isFinite || r.easeFactor < 1.3 { return .fail(.reviewStateInvalid) }
    if !isFiniteEpoch(r.nextReviewAt) { return .fail(.reviewStateInvalid) }
    if let lastReviewedAt = r.lastReviewedAt, !isFiniteEpoch(lastReviewedAt) {
        return .fail(.reviewStateInvalid)
    }
    return .passed
}

/// Full validation in the mandated order (fragments.md §7).
public func validateFragment(_ f: FragmentRecord) -> ValidationResult {
    guard registeredFragmentKinds.contains(f.kind) else {
        return .fail(.kindNotRegistered, ["kind": f.kind])
    }
    guard let detailValidator = fragmentDetailValidators[f.kind] else {
        return .fail(.kindNotImplemented, ["kind": f.kind])
    }

    let base = validateBaseFields(f)
    if !base.ok { return base }

    if f.normalizedContent != normalizeContent(f.content) { return .fail(.normalizedMismatch) }

    let excerpt = f.context.excerpt
    if excerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .fail(.excerptRequired)
    }
    if utf16Length(excerpt) > 2000 {
        return .fail(.excerptTooLong, ["got": String(utf16Length(excerpt)), "max": "2000"])
    }
    if !textIsCanonicalSafe(excerpt) { return .fail(.textControlChars, ["field": "context.excerpt"]) }
    if !normalizeContent(excerpt).contains(f.normalizedContent) {
        return .fail(.excerptMissingContent)
    }

    let locator = validateLocator(f.context.locator)
    if !locator.ok { return locator }

    let verified = validateVerified(f.processing.verified)
    if !verified.ok { return verified }

    let use = f.processing.use
    if use.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .fail(.useRequired) }
    if utf16Length(use) > 5000 {
        return .fail(.useTooLong, ["got": String(utf16Length(use)), "max": "5000"])
    }
    if !textIsCanonicalSafe(use) { return .fail(.textControlChars, ["field": "processing.use"]) }
    if use.trimmingCharacters(in: .whitespacesAndNewlines)
        == f.content.trimmingCharacters(in: .whitespacesAndNewlines)
    {
        return .fail(.useCopiesContent)
    }
    if use.trimmingCharacters(in: .whitespacesAndNewlines)
        == excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
    {
        return .fail(.useCopiesExcerpt)
    }

    let review = validateReviewState(f)
    if !review.ok { return review }

    return detailValidator(f.detail)
}

/// Throws on invalid — used inside the shared factory so callers cannot
/// bypass validation.
public func assertValid(_ f: FragmentRecord) throws {
    let result = validateFragment(f)
    if !result.ok {
        throw FragmentValidationError(code: result.code ?? .detailFieldInvalid, info: result.info)
    }
}
