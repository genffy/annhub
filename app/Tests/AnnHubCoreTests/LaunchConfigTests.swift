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
            "--annhub-allow-extension=devbuildid",
            "--annhub-no-notifications",
        ])
        XCTAssertEqual(config.dataDirectory?.path, "/tmp/annhub-run/data")
        XCTAssertEqual(config.port, 0)
        XCTAssertEqual(config.defaultsSuite, "annhub.e2e")
        XCTAssertEqual(config.readyFile?.path, "/tmp/annhub-run/ready.json")
        XCTAssertEqual(config.screenshotPath, "/tmp/annhub-run/window.png")
        XCTAssertFalse(config.openWindowAtLaunch)
        XCTAssertEqual(config.extraExtensionIds, ["devbuildid"])
        XCTAssertFalse(config.notificationsEnabled)
    }

    // The extension the build is configured for is served; an unpacked build under test has
    // another id and is not, unless the harness names it (storage.md §8). Several ids may be named.
    func testExtraExtensionIdsAreCollectedAndEmptyOnesIgnored() {
        XCTAssertEqual(DesktopLaunchConfig.parse(["AnnHubDesktop"]).extraExtensionIds, [])
        let config = DesktopLaunchConfig.parse([
            "--annhub-allow-extension=idone", "--annhub-allow-extension=", "--annhub-allow-extension=idtwo",
        ])
        XCTAssertEqual(config.extraExtensionIds, ["idone", "idtwo"])
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

    // The demo data an old build could write into the real store is gone for good: no flag seeds
    // a store any more, so an unknown legacy flag is simply ignored.
    func testTheRemovedDemoSeedFlagDoesNothing() {
        XCTAssertEqual(DesktopLaunchConfig.parse(["--annhub-demo-seed"]), DesktopLaunchConfig())
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
