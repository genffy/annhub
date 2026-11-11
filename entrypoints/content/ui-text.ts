/**
 * The content script's words (RV-CAP-17): the capture table and the property table cover every
 * key it reads — the property one for the quick-edit bubble's error texts and the shared
 * `common.*`. A key from another table is a compile error here, and the built content script
 * carries no library, settings or popup copy.
 */
import { createFailureHelpers, createUiText } from '../../utils/ui-text'
import { captureStrings } from '../../utils/ui-text/strings-capture'
import { propertyStrings } from '../../utils/ui-text/strings-property'

const table = { ...captureStrings, ...propertyStrings }

export const uiText = createUiText(table)
export type UiTextKey = Parameters<typeof uiText>[0]
export const { entryErrorText, failureReason, screenshotSaveErrorText, screenshotFailureText } = createFailureHelpers(table)
