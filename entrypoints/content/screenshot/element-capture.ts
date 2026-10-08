/**
 * Element capture — docs/v2/screenshot.md: clone the
 * element into an offscreen capture surface and rasterize it with
 * html-to-image. Unlike viewport capture this can exceed the visible area.
 * Cross-origin images are inlined first via the background FETCH_IMAGE
 * message (host permissions bypass page CORS — the fetch html-to-image does
 * from page context cannot). The background only fetches public http(s) images;
 * an image it declines keeps its address and renders if the page can load it.
 */

import { toCanvas } from 'html-to-image'
import MessageUtils from '../../../utils/message'
import { anonymizeClone } from './anonymize'

export interface ElementCaptureOptions {
  anonymize?: boolean
}

function opaqueBackground(el: HTMLElement): string {
  let current: HTMLElement | null = el
  while (current) {
    const color = getComputedStyle(current).backgroundColor
    if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color
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
    if (options.anonymize) anonymizeClone(clone, doc)
    await inlineImages(surface)
    await doc.fonts?.ready.catch(() => undefined)

    try {
      return await toCanvas(surface, { backgroundColor: background, pixelRatio: 2 })
    } catch {
      // Font embedding is the usual failure (cross-origin stylesheets);
      // retry without it — system fallback fonts still render.
      return await toCanvas(surface, { backgroundColor: background, pixelRatio: 2, skipFonts: true })
    }
  } finally {
    surface.remove()
  }
}
