/**
 * The screenshot session's entry — docs/product/screenshot.md: what starts, replaces, exits and
 * notifies a session. The session's own machinery is session.ts (RV-CAP-18).
 */

import { ScreenshotSession, currentSession, replaceSession } from './session'
import type { CaptureVia } from '../../../types/messages'
import type { ViewportRect } from './crop'
import type { BlockCandidate } from '../blocks'
import type { InkStroke } from '../annotation/ink'

export interface EnterScreenshotOptions {
  via?: CaptureVia
  /** The block capsule's target: skip selection, straight to element capture. */
  element?: HTMLElement
  /** A section target's interval inside `element` (RV-CAP-13): the frame is the interval's union rect and the clone keeps only its children. */
  section?: BlockCandidate['range']
  /** A pending frame to confirm (Enter) or adjust, e.g. the selection menu's screenshot path ). */
  initialRect?: ViewportRect
  /** Page-annotation ink at capture time (annotate.md §1.3): drawn back onto the capture as ordinary annotations. */
  ink?: InkStroke[]
  /** The annotation layer waits for the session to end so it can come back with its ink. */
  onExit?: () => void
}

export function enterScreenshotMode(options: EnterScreenshotOptions = {}): void {
  // Idempotent: a second trigger replaces the pending session. The replaced one hands its ink and its exit callback
  // over, so an annotation layer waiting on this session stays hidden until the session that replaces it ends.
  const previous = currentSession()
  const ink = options.ink ?? previous?.pendingInk ?? null
  const onExit = options.onExit ?? previous?.onSessionExit ?? null
  if (previous) previous.onSessionExit = null
  previous?.exit()
  const session = new ScreenshotSession(document, options.via ?? 'shortcut')
  replaceSession(session)
  session.pendingInk = ink
  session.onSessionExit = onExit
  session.begin()
  if (options.element) void session.captureElement(options.element, options.section)
  else if (options.initialRect) session.beginWithInitialRect(options.initialRect)
}

export function exitScreenshotMode(): void {
  currentSession()?.exit()
  replaceSession(null)
}

export function isScreenshotSessionActive(): boolean {
  return currentSession() !== null
}

/**
 * A notice for a session that is already open, from a trigger that must not
 * disturb it (annotate.md §1.1: an annotation request during a screenshot
 * session points at the session instead of opening anything). True when a
 * session was there to hear it.
 */
export function notifyScreenshotSession(message: string): boolean {
  const session = currentSession()
  if (!session) return false
  session.showExternalNotice(message)
  return true
}
