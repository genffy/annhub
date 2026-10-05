/**
 * Toolbar popup content (extension.md §2.3). Pure so the visibility rules are
 * testable: the Desktop review block only exists when the extension is
 * connected AND Desktop review data has been pulled back (R3); otherwise the
 * whole block is absent — never an empty number or a red badge.
 */
import { connectionView, relativeTime, type Connection, type ConnectionState } from '../../utils/connection-status'
import { uiCount, uiText, type UiLanguage } from '../../utils/ui-text'

export interface PopupData {
  connection: Connection | null
  /** Epoch ms of the last successful Desktop → extension pull, when one happened. */
  lastPullAt?: number
  fragmentCount: number | null
  dueCount: number | null
  screenshotCount: number | null
}

export interface PopupViewModel {
  status: { state: ConnectionState; label: string } | null
  libraryCount: string | null
  screenshotCount: string | null
  desktopReview: { text: string; estimate: string; source: string } | null
}

/** Review sessions are estimated at 45 seconds per fragment (review.md §5). */
const SECONDS_PER_FRAGMENT = 45

export function popupViewModel(data: PopupData, now = Date.now(), lang?: UiLanguage): PopupViewModel {
  const { connection } = data
  const status = connection ? connectionView(connection, now, lang) : null
  const reviewDataReturned = !!connection && connection.paired && connection.online && !connection.lastError && data.lastPullAt !== undefined
  const due = data.dueCount ?? 0
  return {
    status,
    libraryCount: data.fragmentCount === null ? null : uiCount('popup.libraryCount', data.fragmentCount, {}, lang),
    screenshotCount: data.screenshotCount === null ? null : uiCount('popup.screenshotCount', data.screenshotCount, {}, lang),
    desktopReview:
      reviewDataReturned && due > 0
        ? {
            text: uiCount('popup.dueReviews', due, {}, lang),
            estimate: uiText('popup.estimate', { minutes: Math.ceil((due * SECONDS_PER_FRAGMENT) / 60) }, lang),
            source: uiText('popup.dataSource', { time: relativeTime(data.lastPullAt!, now, lang) }, lang),
          }
        : null,
  }
}
