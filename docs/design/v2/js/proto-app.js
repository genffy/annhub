// 可交互原型 2：资料库（左导航 + 右内容）与阅读视图。
// 能点：切换视图、折叠导航、搜索与筛选、打开抽屉与阅读视图、在原文里选中文字创建高亮（选区会被换算成 content 里的偏移）、
// 点已有高亮改色 / 写备注 / 删除（可撤销）、添加 / 新建 / 清除属性、属性页的预设与删除、导出。
// 规则是真的：与已有高亮重叠的新选区合并；有高亮的剪藏原文只读；删除剪藏时提示高亮数；页面里剪藏的内容也会出现在这里。
const PA = { view: 'all', read: null, tab: 'hl', rail: false, q: '', types: [], tag: '', project: '', color: '', sel: null, opened: null, on: null, adding: null, creating: null, dlg: null, progress: 0, confirm: null, bar: null, pop: null, undo: null, toast: null, focus: null, scrollTo: null, lastKeys: {}, hlColor: 'yellow', anon: true, blockOn: true, fmt: 'png', ratios: ['1:1', '4:5', '3:4', '16:9'], wm: false, bz: false }

const paNorm = s => String(s).toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
const paEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length)
const paHlAll = () => STORE.entries.flatMap(e => (e.hls || []).map(h => ({ e, h })))
const paHay = e => paNorm([e.title, mdPlain(e.content), e.note || '', e.ctx || '', e.host, e.path, ...e.tags, ...(e.hls || []).flatMap(h => [h.q, h.note || '']), ...Object.values(e.props).flatMap(v => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : []))].join(' '))
const paReg = name => STORE.registry.find(r => r.name.toLowerCase() === String(name).toLowerCase())
const paHas = (e, name) => (name === 'title' ? !!e.title : name === 'tags' ? e.tags.length > 0 : e.props[name] != null && !paEmpty(e.props[name]))
const paUsed = r => STORE.entries.filter(e => paHas(e, r.name)).length
const paEntry = id => STORE.entries.find(e => e.id === id)
const paCur = () => paEntry(PA.view === 'read' ? PA.read : PA.sel)
const paScale = root => (root.closest('.cv-board') || {}).__scale || 1

const paShown = () =>
  STORE.entries.filter(
    e => (PA.view === 'all' || e.type === PA.view) && (!PA.types.length || PA.types.includes(e.type)) && (!PA.tag || e.tags.includes(PA.tag)) && (!PA.project || e.props.project === PA.project) && (!PA.q || paHay(e).includes(paNorm(PA.q))),
  )

// 高亮视图以单条高亮为单位（search.md §5）：来源、标签、属性按所属剪藏算，颜色与时间按高亮自己
const paHlShown = () =>
  paHlAll().filter(
    ({ e, h }) => (!PA.color || h.c === PA.color) && (!PA.tag || e.tags.includes(PA.tag)) && (!PA.project || e.props.project === PA.project) && (!PA.q || paNorm([h.q, h.note || '', e.title, ...e.tags, e.host].join(' ')).includes(paNorm(PA.q))),
  )

// 校验属性名（entry.md §5.3）：保留名、长度、与注册表同名（不区分大小写）
const paCheckName = name => {
  const n = name.trim()
  if (!n) return '请输入名称。'
  if (n.length > 64) return '名称至多 64 个字符。'
  if (/\n/.test(n)) return '名称不能含换行。'
  if (RESERVED.includes(n.toLowerCase()) || n.toLowerCase().startsWith('annhub_')) return `“${n}” 是保留名，不能用作属性名（还有 ${RESERVED.join('、')} 和 annhub_ 开头的名称）。`
  const r = paReg(n)
  if (r) return `已有 ${r.name}（${PTYPES[r.type].zh}）。名称不区分大小写，同名属性必须是同一种类型。`
  return ''
}

// ── 导航与列表 ──────────────────────────────────────────────────────────
const paNavHtml = () => {
  const cnt = { all: STORE.entries.length, clip: STORE.entries.filter(e => e.type === 'clip').length, highlight: paHlAll().length, screenshot: STORE.entries.filter(e => e.type === 'screenshot').length, properties: STORE.registry.length }
  const active = PA.view === 'read' ? 'clip' : PA.view
  const item = it => `<div class="nav-i pa-click ${it.type ? `t-${it.type}` : ''} ${active === it.id ? 'on' : ''}" data-nav="${it.id}" data-fid="nav-${it.id}" tabindex="0" ${active === it.id ? 'aria-current="page"' : ''}>${I(it.icon)}<span>${it.zh}</span>${cnt[it.id] != null ? `<span class="n">${cnt[it.id]}</span>` : ''}</div>`
  const foot = PA.rail
    ? `<div class="nav-foot">${btn('', { icon: 'download', iconOnly: true, attrs: 'data-act="export"' })}</div>`
    : `<div class="nav-foot"><div class="meter"><div class="hs between"><span>本地存储</span><span class="tnum">126 MB</span></div><div class="progress"><i style="width:3%"></i></div></div>${btn('导出内容', { icon: 'download', cls: 'btn-block', attrs: 'data-act="export"' })}</div>`
  return `<nav class="nav" aria-label="AnnHub"><div class="nav-top"><div class="nav-brand"><svg class="i" aria-hidden="true"><use href="#i-logo"/></svg><span>AnnHub</span></div><span class="nav-fold pa-click" data-act="fold" aria-label="折叠导航">${I(PA.rail ? 'panel-left-open' : 'panel-left-close')}</span></div>
    <div class="nav-label">资料库</div>${NAV.map(item).join('')}<div class="nav-label">管理</div>${NAV2.map(item).join('')}${foot}</nav>`
}

const paRow = e => `<div class="erow pa-click ${PA.sel === e.id ? 'sel' : ''}" data-id="${e.id}">
  ${ttile(e.type)}
  <div style="min-width:0"><div class="tx clamp-2 ${e.type === 'screenshot' ? 'b' : ''}">${esc(e.type === 'screenshot' ? e.title : mdPlain(e.content))}</div>
    <div class="meta">${tchip(e.type, { sm: true })}${e.type !== 'screenshot' ? `<span class="ttl truncate">${esc(e.title)}</span>` : ''}<span>${e.host}</span><span>·</span><span>${e.when}</span>${e.tags.map(t => `<span class="tag pa-click" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}${e.props.project != null && e.props.project !== '' ? `<span class="ppill pa-click" data-project="${esc(e.props.project)}">${I('text')}<span>project</span><b>${esc(e.props.project)}</b></span>` : ''}${e.props.reviewed === true ? `<span class="ppill">${I('square-check')}<span>reviewed</span></span>` : ''}${e.props.priority != null && e.props.priority !== '' ? `<span class="ppill">${I('hash')}<span>priority</span><b>${esc(e.props.priority)}</b></span>` : ''}${hlCount(e)}</div></div>
  <div class="side">${e.type === 'screenshot' ? thumb(e.img) : ''}</div></div>`

const paFilterBar = shown => {
  const typeChips = PA.view === 'all' ? TYPE_ORDER.map(t => `<span class="fchip pa-click ${PA.types.includes(t) ? 'on' : ''}" data-type="${t}">${I(TYPES[t].icon)}${TYPES[t].zh}</span>`).join('') : ''
  const colorChips = PA.view === 'highlight' ? HL_COLORS.map(c => `<span class="fchip pa-click ${PA.color === c ? 'on' : ''}" data-color="${c}" title="${HL_NAMES[c]}">${hlDot(c)}${HL_NAMES[c]}</span>`).join('') : ''
  const active = [PA.tag && `<span class="fchip on pa-click" data-act="clear-tag">${I('tag')}标签：${esc(PA.tag)}${I('x')}</span>`, PA.project && `<span class="fchip on pa-click" data-act="clear-project">${I('sliders-horizontal')}project 等于 ${esc(PA.project)}${I('x')}</span>`].filter(Boolean).join('')
  return `<div class="fbar">${typeChips}${colorChips}${active}<span class="grow"></span><span class="t-sm muted">${shown} 条</span>${PA.types.length || PA.tag || PA.project || PA.color || PA.q ? `<span class="link t-sm pa-click" data-act="clear-all">清除筛选</span>` : ''}</div>`
}

const paSearchBox = () => `<div class="search ${PA.q ? 'is-focus' : ''}" style="flex:none;width:300px">${I('search')}<input class="pa-bare" data-fid="search" data-bind="q" placeholder="搜索条目…" value="${esc(PA.q)}" autocomplete="off" />${PA.q ? `<span class="pa-click" data-act="clear-q">${I('x', 'i-sm')}</span>` : '<kbd>/</kbd>'}</div>`

const paListPage = () => {
  const shown = paShown()
  const titles = { all: '全部', clip: '剪藏', screenshot: '截图' }
  const total = STORE.entries.length
  const n = t => STORE.entries.filter(e => e.type === t).length
  const sub = PA.view === 'all' ? `${total} 条 · ${n('clip')} 剪藏 · ${n('screenshot')} 截图` : `${shown.length} 条`
  const head = `<div class="phead"><div class="grow"><h1>${titles[PA.view]}</h1><div class="sub">${sub}</div></div>${paSearchBox()}</div>`
  let body
  if (!total) body = `${onboarding()}${emptyState('library', '还没有条目', '选中网页中的一段文字，点“剪藏”；按 ⌘⇧S 框选一张截图。')}`
  else if (!shown.length) body = emptyState('search', '没有符合条件的条目', '当前搜索词与筛选条件下没有结果。筛选条件都还保留着，可以逐个移除。', btn('清除筛选', { v: 'primary', attrs: 'data-act="clear-all"' }))
  else if (PA.view === 'screenshot') body = `<div class="gal">${shown.map(e => `<div class="pa-click" data-id="${e.id}">${galTile(e, { sel: PA.sel === e.id })}</div>`).join('')}</div>`
  else body = `<div class="list">${shown.map(paRow).join('')}</div>`
  return `${head}<div class="pbody ${PA.view === 'screenshot' ? '' : 'cap'}" style="overflow:auto">${paFilterBar(shown.length)}${body}</div>`
}

// “高亮”视图：以高亮为单位，按所属剪藏分组（extension.md §2.3）
const paHlPage = () => {
  const rows = paHlShown()
  const groups = new Map()
  rows.forEach(({ e, h }) => (groups.get(e.id) || groups.set(e.id, { e, hs: [] }).get(e.id)).hs.push(h))
  const ordered = [...groups.values()].sort((a, b) => Math.max(...b.hs.map(h => h.t)) - Math.max(...a.hs.map(h => h.t)))
  const head = `<div class="phead"><div class="grow"><h1>高亮</h1><div class="sub">${rows.length} 条 · 来自 ${groups.size} 条剪藏</div></div>${paSearchBox()}</div>`
  const body = !paHlAll().length
    ? emptyState('highlighter', '还没有高亮', '在资料库里打开一条剪藏，点“阅读”，选中原文里的一段，点一个颜色。')
    : !rows.length
      ? emptyState('search', '没有符合条件的高亮', '当前搜索词与筛选条件下没有结果。筛选条件都还保留着，可以逐个移除。', btn('清除筛选', { v: 'primary', attrs: 'data-act="clear-all"' }))
      : ordered
          .map(
            ({ e, hs }, gi) => `<div class="hg"><div class="hg-h">${favicon(gi)}<span class="ttl truncate">${esc(e.title)}</span><span class="host">${e.host}</span><span class="grow"></span><span class="chip">${hs.length} 条</span><span class="link t-sm hs g4 pa-click" data-act="src">回到来源${I('arrow-up-right', 'i-sm')}</span></div>
          ${[...hs]
            .sort((a, b) => a.s - b.s)
            .map(
              h => `<div class="hr pa-click c-${h.c}" data-hl="${h.id}" data-id="${e.id}" tabindex="0" role="button"><i class="bar"></i><div style="min-width:0"><div class="tx">${esc(h.q)}</div>${h.note ? `<div class="note">${I('message-square-text')}<span>${esc(h.note)}</span></div>` : ''}<div style="display:flex;gap:8px;align-items:center;margin-top:5px;font-size:12px;color:var(--fg-3)"><span>${e.when}</span>${e.tags.map(t => `<span class="tag pa-click" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}</div></div><span></span></div>`,
            )
            .join('')}</div>`,
          )
          .join('')
  return `${head}<div class="pbody cap" style="overflow:auto">${paFilterBar(rows.length)}${body}</div>`
}

// ── 属性：编辑器 ─────────────────────────────────────────────────────────
const paShowNames = e => {
  const names = ['title', 'tags']
  ;['author', 'published', 'description'].forEach(n => (e.props[n] != null || (e._show || []).includes(n)) && names.push(n))
  Object.keys(e.props).forEach(n => !names.includes(n) && names.push(n))
  ;(e._show || []).forEach(n => !names.includes(n) && names.push(n))
  return names
}

const paListEd = (key, values) =>
  `${values.map(v => `<span class="vtag">${esc(v)}<span class="pa-click" data-act="list-del" data-prop="${key}" data-v="${esc(v)}">${I('x')}</span></span>`).join('')}<input class="pa-bare" data-fid="list-${key}" data-listadd="${key}" placeholder="添加…" />`

const paPropRow = (e, name) => {
  const r = paReg(name) || { type: 'text' }
  const type = r.type
  const v = name === 'title' ? e.title : name === 'tags' ? e.tags : e.props[name]
  let ed
  if (type === 'list') ed = paListEd(name, Array.isArray(v) ? v : [])
  else if (type === 'checkbox') ed = `<span class="pa-click" data-act="toggle" data-prop="${name}">${cbx(v === true, v === true ? '是' : '否')}</span>`
  else if (type === 'number') ed = `<input class="pa-in" type="number" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" placeholder="空" />`
  else if (type === 'date') ed = `<input class="pa-in" type="date" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" />`
  else if (type === 'datetime') ed = `<input class="pa-in" type="datetime-local" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" />`
  else ed = `<input class="pa-in" data-prop="${name}" data-fid="${name === 'title' ? 'p-title-row' : `p-${name}`}" value="${esc(v ?? '')}" placeholder="空" />`
  const removable = name !== 'title' && name !== 'tags'
  return `<div class="prow"><div class="pk">${pticon(type)}<span class="truncate">${name}</span></div><div class="pv">${ed}</div><div class="px ${removable ? 'pa-click' : ''}" ${removable ? `data-act="prop-del" data-prop="${name}"` : 'style="visibility:hidden"'}>${I('x', 'i-sm')}</div></div>`
}

const paComboHtml = () => {
  const A = PA.adding
  if (A.mode === 'create')
    return `<div class="pcombo"><div class="in">${I('plus')}<input class="pa-bare" data-fid="combo" data-bind="combo" value="${esc(A.q)}" /></div>
      <div class="sec" style="border-top:0;margin-top:2px"><div class="h">类型（创建后不可更改）</div>
        <div class="ptypes">${PTYPE_ORDER.map(t => `<span class="ptype pa-click ${t === A.type ? 'on' : ''}" data-act="ptype" data-v="${t}">${pticon(t)}${PTYPES[t].zh}</span>`).join('')}</div>
        ${A.error ? `<div class="help is-error hs g6" style="margin-top:8px">${I('circle-alert', 'i-sm')}<span>${A.error}</span></div>` : `<div class="help" style="margin-top:8px">新属性会进入属性注册表；同名属性在所有条目里都是这个类型。</div>`}
        <div class="hs g8 end" style="margin-top:10px">${btn('取消', { sm: true, v: 'ghost', attrs: 'data-act="combo-close"' })}${btn('创建并添加', { sm: true, v: 'primary', off: !!A.error || !A.q.trim(), attrs: 'data-act="create-add"' })}</div></div></div>`
  const e = paCur()
  const shown = paShowNames(e)
  const hits = STORE.registry.filter(r => !shown.includes(r.name) && r.name.toLowerCase().includes(A.q.toLowerCase()))
  const exact = paReg(A.q)
  return `<div class="pcombo"><div class="in">${I('plus')}<input class="pa-bare" data-fid="combo" data-bind="combo" value="${esc(A.q)}" placeholder="属性名称…" /></div>
    <div style="margin-top:6px">${hits.map(r => `<div class="opt pa-click" data-act="pick" data-v="${r.name}">${pticon(r.type)}<span>${r.name}</span><span class="t">${PTYPES[r.type].zh}${r.builtin ? ' · 内置' : ''}</span></div>`).join('')}
      ${A.q.trim() && !exact ? `<div class="opt pa-click" data-act="to-create">${I('plus')}<span>创建属性 “${esc(A.q)}”…</span><span class="t">选择类型</span></div>` : ''}
      ${!hits.length && !A.q.trim() ? '<div class="help" style="padding:6px 9px">没有更多可添加的属性，输入名称来创建新的。</div>' : ''}</div></div>`
}

// 属性面板（抽屉与阅读视图右栏共用）
const paPropsHtml = e => `${paShowNames(e)
  .map(n => paPropRow(e, n))
  .join('')}
  ${PA.adding ? `<div style="margin:6px 0 4px">${paComboHtml()}</div>` : `<div class="prow pa-click" data-act="add" style="grid-template-columns:1fr"><div class="pk" style="color:var(--brand-text)">${I('plus')}添加属性</div></div>`}
  <div class="t-xs muted" style="margin:10px 6px 4px;font-weight:650">系统字段 · 只读</div>${sysRows(e)}`

// ── 抽屉与阅读视图 ──────────────────────────────────────────────────────
const paBody = (e, cls) => `<div class="md ${cls}" data-md="${e.id}">${mdRender(e.content, e.hls || [], { on: PA.on })}</div>`

const paDrawer = e => {
  const n = (e.hls || []).length
  const q =
    e.type === 'screenshot'
      ? `<div class="dsec"><div class="h">${I('image', 'i-sm')}图片</div><div class="gt-img" style="border:1px solid var(--line);border-radius:10px">${imgSvg(e.img)}</div></div>`
      : `<div class="dsec"><div class="h">${I('quote', 'i-sm')}原文<span class="grow"></span>${n ? `<span class="t-xs muted hs g4" title="有高亮时原文只读">${I('lock', 'i-sm')}原文只读 · ${n} 条高亮</span>` : ''}</div>${paBody(e, 'md-sm')}${e.ctx ? `<div class="ctxbox"><b>语境</b>${esc(e.ctx)}</div>` : ''}</div>`
  return `<aside class="drawer" aria-label="条目详情">
    <div class="dh">${tchip(e.type)}<span class="grow"></span>${e.type === 'clip' ? btn('阅读', { sm: true, icon: 'book-open', attrs: 'data-act="read"' }) : ''}${btn('回到来源', { sm: true, icon: 'arrow-up-right', attrs: 'data-act="src"' })}${btn('', { icon: 'trash', iconOnly: true, sm: true, v: 'ghost', attrs: 'data-act="del" aria-label="删除"' })}${btn('', { icon: 'x', iconOnly: true, sm: true, v: 'ghost', attrs: 'data-act="close" aria-label="关闭"' })}</div>
    <div class="dtitle"><input class="pa-in pa-title" data-prop="title" data-fid="p-title" value="${esc(e.title)}" aria-label="标题" /><div class="t-xs muted" style="margin:3px 0 0 7px">${e.host}${e.path} · ${e.when}</div></div>
    <div class="dbody" style="overflow:auto">
      ${q}
      <div class="dsec"><div class="h">${I('message-square-text', 'i-sm')}备注</div><textarea class="textarea pa-fld" data-fid="note" data-bind="note" placeholder="写下你自己的话（可选）" style="min-height:52px;font-size:13px">${esc(e.note || '')}</textarea></div>
      <div class="dsec" style="border-bottom:0"><div class="h">${I('tags', 'i-sm')}属性</div>${paPropsHtml(e)}</div>
    </div>
    <div class="dfoot"><span>更新于 刚刚 · 只保存在本机</span></div></aside>`
}

const paReader = e => {
  const hs = [...(e.hls || [])].sort((a, b) => a.s - b.s)
  const pane =
    PA.tab === 'props'
      ? `<div class="rd-props">${paPropsHtml(e)}</div>`
      : hs.length
        ? hs.map(h => `<div class="pa-click" data-hl="${h.id}" data-id="${e.id}" tabindex="0" role="button">${hlItem(h, { on: PA.on })}</div>`).join('')
        : `<div class="rd-empty">${I('highlighter', 'i-lg')}<b>还没有高亮</b><span>在左边选中一段文字，点一个颜色。</span></div>`
  return `<div class="rd">
    <div class="rd-main">
      <div class="rd-bar">${btn('返回', { sm: true, v: 'ghost', icon: 'arrow-left', attrs: 'data-act="back"' })}<span class="grow"></span>${btn('回到来源', { sm: true, icon: 'arrow-up-right', attrs: 'data-act="src"' })}</div>
      <div class="rd-col">
        <div class="rd-head"><h1>${esc(e.title)}</h1><div class="rd-meta">${tchip(e.type, { sm: true })}<span>${e.host}${e.path}</span><span>·</span><span>${e.when}</span>${tags(e.tags)}</div></div>
        ${paBody(e, 'md-rd')}
      </div>
    </div>
    <aside class="rd-rail" aria-label="高亮与属性">
      <div class="rd-tabs" role="tablist"><span class="rd-tab pa-click ${PA.tab === 'props' ? '' : 'on'}" data-act="tab" data-v="hl" role="tab" tabindex="0">高亮<b>${hs.length}</b></span><span class="rd-tab pa-click ${PA.tab === 'props' ? 'on' : ''}" data-act="tab" data-v="props" role="tab" tabindex="0">属性</span></div>
      <div class="rd-pane">${pane}</div>
    </aside>
  </div>`
}

// ── 属性页 ──────────────────────────────────────────────────────────────
const paPropsPage = () => {
  const unused = STORE.registry.filter(r => !r.builtin && paUsed(r) === 0)
  const C = PA.creating
  const rows = STORE.registry
    .map(r => {
      const used = paUsed(r)
      const deletable = !r.builtin && used === 0
      return `<div class="ptab-r">
        <div class="nm">${pticon(r.type)}<span class="truncate">${r.name}</span>${r.fixed ? chip('固定', { icon: 'lock' }) : r.builtin ? chip('内置') : ''}</div>
        <div class="ty">${PTYPES[r.type].zh}</div><div class="df truncate">${r.def ? esc(r.def) : '—'}</div><div class="us">${used}</div>
        ${TYPE_ORDER.map(t => `<div class="ck ${r.fixed ? '' : 'pa-click'}" ${r.fixed ? 'style="opacity:.55" title="固定附加"' : `data-act="preset" data-prop="${r.name}" data-v="${t}"`}>${cbx(r.presets.includes(t))}</div>`).join('')}
        <div class="ac ${deletable ? 'pa-click' : ''}" ${deletable ? `data-act="reg-del" data-prop="${r.name}" style="color:var(--fg-2)"` : 'style="opacity:.35"'} title="${deletable ? '删除' : r.builtin ? '内置属性不可删除' : '使用中，不可删除'}">${I('trash')}</div></div>`
    })
    .join('')
  const form = C
    ? `<div style="padding:14px 16px;border-top:1px solid var(--line);background:var(--surface-2)"><div class="hs g8 top"><div class="vs g6 grow"><input class="input pa-fld" data-fid="new-name" data-bind="new-name" placeholder="属性名称" value="${esc(C.name)}" style="min-height:32px" />${C.error ? `<div class="help is-error hs g6">${I('circle-alert', 'i-sm')}<span>${C.error}</span></div>` : ''}</div>
      <div class="ptypes" style="width:330px">${PTYPE_ORDER.map(t => `<span class="ptype pa-click ${t === C.type ? 'on' : ''}" data-act="new-type" data-v="${t}">${pticon(t)}${PTYPES[t].zh}</span>`).join('')}</div>
      <div class="hs g8">${btn('取消', { sm: true, v: 'ghost', attrs: 'data-act="new-cancel"' })}${btn('创建', { sm: true, v: 'primary', off: !!C.error || !C.name.trim(), attrs: 'data-act="new-create"' })}</div></div></div>`
    : ''
  return `<div class="phead"><div class="grow"><h1>属性</h1><div class="sub">${STORE.registry.length} 个属性 · 内置 ${STORE.registry.filter(r => r.builtin).length} · 自定义 ${STORE.registry.filter(r => !r.builtin).length}</div></div>
    ${btn(`删除未使用（${unused.length}）`, { icon: 'trash', off: !unused.length, attrs: 'data-act="reg-del-unused"' })}${btn('新建属性', { v: 'primary', icon: 'plus', attrs: 'data-act="new-open"' })}</div>
    <div class="pbody" style="overflow:auto">${banner('info', '<b>名称与类型全局绑定</b>：同一个名称在所有条目里是同一种类型。使用数为 0 才能删除；已被使用的属性不能改类型，也不提供重命名。')}
    <div class="ptab"><div class="ptab-h"><div>名称</div><div>类型</div><div>默认值</div><div style="text-align:right">使用数</div><div class="ck">剪藏</div><div class="ck">截图</div><div class="ac"></div></div>${rows}${form}</div></div>`
}

// ── 设置页 ──────────────────────────────────────────────────────────────
const PA_RATIOS = [['1:1', 1, 1], ['4:5', 4, 5], ['3:4', 3, 4], ['4:3', 4, 3], ['16:9', 16, 9], ['9:16', 9, 16]]
const paSettingsPage = () => {
  const prefs =
    settingsRow('默认高亮颜色', '阅读视图里新建高亮的初始颜色；每条高亮之后都可以改。', `<span class="hs g8">${HL_COLORS.map(c => `<span class="pa-click" data-act="hl-default" data-v="${c}" title="${HL_NAMES[c]}">${hlDot(c, PA.hlColor === c)}</span>`).join('')}</span>`) +
    settingsRow('区块剪藏入口', '指针停在区块上时，旁边出现胶囊。关掉后，上面“页面里”的原型里不再出现区块胶囊；键盘上的区块模式不受影响。', `<span class="pa-click" data-act="block-on">${sw(PA.blockOn)}</span>`)
  const fmtSeg = `<span class="seg">${[['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']].map(([f, l]) => `<span class="pa-click ${PA.fmt === f ? 'on' : ''}" data-act="fmt" data-v="${f}" tabindex="0" role="button">${l}</span>`).join('')}</span>`
  const ratioChecks = `<span class="hs g6 wrap" style="margin-top:10px">${PA_RATIOS.map(([l, w, h]) => `<span class="pa-click rcheck ${PA.ratios.includes(l) ? 'on' : ''}" data-act="ratio" data-v="${l}" tabindex="0" role="button" aria-pressed="${PA.ratios.includes(l)}">${PA.ratios.includes(l) ? I('check') : ''}<i class="rg" style="width:${Math.round((w * 13) / Math.max(w, h))}px;height:${Math.round((h * 13) / Math.max(w, h))}px"></i>${l}</span>`).join('')}</span>`
  const shot =
    settingsRow('截图默认匿名', '身份元素自动打上马赛克候选；每次截图时可以在预览里增删。', `<span class="pa-click" data-act="anon">${sw(PA.anon)}</span>`) +
    settingsRow('下载格式', '只作用于下载；入库的图片和复制到剪贴板的图片始终是 PNG。', fmtSeg) +
    settingsRow('JPEG / WebP 质量', '选 JPEG 或 WebP 时可调，默认 0.9；PNG 无损，没有质量。', `<span class="slider ${PA.fmt === 'png' ? 'is-off' : ''}"><i style="width:80%"></i><b style="left:80%"></b></span><span class="tnum muted">0.9</span>`) +
    `<div class="set-r" style="display:block"><div class="l"><b>比例预设</b><small>勾选哪些比例出现在截图的选区条上；每次截图从“自由”开始。</small></div>${ratioChecks}</div>` +
    settingsRow('品牌水印', '署名用，只加在复制与下载的图片上；入库的图片不带水印。文字、图片、位置、大小与透明度见上方“设置”画板。', `<span class="pa-click" data-act="wm">${sw(PA.wm)}</span>`) +
    settingsRow('默认开启美化', '开启后，每次截图一进编辑就带上默认的背景、留白、圆角与阴影；工具栏的美化面板里随时可以改。样式与预览见上方“设置”画板。', `<span class="pa-click" data-act="bz">${sw(PA.bz)}</span>`)
  const data = `<div class="set-r"><div class="l grow" style="min-width:0"><b>本地存储</b><small>其中截图 89 MB。接近浏览器配额时，会在保存前提示。</small><div class="progress" style="margin-top:8px"><i style="width:3%"></i></div></div><div class="none tnum b">126 MB / 约 4.2 GB 可用</div></div>${settingsRow('导出内容', '包含全部条目的 Markdown（属性即 frontmatter，高亮写成 ==…==）和处理后的图片。', btn('导出内容', { icon: 'download', v: 'primary', attrs: 'data-act="export"' }))}`
  return `<div class="phead"><div class="grow"><h1>设置</h1><div class="sub">偏好只保存在本机</div></div></div><div class="pbody" style="overflow:auto"><div class="vs g16" style="max-width:720px">${settingsCard('偏好', '每一项都用一句话说清后果。', prefs)}${settingsCard('截图', '输出的格式、比例、水印和默认匿名。', shot)}${settingsCard('数据', '', data)}</div></div>`
}

const paDialog = () => {
  if (PA.confirm) {
    const e = paEntry(PA.confirm.id)
    if (!e) return ''
    const n = (e.hls || []).length
    const what = e.type === 'screenshot' ? '这张截图' : '这条剪藏'
    return `<div class="dlg-back" data-act="dlg-bg"><div data-dlg><div class="dlg" style="width:420px"><h3>删除${what}？</h3><div class="help" style="margin:6px 0 14px">“${esc(e.title)}”${n ? `有 <b>${n} 条高亮</b>，会和它一起删除。` : e.type === 'screenshot' ? '的图片会一并删除。' : '会被删除。'}这个操作不能撤销。</div><div class="hs g8 end">${btn('取消', { v: 'ghost', attrs: 'data-act="confirm-cancel"' })}${btn(n ? '删除剪藏与高亮' : '删除', { v: 'danger', icon: 'trash', attrs: 'data-act="confirm-del"' })}</div></div></div></div>`
  }
  if (!PA.dlg) return ''
  const n = STORE.entries.length
  const m = STORE.entries.filter(e => e.type === 'screenshot').length
  const fit = h => h.replace(/95 条条目/g, `${n} 条条目`).replace(/24 张/g, `${m} 张`)
  const body = PA.dlg === 'progress' ? fit(exportDlg('progress')).replace(/width:63%/, `width:${PA.progress}%`).replace('75 / 119', `${Math.round((PA.progress / 100) * (n + m))} / ${n + m}`) : fit(exportDlg(PA.dlg))
  return `<div class="dlg-back" data-act="dlg-bg"><div data-dlg>${body.replace('<div class="dlg"', '<div class="dlg" style="width:420px"')}</div></div>`
}

// 重绘应用时，这些滚动区域的位置要保留，否则输入备注、改色时正文会跳回顶部。key 变了（换了视图、换了条目）才归零
const PA_SCROLLERS = ['.rd-main', '.rd-pane', '.pbody', '.dbody']
const paScrollKeys = () => ({ '.rd-main': `${PA.view}:${PA.read}`, '.rd-pane': `${PA.view}:${PA.read}:${PA.tab}`, '.pbody': PA.view, '.dbody': `${PA.view}:${PA.sel}` })

function paRender(root) {
  const app = root.querySelector('.pa-app')
  const keep = document.activeElement && app.contains(document.activeElement) && document.activeElement.dataset ? { fid: document.activeElement.dataset.fid, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
  const tops = Object.fromEntries(PA_SCROLLERS.map(sel => [sel, (app.querySelector(sel) || {}).scrollTop || 0]))
  if (PA.view === 'read' && !paEntry(PA.read)) PA.view = 'clip'
  const e = PA.sel ? paEntry(PA.sel) : null
  if (PA.sel && !e) PA.sel = null
  const listy = ['all', 'clip', 'screenshot'].includes(PA.view)
  const main = PA.view === 'properties' ? paPropsPage() : PA.view === 'settings' ? paSettingsPage() : PA.view === 'read' ? paReader(paEntry(PA.read)) : PA.view === 'highlight' ? paHlPage() : paListPage()
  app.innerHTML = `<div class="app ${PA.rail ? 'is-rail is-narrow' : ''}" style="height:100%">${paNavHtml()}<div class="main">${main}${e && listy ? paDrawer(e) : ''}</div>${paDialog()}</div>`
  const now = paScrollKeys()
  PA_SCROLLERS.forEach(sel => {
    const el = app.querySelector(sel)
    if (el && PA.lastKeys[sel] === now[sel]) el.scrollTop = tops[sel]
  })
  PA.lastKeys = now
  // 键盘可达：行、芯片、图标按钮都能 Tab 到，Enter / 空格触发；fid 让重绘之后焦点回到原处
  app.querySelectorAll('.nav .pa-click, .phead .pa-click, .fbar .pa-click, .erow, .hr, .gal > .pa-click, .drawer .pa-click, .rd-rail .pa-click, .rd-bar .pa-click, .ptab .pa-click, [data-dlg] .pa-click').forEach(el => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    if (!el.dataset.fid) el.dataset.fid = ['k', el.dataset.act, el.dataset.prop, el.dataset.v, el.dataset.id, el.dataset.hl, el.dataset.type, el.dataset.color].filter(Boolean).join(':')
  })
  // 抽屉：打开时焦点进入抽屉，关闭后回到触发它的那一行（extension §7）
  let intoDrawer = false
  if (e && listy && PA.opened !== PA.sel) {
    const d = app.querySelector('.drawer')
    PA.opened = PA.sel
    if (d) {
      d.setAttribute('tabindex', '-1')
      d.focus({ preventScroll: true })
      intoDrawer = true
    }
  } else if (!PA.sel && PA.opened) {
    const back = app.querySelector(`[data-id="${PA.opened}"]`)
    PA.opened = null
    if (back) back.focus({ preventScroll: true })
  }
  if (PA.focus) {
    const el = app.querySelector(`[data-fid="${PA.focus}"]`)
    PA.focus = null
    if (el) el.focus()
  } else if (!intoDrawer && keep && keep.fid) {
    const el = app.querySelector(`[data-fid="${keep.fid}"]`)
    if (el) {
      el.focus({ preventScroll: true })
      try {
        el.setSelectionRange(keep.s, keep.e)
      } catch {}
    }
  }
  // 从高亮视图点进阅读视图：把那一条滚到视口上方三分之一处
  if (PA.scrollTo && PA.view === 'read') {
    const m = app.querySelector(`[data-hid="${PA.scrollTo}"]`)
    const sc = app.querySelector('.rd-main')
    PA.scrollTo = null
    if (m && sc) sc.scrollTop += (m.getBoundingClientRect().top - sc.getBoundingClientRect().top) / paScale(root) - sc.clientHeight / 3
  }
}

// ── 叠在应用上的浮层：选中文字的工具条、已有高亮的浮层、撤销提示。
//    它们不跟着应用一起重绘，选区才不会在改色、输入备注时丢掉 ──────────────────────────
function paOverlay(root) {
  const over = root.querySelector('.pa-over')
  let out = ''
  if (PA.bar) {
    out += `<div class="hbar pa-bar" style="left:${PA.bar.left}px;top:${PA.bar.top}px" role="toolbar" aria-label="高亮"><span class="dots" role="group" aria-label="颜色">${HL_COLORS.map(c => `<span class="dotb pa-click" data-act="hl-new" data-v="${c}" title="${HL_NAMES[c]}" tabindex="0" role="button" aria-label="${HL_NAMES[c]}">${hlDot(c, c === PA.hlColor)}</span>`).join('')}</span><i class="sepd"></i><span class="act pa-click" data-act="hl-new-note" tabindex="0" role="button">${I('message-square-text', 'i-sm')}备注</span><i class="sepd"></i><span class="act">${keys('H')}</span></div>`
  }
  const pe = PA.pop && paEntry(PA.pop.entryId)
  const ph = pe && (pe.hls || []).find(h => h.id === PA.pop.hid)
  if (ph) {
    out += `<div class="hpop pa-pop" style="left:${PA.pop.left}px;top:${PA.pop.top}px" role="dialog" aria-label="高亮">
      <div class="hs between"><span class="hs g8" role="radiogroup" aria-label="颜色">${HL_COLORS.map(c => `<span class="dotb pa-click" data-act="hl-color" data-v="${c}" title="${HL_NAMES[c]}" tabindex="0" role="radio" aria-checked="${c === ph.c}">${hlDot(c, c === ph.c)}</span>`).join('')}</span><span class="t-xs muted">${HL_NAMES[ph.c]}</span></div>
      <textarea class="textarea pa-fld" data-bind="hl-note" data-fid="hl-note" placeholder="写下你的想法（可选）" maxlength="${HL_LIMITS.note}" style="margin-top:10px;min-height:56px;font-size:12.5px">${esc(ph.note || '')}</textarea>
      <div class="hs g8" style="margin-top:10px"><span class="t-xs muted">失焦即保存</span><span class="grow"></span>${btn('删除', { sm: true, v: 'ghost', icon: 'trash', attrs: 'data-act="hl-del"' })}</div></div>`
  }
  if (PA.toast) out += `<div class="toast-pos pa-toast" style="z-index:40"><div class="toast">${I(PA.toast.icon || 'circle-alert')}<span>${PA.toast.text}</span>${PA.toast.undo ? '<i class="sepd"></i><span class="act pa-click" data-act="hl-undo" tabindex="0" role="button">撤销</span>' : ''}</div></div>`
  const keep = document.activeElement && over.contains(document.activeElement) ? { fid: document.activeElement.dataset.fid, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
  over.innerHTML = out
  if (keep && keep.fid) {
    const el = over.querySelector(`[data-fid="${keep.fid}"]`)
    if (el) {
      el.focus({ preventScroll: true })
      try {
        el.setSelectionRange(keep.s, keep.e)
      } catch {}
    }
  }
}

function paOpen(id) {
  PA.view = 'all'
  PA.q = PA.tag = PA.project = PA.color = ''
  PA.types = []
  PA.sel = id
  PA.adding = null
  const root = document.querySelector('#proto-app .pa-root')
  if (root) paRender(root)
  const b = document.getElementById('proto-app')
  if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function paInit(root) {
  root.innerHTML = '<div class="pa-app" style="height:100%"></div><div class="pa-over"></div>'
  const render = () => paRender(root)
  STORE.listeners.add(render)

  const setProp = (e, name, value) => {
    if (name === 'title') e.title = value
    else if (paEmpty(value) && value !== false) delete e.props[name]
    else e.props[name] = value
  }
  const addToEntry = (e, name) => {
    ;(e._show ||= []).includes(name) || e._show.push(name)
    const r = paReg(name)
    if (r && r.def && r.type === 'text' && !r.builtin && e.props[name] == null) e.props[name] = r.def
  }
  const showToast = (text, icon, ms = 2400, undo = false) => {
    PA.toast = { text, icon, undo }
    paOverlay(root)
    clearTimeout(showToast.t)
    showToast.t = setTimeout(
      () => {
        PA.toast = null
        paOverlay(root)
      },
      undo ? 3000 : ms,
    )
  }
  const startExport = () => {
    PA.dlg = 'progress'
    PA.progress = 0
    const step = () => {
      PA.progress += 12
      if (PA.progress >= 100) PA.dlg = 'full'
      render()
      if (PA.dlg === 'progress') setTimeout(step, 160)
    }
    setTimeout(step, 160)
  }

  // ── 高亮：选区 → 工具条 → 创建 / 合并 ────────────────────────────────────
  const posIn = rect => {
    const rr = root.getBoundingClientRect()
    const sc = paScale(root)
    return { cx: (rect.left + rect.width / 2 - rr.left) / sc, top: (rect.top - rr.top) / sc, bottom: (rect.bottom - rr.top) / sc, w: root.clientWidth }
  }
  const readSelection = () => {
    const s = window.getSelection()
    if (!s || !s.rangeCount || s.isCollapsed) return null
    const rg = s.getRangeAt(0)
    const mdEl = (rg.commonAncestorContainer.nodeType === 1 ? rg.commonAncestorContainer : rg.commonAncestorContainer.parentElement).closest('.md[data-md]')
    if (!mdEl || !root.contains(mdEl)) return null
    const e = paEntry(mdEl.dataset.md)
    if (!e || e.type !== 'clip') return null
    const off = mdOffsets(rg, mdEl, e.content)
    if (!off) return null
    const p = posIn(rg.getBoundingClientRect())
    const w = 292
    return { id: e.id, s: off.s, e: off.e, left: Math.round(Math.max(8, Math.min(p.cx - w / 2, p.w - w - 8))), top: Math.round(p.top < 52 ? p.bottom + 10 : p.top - 46) }
  }
  const updateBar = () => {
    const b = readSelection()
    if (!b && !PA.bar) return
    if (b) PA.pop = null
    PA.bar = b
    paOverlay(root)
  }
  // 关闭高亮浮层与描边。直接改 DOM、不重绘应用：在 mousedown 里重绘会把马上要收到 click 的元素换掉
  const closePop = () => {
    if (!PA.pop && !PA.on) return
    PA.pop = null
    PA.on = null
    root.querySelectorAll('.hlm.is-on').forEach(m => m.classList.remove('is-on'))
    root.querySelectorAll('.hli.on').forEach(m => m.classList.remove('on'))
    paOverlay(root)
  }
  const openPop = (hid, eid, focusNote) => {
    const m = root.querySelector(`[data-hid="${hid}"]`)
    if (!m) return
    const rects = m.getClientRects()
    const p = posIn(rects[rects.length - 1] || m.getBoundingClientRect())
    const w = 296
    PA.on = hid
    PA.bar = null
    PA.pop = { hid, entryId: eid, left: Math.round(Math.max(8, Math.min(p.cx - w / 2, p.w - w - 8))), top: Math.round(p.bottom + 8) }
    render()
    paOverlay(root)
    if (focusNote) {
      const ta = root.querySelector('.pa-over [data-bind="hl-note"]')
      if (ta) ta.focus({ preventScroll: true })
    }
  }
  const create = (color, withNote) => {
    const b = PA.bar
    if (!b) return
    const e = paEntry(b.id)
    PA.bar = null
    window.getSelection().removeAllRanges()
    if (!e) return paOverlay(root)
    const r = mdAddHighlight(e, b.s, b.e, color, `h${++STORE.seq}`)
    if (r.error) {
      paOverlay(root)
      return showToast(r.error, 'circle-alert')
    }
    PA.on = r.h.id
    STORE.emit()
    if (r.merged) showToast(`已与 ${r.merged} 条重叠的高亮合并`, 'layers')
    if (withNote) openPop(r.h.id, e.id, true)
    else paOverlay(root)
  }
  const delHl = () => {
    const e = PA.pop && paEntry(PA.pop.entryId)
    if (!e) return
    const i = e.hls.findIndex(h => h.id === PA.pop.hid)
    if (i < 0) return
    PA.undo = { entryId: e.id, h: { ...e.hls[i] } }
    e.hls.splice(i, 1)
    PA.pop = null
    PA.on = null
    STORE.emit()
    showToast('已删除一条高亮', 'trash', 3000, true)
  }
  const undoHl = () => {
    const u = PA.undo
    const e = u && paEntry(u.entryId)
    if (!e) return
    const r = mdAddHighlight(e, u.h.s, u.h.e, u.h.c, u.h.id)
    if (r.h) Object.assign(r.h, { note: u.h.note, t: u.h.t })
    PA.undo = null
    PA.toast = null
    STORE.emit()
    paOverlay(root)
  }

  root.addEventListener('click', ev => {
    const t = ev.target
    // 导出对话框里的按钮没有 data-act：先于其他分发，按文字处理
    const dlgBtn = t.closest('[data-dlg] button')
    if (dlgBtn && !dlgBtn.dataset.act) {
      if (/^导出 ZIP/.test(dlgBtn.textContent.trim())) startExport()
      else PA.dlg = null
      return render()
    }
    const mark = t.closest('.hlm')
    if (mark && window.getSelection().isCollapsed) return openPop(mark.dataset.hid, mark.closest('.md[data-md]').dataset.md, false)
    const nav = t.closest('[data-nav]')
    if (nav) {
      PA.view = nav.dataset.nav
      PA.sel = null
      PA.read = null
      PA.adding = null
      PA.creating = null
      PA.pop = PA.bar = PA.on = null
      paOverlay(root)
      return render()
    }
    const hlRow = t.closest('[data-hl]')
    if (hlRow && !t.closest('[data-tag]')) {
      const hid = hlRow.dataset.hl
      PA.pop = PA.bar = null
      PA.on = hid
      PA.scrollTo = hid
      if (PA.view !== 'read') {
        PA.view = 'read'
        PA.read = hlRow.dataset.id
        PA.sel = null
        PA.tab = 'hl'
      }
      paOverlay(root)
      return render()
    }
    const tag = t.closest('[data-tag]')
    if (tag) {
      PA.tag = tag.dataset.tag
      return render()
    }
    const proj = t.closest('[data-project]')
    if (proj) {
      PA.project = proj.dataset.project
      return render()
    }
    const ty = t.closest('[data-type]')
    if (ty) {
      const v = ty.dataset.type
      PA.types = PA.types.includes(v) ? PA.types.filter(x => x !== v) : [...PA.types, v]
      return render()
    }
    const col = t.closest('[data-color]')
    if (col) {
      PA.color = PA.color === col.dataset.color ? '' : col.dataset.color
      return render()
    }
    const a = t.closest('[data-act]')
    if (a) {
      const act = a.dataset.act
      const e = paCur()
      const prop = a.dataset.prop
      const v = a.dataset.v
      if (act === 'hl-new') return create(v, false)
      if (act === 'hl-new-note') return create(PA.hlColor, true)
      if (act === 'hl-color') {
        const pe = PA.pop && paEntry(PA.pop.entryId)
        const h = pe && pe.hls.find(x => x.id === PA.pop.hid)
        if (h) {
          h.c = v
          STORE.emit()
          paOverlay(root)
        }
        return
      }
      if (act === 'hl-del') return delHl()
      if (act === 'hl-undo') return undoHl()
      if (act === 'fold') PA.rail = !PA.rail
      else if (act === 'close') (PA.sel = null), (PA.adding = null)
      else if (act === 'read' && e) {
        PA.view = 'read'
        PA.read = e.id
        PA.sel = null
        PA.tab = 'hl'
        PA.adding = null
      } else if (act === 'back') {
        PA.view = 'clip'
        PA.sel = PA.read
        PA.read = null
        PA.adding = null
        PA.pop = PA.bar = PA.on = null
        paOverlay(root)
      } else if (act === 'tab') PA.tab = v
      else if (act === 'src') showToast('真实实现里会在新标签页打开来源页；页面上没有任何标记', 'arrow-up-right', 2800)
      else if (act === 'del' && e) PA.confirm = { id: e.id }
      else if (act === 'confirm-cancel') PA.confirm = null
      else if (act === 'confirm-del' && PA.confirm) {
        const i = STORE.entries.findIndex(x => x.id === PA.confirm.id)
        if (i >= 0) STORE.entries.splice(i, 1)
        PA.confirm = null
        PA.sel = null
        STORE.emit()
        return
      } else if (act === 'clear-q') PA.q = ''
      else if (act === 'clear-tag') PA.tag = ''
      else if (act === 'clear-project') PA.project = ''
      else if (act === 'clear-all') (PA.q = PA.tag = PA.project = PA.color = ''), (PA.types = [])
      else if (act === 'toggle' && e) setProp(e, prop, e.props[prop] !== true)
      else if (act === 'list-del' && e) {
        if (prop === 'tags') e.tags = e.tags.filter(x => x !== v)
        else setProp(e, prop, (e.props[prop] || []).filter(x => x !== v))
      } else if (act === 'prop-del' && e) {
        delete e.props[prop]
        e._show = (e._show || []).filter(x => x !== prop)
      } else if (act === 'add') (PA.adding = { q: '', mode: 'search', type: 'text', error: '' }), (PA.focus = 'combo')
      else if (act === 'combo-close') PA.adding = null
      else if (act === 'pick' && e) {
        addToEntry(e, v)
        PA.adding = null
      } else if (act === 'to-create') {
        PA.adding.mode = 'create'
        PA.adding.error = paCheckName(PA.adding.q)
        PA.focus = 'combo'
      } else if (act === 'ptype' && PA.adding) PA.adding.type = v
      else if (act === 'create-add' && e && PA.adding && !PA.adding.error) {
        const name = PA.adding.q.trim()
        STORE.registry.push({ name, type: PA.adding.type, builtin: false, def: '', used: 0, presets: [] })
        addToEntry(e, name)
        PA.adding = null
      } else if (act === 'preset') {
        const r = paReg(prop)
        r.presets = r.presets.includes(v) ? r.presets.filter(x => x !== v) : [...r.presets, v]
      } else if (act === 'reg-del') STORE.registry.splice(STORE.registry.indexOf(paReg(prop)), 1)
      else if (act === 'reg-del-unused') STORE.registry = STORE.registry.filter(r => r.builtin || paUsed(r) > 0)
      else if (act === 'new-open') (PA.creating = { name: '', type: 'text', error: '' }), (PA.focus = 'new-name')
      else if (act === 'new-cancel') PA.creating = null
      else if (act === 'new-type') PA.creating.type = v
      else if (act === 'new-create' && PA.creating && !PA.creating.error) {
        STORE.registry.push({ name: PA.creating.name.trim(), type: PA.creating.type, builtin: false, def: '', used: 0, presets: [] })
        PA.creating = null
      } else if (act === 'hl-default') PA.hlColor = v
      else if (act === 'anon') PA.anon = !PA.anon
      else if (act === 'block-on') PA.blockOn = !PA.blockOn
      else if (act === 'fmt') PA.fmt = v
      else if (act === 'ratio') PA.ratios = PA.ratios.includes(v) ? PA.ratios.filter(x => x !== v) : [...PA.ratios, v]
      else if (act === 'wm') PA.wm = !PA.wm
      else if (act === 'bz') PA.bz = !PA.bz
      else if (act === 'export') PA.dlg = 'ready'
      else if (act === 'dlg-bg') {
        if (ev.target === a) PA.dlg = PA.confirm = null
      }
      STORE.emit()
      return
    }
    const row = t.closest('[data-id]')
    if (row) {
      PA.sel = row.dataset.id
      PA.adding = null
      return render()
    }
  })

  root.addEventListener('input', ev => {
    const t = ev.target
    const bind = t.dataset && t.dataset.bind
    const e = paCur()
    if (bind === 'q') PA.q = t.value
    else if (bind === 'note' && e) e.note = t.value
    else if (bind === 'hl-note') {
      const pe = PA.pop && paEntry(PA.pop.entryId)
      const h = pe && pe.hls.find(x => x.id === PA.pop.hid)
      if (h) h.note = t.value.slice(0, HL_LIMITS.note)
    } else if (bind === 'combo' && PA.adding) {
      PA.adding.q = t.value
      if (PA.adding.mode === 'create') PA.adding.error = paCheckName(t.value)
    } else if (bind === 'new-name' && PA.creating) {
      PA.creating.name = t.value
      PA.creating.error = t.value.trim() ? paCheckName(t.value) : ''
    } else if (t.dataset && t.dataset.prop && e) {
      let val = t.value
      if (t.type === 'number') val = val === '' ? '' : Number(val)
      setProp(e, t.dataset.prop, val)
    } else return
    STORE.emit()
  })

  root.addEventListener('keydown', ev => {
    const t = ev.target
    const e = paCur()
    if (ev.key === 'Enter' && t.dataset && t.dataset.listadd && e) {
      ev.preventDefault()
      const key = t.dataset.listadd
      const val = t.value.trim().slice(0, key === 'tags' ? 32 : 100)
      if (!val) return
      if (key === 'tags') {
        if (e.tags.length < 20 && !e.tags.some(x => x.toLowerCase() === val.toLowerCase())) e.tags.push(val.toLowerCase())
      } else {
        const list = e.props[key] || []
        if (!list.includes(val)) e.props[key] = [...list, val]
      }
      STORE.emit()
      const el = root.querySelector(`[data-listadd="${key}"]`)
      if (el) el.focus()
    } else if ((ev.key === 'Enter' || ev.key === ' ') && t.getAttribute && t.getAttribute('tabindex') === '0' && !/^(input|textarea|button)$/i.test(t.tagName)) {
      ev.preventDefault()
      t.click()
    } else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && t.closest && t.closest('.nav-i')) {
      // 导航里用 ↑ ↓ 切换
      const items = [...root.querySelectorAll('.nav-i')]
      const i = items.indexOf(t.closest('.nav-i'))
      ev.preventDefault()
      items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
    } else if (ev.key === 'Tab' && t.closest && t.closest('.drawer')) {
      // 抽屉打开时焦点被限制在其中
      const dr = t.closest('.drawer')
      const f = [...dr.querySelectorAll('button:not([disabled]), input, textarea, [tabindex="0"]')].filter(x => x.offsetParent !== null)
      if (!f.length) return
      if (ev.shiftKey && (t === f[0] || t === dr)) {
        ev.preventDefault()
        f[f.length - 1].focus()
      } else if (!ev.shiftKey && t === f[f.length - 1]) {
        ev.preventDefault()
        f[0].focus()
      }
    }
  })

  // 在原文里选中文字（鼠标松开，或键盘选择之后）：出现工具条。在浮层上按下不能清掉选区，但文本框要能聚焦
  let down = false
  root.addEventListener('mousedown', ev => {
    down = true
    if (ev.target.closest('.pa-over')) {
      if (!ev.target.closest('textarea, input')) ev.preventDefault()
    } else if (!ev.target.closest('.hlm')) closePop()
  })
  document.addEventListener('mouseup', () => {
    if (!down) return
    down = false
    setTimeout(updateBar, 0)
  })
  let selTimer = null
  document.addEventListener('selectionchange', () => {
    if (down || !root.isConnected) return
    clearTimeout(selTimer)
    selTimer = setTimeout(updateBar, 140)
  })
  // 滚动正文时，工具条与浮层不会跟着走：先收起。只看用户的滚轮，重绘时恢复滚动位置触发的 scroll 不算
  root.addEventListener(
    'wheel',
    ev => {
      if (ev.target.closest('.pa-over') || (!PA.bar && !PA.pop)) return
      PA.bar = null
      closePop()
      paOverlay(root)
    },
    { passive: true },
  )

  // Esc 依次关闭对话框、浮层、补全、抽屉、阅读视图。焦点在页面空白处（body）时也要生效，所以挂在 document 上
  document.addEventListener('keydown', ev => {
    if (!root.isConnected) return
    const a = document.activeElement
    const inField = a && /^(input|textarea)$/i.test(a.tagName)
    if (ev.key === 'Escape') {
      if (a && a !== document.body && !root.contains(a)) return
      if (PA.dlg || PA.confirm) PA.dlg = PA.confirm = null
      else if (PA.pop) return closePop()
      else if (PA.bar) {
        PA.bar = null
        window.getSelection().removeAllRanges()
        return paOverlay(root)
      } else if (PA.adding) PA.adding = null
      else if (PA.sel) PA.sel = null
      else if (PA.view === 'read') {
        PA.view = 'clip'
        PA.sel = PA.read
        PA.read = null
        PA.on = null
      } else return
      render()
    } else if (ev.key === '/' && !inField) {
      const el = root.querySelector('[data-fid="search"]')
      if (el) {
        ev.preventDefault()
        el.focus()
      }
    } else if ((ev.key === 'h' || ev.key === 'H') && PA.bar && !inField && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
      // 选中文字后按 H：以默认颜色创建高亮
      ev.preventDefault()
      create(PA.hlColor, false)
    }
  })
  render()
}

function extProtoGroup() {
  const cap = board({
    title: '原型 · 页面里：选中文字或指一下整块，再剪藏 / 截图',
    ref: 'extension §2.1 · §3 · capture §6',
    live: true,
    w: 1040,
    id: 'proto-capture',
    body: browser(`${article({ sel: 'none', blocks: true })}<div class="pc-menu"></div><div class="pc-blk"></div><div class="pc-side-host"></div><div class="pc-layer"></div>`, { h: 1120 }),
    notes: [
      '<b>试试看（选区）</b>：在文章里选中一段文字 → 选区菜单出现，只有“剪藏”和“截图” → 点“剪藏”：一次点击就保存，约 3 秒内可以<b>撤销</b>或<b>编辑</b>（改标题、加标签、写备注）。页面上不会留下任何标记。',
      '<b>试试看（区块）</b>：不选中任何文字，把指针停在“Three common strategies”那一节、其中的代码块或页面底部的帖子上约 0.4 秒 → 旁边出现描边和胶囊「剪藏 | 截图 | 上一级 | 更多」；代码块和帖子的右上角各有页面自己的按钮，胶囊会让开；点 ⌃ 选上一级（代码块 → 一节 → 整篇文章）。在下面资料库的“设置”里关掉区块入口，这里就不再出现。',
      '<b>新剪藏自动带着 <code>project: 支付重试</code></b>：那是属性页里给“剪藏”勾选的类型预设；保存的条目（Markdown）会出现在下面的资料库原型里，打开后可以读和高亮。',
    ],
  })
  const app = board({
    title: '原型 · 资料库：读剪藏、划高亮（左导航 + 右内容）',
    ref: 'extension §2.2 · §4 · entry §4 · §5.3',
    live: true,
    w: 1280,
    id: 'proto-app',
    body: browser('<div class="pa-root" style="height:100%;position:relative"></div>', { h: 860, title: '全部 · AnnHub', url: 'chrome-extension://annhub/app.html#/all' }),
    notes: [
      '<b>读与划（核心）</b>：点一条剪藏（例如“Retries and backpressure”那条整节）→ 抽屉里点“阅读”，或直接在抽屉的原文里：<b>选中一段文字</b>，选区旁出现五个颜色点，点一个就创建高亮；<kbd>H</kbd> 以默认颜色创建；点已有高亮改色、写备注、删除（可撤销）；选区跨过已有高亮会合并。左边导航里的“高亮”按剪藏分组列出所有高亮，点一行回到阅读视图的原位置。',
      '<b>规则是真的</b>：有高亮的剪藏原文只读（抽屉里写着）；删除有高亮的剪藏会先提示高亮数；颜色在设置里选默认色。高亮不会出现在上面的“网页”里。',
      '<b>属性与壳</b>：点左侧导航切换视图、折叠成图标栏；在搜索框里输入；点标签或 <code>project</code> 小标签筛选；在抽屉或阅读视图的“属性”标签里添加属性——输入 <code>pro</code> 补全已有的 project，输入 <code>owner</code> 会让你选类型再创建，输入 <code>source</code> 或 <code>Project</code> 被就地拒绝；属性页的使用数实时变化，使用中的不能删。',
    ],
  })
  return group(
    { id: 'ext-proto', title: '可交互原型', small: '', desc: '把上面静态画板里的规则接成能点的流程：页面里一步剪藏（选区或整块），资料库里读、划高亮、整理属性。两个原型共用一份数据，页面里剪藏出来的条目会出现在资料库里。' },
    row(cap),
    row(app),
  )
}

function initProtoApp() {
  const root = document.querySelector('#proto-app .pa-root')
  if (root) paInit(root)
}
