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
  // Capture-modal drafts persist to chrome.storage.session from content
  // scripts (extension PRD §8) — open the store to untrusted contexts.
  void chrome.storage.session?.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {})
  initializeServices()

  // Handle keyboard shortcut commands
  chrome.commands.onCommand.addListener(command => {
    if (command === 'toggle-highlighter') {
      sendToActiveTab({ type: 'TOGGLE_HIGHLIGHTER_MODE' })
    }
  })
})
