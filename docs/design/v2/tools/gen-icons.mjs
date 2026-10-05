// 从仓库已安装的 lucide-react 抽取图标，生成设计稿使用的 SVG sprite（js/icons.js）。
// 用法：node docs/design/v2/tools/gen-icons.mjs
// 新增图标：在 ICONS 里加 lucide 名称后重新运行。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../../..')
const iconDir = resolve(root, 'node_modules/lucide-react/dist/esm/icons')

const ICONS = [
  // 扩展选区菜单（extension.md §2.1 指定的图标名）
  'brain',
  'highlighter',
  'bookmark',
  'scan',
  'film',
  // kind
  'quote',
  'atom',
  'scale',
  'list-checks',
  'git-branch',
  'circle-question-mark',
  'image',
  'lightbulb',
  // 通用
  'x',
  'check',
  'circle-check',
  'circle-alert',
  'triangle-alert',
  'info',
  'chevron-right',
  'chevron-down',
  'chevron-left',
  'chevron-up',
  'search',
  'plus',
  'ellipsis',
  'external-link',
  'arrow-right',
  'arrow-up-right',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'link',
  'file-text',
  'pencil',
  'pencil-line',
  'sparkles',
  'undo-2',
  'download',
  'eye-off',
  'eye',
  'shield-check',
  'lock',
  'trash-2',
  'settings',
  'refresh-cw',
  'rotate-ccw',
  'clock',
  'calendar',
  'sun',
  'moon',
  'monitor',
  'plug',
  'unplug',
  'wifi-off',
  'server',
  'cpu',
  'copy',
  'key-round',
  'history',
  'sliders-horizontal',
  'book-open',
  'library',
  'layout-list',
  'table',
  'panel-left',
  'panel-right',
  'funnel',
  'tag',
  'hash',
  'globe',
  'flag',
  'target',
  'repeat',
  'bell',
  'command',
  'corner-down-left',
  'git-merge',
  'workflow',
  'network',
  'puzzle',
  'timer',
  'hourglass',
  'play',
  'pause',
  'mic',
  'volume-2',
  'save',
  'send',
  'inbox',
  'archive',
  'folder',
  'files',
  'layers',
  'crop',
  'maximize-2',
  'minimize-2',
  'mouse-pointer-2',
  'keyboard',
  'zap',
  'shield',
  'book-marked',
  'square-pen',
  'notebook-pen',
  'list-todo',
  'list-ordered',
  'list-plus',
  'gauge',
  'activity',
  'badge-check',
  'circle-dot',
  'circle-dashed',
  'dot',
  'ban',
  'octagon-alert',
  'circle-x',
  'loader-circle',
  'redo',
  'arrow-up-down',
  'chevrons-up-down',
  'grip-vertical',
  'star',
  'square-check',
  'scissors',
  'crosshair',
  'focus',
  'frame',
  'expand',
  'move',
  'eraser',
  'paintbrush',
  'palette',
  'droplet',
  'split',
  'route',
  'signpost',
  'map',
  'unlink',
  'anchor',
  'paperclip',
  'image-off',
  'image-plus',
  'images',
  'move-up-right',
  'square',
  'circle',
  'grid-3x3',
  'type',
  'camera',
  'git-fork',
  'layout-grid',
  'columns-3',
  'list-filter',
  'circle-play',
  'arrow-down-wide-narrow',
  'rows-3',
  'folder-open',
  'circle-pause',
  'calendar-clock',
  'file-clock',
  'repeat-2',
  'bookmark-check',
  'badge-info',
  'chevrons-right',
  'message-square-text',
  'message-square-quote',
  'book-text',
  'user-round-x',
  'app-window',
  'text-cursor-input',
  'grip',
  'box',
  'database',
  'hard-drive',
  'shield-alert',
  'hand',
  'smartphone',
  'log-out',
  // 截图增强 R5：吸附、比例、品牌、导出
  'stamp',
  'magnet',
  'clipboard-copy',
  'clipboard-check',
  'ratio',
  'upload',
  'lock-keyhole',
  'lock-open',
  'file-image',
  'rectangle-vertical',
  'rectangle-horizontal',
  'pipette',
]

const attrs = props =>
  Object.entries(props)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

const symbols = []
const missing = []
for (const name of ICONS) {
  try {
    const mod = await import(pathToFileURL(resolve(iconDir, `${name}.js`)).href)
    const inner = mod.__iconNode.map(([tag, props]) => `<${tag} ${attrs(props)}/>`).join('')
    symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`)
  } catch {
    missing.push(name)
  }
}

// 品牌 logo 取自 assets/icons/logo.svg，填充改为 currentColor 以跟随主题。
const logo = readFileSync(resolve(root, 'assets/icons/logo.svg'), 'utf8')
const paths = [...logo.matchAll(/<path ([^>]+?)\/>/g)].map(([, a]) => `<path ${a.replace(/fill="#[0-9a-fA-F]+"/, 'fill="currentColor"')}/>`).join('')
symbols.push(`<symbol id="i-logo" viewBox="0 0 256 256">${paths}</symbol>`)

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">${symbols.join('')}</svg>`
const out = `// 由 tools/gen-icons.mjs 生成，请勿手改。来源：lucide-react（ISC）与 assets/icons/logo.svg。
document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(sprite)})
`
writeFileSync(resolve(here, '../js/icons.js'), out)
console.log(`icons: ${symbols.length - 1} + logo; missing: ${missing.join(', ') || 'none'}`)
