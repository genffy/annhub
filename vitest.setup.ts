/**
 * Unit tests run under jsdom, whose `navigator.language` is `en-US`. The wording most existing
 * assertions check is the Chinese one, so tests start in a Chinese browser; a test that cares about
 * the other language passes it explicitly (`uiText(key, params, 'en')`) or sets the language itself.
 */
Object.defineProperty(globalThis.navigator, 'language', { value: 'zh-CN', configurable: true })
