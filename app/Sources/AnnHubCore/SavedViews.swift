// 保存的视图 in the library's left column (desktop.md §4.1, fragments.md §9).
//
// The three views are states derived from the facts at hand; nothing is stored on the
// fragment (fragments.md §9: "UI 不得维护第二份布尔字段"):
//   到期     review.nextReviewAt <= now
//   待加强   the latest rating is again / hard, or lapses > 0
//   新建     review.state == new
// A fragment can be in several at once (every new fragment is due the moment it lands).

import Foundation

public enum SavedView: String, CaseIterable, Identifiable, Sendable {
    case due
    case needsWork
    case new

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .due: return "到期"
        case .needsWork: return "待加强"
        case .new: return "新建"
        }
    }
}

/// The most recent rating of each fragment. Ties on the timestamp go to the larger log id,
/// so two ends computing it from the same logs agree.
public func latestRatings(_ logs: [ReviewLog]) -> [String: ReviewRating] {
    var latest: [String: ReviewLog] = [:]
    for log in logs {
        let id = log.target.fragmentId
        if let current = latest[id], (current.reviewedAt, current.id) >= (log.reviewedAt, log.id) { continue }
        latest[id] = log
    }
    return latest.mapValues(\.rating)
}

public func isInSavedView(
    _ view: SavedView, fragment: FragmentRecord, latestRating: ReviewRating?, now: Int
) -> Bool {
    switch view {
    case .due:
        return fragment.review.nextReviewAt <= now
    case .needsWork:
        return latestRating == .again || latestRating == .hard || fragment.review.lapses > 0
    case .new:
        return fragment.review.state == .new
    }
}

/// `nil` means no view is selected: every fragment passes.
public func filterBySavedView(
    _ fragments: [FragmentRecord], view: SavedView?, logs: [ReviewLog], now: Int
) -> [FragmentRecord] {
    guard let view else { return fragments }
    let ratings = latestRatings(logs)
    return fragments.filter {
        isInSavedView(view, fragment: $0, latestRating: ratings[$0.id], now: now)
    }
}

public func savedViewCounts(
    _ fragments: [FragmentRecord], logs: [ReviewLog], now: Int
) -> [SavedView: Int] {
    let ratings = latestRatings(logs)
    var counts: [SavedView: Int] = [:]
    for view in SavedView.allCases {
        counts[view] =
            fragments.filter {
                isInSavedView(view, fragment: $0, latestRating: ratings[$0.id], now: now)
            }.count
    }
    return counts
}
