// What the hub decides from the header block alone (docs/v2/storage.md §8):
// size caps, Host and Origin, the bearer token — all before a body is buffered.

import XCTest

@testable import AnnHubCore

final class HubFramingTests: XCTestCase {
    private let token = "pair-token-1"

    private let publishedId = "jpooljigbeplpgciohfjklgbfdfnnmfn"

    private func makeHub(allowedExtensionIds: Set<String> = DesktopHub.publishedExtensionIds) throws -> DesktopHub {
        DesktopHub(store: try freshStore(), pairToken: token, allowedExtensionIds: allowedExtensionIds)
    }

    private func head(
        _ method: String = "PUT", _ target: String = "/v1/fragments/frag_1",
        host: String? = "127.0.0.1:8765", origin: String? = nil, authorization: String? = "Bearer pair-token-1",
        extra: [String] = [], contentLength: Int? = 0
    ) -> Data {
        var lines = ["\(method) \(target) HTTP/1.1"]
        if let host { lines.append("Host: \(host)") }
        if let origin { lines.append("Origin: \(origin)") }
        if let authorization { lines.append("Authorization: \(authorization)") }
        if let contentLength { lines.append("Content-Length: \(contentLength)") }
        lines.append(contentsOf: extra)
        return Data((lines.joined(separator: "\r\n") + "\r\n\r\n").utf8)
    }

    private func rejection(_ frame: HubFrame, file: StaticString = #filePath, line: UInt = #line) -> HubResponse? {
        guard case .reject(let response) = frame else {
            XCTFail("expected a rejection, got \(frame)", file: file, line: line)
            return nil
        }
        return response
    }

    /// Not refused: the framer is waiting for the body or already has the whole request.
    private func isAccepted(_ frame: HubFrame) -> Bool {
        if case .reject = frame { return false }
        return true
    }

    // ── framing ──────────────────────────────────────────────────────────

    func testARequestArrivingOneByteAtATimeIsReassembled() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let body = Data("{\"deviceId\":\"d\"}".utf8)
        let wire = head(contentLength: body.count) + body
        var result: HubFrame = .needMore
        for byte in wire {
            XCTAssertEqual(result, .needMore)
            result = framer.feed(Data([byte]))
        }
        guard case .request(let request) = result else { return XCTFail("expected a request, got \(result)") }
        XCTAssertEqual(request.method, "PUT")
        XCTAssertEqual(request.path, "/v1/fragments/frag_1")
        XCTAssertEqual(request.bearerToken, token)
        XCTAssertEqual(request.body, body)
        XCTAssertNil(request.headers["authorization"], "the token travels as bearerToken, not as a header")
    }

    func testOnlyTheDeclaredBodyBytesAreTaken() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let wire = head(contentLength: 3) + Data("abcEXTRA".utf8)
        guard case .request(let request) = framer.feed(wire) else { return XCTFail("expected a request") }
        XCTAssertEqual(request.body, Data("abc".utf8))
    }

    func testABodylessGetNeedsNoContentLength() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        guard case .request(let request) = framer.feed(head("GET", "/v1/changes?cursor=3", contentLength: nil)) else {
            return XCTFail("expected a request")
        }
        XCTAssertEqual(request.path, "/v1/changes?cursor=3")
        XCTAssertNil(request.body)
    }

    func testAPutWithoutContentLengthIsRefusedNotTreatedAsEmpty() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let response = rejection(framer.feed(head(contentLength: nil)))
        XCTAssertEqual(response?.status, 400)
        XCTAssertEqual(response?.errorField(), "length required")
    }

    func testMalformedFramingIsRefused() throws {
        func raw(_ lines: String...) -> Data { Data((lines.joined(separator: "\r\n") + "\r\n\r\n").utf8) }
        let cases: [(String, Data, Int)] = [
            ("garbage request line", raw("NOT HTTP"), 400),
            ("relative target", raw("PUT frag HTTP/1.1", "Host: 127.0.0.1"), 400),
            ("header without a colon", raw("GET /health HTTP/1.1", "Host 127.0.0.1"), 400),
            ("non-numeric length", raw("PUT /v1/fragments/f HTTP/1.1", "Host: 127.0.0.1", "Content-Length: abc"), 400),
            ("negative length", raw("PUT /v1/fragments/f HTTP/1.1", "Host: 127.0.0.1", "Content-Length: -5"), 400),
            (
                "absurdly long length",
                raw("PUT /v1/fragments/f HTTP/1.1", "Host: 127.0.0.1", "Content-Length: 99999999999999999999"), 400
            ),
            ("chunked body", head(extra: ["Transfer-Encoding: chunked"], contentLength: nil), 501),
            ("conflicting lengths", head(extra: ["Content-Length: 9"], contentLength: 3), 400),
            ("conflicting hosts", head(extra: ["Host: localhost"]), 400),
        ]
        for (name, wire, status) in cases {
            var framer = HubRequestFramer(hub: try makeHub())
            XCTAssertEqual(rejection(framer.feed(wire))?.status, status, name)
        }
    }

    // ── size caps ────────────────────────────────────────────────────────

    func testAnEndlessHeaderIsCutOffAtTheCap() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        XCTAssertEqual(framer.feed(Data("PUT /v1/fragments/f HTTP/1.1\r\n".utf8)), .needMore)
        var response: HubResponse?
        // Never a terminator: the connection must be answered once the cap is passed, not buffer forever.
        for _ in 0..<64 {
            if case .reject(let rejected) = framer.feed(Data(repeating: UInt8(ascii: "x"), count: 1024)) {
                response = rejected
                break
            }
        }
        XCTAssertEqual(response?.status, 431)
        XCTAssertLessThanOrEqual(framer.bufferedByteCount, HubRequestFramer.maxHeaderBytes + 1024)
    }

    func testAHugeHeaderBlockInOneChunkIsRefused() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let bloated = head(extra: ["X-Pad: " + String(repeating: "a", count: HubRequestFramer.maxHeaderBytes)])
        XCTAssertEqual(rejection(framer.feed(bloated))?.status, 431)
    }

    func testAnOversizedBodyIsRefusedFromTheHeaderWithoutReadingIt() throws {
        for (target, declared) in [
            ("/v1/fragments/frag_1", HubRequestFramer.maxJSONBodyBytes + 1),
            ("/v1/assets/asset_1", MAX_IMAGE_BYTES + 1),
            ("/v1/events", HubRequestFramer.maxJSONBodyBytes + 1),
        ] {
            var framer = HubRequestFramer(hub: try makeHub())
            // Only the header is fed: the verdict must not wait for the declared body.
            let response = rejection(framer.feed(head("PUT", target, contentLength: declared)))
            XCTAssertEqual(response?.status, 413, target)
        }
    }

    func testTheLimitItselfIsAccepted() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        XCTAssertEqual(framer.feed(head("PUT", "/v1/assets/asset_1", contentLength: MAX_IMAGE_BYTES)), .needMore)
    }

    func testRoutesWithoutABodyAcceptOnlyATinyOne() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let response = rejection(framer.feed(head("GET", "/v1/changes", contentLength: 1 << 20)))
        XCTAssertEqual(response?.status, 413)
    }

    // ── who may talk to the hub ──────────────────────────────────────────

    func testTheTokenIsCheckedBeforeTheBodyIsRead() throws {
        for authorization in [nil, "Bearer wrong-token", "Basic abc", "Bearer ", "bearer pair-token-1x"] {
            var framer = HubRequestFramer(hub: try makeHub())
            let response = rejection(
                framer.feed(head("PUT", "/v1/assets/a", authorization: authorization, contentLength: MAX_IMAGE_BYTES)))
            XCTAssertEqual(response?.status, 401, "\(authorization ?? "no header")")
        }
    }

    func testAnUnauthenticatedHugeUploadGetsA401NotA413() throws {
        var framer = HubRequestFramer(hub: try makeHub())
        let response = rejection(
            framer.feed(head("PUT", "/v1/assets/a", authorization: nil, contentLength: 99_999_999_999)))
        XCTAssertEqual(response?.status, 401, "size must not be revealed to a caller without the token")
    }

    func testPairingChecksTheCodeItselfAndHealthNeedsNoToken() throws {
        var pair = HubRequestFramer(hub: try makeHub())
        guard case .request = pair.feed(head("POST", "/v1/pair", authorization: nil, contentLength: nil)) else {
            return XCTFail("the pairing route answers its own 401")
        }
        var health = HubRequestFramer(hub: try makeHub())
        guard case .request = health.feed(head("GET", "/health", authorization: nil, contentLength: nil)) else {
            return XCTFail("health is public")
        }
    }

    func testOnlyLoopbackHostsAreServed() throws {
        for host in ["127.0.0.1:8765", "127.0.0.1", "localhost:8765", "LOCALHOST", "[::1]:8765", "[::1]"] {
            var framer = HubRequestFramer(hub: try makeHub())
            guard
                case .request = framer.feed(head("GET", "/health", host: host, authorization: nil, contentLength: nil))
            else { return XCTFail("\(host) should be served") }
        }
        // A DNS-rebinding page keeps its own hostname in Host even when it resolves to 127.0.0.1.
        for host in [
            "evil.example", "evil.example:8765", "127.0.0.1.evil.example", "localhost.evil.example:8765",
            "127.0.0.1:abc", "[::1", "",
            nil,
        ] {
            var framer = HubRequestFramer(hub: try makeHub())
            let response = rejection(
                framer.feed(head("GET", "/health", host: host, authorization: nil, contentLength: nil)))
            XCTAssertEqual(response?.status, 403, "\(host ?? "no Host")")
            XCTAssertEqual(response?.errorField(), "forbidden host")
        }
    }

    func testOnlyThePublishedExtensionAndNonBrowserClientsAreServed() throws {
        for origin in [
            "https://evil.example", "http://127.0.0.1:8765", "http://localhost", "null", "file://",
            "chrome-extension://", "chrome-extension://\(publishedId)/x",
            // Another extension, a look-alike id, and the right id with something appended.
            "chrome-extension://abcdefghijklmnopabcdefghijklmnop", "chrome-extension://\(publishedId)x",
            "chrome-extension://x\(publishedId)", "CHROME-EXTENSION://\(publishedId)",
        ] {
            var framer = HubRequestFramer(hub: try makeHub())
            let response = rejection(framer.feed(head(origin: origin)))
            XCTAssertEqual(response?.status, 403, origin)
            XCTAssertEqual(response?.errorField(), "forbidden origin")
        }
        for origin in [nil, "chrome-extension://\(publishedId)"] {
            var framer = HubRequestFramer(hub: try makeHub())
            XCTAssertTrue(isAccepted(framer.feed(head(origin: origin))), "\(origin ?? "no Origin")")
        }
    }

    func testTheHubIsPinnedToTheStoreIdByDefault() throws {
        XCTAssertEqual(DesktopHub.publishedExtensionIds, ["jpooljigbeplpgciohfjklgbfdfnnmfn"])
        let hub = DesktopHub(store: try freshStore(), pairToken: token)
        var framer = HubRequestFramer(hub: hub)
        XCTAssertEqual(rejection(framer.feed(head(origin: "chrome-extension://someotherextension")))?.status, 403)
    }

    func testAnEmptyAllowlistAdmitsNoBrowserExtensionAtAll() throws {
        let hub = try makeHub(allowedExtensionIds: [])
        var framer = HubRequestFramer(hub: hub)
        XCTAssertEqual(rejection(framer.feed(head(origin: "chrome-extension://\(publishedId)")))?.status, 403)
        var nonBrowser = HubRequestFramer(hub: hub)
        XCTAssertTrue(isAccepted(nonBrowser.feed(head(origin: nil))))
    }

    func testAnAdditionalIdCanBeAllowedExplicitly() throws {
        let hub = try makeHub(allowedExtensionIds: DesktopHub.publishedExtensionIds.union(["devbuildid"]))
        var dev = HubRequestFramer(hub: hub)
        XCTAssertTrue(isAccepted(dev.feed(head(origin: "chrome-extension://devbuildid"))))
        var published = HubRequestFramer(hub: hub)
        XCTAssertTrue(isAccepted(published.feed(head(origin: "chrome-extension://\(publishedId)"))))
    }

    func testRefusalsDoNotCountAsAnExtensionConnection() throws {
        let hub = try makeHub()
        var wrongHost = HubRequestFramer(hub: hub)
        _ = wrongHost.feed(head(host: "evil.example"))
        var wrongOrigin = HubRequestFramer(hub: hub)
        _ = wrongOrigin.feed(head(origin: "https://evil.example"))
        var wrongToken = HubRequestFramer(hub: hub)
        _ = wrongToken.feed(head(authorization: "Bearer nope"))
        XCTAssertNil(hub.lastConnectionAt)

        var authorized = HubRequestFramer(hub: hub)
        _ = authorized.feed(head("PUT", "/v1/fragments/f", contentLength: HubRequestFramer.maxJSONBodyBytes + 1))
        XCTAssertNotNil(hub.lastConnectionAt, "a 413 to the paired extension is still the extension talking")
    }

    func testRefusedUploadsStillShowOnTheSystemPage() throws {
        let hub = try makeHub()
        var framer = HubRequestFramer(hub: hub)
        _ = framer.feed(head("PUT", "/v1/assets/asset_big", contentLength: MAX_IMAGE_BYTES + 1))
        XCTAssertEqual(hub.recentDeliveries.last?.status, 413)
        XCTAssertEqual(hub.recentDeliveries.last?.path, "/v1/assets/asset_big")
    }

    func testResponsesNeverInviteOtherOrigins() throws {
        let hub = try makeHub()
        let response = hub.handle(HubRequest(method: "OPTIONS", path: "/v1/fragments/f", bearerToken: token))
        XCTAssertEqual(
            response.status, 404, "no CORS preflight is answered; the extension is exempt via host permissions")
    }

    func testTokenComparisonRejectsPrefixesAndSuffixes() throws {
        let hub = try makeHub()
        XCTAssertTrue(hub.isAuthorized(bearerToken: token))
        for guess in [nil, "", "p", String(token.dropLast()), token + "x", token.uppercased(), " " + token] {
            XCTAssertFalse(hub.isAuthorized(bearerToken: guess), "\(guess ?? "nil")")
        }
    }
}
