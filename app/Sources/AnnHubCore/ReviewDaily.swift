// Daily suggestion budget, session wrap-up facts and local-time labels
// (docs/v2/review.md §5, desktop.md §3 / §5.5). Pure functions: the SwiftUI
// layer only renders what they return.

import Foundation

/// Today's review allowance. The cap limits the day's *suggested* amount; it
/// never blocks the user, who can start another round beyond it.
public struct DailyReviewPlan: Equatable, Sendable {
    public var dailyLimit: Int
    /// Distinct fragments rated since local midnight.
    public var ratedToday: Int
    /// Every fragment with `nextReviewAt <= now`, in the stable queue order.
    public var due: [FragmentRecord]

    public init(dailyLimit: Int, ratedToday: Int, due: [FragmentRecord]) {
        self.dailyLimit = dailyLimit
        self.ratedToday = ratedToday
        self.due = due
    }

    /// Suggested amount still available today.
    public var remaining: Int { max(0, dailyLimit - ratedToday) }
    /// Due items inside today's suggested amount.
    public var suggested: [FragmentRecord] { Array(due.prefix(remaining)) }
    /// Due items held back by the cap (they keep their original `nextReviewAt`).
    public var beyondLimit: Int { due.count - suggested.count }
    /// The suggested amount is used up while due items remain.
    public var limitReached: Bool { remaining == 0 && !due.isEmpty }
}

public func dailyReviewPlan(
    fragments: [FragmentRecord],
    logs: [ReviewLog],
    now: Int,
    dailyLimit: Int = DAILY_LIMIT_DEFAULT,
    calendar: Calendar = .current
) -> DailyReviewPlan {
    let dayStart = startOfLocalDay(now, calendar: calendar)
    var ratedToday = Set<String>()
    for log in logs where log.reviewedAt >= dayStart && log.reviewedAt <= now {
        ratedToday.insert(log.target.fragmentId)
    }
    let due = fragments
        .filter { $0.review.nextReviewAt <= now }
        .sorted(by: dailyQueueOrder)
    return DailyReviewPlan(
        dailyLimit: clampedDailyLimit(dailyLimit),
        ratedToday: ratedToday.count,
        due: due
    )
}

/// Facts shown when a session ends — no streaks, badges or celebration.
public struct SessionWrapUp: Equatable, Sendable {
    public var rated: Int
    public var usedHint: Int
    public var again: Int
    public var skipped: Int
    /// Fragments still due right now.
    public var dueNow: Int
    /// The next due days (at most three), earliest first.
    public var upcoming: [UpcomingDue]

    public init(rated: Int, usedHint: Int, again: Int, skipped: Int, dueNow: Int, upcoming: [UpcomingDue]) {
        self.rated = rated
        self.usedHint = usedHint
        self.again = again
        self.skipped = skipped
        self.dueNow = dueNow
        self.upcoming = upcoming
    }
}

public struct UpcomingDue: Equatable, Sendable {
    /// Local midnight of the due day.
    public var dayStart: Int
    public var count: Int

    public init(dayStart: Int, count: Int) {
        self.dayStart = dayStart
        self.count = count
    }
}

public func sessionWrapUp(
    session: ReviewSessionState,
    logs: [ReviewLog],
    fragments: [FragmentRecord],
    now: Int,
    calendar: Calendar = .current
) -> SessionWrapUp {
    let members = Set(session.fragmentIds)
    // Only ratings committed by this session: its cards, after it started.
    let rated = logs.filter { $0.reviewedAt >= session.startedAt && members.contains($0.target.fragmentId) }

    var dueNow = 0
    var byDay: [Int: Int] = [:]
    for fragment in fragments {
        if fragment.review.nextReviewAt <= now {
            dueNow += 1
        } else {
            byDay[startOfLocalDay(fragment.review.nextReviewAt, calendar: calendar), default: 0] += 1
        }
    }
    let upcoming = byDay
        .sorted { $0.key < $1.key }
        .prefix(3)
        .map { UpcomingDue(dayStart: $0.key, count: $0.value) }

    return SessionWrapUp(
        rated: rated.count,
        usedHint: rated.filter(\.usedHint).count,
        again: rated.filter { $0.rating == .again }.count,
        skipped: session.skipped.count,
        dueNow: dueNow,
        upcoming: Array(upcoming)
    )
}

public func startOfLocalDay(_ ms: Int, calendar: Calendar = .current) -> Int {
    let date = Date(timeIntervalSince1970: Double(ms) / 1000)
    return Int(calendar.startOfDay(for: date).timeIntervalSince1970 * 1000)
}

/// 今天 / 明天 / 昨天 / 周日 (within a week either way) / 10月3日, relative to
/// the local day of `now`.
public func relativeDayLabel(dayStart: Int, now: Int, calendar: Calendar = .current) -> String {
    let today = Date(timeIntervalSince1970: Double(startOfLocalDay(now, calendar: calendar)) / 1000)
    let day = Date(timeIntervalSince1970: Double(dayStart) / 1000)
    let offset = calendar.dateComponents([.day], from: today, to: day).day ?? 0
    switch offset {
    case 0: return "今天"
    case 1: return "明天"
    case -1: return "昨天"
    case (-6)...(-2), 2...6:
        let names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
        return names[(calendar.component(.weekday, from: day) - 1) % 7]
    default:
        let parts = calendar.dateComponents([.month, .day], from: day)
        return "\(parts.month ?? 1)月\(parts.day ?? 1)日"
    }
}
