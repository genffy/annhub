/**
 * The header's selection bar (download.md §3.2), wired to the selection
 * controller: counts, whole-filter pick, clear, exit and the one action.
 */
import { SelectionBar } from './selection-bar'
import type { SelectionController } from './selection-controller'

export function SelectionToolbar({ controller }: { controller: SelectionController }) {
  return (
    <SelectionBar
      selectedCount={controller.selectedIds.length}
      filteredTotal={controller.filteredTotal}
      onSelectAll={controller.selectAllVisible}
      onClear={controller.clearSelection}
      onDownload={controller.openDownloadDialog}
      onExit={controller.exitSelection}
      downloadButtonRef={controller.downloadButtonRef}
    />
  )
}
