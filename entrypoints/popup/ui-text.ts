/**
 * The popup's words (RV-CAP-17): its own table, the library counts it lists, the settings rows
 * it shows and the property table's `time.*` for the relative rows.
 */
import { createUiText } from '../../utils/ui-text'
import { createRelativeTime } from '../../utils/relative-time'
import { popupStrings } from '../../utils/ui-text/strings-popup'
import { libraryStrings } from '../../utils/ui-text/strings-library'
import { propertyStrings } from '../../utils/ui-text/strings-property'
import { settingsStrings } from '../../utils/ui-text/strings-settings'

const table = { ...popupStrings, ...libraryStrings, ...propertyStrings, ...settingsStrings }

export const uiText = createUiText(table)
export const relativeTime = createRelativeTime(uiText)
export type UiTextKey = Parameters<typeof uiText>[0]
