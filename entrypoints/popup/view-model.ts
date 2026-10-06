/**
 * Toolbar popup content (extension.md §2.3). Pure so the wording rules are
 * testable: a count that could not be loaded is absent, never a placeholder.
 */
import { uiCount, type UiLanguage } from '../../utils/ui-text'

export interface PopupData {
  fragmentCount: number | null
  screenshotCount: number | null
}

export interface PopupViewModel {
  libraryCount: string | null
  screenshotCount: string | null
}

export function popupViewModel(data: PopupData, lang?: UiLanguage): PopupViewModel {
  return {
    libraryCount: data.fragmentCount === null ? null : uiCount('popup.libraryCount', data.fragmentCount, {}, lang),
    screenshotCount: data.screenshotCount === null ? null : uiCount('popup.screenshotCount', data.screenshotCount, {}, lang),
  }
}
