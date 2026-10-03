// R3 change-feed shapes — mirrors learning-core/sync.ts DesktopChange
// (docs/v2/storage.md §9). The Desktop ORIGINATES these rows; the extension
// merges them through applyDesktopChanges. Field names are camelCase and must
// stay byte-identical to the TS interfaces: fragmentId / review / log / task /
// relation / relationId / suppression / fragment.

import Foundation

public enum DesktopChangeType: String, Codable, Sendable {
    case reviewRated = "review.rated"
    case writingCreated = "writing.created"
    case writingSubmitted = "writing.submitted"
    case relationCreated = "relation.created"
    case relationUpdated = "relation.updated"
    case relationDeleted = "relation.deleted"
    case suppressionSync = "suppression.sync"
    case fragmentCreated = "fragment.created"
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

/// writing.created / writing.submitted — payload = the full task JSON.
public struct WritingChangedPayload: Codable, Equatable, Sendable {
    public var task: WritingTaskRecord

    public init(task: WritingTaskRecord) {
        self.task = task
    }
}

/// relation.created / relation.updated — CONFIRMED relations only; suggested
/// candidates never travel (storage.md §9).
public struct RelationChangedPayload: Codable, Equatable, Sendable {
    public var relation: FragmentRelation

    public init(relation: FragmentRelation) {
        self.relation = relation
    }
}

public struct RelationDeletedPayload: Codable, Equatable, Sendable {
    public var relationId: String

    public init(relationId: String) {
        self.relationId = relationId
    }
}

public struct SuppressionSyncPayload: Codable, Equatable, Sendable {
    public var suppression: RelationSuppression

    public init(suppression: RelationSuppression) {
        self.suppression = suppression
    }
}

/// fragment.created — Desktop-created fragment in full (incl. review), e.g. a
/// question draft from output feedback (annhub://writing-task source).
public struct FragmentCreatedPayload: Codable, Equatable, Sendable {
    public var fragment: FragmentRecord

    public init(fragment: FragmentRecord) {
        self.fragment = fragment
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
