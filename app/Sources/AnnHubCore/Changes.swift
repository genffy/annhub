// R3 change-feed shapes — mirrors learning-core/sync.ts DesktopChange
// (docs/v2/storage.md §9). The Desktop ORIGINATES these rows; the extension
// merges them through applyDesktopChanges. Field names are camelCase and must
// stay byte-identical to the TS interfaces: fragmentId / review / log.

import Foundation

public enum DesktopChangeType: String, Codable, Sendable {
    case reviewRated = "review.rated"
    case fragmentDeleted = "fragment.deleted"
}

/// review.rated — review state AFTER the rating plus its log.
public struct ReviewRatedPayload: Codable, Equatable, Sendable {
    public var fragmentId: String
    public var review: ReviewState
    public var log: ReviewLog

    public init(fragmentId: String, review: ReviewState, log: ReviewLog) {
        self.fragmentId = fragmentId
        self.review = review
        self.log = log
    }
}

/// fragment.deleted — informational only; the extension keeps its own copy.
public struct FragmentDeletedPayload: Codable, Equatable, Sendable {
    public var fragmentId: String

    public init(fragmentId: String) {
        self.fragmentId = fragmentId
    }
}

/// One change_log row as stored (payload still encoded).
public struct ChangeLogRow: Equatable, Sendable {
    public var seq: Int
    public var type: String
    public var payloadJson: String
    public var createdAt: Int

    public init(seq: Int, type: String, payloadJson: String, createdAt: Int) {
        self.seq = seq
        self.type = type
        self.payloadJson = payloadJson
        self.createdAt = createdAt
    }
}

/// /v1/events counters for the system page (in-memory, DesktopHub-owned).
public struct EventsStats: Equatable, Sendable {
    public var received = 0
    public var applied = 0
    public var duplicates = 0
    public var skipped = 0

    public init(received: Int = 0, applied: Int = 0, duplicates: Int = 0, skipped: Int = 0) {
        self.received = received
        self.applied = applied
        self.duplicates = duplicates
        self.skipped = skipped
    }
}
