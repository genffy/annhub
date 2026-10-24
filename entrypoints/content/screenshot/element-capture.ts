/**
 * Element capture — docs/product/screenshot.md: clone the
 * element into an offscreen capture surface and rasterize it with
 * html-to-image. Unlike viewport capture this can exceed the visible area.
 * Cross-origin images are inlined first via the background FETCH_IMAGE
 * message (host permissions bypass page CORS — the fetch html-to-image does
 * from page context cannot). The background only fetches public http(s) images;
 * an image it declines keeps its address and renders if the page can load it.
 *
 * Two things a style-copying rasterizer cannot carry over from the live page
 * are restored by hand: the current frame of a `<video>` (a video element in
 * the serialized SVG has no frame, so it rasterizes as a black box — issue
 * #102) and scroll positions (they are not styles, so a scrolled carousel
 * would rasterize its first slide again — issue #103).
 */

import { toCanvas } from 'html-to-image'
import MessageUtils from '../../../utils/message'
import { anonymizeClone } from './anonymize'
import type { IdentityParts } from './detect'

export interface ElementCaptureOptions {
  /** The identity kinds to cover in the clone; absent means no anonymization. */
  anonymize?: IdentityParts
}

/** Alpha must be 1 for the color to work as the capture's own background. */
function isOpaqueColor(color: string): boolean {
  const m = color.match(/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (!m) return false
  return m[1] === undefined || parseFloat(m[1]) >= 1
}

function opaqueBackground(el: HTMLElement): string {
  let current: HTMLElement | null = el
  while (current) {
    const color = getComputedStyle(current).backgroundColor
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)' && isOpaqueColor(color)) return color
    current = current.parentElement
  }
  return 'rgb(255, 255, 255)'
}

async function inlineImages(surface: HTMLElement): Promise<void> {
  const images = Array.from(surface.querySelectorAll<HTMLImageElement>('img'))
  await Promise.all(
    images.map(async img => {
      const src = img.currentSrc || img.getAttribute('src')
      if (!src || src.startsWith('data:') || src.startsWith('blob:')) return
      try {
        const response = await MessageUtils.sendMessage<{ dataUrl: string }>({
          type: 'FETCH_IMAGE',
          url: src,
        })
        if (response.success && response.data?.dataUrl) {
          img.src = response.data.dataUrl
          img.removeAttribute('srcset')
          await img.decode().catch(() => undefined)
        }
      } catch {
        // Keep the original src; html-to-image may still render or drop it.
      }
    }),
  )
}

/**
 * Rasterize `element` to a canvas. The clone lives in an offscreen surface
 * (fixed, far left) for the duration of the rasterization only.
 */
export async function captureElement(element: HTMLElement, options: ElementCaptureOptions = {}): Promise<HTMLCanvasElement> {
  const doc = element.ownerDocument
  const rect = element.getBoundingClientRect()
  const width = Math.round(Math.min(1200, Math.max(200, rect.width)))

  const surface = doc.createElement('div')
  surface.setAttribute('data-ann-ui', 'screenshot-element-surface')
  surface.style.position = 'fixed'
  surface.style.left = '-10000px'
  surface.style.top = '0'
  surface.style.width = `${width}px`
  const background = opaqueBackground(element)
  surface.style.background = background

  const clone = doc.importNode(element, true) as HTMLElement
  clone.removeAttribute('id')
  surface.appendChild(clone)
  doc.body.appendChild(surface)

  try {
    restoreScrollPositions(element, clone)
    await snapshotVideos(element, clone)
    if (options.anonymize) anonymizeClone(clone, doc, options.anonymize)
    await inlineImages(surface)
    await doc.fonts?.ready.catch(() => undefined)

    // The surface lives offscreen, but html-to-image copies the root's computed
    // style (position/left) into the SVG, which would paint the content 10000px
    // outside the canvas. Override the root back to the canvas origin for the
    // rasterization only (真机走查 P1-2：元素截图全空白的原因).
    const rootStyle = { position: 'static', left: '0px', top: '0px' }
    try {
      return await toCanvas(surface, { backgroundColor: background, pixelRatio: 2, style: rootStyle })
    } catch {
      // Font embedding is the usual failure (cross-origin stylesheets);
      // retry without it — system fallback fonts still render.
      return await toCanvas(surface, { backgroundColor: background, pixelRatio: 2, style: rootStyle, skipFonts: true })
    }
  } finally {
    surface.remove()
  }
}

/**
 * Scroll positions are not styles, so html-to-image's style copy drops them: a
 * scrolled carousel rasterizes its first slide again (issue #103). Worse, the
 * foreignObject rendering does not clip nested overflow boxes — whatever sits
 * outside a scroller's window still paints, next to the carousel instead of
 * inside it (the "uncropped slides" in issue #103). So the scrolled view is
 * rebuilt by hand: boxes fully outside the scrolled window are hidden (not
 * removed — removal would re-pack the rest), boxes fully inside are translated
 * to their scrolled position, and a box straddling the window edge recurses
 * into its children. Transforms (unlike margins) do not reflow siblings, and
 * all boxes are measured before anything is mutated.
 */
export function restoreScrollPositions(element: Element, clone: Element): void {
  const view = element.ownerDocument?.defaultView
  if (view && element instanceof HTMLElement && clone instanceof HTMLElement) {
    const scrollableX = element.scrollWidth - element.clientWidth > 1 && element.scrollLeft > 0
    const scrollableY = element.scrollHeight - element.clientHeight > 1 && element.scrollTop > 0
    if (scrollableX || scrollableY) {
      const style = view.getComputedStyle(clone)
      const base = clone.getBoundingClientRect()
      const originX = base.left + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingLeft) || 0)
      const originY = base.top + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0)
      fitToScrolledWindow(clone, view, originX, originY, scrollableX ? element.scrollLeft : 0, scrollableY ? element.scrollTop : 0, element.clientWidth, element.clientHeight)
    }
  }
  const originals = element.children
  const copies = clone.children
  for (let i = 0; i < originals.length && i < copies.length; i++) restoreScrollPositions(originals[i]!, copies[i]!)
}

/** One level of the rebuild described in restoreScrollPositions; `origin*` is the scroller's content origin in viewport space. */
function fitToScrolledWindow(box: HTMLElement, view: Window, originX: number, originY: number, sx: number, sy: number, windowWidth: number, windowHeight: number): void {
  const level = (Array.from(box.children) as HTMLElement[]).map(child => ({ child, rect: child.getBoundingClientRect() }))
  for (const { child, rect } of level) {
    if (rect.width <= 0 && rect.height <= 0) continue
    const left = rect.left - originX
    const top = rect.top - originY
    const outsideX = sx > 0 && (left + rect.width <= sx + 1 || left >= sx + windowWidth - 1)
    const outsideY = sy > 0 && (top + rect.height <= sy + 1 || top >= sy + windowHeight - 1)
    if (outsideX || outsideY) {
      // hidden, not removed: taking it out of flow would re-pack the remaining
      // children and invalidate the positions they were measured at
      child.style.visibility = 'hidden'
      continue
    }
    const insideX = sx <= 0 || (left >= sx - 0.5 && left + rect.width <= sx + windowWidth + 0.5)
    const insideY = sy <= 0 || (top >= sy - 0.5 && top + rect.height <= sy + windowHeight + 0.5)
    if ((insideX && insideY) || child.children.length === 0) {
      // fully inside, or a leaf straddling the edge: translate to the scrolled
      // position (a straddling leaf's out-of-window part may bleed, since the
      // rasterizer clips nothing; the visible content lands correctly)
      const dx = sx > 0 ? -sx : 0
      const dy = sy > 0 ? -sy : 0
      if (dx !== 0 || dy !== 0) {
        const current = view.getComputedStyle(child).transform
        child.style.transform = current && current !== 'none' ? `translate(${dx}px, ${dy}px) ${current}` : `translate(${dx}px, ${dy}px)`
      }
      continue
    }
    // a straddling wrapper: its children decide what stays visible
    fitToScrolledWindow(child, view, originX, originY, sx, sy, windowWidth, windowHeight)
  }
}

/**
 * Replace every `<video>` in the clone with an `<img>` of its current frame,
 * read from the live video before anything else mutates the page (issue #102:
 * a serialized `<video>` has no frame and rasterizes black).
 */
async function snapshotVideos(element: HTMLElement, clone: HTMLElement): Promise<void> {
  const videos = Array.from(element.querySelectorAll('video'))
  if (videos.length === 0) return
  const copies = Array.from(clone.querySelectorAll('video'))
  if (copies.length !== videos.length) return
  await Promise.all(
    videos.map(async (video, index) => {
      const copy = copies[index]!
      const frame = await currentVideoFrame(video)
      if (!frame) return
      const view = copy.ownerDocument!.defaultView!
      const img = copy.ownerDocument!.createElement('img')
      img.src = frame
      img.alt = copy.getAttribute('alt') ?? ''
      // freeze the video's laid-out box onto the replacement so the
      // surrounding clone cannot reflow around a different intrinsic size
      const box = copy.getBoundingClientRect()
      if (box.width > 0) img.style.width = `${box.width}px`
      if (box.height > 0) img.style.height = `${box.height}px`
      img.style.objectFit = 'contain'
      img.style.borderRadius = view.getComputedStyle(copy).borderRadius
      copy.replaceWith(img)
    }),
  )
}

/** The video's current frame as a data URL, or null when no frame can be read. */
async function currentVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null
  try {
    // A CORS-clean video (same-origin, data URL, or served with CORS headers)
    // can be drawn and read back directly.
    const canvas = video.ownerDocument!.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    // A protected video (X serves these) taints the canvas: readback throws.
  }
  return await cropFrameFromViewport(video)
}

/**
 * Fallback for tainted videos: `captureVisibleTab` photographs the screen, so
 * the visible part of the video's box can be cropped from it. The capture is
 * extension-made and never tainted, but it does include whatever is on screen —
 * the extension's own UI is hidden for the two frames it takes.
 */
async function cropFrameFromViewport(video: HTMLVideoElement): Promise<string | null> {
  const doc = video.ownerDocument!
  const view = doc.defaultView!
  const box = video.getBoundingClientRect()
  const left = Math.max(0, box.left)
  const top = Math.max(0, box.top)
  const right = Math.min(view.innerWidth, box.right)
  const bottom = Math.min(view.innerHeight, box.bottom)
  if (right - left < 2 || bottom - top < 2) return null

  const hidden = Array.from(doc.querySelectorAll<HTMLElement>('[data-ann-ui]'))
  const restore = hidden.map(el => [el, el.style.visibility] as const)
  for (const el of hidden) el.style.visibility = 'hidden'
  await nextTwoFrames(view)
  try {
    let dataUrl: string | undefined
    for (let retry = 0; retry < 3; retry++) {
      const response = await MessageUtils.sendMessage<{ dataUrl: string }>({ type: 'CAPTURE_VISIBLE_TAB', requestId: `video-${retry}-${Date.now()}` })
      if (response.success && response.data?.dataUrl) {
        dataUrl = response.data.dataUrl
        break
      }
      if (response.error !== 'CAPTURE_RATE_LIMITED') return null
      await new Promise(resolve => setTimeout(resolve, 400))
    }
    if (!dataUrl) return null
    const shot = new Image()
    await new Promise<void>((resolve, reject) => {
      shot.onload = () => resolve()
      shot.onerror = () => reject(new Error('capture decode failed'))
      shot.src = dataUrl!
    })
    const scale = shot.naturalWidth / view.innerWidth
    const sx = left * scale
    const sy = top * scale
    const sw = (right - left) * scale
    const sh = (bottom - top) * scale
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(2, Math.round(sw))
    canvas.height = Math.max(2, Math.round(sh))
    canvas.getContext('2d')!.drawImage(shot, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    return null
  } finally {
    for (const [el, visibility] of restore) el.style.visibility = visibility
  }
}

function nextTwoFrames(view: Window): Promise<void> {
  return new Promise(resolve =>
    view.requestAnimationFrame(() => {
      view.requestAnimationFrame(() => resolve())
    }),
  )
}
