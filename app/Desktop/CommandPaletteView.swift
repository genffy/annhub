// ⌘K (desktop.md §9): fragments matched by the shared search contract, and the commands
// that can run now. The ranking, the hit fields and the command list come from AnnHubCore
// (`paletteSearch`); this file is the keyboard model and the rendering.

import AnnHubCore
import SwiftUI

/// The palette's state apart from SwiftUI, so its keyboard behaviour can be tested:
/// typing re-ranks, the arrows move through fragments then commands (wrapping), return runs.
@MainActor
final class PaletteViewModel: ObservableObject {
    @Published var query = "" {
        didSet { if query != oldValue { queryChanged() } }
    }
    @Published private(set) var results = PaletteResults(fragments: [], totalFragments: 0, commands: [], isRecent: true)
    @Published private(set) var selectedId: String?

    private var fragments: [FragmentRecord] = []
    private var context = PaletteContext()
    private var searchTask: Task<Void, Never>?
    /// A large library should not make every keystroke wait for a full search.
    private let debounce: Duration

    init(debounce: Duration = .milliseconds(90)) {
        self.debounce = debounce
    }

    /// Hands over the library as it is now; the palette re-ranks at once.
    func update(fragments: [FragmentRecord], context: PaletteContext) {
        self.fragments = fragments
        self.context = context
        refreshNow()
    }

    /// Synchronous search (opening the palette, tests).
    func refreshNow() {
        searchTask?.cancel()
        apply(paletteSearch(query, fragments: fragments, context: context))
    }

    private func queryChanged() {
        searchTask?.cancel()
        let (query, fragments, context, debounce) = (self.query, self.fragments, self.context, self.debounce)
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: debounce)
            if Task.isCancelled { return }
            let found = await Task.detached(priority: .userInitiated) {
                paletteSearch(query, fragments: fragments, context: context)
            }.value
            if Task.isCancelled { return }
            self?.apply(found)
        }
    }

    private func apply(_ next: PaletteResults) {
        results = next
        // Keep the highlighted row when it is still there; otherwise start from the top.
        if let selectedId, next.items.contains(where: { $0.id == selectedId }) { return }
        selectedId = next.items.first?.id
    }

    var items: [PaletteItem] { results.items }

    var selectedItem: PaletteItem? {
        items.first { $0.id == selectedId }
    }

    /// ↑ / ↓, wrapping at both ends.
    func move(_ delta: Int) {
        let items = self.items
        guard !items.isEmpty else { return }
        let current = items.firstIndex { $0.id == selectedId } ?? (delta > 0 ? -1 : 0)
        selectedId = items[((current + delta) % items.count + items.count) % items.count].id
    }

    func select(_ id: String) {
        if items.contains(where: { $0.id == id }) { selectedId = id }
    }
}

/// Dimmed backdrop plus the palette; empty (and invisible to the mouse) while closed.
struct CommandPaletteOverlay: View {
    @EnvironmentObject var model: DesktopModel

    var body: some View {
        if model.paletteVisible {
            ZStack(alignment: .top) {
                Color.black.opacity(0.14)
                    .contentShape(Rectangle())
                    .onTapGesture { model.paletteVisible = false }
                    .accessibilityHidden(true)
                CommandPaletteView().padding(.top, 72)
            }
        }
    }
}

struct CommandPaletteView: View {
    @EnvironmentObject var model: DesktopModel
    @StateObject private var palette = PaletteViewModel()
    @FocusState private var searchFocused: Bool
    @State private var listHeight: CGFloat = 0
    private static let maxListHeight: CGFloat = 380

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Divider()
            resultList
            Divider()
            footer
        }
        .frame(width: 620)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary.opacity(0.12)))
        .shadow(color: .black.opacity(0.25), radius: 24, y: 8)
        .onExitCommand { model.paletteVisible = false }
        .onAppear {
            if let initial = model.paletteInitialQuery { palette.query = initial }
            palette.update(fragments: model.fragments, context: model.paletteContext)
            searchFocused = true
        }
        .onChange(of: model.revision) {
            palette.update(fragments: model.fragments, context: model.paletteContext)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(t(.paletteTitle))
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
            TextField(t(.palettePrompt), text: $palette.query)
                .textFieldStyle(.plain)
                .font(.title3)
                .focused($searchFocused)
                .onSubmit(activateSelection)
                // The field editor of a single-line field takes ↑ and ↓ for itself (it moves the
                // caret), so they never reach `onMoveCommand`; `onKeyPress` sees them first.
                .onKeyPress(.upArrow) {
                    palette.move(-1)
                    return .handled
                }
                .onKeyPress(.downArrow) {
                    palette.move(1)
                    return .handled
                }
                .accessibilityLabel(t(.paletteFieldLabel))
            Text("esc")
                .font(.caption.monospaced())
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 4))
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    private var resultList: some View {
        let results = palette.results
        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if results.fragments.isEmpty && results.commands.isEmpty {
                        Text(t(.paletteNoResults))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                            .padding(24)
                    }
                    if !results.fragments.isEmpty {
                        sectionHeader(
                            results.isRecent
                                ? t(.paletteRecent) : t(.paletteMatches, ["count": results.totalFragments]))
                        ForEach(results.fragments) { hit in
                            fragmentRow(hit)
                        }
                        if results.totalFragments > results.fragments.count {
                            Text(t(.paletteMore, ["count": results.totalFragments - results.fragments.count]))
                                .font(.caption).foregroundStyle(.secondary)
                                .padding(.horizontal, 16).padding(.vertical, 6)
                        }
                    }
                    if !results.commands.isEmpty {
                        sectionHeader(t(.paletteCommands))
                        ForEach(results.commands) { command in
                            commandRow(command)
                        }
                    }
                }
                .padding(.vertical, 6)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(key: PaletteListHeightKey.self, value: proxy.size.height)
                    })
            }
            // A ScrollView takes all the height it is offered; measure the rows instead, so a
            // short result list gives a short palette.
            .frame(height: min(max(listHeight, 44), Self.maxListHeight))
            .onPreferenceChange(PaletteListHeightKey.self) { listHeight = $0 }
            .onChange(of: palette.selectedId) {
                if let id = palette.selectedId { proxy.scrollTo(id) }
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 14) {
            Text(t(.paletteKeySelect))
            Text(t(.paletteKeyOpen))
            Text(t(.paletteKeyClose))
            Spacer()
            Text(t(.paletteScope))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.caption.bold())
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 2)
            .accessibilityAddTraits(.isHeader)
    }

    // ── rows ─────────────────────────────────────────────────────────────

    private func fragmentRow(_ hit: PaletteFragmentHit) -> some View {
        let id = PaletteItem.fragment(hit).id
        return Button {
            model.openFragment(hit.fragment.id)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(kindLabel(hit.fragment.kind))
                        .font(.caption)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(Color.annBrand.opacity(0.18), in: Capsule())
                    Text(highlighted(hit.fragment.content))
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if let label = hit.matchLabel() {
                        Text(t(.paletteHit, ["fields": label])).font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let snippet = hit.snippet {
                    Text(highlighted(snippet))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        .padding(.leading, 2)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rowBackground(id))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id(id)
        .onHover { if $0 { palette.select(id) } }
        .accessibilityLabel(
            [
                kindLabel(hit.fragment.kind), hit.fragment.content,
                hit.matchLabel().map { t(.paletteHit, ["fields": $0]) },
            ]
            .compactMap { $0 }.joined(separator: t(.clauseSeparator)))
    }

    private func commandRow(_ command: PaletteCommand) -> some View {
        let id = PaletteItem.command(command).id
        return Button {
            model.run(command.id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon(for: command.id)).foregroundStyle(.secondary).frame(width: 18)
                    .accessibilityHidden(true)
                Text(command.title)
                Spacer(minLength: 8)
                if let detail = command.detail {
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rowBackground(id))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .id(id)
        .onHover { if $0 { palette.select(id) } }
        .accessibilityLabel([command.title, command.detail].compactMap { $0 }.joined(separator: t(.clauseSeparator)))
    }

    private func rowBackground(_ id: String) -> some View {
        (palette.selectedId == id ? Color.annBrand.opacity(0.2) : Color.clear)
    }

    private func icon(for command: PaletteCommandID) -> String {
        switch command {
        case .startReview, .resumeReview: return "play.fill"
        case .goToday: return "sun.max"
        case .goLibrary: return "square.grid.2x2"
        case .goSystem: return "gearshape.2"
        case .openPreferences: return "slider.horizontal.3"
        case .copyPairCode: return "doc.on.doc"
        }
    }

    private func activateSelection() {
        switch palette.selectedItem {
        case .fragment(let hit): model.openFragment(hit.fragment.id)
        case .command(let command): model.run(command.id)
        case nil: break
        }
    }

    /// The text with the search words marked (the design's `<mark>`).
    private func highlighted(_ text: String) -> AttributedString {
        var attributed = AttributedString(text)
        for range in highlightRanges(of: palette.query, in: text) {
            if let target = Range(range, in: attributed) {
                attributed[target].backgroundColor = Color.annBrand.opacity(0.28)
                attributed[target].font = .body.bold()
            }
        }
        return attributed
    }
}

private struct PaletteListHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
