import { Logger } from '../../utils/logger'
import backgroundServiceManager from '../../background-service'

async function initializeServices(): Promise<void> {
  try {
    Logger.info('Starting background service initialization...')
    await backgroundServiceManager.initialize()
    Logger.info('Background service initialization completed successfully')
  } catch (error) {
    Logger.error('Background service initialization failed:', error)
    throw error
  }
}

/** Send a message to the active tab's content script */
async function sendToActiveTab(message: { type: string }) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, message)
    }
  } catch (error) {
    Logger.error('Failed to send message to active tab:', error)
  }
}

export default defineBackground(() => {
  Logger.info('Translation extension background loaded', { id: browser.runtime.id })
  initializeServices()

  // Handle keyboard shortcut commands
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-highlighter') {
      sendToActiveTab({ type: 'TOGGLE_HIGHLIGHTER_MODE' })
    }
  })

  // Handle browser action icon click (when no popup is configured)
  chrome.action.onClicked.addListener(() => {
    sendToActiveTab({ type: 'TOGGLE_HIGHLIGHTER_MODE' })
  })
})

