// 生成 UI 片段的小工具：返回 HTML 字符串，供各画板拼装。样式见 css/ui.css、css/ext.css。
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const I = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`

// 标注钉：编号与画板下方 notes 的序号对应，页眉开关控制显隐
const pin = (n, cls = '') => `<i class="pin ${cls}">${n}</i>`

const btn = (label, o = {}) => {
  const { v = '', icon, iconR, kbd, sm, lg, focus, off, cls = '', attrs = '', iconOnly } = o
  const c = ['btn', v && `btn-${v}`, sm && 'btn-sm', lg && 'btn-lg', focus && 'is-focus', off && 'is-disabled', iconOnly && 'btn-icon', cls].filter(Boolean).join(' ')
  return `<button type="button" class="${c}" ${off ? 'disabled' : ''} ${attrs}>${icon ? I(icon) : ''}${label ? `<span>${label}</span>` : ''}${iconR ? I(iconR) : ''}${kbd ? `<span class="kbd-in">${kbd}</span>` : ''}</button>`
}

const chip = (label, o = {}) => `<span class="chip ${o.v ? `chip-${o.v}` : ''} ${o.cls || ''}">${o.icon ? I(o.icon) : ''}${label}</span>`

// 条目类型：图标 + 文字 + 颜色（visual.md §3）
const tchip = (t, o = {}) => `<span class="tchip t-${t} ${o.sm ? 'sm' : ''}">${I(TYPES[t].icon)}${o.en ? TYPES[t].en : TYPES[t].zh}</span>`

const ttile = t => `<span class="ttile t-${t}">${I(TYPES[t].icon)}</span>`

// 属性类型：图标 + 文字
const pticon = t => I(PTYPES[t].icon)

const hlDot = (c, on) => `<i class="hl-dot c-${c} ${on ? 'is-on' : ''}"></i>`

const tags = list => list.map(t => `<span class="tag">#${esc(t)}</span>`).join('')

const vtag = (t, x = true) => `<span class="vtag">${esc(t)}${x ? I('x') : ''}</span>`

const cbx = (on, label = '', o = {}) => `<span class="hs g8 ${o.cls || ''}"><i class="cb ${on ? 'on' : ''}">${on ? I('check') : ''}</i>${label ? `<span>${label}</span>` : ''}</span>`
const rdo = (on, label = '', o = {}) => `<span class="hs g8 ${o.cls || ''}"><i class="rb ${on ? 'on' : ''}"></i>${label ? `<span>${label}</span>` : ''}</span>`
const sw = on => `<i class="switch ${on ? 'on' : ''}"></i>`

const keys = (...ks) => ks.map(k => `<kbd>${k}</kbd>`).join('')

const banner = (v, html, o = {}) => {
  const icon = o.icon || { ok: 'circle-check', warn: 'triangle-alert', danger: 'circle-alert', info: 'info', brand: 'info', '': 'info' }[v || '']
  return `<div class="banner ${v || ''} ${o.cls || ''}">${I(icon)}<div class="grow">${html}</div>${o.action ? `<div class="none hs g6">${o.action}</div>` : ''}</div>`
}

const toast = (html, o = {}) => `<div class="toast ${o.cls || ''}">${I(o.icon || 'circle-check')}<span>${html}</span></div>`

const field = (label, control, o = {}) =>
  `<div class="field ${o.cls || ''}"><div class="label">${label}${o.opt ? '<span class="opt">（可选）</span>' : ''}${o.right ? `<span class="grow"></span><span class="opt">${o.right}</span>` : ''}</div>${control}${o.help ? `<div class="help ${o.err ? 'is-error' : ''}">${o.help}</div>` : ''}</div>`

const input = (v, o = {}) => `<div class="input ${o.focus ? 'is-focus' : ''} ${o.err ? 'is-error' : ''} ${o.cls || ''}" style="${o.style || ''}">${v ? esc(v) : `<span class="ph">${o.ph || ''}</span>`}</div>`

const textarea = (v, o = {}) =>
  `<div class="textarea ${o.focus ? 'is-focus' : ''} ${o.err ? 'is-error' : ''} ${o.cls || ''}" style="min-height:${o.h || 72}px;${o.style || ''}">${v ? v : `<span class="ph">${o.ph || ''}</span>`}${o.caret ? '<i class="caret"></i>' : ''}</div>`

const select = (v, o = {}) => `<div class="select ${o.focus ? 'is-focus' : ''} ${o.cls || ''}" style="${o.style || ''}"><span class="truncate">${v}</span>${I('chevron-down', 'i-sm muted')}</div>`

const favicon = (i = 0) => `<i class="favicon ${['', 'b', 'c'][i % 3]}"></i>`

const menuItem = (icon, label, o = {}) => `<div class="menu-i ${o.on ? 'on' : ''} ${o.danger ? 'c-danger' : ''}">${icon ? I(icon) : ''}<span>${label}</span>${o.sc ? `<span class="sc">${o.sc}</span>` : ''}</div>`

const statLine = (label, value, o = {}) => `<div class="hs between" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="${o.muted === false ? '' : 'muted'}">${label}</span><span class="b tnum ${o.cls || ''}">${value}</span></div>`
