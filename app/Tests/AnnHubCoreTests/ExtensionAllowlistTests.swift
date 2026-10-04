// Which extension ids the hub serves is configuration (ExtensionAllowlist.swift, Support/Info.plist),
// never a constant in code: how the lists are read, what is refused as not an id, and that the
// template the build fills still matches the key the app reads.

import XCTest

@testable import AnnHubCore

final class ExtensionAllowlistTests: XCTestCase {
    private let a = String(repeating: "a", count: 32)
    private let b = String(repeating: "b", count: 32)
    private let c = String(repeating: "c", count: 32)

    func testAnIdIsThirtyTwoLettersFromAToP() {
        for valid in [a, "abcdefghijklmnopabcdefghijklmnop"] {
            XCTAssertTrue(ExtensionAllowlist.isExtensionId(valid), valid)
        }
        for invalid in [
            "", String(a.dropLast()), a + "a", String(repeating: "A", count: 32), String(repeating: "q", count: 32),
            String(repeating: "1", count: 32), a.dropLast() + "-",
        ] {
            XCTAssertFalse(ExtensionAllowlist.isExtensionId(String(invalid)), String(invalid))
        }
    }

    func testListsAreSplitOnCommasAndWhiteSpace() {
        XCTAssertEqual(ExtensionAllowlist.parse("\(a),\(b)").ids, [a, b])
        XCTAssertEqual(ExtensionAllowlist.parse(" \(a) ,\n\(b)\t\(c) ").ids, [a, b, c])
        XCTAssertEqual(ExtensionAllowlist.parse("\(a),\(a)").ids, [a], "a repeated id is one entry")
    }

    func testAnOriginIsReadAsTheIdItCarries() {
        XCTAssertEqual(ExtensionAllowlist.parse("chrome-extension://\(a)").ids, [a])
        XCTAssertEqual(ExtensionAllowlist.parse("chrome-extension://\(a)/").ids, [a])
    }

    func testEntriesThatAreNotIdsAreRefusedAndReported() {
        let parsed = ExtensionAllowlist.parse(
            "\(a), short, https://evil.example, \(a.uppercased()), $(ANNHUB_EXTENSION_IDS)")
        XCTAssertEqual(parsed.ids, [a], "a typo must not widen the list")
        XCTAssertEqual(parsed.rejected, ["short", "https://evil.example", a.uppercased(), "$(ANNHUB_EXTENSION_IDS)"])
    }

    func testNothingConfiguredAdmitsNothing() {
        for empty in [nil, "", "  ", ",,"] {
            XCTAssertEqual(ExtensionAllowlist.parse(empty), ExtensionAllowlist.Parsed())
        }
        XCTAssertEqual(ExtensionAllowlist.admitted(info: nil, environment: [:], extra: []), ExtensionAllowlist.Parsed())
        XCTAssertEqual(ExtensionAllowlist.admitted(info: [:], environment: ["PATH": "/usr/bin"], extra: []).ids, [])
    }

    func testTheBuildTheEnvironmentAndTheLaunchArgumentsAreAdded() {
        let admitted = ExtensionAllowlist.admitted(
            info: [ExtensionAllowlist.infoPlistKey: a], environment: [ExtensionAllowlist.environmentKey: "\(b)"],
            extra: [c])
        XCTAssertEqual(admitted.ids, [a, b, c])
        XCTAssertEqual(admitted.rejected, [])
    }

    func testABuildSettingThatWasNeverExpandedAdmitsNothing() {
        let admitted = ExtensionAllowlist.admitted(
            info: [ExtensionAllowlist.infoPlistKey: "$(ANNHUB_EXTENSION_IDS)"], environment: [:], extra: [])
        XCTAssertEqual(admitted.ids, [])
        XCTAssertEqual(admitted.rejected, ["$(ANNHUB_EXTENSION_IDS)"])
    }

    // The template is read from the source tree: a rename on either side, or a typo in the default
    // (which every real user would meet as a refused delivery), fails here instead of in a release.
    func testTheInfoPlistTemplateFillsTheKeyTheAppReadsFromTheVariableTheDocsName() throws {
        let data = try Data(contentsOf: appSourceFile("Support/Info.plist"))
        let plist = try XCTUnwrap(try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        let value = try XCTUnwrap(plist[ExtensionAllowlist.infoPlistKey] as? String)
        XCTAssertTrue(value.hasPrefix("$(\(ExtensionAllowlist.environmentKey):default="), value)
        let fallback = String(value.dropFirst("$(\(ExtensionAllowlist.environmentKey):default=".count).dropLast())
        XCTAssertTrue(
            ExtensionAllowlist.isExtensionId(fallback), "the default id must be a real extension id: \(fallback)")

        let project = try String(contentsOf: appSourceFile("project.yml"), encoding: .utf8)
        XCTAssertTrue(project.contains("INFOPLIST_FILE: Support/Info.plist"), "the app target must use the template")
    }
}
