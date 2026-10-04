// Launch knobs: the way automation points a Desktop at its own data, port and
// preferences so a run never touches the user's real store.

import XCTest

@testable import AnnHubCore

final class LaunchConfigTests: XCTestCase {
    func testAPlainLaunchUsesTheDefaults() {
        let config = DesktopLaunchConfig.parse(["/Applications/AnnHub.app/Contents/MacOS/AnnHubDesktop"])
        XCTAssertEqual(config, DesktopLaunchConfig())
        XCTAssertEqual(config.port, 8765)
        XCTAssertNil(config.dataDirectory)
        XCTAssertNil(config.defaultsSuite)
        XCTAssertTrue(config.notificationsEnabled)
        XCTAssertTrue(config.openWindowAtLaunch, "a normal launch shows the main window")
    }

    func testEveryKnobIsParsed() {
        let config = DesktopLaunchConfig.parse([
            "AnnHubDesktop",
            "--annhub-data-dir=/tmp/annhub-run/data",
            "--annhub-port=0",
            "--annhub-defaults-suite=annhub.e2e",
            "--annhub-ready-file=/tmp/annhub-run/ready.json",
            "--annhub-no-window",
            "--annhub-shot=/tmp/annhub-run/window.png",
            "--annhub-demo-seed",
            "--annhub-no-notifications",
        ])
        XCTAssertEqual(config.dataDirectory?.path, "/tmp/annhub-run/data")
        XCTAssertEqual(config.port, 0)
        XCTAssertEqual(config.defaultsSuite, "annhub.e2e")
        XCTAssertEqual(config.readyFile?.path, "/tmp/annhub-run/ready.json")
        XCTAssertEqual(config.screenshotPath, "/tmp/annhub-run/window.png")
        XCTAssertFalse(config.openWindowAtLaunch)
        XCTAssertTrue(config.demoSeed)
        XCTAssertFalse(config.notificationsEnabled)
    }

    func testMalformedValuesFallBackInsteadOfCrashing() {
        let config = DesktopLaunchConfig.parse([
            "--annhub-port=not-a-number", "--annhub-port=70000", "--annhub-data-dir=", "--annhub-defaults-suite=",
            "--unknown-flag", "--annhub-port",
        ])
        XCTAssertEqual(config.port, DesktopLaunchConfig.defaultPort)
        XCTAssertNil(config.dataDirectory)
        XCTAssertNil(config.defaultsSuite)
    }

    func testTheLastValueWins() {
        XCTAssertEqual(DesktopLaunchConfig.parse(["--annhub-port=1111", "--annhub-port=2222"]).port, 2222)
    }

    func testTildeInThePathIsExpanded() {
        let config = DesktopLaunchConfig.parse(["--annhub-data-dir=~/annhub-test"])
        XCTAssertEqual(config.dataDirectory?.path, NSHomeDirectory() + "/annhub-test")
    }

    // The accident this guards against: --annhub-demo-seed on its own fills the
    // user's real (empty) store with demo fragments.
    func testDemoSeedNeedsAnExplicitDataDirectory() {
        XCTAssertFalse(DesktopLaunchConfig.parse(["--annhub-demo-seed"]).demoSeedAllowed)
        XCTAssertFalse(
            DesktopLaunchConfig.parse(["--annhub-demo-seed", "--annhub-defaults-suite=x"]).demoSeedAllowed,
            "an isolated preferences domain does not isolate the store")
        XCTAssertTrue(
            DesktopLaunchConfig.parse(["--annhub-demo-seed", "--annhub-data-dir=/tmp/x"]).demoSeedAllowed)
        XCTAssertFalse(DesktopLaunchConfig.parse(["--annhub-data-dir=/tmp/x"]).demoSeedAllowed, "not requested")
    }

    func testTheDataDirectoryDefaultsToTheAppsFolderInApplicationSupport() {
        let support = URL(fileURLWithPath: "/Users/someone/Library/Application Support")
        XCTAssertEqual(
            DesktopLaunchConfig().resolvedDataDirectory(applicationSupport: support).path,
            "/Users/someone/Library/Application Support/AnnHub")
        XCTAssertEqual(
            DesktopLaunchConfig(dataDirectory: URL(fileURLWithPath: "/tmp/mine")).resolvedDataDirectory(
                applicationSupport: support
            ).path,
            "/tmp/mine")
    }

    func testASuiteGivesAnIndependentPreferencesDomain() {
        let name = "annhub.test.\(UUID().uuidString)"
        let defaults = DesktopLaunchConfig(defaultsSuite: name).makeDefaults()
        defer { defaults.removePersistentDomain(forName: name) }
        defaults.set("isolated", forKey: "annhub.test.key")
        XCTAssertEqual(defaults.string(forKey: "annhub.test.key"), "isolated")
        XCTAssertNil(UserDefaults.standard.string(forKey: "annhub.test.key"))
    }

    func testTheReadyInfoRoundTripsForHarnesses() throws {
        let info = DesktopReadyInfo(pid: 4242, port: 51234, pairToken: "ABCD-EFGH-JKMN-PQRS", dataDirectory: "/tmp/x")
        let decoded = try JSONDecoder().decode(DesktopReadyInfo.self, from: JSONEncoder().encode(info))
        XCTAssertEqual(decoded, info)
    }
}
