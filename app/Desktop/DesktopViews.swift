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
    formatter.locale = Locale(identifier: UILanguage.current == .zh ? "zh_CN" : "en_US")
    formatter.unitsStyle = .full
    return formatter.localizedString(for: Date(timeIntervalSince1970: Double(ms) / 1000), relativeTo: Date())
}

/// 今天 / 昨天 / 周四 — where a fragment's date appears in lists.
func writtenDayLabel(_ ms: Int) -> String {
    relativeDayLabel(dayStart: startOfLocalDay(ms), now: nowMs())
}

// ── sidebar root (desktop.md §2: three sections; default 今日; empty → 碎片库)

enum DesktopSection: String, CaseIterable, Identifiable, Hashable {
    case today
    case library
    case system

    /// Also the stable name for launch arguments (`--annhub-section=library`) and diagnostics.
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

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                List {
                    ForEach(DesktopSection.allCases) { item in
                        // ⌘1…⌘3 are menu items (DesktopCommands); the sidebar is for the mouse.
                        Button {
                            model.go(item)
                        } label: {
                            Label(item.title, systemImage: item.icon)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(model.section == item ? .isSelected : [])
                        .listRowBackground(
                            model.section == item ? Color.annBrand.opacity(0.18) : Color.clear
                        )
                    }
                }
                Divider()
                Button {
                    AppPresence.openPreferences()
                } label: {
                    Label(t(.preferences), systemImage: "slider.horizontal.3")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .navigationSplitViewColumnWidth(180)
        } detail: {
            switch model.section {
            case .today:
                TodayView(onOpenLibrary: { model.go(.library) }).navigationTitle(t(.sectionToday))
            case .library:
                LibraryView(onOpenSystem: { model.go(.system) }).navigationTitle(t(.sectionLibrary))
            case .system:
                SystemView().navigationTitle(t(.sectionSystem))
            }
        }
        .toolbar {
            // desktop.md §9: the toolbar's one control is the way into ⌘K.
            ToolbarItem(placement: .automatic) {
                Button {
                    model.paletteVisible = true
                } label: {
                    Label(t(.searchAndCommands), systemImage: "magnifyingglass")
                }
                .help(t(.searchAndCommandsHelp))
            }
        }
        .overlay { CommandPaletteOverlay() }
        .sheet(isPresented: $model.reviewSheetPresented) {
            ReviewSessionView().frame(minWidth: 680, minHeight: 540)
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
    @State private var detail: FragmentRecord?

    private var resumable: ReviewSessionState? { model.resumableSession }

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
                                ["count": plan.suggested.count, "minutes": estimatedMinutes(plan.suggested.count)])
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
                        if model.startReviewSession(overflow: true) { model.reviewSheetPresented = true }
                    }
                } else if plan.due.isEmpty {
                    Button(t(.tidyRecent), action: onOpenLibrary)
                } else {
                    Button(t(.startReview)) { model.reviewSheetPresented = true }
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
                    model.reviewSheetPresented = true
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
                Text(model.hubListening ? t(.serviceRunning) : model.hubState)
                if model.hubFailed && model.storeError == nil {
                    Button(t(.retryStart)) { model.restartHub() }
                        .controlSize(.small)
                }
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
                    LabeledContent(t(.serviceAddress)) {
                        Text("http://127.0.0.1:\(model.hubPort ?? model.config.port)")
                    }
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

    /// R3 双向同步 (storage.md §9) and the sync conflict report.
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
