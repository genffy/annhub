// Sync status (4A): offline / sync-pending / sync-error presentation.
// The App is local-first — the phases describe the OUTBOX, not availability
// of the local database (which always works offline).

import Foundation

public enum SyncPhase: String, Codable, Sendable {
    /// No sync endpoint configured — pure local mode (default).
    case localFirst
    /// Endpoint configured and events are queued awaiting flush.
    case pending
    /// Last flush failed; queue retained for retry with backoff.
    case syncError
    /// Endpoint configured and queue drained.
    case synced

    public var label: String {
        switch self {
        case .localFirst: return "本地优先（未配置同步端点）"
        case .pending: return "待同步"
        case .syncError: return "同步错误"
        case .synced: return "已同步"
        }
    }
}

public struct SyncStatus: Equatable, Sendable {
    public var phase: SyncPhase
    public var pendingEvents: Int
    public var lastError: String?
    public var deviceId: String
    public var endpointConfigured: Bool

    public init(phase: SyncPhase, pendingEvents: Int, lastError: String?, deviceId: String, endpointConfigured: Bool) {
        self.phase = phase
        self.pendingEvents = pendingEvents
        self.lastError = lastError
        self.deviceId = deviceId
        self.endpointConfigured = endpointConfigured
    }
}

/// Pure derivation so the UI never invents its own state machine.
public func deriveSyncPhase(pendingEvents: Int, lastError: String?, endpointConfigured: Bool) -> SyncPhase {
    if !endpointConfigured { return .localFirst }
    if let lastError, !lastError.isEmpty { return .syncError }
    if pendingEvents > 0 { return .pending }
    return .synced
}
