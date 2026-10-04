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
    case reveal
    case hintTopic
    case hint2Label
    case hint3Label
    case hint4Label
    case yourUnderstanding
    case verificationNotConfirmed
    case verificationLine
    case verificationLineSummary
    case yourUse
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
    case hubPortInUse
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

    // Kind detail fields (kinds.md §4; the names the capture form uses)
    case fieldNote
    case fieldDefinition
    case fieldBoundaries
    case fieldExamples
    case fieldCounterExamples
    case fieldStance
    case fieldEvidence
    case fieldAssumptions
    case fieldSteps
    case fieldPrerequisites
    case fieldFailureModes
    case fieldRationale
    case fieldAlternatives
    case fieldConsequences
    case fieldStatus
    case fieldHypothesis
    case fieldNextStep
    case fieldAnswer
    case fieldForm
    case fieldTrigger
    case fieldTranscript
    case stanceSupport
    case stanceOppose
    case stanceUncertain
    case formIdea
    case formReflection

    // Joining words (punctuation differs by language)
    case labeledLine
    case labeledBlock
    case clauseSeparator
    case semicolon
    case sourceWithTitle

    // Hint ladder content (desktop.md §5.3, kinds.md §4)
    case hintBoundaryCount
    case hintExampleCount
    case hintCounterExampleCount
    case hintRecorded
    case hintConceptThink
    case hintNoDefinition
    case hintYourStance
    case hintNoEvidence
    case hintFirstOfEvidence
    case hintStepCount
    case hintPreconditionCount
    case hintFirstStep
    case hintNoSteps
    case hintInferredConstraint
    case hintOriginalBackground
    case hintNoRationale
    case hintNoEvidenceYet
    case hintNoConclusion
    case hintImageCount
    case hintNoImage
    case hintImageBelow
    case hintRevised
    case hintNoRevisions
    case hintNoTrigger
    case hintProgress
    case nextHint
    case hintHeading

    // Search fields and the command palette (desktop.md §9)
    case searchFieldGuess
    case searchFieldVerified
    case searchFieldUse
    case searchFieldSourceTitle
    case searchFieldExcerpt
    case paletteResume
    case paletteDue
    case paletteGoToday
    case paletteGoLibrary
    case paletteOpenPreferences
    case paletteTitle
    case palettePrompt
    case paletteFieldLabel
    case paletteNoResults
    case paletteRecent
    case paletteMatches
    case paletteMore
    case paletteCommands
    case paletteKeySelect
    case paletteKeyOpen
    case paletteKeyClose
    case paletteScope
    case paletteHit
    case searchAndCommands
    case searchAndCommandsHelp
    case searchAndCommandsMenu
    case menuGo

    // Saved views and bulk actions in the library (desktop.md §4.1, §4.4)
    case savedViews
    case savedViewNeedsWork
    case savedViewCount
    case batchDeleteTitle
    case batchDeleteConfirm
    case batchDeleted
    case batchDeleteMessage
    case addTagsMenu
    case removeTagsMenu
    case deleteCopiesMenu
    case selectedFragments
    case selectedCount
    case addTagsButton
    case removeTagsButton
    case deleteButton
    case batchActions
    case tagsNotSaved
    case tagsAdded
    case tagsRemoved
    case tagsUnchanged
    case tagsFull
    case kindDetails
    case addTagsTitle
    case removeTagsTitle
    case tagsFieldPrompt
    case removeTagsFieldPrompt
    case libraryTagsHeader
    case selectionTagsHeader
    case tagsWillAdd
    case tagsWillRemove
    case tagsLocalNote
    case addAction
    case removeAction

    // The local service (desktop.md §6)
    case hubStarting
    case retryStart
    case storeOpenFailed
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
            return m(
                "已确认，无摘要 — 回看原始语境：{excerpt}",
                "Confirmed, no summary — look back at the original context: {excerpt}")
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
        case .reveal: return m("揭示", "Reveal")
        case .hintTopic: return m("主题", "Topic")
        case .hint2Label: return m("上下文", "Context")
        case .hint3Label: return m("原文", "Original text")
        case .hint4Label: return m("核验确认", "Verification status")
        case .yourUnderstanding: return m("你的理解：{content}", "Your understanding: {content}")
        case .verificationNotConfirmed: return m("核验：未确认", "Verification: not confirmed")
        case .verificationLine: return m("核验：已确认，来源：{source}", "Verification: confirmed, source: {source}")
        case .verificationLineSummary: return m("；摘要：{summary}", "; summary: {summary}")
        case .yourUse: return m("你的应用：{use}", "Your application: {use}")
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
        case .hubPortInUse:
            return m(
                "端口 {port} 已被占用（另一个 AnnHub 或其他程序在使用）",
                "Port {port} is already in use (another AnnHub or another program is using it)")
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
        case .fieldNote: return m("注释", "Annotation")
        case .fieldDefinition: return m("定义", "Definition")
        case .fieldBoundaries: return m("适用边界", "Boundaries")
        case .fieldExamples: return m("示例", "Examples")
        case .fieldCounterExamples: return m("反例", "Counterexamples")
        case .fieldStance: return m("立场", "Stance")
        case .fieldEvidence: return m("证据", "Evidence")
        case .fieldAssumptions: return m("前提", "Assumptions")
        case .fieldSteps: return m("步骤", "Steps")
        case .fieldPrerequisites: return m("适用条件", "Preconditions")
        case .fieldFailureModes: return m("失败模式", "Failure modes")
        case .fieldRationale: return m("决策理由", "Rationale")
        case .fieldAlternatives: return m("备选项", "Alternatives")
        case .fieldConsequences: return m("后果", "Consequences")
        case .fieldStatus: return m("状态", "Status")
        case .fieldHypothesis: return m("当前假设", "Current hypothesis")
        case .fieldNextStep: return m("下一步验证", "Next verification")
        case .fieldAnswer: return m("结论", "Conclusion")
        case .fieldForm: return m("形式", "Form")
        case .fieldTrigger: return m("触发背景", "Trigger background")
        case .fieldTranscript: return m("转写节选", "Transcript excerpt")
        case .stanceSupport: return m("支持", "Support")
        case .stanceOppose: return m("反对", "Oppose")
        case .stanceUncertain: return m("存疑", "Uncertain")
        case .formIdea: return m("想法", "Idea")
        case .formReflection: return m("随感", "Reflection")
        case .labeledLine: return m("{label}：{text}", "{label}: {text}")
        case .labeledBlock: return m("{label}：\n{text}", "{label}:\n{text}")
        case .clauseSeparator: return m("，", ", ")
        case .semicolon: return m("；", "; ")
        case .sourceWithTitle: return m("《{title}》· {host}", "“{title}” · {host}")
        case .hintBoundaryCount: return m("适用边界 {count} 条", "{count} boundaries", one: "{count} boundary")
        case .hintExampleCount: return m("示例 {count} 个", "{count} examples", one: "{count} example")
        case .hintCounterExampleCount:
            return m("反例 {count} 个", "{count} counterexamples", one: "{count} counterexample")
        case .hintRecorded: return m("记录了{parts}", "Recorded: {parts}")
        case .hintConceptThink:
            return m(
                "想想它出现在什么场景、和哪些概念相邻", "Think about the situations it shows up in and which concepts sit next to it")
        case .hintNoDefinition:
            return m(
                "没有记录定义与示例，回看原始语境：{excerpt}",
                "No definition or examples were recorded — look back at the original context: {excerpt}")
        case .hintYourStance: return m("你的立场：{stance}", "Your stance: {stance}")
        case .hintNoEvidence: return m("没有记录证据片段", "No evidence excerpt was recorded")
        case .hintFirstOfEvidence:
            return m("{first}\n（共 {count} 条证据，这是其中第一条）", "{first}\n({count} pieces of evidence — this is the first)")
        case .hintStepCount: return m("共 {count} 步", "{count} steps", one: "{count} step")
        case .hintPreconditionCount: return m("适用条件 {count} 项", "{count} preconditions", one: "{count} precondition")
        case .hintFirstStep: return m("第 1 步：{step}", "Step 1: {step}")
        case .hintNoSteps: return m("没有记录步骤", "No steps were recorded")
        case .hintInferredConstraint: return m("你当时推断的约束：{guess}", "The constraint you inferred then: {guess}")
        case .hintOriginalBackground: return m("原文背景：{context}", "Original background: {context}")
        case .hintNoRationale: return m("没有记录理由", "No rationale was recorded")
        case .hintNoEvidenceYet: return m("还没有记录证据", "No evidence has been recorded yet")
        case .hintNoConclusion: return m("还没有结论", "No conclusion yet")
        case .hintImageCount: return m("共 {count} 张图", "{count} images", one: "{count} image")
        case .hintNoImage: return m("没有关联的原图", "No original image is attached")
        case .hintImageBelow: return m("原图见下方", "The original image is shown below")
        case .hintRevised:
            return m(
                "此后修订过 {count} 次（现为第 {version} 版）", "Revised {count} times since (now version {version})",
                one: "Revised {count} time since (now version {version})")
        case .hintNoRevisions: return m("没有后续修订", "No later revisions")
        case .hintNoTrigger: return m("没有记录触发背景", "No trigger background was recorded")
        case .hintProgress: return m("提示 {level}/{max}", "Hint {level}/{max}")
        case .nextHint: return m("再给一级提示", "One more hint")
        case .hintHeading: return m("提示 {level}/{max} · {title}", "Hint {level}/{max} · {title}")
        case .searchFieldGuess: return m("理解", "Understanding")
        case .searchFieldVerified: return m("核验", "Verification")
        case .searchFieldUse: return m("应用", "Application")
        case .searchFieldSourceTitle: return m("来源标题", "Source title")
        case .searchFieldExcerpt: return m("摘录", "Excerpt")
        case .paletteResume: return m("继续复习", "Resume review")
        case .paletteDue: return m("{count} 条到期", "{count} due")
        case .paletteGoToday: return m("打开今日", "Open Today")
        case .paletteGoLibrary: return m("打开碎片库", "Open the Fragment library")
        case .paletteOpenPreferences: return m("打开偏好设置", "Open Settings")
        case .paletteTitle: return m("命令面板", "Command palette")
        case .palettePrompt: return m("搜索碎片，或输入命令", "Search Fragments, or type a command")
        case .paletteFieldLabel: return m("搜索碎片与命令", "Search Fragments and commands")
        case .paletteNoResults: return m("没有匹配的碎片或命令", "No matching Fragments or commands")
        case .paletteRecent: return m("最近的碎片", "Recent Fragments")
        case .paletteMatches: return m("碎片 · {count} 条匹配", "Fragments · {count} matching")
        case .paletteMore: return m("还有 {count} 条，缩小关键词可以更快找到", "{count} more — narrow the keywords to find it faster")
        case .paletteCommands: return m("命令", "Commands")
        case .paletteKeySelect: return m("↑↓ 选择", "↑↓ select")
        case .paletteKeyOpen: return m("↵ 打开", "↵ open")
        case .paletteKeyClose: return m("esc 关闭", "esc close")
        case .paletteScope:
            return m(
                "搜索范围：内容 · 理解 · 核验 · 应用 · 标签 · 来源",
                "Searches: content · understanding · verification · application · tags · source")
        case .paletteHit: return m("命中：{fields}", "Matched: {fields}")
        case .searchAndCommands: return m("搜索与命令", "Search and commands")
        case .searchAndCommandsHelp: return m("搜索碎片与命令（⌘K）", "Search Fragments and commands (⌘K)")
        case .searchAndCommandsMenu: return m("搜索与命令…", "Search and commands…")
        case .menuGo: return m("前往", "Go")
        case .savedViews: return m("保存的视图", "Saved views")
        case .savedViewNeedsWork: return m("待加强", "Needs work")
        case .savedViewCount: return m("{view}，{count} 条", "{view}, {count}")
        case .batchDeleteTitle:
            return m("删除 {count} 条本地副本？", "Delete {count} local copies?", one: "Delete {count} local copy?")
        case .batchDeleteConfirm:
            return m("删除 {count} 条本地副本", "Delete {count} local copies", one: "Delete {count} local copy")
        case .batchDeleted: return m("已删除 {count} 条", "Deleted {count}")
        case .batchDeleteMessage:
            return m(
                "将同时删除它们的复习记录。只作用于 Desktop；扩展里的副本不受影响，旧请求也不会让它们复活。",
                "Their review logs are deleted too. This only affects Desktop: the copies in the extension are untouched, and old requests will not bring these back."
            )
        case .addTagsMenu: return m("添加标签…", "Add tags…")
        case .removeTagsMenu: return m("移除标签…", "Remove tags…")
        case .deleteCopiesMenu:
            return m("删除 {count} 条本地副本…", "Delete {count} local copies…", one: "Delete {count} local copy…")
        case .selectedFragments:
            return m("已选 {count} 条碎片", "{count} Fragments selected", one: "{count} Fragment selected")
        case .selectedCount: return m("已选 {count} 条", "{count} selected")
        case .addTagsButton: return m("添加标签", "Add tags")
        case .removeTagsButton: return m("移除标签", "Remove tags")
        case .deleteButton: return m("删除…", "Delete…")
        case .batchActions: return m("批量操作，已选 {count} 条", "Bulk actions, {count} selected")
        case .tagsNotSaved: return m("标签没有保存，请重试", "The tags were not saved — try again")
        case .tagsAdded:
            return m("已为 {count} 条添加标签", "Added tags to {count} Fragments", one: "Added tags to {count} Fragment")
        case .tagsRemoved:
            return m(
                "已从 {count} 条移除标签", "Removed tags from {count} Fragments", one: "Removed tags from {count} Fragment")
        case .tagsUnchanged: return m("{count} 条无需改动", "{count} needed no change")
        case .tagsFull:
            return m(
                "{count} 条已满 {max} 个标签，未添加", "{count} already hold {max} tags and were left as they are",
                one: "{count} already holds {max} tags and was left as it is")
        case .kindDetails: return m("{kind}细节", "{kind} details")
        case .addTagsTitle:
            return m("为 {count} 条碎片添加标签", "Add tags to {count} Fragments", one: "Add tags to {count} Fragment")
        case .removeTagsTitle:
            return m(
                "从 {count} 条碎片移除标签", "Remove tags from {count} Fragments", one: "Remove tags from {count} Fragment")
        case .tagsFieldPrompt: return m("标签，用逗号或空格分隔", "Tags, separated by commas or spaces")
        case .removeTagsFieldPrompt: return m("要移除的标签", "Tags to remove")
        case .libraryTagsHeader: return m("库里已有的标签", "Tags already in the library")
        case .selectionTagsHeader: return m("这些碎片带有的标签", "Tags on these Fragments")
        case .tagsWillAdd: return m("将添加：{tags}", "Will add: {tags}")
        case .tagsWillRemove: return m("将移除：{tags}", "Will remove: {tags}")
        case .tagsLocalNote:
            return m(
                "标签只保存在这台 Mac 上，不会改动扩展里的标签。每条碎片最多 {max} 个标签。",
                "Tags are kept on this Mac only and never change the extension’s tags. A Fragment holds at most {max} tags."
            )
        case .addAction: return m("添加", "Add")
        case .removeAction: return m("移除", "Remove")
        case .hubStarting: return m("启动中…", "Starting…")
        case .retryStart: return m("重试启动", "Retry")
        case .storeOpenFailed: return m("无法打开本地数据库：{error}", "Cannot open the local database: {error}")
        }
    }
}

private func m(_ zh: String, _ en: String, one: String? = nil) -> UIMessage {
    UIMessage(zh: zh, en: en, enOne: one)
}
