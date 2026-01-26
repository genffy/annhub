import { Logger } from '../../utils/logger'
import { ServiceContext } from '../service-context'


export class InstallationHandler {
  private serviceContext: ServiceContext
  private installedListener?: (details: chrome.runtime.InstalledDetails) => void

  constructor() {
    this.serviceContext = ServiceContext.getInstance()
  }


  registerListeners(): void {
    Logger.info('[InstallationHandler] Registering installation listeners...')

    this.installedListener = async (details: chrome.runtime.InstalledDetails) => {
      try {
        Logger.info('[InstallationHandler] Extension installed/updated, details:', details)

        switch (details.reason) {
          case 'install':
            Logger.info('[InstallationHandler] Extension first installation detected')
            await this.handleFirstInstallation()
            break

          case 'update':
            Logger.info('[InstallationHandler] Extension update detected, checking for migration...')
            await this.handleVersionUpdate(details.previousVersion)
            break

          case 'chrome_update':
            Logger.info('[InstallationHandler] Chrome browser update detected')

            break

          case 'shared_module_update':
            Logger.info('[InstallationHandler] Shared module update detected')

            break

          default:
            Logger.info('[InstallationHandler] Unknown installation reason:', details.reason)
        }

        Logger.info('[InstallationHandler] Installation/update handling completed successfully')
      } catch (error) {
        Logger.error('[InstallationHandler] Installation/update handling failed:', error)
        this.serviceContext.markInitializationFailed(error instanceof Error ? error : new Error(String(error)))
      }
    }

    browser.runtime.onInstalled.addListener(this.installedListener)
    Logger.info('[InstallationHandler] Installation listeners registered successfully')
  }


  private async handleFirstInstallation(): Promise<void> {
    Logger.info('[InstallationHandler] Handling first installation setup...')

    try {





      // await browser.runtime.openOptionsPage()

      Logger.info('[InstallationHandler] First installation setup completed successfully')
    } catch (error) {
      Logger.error('[InstallationHandler] First installation setup failed:', error)
      throw error
    }
  }


  private async handleVersionUpdate(previousVersion?: string): Promise<void> {
    if (!previousVersion) {
      Logger.info('[InstallationHandler] No previous version information available')
      return
    }

    Logger.info(`[InstallationHandler] Updating from version ${previousVersion} to current version`)

    try {




      if (previousVersion.startsWith('1.')) {
        Logger.info('[InstallationHandler] Performing migration from version 1.x to 2.x')
        await this.migrateFromV1ToV2()
      }



      Logger.info('[InstallationHandler] Version update migration completed successfully')
    } catch (error) {
      Logger.error('[InstallationHandler] Version update migration failed:', error)
      throw error
    }
  }


  private async migrateFromV1ToV2(): Promise<void> {
    Logger.info('[InstallationHandler] Starting V1 to V2 migration...')

    try {

      const oldData = await browser.storage.sync.get()
      const newData: Record<string, any> = {}


      if (oldData.oldTranslationConfig) {
        newData.translationConfig = {
          ...oldData.oldTranslationConfig,

          version: '0.1.0'
        }

        await browser.storage.sync.remove('oldTranslationConfig')
      }


      if (Object.keys(newData).length > 0) {
        await browser.storage.sync.set(newData)
      }

      Logger.info('[InstallationHandler] V1 to V2 migration completed')
    } catch (error) {
      Logger.error('[InstallationHandler] V1 to V2 migration failed:', error)
      throw error
    }
  }


  removeListeners(): void {
    Logger.info('[InstallationHandler] Removing installation listeners...')

    if (this.installedListener) {
      browser.runtime.onInstalled.removeListener(this.installedListener)
      this.installedListener = undefined
    }

    Logger.info('[InstallationHandler] Installation listeners removed successfully')
  }
} 