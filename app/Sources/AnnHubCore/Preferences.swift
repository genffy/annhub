// Desktop preferences that carry rules (docs/v2/desktop.md §8): the daily
// review reminder. The daily limit's range lives with the review contract
// (`clampedDailyLimit`).

import Foundation

/// 每日复习提醒：开关 + 每天的提醒时间。It is the only notification Desktop
/// sends — never capture counts, streaks or marketing.
public struct ReviewReminder: Codable, Equatable, Sendable {
    public static let defaultHour = 20
    public static let defaultMinute = 30

    public var enabled: Bool
    public var hour: Int
    public var minute: Int

    public init(enabled: Bool = false, hour: Int = ReviewReminder.defaultHour, minute: Int = ReviewReminder.defaultMinute) {
        self.enabled = enabled
        self.hour = min(max(hour, 0), 23)
        self.minute = min(max(minute, 0), 59)
    }

    enum CodingKeys: String, CodingKey { case enabled, hour, minute }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            enabled: try container.decode(Bool.self, forKey: .enabled),
            hour: try container.decode(Int.self, forKey: .hour),
            minute: try container.decode(Int.self, forKey: .minute)
        )
    }

    /// "20:30"
    public var timeLabel: String {
        String(format: "%02d:%02d", hour, minute)
    }
}
