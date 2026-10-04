// Domain factory & scheduler version — mirrors learning-core/factory.ts.
// New fragments always get their review defaults from here; pages never
// assemble their own default values. captureRevision starts at 1 and only
// the extension bumps it on capture-field edits (fragments.md §7).

import Foundation

public let schedulerVersion = "four-tier-v1"

private let idAlphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

/// nanoid(12) — url-safe alphabet, same shape as the extension side.
public func newId() -> String {
    var random = [UInt8](repeating: 0, count: 12)
    let status = SecRandomCopyBytes(kSecRandomDefault, 12, &random)
    if status != errSecSuccess {
        // SecRandom failure is practically unreachable; fall back to the
        // system generator rather than crash capture.
        var rng = SystemRandomNumberGenerator()
        for i in random.indices { random[i] = UInt8(rng.next() & 0xFF) }
    }
    return String(random.map { idAlphabet[Int($0) % idAlphabet.count] })
}

public func createReviewState(now: Int) -> ReviewState {
    ReviewState(
        state: .new,
        repetitions: 0,
        lapses: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        nextReviewAt: now  // new fragments are reviewable immediately
    )
}

public struct CreateFragmentInput {
    public var kind: String
    public var content: String
    public var context: FragmentContextInput
    public var processing: FragmentProcessing
    public var detail: FragmentDetail
    public var tags: [String]
    public var now: Int

    public init(
        kind: String,
        content: String,
        context: FragmentContextInput,
        processing: FragmentProcessing,
        detail: FragmentDetail,
        tags: [String] = [],
        now: Int? = nil
    ) {
        self.kind = kind
        self.content = content
        self.context = context
        self.processing = processing
        self.detail = detail
        self.tags = tags
        self.now = now ?? Int(Date().timeIntervalSince1970 * 1000)
    }
}

/// `FragmentContext` minus `capturedAt` (optional; factory defaults it to now).
public struct FragmentContextInput {
    public var excerpt: String
    public var sourceUrl: String
    public var sourceHost: String
    public var sourceTitle: String?
    public var locator: FragmentLocator
    public var capturedAt: Int?

    public init(
        excerpt: String,
        sourceUrl: String,
        sourceHost: String,
        sourceTitle: String? = nil,
        locator: FragmentLocator = .none,
        capturedAt: Int? = nil
    ) {
        self.excerpt = excerpt
        self.sourceUrl = sourceUrl
        self.sourceHost = sourceHost
        self.sourceTitle = sourceTitle
        self.locator = locator
        self.capturedAt = capturedAt
    }
}

public func createFragment(_ input: CreateFragmentInput) throws -> FragmentRecord {
    let now = input.now
    let record = FragmentRecord(
        id: newId(),
        captureRevision: 1,
        kind: input.kind,
        content: input.content.trimmingCharacters(in: .whitespacesAndNewlines),
        normalizedContent: normalizeContent(input.content),
        context: FragmentContext(
            excerpt: input.context.excerpt,
            sourceUrl: input.context.sourceUrl,
            sourceHost: input.context.sourceHost,
            sourceTitle: input.context.sourceTitle,
            locator: input.context.locator,
            capturedAt: input.context.capturedAt ?? now
        ),
        processing: input.processing,
        detail: input.detail.wireValue,
        tags: dedupeTags(input.tags),
        review: createReviewState(now: now),
        createdAt: now,
        updatedAt: now
    )
    try assertValid(record)
    return record
}
