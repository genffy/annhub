// Models — mirrors learning-core/types.ts exactly (JSON keys included), v4 contract.
// docs/v2/fragments.md (kinds/details/validation), docs/v2/storage.md (§3 entities).
//
// `kind` and `verified.source` stay String: unregistered values must survive
// decoding so validation can report the stable error codes
// (KIND_NOT_REGISTERED / VERIFIED_SOURCE_INVALID …) instead of a JSON decode
// error — same as the TS runtime checks.

import Foundation

// ── Fragment kind registry (fragments.md §2) ────────────────────────────

/// schemaVersion of the v4 fragment contract.
public let fragmentSchemaVersion = 4

/// Every registered kind (union-complete).
public let registeredFragmentKinds: [String] = [
    "excerpt", "concept", "claim", "procedure", "decision",
    "question", "inspiration", "visual", "media-clip",
]

/// Kinds whose detail validators are implemented (fragments.md §4). R4 adds
/// `media-clip`; future kinds stay here until their validator ships.
public let enabledFragmentKinds: [String] = [
    "excerpt", "concept", "claim", "procedure", "decision",
    "question", "inspiration", "visual", "media-clip",
]

// ── Type-specialized detail blocks (fragments.md §4) ────────────────────

public struct ExcerptDetail: Codable, Equatable, Sendable {
    public var note: String?
    public init(note: String? = nil) { self.note = note }
}

public struct ConceptDetail: Codable, Equatable, Sendable {
    public var definition: String?
    public var boundaries: [String]?
    public var examples: [String]?
    public var counterExamples: [String]?

    public init(
        definition: String? = nil,
        boundaries: [String]? = nil,
        examples: [String]? = nil,
        counterExamples: [String]? = nil
    ) {
        self.definition = definition
        self.boundaries = boundaries
        self.examples = examples
        self.counterExamples = counterExamples
    }
}

public struct ClaimDetail: Codable, Equatable, Sendable {
    /// 'support' | 'oppose' | 'uncertain'; optional in the data layer (the capture form asks for it).
    public var stance: String?
    public var evidence: [String]?
    public var assumptions: [String]?

    public init(stance: String? = nil, evidence: [String]? = nil, assumptions: [String]? = nil) {
        self.stance = stance
        self.evidence = evidence
        self.assumptions = assumptions
    }
}

public struct ProcedureDetail: Codable, Equatable, Sendable {
    public var steps: [String]
    public var prerequisites: [String]?
    public var failureModes: [String]?

    public init(steps: [String], prerequisites: [String]? = nil, failureModes: [String]? = nil) {
        self.steps = steps
        self.prerequisites = prerequisites
        self.failureModes = failureModes
    }
}

public struct DecisionDetail: Codable, Equatable, Sendable {
    public var rationale: String
    public var alternatives: [String]?
    public var consequences: [String]?

    public init(rationale: String, alternatives: [String]? = nil, consequences: [String]? = nil) {
        self.rationale = rationale
        self.alternatives = alternatives
        self.consequences = consequences
    }
}

public struct QuestionDetail: Codable, Equatable, Sendable {
    public var status: String // 'open' | 'testing' | 'answered'
    public var hypothesis: String?
    public var evidence: [String]?
    public var nextStep: String?
    public var answer: String?

    public init(
        status: String,
        hypothesis: String? = nil,
        evidence: [String]? = nil,
        nextStep: String? = nil,
        answer: String? = nil
    ) {
        self.status = status
        self.hypothesis = hypothesis
        self.evidence = evidence
        self.nextStep = nextStep
        self.answer = answer
    }
}

public struct VisualDetail: Codable, Equatable, Sendable {
    public var attachmentIds: [String]
    public init(attachmentIds: [String]) { self.attachmentIds = attachmentIds }
}

public struct MediaClipDetail: Codable, Equatable, Sendable {
    public var startMs: Int
    public var endMs: Int
    public var attachmentIds: [String]?

    public init(startMs: Int, endMs: Int, attachmentIds: [String]? = nil) {
        self.startMs = startMs
        self.endMs = endMs
        self.attachmentIds = attachmentIds
    }
}

public struct InspirationDetail: Codable, Equatable, Sendable {
    public var form: String // 'idea' | 'reflection'
    public init(form: String) { self.form = form }
}

/// Typed detail payload for construction; converts to a generic `WireValue`
/// tree on the record so mismatched details still decode and reach the
/// per-kind validator (mirrors the TS dynamic boundary).
public enum FragmentDetail {
    case excerpt(ExcerptDetail)
    case concept(ConceptDetail)
    case claim(ClaimDetail)
    case procedure(ProcedureDetail)
    case decision(DecisionDetail)
    case question(QuestionDetail)
    case visual(VisualDetail)
    case mediaClip(MediaClipDetail)
    case inspiration(InspirationDetail)

    /// JSON tree shape for `FragmentRecord.detail`.
    public var wireValue: WireValue {
        switch self {
        case .excerpt(let d): return encodeDetail(d)
        case .concept(let d): return encodeDetail(d)
        case .claim(let d): return encodeDetail(d)
        case .procedure(let d): return encodeDetail(d)
        case .decision(let d): return encodeDetail(d)
        case .question(let d): return encodeDetail(d)
        case .visual(let d): return encodeDetail(d)
        case .mediaClip(let d): return encodeDetail(d)
        case .inspiration(let d): return encodeDetail(d)
        }
    }
}

func encodeDetail<T: Encodable>(_ detail: T) -> WireValue {
    guard let data = try? JSONEncoder.learningCore().encode(detail),
          let wire = try? JSONDecoder.learningCore().decode(WireValue.self, from: data)
    else { return .object([:]) }
    return wire
}

// ── Verification (fragments.md §3/§7) ───────────────────────────────────

/// VerifiedSource raw values: 'source-material' | 'llm' | 'manual'.
/// The record stores the raw string so invalid values reach validation.
public enum VerifiedSource: String, Codable, CaseIterable, Sendable {
    case sourceMaterial = "source-material"
    case llm
    case manual
}

/// Original model suggestion kept when the user edited it (`source` becomes
/// `manual` with `basedOnModel` retaining the model provenance).
public struct ModelMeta: Codable, Equatable, Sendable {
    public var modelId: String
    public var promptVersion: String

    public init(modelId: String, promptVersion: String) {
        self.modelId = modelId
        self.promptVersion = promptVersion
    }
}

public struct VerifiedResult: Codable, Equatable, Sendable {
    public var confirmedAt: Int
    public var source: String
    public var summary: String?
    public var notes: String?
    public var references: [String]?
    public var modelId: String?
    public var promptVersion: String?
    public var basedOnModel: ModelMeta?

    public init(
        confirmedAt: Int,
        source: String,
        summary: String? = nil,
        notes: String? = nil,
        references: [String]? = nil,
        modelId: String? = nil,
        promptVersion: String? = nil,
        basedOnModel: ModelMeta? = nil
    ) {
        self.confirmedAt = confirmedAt
        self.source = source
        self.summary = summary
        self.notes = notes
        self.references = references
        self.modelId = modelId
        self.promptVersion = promptVersion
        self.basedOnModel = basedOnModel
    }
}

// ── Context (L1 invariant, fragments.md §3/§5) ──────────────────────────

/// Custom Codable mirrors the TS union:
/// `{type:"none"}` / `{type:"dom",selector,textOffset?}` /
/// `{type:"image",assetId,rect?}` / `{type:"time",startMs,endMs}` /
/// `{type:"page",pageNumber,rect?}`. `.invalid` keeps unknown shapes
/// decodable so validation reports LOCATOR_INVALID.
public enum FragmentLocator: Equatable, Sendable {
    case none
    case dom(selector: String, textOffset: Int?)
    case image(assetId: String, rect: [Double]?)
    case time(startMs: Int, endMs: Int)
    case page(pageNumber: Int, rect: [Double]?)
    /// Decoded but unrecognized — always fails validation with LOCATOR_INVALID.
    case invalid
}

extension FragmentLocator: Codable {
    private enum CodingKeys: String, CodingKey {
        case type, selector, textOffset, assetId, rect, startMs, endMs, pageNumber
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "none":
            self = .none
        case "dom":
            self = .dom(
                selector: try c.decode(String.self, forKey: .selector),
                textOffset: try c.decodeIfPresent(Int.self, forKey: .textOffset)
            )
        case "image":
            self = .image(
                assetId: try c.decode(String.self, forKey: .assetId),
                rect: try c.decodeIfPresent([Double].self, forKey: .rect)
            )
        case "time":
            self = .time(
                startMs: try c.decode(Int.self, forKey: .startMs),
                endMs: try c.decode(Int.self, forKey: .endMs)
            )
        case "page":
            self = .page(
                pageNumber: try c.decode(Int.self, forKey: .pageNumber),
                rect: try c.decodeIfPresent([Double].self, forKey: .rect)
            )
        default:
            self = .invalid
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .none:
            try c.encode("none", forKey: .type)
        case let .dom(selector, textOffset):
            try c.encode("dom", forKey: .type)
            try c.encode(selector, forKey: .selector)
            try c.encodeIfPresent(textOffset, forKey: .textOffset)
        case let .image(assetId, rect):
            try c.encode("image", forKey: .type)
            try c.encode(assetId, forKey: .assetId)
            try c.encodeIfPresent(rect, forKey: .rect)
        case let .time(startMs, endMs):
            try c.encode("time", forKey: .type)
            try c.encode(startMs, forKey: .startMs)
            try c.encode(endMs, forKey: .endMs)
        case let .page(pageNumber, rect):
            try c.encode("page", forKey: .type)
            try c.encode(pageNumber, forKey: .pageNumber)
            try c.encodeIfPresent(rect, forKey: .rect)
        case .invalid:
            throw EncodingError.invalidValue(
                "invalid", EncodingError.Context(
                    codingPath: encoder.codingPath,
                    debugDescription: "invalid locator cannot be encoded"
                )
            )
        }
    }
}

public struct FragmentContext: Codable, Equatable, Sendable {
    public var excerpt: String
    public var sourceUrl: String
    public var sourceHost: String
    public var sourceTitle: String?
    public var locator: FragmentLocator
    public var capturedAt: Int

    public init(
        excerpt: String,
        sourceUrl: String,
        sourceHost: String,
        sourceTitle: String? = nil,
        locator: FragmentLocator,
        capturedAt: Int
    ) {
        self.excerpt = excerpt
        self.sourceUrl = sourceUrl
        self.sourceHost = sourceHost
        self.sourceTitle = sourceTitle
        self.locator = locator
        self.capturedAt = capturedAt
    }
}

// ── Review scheduling (L3, review.md) ───────────────────────────────────

public enum ReviewPhase: String, Codable, CaseIterable, Sendable {
    case new, learning, review, relearning
}

public struct ReviewState: Codable, Equatable, Sendable {
    public var state: ReviewPhase
    public var repetitions: Int
    public var lapses: Int
    public var intervalDays: Int
    public var easeFactor: Double
    public var lastReviewedAt: Int?
    public var nextReviewAt: Int

    public init(
        state: ReviewPhase,
        repetitions: Int,
        lapses: Int,
        intervalDays: Int,
        easeFactor: Double,
        lastReviewedAt: Int? = nil,
        nextReviewAt: Int
    ) {
        self.state = state
        self.repetitions = repetitions
        self.lapses = lapses
        self.intervalDays = intervalDays
        self.easeFactor = easeFactor
        self.lastReviewedAt = lastReviewedAt
        self.nextReviewAt = nextReviewAt
    }
}

// ── Fragment record (fragments.md §3, schemaVersion 4) ──────────────────

public struct FragmentProcessing: Codable, Equatable, Sendable {
    public var guess: String?
    /// v4 requires an explicit verification step; still optional here so a
    /// missing value decodes and fails validation with VERIFIED_REQUIRED.
    public var verified: VerifiedResult?
    public var use: String

    public init(guess: String? = nil, verified: VerifiedResult? = nil, use: String) {
        self.guess = guess
        self.verified = verified
        self.use = use
    }
}

/// v4 record. `userId` is dropped. `detail` stays a generic JSON tree so a
/// kind/detail mismatch reaches the per-kind validator (DETAIL_KIND_MISMATCH /
/// KIND_NOT_IMPLEMENTED) instead of a decode error. `review` is optional on
/// decode: wire payloads never carry it (storage.md §8) and Desktop
/// reconstructs a fresh review; a decoded record without review therefore
/// defaults to the factory's fresh state.
public struct FragmentRecord: Codable, Identifiable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    /// 1 on extension creation; bumped on every capture-field edit.
    public var captureRevision: Int
    public var kind: String
    public var content: String
    public var normalizedContent: String
    public var context: FragmentContext
    public var processing: FragmentProcessing
    public var detail: WireValue
    public var tags: [String]
    public var review: ReviewState
    public var createdAt: Int
    public var updatedAt: Int

    public init(
        schemaVersion: Int = fragmentSchemaVersion,
        id: String,
        captureRevision: Int = 1,
        kind: String,
        content: String,
        normalizedContent: String,
        context: FragmentContext,
        processing: FragmentProcessing,
        detail: WireValue,
        tags: [String],
        review: ReviewState,
        createdAt: Int,
        updatedAt: Int
    ) {
        self.schemaVersion = schemaVersion
        self.id = id
        self.captureRevision = captureRevision
        self.kind = kind
        self.content = content
        self.normalizedContent = normalizedContent
        self.context = context
        self.processing = processing
        self.detail = detail
        self.tags = tags
        self.review = review
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public enum CodingKeys: String, CodingKey {
        case schemaVersion, id, captureRevision, kind, content, normalizedContent
        case context, processing, detail, tags, review, createdAt, updatedAt
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        id = try c.decode(String.self, forKey: .id)
        captureRevision = try c.decode(Int.self, forKey: .captureRevision)
        kind = try c.decode(String.self, forKey: .kind)
        content = try c.decode(String.self, forKey: .content)
        normalizedContent = try c.decode(String.self, forKey: .normalizedContent)
        context = try c.decode(FragmentContext.self, forKey: .context)
        processing = try c.decode(FragmentProcessing.self, forKey: .processing)
        detail = try c.decode(WireValue.self, forKey: .detail)
        tags = try c.decodeIfPresent([String].self, forKey: .tags) ?? []
        // Wire decode: review never travels; reconstruct a fresh one so the
        // record passes validateFragment (DesktopHub semantics, storage §8).
        review = try c.decodeIfPresent(ReviewState.self, forKey: .review)
            ?? createReviewState(now: Int(Date().timeIntervalSince1970 * 1000))
        createdAt = try c.decode(Int.self, forKey: .createdAt)
        updatedAt = try c.decode(Int.self, forKey: .updatedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(id, forKey: .id)
        try c.encode(captureRevision, forKey: .captureRevision)
        try c.encode(kind, forKey: .kind)
        try c.encode(content, forKey: .content)
        try c.encode(normalizedContent, forKey: .normalizedContent)
        try c.encode(context, forKey: .context)
        try c.encode(processing, forKey: .processing)
        try c.encode(detail, forKey: .detail)
        try c.encode(tags, forKey: .tags)
        try c.encode(review, forKey: .review)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

public extension FragmentRecord {
    /// Typed per-kind detail accessor (nil when the stored tree does not
    /// match the struct — validation reports the mismatch).
    func typedDetail<T: Decodable>(_ type: T.Type) -> T? {
        guard let data = try? JSONEncoder.learningCore().encode(detail) else { return nil }
        return try? JSONDecoder.learningCore().decode(T.self, from: data)
    }

    var conceptDetail: ConceptDetail? { typedDetail(ConceptDetail.self) }
    var claimDetail: ClaimDetail? { typedDetail(ClaimDetail.self) }
    var procedureDetail: ProcedureDetail? { typedDetail(ProcedureDetail.self) }
    var decisionDetail: DecisionDetail? { typedDetail(DecisionDetail.self) }
    var questionDetail: QuestionDetail? { typedDetail(QuestionDetail.self) }
    var visualDetail: VisualDetail? { typedDetail(VisualDetail.self) }
    var mediaClipDetail: MediaClipDetail? { typedDetail(MediaClipDetail.self) }
    var inspirationDetail: InspirationDetail? { typedDetail(InspirationDetail.self) }
    var excerptDetail: ExcerptDetail? { typedDetail(ExcerptDetail.self) }

    /// visual / media-clip attachment references regardless of kind.
    var attachmentIds: [String] {
        guard case let .object(fields) = detail,
              case let .array(items)? = fields["attachmentIds"]
        else { return [] }
        return items.compactMap {
            if case let .string(s) = $0 { return s }
            return nil
        }
    }
}

// ── Review targets & logs (storage.md §3.1) ─────────────────────────────

/// Review targets are fragments only — no polymorphic refs in v4.
public struct ReviewTarget: Codable, Equatable, Sendable {
    public var type: String // always "fragment"
    public var fragmentId: String

    public init(fragmentId: String) {
        self.type = "fragment"
        self.fragmentId = fragmentId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        guard type == "fragment" else {
            throw DecodingError.dataCorruptedError(
                forKey: .type, in: c,
                debugDescription: "review target must be a fragment"
            )
        }
        self.type = type
        self.fragmentId = try c.decode(String.self, forKey: .fragmentId)
    }
}

public enum ReviewRating: String, Codable, CaseIterable, Sendable {
    case again, hard, good, easy
}

public struct ReviewLog: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var target: ReviewTarget
    public var rating: ReviewRating
    public var reviewedAt: Int
    public var previousIntervalDays: Int
    public var nextIntervalDays: Int
    public var usedHint: Bool
    public var schedulerVersion: String

    public init(
        id: String,
        target: ReviewTarget,
        rating: ReviewRating,
        reviewedAt: Int,
        previousIntervalDays: Int,
        nextIntervalDays: Int,
        usedHint: Bool,
        schedulerVersion: String
    ) {
        self.id = id
        self.target = target
        self.rating = rating
        self.reviewedAt = reviewedAt
        self.previousIntervalDays = previousIntervalDays
        self.nextIntervalDays = nextIntervalDays
        self.usedHint = usedHint
        self.schedulerVersion = schedulerVersion
    }
}

// ── Image assets & screenshot library (storage.md §3.5) ─────────────────

public enum ImageMimeType: String, Codable, CaseIterable, Sendable {
    case png = "image/png"
    case jpeg = "image/jpeg"
    case webp = "image/webp"
}

public struct ImageAsset: Codable, Equatable, Sendable {
    public var id: String
    public var mimeType: String
    public var byteLength: Int
    public var sha256: String
    public var width: Int
    public var height: Int
    public var createdAt: Int

    public init(
        id: String,
        mimeType: String,
        byteLength: Int,
        sha256: String,
        width: Int,
        height: Int,
        createdAt: Int
    ) {
        self.id = id
        self.mimeType = mimeType
        self.byteLength = byteLength
        self.sha256 = sha256
        self.width = width
        self.height = height
        self.createdAt = createdAt
    }
}

public struct ScreenshotRecord: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var assetId: String
    public var sourceUrl: String
    public var sourceTitle: String?
    public var capturedAt: Int

    public init(
        id: String,
        assetId: String,
        sourceUrl: String,
        sourceTitle: String? = nil,
        capturedAt: Int
    ) {
        self.id = id
        self.assetId = assetId
        self.sourceUrl = sourceUrl
        self.sourceTitle = sourceTitle
        self.capturedAt = capturedAt
    }
}

// ── Outbox / sync events (storage.md §3.4) ──────────────────────────────

public enum SyncEventType: String, Codable, Sendable {
    case fragmentCreated = "fragment.created"
    case fragmentUpdated = "fragment.updated"
    case assetCreated = "asset.created"
    case reviewRated = "review.rated"
}

public struct OutboxEvent: Codable, Equatable, Sendable {
    public var eventId: String
    public var deviceId: String
    public var type: SyncEventType
    public var payload: Data
    public var createdAt: Int
    public var attempts: Int
    public var lastAttemptAt: Int?

    public init(
        eventId: String,
        deviceId: String,
        type: SyncEventType,
        payload: Data,
        createdAt: Int,
        attempts: Int = 0,
        lastAttemptAt: Int? = nil
    ) {
        self.eventId = eventId
        self.deviceId = deviceId
        self.type = type
        self.payload = payload
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastAttemptAt = lastAttemptAt
    }
}

// ── Local deletion markers (storage.md §5/§10) ──────────────────────────

public struct LocalDeletion: Codable, Equatable, Sendable {
    public var fragmentId: String
    public var deletedAt: Int

    public init(fragmentId: String, deletedAt: Int) {
        self.fragmentId = fragmentId
        self.deletedAt = deletedAt
    }
}

// ── Shared encoder/decoder (camelCase keys, omit-optional) ───────────────

public extension JSONEncoder {
    static func learningCore() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes, .sortedKeys]
        return encoder
    }
}

public extension JSONDecoder {
    static func learningCore() -> JSONDecoder { JSONDecoder() }
}
