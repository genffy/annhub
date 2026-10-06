import { describe, expect, it } from 'vitest'
import { popupViewModel, type PopupData } from '../view-model'

const base: PopupData = { fragmentCount: 128, screenshotCount: 24 }

describe('toolbar popup view model (extension.md §2.3)', () => {
  it('shows the library and screenshot counts in Chinese', () => {
    const view = popupViewModel(base, 'zh')
    expect(view.libraryCount).toBe('128 条')
    expect(view.screenshotCount).toBe('24 张')
  })

  it('leaves counts empty instead of showing zeros when they could not be read', () => {
    const view = popupViewModel({ fragmentCount: null, screenshotCount: null }, 'zh')
    expect(view.libraryCount).toBeNull()
    expect(view.screenshotCount).toBeNull()
  })

  it('says the same things in English, with singular and plural forms', () => {
    expect(popupViewModel(base, 'en')).toEqual({ libraryCount: '128 Fragments', screenshotCount: '24 screenshots' })
    expect(popupViewModel({ fragmentCount: 1, screenshotCount: 1 }, 'en')).toEqual({ libraryCount: '1 Fragment', screenshotCount: '1 screenshot' })
  })
})
