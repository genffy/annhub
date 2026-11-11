/**
 * The library pages' words (RV-CAP-17): their own table plus the property registry, the
 * settings pages and the capture table the status strips and relative rows read from.
 */
import { createFailureHelpers, createUiText } from '../../utils/ui-text'
import { createTypeChip } from '../../utils/entry-icons'
import { createRelativeTime } from '../../utils/relative-time'
import { libraryStrings } from '../../utils/ui-text/strings-library'
import { propertyStrings } from '../../utils/ui-text/strings-property'
import { settingsStrings } from '../../utils/ui-text/strings-settings'
import { captureStrings } from '../../utils/ui-text/strings-capture'

const table = { ...libraryStrings, ...propertyStrings, ...settingsStrings, ...captureStrings }

export const uiText = createUiText(table)
export const relativeTime = createRelativeTime(uiText)
export type UiTextKey = Parameters<typeof uiText>[0]
export const { entryErrorText, failureReason } = createFailureHelpers(table)
export const TypeChip = createTypeChip(uiText)
