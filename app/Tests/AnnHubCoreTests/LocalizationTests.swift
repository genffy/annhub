// Interface wording (docs/v2 D-15): both languages are complete, say the same thing, and do not
// leak into each other. The TypeScript counterpart is utils/__tests__/ui-text.test.ts.

import XCTest
@testable import AnnHubCore

final class LocalizationTests: XCTestCase {
    func testChineseIdentifiersResolveToChineseAndEverythingElseToEnglish() {
        for identifier in ["zh", "zh-Hans", "zh-Hans-CN", "zh_TW", "ZH-hk"] {
            XCTAssertEqual(UILanguage.resolve(identifier), .zh, identifier)
        }
        for identifier in ["en", "en-US", "de-DE", "fr", "zhuang", ""] {
            XCTAssertEqual(UILanguage.resolve(identifier), .en, identifier)
        }
    }

    func testEveryTextIsFilledInBothLanguagesWithTheSamePlaceholders() {
        for key in UIText.allCases {
            let message = key.message
            XCTAssertFalse(message.zh.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) zh")
            XCTAssertFalse(message.en.trimmingCharacters(in: .whitespaces).isEmpty, "\(key) en")
            let names = UIMessage.placeholders(in: message.zh)
            XCTAssertEqual(UIMessage.placeholders(in: message.en), names, "placeholders of \(key)")
            if let one = message.enOne {
                XCTAssertEqual(UIMessage.placeholders(in: one), names, "singular placeholders of \(key)")
                XCTAssertTrue(names.contains("count"), "\(key) has a singular but no count")
            }
        }
    }

    func testTheLanguagesStayApart() {
        let han = #/\p{Script=Han}/#
        for key in UIText.allCases {
            let message = key.message
            for text in [message.en, message.enOne].compactMap({ $0 }) {
                XCTAssertNil(text.firstMatch(of: han), "\(key) leaks Chinese into English: \(text)")
            }
            // D-11: the Chinese UI says 碎片; "Fragment" is the English UI's word.
            let stripped = message.zh.replacingOccurrences(
                of: #"\{\w+\}"#, with: "", options: .regularExpression)
            XCTAssertFalse(stripped.lowercased().contains("fragment"), "\(key) zh: \(message.zh)")
        }
    }

    func testParametersAreFilledOnceAndUnknownPlaceholdersStayVisible() {
        XCTAssertEqual(t(.backToSource, ["host": "wsj.com"], lang: .zh), "回到来源：wsj.com")
        XCTAssertEqual(t(.backToSource, ["host": "wsj.com"], lang: .en), "Back to source: wsj.com")
        XCTAssertEqual(t(.backToSource, lang: .en), "Back to source: {host}")
        // A value that looks like a placeholder is not expanded a second time.
        XCTAssertEqual(
            t(.backToSource, ["host": "{host}"], lang: .en), "Back to source: {host}")
    }

    func testEnglishUsesTheSingularOnlyForOne() {
        XCTAssertEqual(t(.suggestedLine, ["count": 1, "minutes": 1], lang: .en), "1 review · about 1 min")
        XCTAssertEqual(t(.suggestedLine, ["count": 0, "minutes": 0], lang: .en), "0 reviews · about 0 min")
        XCTAssertEqual(t(.suggestedLine, ["count": 3, "minutes": 3], lang: .en), "3 reviews · about 3 min")
        XCTAssertEqual(t(.suggestedLine, ["count": 1, "minutes": 1], lang: .zh), "1 条 · 预计 1 分钟")
        XCTAssertEqual(t(.intervalDays, ["count": 1], lang: .en), "1 day")
        XCTAssertEqual(t(.intervalDays, ["count": 6], lang: .en), "6 days")
    }

    // What the user's language list becomes for an app that declares English and the two Chinese
    // scripts: the first language the app has, English for the rest — and both kinds of Chinese
    // read the one Chinese text, which is Simplified.
    func testTheSystemLanguageIsTheFirstOneTheAppDeclares() {
        let declared = ["en", "zh-Hans", "zh-Hant"]
        let cases: [([String], UILanguage)] = [
            (["zh-Hans-CN", "en-US"], .zh),
            (["zh-CN"], .zh),
            (["zh"], .zh),
            (["zh-Hant-TW"], .zh),
            (["zh-TW"], .zh),
            (["zh-HK", "en"], .zh),
            (["fr-FR", "zh-Hans-CN"], .zh),  // French is not declared, so the first language the app has wins
            (["en-US", "zh-Hans-CN"], .en),
            (["en-GB"], .en),
            (["ja-JP", "en-US"], .en),
            (["de-DE"], .en),  // nothing declared matches: English, the development region
            ([], .en),
        ]
        for (preferences, expected) in cases {
            XCTAssertEqual(UILanguage.system(declared: declared, preferences: preferences), expected, "\(preferences)")
        }
    }

    // The bundle must really declare what the resolution above assumes; otherwise macOS would hand the
    // app English whatever the user speaks and the system's controls would disagree with our text.
    func testTheAppDeclaresEnglishAndBothChineseScripts() throws {
        let data = try Data(contentsOf: appSourceFile("Support/Info.plist"))
        let plist = try XCTUnwrap(try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
        XCTAssertEqual(plist["CFBundleLocalizations"] as? [String], ["en", "zh-Hans", "zh-Hant"])
        // Every declared language is one the interface can speak.
        for identifier in try XCTUnwrap(plist["CFBundleLocalizations"] as? [String]) {
            XCTAssertTrue(UILanguage.allCases.contains(UILanguage.resolve(identifier)), identifier)
        }
    }

    func testTheSystemLanguageIsOnlyReadWhenNoLanguageIsPassed() {
        XCTAssertEqual(t(.startReview, lang: .zh), "开始复习")
        XCTAssertEqual(t(.startReview, lang: .en), "Start review")
        XCTAssertTrue([UILanguage.zh, .en].contains(UILanguage.current))
    }
}
