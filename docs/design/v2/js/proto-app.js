// 可交互原型 2：资料库（左导航 + 右内容）。
// 能点：切换六个视图、折叠导航、搜索与筛选、打开抽屉、编辑标题与备注、添加 / 新建 / 清除属性、属性页的预设与删除、导出。
// 规则是真的：同名属性类型一致、保留名被拒绝、使用中的属性不可删除；剪藏原型里保存的条目也会出现在这里。
const PA = { view: 'all', rail: false, q: '', types: [], tag: '', project: '', sel: null, adding: null, creating: null, dlg: null, progress: 0, hlColor: 'yellow', anon: true, ready: false }

const paNorm = s => String(s).toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim()
const paEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length)
const paHay = e => paNorm([e.title, e.content, e.note || '', e.ctx || '', e.host, e.path, ...e.tags, ...Object.values(e.props).flatMap(v => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : []))].join(' '))
const paReg = name => STORE.registry.find(r => r.name.toLowerCase() === String(name).toLowerCase())
const paHas = (e, name) => (name === 'title' ? !!e.title : name === 'tags' ? e.tags.length > 0 : name === 'color' ? e.type === 'highlight' : e.props[name] != null && !paEmpty(e.props[name]))
const paCount = name => STORE.entries.filter(e => paHas(e, name)).length
const paUsed = r => paCount(r.name)
const paEntry = id => STORE.entries.find(e => e.id === id)

const paShown = () =>
  STORE.entries.filter(
    e => (PA.view === 'all' || e.type === PA.view) && (!PA.types.length || PA.types.includes(e.type)) && (!PA.tag || e.tags.includes(PA.tag)) && (!PA.project || e.props.project === PA.project) && (!PA.q || paHay(e).includes(paNorm(PA.q))),
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

// ── 视图 ────────────────────────────────────────────────────────────────
const paNavHtml = () => {
  const cnt = { all: STORE.entries.length, clip: STORE.entries.filter(e => e.type === 'clip').length, highlight: STORE.entries.filter(e => e.type === 'highlight').length, screenshot: STORE.entries.filter(e => e.type === 'screenshot').length, properties: STORE.registry.length }
  const item = it => `<div class="nav-i pa-click ${it.type ? `t-${it.type}` : ''} ${PA.view === it.id ? 'on' : ''}" data-nav="${it.id}" data-fid="nav-${it.id}" tabindex="0" ${PA.view === it.id ? 'aria-current="page"' : ''}>${I(it.icon)}<span>${it.zh}</span>${cnt[it.id] != null ? `<span class="n">${cnt[it.id]}</span>` : ''}</div>`
  const foot = PA.rail
    ? `<div class="nav-foot">${btn('', { icon: 'download', iconOnly: true, attrs: 'data-act="export"' })}</div>`
    : `<div class="nav-foot"><div class="meter"><div class="hs between"><span>本地存储</span><span class="tnum">126 MB</span></div><div class="progress"><i style="width:3%"></i></div></div>${btn('导出内容', { icon: 'download', cls: 'btn-block', attrs: 'data-act="export"' })}</div>`
  return `<nav class="nav" aria-label="AnnHub"><div class="nav-top"><div class="nav-brand"><svg class="i" aria-hidden="true"><use href="#i-logo"/></svg><span>AnnHub</span></div><span class="nav-fold pa-click" data-act="fold" aria-label="折叠导航">${I(PA.rail ? 'panel-left-open' : 'panel-left-close')}</span></div>
    <div class="nav-label">资料库</div>${NAV.map(item).join('')}<div class="nav-label">管理</div>${NAV2.map(item).join('')}${foot}</nav>`
}

const paRow = e => `<div class="erow pa-click ${PA.sel === e.id ? 'sel' : ''}" data-id="${e.id}">
  ${ttile(e.type)}
  <div style="min-width:0"><div class="tx clamp-2 ${e.type === 'screenshot' ? 'b' : ''}">${esc(e.type === 'screenshot' ? e.title : e.content)}</div>
    <div class="meta">${tchip(e.type, { sm: true })}${e.type !== 'screenshot' ? `<span class="ttl truncate">${esc(e.title)}</span>` : ''}<span>${e.host}</span><span>·</span><span>${e.when}</span>${e.tags.map(t => `<span class="tag pa-click" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}${e.props.project != null && e.props.project !== '' ? `<span class="ppill pa-click" data-project="${esc(e.props.project)}">${I('text')}<span>project</span><b>${esc(e.props.project)}</b></span>` : ''}${e.props.reviewed === true ? `<span class="ppill">${I('square-check')}<span>reviewed</span></span>` : ''}${e.props.priority != null && e.props.priority !== '' ? `<span class="ppill">${I('hash')}<span>priority</span><b>${esc(e.props.priority)}</b></span>` : ''}</div></div>
  <div class="side">${e.type === 'screenshot' ? thumb(e.img) : ''}</div></div>`

const paListPage = () => {
  const shown = paShown()
  const titles = { all: '全部', clip: '剪藏', highlight: '高亮', screenshot: '截图' }
  const total = STORE.entries.length
  const sub = PA.view === 'all' ? `${total} 条 · ${STORE.entries.filter(e => e.type === 'clip').length} 剪藏 · ${STORE.entries.filter(e => e.type === 'highlight').length} 高亮 · ${STORE.entries.filter(e => e.type === 'screenshot').length} 截图` : `${shown.length} 条`
  const head = `<div class="phead"><div class="grow"><h1>${titles[PA.view]}</h1><div class="sub">${sub}</div></div>
    <div class="search ${PA.q ? 'is-focus' : ''}" style="flex:none;width:300px">${I('search')}<input class="pa-bare" data-fid="search" data-bind="q" placeholder="搜索条目…" value="${esc(PA.q)}" autocomplete="off" />${PA.q ? `<span class="pa-click" data-act="clear-q">${I('x', 'i-sm')}</span>` : '<kbd>/</kbd>'}</div></div>`
  const typeChips = PA.view === 'all' ? TYPE_ORDER.map(t => `<span class="fchip pa-click ${PA.types.includes(t) ? 'on' : ''}" data-type="${t}">${I(TYPES[t].icon)}${TYPES[t].zh}</span>`).join('') : ''
  const active = [PA.tag && `<span class="fchip on pa-click" data-act="clear-tag">${I('tag')}标签：${esc(PA.tag)}${I('x')}</span>`, PA.project && `<span class="fchip on pa-click" data-act="clear-project">${I('sliders-horizontal')}project 等于 ${esc(PA.project)}${I('x')}</span>`].filter(Boolean).join('')
  const fb = `<div class="fbar">${typeChips}${active}<span class="grow"></span><span class="t-sm muted">${shown.length} 条</span>${PA.types.length || PA.tag || PA.project || PA.q ? `<span class="link t-sm pa-click" data-act="clear-all">清除筛选</span>` : ''}</div>`
  let body
  if (!total) body = `${onboarding()}${emptyState('library', '还没有条目', '选中网页中的一段文字，点“剪藏”或“高亮”；按 ⌘⇧S 框选一张截图。')}`
  else if (!shown.length) body = emptyState('search', '没有符合条件的条目', '当前搜索词与筛选条件下没有结果。筛选条件都还保留着，可以逐个移除。', btn('清除筛选', { v: 'primary', attrs: 'data-act="clear-all"' }))
  else if (PA.view === 'highlight') {
    const groups = {}
    shown.forEach(e => (groups[`${e.title}|${e.path}`] ||= []).push(e))
    body = Object.values(groups)
      .map(
        items => `<div class="hg"><div class="hg-h">${favicon(0)}<span class="ttl truncate">${esc(items[0].title)}</span><span class="host">${items[0].host}</span><span class="grow"></span><span class="chip">${items.length} 条</span></div>${items
          .map(
            h => `<div class="hr pa-click c-${h.color} ${PA.sel === h.id ? 'sel' : ''}" data-id="${h.id}"><i class="bar"></i><div style="min-width:0"><div class="tx">${esc(h.content)}</div>${h.note ? `<div class="note">${I('message-square-text')}<span>${esc(h.note)}</span></div>` : ''}<div style="display:flex;gap:8px;align-items:center;margin-top:5px;font-size:12px;color:var(--fg-3)"><span>${h.when}</span>${h.tags.map(t => `<span class="tag pa-click" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}</div></div><span></span></div>`,
          )
          .join('')}</div>`,
      )
      .join('')
  } else if (PA.view === 'screenshot')
    body = `<div class="gal">${shown.map(e => `<div class="pa-click" data-id="${e.id}">${galTile(e, { sel: PA.sel === e.id })}</div>`).join('')}</div>`
  else body = `<div class="list">${shown.map(paRow).join('')}</div>`
  return `${head}<div class="pbody ${PA.view === 'screenshot' ? '' : 'cap'}" style="overflow:auto">${fb}${body}</div>`
}

// ── 抽屉：属性的真实编辑器 ───────────────────────────────────────────────
const paShowNames = e => {
  const names = ['title', 'tags']
  ;['author', 'published', 'description'].forEach(n => (e.props[n] != null || (e._show || []).includes(n)) && names.push(n))
  if (e.type === 'highlight') names.push('color')
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
  if (name === 'color') ed = `<span class="hs g8">${HL_COLORS.map(c => `<span class="pa-click" data-act="color" data-v="${c}" title="${c}">${hlDot(c, e.color === c)}</span>`).join('')}<span class="t-xs muted">${e.color}</span></span>`
  else if (type === 'list') ed = paListEd(name, Array.isArray(v) ? v : [])
  else if (type === 'checkbox') ed = `<span class="pa-click" data-act="toggle" data-prop="${name}">${cbx(v === true, v === true ? '是' : '否')}</span>`
  else if (type === 'number') ed = `<input class="pa-in" type="number" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" placeholder="空" />`
  else if (type === 'date') ed = `<input class="pa-in" type="date" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" />`
  else if (type === 'datetime') ed = `<input class="pa-in" type="datetime-local" data-prop="${name}" data-fid="p-${name}" value="${v ?? ''}" />`
  else ed = `<input class="pa-in" data-prop="${name}" data-fid="${name === 'title' ? 'p-title-row' : `p-${name}`}" value="${esc(v ?? '')}" placeholder="空" />`
  const removable = name !== 'title' && name !== 'tags' && name !== 'color'
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
  const e = paEntry(PA.sel)
  const shown = paShowNames(e)
  const hits = STORE.registry.filter(r => r.name !== 'color' && !shown.includes(r.name) && r.name.toLowerCase().includes(A.q.toLowerCase()))
  const exact = paReg(A.q)
  return `<div class="pcombo"><div class="in">${I('plus')}<input class="pa-bare" data-fid="combo" data-bind="combo" value="${esc(A.q)}" placeholder="属性名称…" /></div>
    <div style="margin-top:6px">${hits.map(r => `<div class="opt pa-click" data-act="pick" data-v="${r.name}">${pticon(r.type)}<span>${r.name}</span><span class="t">${PTYPES[r.type].zh}${r.builtin ? ' · 内置' : ''}</span></div>`).join('')}
      ${A.q.trim() && !exact ? `<div class="opt pa-click" data-act="to-create">${I('plus')}<span>创建属性 “${esc(A.q)}”…</span><span class="t">选择类型</span></div>` : ''}
      ${!hits.length && !A.q.trim() ? '<div class="help" style="padding:6px 9px">没有更多可添加的属性，输入名称来创建新的。</div>' : ''}</div></div>`
}

const paDrawer = e => {
  const q = e.type === 'screenshot' ? `<div class="gt-img" style="border:1px solid var(--line);border-radius:10px">${imgSvg(e.img)}</div>` : e.type === 'highlight' ? `<blockquote class="qt" style="--c:var(--hl-${e.color})">${esc(e.content)}</blockquote>` : `<blockquote class="qt">${esc(e.content)}${e.ctx ? `<span class="ctx">语境：${esc(e.ctx)}</span>` : ''}</blockquote>`
  return `<aside class="drawer" aria-label="条目详情">
    <div class="dh">${tchip(e.type)}<span class="grow"></span>${btn('回到来源', { sm: true, icon: 'arrow-up-right' })}${btn('', { icon: 'trash', iconOnly: true, sm: true, v: 'ghost', attrs: 'data-act="del" aria-label="删除"' })}${btn('', { icon: 'x', iconOnly: true, sm: true, v: 'ghost', attrs: 'data-act="close" aria-label="关闭"' })}</div>
    <div class="dtitle"><input class="pa-in pa-title" data-prop="title" data-fid="p-title" value="${esc(e.title)}" aria-label="标题" /><div class="t-xs muted" style="margin:3px 0 0 7px">${e.host}${e.path} · ${e.when}</div></div>
    <div class="dbody" style="overflow:auto">
      <div class="dsec"><div class="h">${I(e.type === 'screenshot' ? 'image' : 'quote', 'i-sm')}${e.type === 'screenshot' ? '图片' : '原文'}</div>${q}</div>
      <div class="dsec"><div class="h">${I('message-square-text', 'i-sm')}备注</div><textarea class="textarea pa-fld" data-fid="note" data-bind="note" placeholder="写下你自己的话（可选）" style="min-height:52px;font-size:13px">${esc(e.note || '')}</textarea></div>
      <div class="dsec" style="border-bottom:0"><div class="h">${I('tags', 'i-sm')}属性</div>
        ${paShowNames(e)
          .map(n => paPropRow(e, n))
          .join('')}
        ${PA.adding ? `<div style="margin:6px 0 4px">${paComboHtml()}</div>` : `<div class="prow pa-click" data-act="add" style="grid-template-columns:1fr"><div class="pk" style="color:var(--brand-text)">${I('plus')}添加属性</div></div>`}
        <div class="t-xs muted" style="margin:10px 6px 4px;font-weight:650">系统字段 · 只读</div>
        ${sysRows(e)}</div>
    </div>
    <div class="dfoot"><span>更新于 刚刚 · 只保存在本机</span></div></aside>`
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
    <div class="ptab"><div class="ptab-h"><div>名称</div><div>类型</div><div>默认值</div><div style="text-align:right">使用数</div><div class="ck">剪藏</div><div class="ck">高亮</div><div class="ck">截图</div><div class="ac"></div></div>${rows}${form}</div></div>`
}

// ── 设置页 ──────────────────────────────────────────────────────────────
const paSettingsPage = () => {
  const prefs =
    settingsRow('默认高亮颜色', '新建高亮时使用；每条高亮之后都可以改。', `<span class="hs g8">${HL_COLORS.map(c => `<span class="pa-click" data-act="hl-default" data-v="${c}" title="${c}">${hlDot(c, PA.hlColor === c)}</span>`).join('')}</span>`) +
    settingsRow('截图默认匿名', '身份元素自动打上马赛克候选；每次截图时可以在预览里增删。', `<span class="pa-click" data-act="anon">${sw(PA.anon)}</span>`)
  const data = `<div class="set-r"><div class="l grow" style="min-width:0"><b>本地存储</b><small>其中截图 89 MB。接近浏览器配额时，会在保存前提示。</small><div class="progress" style="margin-top:8px"><i style="width:3%"></i></div></div><div class="none tnum b">126 MB / 约 4.2 GB 可用</div></div>${settingsRow('导出内容', '包含全部条目的 Markdown（属性即 frontmatter）和处理后的图片。', btn('导出内容', { icon: 'download', v: 'primary', attrs: 'data-act="export"' }))}`
  return `<div class="phead"><div class="grow"><h1>设置</h1><div class="sub">偏好只保存在本机</div></div></div><div class="pbody" style="overflow:auto"><div class="vs g16" style="max-width:720px">${settingsCard('采集', '只有两项偏好。', prefs)}${settingsCard('数据', '', data)}</div></div>`
}

const paDialog = () => {
  if (!PA.dlg) return ''
  const n = STORE.entries.length
  const m = STORE.entries.filter(e => e.type === 'screenshot').length
  const fit = h => h.replace(/128 条条目/g, `${n} 条条目`).replace(/24 张/g, `${m} 张`)
  const body = PA.dlg === 'progress' ? fit(exportDlg('progress')).replace(/width:63%/, `width:${PA.progress}%`).replace('96 / 152', `${Math.round((PA.progress / 100) * (n + m))} / ${n + m}`) : fit(exportDlg(PA.dlg))
  return `<div class="dlg-back" data-act="dlg-bg"><div data-dlg>${body.replace('<div class="dlg"', '<div class="dlg" style="width:420px"')}</div></div>`
}

function paRender(root) {
  const keep = document.activeElement && root.contains(document.activeElement) && document.activeElement.dataset ? { fid: document.activeElement.dataset.fid, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
  const e = PA.sel ? paEntry(PA.sel) : null
  if (PA.sel && !e) PA.sel = null
  const main = PA.view === 'properties' ? paPropsPage() : PA.view === 'settings' ? paSettingsPage() : paListPage()
  root.innerHTML = `<div class="app ${PA.rail ? 'is-rail is-narrow' : ''}" style="height:100%">${paNavHtml()}<div class="main">${main}${e && PA.view !== 'properties' && PA.view !== 'settings' ? paDrawer(e) : ''}</div>${paDialog()}</div>`
  // 键盘可达：行、芯片、图标按钮都能 Tab 到，Enter / 空格触发；fid 让重绘之后焦点回到原处
  root.querySelectorAll('.nav .pa-click, .phead .pa-click, .fbar .pa-click, .erow, .hr, .gal > .pa-click, .drawer .pa-click, .ptab .pa-click, [data-dlg] .pa-click').forEach(el => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    if (!el.dataset.fid) el.dataset.fid = ['k', el.dataset.act, el.dataset.prop, el.dataset.v, el.dataset.id, el.dataset.type].filter(Boolean).join(':')
  })
  // 抽屉：打开时焦点进入抽屉，关闭后回到触发它的那一行（extension §7）
  let intoDrawer = false
  if (PA.sel && PA.opened !== PA.sel) {
    const d = root.querySelector('.drawer')
    PA.opened = PA.sel
    if (d) {
      d.setAttribute('tabindex', '-1')
      d.focus({ preventScroll: true })
      intoDrawer = true
    }
  } else if (!PA.sel && PA.opened) {
    const back = root.querySelector(`[data-id="${PA.opened}"]`)
    PA.opened = null
    if (back) back.focus({ preventScroll: true })
  }
  if (PA.focus) {
    const el = root.querySelector(`[data-fid="${PA.focus}"]`)
    PA.focus = null
    if (el) el.focus()
  } else if (!intoDrawer && keep && keep.fid) {
    const el = root.querySelector(`[data-fid="${keep.fid}"]`)
    if (el) {
      el.focus()
      try {
        el.setSelectionRange(keep.s, keep.e)
      } catch {}
    }
  }
}

function paOpen(id) {
  PA.view = 'all'
  PA.q = PA.tag = PA.project = ''
  PA.types = []
  PA.sel = id
  PA.adding = null
  const root = document.querySelector('#proto-app .pa-root')
  if (root) paRender(root)
  const b = document.getElementById('proto-app')
  if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function paInit(root) {
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

  root.addEventListener('click', ev => {
    const t = ev.target
    // 导出对话框里的按钮没有 data-act：先于其他分发，按文字处理
    const dlgBtn = t.closest('[data-dlg] button')
    if (dlgBtn) {
      if (/^导出 ZIP/.test(dlgBtn.textContent.trim())) startExport()
      else PA.dlg = null
      return render()
    }
    const nav = t.closest('[data-nav]')
    if (nav) {
      PA.view = nav.dataset.nav
      PA.sel = null
      PA.adding = null
      PA.creating = null
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
    const a = t.closest('[data-act]')
    if (a) {
      const act = a.dataset.act
      const e = PA.sel ? paEntry(PA.sel) : null
      const prop = a.dataset.prop
      const v = a.dataset.v
      if (act === 'fold') PA.rail = !PA.rail
      else if (act === 'close') (PA.sel = null), (PA.adding = null)
      else if (act === 'del' && e) {
        STORE.entries.splice(STORE.entries.indexOf(e), 1)
        PA.sel = null
        STORE.emit()
        return
      } else if (act === 'clear-q') PA.q = ''
      else if (act === 'clear-tag') PA.tag = ''
      else if (act === 'clear-project') PA.project = ''
      else if (act === 'clear-all') PA.q = PA.tag = PA.project = '', (PA.types = [])
      else if (act === 'toggle' && e) setProp(e, prop, e.props[prop] !== true)
      else if (act === 'list-del' && e) {
        if (prop === 'tags') e.tags = e.tags.filter(x => x !== v)
        else setProp(e, prop, (e.props[prop] || []).filter(x => x !== v))
      } else if (act === 'prop-del' && e) {
        delete e.props[prop]
        e._show = (e._show || []).filter(x => x !== prop)
      } else if (act === 'color' && e) e.color = v
      else if (act === 'add') (PA.adding = { q: '', mode: 'search', type: 'text', error: '' }), (PA.focus = 'combo')
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
      else if (act === 'export') PA.dlg = 'ready'
      else if (act === 'dlg-bg') {
        if (ev.target === a) PA.dlg = null
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
    const e = PA.sel ? paEntry(PA.sel) : null
    if (bind === 'q') PA.q = t.value
    else if (bind === 'note' && e) e.note = t.value
    else if (bind === 'combo' && PA.adding) {
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
    const e = PA.sel ? paEntry(PA.sel) : null
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
  // Esc 依次关闭对话框、补全、抽屉。焦点在页面空白处（body）时也要生效，所以挂在 document 上
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || !root.isConnected) return
    const a = document.activeElement
    if (a && a !== document.body && !root.contains(a)) return
    if (PA.dlg) PA.dlg = null
    else if (PA.adding) PA.adding = null
    else if (PA.sel) PA.sel = null
    else return
    render()
  })
  document.addEventListener('keydown', ev => {
    if (ev.key === '/' && root.isConnected && !/input|textarea/i.test((document.activeElement || {}).tagName || '')) {
      const el = root.querySelector('[data-fid="search"]')
      if (el) {
        ev.preventDefault()
        el.focus()
      }
    }
  })
  render()
}

function extProtoGroup() {
  const cap = board({
    title: '原型 · 选中文字，剪藏 / 高亮 / 截图',
    ref: 'extension §2.1 · §3',
    live: true,
    w: 1040,
    id: 'proto-capture',
    body: browser(`${article({ sel: 'none' })}<div class="pc-menu"></div><div class="pc-side-host"></div><div class="pc-layer"></div>`, { h: 700 }),
    notes: [
      '<b>试试看</b>：在文章里选中一段文字 → 选区菜单出现 → 点“剪藏”：一次点击就保存，约 3 秒内可以<b>撤销</b>或<b>编辑</b>（改标题、加标签、写备注）。',
      '点“高亮”：选区变成页面上的标记，气泡里可以<b>换颜色</b>、写备注或删除；点“截图”会直接保存一条截图条目（选区内编辑见上方“截图”画板）。',
      '<b>新剪藏自动带着 <code>project: 支付重试</code></b>：那是属性页里给“剪藏”勾选的类型预设；保存的条目会出现在下面的资料库原型里。',
    ],
  })
  const app = board({
    title: '原型 · 资料库（左导航 + 右内容）',
    ref: 'extension §2.2 · §4 · entry §5.3',
    live: true,
    w: 1280,
    id: 'proto-app',
    body: browser('<div class="pa-root" style="height:100%"></div>', { h: 820, title: '全部 · AnnHub', url: 'chrome-extension://annhub/app.html#/all' }),
    notes: [
      '<b>试试看</b>：点左侧导航切换六个视图；点导航顶部的折叠按钮切成图标栏；在搜索框里输入；点一个标签或 <code>project</code> 小标签按它筛选；点一条条目在右侧打开抽屉。',
      '<b>属性是真的</b>：在抽屉里改标题与备注、加标签（回车）、勾选 reviewed；点“添加属性”——输入 <code>pro</code> 会补全已有的 project，输入 <code>owner</code> 会让你选类型再创建；输入 <code>source</code> 或 <code>Project</code> 会被就地拒绝。',
      '<b>属性页</b>：使用数随条目实时变化；使用中的属性删除按钮是灰的，使用数为 0 的才能删；勾选“剪藏”预设后，新剪藏会自动带上该属性的默认值。导航底部的“导出内容”会打开导出对话框。',
    ],
  })
  return group(
    { id: 'ext-proto', title: '可交互原型', small: '', desc: '把上面静态画板里的规则接成能点的流程：页面里一步保存，资料库里整理属性。两个原型共用一份数据，剪藏出来的条目会出现在资料库里。' },
    row(cap),
    row(app),
  )
}

function initProtoApp() {
  const root = document.querySelector('#proto-app .pa-root')
  if (root) paInit(root)
}
