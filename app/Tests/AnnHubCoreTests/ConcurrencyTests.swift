// The Desktop UI (rating, deleting) and the hub (one connection per request,
// concurrently) share ONE SQLite connection. SQLite serializes single calls but
// not a BEGIN … COMMIT sequence: without the store's lock, a second thread's
// statements run inside the first thread's transaction and `BEGIN` fails with
// "cannot start a transaction within a transaction".

import Dispatch
import XCTest

@testable import AnnHubCore

final class ConcurrencyTests: XCTestCase {
    private func fileStore() throws -> (FragmentStore, cleanup: () -> Void) {
        let path = NSTemporaryDirectory() + "annhub-concurrency-\(UUID().uuidString).sqlite"
        let store = try FragmentStore(path: path, deviceId: "swift-device")
        return (
            store,
            {
                for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) }
            }
        )
    }

    /// Runs `work(thread)` on `threads` concurrent threads and returns every error they threw.
    private func hammer(threads: Int, _ work: @escaping @Sendable (Int) throws -> Void) -> [String] {
        let errors = NSLock()
        nonisolated(unsafe) var messages: [String] = []
        let group = DispatchGroup()
        let queue = DispatchQueue(label: "annhub.concurrency", attributes: .concurrent)
        for thread in 0..<threads {
            queue.async(group: group) {
                do { try work(thread) } catch {
                    errors.lock()
                    messages.append("\(error)")
                    errors.unlock()
                }
            }
        }
        group.wait()
        return messages
    }

    func testRatingsAndHubUpsertsRunTogetherWithoutErrorsOrLostWrites() throws {
        let (store, cleanup) = try fileStore()
        defer { cleanup() }
        for index in 0..<20 {
            try store.upsertFragment(makeFragment(id: "seed_\(index)"), deviceId: "d", payloadHash: "h")
        }

        let perThread = 100
        let errors = hammer(threads: 8) { thread in
            if thread % 2 == 0 {
                for index in 0..<perThread {
                    try store.rateFragment(id: "seed_\((index + thread) % 20)", rating: .good, usedHint: false)
                }
            } else {
                for index in 0..<perThread {
                    try store.upsertFragment(
                        makeFragment(id: "new_\(thread)_\(index)"), deviceId: "d", payloadHash: "h\(index)")
                }
            }
        }

        XCTAssertEqual(errors, [])
        let stored = try store.getFragments().filter { $0.id.hasPrefix("new_") }.count
        XCTAssertEqual(stored, 4 * perThread, "a hub upsert was lost")
        // 4 rating threads × perThread ratings: one log each, one change row each.
        XCTAssertEqual(try store.getReviewLogs().count, 4 * perThread)
        XCTAssertEqual(try store.changeLogCount(), 4 * perThread)
    }

    func testDeletingWhileRatingNeverResurrectsOrCorrupts() throws {
        let (store, cleanup) = try fileStore()
        defer { cleanup() }
        for index in 0..<40 {
            try store.upsertFragment(makeFragment(id: "frag_\(index)"), deviceId: "d", payloadHash: "h")
        }

        let errors = hammer(threads: 4) { thread in
            for index in 0..<40 {
                let id = "frag_\(index)"
                if thread % 2 == 0 {
                    try store.deleteFragment(id: id)
                } else {
                    // The fragment may already be gone; that is the only acceptable failure.
                    do { try store.rateFragment(id: id, rating: .good, usedHint: false) } catch StoreError.notFound {}
                }
            }
        }

        XCTAssertEqual(errors, [])
        XCTAssertEqual(try store.getFragments().count, 0)
        // A rating that lost the race must not leave a log behind for a deleted fragment.
        for index in 0..<40 { XCTAssertEqual(try store.reviewLogCount(fragmentId: "frag_\(index)"), 0) }
        XCTAssertEqual(try store.getLocalDeletions().count, 40)
    }

    func testConcurrentPutsOfOneRevisionCreateOnceAndTheRestConflict() throws {
        let (store, cleanup) = try fileStore()
        defer { cleanup() }
        let hub = DesktopHub(store: store, pairToken: "tok")

        // Same id and revision, a different payload per thread: exactly one may win (201);
        // every other delivery must see the winner and answer 409, never also 201.
        let statuses = NSLock()
        nonisolated(unsafe) var seen: [Int] = []
        let errors = hammer(threads: 16) { thread in
            let record = makeFragment(id: "frag_race", use: "variant \(thread)")
            let response = hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/fragments/frag_race", bearerToken: "tok",
                    body: try putFragmentBody(deviceId: "device_\(thread)", record: record)))
            statuses.lock()
            seen.append(response.status)
            statuses.unlock()
        }

        XCTAssertEqual(errors, [])
        XCTAssertEqual(seen.filter { $0 == 201 }.count, 1, "statuses: \(seen.sorted())")
        XCTAssertEqual(seen.filter { $0 == 409 }.count, 15, "statuses: \(seen.sorted())")
        XCTAssertEqual(try store.getFragments().count, 1)
    }

    func testConcurrentUploadsOfOneAssetIdStoreOnceAndTheRestConflict() throws {
        let (store, cleanup) = try fileStore()
        defer { cleanup() }
        let hub = DesktopHub(store: store, pairToken: "tok")

        let statuses = NSLock()
        nonisolated(unsafe) var seen: [Int] = []
        let errors = hammer(threads: 16) { thread in
            let bytes = Data("asset bytes \(thread)".utf8)
            let response = hub.handle(
                HubRequest(
                    method: "PUT", path: "/v1/assets/asset_race", bearerToken: "tok",
                    headers: [
                        "Content-Type": "image/png",
                        "X-AnnHub-Sha256": sha256Hex(bytes),
                        "X-AnnHub-Byte-Length": String(bytes.count),
                    ],
                    body: bytes))
            statuses.lock()
            seen.append(response.status)
            statuses.unlock()
        }

        XCTAssertEqual(errors, [])
        XCTAssertEqual(seen.filter { $0 == 201 }.count, 1, "statuses: \(seen.sorted())")
        XCTAssertEqual(seen.filter { $0 == 409 }.count, 15, "statuses: \(seen.sorted())")
        XCTAssertEqual(try store.stats().assets, 1)
    }
}
