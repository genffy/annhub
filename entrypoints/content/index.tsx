/**
 * Content script entry — the page-side capture surface (docs/v2/capture.md,
 * extension.md §2.1, §3). Everything it renders is an overlay of the
 * extension's own; the page itself is never modified and keeps no mark.
 *
 * Surfaces: the two-action selection menu, the block-clip hover entry and
 * keyboard block mode, the screenshot session, and the clip toast with
 * undo and quick edit.
 */
import { BlockEntries } from './block-hover'
import type { BlockCandidate } from './blocks'
import { isClipFailure, saveBlockClip, savePlainTextSelection, saveSelectionClip, showClipToast, showFailureToast, type ClipOrigin } from './clip-flow'
import { SelectionMenu, plainTextForSelection, selectableRange } from './selection-menu'
import { enterScreenshotMode } from './screenshot'
import { isUserInput } from './user-input'
import { normalizeHost } from '../../learning-core/normalize'
import MessageUtils from '../../utils/message'
import { Logger } from '../../utils/logger'
import { newEntryId } from '../../learning-core/assets'
import './content.css'

let selectionMenu: SelectionMenu | null = null
let blockEntries: BlockEntries | null = null
let lastRange: Range | null = null
let lastPlainText: string | undefined
let lastShadowRoot: ShadowRoot | undefined

function isTopFrame(): boolean {
  return window.top === window
}

function insideOwnUi(event: Event): boolean {
  const path = event.composedPath() as HTMLElement[]
  return path.some(el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui'))
}

async function triggerSelectionClip(origin: ClipOrigin, id = newEntryId()): Promise<void> {
  const range = lastRange
  if (!range) return
  const plainText = lastPlainText
  const outcome = plainText ? await savePlainTextSelection(plainText, origin, id) : await saveSelectionClip(range, origin, id)
  selectionMenu?.dismiss()
  document.getSelection()?.removeAllRanges()
  if (!isClipFailure(outcome)) {
    showClipToast(outcome, range)
  } else {
    // failure keeps the selection so the retry has the same material (extension.md §6)
    document.getSelection()?.addRange(range)
    showFailureToast(() => void triggerSelectionClip(origin, id), outcome)
  }
}

function wireSelectionMenu(): void {
  selectionMenu = new SelectionMenu(document, {
    onClip: () => void triggerSelectionClip({ via: 'menu' }),
    // The screenshot session, its coordinates and the captured tab all belong to the top frame's
    // viewport; a same-origin child frame offers clipping only (D-29).
    ...(isTopFrame()
      ? {
          onScreenshot: () => {
            selectionMenu?.dismiss()
            document.getSelection()?.removeAllRanges()
            enterScreenshotMode({ via: 'menu' })
          },
        }
      : {}),
  })

  const onPointerUp = (event: PointerEvent): void => {
    if (!isUserInput(event)) return
    if (insideOwnUi(event)) return
    // let the selection settle before reading it
    window.setTimeout(() => {
      const path = event.composedPath()
      const shadowRoot =
        (path.find(node => node instanceof ShadowRoot) as ShadowRoot | undefined) ??
        (path.find(node => node instanceof Element && node.shadowRoot) as Element | undefined)?.shadowRoot ??
        undefined
      lastShadowRoot = shadowRoot
      const range = selectableRange(document, shadowRoot)
      if (!range) {
        if (!blockEntries?.isBlockModeActive()) selectionMenu?.dismiss()
        return
      }
      lastRange = range.cloneRange()
      lastPlainText = plainTextForSelection(range)
      selectionMenu?.show(range)
    }, 10)
  }

  // Keyboard selections (Shift + arrows) settle on selectionchange: the menu
  // appears when the selection is complete, with no minimum length
  // (extension.md §2.1); Tab and Enter drive it.
  let selectionSettleTimer: number | null = null
  const onSelectionChange = (): void => {
    if (selectionSettleTimer !== null) window.clearTimeout(selectionSettleTimer)
    selectionSettleTimer = window.setTimeout(() => {
      selectionSettleTimer = null
      if (blockEntries?.isBlockModeActive()) return
      const selection = document.getSelection()
      if (!selection || !selection.toString().trim()) {
        if (!selectionMenu?.isShowing()) return
        // a click on a menu button momentarily collapses the selection; give it a grace period
        window.setTimeout(() => {
          const now = document.getSelection()
          if (!now || !now.toString().trim()) selectionMenu?.dismiss()
        }, 200)
        return
      }
      if (selectionMenu?.isShowing()) return // mouse path already placed it
      const root = selection.anchorNode?.getRootNode()
      const activeShadow = root instanceof ShadowRoot ? root : selection.anchorNode instanceof Element ? selection.anchorNode.shadowRoot : undefined
      const range = selectableRange(document, activeShadow ?? lastShadowRoot)
      if (!range) return
      lastRange = range.cloneRange()
      lastPlainText = plainTextForSelection(range)
      selectionMenu?.show(range)
    }, 250)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!isUserInput(event)) return
    if (insideOwnUi(event)) return
    if (selectionMenu?.isShowing()) selectionMenu.dismiss()
  }

  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('pointerdown', onPointerDown)
}

function wireBlockEntries(): void {
  let cachedSettings: Promise<{ blockEntryEnabled?: boolean; blockDisabledSites?: string[] }> | null = null
  const settings = () => {
    cachedSettings ??= MessageUtils.sendMessage<{ blockEntryEnabled?: boolean; blockDisabledSites?: string[] }>({ type: 'GET_SETTINGS' }).then(response => {
      if (!response.success) {
        cachedSettings = null
        return {}
      }
      return response.data ?? {}
    })
    return cachedSettings
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['annhub.settings']) cachedSettings = null
  })
  const gate = {
    enabled: async () => {
      return (await settings()).blockEntryEnabled !== false
    },
    siteDisabled: async (host: string) => {
      return Boolean((await settings()).blockDisabledSites?.some(site => normalizeHost(`https://${site}/`) === host || site === host))
    },
  }

  blockEntries = new BlockEntries(
    document,
    {
      onClip: (candidate, levelChanged) => {
        const id = newEntryId()
        const run = async () => {
          const outcome = await saveBlockClip(candidate, { via: 'block', levelChanged }, id)
          if (!isClipFailure(outcome)) showClipToast(outcome, candidate.element)
          else showFailureToast(() => void run(), outcome)
        }
        void run()
      },
      ...(isTopFrame()
        ? {
            onScreenshot: (candidate: BlockCandidate) => {
              enterScreenshotMode({ via: 'block', element: candidate.element })
            },
          }
        : {}),
      onDisableSite: () => {
        void (async () => {
          const host = normalizeHost(location.href)
          const response = await MessageUtils.sendMessage({ type: 'SET_SETTINGS', appendDisabledSite: host })
          if (response.success) blockEntries?.hide()
        })()
      },
      onDisableEntry: () => {
        void MessageUtils.sendMessage({ type: 'DISABLE_BLOCK_ENTRY' }).then(response => {
          if (response.success) blockEntries?.hide()
        })
      },
      openSettings: () => {
        void MessageUtils.sendMessage({ type: 'OPEN_EXTENSION_PAGE', page: 'settings' })
      },
    },
    gate,
  )
  blockEntries.install()
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  // Overlay CSS rides the manifest content style: the overlays append to the
  // document (not a shadow root), and every selector is namespaced under
  // [data-ann-ui] / .ann-* so the page's own styles are untouched.
  async main() {
    if (window.top !== window) {
      try {
        if (window.top?.location.origin !== window.location.origin) return
      } catch {
        return
      }
    }
    if (document.readyState === 'loading') {
      await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
    }
    wireSelectionMenu()
    wireBlockEntries()

    chrome.runtime.onMessage.addListener(message => {
      // the shortcut belongs to the top frame; a child frame that still hears it stays out of it
      if (!isTopFrame()) return
      if (message?.type === 'TRIGGER_SCREENSHOT') enterScreenshotMode({ via: 'shortcut' })
      if (message?.type === 'TRIGGER_BLOCK_MODE') blockEntries?.enterBlockMode()
    })

    Logger.info('[AnnHub] Content script ready')
  },
})
