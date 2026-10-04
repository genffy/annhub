// Desktop wide surfaces (desktop.md §2–§8):
//   Today — due review with the day's suggested amount, what the extension wrote
//           most recently, and the weekly retrieved count (M-18)
//   Fragment library — searchable library with per-kind detail sheets; the empty state
//           walks through pairing
//   System — local hub status, pairing code, recent deliveries, folded technical info
//   Settings — daily limit and review reminder (the Settings scene)
// The output workshop and relations left the product with D-10. Every user-visible string goes
// through `t(.key)` (D-15); none is written inline.

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

/// "2 分钟前" / "2 minutes ago" — the system page and the menu bar show recency, not clock times.
func relativeAgo(_ ms: Int) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.locale = Locale(identifier: UILanguage.current == .zh ? "zh_CN" : "en_US")
    formatter.unitsStyle = .full
    return formatter.localizedString(for: Date(timeIntervalSince1970: Double(ms) / 1000), relativeTo: Date())
}

/// Today / Yesterday / Thursday — where a fragment's date appears in lists.
func writtenDayLabel(_ ms: Int) -> String {
    relativeDayLabel(dayStart: startOfLocalDay(ms), now: nowMs())
}

func verifiedSourceLabel(_ source: String) -> String {
    switch source {
    case "source-material": return t(.verifiedSourceMaterial)
    case "llm": return t(.verifiedModel)
    case "manual": return t(.verifiedManual)
    default: return source
    }
}

// ── sidebar root (desktop.md §2: three sections; default Today; empty → Fragment library)

enum DesktopSection: String, CaseIterable, Identifiable, Hashable {
    case today
    case library
    case system

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return t(.sectionToday)
        case .library: return t(.sectionLibrary)
        case .system: return t(.sectionSystem)
        }
    }

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
        // A first install with no data opens the Fragment library's empty state (desktop.md §2).
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
                            Label(item.title, systemImage: item.icon)
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
                    Label(t(.preferences), systemImage: "slider.horizontal.3")
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
                TodayView(onOpenLibrary: { selected = .library }).navigationTitle(t(.sectionToday))
            case .library:
                LibraryView(onOpenSystem: { selected = .system }).navigationTitle(t(.sectionLibrary))
            case .system:
                SystemView().navigationTitle(t(.sectionSystem))
            }
        }
        .frame(minWidth: 980, minHeight: 600)
        .tint(.annBrand)
        .onAppear { model.startHub() }
    }
}

// ── Today (desktop.md §3) ───────────────────────────────────────────────

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
            Section(t(.todayTodo)) {
                reviewBlock(plan)
            }

            Section(t(.todayRecent)) {
                if model.latestFragments.isEmpty {
                    Text(t(.todayEmpty))
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
            Section(t(.todaySecondary)) {
                Text(t(.weeklyRetrieved, ["count": model.weeklyRetrieved]))
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
                    Text(t(.dueReviews)).font(.title3.bold())
                    if plan.due.isEmpty {
                        Text(t(.noDueToday)).foregroundStyle(.secondary)
                    } else if plan.limitReached {
                        // review.md §5: state the cap as a fact, keep due dates, never force a stop.
                        Text(
                            t(
                                .limitReached,
                                ["rated": plan.ratedToday, "limit": plan.dailyLimit, "due": plan.due.count])
                        )
                        .foregroundStyle(.secondary)
                    } else {
                        Text(
                            t(
                                .suggestedLine,
                                [
                                    "count": plan.suggested.count,
                                    "minutes": estimatedMinutes(plan.suggested.count),
                                ])
                        )
                        .foregroundStyle(.secondary)
                        if plan.beyondLimit > 0 {
                            Text(t(.beyondLimit, ["count": plan.beyondLimit]))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer()
                if plan.limitReached {
                    Button(t(.extraRound)) {
                        if model.startReviewSession(overflow: true) { reviewing = true }
                    }
                } else if plan.due.isEmpty {
                    Button(t(.tidyRecent), action: onOpenLibrary)
                } else {
                    Button(t(.startReview)) { reviewing = true }
                        .buttonStyle(.borderedProminent)
                }
            }
            if !plan.due.isEmpty {
                Text(
                    t(
                        .overdueTopics,
                        ["topics": plan.due.prefix(3).map { String($0.content.prefix(16)) }.joined(separator: " / ")])
                )
                .font(.callout).foregroundStyle(.secondary).lineLimit(1)
            }
            if let session = resumable {
                Button {
                    reviewing = true
                } label: {
                    Label(
                        t(.resumeReview, ["cursor": session.cursor, "total": session.fragmentIds.count]),
                        systemImage: "arrow.clockwise")
                }
            }
        }
    }

    /// 45 seconds per card (desktop.md §3.2).
    private func estimatedMinutes(_ count: Int) -> Int {
        Int(ceil(Double(count * SESSION_SECONDS_PER_CARD) / 60))
    }
}

// ── Fragment library (desktop.md §4) ────────────────────────────────────

/// Library columns (desktop.md §4.2). Content and kind are non-hideable; the hidden
/// set persists in UserDefaults.
enum LibraryColumn: String, CaseIterable, Identifiable {
    case content, kind, source, tags, review, capturedAt

    var id: String { rawValue }

    var label: String {
        switch self {
        case .content: return t(.columnContent)
        case .kind: return t(.columnKind)
        case .source: return t(.columnSource)
        case .tags: return t(.columnTags)
        case .review: return t(.columnReview)
        case .capturedAt: return t(.columnCapturedAt)
        }
    }

    /// desktop.md §4.2: content and kind cannot be hidden.
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
            Text(t(.emptyTitle)).font(.title2.bold())
            VStack(alignment: .leading, spacing: 6) {
                Text(t(.emptyStep1))
                Text(t(.emptyStep2))
            }
            Text(t(.emptyNote))
                .font(.footnote).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                Button(t(.openSystemPage), action: onOpenSystem)
                    .buttonStyle(.borderedProminent)
                Button(pairCodeCopied ? t(.copied) : t(.copyPairingCode)) {
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
                Text(model.hubListening ? t(.listeningWaiting) : model.hubState.text)
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
        .searchable(text: $search, prompt: t(.searchPrompt))
        .toolbar {
            // Column visibility (desktop.md §4.2): content and kind stay, the rest can be hidden.
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
                    Label(t(.columnsMenu), systemImage: "tablecolumns")
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
            t(.deleteTitle),
            isPresented: Binding(
                get: { confirmDelete != nil },
                set: { if !$0 { confirmDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(t(.deleteConfirm), role: .destructive) {
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
                filterGroup(
                    t(.columnKind), options: collectKinds(model.fragments), label: { kindLabel($0) },
                    selection: $kindFilter)
                filterGroup(
                    t(.columnReview), options: ReviewStatus.allCases, label: { $0.label }, selection: $statusFilter
                )
                filterGroup(
                    t(.columnSource), options: Array(collectHosts(model.fragments).prefix(Self.maxFilterOptions)),
                    label: { $0 }, selection: $hostFilter
                )
                filterGroup(
                    t(.columnTags), options: Array(collectTags(model.fragments).prefix(Self.maxFilterOptions)),
                    label: { "#\($0)" }, selection: $tagFilter
                )
                if hasActiveFilters {
                    Button(t(.clearFilters), action: clearFilters)
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
                    Text(t(.noMatch)).foregroundStyle(.secondary)
                    if hasActiveFilters {
                        Button(t(.clearFilters), action: clearFilters)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                table(detailAsColumn: detailAsColumn)
            }
            Divider()
            HStack {
                Text(t(.shownLine, ["shown": items.count, "matching": total, "total": model.fragments.count]))
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                if nextCursor != nil {
                    Button(t(.showMore), action: loadMore).controlSize(.small)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
        }
    }

    private func table(detailAsColumn: Bool) -> some View {
        Table(items, selection: $selection) {
            TableColumn(t(.columnContent), value: \.content)
            TableColumn(t(.columnKind)) { row in Text(kindLabel(row.kind)).font(.caption) }
            if !hiddenColumns.contains(.source) {
                TableColumn(t(.columnSource), value: \.context.sourceHost).width(min: 90)
            }
            if !hiddenColumns.contains(.tags) {
                TableColumn(t(.columnTags)) { row in
                    Text(row.tags.joined(separator: t(.tagSeparator))).font(.caption).lineLimit(1)
                }
            }
            if !hiddenColumns.contains(.review) {
                TableColumn(t(.columnReview)) { row in
                    Text(reviewStatus(of: row, now: nowMs()).label).font(.caption)
                }
            }
            if !hiddenColumns.contains(.capturedAt) {
                TableColumn(t(.columnCapturedAt)) { row in
                    Text(Date(timeIntervalSince1970: Double(row.context.capturedAt) / 1000), style: .date)
                        .font(.caption)
                }
            }
        }
        .contextMenu(forSelectionType: FragmentRecord.ID.self) { ids in
            if let id = ids.first, let fragment = items.first(where: { $0.id == id }) {
                if !detailAsColumn {
                    Button(t(.viewDetails)) { detailSheet = fragment }
                }
                Button(t(.deleteLocalCopy), role: .destructive) {
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
            Text(t(.selectOne))
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

// ── Fragment detail (desktop.md §4.3: the processing first, the source after) ─

/// The detail column of the library, and the body of the sheet in a narrow
/// window. R1 capture fields are read-only; Desktop can delete its own copy.
struct FragmentDetailView: View {
    @EnvironmentObject var model: DesktopModel
    let fragment: FragmentRecord
    var onDelete: (() -> Void)?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                // 1. Content and kind
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
                    detailSection(t(.detailTimeRange)) {
                        Text("\(mmss(clip.startMs)) – \(mmss(clip.endMs))")
                            .font(.callout.monospacedDigit())
                    }
                }

                // 2. The user's application
                detailSection(t(.detailUse)) {
                    Text(fragment.processing.use)
                }

                // 3. Verification
                detailSection(t(.detailVerified)) {
                    if let verified = fragment.processing.verified {
                        VStack(alignment: .leading, spacing: 4) {
                            LabeledContent(t(.confirmedAt)) {
                                Text(Date(timeIntervalSince1970: Double(verified.confirmedAt) / 1000), style: .date)
                                Text(Date(timeIntervalSince1970: Double(verified.confirmedAt) / 1000), style: .time)
                            }
                            LabeledContent(t(.columnSource)) { Text(verifiedSourceLabel(verified.source)) }
                            if let summary = verified.summary, !summary.isEmpty {
                                LabeledContent(t(.summaryLabel)) { Text(summary) }
                            }
                            if let notes = verified.notes, !notes.isEmpty {
                                LabeledContent(t(.notesLabel)) { Text(notes) }
                            }
                        }
                    } else {
                        Text(t(.notConfirmed)).foregroundStyle(.secondary)
                    }
                }

                // 4. The original context and the way back to the source
                detailSection(t(.detailContext)) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(fragment.context.excerpt)
                        if let title = fragment.context.sourceTitle, !title.isEmpty {
                            Text(title).font(.footnote).foregroundStyle(.secondary)
                        }
                        if let url = URL(string: fragment.context.sourceUrl) {
                            Link(t(.backToSource, ["host": fragment.context.sourceHost]), destination: url)
                                .font(.callout)
                        } else {
                            Text(fragment.context.sourceUrl).font(.footnote)
                        }
                    }
                }

                // 5. Review summary
                detailSection(t(.detailReview)) {
                    VStack(alignment: .leading, spacing: 4) {
                        LabeledContent(t(.repetitions)) { Text("\(fragment.review.repetitions)") }
                        LabeledContent(t(.lapses)) { Text("\(fragment.review.lapses)") }
                        if let last = fragment.review.lastReviewedAt {
                            LabeledContent(t(.lastReviewed)) {
                                Text(Date(timeIntervalSince1970: Double(last) / 1000), style: .date)
                                Text(Date(timeIntervalSince1970: Double(last) / 1000), style: .time)
                            }
                        }
                        LabeledContent(t(.nextDue)) {
                            Text(Date(timeIntervalSince1970: Double(fragment.review.nextReviewAt) / 1000), style: .date)
                            Text(Date(timeIntervalSince1970: Double(fragment.review.nextReviewAt) / 1000), style: .time)
                        }
                    }
                }

                // 6. Tags and metadata
                detailSection(t(.columnTags)) {
                    if fragment.tags.isEmpty {
                        Text(t(.noneLabel)).foregroundStyle(.secondary)
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
                    Button(t(.deleteLocalCopy), role: .destructive, action: onDelete)
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
            return fragment.questionDetail.map { t(.questionStatusLine, ["status": questionStatusLabel($0.status)]) }
        default:
            return nil
        }
    }

    /// The question kind's status value (fragments.md §4.7) in the interface language.
    private func questionStatusLabel(_ status: String) -> String {
        switch status {
        case "open": return t(.questionOpen)
        case "testing": return t(.questionTesting)
        case "answered": return t(.questionAnswered)
        default: return status
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
                        Text(t(.imageAsset, ["id": assetId])).font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    Label(t(.attachmentMissingId, ["id": assetId]), systemImage: "exclamationmark.triangle")
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
                ToolbarItem(placement: .confirmationAction) { Button(t(.close)) { dismiss() } }
            }
    }
}

// ── Review session (desktop.md §5) ──────────────────────────────────────

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
                    Label(t(.hintUsed), systemImage: "lightbulb")
                        .font(.caption).foregroundStyle(.orange)
                }
                Spacer()
                Button(t(.skip)) {
                    model.skipCurrent(reason: t(.skipManual)); resetCard()
                }
                Button(t(.end)) { dismiss() }
            }

            // The question face (the default type per kind, desktop.md §5.2)
            VStack(alignment: .leading, spacing: 10) {
                Text(spec.question).font(.title2.bold())
                Text(t(.topicLine, ["topic": String(fragment.content.prefix(40))]))
                    .font(.footnote).foregroundStyle(.secondary)
                if fragment.kind == "visual" {
                    Text(t(.promptVisual))
                        .font(.footnote).foregroundStyle(.secondary)
                } else if fragment.kind == "media-clip" {
                    Text(t(.promptMedia))
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text(t(.promptDefault))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            // R4 visual occlusion: before the reveal only a pixelated image (roadmap R4.1).
            if fragment.kind == "visual", !revealed, let assetId = fragment.attachmentIds.first,
                let image = model.assetImage(assetId: assetId), let occluded = occludedImage(image)
            {
                VStack(spacing: 4) {
                    Image(nsImage: occluded)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text(t(.imageHidden))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // The hint ladder (desktop.md §5.3, four levels): any hint sets usedHint (review.md §4);
            // ratings 1..4 stay available only after the reveal.
            if !revealed {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        ForEach(Array(spec.hints.enumerated()), id: \.offset) { idx, hint in
                            Button(t(.hintButton, ["level": idx + 1, "hint": hint])) {
                                if hintCount < idx + 1 { hintCount = idx + 1 }
                                usedHint = true
                            }
                            .disabled(idx > hintCount)  // the ladder unlocks in order
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        Spacer()
                        Button {
                            reveal()
                        } label: {
                            Text(t(.reveal)).bold()
                        }
                        .buttonStyle(.borderedProminent)
                    }

                    // The unlocked hints' content (L1 structure → L2 source and tags →
                    // L3 excerpt with the answer masked → L4 verification status and summary)
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

    /// What the reveal shows (desktop.md §5.1 ③): your understanding, the verification, your
    /// application and the way back to the source; visual reveals the original image and
    /// media-clip the time range (R4).
    private func referenceView(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t(.yourUnderstanding, ["content": fragment.content])).font(.headline)
            Text(verificationLine(fragment)).foregroundStyle(.secondary)
            Text(t(.yourUse, ["use": fragment.processing.use]))
            if fragment.kind == "media-clip" {
                Text(t(.timeRangeLine, ["range": mediaClipRangeLabel(fragment)]))
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
                    Label(t(.attachmentMissing), systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            if let url = URL(string: fragment.context.sourceUrl) {
                Link(t(.backToSource, ["host": fragment.context.sourceHost]), destination: url)
                    .font(.callout)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.annBrand.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private func verificationLine(_ fragment: FragmentRecord) -> String {
        guard let verified = fragment.processing.verified else { return t(.verificationNotConfirmed) }
        var line = t(.verificationLine, ["source": verifiedSourceLabel(verified.source)])
        if let summary = verified.summary, !summary.isEmpty {
            line += t(.verificationLineSummary, ["summary": summary])
        }
        return line
    }

    /// The media-clip's mm:ss range: the detail first, the locator as the fallback.
    private func mediaClipRangeLabel(_ fragment: FragmentRecord) -> String {
        if let clip = fragment.mediaClipDetail {
            return "\(mmss(clip.startMs)) – \(mmss(clip.endMs))"
        }
        if case let .time(startMs, endMs) = fragment.context.locator {
            return "\(mmss(startMs)) – \(mmss(endMs))"
        }
        return t(.unknownRange)
    }

    /// Rating buttons only appear after the reveal and show the next interval; keys 1-4 (desktop.md §5/§9).
    private func ratingButtons(_ fragment: FragmentRecord) -> some View {
        HStack(spacing: 12) {
            ForEach(Array(ReviewRating.allCases.enumerated()), id: \.element) { idx, rating in
                Button {
                    guard model.rateCurrent(rating, usedHint: usedHint) else { return }
                    resetCard()
                } label: {
                    VStack {
                        Text("\(idx + 1) \(label(rating))")
                        Text(
                            t(.intervalDays, ["count": previewInterval(fragment.review, rating: rating, now: nowMs())])
                        )
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

    /// The four hint levels' content (desktop.md §5.3); the pure content lives in AnnHubCore
    /// (maskedExcerpt / verificationHint).
    private func hintText(_ level: Int, _ fragment: FragmentRecord) -> String {
        switch level {
        case 1:
            // L1: the kind's keyword or structure hint.
            return t(.hint1, ["label": spec.hints.first ?? ""])
        case 2:
            // L2: the actual sourceTitle and tags.
            let title = fragment.context.sourceTitle ?? fragment.context.sourceHost
            let tags = fragment.tags.map { "#\($0)" }.joined(separator: " ")
            return t(
                .hint2,
                [
                    "label": spec.hints.count > 1 ? spec.hints[1] : t(.hint2Label), "title": title,
                    "tags": tags.isEmpty ? t(.hint2NoTags) : tags,
                ])
        case 3:
            // L3: the excerpt without the answer — the answer content is masked as ﹏﹏﹏.
            return t(
                .hint3,
                ["label": spec.hints.count > 2 ? spec.hints[2] : t(.hint3Label), "excerpt": maskedExcerpt(fragment)])
        default:
            // L4: the verification status and summary; without a summary, look back at the context.
            return t(
                .hint4,
                ["label": spec.hints.count > 3 ? spec.hints[3] : t(.hint4Label), "text": verificationHint(fragment)])
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
    /// suggested amount is used up it says so and offers one more round beyond it.
    private var completionView: some View {
        let plan = model.dailyPlan
        return VStack(spacing: 14) {
            Spacer()
            if let wrap = model.wrapUp {
                Text(t(.wrapTitle)).font(.title2.bold())
                Text(t(.wrapRated, ["rated": wrap.rated, "hint": wrap.usedHint, "again": wrap.again]))
                if wrap.skipped > 0 {
                    Text(t(.wrapSkipped, ["count": wrap.skipped]))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text(upcomingLine(wrap)).foregroundStyle(.secondary)
            } else {
                Text(t(.noDueToday)).font(.title3)
            }
            if plan.limitReached {
                Text(
                    t(.limitReached, ["rated": plan.ratedToday, "limit": plan.dailyLimit, "due": plan.due.count])
                )
                .font(.callout).foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button(t(.backToToday)) {
                    model.wrapUp = nil
                    dismiss()
                }
                if plan.limitReached {
                    Button(t(.extraRound)) { startRound(overflow: true) }
                } else if !plan.suggested.isEmpty {
                    Button(t(.continueNext, ["due": plan.due.count])) { startRound(overflow: false) }
                        .buttonStyle(.borderedProminent)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func upcomingLine(_ wrap: SessionWrapUp) -> String {
        guard !wrap.upcoming.isEmpty else { return t(.upcomingNone) }
        let now = nowMs()
        let parts = wrap.upcoming.map {
            t(.upcomingPart, ["day": relativeDayLabel(dayStart: $0.dayStart, now: now), "count": $0.count])
        }
        return t(.upcomingLine, ["parts": parts.joined(separator: " / ")])
    }

    private func startRound(overflow: Bool) {
        if model.startReviewSession(overflow: overflow) { resetCard() }
    }

    private func label(_ r: ReviewRating) -> String {
        switch r {
        case .again: return t(.ratingAgain)
        case .hard: return t(.ratingHard)
        case .good: return t(.ratingGood)
        case .easy: return t(.ratingEasy)
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

// ── System (desktop.md §6) ──────────────────────────────────────────────

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
        .confirmationDialog(t(.rotateTitle), isPresented: $confirmingRotate, titleVisibility: .visible) {
            Button(t(.regenerate), role: .destructive) {
                model.rotatePairToken()
                tokenRevealed = true
            }
            Button(t(.cancel), role: .cancel) {}
        } message: {
            Text(t(.rotateMessage))
        }
    }

    private var connectionSection: some View {
        Section(t(.sectionConnection)) {
            HStack(spacing: 8) {
                Image(systemName: model.hubListening ? "circle.fill" : "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(model.hubListening ? Color.green : Color.orange)
                    .accessibilityHidden(true)
                Text(model.hubListening ? t(.serviceRunning) : model.hubState.text)
            }
            LabeledContent(t(.pairingCode)) {
                HStack(spacing: 8) {
                    Text(tokenRevealed ? model.pairToken : String(repeating: "•", count: model.pairToken.count))
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                        .accessibilityIdentifier("pair-token")
                    Button(tokenRevealed ? t(.hide) : t(.show)) { tokenRevealed.toggle() }
                    Button(tokenCopied ? t(.copied) : t(.copy)) {
                        model.copyPairToken()
                        tokenCopied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { tokenCopied = false }
                    }
                    Button(t(.regenerate)) { confirmingRotate = true }
                }
            }
            LabeledContent(t(.lastExtensionConnection)) {
                Text(model.lastConnectionAt.map(relativeAgo) ?? t(.noneYet))
            }
        }
    }

    private var deliverySection: some View {
        Section(t(.sectionDelivery)) {
            Text(
                t(
                    .deliverySummary,
                    [
                        "fragments": model.deliveredFragmentCount, "assets": model.stats.assets,
                        "missing": model.missingAttachmentCount,
                    ])
            )
            let issues = model.attentionItems
            if issues.isEmpty {
                Label(t(.attentionNone), systemImage: "checkmark.circle")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(issues, id: \.self) { issue in
                    Label(t(.attentionLine, ["issue": issue]), systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                }
            }
            if model.recentDeliveries.isEmpty {
                Text(t(.noDeliveries)).font(.footnote).foregroundStyle(.secondary)
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
            DisclosureGroup(t(.technicalInfo), isExpanded: $technicalExpanded) {
                Group {
                    LabeledContent(t(.serviceAddress)) { Text("http://127.0.0.1:8765") }
                    LabeledContent(t(.device)) {
                        Text(model.store.deviceId).font(.system(.caption, design: .monospaced))
                    }
                    LabeledContent(t(.databaseVersion)) { Text("Fragment schema v4") }
                    LabeledContent(t(.contractVersion)) { Text(DesktopHub.apiVersion) }
                }
                Group {
                    LabeledContent(t(.localFragments)) { Text("\(model.stats.fragments)") }
                    LabeledContent(t(.reviewLogs)) { Text("\(model.stats.reviewLogs)") }
                    LabeledContent(t(.imageAssets)) { Text("\(model.stats.assets)") }
                    LabeledContent(t(.deletionMarks)) { Text("\(model.stats.deletions)") }
                }
                Divider()
                syncInfoRows
                Divider()
                deliveryFailureRows
            }
        }
    }

    /// R3 two-way sync (storage.md §9) and the sync conflict report.
    private var syncInfoRows: some View {
        Group {
            LabeledContent(t(.pendingChanges)) {
                Text("\(model.syncInfo.pendingChanges)")
                    .foregroundStyle(model.syncInfo.pendingChanges > 0 ? Color.orange : Color.secondary)
            }
            LabeledContent(t(.pulledCursor)) { Text("\(model.syncInfo.pulledCursor)") }
            LabeledContent(t(.lastExtensionPull)) {
                Text(model.syncInfo.lastPulledAt.map(relativeAgo) ?? t(.noneYet))
            }
            LabeledContent(t(.eventsReceived)) {
                Text(
                    t(
                        .eventsLine,
                        [
                            "received": model.syncInfo.events.received, "applied": model.syncInfo.events.applied,
                            "duplicates": model.syncInfo.events.duplicates, "skipped": model.syncInfo.events.skipped,
                        ])
                )
                .font(.caption)
            }
        }
    }

    private var deliveryFailureRows: some View {
        let failures = model.recentDeliveries.filter { $0.status >= 300 }
        return Group {
            if failures.isEmpty {
                Text(t(.noDeliveryErrors)).font(.footnote).foregroundStyle(.secondary)
            } else {
                Text(t(.deliveryErrorDetails)).font(.subheadline.bold())
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

// ── Settings (desktop.md §8.2) ──────────────────────────────────────────

/// The standard macOS settings window (Cmd+,). One page — Review. Desktop has no
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
            Section(t(.columnReview)) {
                LabeledContent(t(.dailyLimit)) {
                    HStack(spacing: 10) {
                        Text("\(DAILY_LIMIT_MIN)").foregroundStyle(.secondary)
                        Slider(value: dailyLimit, in: Double(DAILY_LIMIT_MIN)...Double(DAILY_LIMIT_MAX), step: 1)
                            .frame(width: 200)
                        Text("\(DAILY_LIMIT_MAX)").foregroundStyle(.secondary)
                        Text(t(.dailyLimitCount, ["count": model.dailyLimit]))
                            .monospacedDigit()
                            .frame(width: 52, alignment: .trailing)
                    }
                }
                Text(t(.dailyLimitNote))
                    .font(.footnote).foregroundStyle(.secondary)

                LabeledContent(t(.dailyReminder)) {
                    HStack(spacing: 10) {
                        Toggle(t(.dailyReminder), isOn: reminderEnabled).labelsHidden()
                        Text(t(.everyDay))
                        DatePicker(t(.reminderTime), selection: reminderTime, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                            .disabled(!model.reminder.enabled)
                    }
                }
                Text(t(.reminderNote))
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .fixedSize(horizontal: false, vertical: true)
        .tint(.annBrand)
    }
}

// ── R4 visual occlusion: AppKit drawing (the pixel logic is AnnHubCore.pixelateBitmap) ─

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
