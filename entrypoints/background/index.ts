import { Logger } from '../../utils/logger'
import backgroundServiceManager from '../../background-service'

export default defineBackground(() => {
  Logger.info('AnnHub background loaded', { id: browser.runtime.id })
  backgroundServiceManager.initialize().catch(error => {
    Logger.error('Background service initialization failed:', error)
  })
})
