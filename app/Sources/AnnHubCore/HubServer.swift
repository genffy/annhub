// The Desktop hub's socket: a thin Network.framework shim in front of DesktopHub.
//
// What may be read, from whom and how much is decided by `HubRequestFramer` and
// `DesktopHub.preflight` (HubHTTP.swift), from the header block alone; the protocol itself is
// DesktopHub. This file only moves bytes on a loopback socket and owns what needs a socket:
// the listener's real state, a bound on time and on connections, and closing a refused
// connection so the client can still read why.
//
// It listens on 127.0.0.1 only (storage.md §8) and closes every connection after one response
// (`Connection: close`).

import Foundation
import Network

/// Writes the one response a connection gets.
enum HubResponseWriter {
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
        case 501: return "Not Implemented"
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

public final class HubServer: @unchecked Sendable {
    /// Why the listener is not up. A reason, not a sentence: the interface words it, in the
    /// language the user reads.
    public enum Failure: Equatable, Sendable {
        case portInUse(UInt16)
        /// The system's own description of what went wrong.
        case other(String)

        public func message(lang: UILanguage = .current) -> String {
            switch self {
            case .portInUse(let port): return t(.hubPortInUse, ["port": Int(port)], lang: lang)
            case .other(let description): return description
            }
        }
    }

    public enum State: Equatable, Sendable {
        case idle
        case starting
        case ready(port: UInt16)
        case failed(Failure)

        public var isReady: Bool {
            if case .ready = self { return true }
            return false
        }
    }

    public struct Limits: Equatable, Sendable {
        /// A request that has not arrived in full by then is dropped (a client trickling bytes).
        public var requestDeadline: TimeInterval
        /// Simultaneous connections. The extension delivers one item at a time.
        public var maxConnections: Int

        public init(requestDeadline: TimeInterval = 20, maxConnections: Int = 32) {
            self.requestDeadline = requestDeadline
            self.maxConnections = maxConnections
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
    /// Called on a hub queue after every request has been answered, including the ones refused
    /// from their header block (the request is nil for those: it was never read). Keep it cheap.
    public var onRequestHandled: (@Sendable (HubRequest?, HubResponse) -> Void)?

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
        lock.lock()
        let admitted = connections.count < limits.maxConnections
        let handler = admitted ? HubConnection(connection: connection, server: self) : nil
        if let handler { connections[ObjectIdentifier(handler)] = handler }
        lock.unlock()
        guard let handler else {
            connection.cancel()
            return
        }
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

    fileprivate func refused(_ response: HubResponse) {
        onRequestHandled?(nil, response)
    }

    fileprivate var framer: HubRequestFramer { HubRequestFramer(hub: hub) }
    fileprivate var requestDeadline: TimeInterval { limits.requestDeadline }
    fileprivate var connectionQueue: DispatchQueue { queue }

    static func describe(_ error: Error, port: UInt16) -> Failure {
        if let error = error as? NWError, case .posix(let code) = error, code == .EADDRINUSE {
            return .portInUse(port)
        }
        return .other(error.localizedDescription)
    }
}

/// One accepted connection: feeds the framer, answers once, closes.
private final class HubConnection: @unchecked Sendable {
    private let connection: NWConnection
    private weak var server: HubServer?
    private let queue: DispatchQueue
    private var framer: HubRequestFramer
    private var deadline: DispatchWorkItem?
    private var finished = false

    init(connection: NWConnection, server: HubServer) {
        self.connection = connection
        self.server = server
        self.framer = server.framer
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
        let work = DispatchWorkItem { [weak self] in self?.finish() }
        deadline = work
        queue.asyncAfter(deadline: .now() + (server?.requestDeadline ?? 20), execute: work)
        receive()
    }

    func close() {
        queue.async { self.finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        deadline?.cancel()
        deadline = nil
        connection.cancel()
        server?.release(self)
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self, !self.finished else { return }
            if let data, !data.isEmpty {
                switch self.framer.feed(data) {
                case .reject(let response):
                    self.server?.refused(response)
                    self.reject(response)
                    return
                case .request(let request):
                    guard let response = self.server?.answer(request) else {
                        self.finish()
                        return
                    }
                    self.deadline?.cancel()
                    self.connection.send(
                        content: HubResponseWriter.serialize(response),
                        completion: .contentProcessed { [weak self] _ in self?.finish() }
                    )
                    return
                case .needMore:
                    break
                }
            }
            if error != nil || isComplete {
                self.finish()
            } else {
                self.receive()
            }
        }
    }

    /// An early refusal answers before the client finished sending. Closing at once would
    /// reset the connection while its upload is still in flight and the client would never
    /// see the status. Half-close after the response, then drain what the client is still
    /// sending until it hangs up (or the request deadline fires).
    private func reject(_ response: HubResponse) {
        connection.send(
            content: HubResponseWriter.serialize(response),
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
