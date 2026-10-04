// Which browser extensions may call the hub (docs/v2/storage.md §8).
//
// The ids are configuration, not code. The build writes them into Info.plist (`AnnHubExtensionIds`)
// from the ANNHUB_EXTENSION_IDS build setting or environment variable; the default, the id of the
// published extension, is in Support/Info.plist. A process can add more when it starts, with the
// same environment variable or `--annhub-allow-extension=ID`: that is how tests and automation
// admit an unpacked build, whose id is not the published one. Nothing here removes an id, and a hub
// built with none admits no browser extension at all (clients without an `Origin` are unaffected).

import Foundation

public enum ExtensionAllowlist {
    /// The Info.plist key the build fills.
    public static let infoPlistKey = "AnnHubExtensionIds"
    /// Read at build time (the baseline baked into the app) and again at run time (added to it).
    public static let environmentKey = "ANNHUB_EXTENSION_IDS"

    public struct Parsed: Equatable, Sendable {
        public var ids: Set<String>
        /// Entries that are not extension ids, kept so the app can say what it ignored.
        public var rejected: [String]

        public init(ids: Set<String> = [], rejected: [String] = []) {
            self.ids = ids
            self.rejected = rejected
        }
    }

    /// Chrome extension ids are 32 letters from a to p.
    public static func isExtensionId(_ text: String) -> Bool {
        text.utf8.count == 32 && text.utf8.allSatisfy { (UInt8(ascii: "a")...UInt8(ascii: "p")).contains($0) }
    }

    /// Ids separated by commas or white space. `chrome-extension://<id>/`, the form an `Origin` has,
    /// is read as the id. Anything else is rejected rather than admitted: a typo must not widen
    /// the list, and a build setting that was never expanded (`$(ANNHUB_EXTENSION_IDS)`) must not
    /// become an entry.
    public static func parse(_ list: String?) -> Parsed {
        var parsed = Parsed()
        let separators = CharacterSet(charactersIn: ",").union(.whitespacesAndNewlines)
        for token in (list ?? "").components(separatedBy: separators) where !token.isEmpty {
            var id = token
            if id.hasPrefix("chrome-extension://") { id = String(id.dropFirst("chrome-extension://".count)) }
            if id.hasSuffix("/") { id.removeLast() }
            if isExtensionId(id) {
                parsed.ids.insert(id)
            } else {
                parsed.rejected.append(token)
            }
        }
        return parsed
    }

    /// Every id this process admits: the build's, those in the environment, and `extra` (the
    /// launch arguments).
    public static func admitted(
        info: [String: Any]? = Bundle.main.infoDictionary,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        extra: [String] = []
    ) -> Parsed {
        let sources = [info?[infoPlistKey] as? String, environment[environmentKey]] + extra.map { Optional($0) }
        var merged = Parsed()
        for source in sources {
            let parsed = parse(source)
            merged.ids.formUnion(parsed.ids)
            merged.rejected.append(contentsOf: parsed.rejected)
        }
        return merged
    }
}
