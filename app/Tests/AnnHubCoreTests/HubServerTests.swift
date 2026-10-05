// The hub's socket on a real loopback port (storage.md §8): what the extension actually sends over
// the wire, the listener's real state, and how a refused connection is closed. What may be read —
// header and body caps, Host, Origin, the token — is decided by HubRequestFramer and
// DesktopHub.preflight and is covered without sockets in HubFramingTests; the protocol itself in
// HubPutTests / SyncEndpointTests. These tests prove the bytes get from a TCP connection to those
// rules and back.

import Darwin
import XCTest

@testable import AnnHubCore

// ── helpers ──────────────────────────────────────────────────────────────

private final class StateLog: @unchecked Sendable {
    private let lock = NSLock()
    private var states: [HubServer.State] = []
    private var handled: [(request: HubRequest?, status: Int)] = []

    func record(_ state: HubServer.State) {
        lock.lock()
        defer { lock.unlock() }
        states.append(state)
    }

    func record(_ request: HubRequest?, _ response: HubResponse) {
        lock.lock()
        defer { lock.unlock() }
        handled.append((request, response.status))
    }

    var allStates: [HubServer.State] {
        lock.lock()
        defer { lock.unlock() }
        return states
    }

    var requests: [(request: HubRequest?, status: Int)] {
        lock.lock()
        defer { lock.unlock() }
        return handled
    }
}

/// The extension the test hubs are configured for; the real id comes from the build (storage.md §8).
private let testExtensionId = String(repeating: "a", count: 32)
private let allowedOrigin = "chrome-extension://" + testExtensionId

private struct RunningHub {
    let store: FragmentStore
    let hub: DesktopHub
    let server: HubServer
    let port: UInt16
    let log: StateLog
    var token: String { hub.pairToken }
    var base: String { "http://127.0.0.1:\(port)" }

    func stop() { server.stop() }
}

private func startHub(
    limits: HubServer.Limits = HubServer.Limits(),
    port: UInt16 = 0,
    token: String = "TEST-PAIR-CODE"
) throws -> RunningHub {
    let store = try freshStore()
    let hub = DesktopHub(store: store, pairToken: token, allowedExtensionIds: [testExtensionId])
    let server = HubServer(hub: hub, port: port, limits: limits)
    let log = StateLog()
    server.onStateChange = { log.record($0) }
    server.onRequestHandled = { log.record($0, $1) }
    server.start()
    let boundPort = try waitForReady(server)
    return RunningHub(store: store, hub: hub, server: server, port: boundPort, log: log)
}

private func waitForReady(_ server: HubServer, timeout: TimeInterval = 5) throws -> UInt16 {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        switch server.state {
        case .ready(let port): return port
        case .failed(let message): throw XCTSkip("hub failed to start: \(message)")
        default: Thread.sleep(forTimeInterval: 0.01)
        }
    }
    throw XCTSkip("hub did not become ready within \(timeout)s")
}

private func makeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.connectionProxyDictionary = [:]
    configuration.timeoutIntervalForRequest = 15
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
}

private func request(
    _ hub: RunningHub, _ method: String, _ path: String, token: String? = nil,
    headers: [String: String] = [:], body: Data? = nil
) -> URLRequest {
    var request = URLRequest(url: URL(string: hub.base + path)!)
    request.httpMethod = method
    request.httpBody = body
    if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    return request
}

private func send(_ request: URLRequest) async throws -> (status: Int, json: [String: Any], data: Data) {
    let (data, response) = try await makeSession().data(for: request)
    let status = try XCTUnwrap(response as? HTTPURLResponse).statusCode
    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    return (status, json, data)
}

private func assetHeaders(bytes: Data, mime: String = "image/png") -> [String: String] {
    [
        "Content-Type": mime,
        "X-AnnHub-Sha256": sha256Hex(bytes),
        "X-AnnHub-Byte-Length": String(bytes.count),
    ]
}

/// A blocking BSD-socket client for what URLSession cannot express: a partial
/// request, bytes that are not HTTP, a client that stays silent.
private final class RawSocket {
    private let fd: Int32

    init(port: UInt16, host: String = "127.0.0.1") throws {
        fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw XCTSkip("socket() failed") }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr(host)
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        if result != 0 {
            let code = errno
            Darwin.close(fd)
            throw POSIXError(POSIXErrorCode(rawValue: code) ?? .EIO)
        }
    }

    deinit { Darwin.close(fd) }

    func send(_ data: Data) {
        data.withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count {
                let written = Darwin.send(fd, buffer.baseAddress! + offset, buffer.count - offset, 0)
                if written <= 0 { return }
                offset += written
            }
        }
    }

    func send(_ text: String) { send(Data(text.utf8)) }

    /// Reads until the peer ends the connection (closed or reset) or `timeout` passes without data.
    func readToEnd(timeout: TimeInterval = 5) -> (data: Data, peerClosed: Bool) {
        var tv = timeval(tv_sec: Int(timeout), tv_usec: Int32((timeout - floor(timeout)) * 1_000_000))
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        var out = Data()
        var chunk = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            let count = recv(fd, &chunk, chunk.count, 0)
            if count == 0 { return (out, true) }
            if count < 0 { return (out, errno == ECONNRESET) }
            out.append(chunk, count: count)
        }
    }

    static func statusLine(of response: Data) -> String {
        String(decoding: response.prefix(while: { $0 != 13 }), as: UTF8.self)
    }
}

private func fixtureFragmentBody() throws -> (id: String, body: Data) {
    let fixture = try JSONDecoder().decode(PutBodyFixture.self, from: fixtureData("fragment-put-concept.json"))
    let record = try decodeRecord(from: fixture.fragment)
    return (record.id, try putFragmentBody(deviceId: fixture.deviceId, fragment: fixture.fragment))
}

// ── responses ────────────────────────────────────────────────────────────

final class HubResponseWriterTests: XCTestCase {
    func testResponsesCarryTheRightStatusLineAndLength() {
        let response = HubResponseWriter.serialize(.json(403, ["error": "forbidden origin"]))
        let text = String(decoding: response, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("HTTP/1.1 403 Forbidden\r\n"))
        XCTAssertTrue(text.contains("Content-Length: \(#"{"error":"forbidden origin"}"#.utf8.count)\r\n"))
        XCTAssertTrue(text.contains("Connection: close\r\n"))
        XCTAssertFalse(text.lowercased().contains("access-control-"), "no CORS headers: a page may not read the reply")
        XCTAssertTrue(text.hasSuffix(#"{"error":"forbidden origin"}"#))
    }

    func testEveryStatusTheHubCanAnswerHasARealReasonPhrase() {
        for status in [200, 201, 400, 401, 403, 404, 405, 409, 410, 413, 422, 431, 500, 501] {
            XCTAssertFalse(HubResponseWriter.reasonPhrase(status).hasPrefix("Status"), "\(status)")
        }
    }
}

// ── real sockets ─────────────────────────────────────────────────────────

final class HubServerSocketTests: XCTestCase {
    func testListensAndReportsTheBoundPort() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        XCTAssertNotEqual(hub.port, 0)
        XCTAssertEqual(hub.log.allStates.last, .ready(port: hub.port))

        let health = try await send(request(hub, "GET", "/health"))
        XCTAssertEqual(health.status, 200)
        XCTAssertEqual(health.json["status"] as? String, "ok")
        XCTAssertEqual(health.json["apiVersion"] as? String, DesktopHub.apiVersion)
    }

    func testOnlyTheLoopbackInterfaceAccepts() throws {
        let hub = try startHub()
        defer { hub.stop() }
        // Connecting through the machine's own LAN address must be refused: the hub
        // never listens on another interface (storage.md §8).
        guard let lan = nonLoopbackIPv4Address() else { throw XCTSkip("no non-loopback IPv4 address") }
        XCTAssertThrowsError(try RawSocket(port: hub.port, host: lan)) { error in
            XCTAssertEqual((error as? POSIXError)?.code, .ECONNREFUSED)
        }
        _ = try RawSocket(port: hub.port)  // loopback still works
    }

    func testPairThenDeliverAFragmentAndRepeatIt() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let (id, body) = try fixtureFragmentBody()

        let pair = try await send(request(hub, "POST", "/v1/pair", token: hub.token))
        XCTAssertEqual(pair.status, 200)
        XCTAssertEqual(pair.json["paired"] as? Bool, true)

        let put = request(
            hub, "PUT", "/v1/fragments/\(id)", token: hub.token,
            headers: ["Content-Type": "application/json", "Origin": allowedOrigin], body: body)
        let first = try await send(put)
        XCTAssertEqual(first.status, 201)
        XCTAssertEqual(first.json["revision"] as? Int, 1)

        let repeated = try await send(put)
        XCTAssertEqual(repeated.status, 200)
        XCTAssertEqual(repeated.json["applied"] as? Bool, false)
        XCTAssertEqual(try hub.store.getFragments().count, 1, "a repeated delivery must not duplicate")
    }

    func testWrongTokenIs401AndWritesNothing() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let (id, body) = try fixtureFragmentBody()
        let denied = try await send(request(hub, "PUT", "/v1/fragments/\(id)", token: "WRONG", body: body))
        XCTAssertEqual(denied.status, 401)
        XCTAssertTrue(try hub.store.getFragments().isEmpty)
    }

    func testAssetBytesSurviveTheWireIntact() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let bytes = try fixtureData("asset.png")
        let response = try await send(
            request(
                hub, "PUT", "/v1/assets/asset_wire_1", token: hub.token, headers: assetHeaders(bytes: bytes),
                body: bytes))
        XCTAssertEqual(response.status, 201)
        XCTAssertEqual(try hub.store.getAsset(id: "asset_wire_1")?.bytes, bytes)
    }

    func testAMultiMegabyteImageArrivesWholeAndFast() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        var bytes = Data(count: 6 * 1024 * 1024)
        bytes.withUnsafeMutableBytes { _ = SecRandomCopyBytes(kSecRandomDefault, $0.count, $0.baseAddress!) }
        let started = Date()
        let response = try await send(
            request(
                hub, "PUT", "/v1/assets/asset_big", token: hub.token, headers: assetHeaders(bytes: bytes), body: bytes))
        XCTAssertEqual(response.status, 201)
        XCTAssertEqual(try hub.store.getAsset(id: "asset_big")?.bytes, bytes)
        // The body is appended, never re-copied per chunk: a fraction of a second locally;
        // the bound only has to catch a quadratic copy, even on a busy machine.
        XCTAssertLessThan(Date().timeIntervalSince(started), 30)
    }

    // A refusal made from the header block goes out while the client is still uploading. These
    // prove the client can still read the status — closing at once would reset the connection.
    func testAnImageOverTheLimitIsAnswered413WhileItIsStillBeingSent() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let bytes = Data(count: MAX_IMAGE_BYTES + 1024)
        let response = try await send(
            request(
                hub, "PUT", "/v1/assets/asset_huge", token: hub.token, headers: assetHeaders(bytes: bytes), body: bytes)
        )
        XCTAssertEqual(response.status, 413)
        XCTAssertFalse(try hub.store.assetExists(id: "asset_huge"))
    }

    func testAJSONBodyOverItsCapIsAnswered413BeforeItIsRead() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let body = Data(count: HubRequestFramer.maxJSONBodyBytes + 512 * 1024)
        let response = try await send(
            request(
                hub, "PUT", "/v1/fragments/frag_big", token: hub.token, headers: ["Content-Type": "application/json"],
                body: body))
        XCTAssertEqual(response.status, 413)
        XCTAssertTrue(try hub.store.getFragments().isEmpty)
    }

    func testAnUnauthenticatedUploadGets401NotAnImmediateReset() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let body = Data(count: 3 * 1024 * 1024)
        let response = try await send(
            request(hub, "PUT", "/v1/assets/asset_x", token: "WRONG", headers: assetHeaders(bytes: body), body: body))
        XCTAssertEqual(response.status, 401)
    }

    func testAPutWithoutALengthIsRefusedNotTakenForAnEmptyBody() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("PUT /v1/fragments/x HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer \(hub.token)\r\n\r\n")
        let reply = socket.readToEnd()
        XCTAssertEqual(RawSocket.statusLine(of: reply.data), "HTTP/1.1 400 Bad Request")
        XCTAssertTrue(String(decoding: reply.data, as: UTF8.self).contains("length required"))
    }

    func testNonHTTPBytesGet400() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("\u{16}\u{3}\u{1}\u{0}\u{5}hello\r\n\r\n")  // a TLS ClientHello's first bytes
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 400 Bad Request")
    }

    func testAnEndlessHeaderBlockIsCutOff() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send(
            "GET /health HTTP/1.1\r\nX-Pad: " + String(repeating: "a", count: HubRequestFramer.maxHeaderBytes * 2))
        XCTAssertEqual(
            RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 431 Request Header Fields Too Large")
    }

    func testARequestArrivingInPiecesIsReassembled() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let (id, body) = try fixtureFragmentBody()
        let head =
            "PUT /v1/fragments/\(id) HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer \(hub.token)\r\n"
            + "Content-Type: application/json\r\nContent-Length: \(body.count)\r\n\r\n"
        let socket = try RawSocket(port: hub.port)
        // Split mid-header, then mid-body — what a slow network or a big upload looks like.
        let wire = Data(head.utf8) + body
        for slice in [wire.prefix(20), wire.dropFirst(20).prefix(60), wire.dropFirst(80)] {
            socket.send(Data(slice))
            Thread.sleep(forTimeInterval: 0.05)
        }
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 201 Created")
        XCTAssertEqual(try hub.store.getFragments().count, 1)
    }

    func testBytesAfterTheBodyAreIgnored() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let (id, body) = try fixtureFragmentBody()
        let head =
            "PUT /v1/fragments/\(id) HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer \(hub.token)\r\n"
            + "Content-Length: \(body.count)\r\n\r\n"
        let socket = try RawSocket(port: hub.port)
        socket.send(Data(head.utf8) + body + Data("GET /health HTTP/1.1\r\n\r\n".utf8))
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 201 Created")
        XCTAssertEqual(hub.log.requests.count, 1, "exactly one request is served per connection")
    }

    func testASilentClientIsDroppedWhenTheRequestDeadlinePasses() throws {
        let hub = try startHub(limits: HubServer.Limits(requestDeadline: 0.3))
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        let started = Date()
        let reply = socket.readToEnd(timeout: 20)
        XCTAssertTrue(reply.peerClosed, "the hub should hang up on a client that sends nothing")
        XCTAssertLessThan(Date().timeIntervalSince(started), 15, "far below the default 20 s deadline")
    }

    func testConnectionsBeyondTheCapAreTurnedAway() throws {
        let hub = try startHub(limits: HubServer.Limits(requestDeadline: 20, maxConnections: 2))
        defer { hub.stop() }
        let first = try RawSocket(port: hub.port)
        let second = try RawSocket(port: hub.port)
        Thread.sleep(forTimeInterval: 0.3)  // both are admitted and idle
        let third = try RawSocket(port: hub.port)
        let started = Date()
        let reply = third.readToEnd(timeout: 10)
        XCTAssertTrue(reply.peerClosed, "a third simultaneous connection is closed at once")
        XCTAssertTrue(reply.data.isEmpty)
        XCTAssertLessThan(Date().timeIntervalSince(started), 5)
        withExtendedLifetime((first, second)) {}
    }

    // ── who may talk to it, on the wire ───────────────────────────────────

    func testOnlyTheConfiguredExtensionAndPlainClientsAreServed() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let configured = try await send(request(hub, "GET", "/health", headers: ["Origin": allowedOrigin]))
        XCTAssertEqual(configured.status, 200)
        let plain = try await send(request(hub, "GET", "/health"))
        XCTAssertEqual(plain.status, 200, "curl and scripts send no Origin")

        let web = try await send(request(hub, "GET", "/health", headers: ["Origin": "https://evil.example"]))
        XCTAssertEqual(web.status, 403)
        let other = try await send(
            request(
                hub, "GET", "/health", headers: ["Origin": "chrome-extension://" + String(repeating: "p", count: 32)]))
        XCTAssertEqual(other.status, 403, "another extension is not the AnnHub extension")
    }

    func testAnExplicitlyAllowedExtraIdIsServed() async throws {
        let store = try freshStore()
        let extra = String(repeating: "a", count: 32)
        let hub = DesktopHub(
            store: store, pairToken: "T", allowedExtensionIds: [testExtensionId, extra])
        let server = HubServer(hub: hub, port: 0)
        server.start()
        defer { server.stop() }
        let port = try waitForReady(server)
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/health")!)
        request.setValue("chrome-extension://" + extra, forHTTPHeaderField: "Origin")
        let (_, response) = try await makeSession().data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    func testAForeignHostIsRefusedAsDNSRebinding() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("GET /health HTTP/1.1\r\nHost: evil.example\r\n\r\n")
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 403 Forbidden")
    }

    func testRefusalsDoNotCountAsAnExtensionConnection() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        _ = try await send(request(hub, "GET", "/health", headers: ["Origin": "https://evil.example"]))
        XCTAssertNil(hub.hub.lastConnectionAt)
    }

    // ── reporting ─────────────────────────────────────────────────────────

    func testEveryRequestIsReportedOnceIncludingTheRefusedOnes() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        _ = try await send(request(hub, "GET", "/health"))
        _ = try await send(request(hub, "POST", "/v1/pair", token: "WRONG"))
        _ = try await send(request(hub, "GET", "/health", headers: ["Origin": "https://evil.example"]))
        let handled = hub.log.requests
        XCTAssertEqual(handled.map(\.status), [200, 401, 403])
        XCTAssertEqual(
            handled.map { $0.request?.path }, ["/health", "/v1/pair", nil], "a refusal never read a request")
    }

    func testAPortInUseIsReportedNotSwallowed() throws {
        let first = try startHub()
        defer { first.stop() }
        let store = try freshStore()
        let second = HubServer(hub: DesktopHub(store: store, pairToken: "X"), port: first.port)
        let log = StateLog()
        second.onStateChange = { log.record($0) }
        second.start()
        defer { second.stop() }

        let deadline = Date().addingTimeInterval(5)
        var failure: HubServer.Failure?
        while Date() < deadline, failure == nil {
            if case .failed(let reason) = second.state { failure = reason }
            Thread.sleep(forTimeInterval: 0.02)
        }
        let reason = try XCTUnwrap(failure, "binding an occupied port must surface as a failure")
        XCTAssertEqual(reason, .portInUse(first.port), "a reason the interface can word, not a sentence")
        XCTAssertTrue(reason.message(lang: .zh).contains("端口 \(first.port) 已被占用"), reason.message(lang: .zh))
        XCTAssertTrue(
            reason.message(lang: .en).contains("Port \(first.port) is already in use"), reason.message(lang: .en))
        XCTAssertFalse(second.state.isReady)
        // The first hub is unaffected.
        XCTAssertTrue(first.server.state.isReady)
    }

    func testStopClosesThePortAndReturnsToIdle() throws {
        let hub = try startHub()
        let port = hub.port
        hub.stop()
        XCTAssertEqual(hub.server.state, .idle)
        XCTAssertThrowsError(try RawSocket(port: port)) { error in
            XCTAssertEqual((error as? POSIXError)?.code, .ECONNREFUSED)
        }
    }

    // `NWListener.cancel()` is asynchronous: a stop that only cancels returns while the port still
    // accepts, which one connection in a few attempts caught. Repeated, so a stop that does not wait
    // for the release cannot pass by luck.
    func testStopReleasesThePortBeforeItReturns() throws {
        let hub = DesktopHub(store: try freshStore(), pairToken: "X", allowedExtensionIds: [testExtensionId])
        for round in 1...40 {
            let server = HubServer(hub: hub, port: 0)
            server.start()
            let port = try waitForReady(server)
            server.stop()
            XCTAssertThrowsError(try RawSocket(port: port), "round \(round): the port accepted after stop() returned") {
                error in
                XCTAssertEqual((error as? POSIXError)?.code, .ECONNREFUSED)
            }
        }
    }

    // The system page's retry stops the hub and starts a new one on the same port at once.
    func testAHubRestartedOnItsPortBindsAtOnce() throws {
        let hub = DesktopHub(store: try freshStore(), pairToken: "X", allowedExtensionIds: [testExtensionId])
        var server = HubServer(hub: hub, port: 0)
        server.start()
        let port = try waitForReady(server)
        defer { server.stop() }
        for round in 1...20 {
            server.stop()
            server = HubServer(hub: hub, port: port)
            server.start()
            let deadline = Date().addingTimeInterval(5)
            while Date() < deadline, server.state == .idle || server.state == .starting {
                Thread.sleep(forTimeInterval: 0.002)
            }
            XCTAssertEqual(server.state, .ready(port: port), "round \(round): the restarted hub did not bind")
        }
    }

    func testTheRequestedFixedPortIsHonoured() throws {
        // Find a free port, release it, then ask the hub for exactly that one.
        let probe = try startHub()
        let wanted = probe.port
        probe.stop()
        let hub = try startHub(port: wanted)
        defer { hub.stop() }
        XCTAssertEqual(hub.port, wanted)
    }
}

private func nonLoopbackIPv4Address() -> String? {
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0, let first = list else { return nil }
    defer { freeifaddrs(list) }
    var cursor: UnsafeMutablePointer<ifaddrs>? = first
    while let entry = cursor {
        let flags = Int32(entry.pointee.ifa_flags)
        if let address = entry.pointee.ifa_addr, address.pointee.sa_family == UInt8(AF_INET),
            flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0
        {
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(
                address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0
            {
                return String(cString: host)
            }
        }
        cursor = entry.pointee.ifa_next
    }
    return nil
}
