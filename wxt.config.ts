import { defineConfig } from 'wxt'
import { ANN_ANNOTATE_COMMAND, ANN_BLOCK_MODE_COMMAND, ANN_RECORD_COMMAND, ANN_SCREENSHOT_COMMAND } from './constants'
import packageJson from './package.json'

const extensionVersion = packageJson.version

if (!/^\d+(\.\d+){0,3}$/.test(extensionVersion)) {
  throw new Error(`package.json version "${extensionVersion}" is not a valid Chrome extension version`)
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/i18n/module', '@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: extensionVersion,
    default_locale: 'en',
    // A local build adopts the published store id when the store item's public key is passed in
    // (a stable id for testing updates); release builds never set it.
    ...(process.env.ANNHUB_EXTENSION_KEY ? { key: process.env.ANNHUB_EXTENSION_KEY } : {}),
    // `tabs`, `activeTab` and `scripting` are omitted on purpose: `<all_urls>` already grants what the
    // first two would (tab URLs and titles, capturing the visible tab), and page scripts are registered
    // statically in the manifest so a shortcut fallback injection has no real receiver (docs/product/permissions.md).
    // `tabCapture` records the tab the user started recording from; `offscreen` gives the
    // recording a document (annotate.md §2) — the service worker has no page environment.
    permissions: ['storage', 'commands', 'downloads', 'tabCapture', 'offscreen'],
    // Handing a tab stream from the worker to an offscreen document needs Chrome 116
    // (permissions.md §5, market.md §4.7).
    minimum_chrome_version: '116',
    host_permissions: ['<all_urls>'],
    action: {
      default_title: '__MSG_extName__',
      default_popup: 'popup/index.html',
    },
    // `options_ui` is generated from entrypoints/options/index.html (the
    // open-in-tab flag is a meta tag there); a block here never reached the
    // built manifest (真机走查 P2-9).

    commands: {
      [ANN_SCREENSHOT_COMMAND]: {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S',
        },
        description: '__MSG_commandScreenshot__',
        global: false,
      },
      [ANN_BLOCK_MODE_COMMAND]: {
        suggested_key: {
          default: 'Ctrl+Shift+E',
          mac: 'Command+Shift+E',
        },
        description: '__MSG_commandBlockMode__',
        global: false,
      },
      // No suggested key on purpose (annotate.md §1.1, D-37): the user binds it in
      // the browser's shortcut settings; the toolbar popup is the primary entry.
      [ANN_ANNOTATE_COMMAND]: {
        description: '__MSG_commandAnnotate__',
        global: false,
      },
      // Also unbound by default (annotate.md §2.1, D-37): the toolbar popup is the primary entry.
      [ANN_RECORD_COMMAND]: {
        description: '__MSG_commandRecordTab__',
        global: false,
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline';",
    },
  },
  webExt: {
    disabled: true,
    chromiumArgs: ['--user-data-dir=./.wxt/browser-data'],
  },
  vite: () => ({
    server: {
      cors: {
        origin: [/^chrome-extension:\/\/[a-p]{32}$/, /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/],
      },
    },
  }),
})
