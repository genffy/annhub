// The Desktop's state and its local hub, over a REAL loopback socket: what happens in the app
// when the extension delivers, when the port is taken, when the pairing code changes.

import AnnHubCore
import XCTest

@MainActor
final class DesktopModelHubTests: XCTestCase {
    private var harnesses: [Harness] = []

    override func tearDown() async throws {
        for harness in harnesses { harness.stop() }
        harnesses = []
    }

    private func harness(
        _ fragments: [FragmentRecord] = [], config: DesktopLaunchConfig? = nil, storeError: String? = nil,
        clock: TestClock = TestClock()
    ) throws -> Harness {
        let made = try makeHarness(fragments: fragments, config: config, clock: clock, storeError: storeError)
        harnesses.append(made)
        return made
    }

    // ── first run ────────────────────────────────────────────────────────

    func testAFreshInstallLandsOnTheLibraryEmptyState() throws {
        let h = try harness()
        XCTAssertTrue(h.model.fragments.isEmpty)
        XCTAssertEqual(h.model.section, .library, "desktop.md §2: no data → 碎片库 的空状态")
        XCTAssertNil(h.model.selectedSection)
    }

    func testWithDataTheDefaultPageIsToday() throws {
        let h = try harness([try makeRecord()])
        XCTAssertEqual(h.model.section, .today)
    }

    // ── the heart of it: a delivery shows up with nobody touching the app ─

    func testADeliveredFragmentAppearsWithoutAnyUserAction() async throws {
        // The hub stamps a first delivery with the real time (a new fragment is due at once), so
        // this test reads the model against the real clock too.
        let h = try harness(clock: TestClock(Int(Date().timeIntervalSince1970 * 1000)))
        let hub = try await h.startHub()
        XCTAssertEqual(h.model.section, .library)
        let record = try makeRecord()

        let status1 = try await hub.put(record)
        XCTAssertEqual(status1, 201)

        let arrived = await waitUntil { h.model.fragments.count == 1 }
        XCTAssertTrue(arrived, "the model must reload by itself after a delivery")
        XCTAssertEqual(h.model.deliveredFragmentCount, 1)
        h.clock.advance(by: 1000)  // the hub stamped it a moment after this clock was read
        XCTAssertEqual(h.model.dailyPlan.due.count, 1, "a new fragment is due at once")
        XCTAssertEqual(h.model.latestFragments.map(\.id), [record.id])
        XCTAssertEqual(h.model.section, .today, "the empty state gives way to 今日 when the first fragment lands")
        XCTAssertNotNil(h.model.lastConnectionAt)
        XCTAssertEqual(h.model.recentDeliveries.map(\.status), [201])
    }

    func testARepeatedDeliveryIsIdempotentAndKeepsTheReview() async throws {
        let h = try harness()
        let hub = try await h.startHub()
        let record = try makeRecord()
        let status2 = try await hub.put(record)
        XCTAssertEqual(status2, 201)
        _ = await waitUntil { h.model.fragments.count == 1 }
        try h.store.rateFragment(id: record.id, rating: .good, usedHint: false, now: h.clock.now)
        h.model.reload()
        let reviewed = try XCTUnwrap(h.model.fragments.first).review

        let status3 = try await hub.put(record)
        XCTAssertEqual(status3, 200)
        _ = await waitUntil { h.model.recentDeliveries.count == 2 }
        XCTAssertEqual(h.model.fragments.count, 1, "no duplicate")
        XCTAssertEqual(h.model.fragments.first?.review, reviewed, "a re-delivery never resets the review state")
    }

    func testAnExistingPageChoiceIsNotOverriddenByIncomingData() async throws {
        let h = try harness()
        let hub = try await h.startHub()
        h.model.go(.system)
        let status4 = try await hub.put(try makeRecord())
        XCTAssertEqual(status4, 201)
        _ = await waitUntil { h.model.fragments.count == 1 }
        XCTAssertEqual(h.model.section, .system, "the user's choice stands")
    }

    func testABurstOfDeliveriesIsAppliedAndRefreshesAreCoalesced() async throws {
        let h = try harness()
        let hub = try await h.startHub()
        let records = try (0..<30).map { try makeRecord(content: "item \($0)", tags: []) }
        let before = h.model.revision

        await withTaskGroup(of: Int.self) { group in
            for record in records { group.addTask { (try? await hub.put(record)) ?? 0 } }
            var statuses: [Int] = []
            for await status in group { statuses.append(status) }
            XCTAssertEqual(statuses.filter { $0 == 201 }.count, 30, "\(statuses)")
        }
        let allIn = await waitUntil { h.model.fragments.count == 30 }
        XCTAssertTrue(allIn)
        XCTAssertEqual(h.model.deliveredFragmentCount, 30)
        XCTAssertLessThan(h.model.revision - before, 30, "30 requests must not cause 30 reloads")
    }

    // ── the listener's real state ────────────────────────────────────────

    func testTheHubStateIsTheSocketsNotAHope() async throws {
        let h = try harness()
        XCTAssertFalse(h.model.hubListening)
        XCTAssertEqual(h.model.hubState, "未启动")
        let hub = try await h.startHub()
        XCTAssertEqual(h.model.hubState, "127.0.0.1:\(hub.port)")
        XCTAssertEqual(h.model.hubPort, hub.port)
        XCTAssertFalse(h.model.hubFailed)

        h.model.stopHub()
        XCTAssertFalse(h.model.hubListening)
        XCTAssertEqual(h.model.hubState, "未启动")
    }

    func testAPortAlreadyInUseIsReportedAndARetryRecovers() async throws {
        let first = try harness()
        let occupied = try await first.startHub()

        let second = try harness(config: DesktopLaunchConfig(port: occupied.port, notificationsEnabled: false))
        second.model.startHub()
        let failed = await waitUntil { second.model.hubFailed }
        XCTAssertTrue(failed, "binding a taken port must surface; got \(second.model.hubState)")
        XCTAssertTrue(second.model.hubState.contains("\(occupied.port)"), second.model.hubState)
        XCTAssertTrue(second.model.hubState.contains("已被占用"), second.model.hubState)
        XCTAssertFalse(second.model.hubListening)
        XCTAssertTrue(second.model.attentionItems.contains { $0.contains("本地服务没有启动") }, "surfaced under 需要处理")

        // The other instance quits; 重试启动 now works.
        first.model.stopHub()
        try await Task.sleep(for: .milliseconds(150))
        second.model.restartHub()
        let recovered = await waitUntil { second.model.hubListening }
        XCTAssertTrue(recovered, second.model.hubState)
        XCTAssertFalse(second.model.hubFailed)
        XCTAssertTrue(second.model.attentionItems.isEmpty)
    }

    func testAStoreThatCouldNotBeOpenedKeepsTheHubDown() async throws {
        let h = try harness(storeError: "无法打开本地数据库：disk I/O error")
        h.model.startHub()
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertFalse(h.model.hubListening, "never take deliveries into a store that will not keep them")
        XCTAssertNil(h.model.hubPort)
        XCTAssertTrue(h.model.hubFailed)
        XCTAssertEqual(h.model.hubState, "无法打开本地数据库：disk I/O error")
        XCTAssertTrue(h.model.attentionItems.first?.contains("无法打开本地数据库") ?? false)
    }

    // ── pairing ──────────────────────────────────────────────────────────

    func testRotatingThePairCodeLocksOutTheOldOneOverTheWire() async throws {
        let h = try harness()
        let hub = try await h.startHub()
        let old = h.model.pairToken
        let status5 = try await hub.request("POST", "/v1/pair").status
        XCTAssertEqual(status5, 200)

        h.model.rotatePairToken()
        XCTAssertNotEqual(h.model.pairToken, old)
        let status6 = try await hub.request("POST", "/v1/pair", token: old).status
        XCTAssertEqual(status6, 401, "the old code stops working at once")
        let status7 = try await hub.put(try makeRecord(), token: old)
        XCTAssertEqual(status7, 401)
        let status8 = try await hub.request("POST", "/v1/pair", token: h.model.pairToken).status
        XCTAssertEqual(status8, 200)
        XCTAssertEqual(
            h.defaults.string(forKey: DesktopModel.pairTokenDefaultsKey), h.model.pairToken, "and it is remembered")
        XCTAssertTrue(h.model.fragments.isEmpty, "rotating never touches the data")
    }

    func testThePairCodeSurvivesARelaunch() throws {
        let h = try harness()
        let code = h.model.pairToken
        XCTAssertFalse(code.isEmpty)
        let again = h.relaunched()
        XCTAssertEqual(again.pairToken, code)
    }

    func testAWebPageCannotWriteEvenWithTheCode() async throws {
        let h = try harness()
        var hub = try await h.startHub()
        hub.origin = "https://evil.example"
        let status9 = try await hub.put(try makeRecord())
        XCTAssertEqual(status9, 403)
        try await Task.sleep(for: .milliseconds(150))
        XCTAssertTrue(h.model.fragments.isEmpty)
        XCTAssertEqual(h.model.recentDeliveries.map(\.status), [403], "listed as refused, never as received")
        XCTAssertNil(h.model.lastConnectionAt, "and it is not the extension connecting")
    }

    func testAnotherExtensionIsRefusedUnlessTheLaunchNamesIt() async throws {
        let other = String(repeating: "b", count: 32)
        let strict = try harness()
        var refused = try await strict.startHub()
        refused.origin = "chrome-extension://" + other
        let strictStatus = try await refused.put(try makeRecord())
        XCTAssertEqual(strictStatus, 403, "an unpacked build has its own id")

        let named = try harness(
            config: DesktopLaunchConfig(port: 0, extraExtensionIds: [other], notificationsEnabled: false))
        var client = try await named.startHub()
        client.origin = "chrome-extension://" + other
        let namedStatus = try await client.put(try makeRecord())
        XCTAssertEqual(namedStatus, 201, "--annhub-allow-extension admits the build under test")
        client.origin = "chrome-extension://" + (DesktopHub.publishedExtensionIds.first ?? "")
        let publishedStatus = try await client.put(try makeRecord(content: "Second"))
        XCTAssertEqual(publishedStatus, 201, "and the published extension is still served")
    }

    // ── automation hooks ─────────────────────────────────────────────────

    func testTheReadyFileTellsAHarnessWhereTheHubIsAndFollowsRotation() async throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "annhub-ready-\(UUID().uuidString).json")
        let config = DesktopLaunchConfig(port: 0, readyFile: file, notificationsEnabled: false)
        let h = try harness(config: config)
        let hub = try await h.startHub()

        func read() throws -> DesktopReadyInfo {
            try JSONDecoder().decode(DesktopReadyInfo.self, from: Data(contentsOf: file))
        }
        var info = try read()
        XCTAssertEqual(info.port, Int(hub.port))
        XCTAssertEqual(info.pairToken, h.model.pairToken)
        XCTAssertEqual(info.pid, ProcessInfo.processInfo.processIdentifier)

        h.model.rotatePairToken()
        info = try read()
        XCTAssertEqual(info.pairToken, h.model.pairToken, "a harness must always read the current code")
        try? FileManager.default.removeItem(at: file)
    }

    func testTheModelNeverReachesTheUsersFilesUnderTest() throws {
        // `live()` is what the app uses. Under XCTest it must not open Application Support.
        let model = DesktopModel.live(config: DesktopLaunchConfig())
        XCTAssertTrue(model.fragments.isEmpty, "an empty in-memory store, not the user's library")
        XCTAssertEqual(model.config.port, 0)
        XCTAssertFalse(model.config.notificationsEnabled)
        XCTAssertNil(model.storeError)
        // One id per install, not one per launch.
        XCTAssertEqual(DesktopModel.live().store.deviceId, model.store.deviceId)
    }
}
