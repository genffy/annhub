// The Desktop hub's HTTP transport: a thin Network.framework shim in front of
// DesktopHub. Every protocol rule lives in DesktopHub (unit-testable without
// sockets); this file only frames HTTP/1.1 on a loopback socket and enforces the
// limits a local server needs — header/body size caps and an idle timeout.
//
// It listens on 127.0.0.1 only (storage.md §8) and closes every connection after
// one response (`Connection: close`).

import Foundation
import Network

// ── HTTP framing (pure, no sockets) ──────────────────────────────────────

/// A parsed request line and header block. Header names are lowercased.
struct HTTPHead: Equatable {
    var method: String
    var path: String
    var headers: [String: String]
    var contentLength: Int?

    var carriesBody: Bool {
        method == "PUT" || method == "POST"
    }

    var bearerToken: String? {
        guard let authorization = headers["authorization"],
            authorization.lowercased().hasPrefix("bearer ")
        else { return nil }
        return String(authorization.dropFirst("bearer ".count)).trimmingCharacters(in: .whitespaces)
    }
}

enum HTTPHeadResult: Equatable {
    case incomplete
    case head(HTTPHead, bodyStart: Int)
    case malformed
    case headersTooLarge
}

enum HTTPFraming {
    private static let terminator = Data("\r\n\r\n".utf8)

    /// Looks for a complete header block at the start of `buffer`. Only the first
    /// `maxHeaderBytes` are searched, so a client that never sends a blank line
    /// cannot make the server buffer without bound.
    static func parseHead(_ buffer: Data, maxHeaderBytes: Int) -> HTTPHeadResult {
        let window = buffer.prefix(maxHeaderBytes + terminator.count)
        guard let end = window.range(of: terminator) else {
            return buffer.count > maxHeaderBytes ? .headersTooLarge : .incomplete
        }
        guard let text = String(data: buffer[buffer.startIndex..<end.lowerBound], encoding: .utf8) else {
            return .malformed
        }
        let lines = text.components(separatedBy: "\r\n")
        let requestLine = (lines.first ?? "").split(separator: " ", omittingEmptySubsequences: true)
        guard requestLine.count == 3, requestLine[2].hasPrefix("HTTP/1."),
            requestLine[0].allSatisfy({ $0.isASCII && $0.isUppercase }),
            requestLine[1].hasPrefix("/")
        else { return .malformed }

        var headers: [String: String] = [:]
        var contentLength: Int?
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { return .malformed }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { return .malformed }
            if name == "content-length" {
                // Digits only; two different lengths are a framing ambiguity.
                guard !value.isEmpty, value.allSatisfy(\.isASCIIDigit), let length = Int(value) else {
                    return .malformed
                }
                if let existing = contentLength, existing != length { return .malformed }
                contentLength = length
            }
            headers[name] = value
        }
        let head = HTTPHead(
            method: String(requestLine[0]), path: String(requestLine[1]),
            headers: headers, contentLength: contentLength
        )
        return .head(head, bodyStart: buffer.distance(from: buffer.startIndex, to: end.upperBound))
    }

    static func reasonPhrase(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 201: return "Created"
        case 400: return "Bad Request"
        case 401: return "Unauthorized"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        case 409: return "Conflict"
        case 410: return "Gone"
        case 411: return "Length Required"
        case 413: return "Payload Too Large"
        case 422: return "Unprocessable Entity"
        case 431: return "Request Header Fields Too Large"
        case 500: return "Internal Server Error"
        default: return "Status \(status)"
        }
    }

    static func serialize(_ response: HubResponse) -> Data {
        var head = "HTTP/1.1 \(response.status) \(reasonPhrase(response.status))\r\n"
        head += "Content-Type: \(response.contentType)\r\n"
        head += "Content-Length: \(response.body.count)\r\n"
        head += "Cache-Control: no-store\r\n"
        head += "X-Content-Type-Options: nosniff\r\n"
        head += "Connection: close\r\n\r\n"
        var payload = Data(head.utf8)
        payload.append(response.body)
        return payload
    }
}

extension Character {
    fileprivate var isASCIIDigit: Bool { isASCII && isNumber }
}

// ── the server ───────────────────────────────────────────────────────────

public final class HubServer: @unchecked Sendable {
    public enum State: Equatable, Sendable {
        case idle
        case starting
        case ready(port: UInt16)
        case failed(String)

        public var isReady: Bool {
            if case .ready = self { return true }
            return false
        }
    }

    public struct Limits: Equatable, Sendable {
        public var maxHeaderBytes: Int
        /// Larger than the biggest legitimate body (an image at MAX_IMAGE_BYTES) so
        /// the hub's own 413 still answers an image that is merely over the limit.
        public var maxBodyBytes: Int
        public var idleTimeout: TimeInterval

        public init(
            maxHeaderBytes: Int = 16 * 1024,
            maxBodyBytes: Int = MAX_IMAGE_BYTES + 64 * 1024,
            idleTimeout: TimeInterval = 30
        ) {
            self.maxHeaderBytes = maxHeaderBytes
            self.maxBodyBytes = maxBodyBytes
            self.idleTimeout = idleTimeout
        }
    }

    private let hub: DesktopHub
    private let requestedPort: UInt16
    private let limits: Limits
    private let queue = DispatchQueue(label: "annhub.hub", attributes: .concurrent)
    private let lock = NSLock()
    private var listener: NWListener?
    private var currentState: State = .idle
    private var connections: [ObjectIdentifier: HubConnection] = [:]

    /// Called on a hub queue whenever the listener's state changes. Set before `start()`.
    public var onStateChange: (@Sendable (State) -> Void)?
    /// Called on a hub queue after every request has been answered. Keep it cheap.
    public var onRequestHandled: (@Sendable (HubRequest, HubResponse) -> Void)?

    /// `port` 0 asks the system for a free one; read the real port from `.ready`.
    public init(hub: DesktopHub, port: UInt16 = DesktopLaunchConfig.defaultPort, limits: Limits = Limits()) {
        self.hub = hub
        self.requestedPort = port
        self.limits = limits
    }

    deinit {
        listener?.cancel()
        connections.values.forEach { $0.close() }
    }

    public var state: State {
        lock.lock()
        defer { lock.unlock() }
        return currentState
    }

    /// The bound port once the listener is ready.
    public var port: UInt16? {
        if case .ready(let port) = state { return port }
        return nil
    }

    public func start() {
        lock.lock()
        guard listener == nil else {
            lock.unlock()
            return
        }
        lock.unlock()

        let parameters = NWParameters.tcp
        // Loopback only — the hub never listens on another interface (storage.md §8).
        // The port rides in the endpoint: NWListener(using:on:) combined with a
        // required local endpoint fails on current macOS releases.
        parameters.requiredLocalEndpoint = NWEndpoint.hostPort(
            host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: requestedPort) ?? .any
        )
        let listener: NWListener
        do {
            listener = try NWListener(using: parameters)
        } catch {
            transition(to: .failed(Self.describe(error, port: requestedPort)))
            return
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.stateUpdateHandler = { [weak self, weak listener] state in
            guard let self, let listener else { return }
            switch state {
            case .ready:
                self.transition(to: .ready(port: listener.port?.rawValue ?? self.requestedPort))
            case .failed(let error):
                // Keep the failure visible: cancelling the dead listener below fires
                // `.cancelled`, which must not turn the failure back into `.idle`.
                self.discard(listener)
                self.transition(to: .failed(Self.describe(error, port: self.requestedPort)))
                listener.cancel()
            case .waiting(let error):
                // A listener that cannot bind parks in `waiting` on some paths; the
                // port will not free itself, so report it. It may still recover.
                self.transition(to: .failed(Self.describe(error, port: self.requestedPort)))
            case .cancelled:
                self.discard(listener)
                if case .failed = self.state { return }
                self.transition(to: .idle)
            default:
                break
            }
        }
        lock.lock()
        self.listener = listener
        lock.unlock()
        transition(to: .starting)
        listener.start(queue: queue)
    }

    /// Forgets a listener that has ended so `start()` can bind again.
    private func discard(_ ended: NWListener) {
        lock.lock()
        if listener === ended { listener = nil }
        lock.unlock()
    }

    public func stop() {
        lock.lock()
        let listener = self.listener
        self.listener = nil
        let open = Array(connections.values)
        connections.removeAll()
        lock.unlock()
        listener?.cancel()
        open.forEach { $0.close() }
        transition(to: .idle)
    }

    private func transition(to state: State) {
        lock.lock()
        let changed = currentState != state
        currentState = state
        lock.unlock()
        if changed { onStateChange?(state) }
    }

    private func accept(_ connection: NWConnection) {
        let handler = HubConnection(connection: connection, server: self)
        lock.lock()
        connections[ObjectIdentifier(handler)] = handler
        lock.unlock()
        handler.start()
    }

    fileprivate func release(_ handler: HubConnection) {
        lock.lock()
        connections.removeValue(forKey: ObjectIdentifier(handler))
        lock.unlock()
    }

    fileprivate func answer(_ request: HubRequest) -> HubResponse {
        let response = hub.handle(request)
        onRequestHandled?(request, response)
        return response
    }

    fileprivate var connectionLimits: Limits { limits }
    fileprivate var connectionQueue: DispatchQueue { queue }

    static func describe(_ error: Error, port: UInt16) -> String {
        if let error = error as? NWError, case .posix(let code) = error, code == .EADDRINUSE {
            return "端口 \(port) 已被占用（另一个 AnnHub 或其他程序在使用）"
        }
        return error.localizedDescription
    }
}

/// One accepted connection: reads a request, answers it once, closes.
private final class HubConnection: @unchecked Sendable {
    private let connection: NWConnection
    private weak var server: HubServer?
    private let queue: DispatchQueue
    private let limits: HubServer.Limits
    private var buffer = Data()
    private var head: HTTPHead?
    private var bodyStart = 0
    private var idleTimer: DispatchWorkItem?
    private var finished = false

    init(connection: NWConnection, server: HubServer) {
        self.connection = connection
        self.server = server
        self.limits = server.connectionLimits
        // One serial queue per connection keeps its buffer single-threaded.
        self.queue = DispatchQueue(label: "annhub.hub.connection", target: server.connectionQueue)
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.finish()
            default: break
            }
        }
        connection.start(queue: queue)
        armIdleTimer()
        receive()
    }

    func close() {
        queue.async { self.finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        idleTimer?.cancel()
        idleTimer = nil
        connection.cancel()
        server?.release(self)
    }

    private func armIdleTimer() {
        idleTimer?.cancel()
        let timer = DispatchWorkItem { [weak self] in self?.finish() }
        idleTimer = timer
        queue.asyncAfter(deadline: .now() + limits.idleTimeout, execute: timer)
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self, !self.finished else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                self.armIdleTimer()
            }
            if error != nil {
                self.finish()
                return
            }
            self.process(peerClosed: isComplete)
        }
    }

    private func process(peerClosed: Bool) {
        if head == nil {
            switch HTTPFraming.parseHead(buffer, maxHeaderBytes: limits.maxHeaderBytes) {
            case .incomplete:
                continueOrClose(peerClosed)
                return
            case .malformed:
                reject(.json(400, ["error": "bad request"]))
                return
            case .headersTooLarge:
                reject(.json(431, ["error": "headers too large"]))
                return
            case .head(let parsed, let start):
                if parsed.carriesBody && parsed.contentLength == nil {
                    // PUT/POST carry protocol bodies and must declare their length;
                    // a missing header used to look like an empty body and 422.
                    reject(.json(411, ["error": "length required"]))
                    return
                }
                if (parsed.contentLength ?? 0) > limits.maxBodyBytes {
                    reject(.json(413, ["error": "payload too large"]))
                    return
                }
                head = parsed
                bodyStart = start
            }
        }
        guard let head else { return }
        let expected = head.contentLength ?? 0
        let received = buffer.count - bodyStart
        guard received >= expected else {
            continueOrClose(peerClosed)
            return
        }
        // The body is the first `expected` bytes after the header block; bytes that
        // trail it (a pipelined request) are ignored, the connection closes after
        // this response.
        let body = expected > 0 ? Data(buffer[bodyStart..<(bodyStart + expected)]) : nil
        let request = HubRequest(
            method: head.method, path: head.path, bearerToken: head.bearerToken,
            headers: head.headers.filter { $0.key != "authorization" }, body: body
        )
        guard let response = server?.answer(request) else {
            finish()
            return
        }
        connection.send(
            content: HTTPFraming.serialize(response),
            completion: .contentProcessed { [weak self] _ in self?.finish() }
        )
    }

    private func continueOrClose(_ peerClosed: Bool) {
        if peerClosed {
            finish()
        } else {
            receive()
        }
    }

    /// An early rejection answers before the client finished sending. Closing at once
    /// would reset the connection while its upload is still in flight and the client
    /// would never see the status. Half-close after the response, then drain what the
    /// client is still sending until it hangs up (or the idle timer fires).
    private func reject(_ response: HubResponse) {
        connection.send(
            content: HTTPFraming.serialize(response),
            contentContext: .finalMessage,
            isComplete: true,
            completion: .contentProcessed { [weak self] _ in self?.drain() }
        )
    }

    private func drain() {
        guard !finished else { return }
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] _, _, isComplete, error in
            guard let self, !self.finished else { return }
            if isComplete || error != nil {
                self.finish()
            } else {
                self.drain()
            }
        }
    }
}
