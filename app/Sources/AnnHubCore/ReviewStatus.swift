// Review status of a fragment for the Desktop library (desktop.md §4.1,
// search.md §2): computed from the local SQLite facts, never from an extension
// cache. The four values are mutually exclusive, so a multi-select filter over
// them behaves like the other dimensions (OR within, AND across).

import Foundation

public enum ReviewStatus: String, CaseIterable, Sendable {
    /// `nextReviewAt <= now` — in the review queue today.
    case due
    /// Never rated, not yet due.
    case new
    /// Failed recently and being relearned.
    case learning
    /// Rated and scheduled for later.
    case scheduled

    public var label: String {
        switch self {
        case .due: return "到期"
        case .new: return "新建"
        case .learning: return "学习中"
        case .scheduled: return "复习中"
        }
    }
}

public func reviewStatus(of fragment: FragmentRecord, now: Int) -> ReviewStatus {
    if fragment.review.nextReviewAt <= now { return .due }
    switch fragment.review.state {
    case .new: return .new
    case .learning, .relearning: return .learning
    case .review: return .scheduled
    }
}

/// An empty set means "no review filter".
public func filterByReviewStatus(
    _ fragments: [FragmentRecord], statuses: Set<ReviewStatus>, now: Int
) -> [FragmentRecord] {
    guard !statuses.isEmpty else { return fragments }
    return fragments.filter { statuses.contains(reviewStatus(of: $0, now: now)) }
}
