// 可交互原型 1：选中文字 → 选区菜单 → 剪藏 / 高亮 / 截图。保存的条目写入共享的 STORE，资料库原型里能看到。
// 规则是真的：剪藏一次点击，约 3 秒内可撤销、可编辑；高亮可换颜色、写备注、删除；没有任何表单。
const PC = { toast: null, edit: null, bubble: null, pos: null, log: { clip: 0, highlight: 0, screenshot: 0 }, mine: [], seq: 0, marks: {} }

// 类型预设（entry.md §5.4）：自定义属性勾选了该类型且有默认值，就自动附加
const pcPresets = type => {
  const props = {}
  STORE.registry.forEach(r => {
    if (!r.builtin && r.presets.includes(type) && r.def) props[r.name] = r.type === 'number' ? Number(r.def) : r.def
  })
  return props
}

const pcNewEntry = (type, text, extra = {}) => {
  const e = {
    id: `p${++PC.seq}`,
    type,
    title: 'Backpressure in Streams',
    content: type === 'screenshot' ? '' : text,
    host: 'engineering.example.com',
    path: '/posts/backpressure-in-streams',
    when: '刚刚',
    tags: [],
    note: '',
    props: pcPresets(type),
    ...extra,
  }
  if (type === 'highlight') e.color = e.color || 'yellow'
  if (type === 'screenshot') {
    e.img = 'chart'
    e.title = '区域截图 · Backpressure in Streams'
  }
  STORE.entries.unshift(e)
  PC.mine.unshift(e.id)
  PC.log[type]++
  STORE.emit()
  return e
}

const pcUnwrap = id => {
  const m = PC.marks[id]
  if (m && m.parentNode) {
    const p = m.parentNode
    while (m.firstChild) p.insertBefore(m.firstChild, m)
    p.removeChild(m)
    p.normalize()
  }
  delete PC.marks[id]
}

const pcRemove = id => {
  const i = STORE.entries.findIndex(e => e.id === id)
  if (i < 0) return
  const e = STORE.entries[i]
  STORE.entries.splice(i, 1)
  PC.log[e.type] = Math.max(0, PC.log[e.type] - 1)
  PC.mine = PC.mine.filter(x => x !== id)
  pcUnwrap(id)
  STORE.emit()
}

function pcSide() {
  const mine = PC.mine.map(id => STORE.entries.find(e => e.id === id)).filter(Boolean)
  return `<div class="pc-side"><div class="b t-md" style="margin-bottom:8px">原型日志</div>
    <div class="hs g6 wrap" style="margin-bottom:10px">${TYPE_ORDER.map(t => chip(`${TYPES[t].zh} ${PC.log[t]}`, { icon: TYPES[t].icon })).join('')}</div>
    ${
      mine.length
        ? mine
            .slice(0, 4)
            .map(
              e => `<div style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;margin-bottom:7px;display:flex;flex-direction:column;gap:3px"><div class="hs g6">${tchip(e.type, { sm: true })}<span class="t-xs muted">${e.when}</span></div><div class="b t-sm clamp-2">${esc(e.type === 'screenshot' ? e.title : e.content)}</div>${Object.keys(e.props).length ? `<div class="hs g4 wrap">${propPills(e)}</div>` : ''}</div>`,
            )
            .join('')
        : `<div class="help">选中左侧文章里的一段文字，选区上方会出现菜单。保存的内容会出现在下面的“资料库”原型里。</div>`
    }
    <div class="help" style="margin-top:8px">${keys('Esc')} 关闭气泡</div></div>`
}

function pcEditHtml() {
  const e = STORE.entries.find(x => x.id === PC.edit.id)
  if (!e) return ''
  return `<div class="pop pc-pop" style="width:322px;z-index:30">
    <div class="qe">
      <div class="hd">${I('bookmark')}已剪藏<span class="grow"></span><span class="t-xs muted" style="font-weight:400">失焦即保存</span></div>
      <div class="field" style="gap:4px"><div class="label t-sm">标题</div><input class="input pa-fld" data-bind="title" data-fid="e-title" value="${esc(e.title)}" style="min-height:30px;font-size:12.5px" /></div>
      <div class="field" style="gap:4px"><div class="label t-sm">标签（回车添加）</div><div class="tagin is-focus">${e.tags.map(t => `<span class="vtag">${esc(t)}<span class="pa-click" data-act="tag-del" data-v="${esc(t)}">${I('x')}</span></span>`).join('')}<input class="pa-bare" data-bind="tag" data-fid="e-tag" placeholder="添加标签…" /></div></div>
      <div class="field" style="gap:4px"><div class="label t-sm">备注</div><textarea class="textarea pa-fld" data-bind="note" data-fid="e-note" style="min-height:50px;font-size:12.5px">${esc(e.note || '')}</textarea></div>
      <div class="hs between"><span class="link t-sm hs g4 pa-click" data-act="more">更多属性${I('arrow-up-right', 'i-sm')}</span>${btn('完成', { sm: true, v: 'primary', attrs: 'data-act="done"' })}</div>
    </div></div>`
}

function pcBubbleHtml() {
  const e = STORE.entries.find(x => x.id === PC.bubble.id)
  if (!e) return ''
  return `<div class="pop pc-pop" style="width:320px;z-index:30">
    <div class="hs between"><span class="hs g6 b">${I('highlighter')}高亮</span><span class="hs g8">${HL_COLORS.map(c => `<span class="pa-click" data-act="color" data-v="${c}" title="${c}">${hlDot(c, e.color === c)}</span>`).join('')}</span></div>
    <textarea class="textarea pa-fld" data-bind="note" data-fid="b-note" placeholder="写一句备注（可选）" style="margin-top:10px;min-height:56px;font-size:12.5px">${esc(e.note || '')}</textarea>
    <div class="hs g8" style="margin-top:10px"><span class="t-xs muted">失焦即保存 · 只在页面留痕</span><span class="grow"></span>${btn('删除', { sm: true, v: 'ghost', icon: 'trash', attrs: 'data-act="hl-del"' })}</div></div>`
}

function pcRender(root) {
  const view = root.querySelector('.bf-view')
  const layer = view.querySelector('.pc-layer')
  const keep = document.activeElement && layer.contains(document.activeElement) && document.activeElement.dataset ? { fid: document.activeElement.dataset.fid, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
  const toastHtml = PC.toast
    ? `<div class="toast-pos" style="z-index:40">${
        PC.toast.kind === 'clip'
          ? `<div class="toast ct" data-tid="${PC.toast.tid}">${I('bookmark')}<span>已剪藏</span><i class="sepd"></i><span class="act pa-click" data-act="undo">撤销</span><span class="act pa-click" data-act="edit">编辑</span><div class="tbar"><i style="--p:${PC.toast.p}%"></i></div></div>`
          : `<div class="toast">${I(PC.toast.icon)}<span>${PC.toast.text}</span></div>`
      }</div>`
    : ''
  layer.innerHTML = toastHtml + (PC.edit ? pcEditHtml() : '') + (PC.bubble ? pcBubbleHtml() : '')
  const pop = layer.querySelector('.pc-pop')
  if (pop && PC.pos) {
    // 气泡不能超出网页区：按它渲染后的真实高度夹住
    pop.style.left = PC.pos.left
    pop.style.top = `${Math.max(8, Math.min(parseFloat(PC.pos.top), view.clientHeight - pop.offsetHeight - 10))}px`
  }
  view.querySelector('.pc-side-host').innerHTML = pcSide()
  if (keep && keep.fid) {
    const el = layer.querySelector(`[data-fid="${keep.fid}"]`)
    if (el) {
      el.focus()
      try {
        el.setSelectionRange(keep.s, keep.e)
      } catch {}
    }
  }
}

function pcInit(root) {
  const view = root.querySelector('.bf-view')
  const board = root.closest('.cv-board')
  const scale = () => (board && board.__scale) || 1
  const menuHost = view.querySelector('.pc-menu')
  const layer = view.querySelector('.pc-layer')
  let range = null
  let sel = ''
  let timer = null
  let tid = 0

  const hideMenu = () => (menuHost.innerHTML = '')
  const setText = (icon, text, ms = 2200) => {
    clearTimeout(timer)
    PC.toast = { kind: 'text', icon, text }
    pcRender(root)
    timer = setTimeout(() => {
      PC.toast = null
      pcRender(root)
    }, ms)
  }

  // 剪藏提示：约 3 秒，细条匀速走完，之后消失；撤销 / 编辑都在这 3 秒内
  const showClipToast = id => {
    const my = ++tid
    PC.toast = { kind: 'clip', id, p: 100, tid: my }
    pcRender(root)
    requestAnimationFrame(() => {
      const bar = layer.querySelector('.toast.ct .tbar i')
      if (bar) {
        bar.style.transition = 'width 3s linear'
        bar.style.setProperty('--p', '0%')
      }
    })
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (PC.toast && PC.toast.tid === my) {
        PC.toast = null
        pcRender(root)
      }
    }, 3000)
  }

  // 气泡的位置：选区下方，水平居中并夹在视口内
  const placeBelow = (rect, w) => {
    const vr = view.getBoundingClientRect()
    const cx = (rect.left + rect.width / 2 - vr.left) / scale()
    return { left: `${Math.max(8, Math.min(cx - w / 2, view.clientWidth - w - 8))}px`, top: `${Math.min((rect.bottom - vr.top) / scale() + 10, view.clientHeight - 250)}px` }
  }

  view.querySelector('.pg').addEventListener('mouseup', () => {
    if (PC.edit || PC.bubble) return
    setTimeout(() => {
      const s = window.getSelection()
      const text = s ? s.toString().trim() : ''
      if (!text || !s.rangeCount || !view.querySelector('.pg-art').contains(s.anchorNode)) return hideMenu()
      range = s.getRangeAt(0).cloneRange()
      sel = text
      const r = range.getClientRects()[0]
      const vr = view.getBoundingClientRect()
      menuHost.innerHTML = hoverMenu({ style: '' })
      const el = menuHost.firstElementChild
      el.style.left = `${Math.max(8, Math.min((r.left + r.width / 2 - vr.left) / scale() - el.offsetWidth / 2, view.clientWidth - el.offsetWidth - 8))}px`
      el.style.top = `${Math.max(8, (r.top - vr.top) / scale() - el.offsetHeight - 10)}px`
      el.style.setProperty('--caret', '50%')
      el.querySelectorAll('.hm-b').forEach((b, i) => (b.dataset.menu = ['clip', 'highlight', 'screenshot'][i]))
    }, 0)
  })
  document.addEventListener('mousedown', e => {
    if (!menuHost.contains(e.target) && !layer.contains(e.target)) setTimeout(() => !window.getSelection().toString() && hideMenu(), 0)
  })
  menuHost.addEventListener('mousedown', e => e.preventDefault())

  menuHost.addEventListener('click', ev => {
    const b = ev.target.closest('[data-menu]')
    if (!b) return
    const kind = b.dataset.menu
    const rect = range ? range.getClientRects()[0] : null
    hideMenu()
    if (kind === 'clip') {
      const e = pcNewEntry('clip', sel)
      window.getSelection().removeAllRanges()
      PC.pos = rect ? placeBelow(rect, 322) : { left: '120px', top: '150px' }
      showClipToast(e.id)
    } else if (kind === 'highlight') {
      const e = pcNewEntry('highlight', sel, { color: 'yellow' })
      let m = null
      try {
        m = document.createElement('mark')
        m.className = 'hl c-yellow'
        range.surroundContents(m)
        PC.marks[e.id] = m
      } catch {}
      window.getSelection().removeAllRanges()
      PC.bubble = { id: e.id }
      PC.pos = placeBelow((m && m.getClientRects()[0]) || rect, 320)
      pcRender(root)
    } else {
      pcNewEntry('screenshot', sel)
      window.getSelection().removeAllRanges()
      setText('scan', '已保存为截图条目 · 选区内编辑见上方“截图”画板', 2600)
    }
  })

  const closePops = () => {
    PC.edit = null
    PC.bubble = null
    pcRender(root)
  }

  layer.addEventListener('click', ev => {
    const t = ev.target.closest('[data-act]')
    if (!t) return
    const a = t.dataset.act
    if (a === 'undo' && PC.toast) {
      pcRemove(PC.toast.id)
      setText('undo-2', '已撤销，这条剪藏已删除', 1800)
    } else if (a === 'edit' && PC.toast) {
      PC.edit = { id: PC.toast.id }
      PC.toast = null
      clearTimeout(timer)
      pcRender(root)
    } else if (a === 'done') closePops()
    else if (a === 'more') {
      const id = PC.edit && PC.edit.id
      closePops()
      if (id && typeof paOpen === 'function') paOpen(id)
    } else if (a === 'tag-del') {
      const e = STORE.entries.find(x => x.id === PC.edit.id)
      e.tags = e.tags.filter(x => x !== t.dataset.v)
      STORE.emit()
      pcRender(root)
    } else if (a === 'color') {
      const e = STORE.entries.find(x => x.id === PC.bubble.id)
      e.color = t.dataset.v
      if (PC.marks[e.id]) PC.marks[e.id].className = `hl c-${e.color}`
      STORE.emit()
      pcRender(root)
    } else if (a === 'hl-del') {
      const id = PC.bubble.id
      closePops()
      pcRemove(id)
    }
  })

  layer.addEventListener('input', ev => {
    const bind = ev.target.dataset && ev.target.dataset.bind
    const cur = PC.edit || PC.bubble
    if (!bind || !cur) return
    const e = STORE.entries.find(x => x.id === cur.id)
    if (!e) return
    if (bind === 'title') e.title = ev.target.value
    else if (bind === 'note') e.note = ev.target.value
    view.querySelector('.pc-side-host').innerHTML = pcSide()
    STORE.emit()
  })
  layer.addEventListener('keydown', ev => {
    if (ev.target.dataset && ev.target.dataset.bind === 'tag' && ev.key === 'Enter') {
      ev.preventDefault()
      const v = ev.target.value.trim().toLowerCase().slice(0, 32)
      const e = STORE.entries.find(x => x.id === PC.edit.id)
      if (v && !e.tags.some(t => t.toLowerCase() === v) && e.tags.length < 20) e.tags.push(v)
      STORE.emit()
      pcRender(root)
      const inp = layer.querySelector('[data-bind="tag"]')
      if (inp) inp.focus()
    }
  })
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && (PC.edit || PC.bubble) && view.isConnected) closePops()
  })

  // 资料库里删掉条目时，页面上对应的标记同步恢复
  STORE.listeners.add(() => {
    Object.keys(PC.marks).forEach(id => !STORE.entries.some(e => e.id === id) && pcUnwrap(id))
    PC.mine = PC.mine.filter(id => STORE.entries.some(e => e.id === id))
    if (view.isConnected) {
      view.querySelector('.pc-side-host').innerHTML = pcSide()
      const cur = PC.edit || PC.bubble
      if (cur && !STORE.entries.some(e => e.id === cur.id)) closePops()
    }
  })
  pcRender(root)
}

// 在页面渲染后初始化原型
function initProtoCapture() {
  const root = document.querySelector('#proto-capture .cv-canvas')
  if (root) pcInit(root)
}
