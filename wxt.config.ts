import { defineConfig } from 'wxt'
import { ANN_SELECTION_KEY } from './constants'
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
    // `tabs` and `activeTab` are omitted on purpose: the `<all_urls>` host permission already grants
    // everything they would (tab URLs and titles, capturing the visible tab).
    permissions: ['storage', 'commands', 'sidePanel', 'alarms', 'downloads', 'scripting'],
    // sidePanel (114) is the newest API the extension depends on.
    minimum_chrome_version: '114',
    host_permissions: ['http://127.0.0.1:8765/*', '<all_urls>'],
    action: {
      default_title: '__MSG_extName__',
      default_popup: 'popup/index.html',
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true,
    },
    side_panel: {
      default_path: 'sidepanel/index.html',
    },

    commands: {
      [ANN_SELECTION_KEY]: {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S',
        },
        description: 'Capture selected text area for annotation',
        global: false,
      },
      'toggle-highlighter': {
        suggested_key: {
          default: 'Alt+H',
          mac: 'Command+Shift+H',
        },
        description: 'Toggle highlighter / machine-gun capture mode',
        global: false,
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline';",
    },
    web_accessible_resources: [
      {
        matches: ['<all_urls>'],
        resources: ['content-scripts/content.css'],
      },
    ],
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
