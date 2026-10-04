// Interface language of the Desktop app (docs/v2 D-15): Chinese or English, chosen by the system
// language, with no switch of its own. The wording lives in `UIText`; this file resolves the
// language and fills in parameters.

import Foundation

public enum UILanguage: String, CaseIterable, Sendable {
    case zh
    case en

    /// `zh`, `zh-Hans-CN` and `zh_TW` are Chinese; every other identifier is English.
    public static func resolve(_ identifier: String) -> UILanguage {
        let lowered = identifier.lowercased()
        return lowered == "zh" || lowered.hasPrefix("zh-") || lowered.hasPrefix("zh_") ? .zh : .en
    }

    /// The first system language. `ANNHUB_UI_LANGUAGE` overrides it for tests and screenshots.
    public static var current: UILanguage {
        if let forced = ProcessInfo.processInfo.environment["ANNHUB_UI_LANGUAGE"], !forced.isEmpty {
            return resolve(forced)
        }
        return resolve(Locale.preferredLanguages.first ?? "en")
    }
}

public struct UIMessage: Sendable {
    public let zh: String
    public let en: String
    /// English singular, chosen when the `count` parameter is 1; Chinese does not inflect.
    public let enOne: String?

    public init(zh: String, en: String, enOne: String? = nil) {
        self.zh = zh
        self.en = en
        self.enOne = enOne
    }

    /// The template for a language and count, before parameters are filled in.
    public func template(_ lang: UILanguage, count: Int?) -> String {
        switch lang {
        case .zh: return zh
        case .en: return count == 1 ? (enOne ?? en) : en
        }
    }

    public func render(_ params: [String: Any], lang: UILanguage) -> String {
        Self.fill(template(lang, count: params["count"] as? Int), params)
    }

    /// Placeholders (`{name}`) found in a template, for the tests that compare languages.
    public static func placeholders(in template: String) -> [String] {
        var names: [String] = []
        var current: String?
        for character in template {
            if character == "{" {
                current = ""
            } else if character == "}", let name = current {
                names.append(name)
                current = nil
            } else if current != nil {
                current?.append(character)
            }
        }
        return names.sorted()
    }

    /// One pass over the template, so a value that itself contains `{x}` is never expanded again.
    static func fill(_ template: String, _ params: [String: Any]) -> String {
        var result = ""
        var name: String?
        for character in template {
            if character == "{", name == nil {
                name = ""
            } else if character == "}", let key = name {
                if let value = params[key] {
                    result += "\(value)"
                } else {
                    result += "{\(key)}"
                }
                name = nil
            } else if name != nil {
                name?.append(character)
            } else {
                result.append(character)
            }
        }
        if let open = name { result += "{\(open)" }
        return result
    }
}

/// The text for a key, in the system language unless one is passed.
public func t(_ key: UIText, _ params: [String: Any] = [:], lang: UILanguage = .current) -> String {
    key.message.render(params, lang: lang)
}
