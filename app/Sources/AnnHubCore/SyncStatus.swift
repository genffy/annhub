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

    public func localizedLabel(_ lang: UILanguage) -> String {
        switch self {
        case .localFirst: return t(.syncLocalFirst, lang: lang)
        case .pending: return t(.syncPending, lang: lang)
        case .syncError: return t(.syncError, lang: lang)
        case .synced: return t(.syncSynced, lang: lang)
        }
    }

    public var label: String { localizedLabel(.current) }
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
