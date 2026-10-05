import XCTest
@testable import AnnHubCore

final class SyncStatusTests: XCTestCase {
    func testPhases() {
        XCTAssertEqual(deriveSyncPhase(pendingEvents: 7, lastError: nil, endpointConfigured: false), .localFirst)
        XCTAssertEqual(deriveSyncPhase(pendingEvents: 0, lastError: nil, endpointConfigured: true), .synced)
        XCTAssertEqual(deriveSyncPhase(pendingEvents: 3, lastError: nil, endpointConfigured: true), .pending)
        XCTAssertEqual(deriveSyncPhase(pendingEvents: 3, lastError: "HTTP 500", endpointConfigured: true), .syncError)
        XCTAssertEqual(deriveSyncPhase(pendingEvents: 0, lastError: "timeout", endpointConfigured: true), .syncError)
    }
}
