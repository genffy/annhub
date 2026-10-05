import { Logger } from '../../utils/logger'
import backgroundServiceManager, { FragmentService } from '../../background-service'

const DELIVERY_ALARM = 'annhub-delivery-retry'
const DELIVERY_BACKOFF_KEY = 'annhubDeliveryFailures'
/** 指数退避（roadmap R3.1）：1 → 2 → 4 → 8 → 15 分钟封顶。 */
function backoffMinutes(failures: number): number {
  return Math.min(2 ** failures, 15)
}

async function initializeServices(): Promise<void> {
  try {
    Logger.info('Starting background service initialization...')
    await backgroundServiceManager.initialize()
    Logger.info('Background service initialization completed successfully')
    await scheduleDeliveryRetry()
  } catch (error) {
    Logger.error('Background service initialization failed:', error)
    throw error
  }
}

/**
 * Pending deliveries retry on a fixed alarm while autoSync is configured and
 * work remains (storage.md §8: Desktop down never blocks local saves — the
 * queue survives and retries on reconnect).
 */
async function scheduleDeliveryRetry(): Promise<void> {
  try {
    const service = FragmentService.getInstance()
    const config = await service.getDirectConnectConfig()
    const pending = await service.getDeliveryStats()
    const hasWork = pending.pendingFragments + pending.pendingAssets > 0
    if (config.token && config.autoSync && hasWork) {
      await service.flushDeliveries()
    }
    const after = await service.getDeliveryStats()
    const stillPending = after.pendingFragments + after.pendingAssets
    if (config.token && stillPending > 0) {
      const state = await service.getDeliveryState()
      const failed = !!(state.lastPull?.errors?.length || state.lastError)
      const failures = ((await chrome.storage.local.get(DELIVERY_BACKOFF_KEY))[DELIVERY_BACKOFF_KEY] as number | undefined) ?? 0
      const next = failed ? failures + 1 : 0
      await chrome.storage.local.set({ [DELIVERY_BACKOFF_KEY]: next })
      // One-shot alarm recreated after every attempt with growing delay.
      await chrome.alarms.clear(DELIVERY_ALARM)
      chrome.alarms.create(DELIVERY_ALARM, { delayInMinutes: backoffMinutes(next) })
    } else {
      await chrome.storage.local.set({ [DELIVERY_BACKOFF_KEY]: 0 })
      await chrome.alarms.clear(DELIVERY_ALARM)
    }
  } catch (error) {
    Logger.warn('Delivery retry scheduling failed:', error)
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
  // scripts (extension PRD §9) — open the store to untrusted contexts.
  void chrome.storage.session?.setAccessLevel?.({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {})
  initializeServices()

  // Handle keyboard shortcut commands
  chrome.commands.onCommand.addListener(command => {
    if (command === 'toggle-highlighter') {
      sendToActiveTab({ type: 'TOGGLE_HIGHLIGHTER_MODE' })
    }
  })

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === DELIVERY_ALARM) {
      scheduleDeliveryRetry().catch(error => Logger.warn('Delivery alarm failed:', error))
    }
  })
})
