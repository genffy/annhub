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

export default defineBackground(() => {
  Logger.info('Translation extension background loaded', { id: browser.runtime.id })
  initializeServices()
})
