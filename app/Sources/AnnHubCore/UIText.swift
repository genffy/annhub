// The Desktop app's wording in both interface languages (docs/v2 D-15). Every case carries its
// Chinese and its English text side by side, so a missing translation cannot compile: the switch in
// `message` must return both. `{name}` marks a parameter; a message with `one:` has a separate
// English singular, chosen when the `count` parameter is 1. Views and Core call `t(.key, [...])`;
// no user-visible string is written inline.

import Foundation

public enum UIText: CaseIterable, Sendable {

    // Kind names (kinds.md §4)
    case kindConcept
    case kindClaim
    case kindProcedure
    case kindDecision
    case kindQuestion
    case kindInspiration
    case kindVisual
    case kindMediaClip
    case kindExcerpt

    // Review status and sync phase
    case statusDue
    case statusNew
    case statusLearning
    case statusScheduled
    case syncLocalFirst
    case syncPending
    case syncError
    case syncSynced

    // Review wording built in Core (desktop.md §5.3)
    case verificationNone
    case verificationConfirmed
    case verificationSummary
    case verificationNoSummary

    // Navigation
    case sectionToday
    case sectionLibrary
    case sectionSystem
    case preferences

    // Today (desktop.md §3)
    case todayTodo
    case todayRecent
    case todayEmpty
    case todaySecondary
    case weeklyRetrieved
    case dueReviews
    case noDueToday
    case limitReached
    case suggestedLine
    case beyondLimit
    case extraRound
    case tidyRecent
    case startReview
    case overdueTopics
    case resumeReview

    // Library (desktop.md §4)
    case columnContent
    case columnKind
    case columnSource
    case columnTags
    case columnReview
    case columnCapturedAt
    case columnsMenu
    case tagSeparator
    case emptyTitle
    case emptyStep1
    case emptyStep2
    case emptyNote
    case openSystemPage
    case copied
    case copyPairingCode
    case listeningWaiting
    case searchPrompt
    case deleteTitle
    case deleteConfirm
    case clearFilters
    case noMatch
    case shownLine
    case showMore
    case viewDetails
    case deleteLocalCopy
    case selectOne

    // Fragment detail (desktop.md §4.3)
    case detailTimeRange
    case detailUse
    case detailVerified
    case confirmedAt
    case summaryLabel
    case notesLabel
    case notConfirmed
    case detailContext
    case backToSource
    case detailReview
    case repetitions
    case lapses
    case lastReviewed
    case nextDue
    case noneLabel
    case questionStatusLine
    case questionOpen
    case questionTesting
    case questionAnswered
    case imageAsset
    case attachmentMissingId
    case attachmentMissing
    case close
    case verifiedSourceMaterial
    case verifiedModel
    case verifiedManual

    // Review session (desktop.md §5)
    case hintUsed
    case skip
    case end
    case skipManual
    case skipDeleted
    case topicLine
    case promptVisual
    case promptMedia
    case promptDefault
    case imageHidden
    case hintButton
    case reveal
    case hint1
    case hint2
    case hint2NoTags
    case hintTopic
    case hint2Label
    case hint3
    case hint3Label
    case hint4
    case hint4Label
    case yourUnderstanding
    case verificationNotConfirmed
    case verificationLine
    case verificationLineSummary
    case yourUse
    case timeRangeLine
    case unknownRange
    case ratingAgain
    case ratingHard
    case ratingGood
    case ratingEasy
    case intervalDays
    case wrapTitle
    case wrapRated
    case wrapSkipped
    case upcomingNone
    case upcomingLine
    case upcomingPart
    case backToToday
    case continueNext

    // System (desktop.md §6)
    case rotateTitle
    case regenerate
    case cancel
    case rotateMessage
    case sectionConnection
    case serviceRunning
    case pairingCode
    case hide
    case show
    case copy
    case lastExtensionConnection
    case noneYet
    case sectionDelivery
    case deliverySummary
    case attentionNone
    case attentionLine
    case noDeliveries
    case technicalInfo
    case serviceAddress
    case device
    case databaseVersion
    case contractVersion
    case localFragments
    case reviewLogs
    case imageAssets
    case deletionMarks
    case pendingChanges
    case pulledCursor
    case lastExtensionPull
    case eventsReceived
    case eventsLine
    case noDeliveryErrors
    case deliveryErrorDetails
    case hubNotStarted
    case hubFailed
    case hubBindFailed
    case attentionHubDown
    case attentionMissingImages
    case attentionRejected

    // Preferences (desktop.md §8.2) and the menu bar
    case dailyLimit
    case dailyLimitCount
    case dailyLimitNote
    case dailyReminder
    case everyDay
    case reminderTime
    case reminderNote
    case reminderBody
    case localService
    case serviceRunningState
    case lastConnection
    case openMainWindow
    case quit
    case received
    case rejectedStatus

    // Review fallbacks and relative days
    case reviewFallbackQuestion
    case today
    case tomorrow
    case yesterday
}

extension UIText {
    public var message: UIMessage {
        switch self {
        case .kindConcept: return m("概念", "Concept")
        case .kindClaim: return m("论点", "Claim")
        case .kindProcedure: return m("方法", "Procedure")
        case .kindDecision: return m("决策", "Decision")
        case .kindQuestion: return m("问题", "Question")
        case .kindInspiration: return m("灵感", "Inspiration")
        case .kindVisual: return m("视觉", "Visual")
        case .kindMediaClip: return m("媒体片段", "Media clip")
        case .kindExcerpt: return m("摘录", "Excerpt")
        case .statusDue: return m("到期", "Due")
        case .statusNew: return m("新建", "New")
        case .statusLearning: return m("学习中", "Learning")
        case .statusScheduled: return m("复习中", "In review")
        case .syncLocalFirst: return m("本地优先（未配置同步端点）", "Local-first (no sync endpoint configured)")
        case .syncPending: return m("待同步", "Pending sync")
        case .syncError: return m("同步错误", "Sync error")
        case .syncSynced: return m("已同步", "Synced")
        case .verificationNone: return m("核验确认状态：未核验", "Verification status: not verified")
        case .verificationConfirmed:
            return m("核验确认状态：已确认（来源：{source}）", "Verification status: confirmed (source: {source})")
        case .verificationSummary: return m("摘要：{summary}", "Summary: {summary}")
        case .verificationNoSummary:
            return m("已确认，无摘要 — 回看原始语境", "Confirmed, no summary — look back at the original context")
        case .sectionToday: return m("今日", "Today")
        case .sectionLibrary: return m("碎片库", "Fragment library")
        case .sectionSystem: return m("系统", "System")
        case .preferences: return m("偏好设置…", "Settings…")
        case .todayTodo: return m("今天需要完成什么", "What to do today")
        case .todayRecent: return m("最近由扩展写入", "Recently written by the extension")
        case .todayEmpty:
            return m(
                "还没有碎片。扩展保存后会逐条出现在这里。", "No Fragments yet. They appear here one by one as the extension saves them.")
        case .todaySecondary: return m("次要信息", "Secondary info")
        case .weeklyRetrieved:
            return m(
                "本周成功提取 {count} 个碎片", "{count} Fragments retrieved this week",
                one: "{count} Fragment retrieved this week")
        case .dueReviews: return m("到期复习", "Due reviews")
        case .noDueToday: return m("今天没有到期复习", "No reviews due today")
        case .limitReached:
            return m(
                "建议量 {rated} / {limit}；还有 {due} 条到期，保留原到期时间，明天继续",
                "Suggested amount {rated} / {limit}; {due} still due — their due dates are kept, continue tomorrow")
        case .suggestedLine:
            return m(
                "{count} 条 · 预计 {minutes} 分钟", "{count} reviews · about {minutes} min",
                one: "{count} review · about {minutes} min")
        case .beyondLimit:
            return m("另有 {count} 条超出今日建议量，明天继续", "{count} more beyond today’s suggested amount — continue tomorrow")
        case .extraRound: return m("再来一轮（超出建议量）", "One more round (beyond the suggested amount)")
        case .tidyRecent: return m("整理最近碎片", "Tidy recent Fragments")
        case .startReview: return m("开始复习", "Start review")
        case .overdueTopics: return m("逾期主题：{topics}", "Overdue topics: {topics}")
        case .resumeReview: return m("继续复习 {cursor}/{total}", "Resume review {cursor}/{total}")
        case .columnContent: return m("内容", "Content")
        case .columnKind: return m("类型", "Kind")
        case .columnSource: return m("来源", "Source")
        case .columnTags: return m("标签", "Tags")
        case .columnReview: return m("复习", "Review")
        case .columnCapturedAt: return m("采集时间", "Captured")
        case .columnsMenu: return m("列", "Columns")
        case .tagSeparator: return m("、", ", ")
        case .emptyTitle: return m("还没有碎片。", "No Fragments yet.")
        case .emptyStep1:
            return m(
                "1. 在 Chrome 中安装 AnnHub 扩展，保存第一个碎片",
                "1. Install the AnnHub extension in Chrome and save your first Fragment")
        case .emptyStep2:
            return m(
                "2. 在“系统”页复制配对码，输入到扩展", "2. Copy the pairing code on the “System” page and enter it in the extension")
        case .emptyNote:
            return m(
                "扩展里的碎片会在这里逐条出现；没有 Desktop 时扩展也能独立使用。",
                "Fragments from the extension appear here one by one; the extension also works on its own without Desktop."
            )
        case .openSystemPage: return m("打开系统页", "Open the System page")
        case .copied: return m("已复制", "Copied")
        case .copyPairingCode: return m("复制配对码", "Copy pairing code")
        case .listeningWaiting:
            return m("正在监听 127.0.0.1 · 等待第一条碎片", "Listening on 127.0.0.1 · waiting for the first Fragment")
        case .searchPrompt: return m("搜索内容/核验/应用/标签", "Search content, verification, application, tags")
        case .deleteTitle: return m("删除本地副本？", "Delete the local copy?")
        case .deleteConfirm:
            return m(
                "删除本地副本（复习日志一并删除，扩展重试将被拒绝）",
                "Delete the local copy (its review log goes too; the extension’s retries will be rejected)")
        case .clearFilters: return m("清除筛选", "Clear filters")
        case .noMatch: return m("没有符合条件的碎片", "No matching Fragments")
        case .shownLine:
            return m(
                "已显示 {shown} / 符合 {matching} / 共 {total} 条", "Showing {shown} / {matching} matching / {total} total")
        case .showMore: return m("显示更多", "Show more")
        case .viewDetails: return m("查看详情", "View details")
        case .deleteLocalCopy: return m("删除本地副本…", "Delete local copy…")
        case .selectOne: return m("选择一条碎片查看详情", "Select a Fragment to see its details")
        case .detailTimeRange: return m("时间区间", "Time range")
        case .detailUse: return m("用户应用", "Your application")
        case .detailVerified: return m("核验确认", "Verification")
        case .confirmedAt: return m("确认时间", "Confirmed at")
        case .summaryLabel: return m("摘要", "Summary")
        case .notesLabel: return m("备注", "Notes")
        case .notConfirmed: return m("未确认", "Not confirmed")
        case .detailContext: return m("原始语境", "Original context")
        case .backToSource: return m("回到来源：{host}", "Back to source: {host}")
        case .detailReview: return m("复习摘要", "Review summary")
        case .repetitions: return m("复习次数", "Reviews")
        case .lapses: return m("失误次数", "Lapses")
        case .lastReviewed: return m("上次复习", "Last reviewed")
        case .nextDue: return m("下次到期", "Next due")
        case .noneLabel: return m("无", "None")
        case .questionStatusLine: return m("状态：{status}", "Status: {status}")
        case .questionOpen: return m("待验证", "To verify")
        case .questionTesting: return m("验证中", "Testing")
        case .questionAnswered: return m("已回答", "Answered")
        case .imageAsset: return m("图片资产 {id}", "Image asset {id}")
        case .attachmentMissingId: return m("附件缺失，待重试（{id}）", "Attachment missing, waiting for a retry ({id})")
        case .attachmentMissing: return m("附件缺失，待重试", "Attachment missing, waiting for a retry")
        case .close: return m("关闭", "Close")
        case .verifiedSourceMaterial: return m("原文材料", "Source material")
        case .verifiedModel: return m("模型建议（已确认）", "Model suggestion (confirmed)")
        case .verifiedManual: return m("手工核对", "Manual check")
        case .hintUsed: return m("已用提示", "Hint used")
        case .skip: return m("跳过", "Skip")
        case .end: return m("结束", "End")
        case .skipManual: return m("手动跳过", "Skipped by hand")
        case .skipDeleted: return m("碎片已删除", "Fragment deleted")
        case .topicLine: return m("主题：{topic}", "Topic: {topic}")
        case .promptVisual:
            return m("先回忆，再揭示查看文字描述与截图。", "Recall first, then reveal to see the description and the screenshot.")
        case .promptMedia:
            return m(
                "先回忆要点与时间定位，再揭示核对转写。",
                "Recall the key points and where they sit in time first, then reveal to check the transcript.")
        case .promptDefault: return m("先自己作答，再点「揭示」", "Answer on your own first, then press “Reveal”")
        case .imageHidden: return m("图片已遮挡", "Image hidden")
        case .hintButton: return m("提示 {level}：{hint}", "Hint {level}: {hint}")
        case .reveal: return m("揭示", "Reveal")
        case .hint1: return m("提示 1（{label}）：回忆{label}相关的结构。", "Hint 1 ({label}): recall the structure around {label}.")
        case .hint2: return m("提示 2（{label}）：来源「{title}」{tags}", "Hint 2 ({label}): source “{title}” {tags}")
        case .hint2NoTags: return m("无标签", "no tags")
        case .hintTopic: return m("主题", "Topic")
        case .hint2Label: return m("上下文", "Context")
        case .hint3: return m("提示 3（{label}）：{excerpt}", "Hint 3 ({label}): {excerpt}")
        case .hint3Label: return m("原文", "Original text")
        case .hint4: return m("提示 4（{label}）：{text}", "Hint 4 ({label}): {text}")
        case .hint4Label: return m("核验确认", "Verification status")
        case .yourUnderstanding: return m("你的理解：{content}", "Your understanding: {content}")
        case .verificationNotConfirmed: return m("核验：未确认", "Verification: not confirmed")
        case .verificationLine: return m("核验：已确认，来源：{source}", "Verification: confirmed, source: {source}")
        case .verificationLineSummary: return m("；摘要：{summary}", "; summary: {summary}")
        case .yourUse: return m("你的应用：{use}", "Your application: {use}")
        case .timeRangeLine: return m("时间区间：{range}", "Time range: {range}")
        case .unknownRange: return m("未知区间", "Unknown range")
        case .ratingAgain: return m("再来一次", "Again")
        case .ratingHard: return m("较难", "Hard")
        case .ratingGood: return m("良好", "Good")
        case .ratingEasy: return m("容易", "Easy")
        case .intervalDays: return m("{count} 天", "{count} days", one: "{count} day")
        case .wrapTitle: return m("这一轮完成了", "Round complete")
        case .wrapRated:
            return m(
                "已评分 {rated} 条 / 其中 {hint} 条用过提示 / {again} 条「再来一次」",
                "Rated {rated} / {hint} with hints / {again} marked “Again”")
        case .wrapSkipped: return m("跳过 {count} 条（碎片已删除或手动跳过）", "Skipped {count} (Fragment deleted or skipped by hand)")
        case .upcomingNone: return m("下一批到期：暂无", "Next due: nothing yet")
        case .upcomingLine: return m("下一批到期：{parts}", "Next due: {parts}")
        case .upcomingPart: return m("{day} {count} 条", "{day}: {count}")
        case .backToToday: return m("回到今日", "Back to Today")
        case .continueNext: return m("继续下一会话（还有 {due} 条到期）", "Continue with the next session ({due} still due)")
        case .rotateTitle: return m("重新生成配对码？", "Generate a new pairing code?")
        case .regenerate: return m("重新生成", "Regenerate")
        case .cancel: return m("取消", "Cancel")
        case .rotateMessage:
            return m(
                "旧的扩展连接会失效，需要在扩展设置里输入新配对码。本地数据与待发送任务保留。",
                "The old extension connection stops working; enter the new code in the extension’s settings. Local data and pending deliveries are kept."
            )
        case .sectionConnection: return m("连接", "Connection")
        case .serviceRunning: return m("本地服务运行中，仅监听本机", "The local service is running and only listens on this Mac")
        case .pairingCode: return m("配对码", "Pairing code")
        case .hide: return m("隐藏", "Hide")
        case .show: return m("显示", "Show")
        case .copy: return m("复制", "Copy")
        case .lastExtensionConnection: return m("最近扩展连接", "Last extension connection")
        case .noneYet: return m("暂无", "None yet")
        case .sectionDelivery: return m("最近交付", "Recent deliveries")
        case .deliverySummary:
            return m(
                "碎片 {fragments} 条已接收 / 图片 {assets} 张已接收 / 缺失图片 {missing}",
                "Fragments received {fragments} / images received {assets} / missing images {missing}")
        case .attentionNone: return m("需要处理：无", "Needs attention: none")
        case .attentionLine: return m("需要处理：{issue}", "Needs attention: {issue}")
        case .noDeliveries: return m("暂无逐项写入记录。", "No per-item writes yet.")
        case .technicalInfo: return m("技术信息", "Technical info")
        case .serviceAddress: return m("服务地址", "Service address")
        case .device: return m("设备", "Device")
        case .databaseVersion: return m("数据库版本", "Database version")
        case .contractVersion: return m("契约版本", "Contract version")
        case .localFragments: return m("本地碎片", "Local Fragments")
        case .reviewLogs: return m("复习日志", "Review logs")
        case .imageAssets: return m("图片资产", "Image assets")
        case .deletionMarks: return m("本地删除标记", "Local deletion marks")
        case .pendingChanges: return m("待扩展拉取的变更", "Changes waiting for the extension")
        case .pulledCursor: return m("已拉取游标", "Pulled cursor")
        case .lastExtensionPull: return m("最近扩展拉取", "Last extension pull")
        case .eventsReceived: return m("/v1/events 接收", "/v1/events received")
        case .eventsLine:
            return m(
                "接收 {received} · 应用 {applied} · 重复 {duplicates} · 跳过 {skipped}",
                "Received {received} · applied {applied} · duplicates {duplicates} · skipped {skipped}")
        case .noDeliveryErrors: return m("没有交付错误。", "No delivery errors.")
        case .deliveryErrorDetails: return m("交付错误明细", "Delivery error details")
        case .hubNotStarted: return m("未启动", "Not started")
        case .hubFailed: return m("启动失败：{error}", "Failed to start: {error}")
        case .hubBindFailed:
            return m("无法监听 127.0.0.1:8765（端口被占用？）", "Cannot listen on 127.0.0.1:8765 (is the port in use?)")
        case .attentionHubDown: return m("本地服务没有启动（{state}）", "The local service did not start ({state})")
        case .attentionMissingImages:
            return m(
                "有 {count} 张图片尚未到达，扩展重试后会补上",
                "{count} images have not arrived; the extension will fill them in on retry",
                one: "{count} image has not arrived; the extension will fill it in on retry")
        case .attentionRejected:
            return m(
                "最近一次写入被拒绝：扩展里的配对码与这里不一致，请重新输入",
                "The last write was rejected: the pairing code in the extension does not match this one — enter it again"
            )
        case .dailyLimit: return m("每日建议上限", "Daily suggested limit")
        case .dailyLimitCount: return m("{count} 条", "{count} reviews", one: "{count} review")
        case .dailyLimitNote:
            return m(
                "限制当天的建议量，不强制同一会话做完；单次会话按每条 45 秒估算，最多约 13 条。",
                "Limits the amount suggested per day; a session need not finish it. A session is estimated at 45 s per card, about 13 cards at most."
            )
        case .dailyReminder: return m("每日复习提醒", "Daily review reminder")
        case .everyDay: return m("每天", "Every day")
        case .reminderTime: return m("提醒时间", "Reminder time")
        case .reminderNote:
            return m(
                "只发复习提醒，不发采集数量、连续使用天数或营销通知。",
                "Only review reminders — no capture counts, streaks or marketing notifications.")
        case .reminderBody:
            return m("到了复习的时间，打开 AnnHub 查看今天的复习。", "It’s time to review — open AnnHub to see today’s reviews.")
        case .localService: return m("本地服务", "Local service")
        case .serviceRunningState: return m("运行中 · {state}", "Running · {state}")
        case .lastConnection: return m("最近连接", "Last connection")
        case .openMainWindow: return m("打开主窗口", "Open main window")
        case .quit: return m("退出 AnnHub", "Quit AnnHub")
        case .received: return m("已接收", "Received")
        case .rejectedStatus: return m("被拒绝（{status}）", "Rejected ({status})")
        case .reviewFallbackQuestion: return m("回忆这条碎片的关键内容。", "Recall the key content of this Fragment.")
        case .today: return m("今天", "Today")
        case .tomorrow: return m("明天", "Tomorrow")
        case .yesterday: return m("昨天", "Yesterday")
        }
    }
}

private func m(_ zh: String, _ en: String, one: String? = nil) -> UIMessage {
    UIMessage(zh: zh, en: en, enOne: one)
}
