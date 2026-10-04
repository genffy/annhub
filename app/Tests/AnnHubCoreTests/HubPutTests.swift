// DesktopHub R1 per-item delivery endpoints (storage.md §8): pairing,
// PUT /v1/fragments/{id} revision/hash semantics, PUT /v1/assets/{id}
// header validation, and the full fixture rejection matrix.

import XCTest
@testable import AnnHubCore

final class HubPutTests: XCTestCase {
    let token = "pair-token-1"

    private func makeHub(store: FragmentStore? = nil, token: String? = "pair-token-1") throws -> DesktopHub {
        DesktopHub(store: try store ?? freshStore(), pairToken: token)
    }

    private func putFragment(
        _ hub: DesktopHub, record: FragmentRecord, deviceId: String = "device_1",
        urlId: String? = nil, authorized: Bool = true
    ) throws -> HubResponse {
        hub.handle(
            HubRequest(
                method: "PUT",
                path: "/v1/fragments/\(urlId ?? record.id)",
                bearerToken: authorized ? token : nil,
                body: try putFragmentBody(deviceId: deviceId, record: record)
            ))
    }

    // ── health & pairing ─────────────────────────────────────────────────

    func testHealthWithoutAuth() throws {
        let hub = try makeHub(token: nil)
        let response = hub.handle(HubRequest(method: "GET", path: "/health"))
        XCTAssertEqual(response.status, 200)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any]
        )
        XCTAssertEqual(object["status"] as? String, "ok")
        XCTAssertEqual(object["version"] as? Int, 2)
        XCTAssertEqual(object["apiVersion"] as? String, "fragment-put-v1")
        XCTAssertEqual(object["deviceId"] as? String, "swift-device")
        XCTAssertEqual(object["paired"] as? Bool, false)
    }

    func testHubGeneratesPairTokenWhenNoneIsStored() throws {
        let hub = try makeHub(token: nil)
        XCTAssertFalse(hub.pairToken.isEmpty)
        // 16 characters in four dash-separated groups, no look-alike glyphs.
        let groups = hub.pairToken.split(separator: "-")
        XCTAssertEqual(groups.count, 4)
        XCTAssertTrue(groups.allSatisfy { $0.count == 4 })
        XCTAssertNil(hub.pairToken.firstIndex(where: { "01OIL".contains($0) }))
        XCTAssertNotEqual(DesktopHub.generatePairToken(), DesktopHub.generatePairToken())

        // An empty persisted value is treated as "none stored".
        XCTAssertFalse(try makeHub(token: "").pairToken.isEmpty)
        // A persisted value is restored verbatim.
        XCTAssertEqual(try makeHub(token: "KEEP-THIS-CODE-1234").pairToken, "KEEP-THIS-CODE-1234")
    }

    func testPairValidatesTheGeneratedTokenAndNeverAdoptsOne() throws {
        let hub = try makeHub(token: "GOOD-CODE")
        // No token → 401.
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/pair")).status, 401)
        // A client-supplied token is rejected, and does not replace Desktop's.
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/pair", bearerToken: "t-other")).status, 401)
        XCTAssertEqual(hub.pairToken, "GOOD-CODE")
        XCTAssertNil(hub.lastPairedAt)
        XCTAssertNil(hub.lastConnectionAt)  // a rejected token is not a connection

        let ok = hub.handle(HubRequest(method: "POST", path: "/v1/pair", bearerToken: "GOOD-CODE"))
        XCTAssertEqual(ok.status, 200)
        XCTAssertNotNil(hub.lastPairedAt)
        XCTAssertNotNil(hub.lastConnectionAt)

        let health = hub.handle(HubRequest(method: "GET", path: "/health"))
        let object = try XCTUnwrap((try? JSONSerialization.jsonObject(with: health.body)) as? [String: Any])
        XCTAssertEqual(object["paired"] as? Bool, true)
    }

    func testRotatingTheTokenInvalidatesOldClientsAndKeepsData() throws {
        let store = try freshStore()
        let hub = try makeHub(store: store)
        let record = makeFragment(id: "frag_rotate")
        XCTAssertEqual(try putFragment(hub, record: record).status, 201)
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/pair", bearerToken: token)).status, 200)

        let fresh = hub.rotatePairToken()
        XCTAssertNotEqual(fresh, token)
        XCTAssertEqual(hub.pairToken, fresh)
        XCTAssertNil(hub.lastPairedAt)

        // The old code is rejected everywhere; the new one works.
        XCTAssertEqual(try putFragment(hub, record: record).status, 401)
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/pair", bearerToken: token)).status, 401)
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/pair", bearerToken: fresh)).status, 200)

        // Local data stays.
        XCTAssertNotNil(try store.getFragment(id: "frag_rotate"))
    }

    // ── PUT /v1/fragments/{id} ───────────────────────────────────────────

    func testFirstPutReturns201AndInitializesReview() throws {
        let store = try freshStore()
        let hub = try makeHub(store: store)
        let record = makeFragment(id: "frag_put_1")
        let response = try putFragment(hub, record: record)
        XCTAssertEqual(response.status, 201)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any]
        )
        XCTAssertEqual(object["id"] as? String, "frag_put_1")
        XCTAssertEqual(object["revision"] as? Int, 1)
        let hash = try XCTUnwrap(object["hash"] as? String)
        XCTAssertEqual(hash, fragmentWireHash(toFragmentWire(record)))

        let stored = try XCTUnwrap(store.getFragment(id: "frag_put_1"))
        XCTAssertEqual(stored.review.state, .new)  // initialized fresh review
        XCTAssertEqual(stored.review.easeFactor, 2.5)
        let delivery = try XCTUnwrap(store.fragmentDelivery(id: "frag_put_1"))
        XCTAssertEqual(delivery.deviceId, "device_1")
        XCTAssertEqual(delivery.payloadHash, hash)
    }

    func testDuplicateSameRevisionAndHashIsIdempotent200() throws {
        let hub = try makeHub()
        let record = makeFragment(id: "frag_dup")
        XCTAssertEqual(try putFragment(hub, record: record).status, 201)
        let again = try putFragment(hub, record: record)
        XCTAssertEqual(again.status, 200)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: again.body)) as? [String: Any]
        )
        XCTAssertEqual(object["applied"] as? Bool, false)
        XCTAssertEqual(object["revision"] as? Int, 1)
    }

    func testOlderRevisionReturns200WithCurrentRevision() throws {
        let hub = try makeHub()
        var rev2 = makeFragment(id: "frag_rev")
        rev2.captureRevision = 2
        rev2.content = "hawkish pivot confirmed"
        rev2.normalizedContent = normalizeContent(rev2.content)
        rev2.context.excerpt = "The Fed signalled a hawkish pivot confirmed by officials."
        XCTAssertEqual(try putFragment(hub, record: rev2).status, 201)

        let stale = makeFragment(id: "frag_rev")  // revision 1
        let response = try putFragment(hub, record: stale)
        XCTAssertEqual(response.status, 200)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any]
        )
        XCTAssertEqual(object["applied"] as? Bool, false)
        XCTAssertEqual(object["currentRevision"] as? Int, 2)
        XCTAssertEqual(object["revision"] as? Int, 2)
    }

    func testSameRevisionDifferentHashConflicts409() throws {
        let hub = try makeHub()
        XCTAssertEqual(try putFragment(hub, record: makeFragment(id: "frag_conf")).status, 201)

        var variant = makeFragment(id: "frag_conf")
        variant.content = "hawkish pivot edited"
        variant.normalizedContent = normalizeContent(variant.content)
        variant.context.excerpt = "The Fed signalled a hawkish pivot edited after publication."
        let response = try putFragment(hub, record: variant)
        XCTAssertEqual(response.status, 409)
        XCTAssertEqual(response.errorField(), "conflict")
    }

    func testGreaterRevisionAppliesCaptureFieldsOnlyAndPreservesReview() throws {
        let store = try freshStore()
        let hub = try makeHub(store: store)
        XCTAssertEqual(try putFragment(hub, record: makeFragment(id: "frag_keep")).status, 201)

        // Desktop rates the fragment.
        _ = try store.rateFragment(id: "frag_keep", rating: .good, usedHint: false, now: NOW + 5000)

        var rev2 = makeFragment(id: "frag_keep")
        rev2.captureRevision = 2
        rev2.content = "hawkish pivot v2"
        rev2.normalizedContent = normalizeContent(rev2.content)
        rev2.context.excerpt = "The Fed signalled a hawkish pivot v2 in the second take."
        let response = try putFragment(hub, record: rev2)
        XCTAssertEqual(response.status, 200)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: response.body)) as? [String: Any]
        )
        XCTAssertEqual(object["applied"] as? Bool, true)
        XCTAssertEqual(object["revision"] as? Int, 2)

        let stored = try XCTUnwrap(store.getFragment(id: "frag_keep"))
        XCTAssertEqual(stored.content, "hawkish pivot v2")  // capture fields replaced
        XCTAssertEqual(stored.captureRevision, 2)
        XCTAssertEqual(stored.review.repetitions, 1)  // review NEVER overwritten
        XCTAssertEqual(stored.review.state, .review)
    }

    func testRejectionFixtureCasesYieldExpectedCodes() throws {
        let hub = try makeHub()
        let rejections = try JSONDecoder().decode(
            RejectionsFixture.self, from: fixtureData("fragment-put-rejections.json")
        )
        XCTAssertGreaterThanOrEqual(rejections.cases.count, 6)
        for testCase in rejections.cases {
            let body = try putFragmentBody(deviceId: testCase.body.deviceId, fragment: testCase.body.fragment)
            let urlId = testCase.body.fragment.objectValue?["id"]?.stringValue ?? "unknown"
            let response = hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/fragments/\(urlId)",
                    bearerToken: token, body: body
                ))
            XCTAssertEqual(response.status, 422, "case \(testCase.name)")
            XCTAssertEqual(response.errorField(), testCase.expectedCode, "case \(testCase.name)")
        }
    }

    func testDeletedIdReturns410() throws {
        let store = try freshStore()
        let hub = try makeHub(store: store)
        let record = makeFragment(id: "frag_gone")
        XCTAssertEqual(try putFragment(hub, record: record).status, 201)
        try store.deleteFragment(id: "frag_gone", now: NOW)
        XCTAssertEqual(try putFragment(hub, record: record).status, 410)
        // Not resurrected even at a higher revision.
        var rev2 = record
        rev2.captureRevision = 2
        XCTAssertEqual(try putFragment(hub, record: rev2).status, 410)
    }

    func testURLBodyIdMismatch422() throws {
        let hub = try makeHub()
        let record = makeFragment(id: "frag_a")
        let response = try putFragment(hub, record: record, urlId: "frag_b")
        XCTAssertEqual(response.status, 422)
        XCTAssertEqual(response.errorField(), "ID_MISMATCH")
    }

    func testUnauthorized401() throws {
        let hub = try makeHub()
        let record = makeFragment(id: "frag_auth")
        let response = try putFragment(hub, record: record, authorized: false)
        XCTAssertEqual(response.status, 401)
        XCTAssertEqual(response.errorField(), "unauthorized")
        XCTAssertNil(try hub.store.getFragment(id: "frag_auth"))
    }

    func testRemovedBulkEndpointsAre404() throws {
        let hub = try makeHub()
        // R3 replaced the removed bulk JSON paths: /v1/events (POST) and
        // /v1/changes (GET) are live; import/export stay gone.
        for path in ["/v1/import", "/v1/export", "/v1/unknown"] {
            XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: path, bearerToken: token)).status, 404, path)
            XCTAssertEqual(hub.handle(HubRequest(method: "GET", path: path, bearerToken: token)).status, 404, path)
        }
        // Wrong method on the live R3 endpoints still 404s.
        XCTAssertEqual(hub.handle(HubRequest(method: "GET", path: "/v1/events", bearerToken: token)).status, 404)
        XCTAssertEqual(hub.handle(HubRequest(method: "POST", path: "/v1/changes", bearerToken: token)).status, 404)
    }

    // ── PUT /v1/assets/{id} ──────────────────────────────────────────────

    private func putAsset(
        _ hub: DesktopHub, id: String, bytes: Data, sha: String,
        byteLength: Int? = nil, mime: String = "image/png", authorized: Bool = true
    ) -> HubResponse {
        hub.handle(
            HubRequest(
                method: "PUT",
                path: "/v1/assets/\(id)",
                bearerToken: authorized ? token : nil,
                headers: [
                    "Content-Type": mime,
                    "X-AnnHub-Sha256": sha,
                    "X-AnnHub-Byte-Length": String(byteLength ?? bytes.count),
                ],
                body: bytes
            ))
    }

    func testAssetPutLifecycle() throws {
        let store = try freshStore()
        let hub = try makeHub(store: store)
        let meta = try JSONDecoder().decode(AssetMetaFixture.self, from: fixtureData("asset-meta.json"))
        let bytes = try fixtureData("asset.png")
        XCTAssertEqual(sha256Hex(bytes), meta.sha256)  // fixture vector

        // New asset → 201.
        let created = putAsset(hub, id: "asset_fix1", bytes: bytes, sha: meta.sha256)
        XCTAssertEqual(created.status, 201)
        let object = try XCTUnwrap(
            (try? JSONSerialization.jsonObject(with: created.body)) as? [String: Any]
        )
        XCTAssertEqual(object["id"] as? String, "asset_fix1")
        XCTAssertEqual(object["byteLength"] as? Int, meta.byteLength)
        XCTAssertEqual(object["sha256"] as? String, meta.sha256)
        XCTAssertEqual(try store.getAsset(id: "asset_fix1")?.bytes, bytes)

        // Same id + same sha → 200 idempotent.
        XCTAssertEqual(putAsset(hub, id: "asset_fix1", bytes: bytes, sha: meta.sha256).status, 200)

        // Same id + different bytes (correct headers) → 409.
        var mutated = bytes
        mutated[5] ^= 0x55
        XCTAssertEqual(putAsset(hub, id: "asset_fix1", bytes: mutated, sha: sha256Hex(mutated)).status, 409)

        // Undecodable junk header → 422.
        XCTAssertEqual(
            hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/assets/asset_fix2", bearerToken: token,
                    headers: ["X-AnnHub-Sha256": meta.sha256, "X-AnnHub-Byte-Length": "abc"],
                    body: bytes
                )
            ).status, 422
        )
    }

    func testAssetOversize413() throws {
        let hub = try makeHub()
        let bytes = Data(repeating: 0x00, count: MAX_IMAGE_BYTES + 1)
        let response = putAsset(hub, id: "asset_big", bytes: bytes, sha: sha256Hex(bytes))
        XCTAssertEqual(response.status, 413)
    }

    func testAssetHeaderMismatches422() throws {
        let hub = try makeHub()
        let bytes = try fixtureData("asset.png")

        // Wrong sha → 422.
        XCTAssertEqual(putAsset(hub, id: "asset_s", bytes: bytes, sha: sha256Hex(Data("x".utf8))).status, 422)
        // Wrong declared length → 422.
        let badLength = putAsset(
            hub, id: "asset_s", bytes: bytes, sha: sha256Hex(bytes), byteLength: bytes.count + 1
        )
        XCTAssertEqual(badLength.status, 422)
        // Unsupported mime → 422.
        XCTAssertEqual(putAsset(hub, id: "asset_s", bytes: bytes, sha: sha256Hex(bytes), mime: "image/gif").status, 422)
        // Empty body → 422.
        XCTAssertEqual(putAsset(hub, id: "asset_s", bytes: Data(), sha: sha256Hex(Data())).status, 422)
        // Unauthorized → 401.
        let unauth = hub.handle(
            HubRequest(
                method: "PUT", path: "/v1/assets/asset_s",
                headers: [
                    "Content-Type": "image/png",
                    "X-AnnHub-Sha256": sha256Hex(bytes),
                    "X-AnnHub-Byte-Length": String(bytes.count),
                ],
                body: bytes
            ))
        XCTAssertEqual(unauth.status, 401)
    }
}
