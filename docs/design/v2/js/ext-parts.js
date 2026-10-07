// 扩展画板共用的零件：Chrome 外壳、网页模拟、选区菜单。
const SEL_TEXT = 'the consumer signals demand upstream so the producer slows down, pauses, or drops work it cannot deliver'

const browser = (view, o = {}) => `<div class="bf" style="height:${o.h || 620}px">
  <div class="bf-tabs">
    <div class="bf-lights"><i></i><i></i><i></i></div>
    <div class="bf-tab">${favicon(0)}<span class="truncate grow">${o.title || 'Backpressure in Streams'}</span>${I('x', 'i-sm')}</div>
    ${o.tab2 ? `<div class="bf-tab">${favicon(1)}<span class="truncate grow">${o.tab2}</span>${I('x', 'i-sm')}</div>` : '<div class="bf-tab off" style="min-width:36px;padding:0 10px">' + I('plus', 'i-sm') + '</div>'}
  </div>
  <div class="bf-bar">${I('arrow-left')}${I('arrow-right')}${I('rotate-ccw')}
    <div class="bf-url">${I('lock', 'i-sm')}<span class="truncate">${o.url || 'engineering.example.com/posts/backpressure-in-streams'}</span></div>
    <div class="bf-ext">${I('puzzle')}<svg class="i brandmark" aria-hidden="true"><use href="#i-logo"/></svg></div>
  </div>
  <div class="bf-view">${view}</div>
</div>`

// 网页模拟。sel: none | sel（蓝色选区）| hl（高亮）| note（高亮 + 备注）；color 取自高亮调色板
const article = (o = {}) => {
  const base = { sel: 'sel', hl: 'hl', note: 'hl note' }[o.sel] || ''
  const cls = base && o.color ? `${base} c-${o.color}` : base
  const selected = cls ? `<span class="${cls} the-sel">${SEL_TEXT}</span>` : SEL_TEXT
  return `<div class="pg" style="${o.style || ''}">
    <div class="pg-nav"><b>engineering.example.com</b><span>Articles</span><span>Topics</span><span>About</span></div>
    <div class="pg-art">
      <h1>Backpressure in Streams</h1>
      <div class="pg-by">Platform Engineering · Updated Sep 28 · 9 min read</div>
      <p>When a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down with it.</p>
      <p><b>Backpressure</b> is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, ${selected}.</p>
      <h2>Three common strategies</h2>
      <ol><li>Demand signaling: the consumer grants credits and the producer sends no more than it was granted.</li><li>Bounded buffers: queues with a hard limit that block or reject at the edge.</li><li>Load shedding: drop the least valuable work first, on purpose.</li></ol>
      <p>Retries can amplify an outage when the dependency is already saturated. Without a budget, every client retries at once.</p>
    </div>
    ${o.extra || ''}
  </div>`
}

// 选区菜单（extension.md §2.1）：三项，顺序固定为剪藏、高亮、截图；图标 + 短文本，菜单项都用名词
const HM_LABELS = {
  zh: { clip: '剪藏', hl: '高亮', shot: '截图' },
  en: { clip: 'Clip', hl: 'Highlight', shot: 'Screenshot' },
}

const hoverMenu = (o = {}) => {
  const L = HM_LABELS[o.lang || 'zh']
  const b = (t, label, i) => `<div class="hm-b t-${t} ${o.hover === i ? 'is-hover' : ''} ${o.focus === i ? 'is-focus' : ''}" role="button" aria-label="${label}">${I(TYPES[t].icon)}<span>${label}</span></div>`
  return `<div class="hm ${o.below ? 'below' : ''} ${o.static ? 'static' : ''}" ${o.anchor ? `data-anchor="${o.anchor}" data-place="${o.below ? 'below' : 'above'}"` : ''} style="${o.style || ''}">
    ${o.pin ? pin(o.pin) : ''}
    ${b('clip', L.clip, 0)}${b('highlight', L.hl, 1)}${b('screenshot', L.shot, 2)}
    ${o.tip || ''}
  </div>`
}

const tipBubble = (title, desc, style = '', extra = '') => `<div class="hm-tip tip" style="${style}">${extra}${title}<small>${desc}</small></div>`

// 页面内小视窗：只露出网页的一段，用于局部画板
const miniView = (inner, h = 380) => `<div class="mv" style="height:${h}px">${inner}</div>`
