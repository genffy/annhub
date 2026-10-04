// Time helper and the north-star metric (docs/v2/metrics.md §4, M-18).

import Foundation

func currentMs() -> Int {
    Int(Date().timeIntervalSince1970 * 1000)
}

/// ISO-week start (Monday 00:00) in the local timezone — metrics.md §4.
public func isoWeekStart(_ now: Int? = nil, calendar baseCalendar: Calendar? = nil) -> Int {
    let ms = now ?? currentMs()
    var calendar = baseCalendar ?? Calendar(identifier: .iso8601)
    calendar.firstWeekday = 2
    let date = Date(timeIntervalSince1970: Double(ms) / 1000)
    let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date
    return Int(start.timeIntervalSince1970 * 1000)
}

/// Weekly Retrieved Fragments (M-18): distinct fragments with at least one
/// review rating of `good` or `easy` inside the current ISO week (Monday 00:00
/// local → now). `again` / `hard` never count; several successes of one
/// fragment count once. Logs of deleted fragments are removed with the
/// fragment, so they are excluded by construction.
public func weeklyRetrievedFragmentCount(_ logs: [ReviewLog], now: Int? = nil, calendar: Calendar? = nil) -> Int {
    let now = now ?? currentMs()
    let weekStart = isoWeekStart(now, calendar: calendar)
    var retrieved = Set<String>()
    for log in logs where log.reviewedAt >= weekStart && log.reviewedAt <= now {
        if log.rating == .good || log.rating == .easy { retrieved.insert(log.target.fragmentId) }
    }
    return retrieved.count
}
