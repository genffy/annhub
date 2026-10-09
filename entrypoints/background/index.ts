import { Logger } from '../../utils/logger'
import backgroundServiceManager from '../../background-service'
import MessageUtils from '../../utils/message'
import type { BaseMessage } from '../../types/messages'

export default defineBackground(() => {
  Logger.info('AnnHub background loaded', { id: browser.runtime.id })

  // MV3 service workers must register listeners in the synchronous top level:
  // a cold-started worker would otherwise drop the very message that woke it.
  // The handler awaits initialization, then dispatches (RV-BG-01).
  browser.runtime.onMessage.addListener(
    MessageUtils.wrapAsyncHandler(async (message: BaseMessage, sender: chrome.runtime.MessageSender) => {
      await backgroundServiceManager.whenReady()
      return backgroundServiceManager.dispatchMessage(message, sender)
    }),
  )

  void backgroundServiceManager.whenReady().catch(error => {
    Logger.error('Background service initialization failed:', error)
  })
})
