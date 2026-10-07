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
  // 三种条目类型与导航（extension.md §2.1、§2.2）
  'bookmark',
  'highlighter',
  'scan',
  'library',
  'images',
  'image',
  'tags',
  'tag',
  'settings',
  // 属性的六种类型（entry.md §5.2）
  'text',
  'list',
  'hash',
  'square-check',
  'calendar',
  'calendar-clock',
  // 通用
  'x',
  'check',
  'plus',
  'minus',
  'ellipsis',
  'search',
  'circle-check',
  'circle-alert',
  'circle-x',
  'triangle-alert',
  'info',
  'chevron-right',
  'chevron-down',
  'chevron-left',
  'chevron-up',
  'chevrons-up-down',
  'arrow-right',
  'arrow-left',
  'arrow-up-right',
  'arrow-up-down',
  'external-link',
  'link',
  'pencil',
  'undo-2',
  'rotate-ccw',
  'download',
  'trash',
  'copy',
  'eye',
  'eye-off',
  'lock',
  'lock-keyhole',
  'shield-check',
  'wifi-off',
  'globe',
  'clock',
  'keyboard',
  'corner-down-left',
  'ban',
  'loader-circle',
  'archive',
  'file-text',
  'hard-drive',
  'database',
  'palette',
  'droplet',
  'sliders-horizontal',
  'list-filter',
  'filter-x',
  'layout-grid',
  'rows-3',
  'panel-left-close',
  'panel-left-open',
  'message-square-text',
  'quote',
  'puzzle',
  'play',
  'sun',
  'moon',
  'monitor',
  'timer',
  'maximize-2',
  'grip-vertical',
  'circle-question-mark',
  'layers',
  'minimize-2',
  'unplug',
  // 截图工具栏与精确选区（screenshot.md §1.1、§1.2）
  'square',
  'circle',
  'move-up-right',
  'pencil-line',
  'grid-3x3',
  'type',
  'crosshair',
  'magnet',
  'ratio',
  'move',
]

// lucide-react 1.x 的模块是 .mjs 并导出 __iconData.node；0.x 是 .js 并导出 __iconNode。两种都认。
// 改过名的图标（如 trash-2 -> trash）在旧名字的文件里只是转发，跟着转发走，sprite 里仍用请求的名字。
async function loadIcon(name, depth = 0) {
  for (const ext of ['mjs', 'js']) {
    const file = resolve(iconDir, `${name}.${ext}`)
    try {
      const mod = await import(pathToFileURL(file).href)
      const nodes = mod.__iconNode ?? mod.__iconData?.node
      if (nodes) return nodes
      const target = /from '\.\/([^']+)\.m?js'/.exec(readFileSync(file, 'utf8'))
      if (target && depth < 3) return loadIcon(target[1], depth + 1)
    } catch {
      // 换下一个扩展名
    }
  }
  return null
}

const attrs = props =>
  Object.entries(props)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

const symbols = []
const missing = []
for (const name of ICONS) {
  const nodes = await loadIcon(name)
  if (!nodes) {
    missing.push(name)
    continue
  }
  const inner = nodes.map(([tag, props]) => `<${tag} ${attrs(props)}/>`).join('')
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`)
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
if (missing.length) process.exitCode = 1
