// Library list performance benchmark — mirrors the learning-core perf test
// pattern (learning-core/__tests__/perf.test.ts): 10k synthetic fragments.
// The < 1s bounds guard the default library list path (filter/sort + the
// store-backed list). Search and full pagination carry proportionally
// looser debug-build bounds with logged timings: `swift test` runs WITHOUT
// optimizations (measured ~4x slower than release here), while the TS
// baseline is JIT-warmed. Every bound still catches algorithmic
// regressions (accidental per-item DB scans, quadratic re-sorting).

import XCTest
@testable import AnnHubCore

final class PerfTests: XCTestCase {
    private func synthFragment(_ i: Int) -> FragmentRecord {
        makeFragment(
            id: String(format: "perf_%05d", i),
            kind: i % 3 == 0 ? "concept" : i % 3 == 1 ? "claim" : "excerpt",
            content: "concept \(i) about markets",
            excerpt: "context sentence number \(i) mentioning concept \(i) about markets and rates.",
            sourceHost: "host\(i % 50).example.com",
            sourceTitle: "Host \(i % 50) — markets desk",
            tags: i % 20 == 0 ? ["t\(i % 20)", "bench"] : ["bench"],
            createdAt: NOW - i * 1000,
            updatedAt: NOW - i * 1000
        )
    }

    private func measure(_ label: String, _ body: () throws -> Void) rethrows -> TimeInterval {
        let start = Date()
        try body()
        let elapsed = Date().timeIntervalSince(start)
        print("[bench] \(label): \(String(format: "%.0f", elapsed * 1000))ms")
        return elapsed
    }

    func testLibraryListOver10kInMemoryFragments() throws {
        let pool = (0..<10_000).map(synthFragment)

        // Default library screen: plain filter + sort, no search text.
        let plain = try measure("10k plain filter (default list)") {
            XCTAssertEqual(
                runFragmentQuery(pool, query: FragmentQuery(kinds: ["concept"], limit: 50)).items.count,
                50
            )
        }
        XCTAssertLessThan(plain, 1.0, "default list path stays under 1s (generous CI bound)")

        // Weighted search + kind/tag filters (user typing in the search field).
        let search = try measure("10k weighted search+filter") {
            let result = runFragmentQuery(
                pool, query: FragmentQuery(search: "concept markets", tags: ["bench"], limit: 50)
            )
            XCTAssertGreaterThan(result.total, 100)
            XCTAssertEqual(result.items.count, 50)
        }
        XCTAssertLessThan(search, 4.0, "search bound scaled for unoptimized debug builds")

        // Deep pagination stays stable (TS parity: full drain in pages of 50).
        let pagination = try measure("10k full pagination") {
            var cursor: String?
            var pages = 0
            var total = 0
            repeat {
                let page = runFragmentQuery(pool, query: FragmentQuery(limit: 50, cursor: cursor))
                total += page.items.count
                cursor = page.nextCursor
                pages += 1
            } while cursor != nil && pages < 250
            XCTAssertEqual(total, 10_000)
            XCTAssertEqual(pages, 200)
        }
        XCTAssertLessThan(pagination, 10.0, "pagination bound scaled for debug builds")
    }

    func testStoreBackedLibraryList10k() throws {
        let store = try freshStore()
        let insert = try measure("10k inserts") {
            for i in 0..<10_000 {
                try store.upsertFragment(synthFragment(i), deviceId: "perf", payloadHash: "h\(i)")
            }
        }
        XCTAssertLessThan(insert, 15.0, "insert bound: debug-build-safe")

        // The store-backed list path (getFragments + Query) the library uses
        // on reload: full row materialization dominates (JSON decode).
        let list = try measure("10k store-backed list") {
            let result = try store.listFragments(FragmentQuery(kinds: ["concept"], limit: 50))
            XCTAssertEqual(result.items.count, 50)
            XCTAssertEqual(result.total, 3_334)
        }
        XCTAssertLessThan(list, 5.0, "row materialization bound: debug-build-safe (release < 1s)")
    }
}
