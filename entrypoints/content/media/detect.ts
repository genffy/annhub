/**
 * Media detection for media-clip capture (R4.2). Pure-ish helpers around the
 * page's <video>/<audio> elements: getters stay live so the modal can read
 * currentTime at click time and replay the marked range.
 */

export interface MediaTarget {
  key: string
  kind: 'video' | 'audio'
  /** Page-visible label source (aria-label, title attr, or track caption). */
  title?: string
  /** Live getters — reading them never mutates the element. */
  readonly currentTimeMs: number
  readonly durationMs: number
  /** Replay the marked range for 核验 (回放原文). */
  replay(startMs: number, endMs?: number): void
}

const isVisible = (el: HTMLElement): boolean => {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0 && el.tagName === 'VIDEO') return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

/** Detects captureable media on the page; empty array when none. */
export function detectMediaTargets(doc: Document = document): MediaTarget[] {
  const elements = Array.from(doc.querySelectorAll('video, audio')) as Array<HTMLVideoElement | HTMLAudioElement>
  return elements
    .filter(el => isVisible(el))
    .filter(el => {
      // Skip non-playable stubs (no source and no duration).
      const hasSource = el.querySelectorAll('source').length > 0 || el.src.length > 0
      return hasSource || Number.isFinite(el.duration)
    })
    .map((el, index) => ({
      key: `${el.tagName.toLowerCase()}-${index}`,
      kind: el.tagName.toLowerCase() === 'video' ? ('video' as const) : ('audio' as const),
      title: el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.querySelector('track')?.label ?? undefined,
      get currentTimeMs() {
        return el.currentTime * 1000
      },
      get durationMs() {
        return Number.isFinite(el.duration) ? el.duration * 1000 : 0
      },
      replay(startMs: number, endMs?: number) {
        try {
          el.currentTime = startMs / 1000
          void el.play().catch(() => {})
          if (endMs !== undefined) {
            const stop = () => {
              if (el.currentTime * 1000 >= endMs) {
                el.pause()
                el.removeEventListener('timeupdate', stop)
              }
            }
            el.addEventListener('timeupdate', stop)
          }
        } catch {
          /* replay is best-effort verification support */
        }
      },
    }))
}
