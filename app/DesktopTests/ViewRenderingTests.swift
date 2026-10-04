// The SwiftUI views, rendered for real in a hosting view (no app launch, no window on screen):
// every kind's detail, the review card in each of its states, the library, the system page and
// the palette. A render that comes out blank is a view that failed to build its content.
//
// Set TEST_RUNNER_ANNHUB_TEST_ARTIFACTS=/some/dir when running xcodebuild to keep the PNGs.

import AnnHubCore
import AppKit
import SwiftUI
import XCTest

@MainActor
final class ViewRenderingTests: DesktopTestCase {
    private var harnesses: [Harness] = []
    private let artifacts: URL? = ProcessInfo.processInfo.environment["ANNHUB_TEST_ARTIFACTS"].map {
        URL(fileURLWithPath: $0)
    }

    override func setUp() {
        _ = NSApplication.shared
        if let artifacts { try? FileManager.default.createDirectory(at: artifacts, withIntermediateDirectories: true) }
    }

    override func tearDown() async throws {
        for harness in harnesses { harness.stop() }
        harnesses = []
    }

    private func harness(_ fragments: [FragmentRecord], config: DesktopLaunchConfig? = nil) throws -> Harness {
        let made = try makeHarness(fragments: fragments, config: config)
        harnesses.append(made)
        return made
    }

    /// Renders `view` in an `NSHostingView`; returns how many distinct colours it drew, which is
    /// what tells a real page from a blank one. Optionally saves the PNG.
    @discardableResult
    private func render<V: View>(
        _ view: V, named name: String, size: CGSize = CGSize(width: 900, height: 720), file: StaticString = #filePath,
        line: UInt = #line
    ) throws -> Int {
        let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height).background(Color.white))
        host.frame = NSRect(origin: .zero, size: size)
        let window = NSWindow(
            contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: true)
        window.isReleasedWhenClosed = false
        window.contentView = host
        host.layoutSubtreeIfNeeded()
        // Let SwiftUI run its first pass (onAppear, state updates).
        RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        host.layoutSubtreeIfNeeded()
        let rep = try XCTUnwrap(host.bitmapImageRepForCachingDisplay(in: host.bounds), file: file, line: line)
        host.cacheDisplay(in: host.bounds, to: rep)
        if let artifacts, let png = rep.representation(using: .png, properties: [:]) {
            try png.write(to: artifacts.appending(path: "\(name).png"))
        }
        var colors = Set<UInt32>()
        let step = 6
        for y in stride(from: 0, to: rep.pixelsHigh, by: step) {
            for x in stride(from: 0, to: rep.pixelsWide, by: step) {
                if let color = rep.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) {
                    colors.insert(
                        UInt32(color.redComponent * 255) << 16 | UInt32(color.greenComponent * 255) << 8
                            | UInt32(color.blueComponent * 255))
                }
            }
        }
        return colors.count
    }

    private func assertDrawn(_ colors: Int, _ name: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertGreaterThan(colors, 4, "\(name) rendered blank (\(colors) colours)", file: file, line: line)
    }

    // ── detail, one per kind ─────────────────────────────────────────────

    func testEveryKindsDetailRenders() throws {
        let kinds = ["concept", "claim", "procedure", "decision", "question", "inspiration"]
        let records = try kinds.map { try makeRecord(kind: $0, content: "A \($0) fragment", guess: "my guess") }
        let h = try harness(records)
        for record in records {
            let colors = try render(
                FragmentDetailView(fragment: record).environmentObject(h.model), named: "detail-\(record.kind)",
                size: CGSize(width: 420, height: 760))
            assertDrawn(colors, "detail of \(record.kind)")
        }
    }

    // ── the review card in each state ────────────────────────────────────

    func testTheReviewCardRendersAtEveryStageOfTheLadder() throws {
        let h = try harness(try scenarioCRecords())
        h.model.startReviewSession()
        let size = CGSize(width: 700, height: 600)
        func card(_ name: String) throws {
            assertDrawn(
                try render(ReviewSessionView().environmentObject(h.model), named: name, size: size), name)
        }
        try card("review-1-question")
        h.model.openNextHint()
        try card("review-2-hint-1")
        h.model.openNextHint()
        h.model.openNextHint()
        try card("review-3-hint-3")
        h.model.openNextHint()
        try card("review-4-hint-4")
        h.model.revealCard()
        try card("review-5-revealed")
        XCTAssertTrue(h.model.rateCard(.good))
        try card("review-6-next-card")
    }

    func testTheWrapUpRendersWhenTheSessionEnds() throws {
        let h = try harness([try makeRecord()])
        h.model.startReviewSession()
        h.model.openNextHint()
        h.model.revealCard()
        XCTAssertTrue(h.model.rateCard(.again))
        XCTAssertNotNil(h.model.wrapUp)
        assertDrawn(
            try render(
                ReviewSessionView().environmentObject(h.model), named: "review-7-wrap-up",
                size: CGSize(width: 700, height: 500)),
            "wrap-up")
    }

    // ── pages ────────────────────────────────────────────────────────────

    func testTheThreePagesRender() throws {
        let h = try harness(try scenarioCRecords())
        h.model.startReviewSession()
        assertDrawn(
            try render(TodayView(onOpenLibrary: {}).environmentObject(h.model), named: "page-today"), "today")
        assertDrawn(
            try render(
                LibraryView(onOpenSystem: {}).environmentObject(h.model), named: "page-library",
                size: CGSize(width: 1100, height: 720)),
            "library")
        assertDrawn(try render(SystemView().environmentObject(h.model), named: "page-system"), "system")
    }

    func testThePagesAndTheReviewCardRenderInEnglishToo() throws {
        let h = try harness(try scenarioCRecords())
        try speaking("en") {
            h.model.startReviewSession()
            h.model.openNextHint()
            assertDrawn(try render(TodayView(onOpenLibrary: {}).environmentObject(h.model), named: "en-today"), "today")
            assertDrawn(
                try render(
                    LibraryView(onOpenSystem: {}).environmentObject(h.model), named: "en-library",
                    size: CGSize(width: 1100, height: 720)),
                "library")
            assertDrawn(try render(SystemView().environmentObject(h.model), named: "en-system"), "system")
            assertDrawn(
                try render(
                    ReviewSessionView().environmentObject(h.model), named: "en-review",
                    size: CGSize(width: 700, height: 600)),
                "review card")
            assertDrawn(
                try render(
                    TagEditSheet(add: true, count: 1, presentTags: [], libraryTags: ["retry"]) { _ in },
                    named: "en-tag-sheet", size: CGSize(width: 460, height: 320)),
                "tag sheet")
        }
    }

    func testTheLibraryEmptyStateRenders() throws {
        let h = try harness([])
        assertDrawn(
            try render(LibraryView(onOpenSystem: {}).environmentObject(h.model), named: "page-library-empty"),
            "empty library")
    }

    func testTheSystemPageShowsAFailedHubWithARetry() async throws {
        let first = try harness([])
        _ = try await first.startHub()
        let second = try harness(
            [], config: DesktopLaunchConfig(port: try XCTUnwrap(first.model.hubPort), notificationsEnabled: false))
        second.model.startHub()
        let failed = await waitUntil { second.model.hubFailed }
        XCTAssertTrue(failed)
        assertDrawn(
            try render(SystemView().environmentObject(second.model), named: "page-system-port-in-use"), "failed hub")
    }

    func testThePreferencesWindowRenders() throws {
        let h = try harness([])
        assertDrawn(
            try render(
                PreferencesView().environmentObject(h.model), named: "preferences",
                size: CGSize(width: 520, height: 260)),
            "preferences")
    }

    // ── palette and batch sheet ──────────────────────────────────────────

    func testThePaletteRendersWithResultsAndWithout() throws {
        let records = [
            try makeRecord(content: "重试风暴", use: "检查客户端重试是否放大了流量"),
            try makeRecord(content: "退避加抖动", use: "重试前先确认幂等键"),
        ]
        let withHits = try harness(
            records, config: DesktopLaunchConfig(port: 0, initialPaletteQuery: "重试", notificationsEnabled: false))
        assertDrawn(
            try render(
                CommandPaletteOverlay().environmentObject(withHits.model), named: "palette-results",
                size: CGSize(width: 800, height: 600)),
            "palette with hits")
        let nothing = try harness(
            records, config: DesktopLaunchConfig(port: 0, initialPaletteQuery: "没有这个词", notificationsEnabled: false))
        assertDrawn(
            try render(
                CommandPaletteOverlay().environmentObject(nothing.model), named: "palette-empty",
                size: CGSize(width: 800, height: 600)),
            "palette without hits")
    }

    func testTheTagSheetRenders() throws {
        assertDrawn(
            try render(
                TagEditSheet(
                    add: true, count: 3, presentTags: ["a", "b"], libraryTags: ["retry", "reliability", "api"]
                ) { _ in },
                named: "tag-sheet-add", size: CGSize(width: 460, height: 320)),
            "add tags")
        assertDrawn(
            try render(
                TagEditSheet(add: false, count: 2, presentTags: ["retry", "api"], libraryTags: []) { _ in },
                named: "tag-sheet-remove", size: CGSize(width: 460, height: 300)),
            "remove tags")
    }
}
