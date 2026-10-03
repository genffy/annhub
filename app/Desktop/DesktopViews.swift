// Desktop wide surfaces (R2/R3/R4, desktop.md §2-§8):
//   今日 — due review + latest writes + resumable output drafts
//   碎片库 — searchable library with per-kind detail sheets + multi-select
//            task creation (输出工坊 entry 2)
//   输出工坊 — task creation (reverse recommendation 主入口), editor,
//            layered feedback and history (R2.1)
//   关系 — pending suggestions / per-fragment confirmed relations /
//            tag-filtered list (R2.2)
//   系统 — hub status, pairing, delivery results, R3 sync queue, LLM provider
// The output workshop and relation pages live in OutputWorkshopViews.swift /
// RelationsViews.swift.

import SwiftUI
import AnnHubCore

// ── sidebar root (desktop.md §2: five sections; default 今日; empty → 碎片库)

enum DesktopSection: String, CaseIterable, Identifiable, Hashable {
    case today = "今日"
    case library = "碎片库"
    case output = "输出工坊"
    case relations = "关系"
    case system = "系统"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .today: return "sun.max"
        case .library: return "square.grid.2x2"
        case .output: return "square.and.pencil"
        case .relations: return "link"
        case .system: return "gearshape.2"
        }
    }

    /// Cmd+1...5 (desktop.md §11: R2 grows the shortcut set from 3 to 5).
    var shortcut: KeyEquivalent {
        KeyEquivalent(Character(String(DesktopSection.allCases.firstIndex(of: self)! + 1)))
    }
}

struct RootSidebarView: View {
    @EnvironmentObject var model: DesktopModel
    /// Demo affordance: `--annhub-section=今日|碎片库|输出工坊|关系|系统` (raw labels).
    @State private var sectionOverride: DesktopSection?

    private var section: DesktopSection {
        if let sectionOverride { return sectionOverride }
        // 首次安装且没有数据时默认进入「碎片库」空状态 (desktop.md §2).
        return model.fragments.isEmpty ? .library : .today
    }

    var body: some View {
        NavigationSplitView {
            List {
                ForEach(DesktopSection.allCases) { item in
                    Button {
                        sectionOverride = item
                    } label: {
                        Label(item.rawValue, systemImage: item.icon)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(item.shortcut, modifiers: .command)
                    .listRowBackground(
                        section == item ? Color.accentColor.opacity(0.15) : Color.clear
                    )
                }
            }
            .navigationSplitViewColumnWidth(180)
        } detail: {
            switch section {
            case .today: TodayView().navigationTitle("今日")
            case .library: LibraryView().navigationTitle("碎片库")
            case .output: OutputWorkshopView().navigationTitle("输出工坊")
            case .relations: RelationsView().navigationTitle("关系")
            case .system: SystemView().navigationTitle("系统")
            }
        }
        .frame(minWidth: 980, minHeight: 600)
        .onAppear { model.startHub() }
    }
}

// ── 今日 (desktop.md §3) ────────────────────────────────────────────────

struct TodayView: View {
    @EnvironmentObject var model: DesktopModel
    @State private var reviewing = false
    @State private var detail: FragmentRecord?
    @State private var draftInEditor: WritingTaskRecord?

    private var due: [FragmentRecord] { model.dueQueue }
    private var resumable: ReviewSessionState? {
        guard let session = model.session, session.cursor < session.fragmentIds.count else { return nil }
        return session
    }
    /// Ongoing output drafts (desktop.md §6.1 entry 1 context: 今日页建议).
    private var drafts: [WritingTaskRecord] { Array(model.resumableDrafts.prefix(3)) }
    /// 今日建议: with due fragments and no active draft, offer a real task.
    private var suggestedTaskFragments: [FragmentRecord] {
        guard drafts.isEmpty else { return [] }
        return Array(due.prefix(3))
    }

    var body: some View {
        List {
            Section("今天需要完成什么") {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("到期复习")
                            .font(.title3.bold())
                        Text("\(due.count) 条 · 预计 \(model.estimatedMinutes) 分钟")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        reviewing = true
                    } label: {
                        Text("开始复习")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(due.isEmpty)
                }
                if let session = resumable {
                    Button {
                        reviewing = true
                    } label: {
                        Label("继续复习 \(session.cursor)/\(session.fragmentIds.count)", systemImage: "arrow.clockwise")
                    }
                }
            }

            if !drafts.isEmpty {
                Section("继续中的输出草稿") {
                    ForEach(drafts) { task in
                        Button {
                            draftInEditor = task
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(task.prompt).lineLimit(1)
                                    Text("草稿 \(taskStatus(task).draftWords) 字 · \(task.fragmentIds.count) 个目标碎片")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Label("继续写作", systemImage: "pencil")
                                    .font(.caption)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else if !suggestedTaskFragments.isEmpty {
                Section("输出建议") {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("把到期碎片用于一个真实输出任务")
                                .font(.callout)
                            Text(suggestedTaskFragments.map(\.content).joined(separator: "、"))
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                        Spacer()
                        Button("创建任务") {
                            if let task = model.createWritingTask(
                                type: "article",
                                topic: suggestedTaskFragments.first.map(\.content) ?? "",
                                fragmentIds: suggestedTaskFragments.map(\.id)
                            ) {
                                draftInEditor = task
                            }
                        }
                        .disabled(suggestedTaskFragments.isEmpty)
                    }
                }
            }

            if !due.isEmpty {
                Section("逾期主题（前 3）") {
                    ForEach(due.prefix(3)) { fragment in
                        HStack {
                            Text(fragment.content).lineLimit(1)
                            Spacer()
                            Text(fragment.kind)
                                .font(.caption)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                        }
                    }
                }
            }

            Section("最近写入碎片") {
                if model.latestFragments.isEmpty {
                    Text("还没有碎片。扩展采集后经本地服务逐条写入。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(model.latestFragments) { fragment in
                        Button {
                            detail = fragment
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(fragment.content).lineLimit(1)
                                    Text("\(fragment.kind) · \(fragment.context.sourceHost)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(Date(timeIntervalSince1970: Double(fragment.createdAt) / 1000), style: .date)
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .sheet(isPresented: $reviewing) {
            ReviewSessionView().frame(minWidth: 680, minHeight: 540)
        }
        .sheet(item: $detail) { fragment in
            FragmentDetailSheet(fragment: fragment).frame(minWidth: 560, minHeight: 480)
        }
        .sheet(item: $draftInEditor) { task in
            WritingEditorSheet(taskId: task.id)
                .frame(minWidth: 980, minHeight: 620)
                .environmentObject(model)
        }
    }
}

// ── 碎片库 (desktop.md §4) ──────────────────────────────────────────────

/// Library columns (desktop.md §4.2). 内容/类型 are non-hideable; the hidden
/// set persists in UserDefaults.
enum LibraryColumn: String, CaseIterable, Identifiable {
    case content, kind, source, tags, review, lastUsed, capturedAt

    var id: String { rawValue }

    var label: String {
        switch self {
        case .content: return "内容"
        case .kind: return "类型"
        case .source: return "来源"
        case .tags: return "标签"
        case .review: return "复习"
        case .lastUsed: return "最近使用"
        case .capturedAt: return "采集时间"
        }
    }

    /// desktop.md §4.2: content、kind 不可隐藏.
    var isHideable: Bool {
        self != .content && self != .kind
    }
}

struct LibraryView: View {
    @EnvironmentObject var model: DesktopModel

    @State private var search = ""
    @State private var kindFilter: Set<String> = []
    @State private var tagFilter: Set<String> = []
    @State private var selection = Set<FragmentRecord.ID>()
    @State private var detail: FragmentRecord?
    @State private var confirmDelete: FragmentRecord?
    @State private var createSheetIds: [String]?
    /// Hidden columns (desktop.md §4.2), persisted in UserDefaults.
    @State private var hiddenColumns: Set<LibraryColumn> = []

    private static let hiddenColumnsKey = "annhub.desktop.libraryHiddenColumns"

    private var queryResult: FragmentQueryResult {
        runFragmentQuery(model.fragments, query: FragmentQuery(
            search: search,
            kinds: kindFilter.isEmpty ? nil : Array(kindFilter),
            tags: tagFilter.isEmpty ? nil : Array(tagFilter)
        ))
    }

    private var allKinds: [String] {
        collectKinds(model.fragments)
    }

    private var allTags: [String] {
        collectTags(model.fragments)
    }

    /// 最近使用 (desktop.md §4.2): days to first confirmed application —
    /// 相对天数 or 从未 (never applied).
    private func lastUsedLabel(_ fragment: FragmentRecord) -> String {
        if let days = model.daysToFirstApplication(fragment) {
            return "\(days) 天"
        }
        return "从未"
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            Table(queryResult.items, selection: $selection) {
                TableColumn("内容", value: \.content)
                TableColumn("类型") { row in Text(row.kind).font(.caption) }
                if !hiddenColumns.contains(.source) {
                    TableColumn("来源", value: \.context.sourceHost).width(min: 90)
                }
                if !hiddenColumns.contains(.tags) {
                    TableColumn("标签") { row in
                        Text(row.tags.joined(separator: "、")).font(.caption).lineLimit(1)
                    }
                }
                if !hiddenColumns.contains(.review) {
                    TableColumn("复习") { row in Text(reviewLabel(row)).font(.caption) }
                }
                if !hiddenColumns.contains(.lastUsed) {
                    TableColumn("最近使用") { row in
                        Text(lastUsedLabel(row)).font(.caption)
                    }
                }
                if !hiddenColumns.contains(.capturedAt) {
                    TableColumn("采集时间") { row in
                        Text(Date(timeIntervalSince1970: Double(row.context.capturedAt) / 1000), style: .date)
                            .font(.caption)
                    }
                }
            }
            .contextMenu(forSelectionType: FragmentRecord.ID.self) { ids in
                if let id = ids.first, let fragment = model.fragments.first(where: { $0.id == id }) {
                    Button("删除本地副本…", role: .destructive) {
                        confirmDelete = fragment
                    }
                }
            } primaryAction: { ids in
                if let id = ids.first {
                    detail = model.fragments.first { $0.id == id }
                }
            }
            .confirmationDialog(
                "删除本地副本？",
                isPresented: Binding(
                    get: { confirmDelete != nil },
                    set: { if !$0 { confirmDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("删除本地副本（复习日志与关系一并删除，扩展重试将被拒绝）", role: .destructive) {
                    if let fragment = confirmDelete {
                        model.deleteLocal(fragment.id)
                    }
                    confirmDelete = nil
                }
            } message: {
                if let fragment = confirmDelete {
                    Text(fragment.content)
                }
            }
        }
        .searchable(text: $search, prompt: "搜索内容/核验/应用/标签")
        .toolbar {
            // 输出工坊 entry 2 (desktop.md §6.1): create a task from a
            // multi-selection of fragments.
            ToolbarItem(placement: .primaryAction) {
                Button {
                    createSheetIds = Array(selection)
                } label: {
                    Label(
                        selection.count > 1 ? "用所选 \(selection.count) 个碎片创建输出任务" : "用所选碎片创建输出任务",
                        systemImage: "square.and.pencil"
                    )
                }
                .disabled(selection.isEmpty)
            }
            // 列显隐 (desktop.md §4.2): 内容/类型 不可隐藏，其余按需收起。
            ToolbarItem(placement: .automatic) {
                Menu {
                    ForEach(LibraryColumn.allCases) { column in
                        Button {
                            toggleColumn(column)
                        } label: {
                            if hiddenColumns.contains(column) {
                                Label(column.label, systemImage: "circle")
                            } else {
                                Label(column.label, systemImage: "checkmark.circle")
                            }
                        }
                        .disabled(!column.isHideable)
                    }
                } label: {
                    Label("列", systemImage: "tablecolumns")
                }
            }
        }
        .onAppear { loadHiddenColumns() }
        .sheet(item: $detail) { fragment in
            FragmentDetailSheet(fragment: fragment).frame(minWidth: 560, minHeight: 480)
        }
        .sheet(isPresented: Binding(
            get: { createSheetIds != nil },
            set: { if !$0 { createSheetIds = nil } }
        )) {
            if let ids = createSheetIds {
                TaskCreationSheet(
                    title: "从碎片库创建输出任务",
                    defaultFragmentIds: ids,
                    allowRecommendation: false
                )
                .frame(minWidth: 520, minHeight: 420)
                .environmentObject(model)
            }
        }
    }

    private func toggleColumn(_ column: LibraryColumn) {
        guard column.isHideable else { return }
        if hiddenColumns.contains(column) {
            hiddenColumns.remove(column)
        } else {
            hiddenColumns.insert(column)
        }
        persistHiddenColumns()
    }

    private func loadHiddenColumns() {
        let raw = UserDefaults.standard.stringArray(forKey: Self.hiddenColumnsKey) ?? []
        hiddenColumns = Set(raw.compactMap(LibraryColumn.init(rawValue:)).filter(\.isHideable))
    }

    private func persistHiddenColumns() {
        UserDefaults.standard.set(
            hiddenColumns.map(\.rawValue),
            forKey: Self.hiddenColumnsKey
        )
    }

    private func reviewLabel(_ fragment: FragmentRecord) -> String {
        let due = fragment.review.nextReviewAt <= nowMs()
        switch fragment.review.state {
        case .new: return due ? "新到期" : "新建"
        case .learning: return "学习中"
        case .review: return due ? "已到期" : "复习中"
        case .relearning: return due ? "重新到期" : "重学中"
        }
    }

    private var filterBar: some View {
        HStack(spacing: 8) {
            ForEach(allKinds, id: \.self) { kind in
                FilterChip(label: kind, isOn: kindFilter.contains(kind)) {
                    toggle(&kindFilter, kind)
                }
            }
            if !allTags.isEmpty {
                Divider().frame(height: 16)
                ForEach(allTags, id: \.self) { tag in
                    FilterChip(label: "#\(tag)", isOn: tagFilter.contains(tag)) {
                        toggle(&tagFilter, tag)
                    }
                }
            }
            Spacer()
            Text("\(queryResult.total)/\(model.fragments.count)")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
    }

    private func toggle(_ set: inout Set<String>, _ value: String) {
        if set.contains(value) { set.remove(value) } else { set.insert(value) }
    }
}

struct FilterChip: View {
    let label: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.caption)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(
                    isOn ? Color.accentColor.opacity(0.25) : Color(nsColor: .controlBackgroundColor),
                    in: Capsule()
                )
        }
        .buttonStyle(.plain)
    }
}

// ── 碎片详情（顺序按 desktop.md §4.3：加工在前，原文在后）──────────────

struct FragmentDetailSheet: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss
    let fragment: FragmentRecord
    @State private var establishingRelation = false

    private var confirmedRelations: [FragmentRelation] {
        model.confirmedRelations(fragment.id)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // 1. 内容和 kind
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        Text(fragment.content).font(.title2.bold())
                        Spacer()
                        Text(fragment.kind)
                            .font(.caption)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color.accentColor.opacity(0.15), in: Capsule())
                    }
                    if let caption = kindCaption {
                        Text(caption).font(.footnote).foregroundStyle(.secondary)
                    }
                }

                if fragment.kind == "visual" {
                    visualSection
                }

                if fragment.kind == "media-clip", let clip = fragment.mediaClipDetail {
                    detailSection("时间区间") {
                        Text("\(mmss(clip.startMs)) – \(mmss(clip.endMs))")
                            .font(.callout.monospacedDigit())
                    }
                }

                // 2. 用户应用
                detailSection("用户应用") {
                    Text(fragment.processing.use)
                }

                // 3. 核验确认
                detailSection("核验确认") {
                    if let verified = fragment.processing.verified {
                        VStack(alignment: .leading, spacing: 4) {
                            LabeledContent("确认时间") {
                                Text(Date(timeIntervalSince1970: Double(verified.confirmedAt) / 1000), style: .date)
                                Text(Date(timeIntervalSince1970: Double(verified.confirmedAt) / 1000), style: .time)
                            }
                            LabeledContent("来源") { Text(verifiedSourceLabel(verified.source)) }
                            if let summary = verified.summary, !summary.isEmpty {
                                LabeledContent("摘要") { Text(summary) }
                            }
                            if let notes = verified.notes, !notes.isEmpty {
                                LabeledContent("备注") { Text(notes) }
                            }
                        }
                    } else {
                        Text("未确认").foregroundStyle(.secondary)
                    }
                }

                // 4. 原始语境和回到来源
                detailSection("原始语境") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(fragment.context.excerpt)
                        if let title = fragment.context.sourceTitle, !title.isEmpty {
                            Text(title).font(.footnote).foregroundStyle(.secondary)
                        }
                        if let url = URL(string: fragment.context.sourceUrl) {
                            Link("回到来源：\(fragment.context.sourceHost)", destination: url)
                                .font(.callout)
                        } else {
                            Text(fragment.context.sourceUrl).font(.footnote)
                        }
                    }
                }

                // 5. 复习摘要
                detailSection("复习摘要") {
                    VStack(alignment: .leading, spacing: 4) {
                        LabeledContent("复习次数") { Text("\(fragment.review.repetitions)") }
                        LabeledContent("失误次数") { Text("\(fragment.review.lapses)") }
                        if let last = fragment.review.lastReviewedAt {
                            LabeledContent("上次复习") {
                                Text(Date(timeIntervalSince1970: Double(last) / 1000), style: .date)
                                Text(Date(timeIntervalSince1970: Double(last) / 1000), style: .time)
                            }
                        }
                        LabeledContent("下次到期") {
                            Text(Date(timeIntervalSince1970: Double(fragment.review.nextReviewAt) / 1000), style: .date)
                            Text(Date(timeIntervalSince1970: Double(fragment.review.nextReviewAt) / 1000), style: .time)
                        }
                    }
                }

                // 6. 应用情况（R2.3：从采集到首次应用）
                detailSection("应用情况") {
                    LabeledContent("从采集到首次应用") {
                        if let days = model.daysToFirstApplication(fragment) {
                            Text("\(days) 天")
                        } else {
                            Text("从未应用").foregroundStyle(.secondary)
                        }
                    }
                }

                // 7. 已确认关系（desktop.md §7 / R2.2）
                detailSection("已确认关系（\(confirmedRelations.count)）") {
                    if confirmedRelations.isEmpty {
                        Text("暂无已确认关系").foregroundStyle(.secondary)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(confirmedRelations) { relation in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(relationEndpointLabel(relation))
                                            .font(.callout)
                                        HStack(spacing: 6) {
                                            Text(relation.type)
                                                .font(.caption)
                                                .padding(.horizontal, 6).padding(.vertical, 2)
                                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                                            if let note = relation.note, !note.isEmpty {
                                                Text(note).font(.caption).foregroundStyle(.secondary)
                                            }
                                        }
                                    }
                                    Spacer()
                                    Button("删除关系") {
                                        model.removeRelation(relation.id)
                                    }
                                    .controlSize(.small)
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                }

                // 8. 标签和元数据
                detailSection("标签") {
                    if fragment.tags.isEmpty {
                        Text("无").foregroundStyle(.secondary)
                    } else {
                        HStack {
                            ForEach(fragment.tags, id: \.self) { tag in
                                Text("#\(tag)").font(.caption)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Color.nsSecondary, in: Capsule())
                            }
                        }
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("建立关系…") { establishingRelation = true }
            }
            ToolbarItem(placement: .confirmationAction) { Button("关闭") { dismiss() } }
        }
        .sheet(isPresented: $establishingRelation) {
            EstablishRelationSheet(source: fragment)
                .frame(minWidth: 560, minHeight: 480)
                .environmentObject(model)
        }
    }

    /// 「当前碎片 → 对端摘要」；对称类型无方向。
    private func relationEndpointLabel(_ relation: FragmentRelation) -> String {
        let arrow = isSymmetricRelation(relation.type) ? "⇄" : "→"
        let summary = model.relationEndpointSummary(relation, of: fragment.id)
        return relation.fromFragmentId == fragment.id
            ? "当前碎片 \(arrow) \(summary)"
            : "\(summary) \(arrow) 当前碎片"
    }

    private var kindCaption: String? {
        switch fragment.kind {
        case "concept":
            return fragment.conceptDetail?.definition
        case "decision":
            return fragment.decisionDetail?.rationale
        case "question":
            return fragment.questionDetail.map { "状态：\($0.status)" }
        default:
            return nil
        }
    }

    private var visualSection: some View {
        Group {
            if let assetId = fragment.attachmentIds.first {
                if let image = model.assetImage(assetId: assetId) {
                    VStack(alignment: .leading, spacing: 4) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        Text("图片资产 \(assetId)").font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    Label("附件缺失，待重试（\(assetId)）", systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    @ViewBuilder
    private func detailSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.bold()).foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private func verifiedSourceLabel(_ source: String) -> String {
        switch source {
        case "source-material": return "网页材料"
        case "llm": return "模型建议（已确认）"
        case "manual": return "手工核对"
        default: return source
        }
    }
}

extension Color {
    static let nsSecondary = Color(nsColor: .quaternaryLabelColor)
}

// ── 复习会话 (desktop.md §5) ────────────────────────────────────────────

struct ReviewSessionView: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss

    @State private var usedHint = false
    @State private var revealed = false
    @State private var hintCount = 0

    private var fragment: FragmentRecord? { model.currentFragment }
    private var spec: ReviewQuestionSpec {
        fragment.map { reviewQuestion(for: $0.kind) } ?? ReviewQuestionSpec(kind: "", question: "", hints: [])
    }

    var body: some View {
        VStack(spacing: 16) {
            if let fragment {
                cardView(fragment)
            } else {
                completionView
            }
        }
        .padding(24)
        .frame(minWidth: 640, minHeight: 500)
        .onAppear {
            if model.session == nil {
                _ = model.startReviewSession()
            }
            resetCard()
        }
    }

    // MARK: card

    private func cardView(_ fragment: FragmentRecord) -> some View {
        let session = model.session
        let total = session?.fragmentIds.count ?? 0
        let index = (session?.cursor ?? 0) + 1
        return VStack(spacing: 14) {
            HStack {
                Text("\(index)/\(total)").foregroundStyle(.secondary)
                if usedHint {
                    Label("已用提示", systemImage: "lightbulb")
                        .font(.caption).foregroundStyle(.orange)
                }
                Spacer()
                Button("跳过") { model.skipCurrent(reason: "手动跳过"); resetCard() }
                Button("结束") { dismiss() }
            }

            // 题面（按 kind 的默认题型，desktop.md §5.2）
            VStack(alignment: .leading, spacing: 10) {
                Text(spec.question).font(.title2.bold())
                if fragment.kind == "visual" {
                    Text("先回忆，再揭示查看文字描述与截图。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if fragment.kind == "media-clip" {
                    Text("先回忆要点与时间定位，再揭示核对转写。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            // R4 视觉遮挡：揭示前只给像素化图片（roadmap R4.1）。
            if fragment.kind == "visual", !revealed, let assetId = fragment.attachmentIds.first,
               let image = model.assetImage(assetId: assetId), let occluded = occludedImage(image) {
                VStack(spacing: 4) {
                    Image(nsImage: occluded)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text("图片已遮挡")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // 提示梯度（desktop.md §5.3 四级）：使用任何提示都写入 usedHint
            // (review.md §4)；评分 1..4 仍只在揭示后可用。
            if !revealed {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(Array(spec.hints.enumerated()), id: \.offset) { idx, hint in
                            Button("提示 \(idx + 1)：\(hint)") {
                                if hintCount < idx + 1 { hintCount = idx + 1 }
                                usedHint = true
                            }
                            .disabled(idx > hintCount) // 梯度按顺序解锁
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        Spacer()
                        Button {
                            reveal()
                        } label: {
                            Text("揭示").bold()
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    // 已解锁提示的实际内容（L1 结构提示 → L2 来源与标签 →
                    // L3 遮蔽答案的摘录 → L4 核验确认状态与摘要）
                    if usedHint {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(1...max(hintCount, 1), id: \.self) { level in
                                Text(hintText(level, fragment))
                            }
                        }
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            } else {
                referenceView(fragment)
                ratingButtons(fragment)
            }
            Spacer()
        }
    }

    /// 揭示后的参考信息：content、核验摘要、excerpt (desktop.md §5.1)；
    /// visual 揭示原图；media-clip 揭示时间区间与转写节选 (R4)。
    private func referenceView(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(fragment.content).font(.headline)
            if let summary = fragment.processing.verified?.summary, !summary.isEmpty {
                Text("核验摘要：\(summary)").foregroundStyle(.secondary)
            }
            if fragment.kind == "media-clip" {
                Text("时间区间：\(mediaClipRangeLabel(fragment))")
                    .font(.callout.monospacedDigit())
            }
            Text(fragment.context.excerpt)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if fragment.kind == "visual", let assetId = fragment.attachmentIds.first {
                if let image = model.assetImage(assetId: assetId) {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    Label("附件缺失，待重试", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }

    /// media-clip 的 mm:ss 时间区间：detail 优先，locator 兜底。
    private func mediaClipRangeLabel(_ fragment: FragmentRecord) -> String {
        if let clip = fragment.mediaClipDetail {
            return "\(mmss(clip.startMs)) – \(mmss(clip.endMs))"
        }
        if case let .time(startMs, endMs) = fragment.context.locator {
            return "\(mmss(startMs)) – \(mmss(endMs))"
        }
        return "未知区间"
    }

    /// 评分按钮只能在揭示后出现，展示预计下次间隔；1-4 快捷键 (desktop.md §5/§11)。
    private func ratingButtons(_ fragment: FragmentRecord) -> some View {
        HStack(spacing: 12) {
            ForEach(Array(ReviewRating.allCases.enumerated()), id: \.element) { idx, rating in
                Button {
                    guard model.rateCurrent(rating, usedHint: usedHint) else { return }
                    resetCard()
                } label: {
                    VStack {
                        Text(label(rating))
                        Text("\(previewInterval(fragment.review, rating: rating, now: nowMs())) 天")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(tint(rating))
                .keyboardShortcut(KeyEquivalent(Character("\(idx + 1)")), modifiers: [])
            }
        }
    }

    /// 四级提示的实际内容 (desktop.md §5.3)；纯内容构造在 AnnHubCore
    /// (maskedExcerpt / verificationHint)。
    private func hintText(_ level: Int, _ fragment: FragmentRecord) -> String {
        switch level {
        case 1:
            // L1: kind 特定的关键词或结构提示。
            return "提示 1（\(spec.hints.first ?? "")）：回忆\(spec.hints.first ?? "")相关的结构。"
        case 2:
            // L2: sourceTitle 和 tags 的实际值。
            let title = fragment.context.sourceTitle ?? fragment.context.sourceHost
            let tags = fragment.tags.map { "#\($0)" }.joined(separator: " ")
            return "提示 2（\(spec.hints.count > 1 ? spec.hints[1] : "上下文")）：来源「\(title)」\(tags.isEmpty ? "无标签" : tags)"
        case 3:
            // L3: excerpt 的非答案部分 —— 答案内容以 ﹏﹏﹏ 遮蔽。
            return "提示 3（\(spec.hints.count > 2 ? spec.hints[2] : "原文")）：\(maskedExcerpt(fragment))"
        default:
            // L4: 核验确认状态 + 摘要；无摘要时回看原始语境。
            return "提示 4（\(spec.hints.count > 3 ? spec.hints[3] : "核验确认")）：\(verificationHint(fragment))"
        }
    }

    private func reveal() {
        revealed = true
    }

    private func resetCard() {
        usedHint = false
        revealed = false
        hintCount = 0
    }

    // MARK: completion

    private var completionView: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle").font(.system(size: 42)).foregroundStyle(.green)
            Text(model.session == nil && model.dueQueue.isEmpty
                 ? "暂无到期碎片"
                 : "本轮复习完成")
                .font(.title3)
            if let session = model.session {
                Text("完成 \(session.fragmentIds.count) 条，跳过 \(session.skipped.count) 条")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Button("再来一轮") {
                _ = model.startReviewSession()
                resetCard()
            }
            .disabled(model.dueQueue.isEmpty)
            Button("关闭") { dismiss() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func label(_ r: ReviewRating) -> String {
        switch r { case .again: return "重来"; case .hard: return "困难"; case .good: return "良好"; case .easy: return "简单" }
    }

    private func tint(_ r: ReviewRating) -> Color {
        switch r { case .again: return .red; case .hard: return .orange; case .good: return .blue; case .easy: return .green }
    }
}

// ── 系统 (desktop.md §8) ────────────────────────────────────────────────

struct SystemView: View {
    @EnvironmentObject var model: DesktopModel
    @State private var tokenRevealed = false
    @State private var llmTestStatus: String?
    @State private var testingLlm = false

    var body: some View {
        List {
            Section("本地中枢") {
                LabeledContent("地址") { Text(model.hubState) }
                LabeledContent("设备") {
                    Text(model.store.deviceId).font(.system(.caption, design: .monospaced))
                }
                LabeledContent("最近扩展连接") {
                    if let at = model.lastConnectionAt {
                        Text(Date(timeIntervalSince1970: Double(at) / 1000), style: .time)
                    } else {
                        Text("暂无")
                    }
                }
                Button("启动 / 重启中枢", action: model.startHub)
            }

            // 每日复习上限 (review.md §5 / metrics.md §6.2): 5–50 可调，持久化。
            Section("复习") {
                Stepper(
                    "每日复习上限：\(model.dailyLimit) 条",
                    value: Binding(
                        get: { model.dailyLimit },
                        set: { model.dailyLimit = $0 }
                    ),
                    in: DAILY_LIMIT_MIN...DAILY_LIMIT_MAX
                )
                Text("下次开始复习时生效；单轮仍受约 13 条的时间预算约束。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("配对") {
                if model.pairToken.isEmpty {
                    Text("尚未配对：扩展首次提交 Token 后自动完成配对。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    HStack {
                        if tokenRevealed {
                            Text(model.pairToken)
                                .font(.system(.body, design: .monospaced))
                                .textSelection(.enabled)
                                .accessibilityIdentifier("pair-token-full")
                        } else {
                            Text(String(repeating: "•", count: 12))
                                .font(.system(.body, design: .monospaced))
                        }
                        Button(tokenRevealed ? "隐藏" : "显示") { tokenRevealed.toggle() }
                        Button("拷贝") {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(model.pairToken, forType: .string)
                        }
                    }
                    Text("轮换 Token 后旧客户端需重新配对。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }

            // R3 双向同步 (storage.md §9)
            Section("同步") {
                LabeledContent("待扩展拉取的变更") {
                    Text("\(model.syncInfo.pendingChanges)")
                        .foregroundStyle(model.syncInfo.pendingChanges > 0 ? .orange : .secondary)
                }
                LabeledContent("已拉取游标") { Text("\(model.syncInfo.pulledCursor)") }
                LabeledContent("最近扩展拉取") {
                    if let at = model.syncInfo.lastPulledAt {
                        Text(Date(timeIntervalSince1970: Double(at) / 1000), style: .date)
                        Text(Date(timeIntervalSince1970: Double(at) / 1000), style: .time)
                    } else {
                        Text("暂无")
                    }
                }
                LabeledContent("/v1/events 接收") {
                    Text("接收 \(model.syncInfo.events.received) · 应用 \(model.syncInfo.events.applied) · 重复 \(model.syncInfo.events.duplicates) · 跳过 \(model.syncInfo.events.skipped)")
                        .font(.caption)
                }
                Text("变更队列包含 Desktop 的复习、输出任务与已确认关系；采集字段仍由扩展单向交付。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("最近扩展写入") {
                LabeledContent("已接收碎片") { Text("\(model.deliveredFragmentCount)") }
                LabeledContent("已接收图片") { Text("\(model.stats.assets)") }
                LabeledContent("缺失图片数") {
                    Text("\(model.missingAttachmentCount)")
                        .foregroundStyle(model.missingAttachmentCount > 0 ? .orange : .secondary)
                }
                if model.recentDeliveries.isEmpty {
                    Text("暂无逐项写入记录。").font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(Array(model.recentDeliveries.suffix(8).reversed()), id: \.at) { outcome in
                        HStack {
                            Image(systemName: icon(outcome.status))
                                .foregroundStyle(outcome.status < 300 ? .green : .orange)
                            Text("\(outcome.method) \(shortPath(outcome.path))")
                                .font(.caption)
                            Spacer()
                            Text("\(outcome.status)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            // LLM Provider (ai.md)：可选能力，默认关闭；apiKey 不进入日志。
            Section("LLM Provider（输出反馈，可选）") {
                LabeledContent("状态") {
                    Text(model.llmSettings.isConfigured ? "已配置" : "未配置（本地降级可用）")
                        .foregroundStyle(model.llmSettings.isConfigured ? .green : .secondary)
                }
                LabeledContent("Base URL") {
                    TextField("https://api.example.com/v1", text: Binding(
                        get: { model.llmSettings.baseUrl },
                        set: { model.llmSettings.baseUrl = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 260)
                }
                LabeledContent("API Key") {
                    SecureField("sk-…", text: Binding(
                        get: { model.llmSettings.apiKey },
                        set: { model.llmSettings.apiKey = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 260)
                }
                LabeledContent("模型") {
                    TextField("gpt-4o-mini", text: Binding(
                        get: { model.llmSettings.model },
                        set: { model.llmSettings.model = $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 260)
                }
                HStack {
                    Button("测试连接") {
                        testingLlm = true
                        Task {
                            let status = await model.testLlmConnection()
                            await MainActor.run {
                                llmTestStatus = status
                                testingLlm = false
                            }
                        }
                    }
                    .disabled(testingLlm || !model.llmSettings.isConfigured)
                    if testingLlm { ProgressView().controlSize(.small) }
                    if let status = llmTestStatus {
                        Text(status).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Text("仅发送本次产出与目标碎片；失败时输出反馈保持待确认，不影响任务完成。")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("数据库") {
                LabeledContent("Fragment schema") { Text("v4") }
                LabeledContent("写入接口") { Text(DesktopHub.apiVersion) }
                LabeledContent("本地碎片") { Text("\(model.stats.fragments)") }
                LabeledContent("复习日志") { Text("\(model.stats.reviewLogs)") }
                LabeledContent("输出任务") { Text("\(model.stats.writingTasks)") }
                LabeledContent("关系（含建议）") { Text("\(model.stats.relations)") }
                LabeledContent("图片资产") { Text("\(model.stats.assets)") }
                LabeledContent("本地删除标记") { Text("\(model.stats.deletions)") }
                // storage.md §3.4/§9: Desktop 本地变更不再写 outbox_events —
                // 待发送事件 derives from change_log rows beyond pulledCursor.
                LabeledContent("待发送事件") {
                    Text("\(model.syncInfo.pendingChanges)")
                        .foregroundStyle(model.syncInfo.pendingChanges > 0 ? .orange : .secondary)
                }
                LabeledContent("变更队列") { Text("\(model.stats.changes)") }
            }
        }
        .onAppear { model.reload() }
    }

    private func icon(_ status: Int) -> String {
        status < 300 ? "checkmark.circle" : "exclamationmark.triangle"
    }

    private func shortPath(_ path: String) -> String {
        path.split(separator: "/").suffix(2).joined(separator: "/")
    }
}

// ── R4 视觉遮挡：AppKit 绘制（纯像素逻辑在 AnnHubCore.pixelateBitmap） ────

/// Draw the image into a ~24px-wide bitmap, average the blocks, then scale
/// back up with nearest-neighbor interpolation for the occluded look.
/// No third-party image dependencies.
func occludedImage(_ image: NSImage, targetWidth: Int = 24) -> NSImage? {
    guard let rep = image.representations.first,
          rep.pixelsWide > 0, rep.pixelsHigh > 0
    else { return nil }
    let width = rep.pixelsWide
    let height = rep.pixelsHigh

    func makeRep(_ w: Int, _ h: Int) -> NSBitmapImageRep? {
        NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
            isPlanar: false, colorSpaceName: .deviceRGB,
            bytesPerRow: w * 4, bitsPerPixel: 32
        )
    }

    guard let source = makeRep(width, height), let sourceBase = source.bitmapData else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: source)
    image.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.current = nil
    NSGraphicsContext.restoreGraphicsState()

    let rgba = Array(UnsafeBufferPointer(start: sourceBase, count: width * height * 4))
    let small = pixelateBitmap(
        OcclusionBitmap(width: width, height: height, rgba: rgba), targetWidth: targetWidth
    )
    guard let smallRep = makeRep(small.width, small.height), let smallBase = smallRep.bitmapData else {
        return nil
    }
    small.rgba.withUnsafeBufferPointer { buffer in
        guard let base = buffer.baseAddress else { return }
        smallBase.update(from: base, count: small.rgba.count)
    }
    guard let smallCg = smallRep.cgImage, let bigRep = makeRep(width, height) else { return nil }
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: bigRep)
    NSGraphicsContext.current = context
    context?.imageInterpolation = .none
    NSImage(cgImage: smallCg, size: NSSize(width: small.width, height: small.height))
        .draw(in: NSRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.current = nil
    NSGraphicsContext.restoreGraphicsState()
    guard let bigCg = bigRep.cgImage else { return nil }
    return NSImage(cgImage: bigCg, size: NSSize(width: width, height: height))
}
