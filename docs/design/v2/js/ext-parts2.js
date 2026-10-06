// 扩展页（碎片库 / 截图集 / 设置）的零件。

// 延迟曲线缩略图：visual 示例用（examples.md：重试开始后 5 分钟 p99 从 120ms 升到 2s）
const chartSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="168" height="112" fill="#fff"/>
  <path d="M10 24H160M10 52H160M10 80H160" stroke="#e6e8ee" stroke-width="1"/>
  <path d="M10 88 L38 86 L62 87 L84 84 L96 58 L108 30 L124 22 L142 26 L160 24" fill="none" stroke="#3b6fe0" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M96 12 V98" stroke="#e5484d" stroke-width="1.6" stroke-dasharray="3 3"/>
  <circle cx="108" cy="30" r="7" fill="none" stroke="#e5484d" stroke-width="1.8"/>
  <text x="14" y="15" font-size="8" fill="#6b7280" font-family="sans-serif">downstream p99</text>
</svg>`

const thumb = (o = {}) => `<div class="thumb" style="${o.style || ''}">${chartSvg()}</div>`

const xpNav = (tab, o = {}) => `<div class="xp-nav">
  <div class="xp-brand"><svg class="i" aria-hidden="true"><use href="#i-logo"/></svg>AnnHub</div>
  <div class="xp-tabs">${[['lib', '碎片库'], ['shots', '截图集'], ['set', '设置']].map(([k, t]) => `<span class="xp-tab ${k === tab ? 'on' : ''}">${t}</span>`).join('')}</div>
  <span class="grow"></span>${o.navRight || ''}
</div>`

// 扩展页放进 Chrome 标签页
const extPage = (inner, o = {}) =>
  browser(`<div class="xp" style="height:100%;overflow:hidden">${xpNav(o.tab || 'lib', o)}${inner}</div>`, {
    h: o.h || 760,
    title: `${{ lib: '碎片库', shots: '截图集', set: '设置' }[o.tab || 'lib']} · AnnHub`,
    url: `chrome-extension://annhub/${{ lib: 'library', shots: 'screenshots', set: 'settings' }[o.tab || 'lib']}.html`,
  })

const libTop = (o = {}) => `<div class="hs g10" style="position:relative">${o.pins ? pin(o.pins[0], 'pin-in') : ''}
  <div class="search ${o.focus ? 'is-focus' : ''}">${I('search')}<span>${o.q ? esc(o.q) : '搜索碎片…'}</span>${o.q ? '' : '<span class="grow"></span><kbd>/</kbd>'}</div>
  ${btn('新建灵感', { icon: 'lightbulb' })}
  ${btn('', { icon: 'ellipsis', iconOnly: true, v: 'ghost' })}
</div>`

const libFilters = (o = {}) => `<div class="fbar" style="position:relative">${o.pins ? pin(o.pins[0], 'pin-in') : ''}
  <span class="fchip ${o.on === 'kind' ? 'on' : ''}">${I('layers')}${o.on === 'kind' ? '类型：概念 · 方法' : '类型'}${I('chevron-down')}</span>
  <span class="fchip">${I('globe')}来源${I('chevron-down')}</span>
  <span class="fchip">${I('tag')}标签${I('chevron-down')}</span>
  <span class="fchip">${I('calendar')}时间${I('chevron-down')}</span>
  <span class="grow"></span>
  <span class="t-sm muted">${o.count || '共 128 条'}</span>
  ${o.on ? `<span class="link t-sm">清除筛选</span>` : ''}
</div>`

const libCard = (f, o = {}) => `<div class="fcard ${o.sel ? 'sel' : ''}">
  ${o.pin ? pin(o.pin, 'pin-in') : ''}
  <div class="vs g6" style="min-width:0">
    <div class="hs g8">${kchip(f.kind)}</div>
    <div class="ttl clamp-2">${esc(f.title)}</div>
    <div class="ex clamp-1">${esc(f.excerpt)}</div>
    <div class="meta">${I('globe')}<span>${f.host}</span><span>·</span><span>${f.when}</span>${f.tags.length ? '<span>·</span>' : ''}${f.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>
  </div>
  <div class="vs g6" style="align-items:flex-end;justify-content:space-between">
    ${f.img ? thumb() : '<span></span>'}
  </div>
</div>`

const libList = (ids, o = {}) => ids.map(id => libCard(FRAGS.find(f => f.id === id), { sel: o.sel === id, pin: o.pinCard === id ? o.pinN : 0 })).join('')

const fragById = id => FRAGS.find(f => f.id === id)
