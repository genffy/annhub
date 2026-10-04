// The hub's HTTP transport on a real loopback socket (storage.md §8): what the
// extension actually sends over the wire, and the limits a local server needs.
// Protocol rules are covered without sockets in HubPutTests / SyncEndpointTests;
// these tests prove the bytes get from a TCP connection to those rules and back.

import Darwin
import XCTest

@testable import AnnHubCore

// ── helpers ──────────────────────────────────────────────────────────────

private final class StateLog: @unchecked Sendable {
    private let lock = NSLock()
    private var states: [HubServer.State] = []
    private var handled: [(request: HubRequest, status: Int)] = []

    func record(_ state: HubServer.State) {
        lock.lock()
        defer { lock.unlock() }
        states.append(state)
    }

    func record(_ request: HubRequest, _ response: HubResponse) {
        lock.lock()
        defer { lock.unlock() }
        handled.append((request, response.status))
    }

    var allStates: [HubServer.State] {
        lock.lock()
        defer { lock.unlock() }
        return states
    }

    var requests: [(request: HubRequest, status: Int)] {
        lock.lock()
        defer { lock.unlock() }
        return handled
    }
}

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
    let hub = DesktopHub(store: store, pairToken: token)
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

    /// Reads until the peer closes or `timeout` passes without data.
    func readToEnd(timeout: TimeInterval = 5) -> (data: Data, peerClosed: Bool) {
        var tv = timeval(tv_sec: Int(timeout), tv_usec: Int32((timeout - floor(timeout)) * 1_000_000))
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
        var out = Data()
        var chunk = [UInt8](repeating: 0, count: 64 * 1024)
        while true {
            let count = recv(fd, &chunk, chunk.count, 0)
            if count == 0 { return (out, true) }
            if count < 0 { return (out, false) }
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

// ── framing (no sockets) ─────────────────────────────────────────────────

final class HTTPFramingTests: XCTestCase {
    private func head(_ text: String, maxHeaderBytes: Int = 16 * 1024) -> HTTPHeadResult {
        HTTPFraming.parseHead(Data(text.utf8), maxHeaderBytes: maxHeaderBytes)
    }

    func testIncompleteUntilTheBlankLine() {
        XCTAssertEqual(head("GET /health HTTP/1.1\r\nHost: 127.0.0.1"), .incomplete)
        XCTAssertEqual(head("GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n"), .incomplete)
    }

    func testParsesMethodPathHeadersAndBodyOffset() throws {
        let text =
            "PUT /v1/fragments/abc HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nAuthorization: Bearer ABCD-EFGH\r\n"
            + "Content-Length: 5\r\nX-AnnHub-Sha256: ff\r\n\r\nhello"
        guard case .head(let parsed, let bodyStart) = head(text) else { return XCTFail("expected a head") }
        XCTAssertEqual(parsed.method, "PUT")
        XCTAssertEqual(parsed.path, "/v1/fragments/abc")
        XCTAssertEqual(parsed.contentLength, 5)
        XCTAssertEqual(parsed.headers["x-annhub-sha256"], "ff")  // names are lowercased
        XCTAssertEqual(parsed.bearerToken, "ABCD-EFGH")
        XCTAssertTrue(parsed.carriesBody)
        XCTAssertEqual(String(text.utf8.dropFirst(bodyStart))!, "hello")
    }

    func testBearerSchemeIsCaseInsensitiveAndOtherSchemesAreIgnored() throws {
        func token(_ line: String) throws -> String? {
            guard case .head(let parsed, _) = head("GET / HTTP/1.1\r\n\(line)\r\n\r\n") else {
                throw XCTSkip("expected a head")
            }
            return parsed.bearerToken
        }
        XCTAssertEqual(try token("authorization: bearer TOKEN-1"), "TOKEN-1")
        XCTAssertEqual(try token("Authorization: BEARER TOKEN-2"), "TOKEN-2")
        XCTAssertNil(try token("Authorization: Basic dXNlcjpwYXNz"))
    }

    func testRejectsMalformedRequestsAndAmbiguousLengths() {
        XCTAssertEqual(head("NOT HTTP\r\n\r\n"), .malformed)
        XCTAssertEqual(head("get /health HTTP/1.1\r\n\r\n"), .malformed, "methods are uppercase")
        XCTAssertEqual(head("GET health HTTP/1.1\r\n\r\n"), .malformed, "origin-form targets start with /")
        XCTAssertEqual(head("GET /health SPDY/3\r\n\r\n"), .malformed)
        XCTAssertEqual(head("GET / HTTP/1.1\r\nno colon here\r\n\r\n"), .malformed)
        XCTAssertEqual(head("PUT / HTTP/1.1\r\nContent-Length: -1\r\n\r\n"), .malformed)
        XCTAssertEqual(head("PUT / HTTP/1.1\r\nContent-Length: 12abc\r\n\r\n"), .malformed)
        XCTAssertEqual(head("PUT / HTTP/1.1\r\nContent-Length: 5\r\nContent-Length: 6\r\n\r\n"), .malformed)
        // Repeating the same length is harmless.
        XCTAssertNotEqual(head("PUT / HTTP/1.1\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\n"), .malformed)
    }

    func testHeaderBlockIsBounded() {
        let flood = "GET / HTTP/1.1\r\nX-Pad: " + String(repeating: "a", count: 2000)
        XCTAssertEqual(head(flood, maxHeaderBytes: 1024), .headersTooLarge)
        XCTAssertEqual(head(flood + "\r\n\r\n", maxHeaderBytes: 1024), .headersTooLarge)
        XCTAssertEqual(head("GET / HTTP/1.1\r\nX-Pad: a", maxHeaderBytes: 1024), .incomplete)
    }

    func testBodylessMethodsDoNotNeedALength() throws {
        guard case .head(let parsed, _) = head("GET /v1/changes?cursor=0 HTTP/1.1\r\n\r\n") else {
            return XCTFail("expected a head")
        }
        XCTAssertFalse(parsed.carriesBody)
        XCTAssertNil(parsed.contentLength)
    }

    func testResponsesCarryTheRightStatusLineAndLength() {
        let response = HTTPFraming.serialize(.json(403, ["error": "forbidden_origin"]))
        let text = String(decoding: response, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("HTTP/1.1 403 Forbidden\r\n"))
        XCTAssertTrue(text.contains("Content-Length: \(#"{"error":"forbidden_origin"}"#.utf8.count)\r\n"))
        XCTAssertTrue(text.contains("Connection: close\r\n"))
        XCTAssertTrue(text.hasSuffix(#"{"error":"forbidden_origin"}"#))
        // Every status the hub can answer has a real reason phrase.
        for status in [200, 201, 400, 401, 403, 404, 405, 409, 410, 411, 413, 422, 431, 500] {
            XCTAssertFalse(HTTPFraming.reasonPhrase(status).hasPrefix("Status"), "\(status)")
        }
    }
}

// ── the client rules (no sockets) ────────────────────────────────────────

final class HubClientPolicyTests: XCTestCase {
    private let extensionOrigin = "chrome-extension://" + String(repeating: "a", count: 32)

    private func makeHub() throws -> DesktopHub {
        DesktopHub(store: try freshStore(), pairToken: "GOOD-CODE")
    }

    func testLoopbackHostsOnly() {
        for host in ["127.0.0.1", "127.0.0.1:8765", "localhost", "LOCALHOST:8765", "[::1]:8765", "[::1]"] {
            XCTAssertTrue(DesktopHub.isLoopbackHost(host), host)
        }
        for host in ["evil.example", "evil.example:8765", "127.0.0.1.evil.example", "192.168.1.5:8765", "0.0.0.0"] {
            XCTAssertFalse(DesktopHub.isLoopbackHost(host), host)
        }
    }

    func testOnlyExtensionOriginsPass() {
        XCTAssertTrue(DesktopHub.isExtensionOrigin(extensionOrigin))
        XCTAssertFalse(DesktopHub.isExtensionOrigin("https://example.com"))
        XCTAssertFalse(DesktopHub.isExtensionOrigin("null"))
        XCTAssertFalse(DesktopHub.isExtensionOrigin("chrome-extension://short"))
        XCTAssertFalse(DesktopHub.isExtensionOrigin("chrome-extension://" + String(repeating: "z", count: 32)))
        XCTAssertFalse(DesktopHub.isExtensionOrigin(extensionOrigin + "/path"))
    }

    func testWebPageOriginIsRefusedEvenWithTheRightToken() throws {
        let hub = try makeHub()
        let response = hub.handle(
            HubRequest(
                method: "POST", path: "/v1/pair", bearerToken: "GOOD-CODE",
                headers: ["Origin": "https://evil.example"]))
        XCTAssertEqual(response.status, 403)
        XCTAssertEqual(response.errorField(), "forbidden_origin")
        XCTAssertNil(hub.lastPairedAt, "a refused request must not pair")
    }

    func testRefusedRequestsAreNeitherConnectionsNorDeliveries() throws {
        let hub = try makeHub()
        let attempt = HubRequest(
            method: "PUT", path: "/v1/fragments/x", bearerToken: "GOOD-CODE",
            headers: ["Origin": "https://evil.example"], body: Data("{}".utf8))
        XCTAssertEqual(hub.handle(attempt).status, 403)
        XCTAssertNil(hub.lastConnectionAt)
        XCTAssertTrue(hub.recentDeliveries.isEmpty)
    }

    func testForeignHostIsRefusedAsDNSRebinding() throws {
        let response = try makeHub().handle(
            HubRequest(method: "GET", path: "/health", headers: ["Host": "evil.example:8765"]))
        XCTAssertEqual(response.status, 403)
        XCTAssertEqual(response.errorField(), "forbidden_host")
    }

    func testExtensionOriginAndPlainClientsPass() throws {
        let hub = try makeHub()
        XCTAssertEqual(
            hub.handle(HubRequest(method: "GET", path: "/health", headers: ["Origin": extensionOrigin])).status, 200)
        XCTAssertEqual(hub.handle(HubRequest(method: "GET", path: "/health")).status, 200, "curl sends no Origin")
        XCTAssertEqual(
            hub.handle(HubRequest(method: "GET", path: "/health", headers: ["Host": "127.0.0.1:8765"])).status, 200)
    }

    func testAPinnedExtensionExcludesOtherExtensions() throws {
        let hub = try makeHub()
        let other = "chrome-extension://" + String(repeating: "b", count: 32)
        hub.allowedExtensionOrigins = [extensionOrigin]
        XCTAssertEqual(
            hub.handle(HubRequest(method: "GET", path: "/health", headers: ["Origin": extensionOrigin])).status, 200)
        XCTAssertEqual(hub.handle(HubRequest(method: "GET", path: "/health", headers: ["Origin": other])).status, 403)
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
            hub, "PUT", "/v1/fragments/\(id)", token: hub.token, headers: ["Content-Type": "application/json"],
            body: body)
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
        let bytes = Data(DemoSeed.pngBytes)
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

    func testAnImageOverTheLimitGets413FromTheHub() async throws {
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

    func testARequestFarOverTheBodyCapIsRefusedBeforeItIsRead() async throws {
        let hub = try startHub(limits: HubServer.Limits(maxBodyBytes: 4096))
        defer { hub.stop() }
        let body = Data(count: 512 * 1024)
        // The client is still uploading when the 413 goes out; it must still read the
        // status instead of seeing the connection reset.
        let response = try await send(
            request(hub, "PUT", "/v1/assets/asset_x", token: hub.token, headers: assetHeaders(bytes: body), body: body))
        XCTAssertEqual(response.status, 413)
        XCTAssertFalse(try hub.store.assetExists(id: "asset_x"))
    }

    func testAPutWithoutALengthIs411NotASilentEmptyBody() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("PUT /v1/fragments/x HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer \(hub.token)\r\n\r\n")
        let reply = socket.readToEnd()
        XCTAssertEqual(RawSocket.statusLine(of: reply.data), "HTTP/1.1 411 Length Required")
    }

    func testNonHTTPBytesGet400() throws {
        let hub = try startHub()
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("\u{16}\u{3}\u{1}\u{0}\u{5}hello\r\n\r\n")  // a TLS ClientHello's first bytes
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 400 Bad Request")
    }

    func testAnEndlessHeaderBlockIsCutOff() throws {
        let hub = try startHub(limits: HubServer.Limits(maxHeaderBytes: 1024))
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        socket.send("GET /health HTTP/1.1\r\nX-Pad: " + String(repeating: "a", count: 4096))
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

    func testASilentClientIsDroppedAfterTheIdleTimeout() throws {
        let hub = try startHub(limits: HubServer.Limits(idleTimeout: 0.3))
        defer { hub.stop() }
        let socket = try RawSocket(port: hub.port)
        let started = Date()
        let reply = socket.readToEnd(timeout: 20)
        XCTAssertTrue(reply.peerClosed, "the hub should hang up on a client that sends nothing")
        XCTAssertLessThan(Date().timeIntervalSince(started), 15, "far below the default 30 s idle timeout")
    }

    func testWebPageAndForeignHostRequestsAreRefusedOnTheWire() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        let web = try await send(request(hub, "GET", "/health", headers: ["Origin": "https://evil.example"]))
        XCTAssertEqual(web.status, 403)
        let fromExtension = try await send(
            request(
                hub, "GET", "/health", headers: ["Origin": "chrome-extension://" + String(repeating: "p", count: 32)]))
        XCTAssertEqual(fromExtension.status, 200)

        let socket = try RawSocket(port: hub.port)
        socket.send("GET /health HTTP/1.1\r\nHost: evil.example\r\n\r\n")
        XCTAssertEqual(RawSocket.statusLine(of: socket.readToEnd().data), "HTTP/1.1 403 Forbidden")
    }

    func testEveryAnsweredRequestIsReportedOnce() async throws {
        let hub = try startHub()
        defer { hub.stop() }
        _ = try await send(request(hub, "GET", "/health"))
        _ = try await send(request(hub, "POST", "/v1/pair", token: "WRONG"))
        let handled = hub.log.requests
        XCTAssertEqual(handled.map(\.request.path), ["/health", "/v1/pair"])
        XCTAssertEqual(handled.map(\.status), [200, 401])
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
        var failure: String?
        while Date() < deadline, failure == nil {
            if case .failed(let message) = second.state { failure = message }
            Thread.sleep(forTimeInterval: 0.02)
        }
        let message = try XCTUnwrap(failure, "binding an occupied port must surface as a failure")
        XCTAssertTrue(message.contains("\(first.port)"), message)
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

    func testTheRequestedFixedPortIsHonoured() throws {
        // Find a free port, release it, then ask the hub for exactly that one.
        let probe = try startHub()
        let wanted = probe.port
        probe.stop()
        Thread.sleep(forTimeInterval: 0.1)
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
