// Desktop wide surfaces (desktop.md §2–§8):
//   今日 — due review with the day's suggested amount, what the extension wrote
//          most recently, and the weekly retrieved count (M-18)
//   碎片库 — searchable library with per-kind detail sheets; the empty state
//          walks through pairing
//   系统 — local hub status, pairing code, recent deliveries, folded technical info
//   偏好设置 — daily limit and review reminder (the Settings scene)
// The output workshop and relations left the product with D-10.

import SwiftUI
import AnnHubCore

// ── brand ────────────────────────────────────────────────────────────────

extension Color {
    /// Brand purple, same tokens as the extension: #673AB8 in the light
    /// appearance, #8A63D2 in the dark one (visual.md).
    static let annBrand = Color(
        nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(srgbRed: 0x8A / 255, green: 0x63 / 255, blue: 0xD2 / 255, alpha: 1)
                : NSColor(srgbRed: 0x67 / 255, green: 0x3A / 255, blue: 0xB8 / 255, alpha: 1)
        })

    static let nsSecondary = Color(nsColor: .quaternaryLabelColor)
}

/// "2 分钟前" — the system page and the menu bar show recency, not clock times.
func relativeAgo(_ ms: Int) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.unitsStyle = .full
    return formatter.localizedString(for: Date(timeIntervalSince1970: Double(ms) / 1000), relativeTo: Date())
}

/// 今天 / 昨天 / 周四 — where a fragment's date appears in lists.
func writtenDayLabel(_ ms: Int) -> String {
    relativeDayLabel(dayStart: startOfLocalDay(ms), now: nowMs())
}

func verifiedSourceLabel(_ source: String) -> String {
    switch source {
    case "source-material": return "原文材料"
    case "llm": return "模型建议（已确认）"
    case "manual": return "手工核对"
    default: return source
    }
}

// ── sidebar root (desktop.md §2: three sections; default 今日; empty → 碎片库)

enum DesktopSection: String, CaseIterable, Identifiable, Hashable {
    case today = "今日"
    case library = "碎片库"
    case system = "系统"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .today: return "sun.max"
        case .library: return "square.grid.2x2"
        case .system: return "gearshape.2"
        }
    }

    /// Cmd+1...3 (desktop.md §9).
    var shortcut: KeyEquivalent {
        KeyEquivalent(Character(String(DesktopSection.allCases.firstIndex(of: self)! + 1)))
    }
}

struct RootSidebarView: View {
    @EnvironmentObject var model: DesktopModel
    /// Set once a section is picked (or an in-page action navigates); until
    /// then the default applies.
    @State private var selected: DesktopSection?

    private var section: DesktopSection {
        if let selected { return selected }
        // 首次安装且没有数据时默认进入「碎片库」空状态 (desktop.md §2).
        return model.fragments.isEmpty ? .library : .today
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                List {
                    ForEach(DesktopSection.allCases) { item in
                        Button {
                            selected = item
                        } label: {
                            Label(item.rawValue, systemImage: item.icon)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .keyboardShortcut(item.shortcut, modifiers: .command)
                        .listRowBackground(
                            section == item ? Color.annBrand.opacity(0.18) : Color.clear
                        )
                    }
                }
                Divider()
                // Cmd+, — a menu-bar app has no app menu to carry the shortcut.
                SettingsLink {
                    Label("偏好设置…", systemImage: "slider.horizontal.3")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(",", modifiers: .command)
                .simultaneousGesture(TapGesture().onEnded { NSApp.activate(ignoringOtherApps: true) })
            }
            .navigationSplitViewColumnWidth(180)
        } detail: {
            switch section {
            case .today:
                TodayView(onOpenLibrary: { selected = .library }).navigationTitle("今日")
            case .library:
                LibraryView(onOpenSystem: { selected = .system }).navigationTitle("碎片库")
            case .system:
                SystemView().navigationTitle("系统")
            }
        }
        .frame(minWidth: 980, minHeight: 600)
        .tint(.annBrand)
        .onAppear { model.startHub() }
    }
}

// ── 今日 (desktop.md §3) ────────────────────────────────────────────────

struct TodayView: View {
    @EnvironmentObject var model: DesktopModel
    let onOpenLibrary: () -> Void
    @State private var reviewing = false
    @State private var detail: FragmentRecord?

    private var resumable: ReviewSessionState? {
        guard let session = model.session, session.cursor < session.fragmentIds.count else { return nil }
        return session
    }

    var body: some View {
        let plan = model.dailyPlan
        return List {
            Section("今天需要完成什么") {
                reviewBlock(plan)
            }

            Section("最近由扩展写入") {
                if model.latestFragments.isEmpty {
                    Text("还没有碎片。扩展保存后会逐条出现在这里。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(model.latestFragments) { fragment in
                        Button {
                            detail = fragment
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(fragment.content).lineLimit(1)
                                    Text(
                                        "\(kindLabel(fragment.kind)) · \(fragment.context.sourceHost) · \(writtenDayLabel(fragment.createdAt))"
                                    )
                                    .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // The only statistic on this page: M-18 (metrics.md §4).
            Section("次要信息") {
                Text("本周成功提取 \(model.weeklyRetrieved) 个碎片")
                    .foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $reviewing) {
            ReviewSessionView().frame(minWidth: 680, minHeight: 540)
        }
        .sheet(item: $detail) { fragment in
            FragmentDetailSheet(fragment: fragment).frame(minWidth: 560, minHeight: 480)
        }
    }

    @ViewBuilder
    private func reviewBlock(_ plan: DailyReviewPlan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("到期复习").font(.title3.bold())
                    if plan.due.isEmpty {
                        Text("今天没有到期复习").foregroundStyle(.secondary)
                    } else if plan.limitReached {
                        // review.md §5: state the cap as a fact, keep due dates, never force a stop.
                        Text("建议量 \(plan.ratedToday) / \(plan.dailyLimit)；还有 \(plan.due.count) 条到期，保留原到期时间，明天继续")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("\(plan.suggested.count) 条 · 预计 \(estimatedMinutes(plan.suggested.count)) 分钟")
                            .foregroundStyle(.secondary)
                        if plan.beyondLimit > 0 {
                            Text("另有 \(plan.beyondLimit) 条超出今日建议量，明天继续")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer()
                if plan.limitReached {
                    Button("再来一轮（超出建议量）") {
                        if model.startReviewSession(overflow: true) { reviewing = true }
                    }
                } else if plan.due.isEmpty {
                    Button("整理最近碎片", action: onOpenLibrary)
                } else {
                    Button("开始复习") { reviewing = true }
                        .buttonStyle(.borderedProminent)
                }
            }
            if !plan.due.isEmpty {
                Text("逾期主题：" + plan.due.prefix(3).map { String($0.content.prefix(16)) }.joined(separator: " / "))
                    .font(.callout).foregroundStyle(.secondary).lineLimit(1)
            }
            if let session = resumable {
                Button {
                    reviewing = true
                } label: {
                    Label("继续复习 \(session.cursor)/\(session.fragmentIds.count)", systemImage: "arrow.clockwise")
                }
            }
        }
    }

    /// 45 seconds per card (desktop.md §3.2).
    private func estimatedMinutes(_ count: Int) -> Int {
        Int(ceil(Double(count * SESSION_SECONDS_PER_CARD) / 60))
    }
}

// ── 碎片库 (desktop.md §4) ──────────────────────────────────────────────

/// Library columns (desktop.md §4.2). 内容/类型 are non-hideable; the hidden
/// set persists in UserDefaults.
enum LibraryColumn: String, CaseIterable, Identifiable {
    case content, kind, source, tags, review, capturedAt

    var id: String { rawValue }

    var label: String {
        switch self {
        case .content: return "内容"
        case .kind: return "类型"
        case .source: return "来源"
        case .tags: return "标签"
        case .review: return "复习"
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
    let onOpenSystem: () -> Void

    @State private var search = ""
    @State private var kindFilter: Set<String> = []
    @State private var hostFilter: Set<String> = []
    @State private var tagFilter: Set<String> = []
    @State private var statusFilter: Set<ReviewStatus> = []
    /// Pages accumulate through the stable cursor (search.md §3).
    @State private var items: [FragmentRecord] = []
    @State private var total = 0
    @State private var nextCursor: String?
    @State private var selection = Set<FragmentRecord.ID>()
    @State private var detailSheet: FragmentRecord?
    @State private var confirmDelete: FragmentRecord?
    @State private var pairCodeCopied = false
    /// Hidden columns (desktop.md §4.2), persisted in UserDefaults.
    @State private var hiddenColumns: Set<LibraryColumn> = []

    private static let hiddenColumnsKey = "annhub.desktop.libraryHiddenColumns"
    /// Below this width the detail column becomes a sheet (desktop.md §4.1).
    private static let threeColumnMinWidth: CGFloat = 860
    /// Chips beyond the most frequent few stay reachable through search.
    private static let maxFilterOptions = 12

    private var hasActiveFilters: Bool {
        !search.isEmpty || !kindFilter.isEmpty || !hostFilter.isEmpty || !tagFilter.isEmpty || !statusFilter.isEmpty
    }

    private func makeQuery(cursor: String?) -> FragmentQuery {
        FragmentQuery(
            search: search,
            kinds: kindFilter.isEmpty ? nil : Array(kindFilter),
            hosts: hostFilter.isEmpty ? nil : Array(hostFilter),
            tags: tagFilter.isEmpty ? nil : Array(tagFilter),
            cursor: cursor
        )
    }

    /// Review status is Desktop-local truth, applied before the shared query.
    private var pool: [FragmentRecord] {
        filterByReviewStatus(model.fragments, statuses: statusFilter, now: nowMs())
    }

    private func refresh() {
        let result = runFragmentQuery(pool, query: makeQuery(cursor: nil))
        items = result.items
        total = result.total
        nextCursor = result.nextCursor
        let visible = Set(result.items.map(\.id))
        selection = selection.filter { visible.contains($0) }
    }

    private func loadMore() {
        guard let cursor = nextCursor else { return }
        let result = runFragmentQuery(pool, query: makeQuery(cursor: cursor))
        items.append(contentsOf: result.items)
        nextCursor = result.nextCursor
    }

    private func clearFilters() {
        search = ""
        kindFilter = []
        hostFilter = []
        tagFilter = []
        statusFilter = []
    }

    private var selectedFragment: FragmentRecord? {
        guard selection.count == 1, let id = selection.first else { return nil }
        return items.first { $0.id == id }
    }

    var body: some View {
        if model.fragments.isEmpty {
            emptyState
        } else {
            library
        }
    }

    /// First run (desktop.md §2): the two steps that connect the extension, and
    /// the one that most often breaks — copying the pairing code — one click away.
    private var emptyState: some View {
        VStack(spacing: 16) {
            Text("还没有碎片。").font(.title2.bold())
            VStack(alignment: .leading, spacing: 6) {
                Text("1. 在 Chrome 中安装 AnnHub 扩展，保存第一个碎片")
                Text("2. 在“系统”页复制配对码，输入到扩展")
            }
            Text("扩展里的碎片会在这里逐条出现；没有 Desktop 时扩展也能独立使用。")
                .font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button("打开系统页", action: onOpenSystem)
                    .buttonStyle(.borderedProminent)
                Button(pairCodeCopied ? "已复制" : "复制配对码") {
                    model.copyPairToken()
                    pairCodeCopied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { pairCodeCopied = false }
                }
            }
            HStack(spacing: 6) {
                Image(systemName: model.hubListening ? "circle.fill" : "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(model.hubListening ? Color.green : Color.orange)
                    .accessibilityHidden(true)
                Text(model.hubListening ? "正在监听 127.0.0.1 · 等待第一条碎片" : model.hubState)
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }

    /// Three columns (desktop.md §4.1): filters | list | detail. A narrow window
    /// drops the detail column; the detail then opens as a sheet.
    private var library: some View {
        GeometryReader { proxy in
            let detailColumn = proxy.size.width >= Self.threeColumnMinWidth
            HStack(spacing: 0) {
                filterSidebar.frame(width: 170)
                Divider()
                listColumn(detailAsColumn: detailColumn)
                if detailColumn {
                    Divider()
                    detailPanel.frame(width: 320)
                }
            }
        }
        .searchable(text: $search, prompt: "搜索内容/核验/应用/标签")
        .toolbar {
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
        .onAppear {
            loadHiddenColumns()
            refresh()
        }
        .onChange(of: search) { refresh() }
        .onChange(of: kindFilter) { refresh() }
        .onChange(of: hostFilter) { refresh() }
        .onChange(of: tagFilter) { refresh() }
        .onChange(of: statusFilter) { refresh() }
        .onChange(of: model.revision) { refresh() }
        .sheet(item: $detailSheet) { fragment in
            FragmentDetailSheet(fragment: fragment).frame(minWidth: 560, minHeight: 480)
        }
        .confirmationDialog(
            "删除本地副本？",
            isPresented: Binding(
                get: { confirmDelete != nil },
                set: { if !$0 { confirmDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("删除本地副本（复习日志一并删除，扩展重试将被拒绝）", role: .destructive) {
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

    // ── left: filters ────────────────────────────────────────────────────

    private var filterSidebar: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                filterGroup("类型", options: collectKinds(model.fragments), label: kindLabel, selection: $kindFilter)
                filterGroup(
                    "复习", options: ReviewStatus.allCases, label: { $0.label }, selection: $statusFilter
                )
                filterGroup(
                    "来源", options: Array(collectHosts(model.fragments).prefix(Self.maxFilterOptions)),
                    label: { $0 }, selection: $hostFilter
                )
                filterGroup(
                    "标签", options: Array(collectTags(model.fragments).prefix(Self.maxFilterOptions)),
                    label: { "#\($0)" }, selection: $tagFilter
                )
                if hasActiveFilters {
                    Button("清除筛选", action: clearFilters)
                        .controlSize(.small)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5))
    }

    @ViewBuilder
    private func filterGroup<T: Hashable>(
        _ title: String, options: [T], label: @escaping (T) -> String, selection: Binding<Set<T>>
    ) -> some View {
        if !options.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.bold()).foregroundStyle(.secondary)
                ForEach(options, id: \.self) { option in
                    Toggle(
                        label(option),
                        isOn: Binding(
                            get: { selection.wrappedValue.contains(option) },
                            set: { on in
                                if on {
                                    selection.wrappedValue.insert(option)
                                } else {
                                    selection.wrappedValue.remove(option)
                                }
                            }
                        )
                    )
                    .toggleStyle(.checkbox)
                    .lineLimit(1)
                }
            }
        }
    }

    // ── middle: list ─────────────────────────────────────────────────────

    private func listColumn(detailAsColumn: Bool) -> some View {
        VStack(spacing: 0) {
            if items.isEmpty {
                VStack(spacing: 10) {
                    Text("没有符合条件的碎片").foregroundStyle(.secondary)
                    if hasActiveFilters {
                        Button("清除筛选", action: clearFilters)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                table(detailAsColumn: detailAsColumn)
            }
            Divider()
            HStack {
                Text("已显示 \(items.count) / 符合 \(total) / 共 \(model.fragments.count) 条")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                if nextCursor != nil {
                    Button("显示更多", action: loadMore).controlSize(.small)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
        }
    }

    private func table(detailAsColumn: Bool) -> some View {
        Table(items, selection: $selection) {
            TableColumn("内容", value: \.content)
            TableColumn("类型") { row in Text(kindLabel(row.kind)).font(.caption) }
            if !hiddenColumns.contains(.source) {
                TableColumn("来源", value: \.context.sourceHost).width(min: 90)
            }
            if !hiddenColumns.contains(.tags) {
                TableColumn("标签") { row in
                    Text(row.tags.joined(separator: "、")).font(.caption).lineLimit(1)
                }
            }
            if !hiddenColumns.contains(.review) {
                TableColumn("复习") { row in
                    Text(reviewStatus(of: row, now: nowMs()).label).font(.caption)
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
            if let id = ids.first, let fragment = items.first(where: { $0.id == id }) {
                if !detailAsColumn {
                    Button("查看详情") { detailSheet = fragment }
                }
                Button("删除本地副本…", role: .destructive) {
                    confirmDelete = fragment
                }
            }
        } primaryAction: { ids in
            // The detail column already shows the selection; only the narrow
            // layout needs the sheet.
            if !detailAsColumn, let id = ids.first {
                detailSheet = items.first { $0.id == id }
            }
        }
    }

    // ── right: detail ────────────────────────────────────────────────────

    @ViewBuilder
    private var detailPanel: some View {
        if let fragment = selectedFragment {
            FragmentDetailView(fragment: fragment, onDelete: { confirmDelete = fragment })
                .id(fragment.id)
        } else {
            Text("选择一条碎片查看详情")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
}

// ── 碎片详情（顺序按 desktop.md §4.3：加工在前，原文在后）──────────────

/// The detail column of the library, and the body of the sheet in a narrow
/// window. R1 capture fields are read-only; Desktop can delete its own copy.
struct FragmentDetailView: View {
    @EnvironmentObject var model: DesktopModel
    let fragment: FragmentRecord
    var onDelete: (() -> Void)?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // 1. 内容和 kind
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        Text(fragment.content).font(.title2.bold())
                        Spacer()
                        Text(kindLabel(fragment.kind))
                            .font(.caption)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(Color.annBrand.opacity(0.18), in: Capsule())
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

                // 6. 标签和元数据
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

                // Desktop deletes only its own copy (desktop.md §4.4).
                if let onDelete {
                    Divider()
                    Button("删除本地副本…", role: .destructive, action: onDelete)
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
}

/// The same detail as a sheet (Today's recent writes; the library in a narrow window).
struct FragmentDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let fragment: FragmentRecord

    var body: some View {
        FragmentDetailView(fragment: fragment)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("关闭") { dismiss() } }
            }
    }
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
                // A fresh sheet never shows a previous round's wrap-up.
                model.wrapUp = nil
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
                Text("\(kindLabel(fragment.kind)) \(index)/\(total)").foregroundStyle(.secondary)
                if usedHint {
                    Label("已用提示", systemImage: "lightbulb")
                        .font(.caption).foregroundStyle(.orange)
                }
                Spacer()
                Button("跳过") {
                    model.skipCurrent(reason: "手动跳过"); resetCard()
                }
                Button("结束") { dismiss() }
            }

            // 题面（按 kind 的默认题型，desktop.md §5.2）
            VStack(alignment: .leading, spacing: 10) {
                Text(spec.question).font(.title2.bold())
                Text("主题：\(String(fragment.content.prefix(40)))")
                    .font(.footnote).foregroundStyle(.secondary)
                if fragment.kind == "visual" {
                    Text("先回忆，再揭示查看文字描述与截图。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else if fragment.kind == "media-clip" {
                    Text("先回忆要点与时间定位，再揭示核对转写。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text("先自己作答，再点「揭示」")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            // R4 视觉遮挡：揭示前只给像素化图片（roadmap R4.1）。
            if fragment.kind == "visual", !revealed, let assetId = fragment.attachmentIds.first,
                let image = model.assetImage(assetId: assetId), let occluded = occludedImage(image)
            {
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
                            .disabled(idx > hintCount)  // 梯度按顺序解锁
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

    /// 揭示后的参考信息 (desktop.md §5.1 ③)：你的理解、核验确认、你的应用，
    /// 并保留「回到来源」；visual 揭示原图；media-clip 揭示时间区间 (R4)。
    private func referenceView(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("你的理解：\(fragment.content)").font(.headline)
            Text(verificationLine(fragment)).foregroundStyle(.secondary)
            Text("你的应用：\(fragment.processing.use)")
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
            if let url = URL(string: fragment.context.sourceUrl) {
                Link("回到来源：\(fragment.context.sourceHost)", destination: url)
                    .font(.callout)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.annBrand.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private func verificationLine(_ fragment: FragmentRecord) -> String {
        guard let verified = fragment.processing.verified else { return "核验：未确认" }
        var line = "核验：已确认，来源：\(verifiedSourceLabel(verified.source))"
        if let summary = verified.summary, !summary.isEmpty {
            line += "；摘要：\(summary)"
        }
        return line
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

    /// 评分按钮只能在揭示后出现，展示预计下次间隔；1-4 快捷键 (desktop.md §5/§9)。
    private func ratingButtons(_ fragment: FragmentRecord) -> some View {
        HStack(spacing: 12) {
            ForEach(Array(ReviewRating.allCases.enumerated()), id: \.element) { idx, rating in
                Button {
                    guard model.rateCurrent(rating, usedHint: usedHint) else { return }
                    resetCard()
                } label: {
                    VStack {
                        Text("\(idx + 1) \(label(rating))")
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

    // MARK: wrap-up (desktop.md §5.5)

    /// States facts only — no streaks, badges or celebration. When the day's
    /// suggested amount is used up it says so and offers 再来一轮 beyond it.
    private var completionView: some View {
        let plan = model.dailyPlan
        return VStack(spacing: 14) {
            Spacer()
            if let wrap = model.wrapUp {
                Text("这一轮完成了").font(.title2.bold())
                Text("已评分 \(wrap.rated) 条 / 其中 \(wrap.usedHint) 条用过提示 / \(wrap.again) 条「再来一次」")
                if wrap.skipped > 0 {
                    Text("跳过 \(wrap.skipped) 条（碎片已删除或手动跳过）")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text(upcomingLine(wrap)).foregroundStyle(.secondary)
            } else {
                Text("今天没有到期复习").font(.title3)
            }
            if plan.limitReached {
                Text("建议量 \(plan.ratedToday) / \(plan.dailyLimit)；还有 \(plan.due.count) 条到期，保留原到期时间，明天继续")
                    .font(.callout).foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button("回到今日") {
                    model.wrapUp = nil
                    dismiss()
                }
                if plan.limitReached {
                    Button("再来一轮（超出建议量）") { startRound(overflow: true) }
                } else if !plan.suggested.isEmpty {
                    Button("继续下一会话（还有 \(plan.due.count) 条到期）") { startRound(overflow: false) }
                        .buttonStyle(.borderedProminent)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func upcomingLine(_ wrap: SessionWrapUp) -> String {
        guard !wrap.upcoming.isEmpty else { return "下一批到期：暂无" }
        let now = nowMs()
        let parts = wrap.upcoming.map { "\(relativeDayLabel(dayStart: $0.dayStart, now: now)) \($0.count) 条" }
        return "下一批到期：" + parts.joined(separator: " / ")
    }

    private func startRound(overflow: Bool) {
        if model.startReviewSession(overflow: overflow) { resetCard() }
    }

    private func label(_ r: ReviewRating) -> String {
        switch r {
        case .again: return "再来一次";
        case .hard: return "较难";
        case .good: return "良好";
        case .easy: return "容易"
        }
    }

    private func tint(_ r: ReviewRating) -> Color {
        switch r {
        case .again: return .red;
        case .hard: return .orange;
        case .good: return .blue;
        case .easy: return .green
        }
    }
}

// ── 系统 (desktop.md §6) ────────────────────────────────────────────────

struct SystemView: View {
    @EnvironmentObject var model: DesktopModel
    @State private var tokenRevealed = false
    @State private var tokenCopied = false
    @State private var confirmingRotate = false
    @State private var technicalExpanded = false

    var body: some View {
        List {
            connectionSection
            deliverySection
            technicalSection
        }
        .onAppear { model.reload() }
        .confirmationDialog("重新生成配对码？", isPresented: $confirmingRotate, titleVisibility: .visible) {
            Button("重新生成", role: .destructive) {
                model.rotatePairToken()
                tokenRevealed = true
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("旧的扩展连接会失效，需要在扩展设置里输入新配对码。本地数据与待发送任务保留。")
        }
    }

    private var connectionSection: some View {
        Section("连接") {
            HStack(spacing: 8) {
                Image(systemName: model.hubListening ? "circle.fill" : "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(model.hubListening ? Color.green : Color.orange)
                    .accessibilityHidden(true)
                Text(model.hubListening ? "本地服务运行中，仅监听本机" : model.hubState)
            }
            LabeledContent("配对码") {
                HStack(spacing: 8) {
                    Text(tokenRevealed ? model.pairToken : String(repeating: "•", count: model.pairToken.count))
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                        .accessibilityIdentifier("pair-token")
                    Button(tokenRevealed ? "隐藏" : "显示") { tokenRevealed.toggle() }
                    Button(tokenCopied ? "已复制" : "复制") {
                        model.copyPairToken()
                        tokenCopied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { tokenCopied = false }
                    }
                    Button("重新生成") { confirmingRotate = true }
                }
            }
            LabeledContent("最近扩展连接") {
                Text(model.lastConnectionAt.map(relativeAgo) ?? "暂无")
            }
        }
    }

    private var deliverySection: some View {
        Section("最近交付") {
            Text(
                "碎片 \(model.deliveredFragmentCount) 条已接收 / 图片 \(model.stats.assets) 张已接收 / 缺失图片 \(model.missingAttachmentCount)"
            )
            let issues = model.attentionItems
            if issues.isEmpty {
                Label("需要处理：无", systemImage: "checkmark.circle")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(issues, id: \.self) { issue in
                    Label("需要处理：\(issue)", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            }
            if model.recentDeliveries.isEmpty {
                Text("暂无逐项写入记录。").font(.footnote).foregroundStyle(.secondary)
            } else {
                ForEach(Array(model.recentDeliveries.suffix(8).reversed().enumerated()), id: \.offset) { _, outcome in
                    deliveryRow(outcome)
                }
            }
        }
    }

    /// Folded by default: the home of this page shows only what needs attention.
    /// (Grouped: a ViewBuilder block holds at most ten children.)
    private var technicalSection: some View {
        Section {
            DisclosureGroup("技术信息", isExpanded: $technicalExpanded) {
                Group {
                    LabeledContent("服务地址") { Text("http://127.0.0.1:8765") }
                    LabeledContent("设备") {
                        Text(model.store.deviceId).font(.system(.caption, design: .monospaced))
                    }
                    LabeledContent("数据库版本") { Text("Fragment schema v4") }
                    LabeledContent("契约版本") { Text(DesktopHub.apiVersion) }
                }
                Group {
                    LabeledContent("本地碎片") { Text("\(model.stats.fragments)") }
                    LabeledContent("复习日志") { Text("\(model.stats.reviewLogs)") }
                    LabeledContent("图片资产") { Text("\(model.stats.assets)") }
                    LabeledContent("本地删除标记") { Text("\(model.stats.deletions)") }
                }
                Divider()
                syncInfoRows
                Divider()
                deliveryFailureRows
            }
        }
    }

    /// R3 双向同步 (storage.md §9) and the sync conflict report.
    private var syncInfoRows: some View {
        Group {
            LabeledContent("待扩展拉取的变更") {
                Text("\(model.syncInfo.pendingChanges)")
                    .foregroundStyle(model.syncInfo.pendingChanges > 0 ? Color.orange : Color.secondary)
            }
            LabeledContent("已拉取游标") { Text("\(model.syncInfo.pulledCursor)") }
            LabeledContent("最近扩展拉取") {
                Text(model.syncInfo.lastPulledAt.map(relativeAgo) ?? "暂无")
            }
            LabeledContent("/v1/events 接收") {
                Text(
                    "接收 \(model.syncInfo.events.received) · 应用 \(model.syncInfo.events.applied) · 重复 \(model.syncInfo.events.duplicates) · 跳过 \(model.syncInfo.events.skipped)"
                )
                .font(.caption)
            }
        }
    }

    private var deliveryFailureRows: some View {
        let failures = model.recentDeliveries.filter { $0.status >= 300 }
        return Group {
            if failures.isEmpty {
                Text("没有交付错误。").font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("交付错误明细").font(.subheadline.bold())
                ForEach(Array(failures.suffix(8).reversed().enumerated()), id: \.offset) { _, outcome in
                    deliveryRow(outcome)
                }
            }
        }
    }

    private func deliveryRow(_ outcome: DeliveryOutcome) -> some View {
        HStack {
            Image(systemName: outcome.status < 300 ? "checkmark.circle" : "exclamationmark.triangle")
                .foregroundStyle(outcome.status < 300 ? Color.green : Color.orange)
            Text("\(outcome.method) \(shortPath(outcome.path))")
                .font(.caption)
            Spacer()
            Text("\(outcome.status) · \(relativeAgo(outcome.at))")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func shortPath(_ path: String) -> String {
        path.split(separator: "/").suffix(2).joined(separator: "/")
    }
}

// ── 偏好设置 (desktop.md §8.2) ──────────────────────────────────────────

/// The standard macOS settings window (Cmd+,). One page — 复习. Desktop has no
/// feature that needs a model, so there is no model page (D-10).
struct PreferencesView: View {
    @EnvironmentObject var model: DesktopModel

    private var dailyLimit: Binding<Double> {
        Binding(
            get: { Double(model.dailyLimit) },
            set: { model.dailyLimit = Int($0.rounded()) }
        )
    }

    private var reminderEnabled: Binding<Bool> {
        Binding(
            get: { model.reminder.enabled },
            set: {
                model.reminder = ReviewReminder(enabled: $0, hour: model.reminder.hour, minute: model.reminder.minute)
            }
        )
    }

    private var reminderTime: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(
                    bySettingHour: model.reminder.hour, minute: model.reminder.minute, second: 0, of: Date()
                ) ?? Date()
            },
            set: { date in
                let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
                model.reminder = ReviewReminder(
                    enabled: model.reminder.enabled, hour: parts.hour ?? 20, minute: parts.minute ?? 30
                )
            }
        )
    }

    var body: some View {
        Form {
            Section("复习") {
                LabeledContent("每日建议上限") {
                    HStack(spacing: 10) {
                        Text("\(DAILY_LIMIT_MIN)").foregroundStyle(.secondary)
                        Slider(value: dailyLimit, in: Double(DAILY_LIMIT_MIN)...Double(DAILY_LIMIT_MAX), step: 1)
                            .frame(width: 200)
                        Text("\(DAILY_LIMIT_MAX)").foregroundStyle(.secondary)
                        Text("\(model.dailyLimit) 条")
                            .monospacedDigit()
                            .frame(width: 52, alignment: .trailing)
                    }
                }
                Text("限制当天的建议量，不强制同一会话做完；单次会话按每条 45 秒估算，最多约 13 条。")
                    .font(.footnote).foregroundStyle(.secondary)

                LabeledContent("每日复习提醒") {
                    HStack(spacing: 10) {
                        Toggle("每日复习提醒", isOn: reminderEnabled).labelsHidden()
                        Text("每天")
                        DatePicker("提醒时间", selection: reminderTime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                            .disabled(!model.reminder.enabled)
                    }
                }
                Text("只发复习提醒，不发采集数量、连续使用天数或营销通知。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .fixedSize(horizontal: false, vertical: true)
        .tint(.annBrand)
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
