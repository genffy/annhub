// 碎片库 (desktop.md §4): the three-column library — filters and saved views, the
// sortable list with batch actions, and the detail column / sheet.

import AnnHubCore
import SwiftUI

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
    /// 保存的视图: at most one of 到期 / 待加强 / 新建, combined (AND) with the filters.
    @State private var savedView: SavedView?
    /// Pages accumulate through the stable cursor (search.md §3).
    @State private var items: [FragmentRecord] = []
    @State private var total = 0
    @State private var nextCursor: String?
    @State private var selection = Set<FragmentRecord.ID>()
    @State private var detailSheet: FragmentRecord?
    @State private var confirmDelete: FragmentRecord?
    @State private var pairCodeCopied = false
    @State private var tagEdit: TagEditRequest?
    @State private var confirmBatchDelete = false
    /// The result line of the last batch action, shown in the batch bar.
    @State private var batchMessage: String?
    /// Whether the detail column fits (else it is a sheet).
    @State private var isWide = true
    /// Hidden columns (desktop.md §4.2), persisted in UserDefaults.
    @State private var hiddenColumns: Set<LibraryColumn> = []

    private static let hiddenColumnsKey = "annhub.desktop.libraryHiddenColumns"
    /// Below this width the detail column becomes a sheet (desktop.md §4.1).
    private static let threeColumnMinWidth: CGFloat = 860
    /// Chips beyond the most frequent few stay reachable through search.
    private static let maxFilterOptions = 12

    private var hasActiveFilters: Bool {
        !search.isEmpty || !kindFilter.isEmpty || !hostFilter.isEmpty || !tagFilter.isEmpty || !statusFilter.isEmpty
            || savedView != nil
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
        let now = nowMs()
        let byStatus = filterByReviewStatus(model.fragments, statuses: statusFilter, now: now)
        return filterBySavedView(byStatus, view: savedView, logs: model.reviewLogs, now: now)
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
        savedView = nil
    }

    private var selectedFragment: FragmentRecord? {
        guard selection.count == 1, let id = selection.first else { return nil }
        return items.first { $0.id == id }
    }

    private var selectedFragments: [FragmentRecord] {
        items.filter { selection.contains($0.id) }
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
            .onAppear { isWide = detailColumn }
            .onChange(of: detailColumn) { isWide = detailColumn }
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
            consumeFocusRequest()
        }
        .onChange(of: model.focusedFragmentId) { consumeFocusRequest() }
        .onChange(of: savedView) { refresh() }
        .onChange(of: search) { refresh() }
        .onChange(of: kindFilter) { refresh() }
        .onChange(of: hostFilter) { refresh() }
        .onChange(of: tagFilter) { refresh() }
        .onChange(of: statusFilter) { refresh() }
        .onChange(of: model.revision) { refresh() }
        .sheet(item: $detailSheet) { fragment in
            FragmentDetailSheet(fragment: fragment).frame(minWidth: 560, minHeight: 480)
        }
        .sheet(item: $tagEdit) { request in
            TagEditSheet(
                add: request.add, count: selection.count,
                presentTags: collectTags(selectedFragments), libraryTags: collectTags(model.fragments)
            ) { tags in
                applyTagEdit(add: request.add, tags: tags)
            }
        }
        .confirmationDialog(
            "删除 \(selection.count) 条本地副本？",
            isPresented: $confirmBatchDelete,
            titleVisibility: .visible
        ) {
            Button("删除 \(selection.count) 条本地副本", role: .destructive) {
                let deleted = model.deleteLocal(ids: Array(selection))
                selection = []
                batchMessage = "已删除 \(deleted) 条"
            }
        } message: {
            Text("将同时删除它们的复习记录。只作用于 Desktop；扩展里的副本不受影响，旧请求也不会让它们复活。")
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
                savedViewsGroup
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

    /// 新建 / 到期 / 待加强 — derived from the facts (fragments.md §9), with live counts.
    private var savedViewsGroup: some View {
        let counts = savedViewCounts(model.fragments, logs: model.reviewLogs, now: nowMs())
        return VStack(alignment: .leading, spacing: 2) {
            Text("保存的视图").font(.subheadline.bold()).foregroundStyle(.secondary)
            ForEach(SavedView.allCases) { view in
                Button {
                    savedView = savedView == view ? nil : view
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: icon(for: view)).frame(width: 16)
                        Text(view.label)
                        Spacer()
                        Text("\(counts[view] ?? 0)").monospacedDigit().foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(
                        savedView == view ? Color.annBrand.opacity(0.2) : Color.clear,
                        in: RoundedRectangle(cornerRadius: 5)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(view.label)，\(counts[view] ?? 0) 条")
                .accessibilityAddTraits(savedView == view ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    private func icon(for view: SavedView) -> String {
        switch view {
        case .due: return "clock"
        case .needsWork: return "exclamationmark.circle"
        case .new: return "circle.dashed"
        }
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
            if selection.count >= 2 { batchBar }
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
            TableColumn("内容", value: \.content).width(min: 150, ideal: 260)
            TableColumn("类型") { row in Text(kindLabel(row.kind)).font(.caption) }
                .width(min: 52, ideal: 60, max: 90)
            if !hiddenColumns.contains(.source) {
                TableColumn("来源", value: \.context.sourceHost).width(min: 80, ideal: 120)
            }
            if !hiddenColumns.contains(.tags) {
                TableColumn("标签") { row in
                    Text(row.tags.joined(separator: "、")).font(.caption).lineLimit(1)
                }
                .width(min: 60, ideal: 120)
            }
            if !hiddenColumns.contains(.review) {
                TableColumn("复习") { row in
                    Text(reviewStatus(of: row, now: nowMs()).label).font(.caption)
                }
                .width(min: 52, ideal: 64, max: 100)
            }
            if !hiddenColumns.contains(.capturedAt) {
                TableColumn("采集时间") { row in
                    Text(Date(timeIntervalSince1970: Double(row.context.capturedAt) / 1000), style: .date)
                        .font(.caption)
                }
                .width(min: 80, ideal: 96, max: 130)
            }
        }
        .contextMenu(forSelectionType: FragmentRecord.ID.self) { ids in
            if ids.count > 1 {
                Button("添加标签…") {
                    selection = ids
                    tagEdit = TagEditRequest(add: true)
                }
                Button("移除标签…") {
                    selection = ids
                    tagEdit = TagEditRequest(add: false)
                }
                Button("删除 \(ids.count) 条本地副本…", role: .destructive) {
                    selection = ids
                    confirmBatchDelete = true
                }
            } else if let id = ids.first, let fragment = items.first(where: { $0.id == id }) {
                if !detailAsColumn {
                    Button("查看详情") { detailSheet = fragment }
                }
                Button("添加标签…") {
                    selection = [id]
                    tagEdit = TagEditRequest(add: true)
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
            Text(selection.count > 1 ? "已选 \(selection.count) 条碎片" : "选择一条碎片查看详情")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // ── batch actions (desktop.md §4.4) ──────────────────────────────────

    /// 已选 N 条 — tags and delete only; never 理解 / 核验 / 应用.
    private var batchBar: some View {
        HStack(spacing: 8) {
            Text("已选 \(selection.count) 条").bold()
            if let batchMessage {
                Text(batchMessage).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer()
            Button {
                tagEdit = TagEditRequest(add: true)
            } label: {
                Label("添加标签", systemImage: "tag")
            }
            Button("移除标签") { tagEdit = TagEditRequest(add: false) }
            Button("删除…", role: .destructive) { confirmBatchDelete = true }
        }
        .controlSize(.small)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(Color.annBrand.opacity(0.08))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("批量操作，已选 \(selection.count) 条")
    }

    private func applyTagEdit(add: Bool, tags: [String]) {
        guard let result = model.editTags(add: add, tags: tags, ids: Array(selection)) else {
            batchMessage = "标签没有保存，请重试"
            return
        }
        var parts = [add ? "已为 \(result.updated) 条添加标签" : "已从 \(result.updated) 条移除标签"]
        if result.unchanged > 0 { parts.append("\(result.unchanged) 条无需改动") }
        if !result.skipped.isEmpty { parts.append("\(result.skipped.count) 条已满 \(MAX_TAGS_PER_FRAGMENT) 个标签，未添加") }
        batchMessage = parts.joined(separator: "；")
    }

    /// ⌘K picked a fragment: show it. Filters that would hide it are cleared first.
    private func consumeFocusRequest() {
        guard let id = model.focusedFragmentId else { return }
        model.focusedFragmentId = nil
        clearFilters()
        refresh()
        var pages = 0
        while !items.contains(where: { $0.id == id }), nextCursor != nil, pages < 8 {
            loadMore()
            pages += 1
        }
        if !items.contains(where: { $0.id == id }), let record = model.fragments.first(where: { $0.id == id }) {
            // Far down a big library: narrow the list to it rather than paging on.
            search = String(record.content.prefix(40))
            refresh()
        }
        guard let fragment = items.first(where: { $0.id == id }) else { return }
        selection = [id]
        if !isWide { detailSheet = fragment }
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
                }

                if fragment.kind == "visual" {
                    visualSection
                }

                // 该 kind 的字段区 (desktop.md §4.3): steps, evidence, rationale, range …
                let kindFields = kindDetailFields(fragment)
                if !kindFields.isEmpty {
                    detailSection("\(kindLabel(fragment.kind))细节") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(kindFields, id: \.label) { field in
                                kindFieldView(field)
                            }
                        }
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

    private func kindFieldView(_ field: KindDetailField) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(field.label).font(.caption).foregroundStyle(.secondary)
            ForEach(Array(field.lines.enumerated()), id: \.offset) { index, line in
                if field.numbered {
                    Text("\(index + 1). \(line)")
                } else if field.lines.count > 1 {
                    Text("· \(line)")
                } else {
                    Text(line)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
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

// ── 批量标签 (desktop.md §4.4) ──────────────────────────────────────────

struct TagEditRequest: Identifiable {
    let id = UUID()
    let add: Bool
}

/// Add or remove tags on the selected fragments. The edit stays on this Mac: the extension's
/// own tags are not touched (LocalTags.swift).
struct TagEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    let add: Bool
    let count: Int
    /// Tags the selected fragments carry — the candidates to remove.
    let presentTags: [String]
    /// Every tag in the library — suggestions when adding.
    let libraryTags: [String]
    let onApply: ([String]) -> Void

    @State private var text = ""
    @FocusState private var focused: Bool

    private var tags: [String] { parseTagInput(text) }
    private var suggestions: [String] { add ? Array(libraryTags.prefix(18)) : presentTags }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(add ? "为 \(count) 条碎片添加标签" : "从 \(count) 条碎片移除标签").font(.title3.bold())
            TextField(add ? "标签，用逗号或空格分隔" : "要移除的标签", text: $text)
                .textFieldStyle(.roundedBorder)
                .focused($focused)
                .onSubmit(apply)
            if !suggestions.isEmpty {
                Text(add ? "库里已有的标签" : "这些碎片带有的标签").font(.caption).foregroundStyle(.secondary)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 90), spacing: 6)], alignment: .leading, spacing: 6) {
                    ForEach(suggestions, id: \.self) { tag in
                        Button {
                            toggle(tag)
                        } label: {
                            Text("#\(tag)").font(.caption).lineLimit(1)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(
                                    tags.contains(tag) ? Color.annBrand.opacity(0.3) : Color.nsSecondary,
                                    in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(tags.contains(tag) ? [.isButton, .isSelected] : .isButton)
                    }
                }
            }
            if !tags.isEmpty {
                Text("将\(add ? "添加" : "移除")：" + tags.map { "#\($0)" }.joined(separator: " "))
                    .font(.callout)
            }
            Text("标签只保存在这台 Mac 上，不会改动扩展里的标签。每条碎片最多 \(MAX_TAGS_PER_FRAGMENT) 个标签。")
                .font(.footnote).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("取消") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(add ? "添加" : "移除", action: apply)
                    .keyboardShortcut(.defaultAction)
                    .buttonStyle(.borderedProminent)
                    .disabled(tags.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440)
        .onAppear { focused = true }
    }

    private func toggle(_ tag: String) {
        var current = tags
        if let index = current.firstIndex(of: tag) {
            current.remove(at: index)
        } else {
            current.append(tag)
        }
        text = current.joined(separator: " ")
    }

    private func apply() {
        guard !tags.isEmpty else { return }
        onApply(tags)
        dismiss()
    }
}
