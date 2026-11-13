/**
 * Content script entry — the page-side capture surface (docs/product/capture.md,
 * extension.md §2.1, §3). Everything it renders is an overlay of the
 * extension's own; the page itself is never modified and keeps no mark.
 *
 * Surfaces: the two-action selection menu, the block-clip hover entry and
 * keyboard block mode, the screenshot session, and the clip toast with
 * undo and quick edit.
 */
import { BlockEntries } from './block-hover'
import type { BlockCandidate } from './blocks'
import { enterAnnotationLayer, exitAnnotationLayer, getActiveAnnotationLayer, isAnnotationLayerActive, notifyAnnotationLayer } from './annotation/layer'
import type { InkStroke } from './annotation/ink'
import { setCursorHighlight, type CursorHighlightSettings } from './cursor-highlight'
import { SETTINGS_STORAGE_KEY } from '../../core/storage-keys'
import { readLocalSettings, readRecordingFlag } from '../../utils/local-storage'
import { blockClipAnchor, isClipFailure, saveBlockClip, savePlainTextSelection, saveSelectionClip, showClipToast, showFailureToast, type ClipOrigin } from './clip-flow'
import { SelectionMenu, plainTextForSelection, selectableRange } from './selection-menu'
import { enterScreenshotMode, isScreenshotSessionActive, notifyScreenshotSession } from './screenshot'
import { downloadBlock, downloadMainArticle, onDownloadNotice } from './download-flow'
import { isUserInput } from './user-input'
import { uiText } from './ui-text'
import { normalizeHost } from '../../core/normalize'
import MessageUtils from '../../utils/message'
import type { TabMessage } from '../../types/messages'
import { Logger } from '../../utils/logger'
import { newEntryId } from '../../core/assets'
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
    // viewport; a same-origin child frame offers clipping only (capture.md §3).
    ...(isTopFrame()
      ? {
          onScreenshot: () => {
            // The selection itself becomes the pending frame: Enter confirms,
            // arrows nudge, Esc cancels — the keyboard is never a dead end.
            const rect = lastRange?.getBoundingClientRect()
            selectionMenu?.dismiss()
            document.getSelection()?.removeAllRanges()
            const initial = rect && rect.width >= 4 && rect.height >= 4 ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : undefined
            enterScreenshotMode({ via: 'menu', ...(initial ? { initialRect: initial } : {}) })
          },
        }
      : {}),
  })

  const onPointerUp = (event: PointerEvent): void => {
    if (!isUserInput(event)) return
    if (insideOwnUi(event)) return
    // the annotation layer keeps the selection menu off the page while it is open (annotate.md §1.1)
    if (isAnnotationLayerActive()) return
    // let the selection settle before reading it
    window.setTimeout(() => {
      if (isAnnotationLayerActive()) return
      const path = event.composedPath()
      const shadowRoot =
        path.find((node): node is ShadowRoot => node instanceof ShadowRoot) ??
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
      if (isAnnotationLayerActive()) return
      const selection = document.getSelection()
      if (!selection || !selection.toString().trim()) {
        if (!selectionMenu?.isShowing()) return
        // a click on a menu button momentarily collapses the selection; give it a grace period
        window.setTimeout(() => {
          const now = document.getSelection()
          if (!now || !now.toString().trim()) {
            selectionMenu?.dismiss()
            // the selection collapsed: the block under the pointer pauses (capture.md §6.2 暂停)
            blockEntries?.pauseHereNow()
          }
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
    if (selectionMenu?.isShowing()) {
      selectionMenu.dismiss()
      // a click on the page closed the menu: the block under the pointer pauses (capture.md §6.2 暂停)
      blockEntries?.pauseHere(event.clientX, event.clientY)
    }
  }

  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('pointerdown', onPointerDown)
}

function wireBlockEntries(): void {
  // the preferences are read straight from chrome.storage.local (layer C, no secrets): the first
  // block under the pointer must not wake the service worker (RV-CAP-19)
  let cachedSettings: Promise<{ blockEntryEnabled?: boolean; blockDisabledSites?: string[] }> | null = null
  const settings = () => {
    cachedSettings ??= readLocalSettings()
      .then(preferences => ({ blockEntryEnabled: preferences.blockEntryEnabled, blockDisabledSites: preferences.blockDisabledSites }))
      .catch(() => {
        // an updated extension strands old tabs' scripts with a dead port: fail soft, ask again next time
        cachedSettings = null
        return {}
      })
    return cachedSettings
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_STORAGE_KEY]) cachedSettings = null
  })
  const gate = {
    enabled: async () => {
      if (isAnnotationLayerActive()) return false
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
          if (!isClipFailure(outcome)) showClipToast(outcome, blockClipAnchor(candidate))
          else showFailureToast(() => void run(), outcome)
        }
        void run()
      },
      ...(isTopFrame()
        ? {
            onScreenshot: (candidate: BlockCandidate) => {
              // the target is what the outline showed: a section hands its interval, an element-kind block the element (RV-CAP-13)
              enterScreenshotMode({ via: 'block', element: candidate.element, ...(candidate.range ? { section: candidate.range } : {}) })
            },
            // the download entry belongs to the top frame like the screenshot's (download.md §2.1)
            onDownload: (candidate: BlockCandidate) => {
              downloadBlock(candidate, 'capsule')
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

/**
 * The recording this tab is in, as far as the page knows: the cursor highlight shows while it runs (annotate.md §3.2).
 * Nothing else on the page reads it: the annotation layer is the same layer with or without a recording (annotate.md §3.1).
 */
let recordingActive = false
let cursorHighlightSettings: CursorHighlightSettings | null = null
/** Once a lifecycle message has arrived it is the newer truth; the startup status read must not roll it back. */
let lifecycleSeen = false

function applyRecordingState(): void {
  setCursorHighlight(recordingActive, cursorHighlightSettings ?? undefined)
}

/** The worker tells the recorded tab when a recording starts and stops (annotate.md §3). */
function wireCursorHighlight(): void {
  // the flag is one boolean in chrome.storage.local (storage.md §2): reading it never wakes the
  // worker, and only a page that finds a recording running asks the worker for the real state
  void readRecordingFlag()
    .catch(() => false)
    .then(flag => {
      if (!flag || lifecycleSeen) return
      void MessageUtils.sendMessage({ type: 'RECORDING_STATUS' }).then(response => {
        if (!response.success || !response.data || lifecycleSeen) return
        recordingActive = response.data.recording === true
        cursorHighlightSettings = response.data.cursorHighlight ?? null
        applyRecordingState()
      })
    })
  chrome.runtime.onMessage.addListener((message: TabMessage) => {
    if (message?.type !== 'RECORDING_LIFECYCLE') return
    lifecycleSeen = true
    recordingActive = message.active === true
    if (message.active) cursorHighlightSettings = message.cursorHighlight ?? null
    applyRecordingState()
  })
}

/** The open annotation layer, kept so the screenshot session can hand the stage back to it. */
function enterScreenshotWithInk(ink: InkStroke[]): void {
  // the ink rides into the editor (annotate.md §1.3); the layer is hidden for the
  // session and comes back — ink included — when the session ends for any reason
  const layer = getActiveAnnotationLayer()
  enterScreenshotMode({
    via: 'ink',
    ink,
    onExit: () => layer?.restoreAfterScreenshot(),
  })
}

function startAnnotationLayer(): void {
  // 区块模式进行中时，打开批注会先退出区块模式 (annotate.md §1.1)
  if (blockEntries?.isBlockModeActive()) blockEntries.exitBlockMode()
  blockEntries?.hide()
  enterAnnotationLayer({
    onScreenshot: ink => enterScreenshotWithInk(ink),
  })
}

function toggleAnnotationLayer(): void {
  // 截图会话进行中时不打开批注，由截图界面提示先完成或取消 (annotate.md §1.1)
  if (isScreenshotSessionActive()) {
    notifyScreenshotSession(uiText('annotate.notice.screenshotBusy'))
    return
  }
  if (isAnnotationLayerActive()) {
    exitAnnotationLayer()
    return
  }
  startAnnotationLayer()
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
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
    wireCursorHighlight()

    chrome.runtime.onMessage.addListener((message: TabMessage) => {
      // the shortcuts and notices belong to the top frame; a child frame that still hears them stays out of it
      if (!isTopFrame()) return
      if (message?.type === 'TRIGGER_SCREENSHOT') {
        // the screenshot shortcut carries the ink, like the layer's own button (annotate.md §1.1)
        const layer = getActiveAnnotationLayer()
        if (layer && !isScreenshotSessionActive()) {
          layer.startScreenshot()
          return
        }
        enterScreenshotMode({ via: 'shortcut' })
      }
      if (message?.type === 'TRIGGER_BLOCK_MODE') {
        // 区块模式的快捷键不响应，页面上提示先退出批注 (annotate.md §1.1)
        if (isAnnotationLayerActive()) {
          notifyAnnotationLayer(uiText('annotate.notice.blockShortcut'))
          return
        }
        blockEntries?.enterBlockMode()
      }
      if (message?.type === 'TRIGGER_ANNOTATE') toggleAnnotationLayer()
      // the popup's button and the unbound command: the page's main article (download.md §2.3)
      if (message?.type === 'TRIGGER_DOWNLOAD_MAIN') void downloadMainArticle(message.via === 'command' ? 'command' : 'popup')
      // the worker's reports about this tab's download (download.md §2.5)
      if (message?.type === 'DOWNLOAD_NOTICE') onDownloadNotice(message)
    })

    Logger.info('[AnnHub] Content script ready')
  },
})
