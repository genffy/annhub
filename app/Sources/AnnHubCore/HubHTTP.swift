// HTTP/1.1 request framing for the Desktop hub (docs/v2/storage.md §8).
//
// The socket layer in the Desktop app only moves bytes; everything that decides
// whether a request may be read at all lives here so it is unit-testable:
// header and body size caps, who may talk to the hub (Host and Origin), and the
// bearer token. All of that is decided from the header block, BEFORE a body of
// attacker-chosen size is buffered.

import Foundation

/// Parsed request line and headers (names lowercased) of a request whose body
/// has not been read yet.
public struct HubRequestHead: Equatable, Sendable {
    public var method: String
    /// Path plus optional query, exactly as sent.
    public var target: String
    public var headers: [String: String]
    /// Declared body length; nil when the request has no Content-Length.
    public var contentLength: Int?

    public init(method: String, target: String, headers: [String: String] = [:], contentLength: Int? = nil) {
        self.method = method
        self.target = target
        self.headers = Dictionary(uniqueKeysWithValues: headers.map { ($0.key.lowercased(), $0.value) })
        self.contentLength = contentLength
    }

    public var path: String {
        target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? target
    }
}

/// What the hub decided from the header block alone.
public enum HubPreflight: Equatable, Sendable {
    /// Read the body (at most `bodyLimit` bytes, as declared) and handle the request.
    case accept(bodyLimit: Int)
    /// Answer now and close; the body is never read.
    case reject(HubResponse)
}

extension HubResponse: Error {}

/// Result of feeding bytes to a `HubRequestFramer`.
public enum HubFrame: Equatable, Sendable {
    case needMore
    /// Answer with this and close the connection without reading more.
    case reject(HubResponse)
    case request(HubRequest)
}

/// Incremental parser for one connection (the hub answers one request per
/// connection and closes: `Connection: close`). Value type: create one per
/// connection.
public struct HubRequestFramer: Sendable {
    /// Request line plus headers. Real requests from the extension are well under 2 KB.
    public static let maxHeaderBytes = 16 * 1024
    /// Fragment, event and pairing bodies are JSON; an image body is capped separately.
    public static let maxJSONBodyBytes = 2 * 1024 * 1024
    /// Routes that take no body still tolerate a trivially small one.
    public static let maxSmallBodyBytes = 4 * 1024

    private let hub: DesktopHub
    private var buffer = Data()
    private var scanFrom = 0
    private var head: HubRequestHead?
    private var bodyStart = 0

    public init(hub: DesktopHub) {
        self.hub = hub
    }

    /// Bytes buffered so far (header block plus whatever of the body arrived).
    public var bufferedByteCount: Int { buffer.count }

    public mutating func feed(_ chunk: Data) -> HubFrame {
        buffer.append(chunk)

        if head == nil {
            // Only the bytes that could complete the terminator need scanning.
            let terminator = Data("\r\n\r\n".utf8)
            let searchStart = max(0, scanFrom - (terminator.count - 1))
            guard let found = buffer.range(of: terminator, in: (buffer.startIndex + searchStart)..<buffer.endIndex)
            else {
                scanFrom = buffer.count
                if buffer.count > Self.maxHeaderBytes {
                    return .reject(Self.error(431, "header too large"))
                }
                return .needMore
            }
            if found.lowerBound - buffer.startIndex > Self.maxHeaderBytes {
                return .reject(Self.error(431, "header too large"))
            }
            let headBytes = buffer[buffer.startIndex..<found.lowerBound]
            switch Self.parseHead(headBytes) {
            case .failure(let response):
                return .reject(response)
            case .success(let parsed):
                switch hub.preflight(parsed) {
                case .reject(let response):
                    return .reject(response)
                case .accept:
                    head = parsed
                    bodyStart = found.upperBound - buffer.startIndex
                }
            }
        }

        guard let head else { return .needMore }
        let declared = head.contentLength ?? 0
        guard buffer.count - bodyStart >= declared else { return .needMore }
        // Exactly the declared bytes; anything trailing is ignored (one request per connection).
        let body =
            declared == 0
            ? Data() : Data(buffer[(buffer.startIndex + bodyStart)..<(buffer.startIndex + bodyStart + declared)])
        return .request(Self.request(from: head, body: body))
    }

    // ── parsing ──────────────────────────────────────────────────────────

    static func parseHead(_ bytes: Data) -> Result<HubRequestHead, HubResponse> {
        guard let text = String(data: bytes, encoding: .utf8) else {
            return .failure(error(400, "malformed request"))
        }
        var lines = text.components(separatedBy: "\r\n")
        let requestLine = lines.removeFirst().split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        guard requestLine.count == 3, !requestLine[0].isEmpty, requestLine[0].allSatisfy({ $0.isLetter && $0.isASCII }),
            requestLine[1].hasPrefix("/"), requestLine[2].hasPrefix("HTTP/1.")
        else {
            return .failure(error(400, "malformed request"))
        }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":"), colon != line.startIndex else {
                return .failure(error(400, "malformed header"))
            }
            let name = line[line.startIndex..<colon].lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            // A repeated header with a different value is how requests get smuggled past a proxy.
            if let existing = headers[name], existing != value, name == "content-length" || name == "host" {
                return .failure(error(400, "conflicting \(name)"))
            }
            headers[name] = value
        }

        if headers["transfer-encoding"] != nil {
            return .failure(error(501, "chunked bodies are not supported"))
        }

        var contentLength: Int?
        if let text = headers["content-length"] {
            guard !text.isEmpty, text.count <= 12, text.allSatisfy({ $0.isASCII && $0.isNumber }),
                let length = Int(text)
            else {
                return .failure(error(400, "invalid content-length"))
            }
            contentLength = length
        }
        return .success(
            HubRequestHead(
                method: requestLine[0], target: requestLine[1], headers: headers, contentLength: contentLength))
    }

    static func request(from head: HubRequestHead, body: Data) -> HubRequest {
        var headers = head.headers
        var bearer: String?
        if let authorization = headers.removeValue(forKey: "authorization"),
            authorization.lowercased().hasPrefix("bearer ")
        {
            bearer = String(authorization.dropFirst(7))
        }
        return HubRequest(
            method: head.method, path: head.target, bearerToken: bearer, headers: headers,
            body: body.isEmpty ? nil : body)
    }

    static func error(_ status: Int, _ message: String) -> HubResponse {
        .json(status, ["error": message])
    }
}

extension DesktopHub {
    /// Every browser reaches the hub as `127.0.0.1`/`localhost`; any other Host is a DNS-rebinding page.
    static func isLoopbackHost(_ value: String?) -> Bool {
        guard var host = value?.lowercased(), !host.isEmpty else { return false }
        if host.hasPrefix("[") {
            guard let close = host.firstIndex(of: "]") else { return false }
            let port = host[host.index(after: close)...]
            guard port.isEmpty || (port.hasPrefix(":") && port.dropFirst().allSatisfy(\.isNumber)) else { return false }
            host = String(host[host.startIndex...close])
        } else if let colon = host.lastIndex(of: ":") {
            guard host[host.index(after: colon)...].allSatisfy(\.isNumber) else { return false }
            host = String(host[host.startIndex..<colon])
        }
        return host == "127.0.0.1" || host == "localhost" || host == "[::1]"
    }

    /// No `Origin` means a non-browser client. A browser always sends one: only the
    /// extension's own origin may use the hub, never a web page.
    func isAllowedOrigin(_ origin: String?) -> Bool {
        guard let origin else { return true }
        let scheme = "chrome-extension://"
        guard origin.hasPrefix(scheme) else { return false }
        let id = String(origin.dropFirst(scheme.count))
        guard !id.isEmpty, !id.contains("/") else { return false }
        return allowedExtensionIds.isEmpty || allowedExtensionIds.contains(id)
    }

    /// Decide from the header block alone whether the body may be read, in the order a
    /// cheap attacker should hit the cheapest check: who (Host, Origin), then the token,
    /// then how much.
    public func preflight(_ head: HubRequestHead) -> HubPreflight {
        let routeClass = HubRoute(method: head.method, path: head.path)

        func rejected(_ status: Int, _ message: String, countsAsConnection: Bool) -> HubPreflight {
            let response = HubRequestFramer.error(status, message)
            _ = stamp(
                HubRequest(method: head.method, path: head.path), response, countsAsConnection: countsAsConnection)
            return .reject(response)
        }

        guard Self.isLoopbackHost(head.headers["host"]) else {
            return rejected(403, "forbidden host", countsAsConnection: false)
        }
        guard isAllowedOrigin(head.headers["origin"]) else {
            return rejected(403, "forbidden origin", countsAsConnection: false)
        }
        if routeClass.needsAuthorization {
            let bearer = head.headers["authorization"].flatMap { value -> String? in
                value.lowercased().hasPrefix("bearer ") ? String(value.dropFirst(7)) : nil
            }
            guard isAuthorized(bearerToken: bearer) else {
                return rejected(401, "unauthorized", countsAsConnection: false)
            }
        }
        if routeClass.carriesBody && head.contentLength == nil {
            return rejected(400, "length required", countsAsConnection: true)
        }
        let limit = routeClass.bodyLimit
        if let declared = head.contentLength, declared > limit {
            return rejected(413, "payload too large", countsAsConnection: true)
        }
        return .accept(bodyLimit: limit)
    }
}

/// The hub's routes, for the pieces of policy that depend on which one is addressed.
enum HubRoute {
    case health, pair, fragmentPut, assetPut, events, changes, unknown

    init(method: String, path: String) {
        switch (method, path) {
        case ("GET", "/health"): self = .health
        case ("POST", "/v1/pair"): self = .pair
        case ("PUT", _) where path.hasPrefix("/v1/fragments/"): self = .fragmentPut
        case ("PUT", _) where path.hasPrefix("/v1/assets/"): self = .assetPut
        case ("POST", "/v1/events"): self = .events
        case ("GET", _) where path.hasPrefix("/v1/changes"): self = .changes
        default: self = .unknown
        }
    }

    /// `/v1/pair` checks the code itself and answers 401 with its own body.
    var needsAuthorization: Bool {
        switch self {
        case .fragmentPut, .assetPut, .events, .changes: return true
        case .health, .pair, .unknown: return false
        }
    }

    var carriesBody: Bool {
        switch self {
        case .fragmentPut, .assetPut, .events: return true
        case .health, .pair, .changes, .unknown: return false
        }
    }

    var bodyLimit: Int {
        switch self {
        case .assetPut: return MAX_IMAGE_BYTES
        case .fragmentPut, .events: return HubRequestFramer.maxJSONBodyBytes
        case .health, .pair, .changes, .unknown: return HubRequestFramer.maxSmallBodyBytes
        }
    }
}
