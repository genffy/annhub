// 应用壳（左导航 + 右内容）与各视图的零件（extension.md §2.2–§2.6、§4）。

// ── 缩略图素材（延迟曲线、状态机、表格、柱状图） ────────────────────────────
const chartSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="168" height="112" fill="#fff"/>
  <path d="M10 24H160M10 52H160M10 80H160" stroke="#e6e8ee" stroke-width="1"/>
  <path d="M10 88 L38 86 L62 87 L84 84 L96 58 L108 30 L124 22 L142 26 L160 24" fill="none" stroke="#3b6fe0" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M96 12 V98" stroke="#e5484d" stroke-width="1.6" stroke-dasharray="3 3"/>
  <circle cx="108" cy="30" r="7" fill="none" stroke="#e5484d" stroke-width="1.8"/>
  <text x="14" y="15" font-size="8" fill="#6b7280" font-family="sans-serif">downstream p99</text>
</svg>`
const diagramSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><g fill="#eef2ff" stroke="#6b7bd6" stroke-width="1.6"><rect x="14" y="40" width="40" height="30" rx="6"/><rect x="64" y="14" width="40" height="30" rx="6"/><rect x="64" y="66" width="40" height="30" rx="6"/><rect x="114" y="40" width="40" height="30" rx="6"/></g><g stroke="#9aa1b2" stroke-width="1.6" fill="none"><path d="M54 52 L64 34"/><path d="M54 58 L64 78"/><path d="M104 32 L114 48"/><path d="M104 80 L114 62"/></g><g font-size="7" fill="#4b5563" font-family="sans-serif"><text x="20" y="58">closed</text><text x="70" y="32">open</text><text x="68" y="84">half-open</text><text x="120" y="58">probe</text></g></svg>`
const tableSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><g fill="#f3f4f8"><rect x="10" y="12" width="148" height="16"/></g><g stroke="#e6e8ee" stroke-width="1"><path d="M10 44H158M10 60H158M10 76H158M10 92H158"/></g><g font-size="7" fill="#4b5563" font-family="sans-serif"><text x="16" y="23">service</text><text x="66" y="23">budget</text><text x="116" y="23">used</text><text x="16" y="55">gateway</text><text x="66" y="55">10%</text><text x="116" y="55">7%</text><text x="16" y="71">ledger</text><text x="66" y="71">5%</text><text x="116" y="71">9%</text><text x="16" y="87">notify</text><text x="66" y="87">20%</text><text x="116" y="87">3%</text></g></svg>`
const barsSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><path d="M12 92H156" stroke="#d6d9e2"/><g fill="#7c8be0"><rect x="22" y="62" width="16" height="30"/><rect x="48" y="48" width="16" height="44"/><rect x="74" y="30" width="16" height="62"/><rect x="100" y="52" width="16" height="40"/><rect x="126" y="70" width="16" height="22"/></g><text x="14" y="16" font-size="8" fill="#6b7280" font-family="sans-serif">error rate by hour</text></svg>`

const imgSvg = k => ({ chart: chartSvg, diagram: diagramSvg, table: tableSvg, bars: barsSvg }[k] || chartSvg)()
const thumb = (k, o = {}) => `<div class="thumb" style="${o.style || ''}">${imgSvg(k)}</div>`

// ── 导航与壳 ────────────────────────────────────────────────────────────
const NAV = [
  { id: 'all', icon: 'library', zh: '全部', en: 'All', n: COUNTS.all },
  { id: 'clip', icon: 'bookmark', zh: '剪藏', en: 'Clips', n: COUNTS.clip, type: 'clip' },
  { id: 'highlight', icon: 'highlighter', zh: '高亮', en: 'Highlights', n: COUNTS.highlight, type: 'highlight' },
  { id: 'screenshot', icon: 'scan', zh: '截图', en: 'Screenshots', n: COUNTS.screenshot, type: 'screenshot' },
]
const NAV2 = [
  { id: 'properties', icon: 'tags', zh: '属性', en: 'Properties', n: COUNTS.props },
  { id: 'settings', icon: 'settings', zh: '设置', en: 'Settings' },
]

const SHELL_L = {
  zh: { lib: '资料库', manage: '管理', export: '导出内容', storage: '本地存储', used: '126 MB', shot: '截图' },
  en: { lib: 'Library', manage: 'Manage', export: 'Export content', storage: 'Local storage', used: '126 MB', shot: 'Screenshot' },
}

const navItem = (it, active, lang, counts) => {
  const n = counts && it.id in counts ? counts[it.id] : it.n
  return `<div class="nav-i ${it.type ? `t-${it.type}` : ''} ${it.id === active ? 'on' : ''}" ${it.id === active ? 'aria-current="page"' : ''}>${I(it.icon)}<span>${lang === 'en' ? it.en : it.zh}</span>${n != null ? `<span class="n">${n}</span>` : ''}</div>`
}

// o: { active, rail, narrow, lang, main, drawer, overlay, pins:{nav, foot}, counts:{all,clip,…}, used, style }
const shell = (o = {}) => {
  const lang = o.lang || 'zh'
  const L = SHELL_L[lang]
  const foot = o.rail
    ? `<div class="nav-foot">${btn('', { icon: 'download', iconOnly: true })}</div>`
    : `<div class="nav-foot"><div class="meter"><div class="hs between"><span>${L.storage}</span><span class="tnum">${o.used || L.used}</span></div><div class="progress"><i style="width:${o.used ? 0 : 3}%"></i></div></div><div style="position:relative">${o.pins && o.pins.foot ? pin(o.pins.foot, 'pin-in-r') : ''}${btn(L.export, { icon: 'download', cls: 'btn-block' })}</div><div class="t-xs muted hs g6 wrap hide-rail">${I('keyboard', 'i-sm')}<span>${L.shot}</span>${keys('⌘', '⇧', 'S')}</div></div>`
  return `<div class="app ${o.rail ? 'is-rail is-narrow' : ''} ${o.narrow ? 'is-narrow' : ''}" style="${o.style || ''}">
    <nav class="nav" aria-label="AnnHub">
      ${o.pins && o.pins.nav ? pin(o.pins.nav, 'pin-in') : ''}
      <div class="nav-top"><div class="nav-brand"><svg class="i" aria-hidden="true"><use href="#i-logo"/></svg><span>AnnHub</span></div><span class="nav-fold" aria-label="折叠导航">${I(o.rail ? 'panel-left-open' : 'panel-left-close')}</span></div>
      <div class="nav-label">${L.lib}</div>
      ${NAV.map(it => navItem(it, o.active, lang, o.counts)).join('')}
      <div class="nav-label">${L.manage}</div>
      ${NAV2.map(it => navItem(it, o.active, lang, o.counts)).join('')}
      ${foot}
    </nav>
    <div class="main">${o.main}${o.drawer || ''}${o.overlay || ''}</div>
  </div>`
}

// 把应用页放进 Chrome 标签页
const TAB_TITLES = { all: '全部', clip: '剪藏', highlight: '高亮', screenshot: '截图', properties: '属性', settings: '设置' }
const appInTab = (appHtml, o = {}) =>
  browser(appHtml, {
    h: o.h || 760,
    title: o.title || `${TAB_TITLES[o.active || 'all']} · AnnHub`,
    url: o.url || `chrome-extension://annhub/app.html#/${{ all: 'all', clip: 'clips', highlight: 'highlights', screenshot: 'screenshots', properties: 'properties', settings: 'settings' }[o.active || 'all']}`,
  })

// ── 页头、搜索、筛选 ──────────────────────────────────────────────────────
const searchBox = (o = {}) =>
  `<div class="search ${o.focus ? 'is-focus' : ''}" style="flex:none;width:${o.w || 320}px;position:relative">${o.pin ? pin(o.pin) : ''}${I('search')}<span class="truncate">${o.q ? esc(o.q) : o.ph || '搜索条目…'}</span>${o.q ? '' : '<span class="grow"></span><kbd>/</kbd>'}</div>`

const pageHead = (o = {}) =>
  `<div class="phead" style="position:relative">${o.pin ? pin(o.pin, 'pin-in') : ''}<div class="grow"><h1>${o.title}</h1><div class="sub">${o.sub || ''}</div></div>${o.right || ''}</div>`

// 筛选条：类型（仅“全部”视图）、来源、标签、时间、属性；已生效的条件显示为高亮的芯片
const fbar = (o = {}) => {
  const f = (icon, label) => `<span class="fchip">${I(icon)}${label}${I('chevron-down')}</span>`
  const on = (o.active || []).map(a => `<span class="fchip on">${I(a.icon)}${a.label}${I('x')}</span>`).join('')
  return `<div class="fbar" style="position:relative">${o.pin ? pin(o.pin) : ''}
    ${o.noType ? '' : f('layout-grid', '类型')}${o.color ? f('droplet', '颜色') : ''}${f('globe', '来源')}${f('tag', '标签')}${f('calendar', '时间')}${f('sliders-horizontal', '属性')}
    ${on}<span class="grow"></span><span class="t-sm muted">${o.count || '共 128 条'}</span>${o.active && o.active.length ? '<span class="link t-sm">清除筛选</span>' : ''}</div>`
}

// ── 列表视图 ─────────────────────────────────────────────────────────────
const propPills = e => {
  const p = e.props || {}
  const out = []
  if (p.project != null) out.push(`<span class="ppill">${I('text', '')}<span>project</span><b>${esc(p.project)}</b></span>`)
  if (p.reviewed === true) out.push(`<span class="ppill">${I('square-check')}<span>reviewed</span></span>`)
  if (p.priority != null) out.push(`<span class="ppill">${I('hash')}<span>priority</span><b>${esc(p.priority)}</b></span>`)
  return out.join('')
}

// 有高亮的剪藏在行里显示高亮数
const hlCount = e => (e.hls && e.hls.length ? `<span class="hlc">${I('highlighter', 'i-sm')}${e.hls.length} 高亮</span>` : '')

// o: { sel, hov, pin }
const entryRow = (e, o = {}) => `<div class="erow ${o.sel ? 'sel' : ''} ${o.hov ? 'hov' : ''}">
  ${o.pin ? pin(o.pin, 'pin-in-r') : ''}
  ${ttile(e.type)}
  <div style="min-width:0">
    <div class="tx clamp-2 ${e.type === 'screenshot' ? 'b' : ''}">${esc(e.type === 'screenshot' ? e.title : mdPlain(e.content))}</div>
    <div class="meta">${tchip(e.type, { sm: true })}${e.type !== 'screenshot' ? `<span class="ttl truncate">${esc(e.title)}</span>` : ''}<span>${e.host}</span><span>·</span><span>${e.when}</span>${tags(e.tags)}${propPills(e)}${hlCount(e)}</div>
  </div>
  <div class="side">${e.type === 'screenshot' ? thumb(e.img) : ''}<span class="acts">${btn('', { icon: 'arrow-up-right', iconOnly: true, sm: true, v: 'ghost' })}${btn('', { icon: 'trash', iconOnly: true, sm: true, v: 'ghost' })}</span></div>
</div>`

const entryList = (ids, o = {}) => `<div class="list">${ids.map(id => entryRow(ENTRIES0.find(e => e.id === id), { sel: o.sel === id, hov: o.hov === id, pin: o.pinId === id ? o.pinN : 0 })).join('')}</div>`

// 高亮视图：以高亮为单位，按所属剪藏分组（extension.md §2.3）。id 是剪藏的 id
const hlGroup = (id, o = {}) => {
  const e = ENTRIES0.find(x => x.id === id)
  return `<div class="hg" style="position:relative">
    <div class="hg-h">${favicon(o.fav || 0)}<span class="ttl truncate">${esc(e.title)}</span><span class="host">${e.host}</span>${o.pin ? pin(o.pin, 'pin-s') : ''}<span class="grow"></span><span class="chip">${e.hls.length} 条</span><span class="link t-sm hs g4">回到来源${I('arrow-up-right', 'i-sm')}</span></div>
    ${e.hls
      .map(
        h => `<div class="hr c-${h.c} ${o.sel === h.id ? 'sel' : ''}"><i class="bar"></i>
      <div style="min-width:0"><div class="tx">${esc(h.q)}</div>${h.note ? `<div class="note">${I('message-square-text')}<span>${esc(h.note)}</span></div>` : ''}
        <div class="meta" style="display:flex;gap:8px;align-items:center;margin-top:5px;font-size:12px;color:var(--fg-3)"><span>${e.when}</span>${tags(e.tags)}${propPills(e)}</div></div>
      <div class="side" style="align-self:center">${btn('', { icon: 'ellipsis', iconOnly: true, sm: true, v: 'ghost' })}</div></div>`,
      )
      .join('')}
  </div>`
}

// 截图视图：画廊
const galTile = (e, o = {}) => `<div class="gt ${o.sel ? 'sel' : ''}">${o.pin ? pin(o.pin, 'pin-in') : ''}
  <div class="gt-img">${imgSvg(e.img)}${o.act ? `<div class="gt-act">${btn('', { icon: 'download', iconOnly: true, sm: true })}${btn('', { icon: 'trash', iconOnly: true, sm: true })}</div>` : ''}</div>
  <div class="gt-b"><div class="b t-md clamp-1">${esc(e.title)}</div><div class="t-xs muted">${e.host} · ${e.when}</div>${e.tags.length || propPills(e) ? `<div class="hs g4 wrap" style="margin-top:4px">${tags(e.tags)}${propPills(e)}</div>` : ''}</div>
</div>`

// ── 属性：值的呈现、行、添加 ─────────────────────────────────────────────
const pval = (type, v) => {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return ''
  if (type === 'list') return v.map(x => vtag(x)).join('')
  if (type === 'checkbox') return cbx(!!v, v ? '已读' : '未读')
  return esc(v)
}

const propRow = (name, type, value, o = {}) => `<div class="prow ${o.ro ? 'ro' : ''} ${o.hov ? 'hov' : ''}">
  <div class="pk">${pticon(type)}<span class="truncate">${name}</span></div>
  <div class="pv ${value ? '' : 'ph'}">${value || '空'}</div>
  <div class="px" ${o.ro ? 'style="opacity:1"' : ''}>${o.ro ? I('lock', 'i-sm') : I('x', 'i-sm')}</div>
</div>`

// 条目详情里的属性面板：内置属性在前，自定义属性在后；系统字段只读（entry.md §5.5）
const entryProps = (e, o = {}) => {
  const p = e.props || {}
  const rows = [propRow('title', 'text', esc(e.title)), propRow('tags', 'list', pval('list', e.tags) + `<span class="muted-2">${I('plus', 'i-sm')}</span>`, { hov: o.hovTags })]
  if (p.author) rows.push(propRow('author', 'list', pval('list', p.author)))
  if (p.published) rows.push(propRow('published', 'date', esc(p.published)))
  if (p.description) rows.push(propRow('description', 'text', esc(p.description)))
  const reg = STORE.registry
  ;['project', 'reviewed', 'priority', 'due'].forEach(k => {
    if (p[k] == null) return
    const r = reg.find(x => x.name === k)
    rows.push(propRow(k, r ? r.type : 'text', pval(r ? r.type : 'text', p[k]) || (p[k] === false ? cbx(false, '未读') : '')))
  })
  return rows.join('')
}

const sysRows = e =>
  [
    propRow('source', 'text', `<span class="c-brand truncate">${e.host}${e.path}</span>`, { ro: true }),
    propRow('created', 'date', '2026-10-05', { ro: true }),
    propRow('updated', 'datetime', '2026-10-05 10:14', { ro: true }),
    propRow('type', 'text', TYPES[e.type].zh, { ro: true }),
  ].join('')

// “添加属性”的补全（search）与新建（create）两种状态
const propCombo = (o = {}) => {
  const q = o.q || ''
  if (o.mode === 'create') {
    return `<div class="pcombo" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}
      <div class="in">${I('plus')}<span>${esc(q)}</span><i class="caret"></i></div>
      <div class="sec" style="border-top:0;margin-top:2px"><div class="h">类型（创建后不可更改）</div>
        <div class="ptypes">${PTYPE_ORDER.map(t => `<span class="ptype ${t === (o.type || 'text') ? 'on' : ''}">${pticon(t)}${PTYPES[t].zh}</span>`).join('')}</div>
        ${o.error ? `<div class="help is-error hs g6" style="margin-top:8px">${I('circle-alert', 'i-sm')}<span>${o.error}</span></div>` : `<div class="help" style="margin-top:8px">新属性会进入属性注册表；同名属性在所有条目里都是这个类型。</div>`}
        <div class="hs g8 end" style="margin-top:10px">${btn('取消', { sm: true, v: 'ghost' })}${btn('创建并添加', { sm: true, v: 'primary', off: !!o.error })}</div></div></div>`
  }
  const hits = STORE.registry.filter(r => !r.fixed && r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4)
  return `<div class="pcombo" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}
    <div class="in">${I('plus')}<span>${esc(q)}</span><i class="caret"></i></div>
    <div style="margin-top:6px">${hits.map((r, i) => `<div class="opt ${i === 0 ? 'on' : ''}">${pticon(r.type)}<span>${r.name}</span><span class="t">${PTYPES[r.type].zh}${r.builtin ? ' · 内置' : ''}</span></div>`).join('')}
      <div class="opt">${I('plus')}<span>创建属性 “${esc(q)}”…</span><span class="t">选择类型</span></div></div></div>`
}

// ── 详情抽屉 ─────────────────────────────────────────────────────────────
const drawerHead = e => `<div class="dh">${tchip(e.type)}<span class="grow"></span>${e.type === 'clip' ? btn('阅读', { sm: true, icon: 'book-open' }) : ''}${btn('回到来源', { sm: true, icon: 'arrow-up-right' })}${btn('', { icon: 'trash', iconOnly: true, sm: true, v: 'ghost' })}${btn('', { icon: 'x', iconOnly: true, sm: true, v: 'ghost' })}</div>`

const drawerContent = (e, o = {}) => {
  if (e.type === 'screenshot')
    return `<div class="dsec"><div class="h">${I('image', 'i-sm')}图片<span class="grow"></span>${btn('下载', { sm: true, icon: 'download', v: 'ghost' })}</div><div class="gt-img" style="border:1px solid var(--line);border-radius:10px">${imgSvg(e.img)}</div></div>`
  const n = e.hls.length
  const lock = n ? `<span class="t-xs muted hs g4" title="有高亮时原文只读">${I('lock', 'i-sm')}原文只读 · ${n} 条高亮</span>` : ''
  return `<div class="dsec"><div class="h">${I('quote', 'i-sm')}原文<span class="grow"></span>${lock}</div><div class="md md-sm">${mdRender(e.content, e.hls, { on: o.hlOn })}</div>${e.ctx ? `<div class="ctxbox"><b>语境</b>${esc(e.ctx)}</div>` : ''}</div>`
}

// o: { pin, combo, hovTags, propsOnly }；combo 为 propCombo 的参数；propsOnly 只画标题与属性面板（滚动到属性之后的样子）
const drawer = (e, o = {}) => `<aside class="drawer" aria-label="条目详情">
  ${o.pin ? pin(o.pin, 'pin-in') : ''}
  ${drawerHead(e)}
  <div class="dtitle"><div class="t">${esc(e.title)}</div><div class="t-xs muted" style="margin-top:3px">${e.host}${e.path} · ${e.when}</div></div>
  <div class="dbody">
    ${o.propsOnly ? '' : drawerContent(e, o)}
    ${o.propsOnly ? '' : `<div class="dsec"><div class="h">${I('message-square-text', 'i-sm')}备注</div>${e.note ? `<div class="textarea" style="min-height:52px;font-size:13px">${esc(e.note)}</div>` : textarea('', { h: 52, ph: '写下你自己的话（可选）' })}</div>`}
    <div class="dsec" style="border-bottom:0"><div class="h">${I('tags', 'i-sm')}属性</div>
      ${entryProps(e, o)}
      ${o.combo ? `<div style="margin:6px 0 4px">${propCombo(o.combo)}</div>` : `<div class="prow" style="grid-template-columns:1fr"><div class="pk" style="color:var(--brand-text)">${I('plus', '')}添加属性</div></div>`}
      ${o.propsOnly ? '' : `<div class="t-xs muted" style="margin:10px 6px 4px;font-weight:650">系统字段 · 只读</div>
      ${sysRows(e)}`}
    </div>
  </div>
  <div class="dfoot"><span>更新于 周一 10:14 · 只保存在本机</span></div>
</aside>`

// ── 属性页：注册表 ────────────────────────────────────────────────────────
const ptabRow = (r, o = {}) => {
  const deletable = !r.builtin && r.used === 0
  return `<div class="ptab-r ${o.sel === r.name ? 'sel' : ''}">
    <div class="nm">${pticon(r.type)}<span class="truncate">${r.name}</span>${r.fixed ? chip('固定', { icon: 'lock' }) : r.builtin ? chip('内置', {}) : ''}</div>
    <div class="ty">${PTYPES[r.type].zh}</div>
    <div class="df truncate">${r.def ? esc(r.def) : '—'}</div>
    <div class="us">${r.used}</div>
    ${TYPE_ORDER.map(t => `<div class="ck" ${r.fixed ? 'title="固定附加" style="opacity:.55"' : ''}>${cbx(r.presets.includes(t))}</div>`).join('')}
    <div class="ac" ${deletable ? '' : 'style="opacity:.35"'} title="${deletable ? '删除' : r.builtin ? '内置属性不可删除' : '使用中，不可删除'}">${I('trash')}</div>
  </div>`
}

const ptab = (o = {}) => `<div class="ptab" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}
  <div class="ptab-h"><div>名称</div><div>类型</div><div>默认值</div><div style="text-align:right">使用数</div><div class="ck">剪藏</div><div class="ck">截图</div><div class="ac"></div></div>
  ${(o.registry || STORE.registry).map(r => ptabRow(r, o)).join('')}
  ${o.extra || ''}
</div>`

// ── 设置页 ────────────────────────────────────────────────────────────────
const settingsRow = (label, desc, control) => `<div class="set-r"><div class="l"><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</div><div class="none hs g8">${control}</div></div>`

const settingsCard = (title, desc, rows, o = {}) => `<div class="set" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}<div class="set-h"><h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}</div>${rows}</div>`

const metricRow = (id, name, v, hint) => `<div class="set-r"><div class="l"><b>${name}</b><small>${hint}</small></div><div class="none hs g10"><span class="cv-tag">${id}</span><span class="b tnum" style="min-width:64px;text-align:right">${v}</span></div></div>`

// ── 首次使用与空状态 ──────────────────────────────────────────────────────
const onboarding = (o = {}) => `<div class="onb" style="position:relative">${o.pin ? pin(o.pin, 'pin-in') : ''}
  ${[['clip', TYPES.clip.zh, 'bookmark', '选中一段文字，或指一下整篇文章、整条推文，点“剪藏”。一次点击存成 Markdown，连同来源。'], ['screenshot', TYPES.screenshot.zh, 'scan', '框选区域或单击元素，原位标注、遮住身份信息再保存。'], ['highlight', HLV.zh, 'highlighter', '在资料库里打开剪藏读一遍，选中重点划出高亮、写下想法；网页上不会留下任何东西。']]
    .map(([t, zh, ic, d]) => `<div class="onb-c t-${t}"><b><span class="ttile t-${t}">${I(ic)}</span><span>${zh}</span></b><span class="t-sm muted">${d}</span></div>`)
    .join('')}
  <div class="hs g8" style="grid-column:1 / -1">${btn('打开示例页面', { v: 'primary', icon: 'arrow-up-right' })}<span class="t-sm muted">示例页只用于试用，不会混入你的库。</span><span class="grow"></span>${btn('不再显示', { sm: true, v: 'ghost' })}</div>
</div>`

const emptyState = (icon, title, desc, action) => `<div class="empty"><div class="ico">${I(icon, 'i-lg')}</div><h3>${title}</h3><div class="t-sm" style="max-width:380px">${desc}</div>${action ? `<div style="margin-top:6px">${action}</div>` : ''}</div>`

// ── 导出对话框：准备 / 进行中 / 完整 / 部分 ────────────────────────────────
const exportDlg = (state, o = {}) => {
  const body = {
    ready: `<div class="help" style="margin:2px 0 12px">把 95 条条目与 24 张已保存的图片打包为一个 ZIP，用其他工具阅读。</div>
      <div class="hs g16 top t-sm" style="margin-bottom:14px"><div class="grow"><div class="b" style="margin-bottom:4px">包含</div><div class="muted" style="line-height:1.6">剪藏与截图的 Markdown（属性写成 frontmatter，高亮写成 ==…==），以及处理后的图片原字节。</div></div><div class="grow"><div class="b" style="margin-bottom:4px">不包含</div><div class="muted" style="line-height:1.6">尚未提交的编辑、界面偏好。不能用来恢复 AnnHub 的数据库。</div></div></div>
      <div class="hs g8 end">${btn('取消', { v: 'ghost' })}${btn('导出 ZIP', { v: 'primary', icon: 'download' })}</div>`,
    progress: `<div class="help" style="margin:2px 0 12px">正在读取已提交的记录与图片，不会上传到任何地方。</div>
      <div class="vs g6" style="margin-bottom:14px"><div class="hs between t-sm"><span>写入 Markdown 与图片</span><span class="tnum b">75 / 119</span></div><div class="progress"><i style="width:63%"></i></div></div>
      <div class="hs g8 end">${btn('取消', { v: 'ghost' })}</div>`,
    full: `${banner('ok', '<b>导出完成</b>：95 条条目、24 张图片，已写入 <span class="mono">AnnHub-export.zip</span>。')}<div class="help" style="margin:10px 0 12px">README.md 记录了导出时间、范围与数量。这个 ZIP 供其他工具阅读，不是 AnnHub 数据库的备份。</div><div class="hs g8 end">${btn('完成', { v: 'primary' })}</div>`,
    partial: `${banner('warn', '<b>部分导出</b>：2 张图片缺失，对应的 Markdown 标注了“图片缺失”，资产 ID 已列入 README。')}<div class="help" style="margin:10px 0 12px">其余 93 条条目与 22 张图片已正常写入，可以下载这份部分 ZIP。</div><div class="hs g8 end">${btn('查看缺失列表', { v: 'ghost' })}${btn('下载部分 ZIP', { v: 'primary', icon: 'download' })}</div>`,
  }[state]
  return `<div class="dlg" style="${o.style || ''}"><div class="hs between" style="margin-bottom:6px"><h3>导出内容</h3>${chip({ ready: '准备', progress: '进行中', full: '完整', partial: '部分导出' }[state], { v: state === 'partial' ? 'warn' : state === 'full' ? 'ok' : '' })}</div>${body}</div>`
}

// ── 工具栏弹窗：同一套壳的紧凑版 ──────────────────────────────────────────
const popup = (o = {}) => {
  const active = o.active || 'all'
  const rail = [
    ['all', 'library', '', COUNTS.all],
    ['clip', 'bookmark', 't-clip', COUNTS.clip],
    ['highlight', 'highlighter', 't-highlight', COUNTS.highlight],
    ['screenshot', 'scan', 't-screenshot', COUNTS.screenshot],
  ]
  const items = o.items || ['e1', 'e2', 'e3', 'e4', 'e5'].map(id => ENTRIES0.find(e => e.id === id))
  return `<div class="pp" style="${o.style || ''}">
    <nav class="pp-rail" aria-label="AnnHub">
      ${rail.map(([id, icon, cls, n]) => `<div class="pp-i ${cls} ${id === active ? 'on' : ''}" ${id === active ? 'aria-current="page"' : ''}>${I(icon)}<span class="n">${n}</span></div>`).join('')}
      <span style="flex:1"></span><div class="pp-i">${I('settings')}</div>
    </nav>
    <div class="pp-main">
      <div class="pp-h"><b>${active === 'all' ? '全部' : active === 'highlight' ? HLV.zh : TYPES[active].zh}</b><span class="t-sm muted">最近 5 条</span><span class="grow"></span><span class="link t-sm hs g4">在资料库中打开${I('arrow-up-right', 'i-sm')}</span></div>
      ${items
        .map(
          (e, i) => (e.hl
            ? `<div class="pp-li ${i === 1 ? 'hov' : ''}"><span class="ttile t-highlight">${I('highlighter')}</span><div style="min-width:0"><div class="clamp-1" style="font-size:13px;font-weight:500">${esc(e.hl.q)}</div><div class="t-xs muted clamp-1" style="margin-top:2px">${esc(e.title)} · ${e.when}</div></div></div>`
            : `<div class="pp-li ${i === 1 ? 'hov' : ''}">${ttile(e.type)}<div style="min-width:0"><div class="clamp-1" style="font-size:13px;font-weight:500">${esc(e.type === 'screenshot' ? e.title : mdPlain(e.content))}</div><div class="t-xs muted" style="margin-top:2px">${e.host} · ${e.when}</div></div></div>`),
        )
        .join('')}
      <div class="pp-f">选中网页文字即可保存 · ${keys('⌘', '⇧', 'S')} 截图</div>
    </div>
  </div>`
}

// ── 阅读视图与库内高亮（extension.md §4.2；entry.md §4）──────────────────────────
// 选中文字后的小工具条：五个颜色点 + 备注；点颜色立即创建，键盘上按 H 以默认颜色创建
const hbar = (o = {}) => `<div class="hbar" ${o.anchor ? `data-anchor="${o.anchor}" data-place="${o.below ? 'below' : 'above'}"` : ''} style="${o.style || ''}" role="toolbar" aria-label="高亮">${o.pin ? pin(o.pin) : ''}
  <span class="dots" role="group" aria-label="颜色">${HL_COLORS.map((c, i) => `<span class="dotb ${o.hover === i ? 'is-hover' : ''}" title="${HL_NAMES[c]}">${hlDot(c, o.hover === i)}</span>`).join('')}</span><i class="sepd"></i>
  <span class="act">${I('message-square-text', 'i-sm')}备注</span>${o.kbd ? `<i class="sepd"></i><span class="act">${keys('H')}</span>` : ''}
</div>`

// 点已有高亮后的浮层：改颜色、写备注（失焦即保存）、删除
const hlPop = (h, o = {}) => `<div class="hpop" ${o.anchor ? `data-anchor="${o.anchor}" data-place="below"` : ''} style="${o.style || ''}">${o.pin ? pin(o.pin) : ''}
  <div class="hs between"><span class="hs g8" role="radiogroup" aria-label="颜色">${HL_COLORS.map(c => `<span class="dotb">${hlDot(c, c === h.c)}</span>`).join('')}</span><span class="t-xs muted">${HL_NAMES[h.c]}</span></div>
  ${textarea(esc(h.note || ''), { h: 56, focus: true, caret: true, ph: '写下你的想法（可选）', style: 'margin-top:10px;font-size:12.5px' })}
  <div class="hs g8" style="margin-top:10px"><span class="t-xs muted">失焦即保存</span><span class="grow"></span>${btn('删除', { sm: true, v: 'ghost', icon: 'trash' })}</div>
</div>`

const hlItem = (h, o = {}) => `<div class="hli c-${h.c} ${o.on === h.id ? 'on' : ''}"><i class="bar"></i><div class="hl-b"><div class="q">${esc(h.q)}</div>${h.note ? `<div class="n">${I('message-square-text', 'i-sm')}<span>${esc(h.note)}</span></div>` : ''}</div></div>`

// 阅读视图：正文居中，右栏是“高亮 / 属性”两个标签；o: { tab, on, sel, overlay, pins }
const reader = (e, o = {}) => `<div class="rd">
  <div class="rd-main">
    <div class="rd-bar">${btn('返回', { sm: true, v: 'ghost', icon: 'arrow-left' })}<span class="grow"></span>${btn('回到来源', { sm: true, icon: 'arrow-up-right' })}</div>
    <div class="rd-col" style="position:relative">
      <div class="rd-head"><h1>${esc(e.title)}</h1><div class="rd-meta">${tchip(e.type, { sm: true })}<span>${e.host}${e.path}</span><span>·</span><span>${e.when}</span>${tags(e.tags)}</div></div>
      <div class="md md-rd">${mdRender(e.content, e.hls, { on: o.on, sel: o.sel, pins: o.pinsMd })}</div>
      ${o.overlay || ''}
    </div>
  </div>
  <aside class="rd-rail" aria-label="高亮与属性">
    ${o.pins && o.pins.rail ? pin(o.pins.rail, 'pin-in-r') : ''}
    <div class="rd-tabs" role="tablist"><span class="rd-tab ${o.tab === 'props' ? '' : 'on'}" role="tab">高亮<b>${e.hls.length}</b></span><span class="rd-tab ${o.tab === 'props' ? 'on' : ''}" role="tab">属性</span></div>
    <div class="rd-pane">${
      o.tab === 'props'
        ? `<div class="rd-props">${entryProps(e)}<div class="t-xs muted" style="margin:10px 6px 4px;font-weight:650">系统字段 · 只读</div>${sysRows(e)}</div>`
        : e.hls.length
          ? e.hls.map(h => hlItem(h, o)).join('')
          : `<div class="rd-empty">${I('highlighter', 'i-lg')}<b>还没有高亮</b><span>在左边选中一段文字，点一个颜色。</span></div>`
    }</div>
  </aside>
</div>`
