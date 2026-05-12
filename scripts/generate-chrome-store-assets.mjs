import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, 'website/public/chrome-store')
mkdirSync(outDir, { recursive: true })

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const text = (content, x, y, opts = {}) => {
  const {
    size = 28,
    weight = 500,
    fill = '#172033',
    anchor = 'start',
    opacity = 1,
    family = 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  } = opts
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}">${escapeXml(content)}</text>`
}

const rect = (x, y, width, height, opts = {}) => {
  const {
    fill = '#ffffff',
    stroke = 'none',
    strokeWidth = 1,
    radius = 8,
    opacity = 1,
    filter = '',
  } = opts
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filter ? ` filter="${filter}"` : ''}/>`
}

const logo = (x, y, size, fill = '#673AB8') => {
  const scale = size / 170
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path fill-rule="evenodd" clip-rule="evenodd" d="M30 110L70 0H40L0 110V200H30L60 110H30ZM140 110L100 0H130L170 110V200H140L110 110H140Z" fill="${fill}"/></g>`
}

const browserFrame = (x, y, width, height, title = 'annhub demo') => `
  ${rect(x, y, width, height, { fill: '#ffffff', stroke: '#D7DCE3', strokeWidth: 1.5, radius: 14, filter: 'url(#shadow)' })}
  ${rect(x, y, width, 48, { fill: '#F4F6F8', stroke: '#D7DCE3', strokeWidth: 1, radius: 14 })}
  <circle cx="${x + 24}" cy="${y + 24}" r="6" fill="#FF5F57"/>
  <circle cx="${x + 44}" cy="${y + 24}" r="6" fill="#FFBD2E"/>
  <circle cx="${x + 64}" cy="${y + 24}" r="6" fill="#28C840"/>
  ${rect(x + 96, y + 13, width - 120, 22, { fill: '#E9EDF2', radius: 11 })}
  ${text(title, x + 112, y + 29, { size: 12, fill: '#667085', weight: 500 })}
`

const pageText = (x, y, width, lines, highlightIndexes = []) => {
  const lineHeight = 30
  return lines
    .map((line, index) => {
      const yy = y + index * lineHeight
      const words = line.split(' ')
      const highlight = highlightIndexes.includes(index)
      const lineWidth = Math.min(width, Math.max(160, line.length * 10.2))
      return `
        ${highlight ? rect(x - 6, yy - 21, lineWidth + 12, 28, { fill: '#FFEB3B', radius: 5, opacity: 0.85 }) : ''}
        ${text(line, x, yy, { size: 20, fill: '#283344', weight: 450 })}
      `
    })
    .join('')
}

const toolbarButton = (x, y, label, fill = '#673AB8') => `
  ${rect(x, y, 92, 42, { fill, radius: 21 })}
  ${text(label, x + 46, y + 27, { size: 15, fill: '#ffffff', anchor: 'middle', weight: 700 })}
`

const definitions = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FAFBFC"/>
      <stop offset="52%" stop-color="#EFF5FF"/>
      <stop offset="100%" stop-color="#F8F3FF"/>
    </linearGradient>
    <linearGradient id="purple" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7C4DFF"/>
      <stop offset="100%" stop-color="#4B2E83"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#172033" flood-opacity="0.16"/>
    </filter>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#172033" flood-opacity="0.18"/>
    </filter>
  </defs>
`

const screenshot = (title, subtitle, body) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
  ${definitions}
  ${rect(0, 0, 1280, 800, { fill: '#F7F9FC', radius: 0 })}
  ${logo(68, 56, 54)}
  ${text('AnnHub', 132, 91, { size: 34, weight: 800, fill: '#1E2B3A' })}
  ${text(title, 68, 158, { size: 48, weight: 820, fill: '#172033' })}
  ${text(subtitle, 70, 202, { size: 21, weight: 450, fill: '#526070' })}
  ${body}
</svg>
`

const screenshot1 = screenshot(
  'Highlight and collect text on any page',
  'Capture passages with stable highlights, context, source links, and notes.',
  `
  ${browserFrame(72, 254, 780, 450, 'research.example/article')}
  ${text('Designing reliable knowledge workflows', 112, 352, { size: 32, weight: 800 })}
  ${pageText(114, 405, 640, [
    'Readers often discover useful ideas while moving',
    'between articles, feeds, product docs, and research notes.',
    'AnnHub keeps each highlight connected to its source page',
    'so important context survives after the tab is closed.',
    'Notes can be attached immediately without breaking flow.',
  ], [2, 4])}
  ${rect(910, 280, 278, 304, { fill: '#ffffff', stroke: '#E4E7EC', radius: 16, filter: 'url(#shadow)' })}
  ${text('Saved Highlight', 946, 336, { size: 24, weight: 800 })}
  ${rect(946, 366, 196, 12, { fill: '#FFEB3B', radius: 6 })}
  ${rect(946, 392, 170, 12, { fill: '#E9EDF2', radius: 6 })}
  ${rect(946, 418, 214, 12, { fill: '#E9EDF2', radius: 6 })}
  ${text('Context before and after', 946, 476, { size: 18, weight: 700, fill: '#364152' })}
  ${text('Original URL + source URL', 946, 512, { size: 18, weight: 700, fill: '#364152' })}
  ${text('Optional note', 946, 548, { size: 18, weight: 700, fill: '#364152' })}
  `
)

const screenshot2 = screenshot(
  'Mode A: precise capture when text is selected',
  'Select a passage, then choose capture, note, or highlighter mode from the hover menu.',
  `
  ${browserFrame(90, 254, 790, 434, 'docs.example/guide')}
  ${text('Deep reading without losing your place', 132, 348, { size: 31, weight: 800 })}
  ${pageText(136, 406, 620, [
    'Annotating should happen exactly where the insight appears.',
    'A lightweight hover menu keeps capture actions nearby.',
    'Use notes for interpretation, follow-up tasks, or reminders.',
    'Switch into highlighter mode when a page has many findings.',
  ], [1])}
  ${rect(468, 438, 342, 70, { fill: '#172033', radius: 35, filter: 'url(#softShadow)' })}
  ${toolbarButton(488, 452, 'Clip', '#673AB8')}
  ${toolbarButton(590, 452, 'Note', '#475467')}
  ${toolbarButton(692, 452, 'Mark', '#F4C430')}
  ${rect(926, 280, 262, 320, { fill: '#ffffff', stroke: '#E4E7EC', radius: 16, filter: 'url(#shadow)' })}
  ${text('Precise Mode', 958, 338, { size: 28, weight: 820 })}
  ${text('1. Select text', 958, 392, { size: 20, weight: 650, fill: '#364152' })}
  ${text('2. Pick an action', 958, 436, { size: 20, weight: 650, fill: '#364152' })}
  ${text('3. Save with context', 958, 480, { size: 20, weight: 650, fill: '#364152' })}
  ${rect(958, 522, 154, 40, { fill: '#F5F0FF', radius: 20 })}
  ${text('Mode A', 1035, 548, { size: 18, anchor: 'middle', fill: '#673AB8', weight: 800 })}
  `
)

const screenshot3 = screenshot(
  'Mode B: fast highlighter for dense pages',
  'Use Alt+H or Cmd+Shift+H, select repeatedly, and watch the capture count update.',
  `
  ${browserFrame(84, 250, 804, 438, 'news.example/feed')}
  ${text('Daily reading queue', 126, 340, { size: 31, weight: 800 })}
  ${pageText(130, 395, 610, [
    'Short bursts of research often produce many small highlights.',
    'Machine-gun capture mode saves each selection automatically.',
    'The capsule confirms that the extension is listening.',
    'Press Esc when you are done collecting from the page.',
  ], [0, 1, 2])}
  ${rect(628, 290, 220, 48, { fill: '#172033', radius: 24, filter: 'url(#softShadow)' })}
  ${text('Highlighter On', 660, 321, { size: 18, fill: '#ffffff', weight: 800 })}
  ${rect(790, 303, 34, 22, { fill: '#FFF8B4', radius: 11 })}
  ${text('12', 807, 319, { size: 14, fill: '#172033', weight: 800, anchor: 'middle' })}
  ${rect(934, 282, 252, 292, { fill: '#ffffff', stroke: '#E4E7EC', radius: 16, filter: 'url(#shadow)' })}
  ${text('Sweep Mode', 966, 342, { size: 28, weight: 820 })}
  ${text('Select text repeatedly', 966, 396, { size: 20, weight: 650, fill: '#364152' })}
  ${text('Auto-saves clips', 966, 440, { size: 20, weight: 650, fill: '#364152' })}
  ${text('Esc exits the mode', 966, 484, { size: 20, weight: 650, fill: '#364152' })}
  ${rect(966, 522, 132, 40, { fill: '#FFF8B4', radius: 20 })}
  ${text('Mode B', 1032, 548, { size: 18, anchor: 'middle', fill: '#3B3100', weight: 800 })}
  `
)

const screenshot4 = screenshot(
  'Vocabulary labels for English reading',
  'Mark unfamiliar words in-page with local Eudic snapshots and optional LLM explanations.',
  `
  ${browserFrame(70, 248, 788, 444, 'longform.example/essay')}
  ${text('How teams build durable systems', 112, 342, { size: 31, weight: 800 })}
  ${pageText(116, 396, 620, [
    'A resilient workflow reduces cognitive overhead.',
    'Readers can inspect terminology without leaving the article.',
    'Local vocabulary snapshots keep common words out of sight.',
    'Context-aware glosses help distinguish subtle meanings.',
  ], [])}
  ${rect(226, 376, 92, 52, { fill: '#F3EFFF', stroke: '#C7B7FF', radius: 6 })}
  ${text('resilient', 272, 401, { size: 18, anchor: 'middle', weight: 800, fill: '#4B2E83' })}
  ${text('有弹性的', 272, 421, { size: 13, anchor: 'middle', weight: 700, fill: '#4B2E83' })}
  ${rect(406, 436, 110, 52, { fill: '#F3EFFF', stroke: '#C7B7FF', radius: 6 })}
  ${text('terminology', 461, 461, { size: 18, anchor: 'middle', weight: 800, fill: '#4B2E83' })}
  ${text('术语', 461, 481, { size: 13, anchor: 'middle', weight: 700, fill: '#4B2E83' })}
  ${rect(904, 270, 292, 360, { fill: '#ffffff', stroke: '#E4E7EC', radius: 16, filter: 'url(#shadow)' })}
  ${text('Reading Aid', 940, 330, { size: 28, weight: 820 })}
  ${text('English page detection', 940, 384, { size: 19, weight: 650, fill: '#364152' })}
  ${text('Known-word filtering', 940, 426, { size: 19, weight: 650, fill: '#364152' })}
  ${text('Eudic sync', 940, 468, { size: 19, weight: 650, fill: '#364152' })}
  ${text('LLM fallback glosses', 940, 510, { size: 19, weight: 650, fill: '#364152' })}
  ${rect(940, 556, 174, 40, { fill: '#F5F0FF', radius: 20 })}
  ${text('Vocab Label', 1027, 582, { size: 18, anchor: 'middle', fill: '#673AB8', weight: 800 })}
  `
)

const screenshot5 = screenshot(
  'Manage highlights, words, sync, and LLM settings',
  'A focused options surface keeps storage, vocabulary, Logseq, and model configuration together.',
  `
  ${rect(82, 250, 1116, 456, { fill: '#ffffff', stroke: '#D7DCE3', radius: 18, filter: 'url(#shadow)' })}
  ${rect(82, 250, 248, 456, { fill: '#F5F7FA', stroke: '#E4E7EC', radius: 18 })}
  ${logo(122, 294, 42)}
  ${text('AnnHub', 178, 326, { size: 28, weight: 820 })}
  ${['Highlights', 'Words', 'Vocabulary', 'Logseq', 'Settings'].map((item, index) => `
    ${rect(114, 376 + index * 54, 176, 38, { fill: index === 2 ? '#EEE7FF' : 'transparent', radius: 9 })}
    ${text(item, 138, 401 + index * 54, { size: 18, weight: index === 2 ? 800 : 600, fill: index === 2 ? '#673AB8' : '#526070' })}
  `).join('')}
  ${text('Vocabulary', 374, 322, { size: 34, weight: 820 })}
  ${text('Eudic sync', 374, 382, { size: 20, weight: 800, fill: '#364152' })}
  ${rect(374, 408, 318, 42, { fill: '#F8FAFC', stroke: '#E4E7EC', radius: 8 })}
  ${text('Configured token hidden for safety', 394, 435, { size: 16, fill: '#667085' })}
  ${text('LLM provider', 374, 500, { size: 20, weight: 800, fill: '#364152' })}
  ${rect(374, 526, 318, 42, { fill: '#F8FAFC', stroke: '#E4E7EC', radius: 8 })}
  ${text('OpenAI-compatible endpoint', 394, 553, { size: 16, fill: '#667085' })}
  ${rect(750, 370, 360, 216, { fill: '#F8FAFC', stroke: '#E4E7EC', radius: 14 })}
  ${text('Snapshot status', 782, 420, { size: 22, weight: 820 })}
  ${text('2,418 words synced', 782, 470, { size: 20, weight: 700, fill: '#364152' })}
  ${text('Mastered words filtered', 782, 510, { size: 20, weight: 700, fill: '#364152' })}
  ${rect(782, 540, 140, 40, { fill: '#673AB8', radius: 20 })}
  ${text('Refresh', 852, 566, { size: 17, fill: '#ffffff', weight: 800, anchor: 'middle' })}
  `
)

const tileBase = (width, height, content) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${definitions}
  ${rect(0, 0, width, height, { fill: '#F7F9FC', radius: 0 })}
  ${content}
</svg>
`

const smallTile = tileBase(440, 280, `
  ${logo(34, 42, 54)}
  ${text('AnnHub', 98, 76, { size: 34, weight: 850 })}
  ${text('Capture web text', 38, 136, { size: 24, weight: 780 })}
  ${text('Highlight, annotate, and sync.', 38, 168, { size: 18, weight: 500, fill: '#526070' })}
  ${rect(38, 206, 126, 42, { fill: '#673AB8', radius: 21 })}
  ${text('Chrome Extension', 101, 233, { size: 14, anchor: 'middle', fill: '#ffffff', weight: 800 })}
  ${rect(286, 92, 118, 116, { fill: '#ffffff', stroke: '#D7DCE3', radius: 10, filter: 'url(#softShadow)' })}
  ${rect(304, 124, 82, 12, { fill: '#FFEB3B', radius: 6 })}
  ${rect(304, 152, 58, 12, { fill: '#E9EDF2', radius: 6 })}
  ${rect(304, 180, 76, 12, { fill: '#E9EDF2', radius: 6 })}
`)

const marqueeTile = tileBase(1400, 560, `
  ${logo(86, 78, 78)}
  ${text('AnnHub', 182, 126, { size: 56, weight: 860 })}
  ${text('Annotate and capture anywhere.', 86, 224, { size: 44, weight: 840 })}
  ${text('Highlight passages, collect clips, and label vocabulary', 88, 282, { size: 23, weight: 480, fill: '#526070' })}
  ${text('while reading in Chrome.', 88, 318, { size: 23, weight: 480, fill: '#526070' })}
  ${rect(88, 348, 198, 54, { fill: '#673AB8', radius: 27 })}
  ${text('Built for Chrome', 187, 382, { size: 20, anchor: 'middle', fill: '#ffffff', weight: 820 })}
  ${browserFrame(770, 72, 520, 350, 'annhub://reading')}
  ${text('Research notes', 810, 166, { size: 28, weight: 820 })}
  ${pageText(814, 220, 370, [
    'Save the exact passage that matters.',
    'Restore highlights when you return.',
    'Add notes and vocabulary labels inline.',
  ], [0, 2])}
  ${rect(1054, 300, 178, 46, { fill: '#172033', radius: 23, filter: 'url(#softShadow)' })}
  ${text('Highlighter On', 1143, 330, { size: 17, fill: '#ffffff', weight: 800, anchor: 'middle' })}
`)

const assets = [
  ['screenshot-1-highlight-any-page', screenshot1, 1280, 800],
  ['screenshot-2-mode-a-hover-menu', screenshot2, 1280, 800],
  ['screenshot-3-mode-b-fast-capture', screenshot3, 1280, 800],
  ['screenshot-4-vocabulary-labels', screenshot4, 1280, 800],
  ['screenshot-5-settings-sync', screenshot5, 1280, 800],
  ['small-promo-tile-440x280', smallTile, 440, 280],
  ['marquee-promo-tile-1400x560', marqueeTile, 1400, 560],
]

for (const [name, svg, width, height] of assets) {
  const svgPath = resolve(outDir, `${name}.svg`)
  const pngPath = resolve(outDir, `${name}.png`)
  writeFileSync(svgPath, svg)
  execFileSync('magick', [
    '-background',
    'white',
    svgPath,
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-resize',
    `${width}x${height}!`,
    '-depth',
    '8',
    '-strip',
    '-define',
    'png:color-type=2',
    pngPath,
  ])
}

console.log(`Generated ${assets.length} Chrome Web Store assets in ${outDir}`)
