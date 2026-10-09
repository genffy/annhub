import { Logger } from '../../utils/logger'

export class InstallationHandler {
  private installedListener?: (details: chrome.runtime.InstalledDetails) => void

  registerListeners(): void {
    Logger.info('[InstallationHandler] Registering installation listeners...')

    this.installedListener = async (details: chrome.runtime.InstalledDetails) => {
      try {
        Logger.info('[InstallationHandler] Extension installed/updated, details:', details)

        // The typings list every reason, so inside `default` `details` is `never`; Chrome can still add one later.
        const reason: string = details.reason

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
            Logger.info('[InstallationHandler] Unknown installation reason:', reason)
        }

        Logger.info('[InstallationHandler] Installation/update handling completed successfully')
      } catch (error) {
        Logger.error('[InstallationHandler] Installation/update handling failed:', error)
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
      await this.removeDesktopLeftovers()
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

  /** The Desktop connection is gone; builds that had it left its settings behind, including the pairing code. */
  private async removeDesktopLeftovers(): Promise<void> {
    await chrome.storage.local.remove(['desktopDirectConnect', 'fragmentDeliveryState', 'annhubDeliveryFailures', 'fragmentDeviceId', 'annhubConnectHintDismissed'])
  }

  private async migrateFromV1ToV2(): Promise<void> {
    Logger.info('[InstallationHandler] Starting V1 to V2 migration...')
    Logger.info('[InstallationHandler] V1 to V2 migration completed (no-op)')
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
