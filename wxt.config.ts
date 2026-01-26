import { defineConfig } from 'wxt'
import { ANN_SELECTION_KEY } from './constants'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/i18n/module', '@wxt-dev/module-react'],
  srcDir: '.',
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: '0.1.0',
    default_locale: 'en',
    permissions: [
      'storage',
      'activeTab',
      'notifications',
      'tabs',
      'contextMenus',
      'commands',
      'downloads',
      'scripting',
      'sidePanel'
    ],
    host_permissions: [
      'https://translation.googleapis.com/*',
      'https://translate.googleapis.com/*',
      'https://translate.google.com/*',
      'https://clients5.google.com/*',
      'https://fanyi-api.baidu.com/*',
      'https://openapi.youdao.com/*',
      '<all_urls>',
    ],
    action: {
      default_popup: 'popup/index.html',
      default_title: '__MSG_extName__',
    },
    options_ui: {
      page: 'options/index.html',
      open_in_tab: true,
    },
    side_panel: {
      default_path: 'sidepanel/index.html',
      open_panel_on_action_click: true
    },

    commands: {
      [ANN_SELECTION_KEY]: {
        suggested_key: {
          default: 'Ctrl+Shift+S',
          mac: 'Command+Shift+S'
        },
        description: 'Capture selected text area for annotation',
        global: false
      }
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
    chromiumArgs: ['--user-data-dir=./.wxt/browser-data']
  }
})
