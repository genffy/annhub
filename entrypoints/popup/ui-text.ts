/**
 * The popup's words (RV-CAP-17): its own table plus the small shared one — the view names on its
 * rail and the relative-time rows (RV-LIB-22). A key from a table the popup does not carry is a
 * compile error, so the popup cannot reach the library's or the settings' whole word list.
 */
import { createUiText } from '../../utils/ui-text'
import { createRelativeTime } from '../../utils/relative-time'
import { popupStrings } from '../../utils/ui-text/strings-popup'
import { sharedStrings } from '../../utils/ui-text/strings-shared'

const table = { ...popupStrings, ...sharedStrings }

export const uiText = createUiText(table)
export const relativeTime = createRelativeTime(uiText)
export type UiTextKey = Parameters<typeof uiText>[0]
