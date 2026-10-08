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
import { saveBlockClip, saveSelectionClip, showClipToast, showFailureToast, type ClipOrigin } from './clip-flow'
import { SelectionMenu, selectableRange } from './selection-menu'
import { enterScreenshotMode } from './screenshot'
import { isUserInput } from './user-input'
import { normalizeHost } from '../../learning-core/normalize'
import MessageUtils from '../../utils/message'
import { Logger } from '../../utils/logger'
import './content.css'

let selectionMenu: SelectionMenu | null = null
let blockEntries: BlockEntries | null = null
let lastRange: Range | null = null

function insideOwnUi(event: Event): boolean {
  const path = event.composedPath() as HTMLElement[]
  return path.some(el => el instanceof HTMLElement && el.hasAttribute?.('data-ann-ui'))
}

async function triggerSelectionClip(origin: ClipOrigin): Promise<void> {
  const range = lastRange
  if (!range) return
  const outcome = await saveSelectionClip(range, origin)
  selectionMenu?.dismiss()
  document.getSelection()?.removeAllRanges()
  if (outcome) {
    showClipToast(outcome, range)
  } else {
    // failure keeps the selection so the retry has the same material (extension.md §6)
    document.getSelection()?.addRange(range)
    showFailureToast(() => void triggerSelectionClip(origin))
  }
}

function wireSelectionMenu(): void {
  selectionMenu = new SelectionMenu(document, {
    onClip: () => void triggerSelectionClip({ via: 'menu' }),
    onScreenshot: () => {
      selectionMenu?.dismiss()
      document.getSelection()?.removeAllRanges()
      enterScreenshotMode({ via: 'menu' })
    },
  })

  const onPointerUp = (event: PointerEvent): void => {
    if (!isUserInput(event)) return
    if (insideOwnUi(event)) return
    // let the selection settle before reading it
    window.setTimeout(() => {
      const range = selectableRange(document)
      if (!range) {
        if (!blockEntries?.isBlockModeActive()) selectionMenu?.dismiss()
        return
      }
      lastRange = range.cloneRange()
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
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        if (!selectionMenu?.isShowing()) return
        // a click on a menu button momentarily collapses the selection; give it a grace period
        window.setTimeout(() => {
          const now = document.getSelection()
          if (!now || now.isCollapsed) selectionMenu?.dismiss()
        }, 200)
        return
      }
      if (selectionMenu?.isShowing()) return // mouse path already placed it
      const range = selectableRange(document)
      if (!range) return
      lastRange = range.cloneRange()
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
  const gate = {
    enabled: async () => {
      const response = await MessageUtils.sendMessage<{ blockEntryEnabled?: boolean }>({ type: 'GET_SETTINGS' })
      return response.success ? response.data?.blockEntryEnabled !== false : true
    },
    siteDisabled: async (host: string) => {
      const response = await MessageUtils.sendMessage<{ blockDisabledSites?: string[] }>({ type: 'GET_SETTINGS' })
      return Boolean(response.success && response.data?.blockDisabledSites?.some(site => normalizeHost(`https://${site}/`) === host || site === host))
    },
  }

  blockEntries = new BlockEntries(
    document,
    {
      onClip: (candidate, levelChanged) => {
        const run = async () => {
          const outcome = await saveBlockClip(candidate.element, candidate.kind, { via: 'block', levelChanged })
          if (outcome) showClipToast(outcome, candidate.element)
          else showFailureToast(() => void run())
        }
        void run()
      },
      onScreenshot: candidate => {
        enterScreenshotMode({ via: 'block', element: candidate.element })
      },
      onDisableSite: () => {
        void (async () => {
          const host = normalizeHost(location.href)
          const response = await MessageUtils.sendMessage<{ blockDisabledSites?: string[] }>({ type: 'GET_SETTINGS' })
          const sites = new Set(response.data?.blockDisabledSites ?? [])
          sites.add(host)
          await MessageUtils.sendMessage({ type: 'SET_SETTINGS', patch: { blockDisabledSites: [...sites] } })
        })()
      },
      onDisableEntry: () => {
        void MessageUtils.sendMessage({ type: 'SET_SETTINGS', patch: { blockEntryEnabled: false } })
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
  cssInjectionMode: 'ui',
  async main() {
    if (document.readyState === 'loading') {
      await new Promise<void>(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }))
    }
    wireSelectionMenu()
    wireBlockEntries()

    chrome.runtime.onMessage.addListener(message => {
      if (message?.type === 'TRIGGER_SCREENSHOT') enterScreenshotMode({ via: 'shortcut' })
      if (message?.type === 'TRIGGER_BLOCK_MODE') blockEntries?.enterBlockMode()
    })

    Logger.info('[AnnHub] Content script ready')
  },
})
