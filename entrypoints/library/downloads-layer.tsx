/**
 * The library's download surfaces (download.md §3.1, §3.3): the selection's
 * dialog while it is open, and the single-entry status bar otherwise. Both
 * follow the one run the controller owns; neither pushes the page around.
 */
import { useEffect, useState } from 'react'
import type { DownloadForm } from '../../core/download'
import MessageUtils from '../../utils/message'
import { DownloadStatusBar } from './download-status-bar'
import type { SelectionController } from './selection-controller'
import { SelectionDownload } from './selection-download'

/**
 * The dialog's defaults are the settings card's values (download.md §3.3,
 * §4.1); loading them here keeps the page shell out of the download's own
 * state.
 */
export function DownloadsLayer({ controller }: { controller: SelectionController }) {
  const [defaults, setDefaults] = useState<{ form: DownloadForm; withMedia: boolean }>({ form: 'folder', withMedia: true })
  useEffect(() => {
    void MessageUtils.sendMessage<{ downloadForm?: DownloadForm; downloadMedia?: boolean }>({ type: 'GET_SETTINGS' }).then(response => {
      if (response.success && response.data) {
        setDefaults({ form: response.data.downloadForm === 'zip' ? 'zip' : 'folder', withMedia: response.data.downloadMedia !== false })
      }
    })
  }, [])
  const download = controller.download
  return (
    <>
      {controller.dialogOpen && <SelectionDownload entryIds={controller.selectedIds} defaults={defaults} download={download} onClose={controller.closeDownloadDialog} />}
      {!controller.dialogOpen && (
        <DownloadStatusBar state={download.state} onCancel={download.cancel} onShowFiles={download.showFiles} onRetry={download.retry} onClose={download.dismiss} />
      )}
    </>
  )
}
