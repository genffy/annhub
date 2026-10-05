// ⌘K as the user drives it, the navigation it triggers, and the library's batch actions.

import AnnHubCore
import AppKit
import SwiftUI
import XCTest

@MainActor
final class PaletteViewModelTests: DesktopTestCase {
    private func library() throws -> [FragmentRecord] {
        [
            try makeRecord(
                kind: "concept", content: "重试风暴", use: "复盘时检查客户端重试是否放大了流量", tags: ["reliability"], now: T0 - 3000),
            try makeRecord(kind: "concept", content: "退避加抖动", use: "重试前先确认幂等键", tags: ["retry"], now: T0 - 2000),
            try makeRecord(kind: "concept", content: "幂等", use: "给支付接口加幂等键", tags: ["api"], now: T0 - 1000),
        ]
    }

    private func viewModel(_ fragments: [FragmentRecord], context: PaletteContext = PaletteContext(dueCount: 3))
        -> PaletteViewModel
    {
        let palette = PaletteViewModel(debounce: .milliseconds(1))
        palette.update(fragments: fragments, context: context)
        return palette
    }

    func testOpeningShowsTheNewestFragmentsAndTheFirstRowIsSelected() throws {
        let palette = viewModel(try library())
        XCTAssertTrue(palette.results.isRecent)
        XCTAssertEqual(palette.results.fragments.count, 3)
        XCTAssertEqual(palette.selectedItem, palette.items.first)
        XCTAssertEqual(palette.results.fragments.first?.fragment.content, "幂等", "newest first")
    }

    func testTheArrowsWalkFragmentsThenCommandsAndWrapAround() throws {
        let palette = viewModel(try library())
        let all = palette.items
        XCTAssertEqual(all.count, 3 + 6, "three fragments, six commands (开始复习 is available)")
        palette.move(1)
        XCTAssertEqual(palette.selectedItem, all[1])
        for _ in 0..<(all.count - 1) { palette.move(1) }
        XCTAssertEqual(palette.selectedItem, all[0], "↓ past the end wraps to the top")
        palette.move(-1)
        XCTAssertEqual(palette.selectedItem, all.last, "↑ from the top wraps to the bottom")
    }

    func testTypingReRanksAndKeepsTheSelectionOnlyIfItSurvives() async throws {
        let palette = viewModel(try library())
        palette.query = "重试"
        palette.refreshNow()
        XCTAssertFalse(palette.results.isRecent)
        XCTAssertEqual(palette.results.totalFragments, 2, "重试风暴 by content, 退避加抖动 by 应用")
        XCTAssertEqual(palette.results.fragments.first?.fragment.content, "重试风暴", "content outranks 应用")
        XCTAssertEqual(palette.selectedItem, palette.items.first)

        palette.move(1)
        let second = palette.selectedItem
        palette.query = "重试风"  // narrows to one: the highlighted row is gone
        palette.refreshNow()
        XCTAssertNotEqual(palette.selectedItem, second)
        XCTAssertEqual(palette.selectedItem, palette.items.first, "falls back to the top")
    }

    func testTheDebouncedSearchEventuallyAppliesTheLatestQuery() async throws {
        let palette = viewModel(try library())
        palette.query = "幂"
        palette.query = "幂等"
        let applied = await waitUntil { !palette.results.isRecent && palette.results.totalFragments == 2 }
        XCTAssertTrue(applied, "only the last keystroke's results land")
    }

    func testNothingMatchingLeavesNothingToRun() throws {
        let palette = viewModel(try library())
        palette.query = "zzzzzz"
        palette.refreshNow()
        XCTAssertTrue(palette.items.isEmpty)
        XCTAssertNil(palette.selectedItem)
        palette.move(1)  // harmless
        XCTAssertNil(palette.selectedItem)
    }

    func testHoverSelectionIgnoresRowsThatAreNotThere() throws {
        let palette = viewModel(try library())
        let target = palette.items[2]
        palette.select(target.id)
        XCTAssertEqual(palette.selectedItem, target)
        palette.select("fragment:does-not-exist")
        XCTAssertEqual(palette.selectedItem, target)
    }
}

@MainActor
final class NavigationTests: DesktopTestCase {
    private var harnesses: [Harness] = []

    override func tearDown() async throws {
        for harness in harnesses { harness.stop() }
        harnesses = []
    }

    private func harness(_ fragments: [FragmentRecord] = []) throws -> Harness {
        let made = try makeHarness(fragments: fragments)
        harnesses.append(made)
        return made
    }

    func testPaletteCommandsMoveAroundTheApp() throws {
        let h = try harness([try makeRecord()])
        h.model.paletteVisible = true
        h.model.run(.goSystem)
        XCTAssertEqual(h.model.section, .system)
        XCTAssertFalse(h.model.paletteVisible, "running a command closes the palette")
        h.model.run(.goLibrary)
        XCTAssertEqual(h.model.section, .library)
        h.model.run(.goToday)
        XCTAssertEqual(h.model.section, .today)
    }

    func testStartReviewOpensTheSameSheetAsToday() throws {
        let h = try harness([try makeRecord()])
        h.model.go(.library)
        h.model.run(.startReview)
        XCTAssertEqual(h.model.section, .today)
        XCTAssertTrue(h.model.reviewSheetPresented)
    }

    func testPickingAFragmentShowsItInTheLibrary() throws {
        let record = try makeRecord()
        let h = try harness([record])
        h.model.paletteVisible = true
        h.model.openFragment(record.id)
        XCTAssertEqual(h.model.section, .library)
        XCTAssertEqual(h.model.focusedFragmentId, record.id, "the library consumes this and selects the row")
        XCTAssertFalse(h.model.paletteVisible)
    }

    func testThePaletteOnlyOffersWhatCanRun() throws {
        let h = try harness()
        XCTAssertEqual(h.model.paletteContext, PaletteContext(dueCount: 0, resume: nil))
        let h2 = try harness(try scenarioCRecords())
        XCTAssertEqual(h2.model.paletteContext.dueCount, 4)
        h2.model.startReviewSession()
        XCTAssertEqual(h2.model.paletteContext.resume, PaletteContext.Resume(cursor: 0, total: 4))
        let ids = paletteSearch("", fragments: [], context: h2.model.paletteContext).commands.map(\.id)
        XCTAssertEqual(ids.prefix(2), [.resumeReview, .startReview])
    }

    func testTheLaunchKnobsPickTheStartingPageAndPalette() throws {
        let config = DesktopLaunchConfig(
            port: 0, initialSection: "system", initialPaletteQuery: "重试", notificationsEnabled: false)
        let h = try makeHarness(fragments: [try makeRecord()], config: config)
        harnesses.append(h)
        XCTAssertEqual(h.model.section, .system)
        XCTAssertTrue(h.model.paletteVisible)
        XCTAssertEqual(h.model.paletteInitialQuery, "重试")
        // Every page has a launch-argument name.
        XCTAssertEqual(DesktopSection.allCases.map(\.rawValue), ["today", "library", "system"])
    }
}

@MainActor
final class LibraryActionTests: DesktopTestCase {
    private var harnesses: [Harness] = []

    override func tearDown() async throws {
        for harness in harnesses { harness.stop() }
        harnesses = []
    }

    private func harness(_ fragments: [FragmentRecord]) throws -> Harness {
        let made = try makeHarness(fragments: fragments)
        harnesses.append(made)
        return made
    }

    func testBatchTagsShowInTheModelAndStayOnThisMac() throws {
        let records = try (0..<3).map { try makeRecord(content: "item \($0)", tags: ["base"], now: T0 - $0) }
        let h = try harness(records)
        let revision = h.model.revision

        let added = try XCTUnwrap(
            h.model.editTags(add: true, tags: ["mine", "#Next"], ids: records.prefix(2).map(\.id)))
        XCTAssertEqual(added.updated, 2)
        XCTAssertGreaterThan(h.model.revision, revision, "views re-query after an edit")
        let tagsById = Dictionary(uniqueKeysWithValues: h.model.fragments.map { ($0.id, $0.tags) })
        XCTAssertEqual(tagsById[records[0].id], ["base", "mine", "next"])
        XCTAssertEqual(tagsById[records[2].id], ["base"])

        let removed = try XCTUnwrap(h.model.editTags(add: false, tags: ["base"], ids: [records[0].id]))
        XCTAssertEqual(removed.updated, 1)
        XCTAssertEqual(h.model.fragments.first { $0.id == records[0].id }?.tags, ["mine", "next"])

        // What the extension delivered is untouched.
        XCTAssertEqual(try h.store.storedFragment(id: records[0].id)?.tags, ["base"])
    }

    func testBatchDeleteRemovesTheSelectionAndAnswersOldRequestsWith410() async throws {
        let records = try (0..<4).map { try makeRecord(content: "item \($0)", now: T0 - $0) }
        let h = try harness(records)
        let hub = try await h.startHub()

        let deleted = h.model.deleteLocal(ids: [records[0].id, records[1].id, records[3].id])
        XCTAssertEqual(deleted, 3)
        XCTAssertEqual(h.model.fragments.map(\.id), [records[2].id])
        let retry = try await hub.put(records[1])
        XCTAssertEqual(retry, 410, "the extension's old request must not resurrect it")
        XCTAssertEqual(h.model.fragments.count, 1)
    }

    func testSavedViewsFollowTheModelsFacts() throws {
        let h = try harness(try scenarioCRecords())
        h.model.startReviewSession()
        h.model.revealCard()
        h.model.rateCard(.again)
        h.model.revealCard()
        h.model.rateCard(.good)
        let counts = savedViewCounts(h.model.fragments, logs: h.model.reviewLogs, now: h.clock.now)
        XCTAssertEqual(counts[.needsWork], 1, "the card rated again")
        XCTAssertEqual(counts[.new], 2, "two are still unrated")
        XCTAssertEqual(counts[.due], 2, "the rated ones were scheduled for later")
    }
}

// ── windows and presence ─────────────────────────────────────────────────

@MainActor
final class PresenceTests: DesktopTestCase {
    override func setUp() {
        _ = NSApplication.shared
    }

    func testTheAppIsRegularOnlyWhileAWindowIsOpen() {
        XCTAssertEqual(AppPresence.policy(hasVisibleWindow: true), .regular)
        XCTAssertEqual(AppPresence.policy(hasVisibleWindow: false), .accessory)
    }

    func testOnlyTitledWindowsCountAsTheUsersWindows() {
        let titled = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled, .closable],
            backing: .buffered, defer: true)
        let bare = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.borderless], backing: .buffered,
            defer: true)
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled], backing: .buffered,
            defer: true)
        // Windows made in code are released on close by default — and by ARC again.
        for window in [titled, bare, panel] { window.isReleasedWhenClosed = false }
        // None is on screen: not a window the user can work in yet.
        XCTAssertFalse(AppPresence.isUserWindow(titled))
        titled.orderFrontRegardless()
        XCTAssertTrue(AppPresence.isUserWindow(titled), "a visible titled window counts")
        bare.orderFrontRegardless()
        panel.orderFrontRegardless()
        XCTAssertFalse(AppPresence.isUserWindow(bare), "the menu-bar status window is not titled")
        XCTAssertFalse(AppPresence.isUserWindow(panel), "nor is a panel")
        titled.close()
        bare.close()
        panel.close()
    }

    func testTheMainWindowIsCreatedOnDemandAndReused() throws {
        let h = try makeHarness()
        defer { h.stop() }
        let controller = MainWindowController.shared
        controller.show(model: h.model)
        let window = try XCTUnwrap(controller.window)
        XCTAssertTrue(controller.isVisible)
        XCTAssertEqual(window.title, "AnnHub")
        XCTAssertTrue(window.styleMask.contains(.resizable))
        XCTAssertTrue(window.contentMinSize.width >= 900)

        window.close()
        XCTAssertFalse(controller.isVisible, "closing hides the window; the hub is not tied to it")
        controller.show(model: h.model)
        XCTAssertTrue(controller.window === window, "the same window comes back")
        XCTAssertTrue(controller.isVisible)
        window.close()
    }
}
