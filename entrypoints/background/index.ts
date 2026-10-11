import { Logger } from '../../utils/logger'
import backgroundServiceManager from '../../background-service'
import MessageUtils from '../../utils/message'
import type { BaseMessage } from '../../types/messages'

/** Mutations the open library pages listen for, to refresh their lists without a reload (真机走查 P3-12). */
const MUTATION_MESSAGE_TYPES = new Set(['SAVE_CLIP', 'SAVE_SCREENSHOT', 'UPDATE_ENTRY', 'DELETE_ENTRY', 'ADD_HIGHLIGHT', 'UPDATE_HIGHLIGHT', 'REMOVE_HIGHLIGHT'])

export default defineBackground(() => {
  Logger.info('AnnHub background loaded', { id: browser.runtime.id })

  // The screenshot frame memory lives in chrome.storage.session; content
  // scripts may touch that area only after the access level says so (真机走查
  // P2-11：记忆不再写进网页自己的 sessionStorage).
  try {
    browser.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  } catch {
    /* an older Chrome: the frame memory degrades to off */
  }

  // MV3 service workers must register listeners in the synchronous top level:
  // a cold-started worker would otherwise drop the very message that woke it.
  // The handler awaits initialization, then dispatches (RV-BG-01).
  browser.runtime.onMessage.addListener(
    MessageUtils.wrapAsyncHandler(async (message: BaseMessage, sender: chrome.runtime.MessageSender) => {
      await backgroundServiceManager.whenReady()
      const response = await backgroundServiceManager.dispatchMessage(message, sender)
      // A write that succeeded tells the open library pages their lists are stale.
      // BroadcastChannel is private to this extension's origin, and works from a
      // suspended-and-restarted worker's successor alike.
      if (response.success && typeof message?.type === 'string' && MUTATION_MESSAGE_TYPES.has(message.type)) {
        try {
          new BroadcastChannel('annhub.entries').postMessage({ type: 'entries-changed' })
        } catch {
          /* a page that cannot hear it simply keeps its current list */
        }
      }
      return response
    }),
  )

  void backgroundServiceManager.whenReady().catch(error => {
    Logger.error('Background service initialization failed:', error)
  })
})
