// 可交互原型 1：页面里的两种剪藏与截图。保存的条目写入共享的 STORE，资料库原型里能看到。
// 规则是真的：剪藏一次点击，约 3 秒内可撤销、可编辑；选区菜单只有“剪藏”和“截图”，页面上不留任何标记。
// 区块剪藏（提案，D-20）：指针停在推文、一节文章这样的整体内容上约 400ms，区块旁出现“剪藏”；↑ 选上一级。
const PC = { toast: null, edit: null, pos: null, log: { clip: 0, block: 0, screenshot: 0 }, mine: [], seq: 0, blk: null }

// 类型预设（entry.md §5.4）：自定义属性勾选了该类型且有默认值，就自动附加
const pcPresets = type => {
  const props = {}
  STORE.registry.forEach(r => {
    if (!r.builtin && r.presets.includes(type) && r.def) props[r.name] = r.type === 'number' ? Number(r.def) : r.def
  })
  return props
}

const pcNewEntry = (type, md, extra = {}) => {
  const e = {
    id: `p${++PC.seq}`,
    type,
    title: 'Backpressure in Streams',
    content: type === 'screenshot' ? '' : md,
    host: 'engineering.example.com',
    path: '/posts/backpressure-in-streams',
    when: '刚刚',
    tags: [],
    note: '',
    props: pcPresets(type),
    hls: [],
    ...extra,
  }
  if (type === 'screenshot') {
    e.img = 'chart'
    e.title = '区域截图 · Backpressure in Streams'
  }
  STORE.entries.unshift(e)
  PC.mine.unshift(e.id)
  STORE.emit()
  return e
}

const pcRemove = id => {
  const i = STORE.entries.findIndex(e => e.id === id)
  if (i < 0) return
  const e = STORE.entries[i]
  STORE.entries.splice(i, 1)
  const k = e._via === 'block' ? 'block' : e.type
  PC.log[k] = Math.max(0, PC.log[k] - 1)
  PC.mine = PC.mine.filter(x => x !== id)
  STORE.emit()
}

function pcSide() {
  const mine = PC.mine.map(id => STORE.entries.find(e => e.id === id)).filter(Boolean)
  return `<div class="pc-side"><div class="b t-md" style="margin-bottom:8px">原型日志</div>
    <div class="hs g6 wrap" style="margin-bottom:10px">${chip(`选区剪藏 ${PC.log.clip}`, { icon: 'bookmark' })}${chip(`区块剪藏 ${PC.log.block}`, { icon: 'mouse-pointer-click' })}${chip(`截图 ${PC.log.screenshot}`, { icon: 'scan' })}</div>
    ${
      mine.length
        ? mine
            .slice(0, 4)
            .map(
              e => `<div style="padding:9px 11px;border:1px solid var(--line);border-radius:10px;margin-bottom:7px;display:flex;flex-direction:column;gap:3px"><div class="hs g6">${tchip(e.type, { sm: true })}<span class="t-xs muted">${e._via === 'block' ? '区块 · ' : ''}${e.when}</span></div><div class="t-sm b clamp-2">${esc(e.type === 'screenshot' ? e.title : mdPlain(e.content))}</div>${Object.entries(e.props).map(([k, v]) => `<span class="ppill">${I('text')}<span>${esc(k)}</span><b>${esc(v)}</b></span>`).join('')}</div>`,
            )
            .join('')
        : `<div class="help">选中左侧文章里的一段文字，选区上方出现菜单；或者把指针停在“Three common strategies”那一节、页面底部的帖子上，等区块旁出现“剪藏”。保存的内容会出现在下面的“资料库”原型里，在那里读和高亮。</div>`
    }
    <div class="help" style="margin-top:8px">页面上不会留下任何标记。${keys('Esc')} 关闭气泡</div></div>`
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

function pcRender(root) {
  const view = root.querySelector('.bf-view')
  const layer = view.querySelector('.pc-layer')
  const keep = document.activeElement && layer.contains(document.activeElement) && document.activeElement.dataset ? { fid: document.activeElement.dataset.fid, s: document.activeElement.selectionStart, e: document.activeElement.selectionEnd } : null
  const toastHtml = PC.toast
    ? `<div class="toast-pos" style="z-index:40">${
        PC.toast.kind === 'clip'
          ? `<div class="toast ct" data-tid="${PC.toast.tid}">${I('bookmark')}<span>已剪藏</span><i class="sepd"></i><span class="act pa-click" data-act="undo" tabindex="0" role="button">撤销</span><span class="act pa-click" data-act="edit" tabindex="0" role="button">编辑</span><div class="tbar"><i style="--p:100%"></i></div></div>`
          : `<div class="toast">${I(PC.toast.icon)}<span>${PC.toast.text}</span></div>`
      }</div>`
    : ''
  layer.innerHTML = toastHtml + (PC.edit ? pcEditHtml() : '')
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

// 页面里的候选区块：每个带 data-blk 的元素对应一段 Markdown（真实实现里由共享的转换模块从 DOM 生成）
const PC_BLOCKS = {
  strategies: { label: '一节 · 带标题', md: '### Three common strategies\n\n1. Demand signaling: the consumer grants credits and the producer sends no more than it was granted.\n2. Bounded buffers: queues with a hard limit that block or reject at the edge.\n3. Load shedding: drop the least valuable work first, on purpose.' },
  article: { label: 'article', md: '## Backpressure in Streams\n\nWhen a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down with it.\n\n**Backpressure** is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, the consumer signals demand upstream.\n\n### Three common strategies\n\n1. Demand signaling: the consumer grants credits and the producer sends no more than it was granted.\n2. Bounded buffers: queues with a hard limit that block or reject at the edge.\n3. Load shedding: drop the least valuable work first, on purpose.' },
  post: { label: '帖子', md: 'Retries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓\n\n[example.com/retry-budgets](https://example.com/retry-budgets)' },
}

function pcInit(root) {
  const view = root.querySelector('.bf-view')
  const board = root.closest('.cv-board')
  const scale = () => (board && board.__scale) || 1
  const menuHost = view.querySelector('.pc-menu')
  const layer = view.querySelector('.pc-layer')
  const blkHost = view.querySelector('.pc-blk')
  let range = null
  let sel = ''
  let selMd = ''
  let timer = null
  let tid = 0
  let dwell = null
  let leave = null
  let pillHover = false

  const hideMenu = () => (menuHost.innerHTML = '')
  const hideBlk = () => {
    clearTimeout(dwell)
    clearTimeout(leave)
    pillHover = false
    PC.blk = null
    blkHost.innerHTML = ''
  }
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
    PC.toast = { kind: 'clip', id, tid: my }
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

  // 气泡的位置：目标下方，水平居中并夹在视口内
  const placeBelow = (rect, w) => {
    const vr = view.getBoundingClientRect()
    const cx = (rect.left + rect.width / 2 - vr.left) / scale()
    return { left: `${Math.max(8, Math.min(cx - w / 2, view.clientWidth - w - 8))}px`, top: `${Math.min((rect.bottom - vr.top) / scale() + 10, view.clientHeight - 250)}px` }
  }

  // ── 选区菜单：只有剪藏与截图 ──────────────────────────────────────────────
  view.querySelector('.pg').addEventListener('mouseup', () => {
    if (PC.edit) return
    setTimeout(() => {
      const s = window.getSelection()
      const text = s ? s.toString().trim() : ''
      if (!text || !s.rangeCount || !view.querySelector('.pg-art').contains(s.anchorNode)) return hideMenu()
      hideBlk()
      range = s.getRangeAt(0).cloneRange()
      sel = text
      selMd = text
      const r = range.getClientRects()[0]
      const vr = view.getBoundingClientRect()
      menuHost.innerHTML = hoverMenu({ style: '' })
      const el = menuHost.firstElementChild
      el.style.left = `${Math.max(8, Math.min((r.left + r.width / 2 - vr.left) / scale() - el.offsetWidth / 2, view.clientWidth - el.offsetWidth - 8))}px`
      el.style.top = `${Math.max(8, (r.top - vr.top) / scale() - el.offsetHeight - 10)}px`
      el.style.setProperty('--caret', '50%')
      el.querySelectorAll('.hm-b').forEach((b, i) => (b.dataset.menu = ['clip', 'screenshot'][i]))
    }, 0)
  })
  document.addEventListener('mousedown', e => {
    if (!menuHost.contains(e.target) && !layer.contains(e.target)) setTimeout(() => !window.getSelection().toString() && hideMenu(), 0)
  })
  menuHost.addEventListener('mousedown', e => e.preventDefault())

  const saveClip = (md, via, rect) => {
    const e = pcNewEntry('clip', md, { _via: via })
    PC.log[via === 'block' ? 'block' : 'clip']++
    PC.pos = rect ? placeBelow(rect, 322) : { left: '120px', top: '150px' }
    showClipToast(e.id)
    return e
  }

  menuHost.addEventListener('click', ev => {
    const b = ev.target.closest('[data-menu]')
    if (!b) return
    const kind = b.dataset.menu
    const rect = range ? range.getClientRects()[0] : null
    hideMenu()
    if (kind === 'clip') {
      saveClip(selMd, 'menu', rect)
      window.getSelection().removeAllRanges()
    } else {
      const e = pcNewEntry('screenshot', sel)
      PC.log.screenshot++
      window.getSelection().removeAllRanges()
      setText('scan', '已保存为截图条目 · 选区内编辑见上方“截图”画板', 2600)
      void e
    }
  })

  // ── 区块剪藏（提案）：悬停约 400ms 出现入口，⌃ 选上一级 ──────────────────────
  // 状态：PC.blk = { el, key, pinned }。选了上一级之后就“钉住”，指针还在这个块里时不再回到最内层；离开这个块才恢复
  const blkRect = el => {
    const vr = view.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { left: (r.left - vr.left) / scale(), top: (r.top - vr.top) / scale(), width: r.width / scale(), height: r.height / scale() }
  }
  const drawBlk = (el, pinned = false) => {
    const key = el.dataset.blk
    PC.blk = { el, key, pinned }
    pillHover = false
    const r = blkRect(el)
    const up = el.parentElement && el.parentElement.closest('[data-blk]')
    blkHost.innerHTML = `<i class="blk ${key === 'article' ? 'is-faint' : ''}" style="inset:auto;left:${r.left - 8}px;top:${r.top - 6}px;width:${r.width + 16}px;height:${r.height + 12}px"><em>${PC_BLOCKS[key].label}</em></i>
      <div class="blk-pill pc-pill" style="left:${Math.max(8, r.left + r.width - 150)}px;top:${Math.max(4, r.top - 20)}px;right:auto" role="group" aria-label="剪藏">
        <span class="bp-seg pa-click" data-blk-act="clip" tabindex="0" role="button">${I('bookmark')}<span>剪藏</span></span>${up ? `<i class="sub pa-click" data-blk-act="up" tabindex="0" role="button" aria-label="选上一级">${I('chevron-up', 'i-sm')}</i>` : ''}<i class="sub pa-click" data-blk-act="off" tabindex="0" role="button" aria-label="更多">${I('ellipsis', 'i-sm')}</i></div>`
  }
  const pick = target => (target.closest ? target.closest('[data-blk]') : null)
  const scheduleHide = () => {
    clearTimeout(leave)
    leave = setTimeout(() => !pillHover && hideBlk(), 150)
  }

  view.querySelector('.pg-art').addEventListener('mousemove', ev => {
    // 资料库“设置”里关掉区块入口后，这里不再出现
    if (typeof PA !== 'undefined' && PA.blockOn === false) return hideBlk()
    if (PC.edit || window.getSelection().toString().trim()) return
    clearTimeout(leave)
    if (PC.blk && PC.blk.pinned) {
      if (PC.blk.el.contains(ev.target)) return
      PC.blk.pinned = false
    }
    const el = pick(ev.target)
    if (!el) {
      clearTimeout(dwell)
      return scheduleHide()
    }
    if (PC.blk && PC.blk.el === el) return clearTimeout(dwell)
    clearTimeout(dwell)
    dwell = setTimeout(() => drawBlk(el), PC.blk ? 120 : 400)
  })
  view.querySelector('.pg-art').addEventListener('mouseleave', () => {
    clearTimeout(dwell)
    scheduleHide()
  })
  blkHost.addEventListener('mouseover', ev => {
    if (!ev.target.closest('.blk-pill')) return
    pillHover = true
    clearTimeout(leave)
  })
  blkHost.addEventListener('mouseout', ev => {
    if (!ev.target.closest('.blk-pill') || (ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.blk-pill'))) return
    pillHover = false
    scheduleHide()
  })
  blkHost.addEventListener('click', ev => {
    const a = ev.target.closest('[data-blk-act]')
    if (!a || !PC.blk) return
    const act = a.dataset.blkAct
    if (act === 'up') {
      const up = PC.blk.el.parentElement.closest('[data-blk]')
      if (up) drawBlk(up, true)
    } else if (act === 'clip') {
      const el = PC.blk.el
      const r = el.getBoundingClientRect()
      const md = PC_BLOCKS[PC.blk.key].md
      const flash = blkHost.querySelector('.blk')
      if (flash) flash.classList.add('is-saved')
      a.parentElement.classList.add('is-press')
      a.querySelector('span').textContent = '已剪藏'
      saveClip(md, 'block', r)
      setTimeout(hideBlk, 650)
    } else {
      hideBlk()
      setText('ban', '原型里不会真的停用；真实实现里会在这个网站停用区块入口（D-20）', 2600)
    }
  })

  const closePops = () => {
    PC.edit = null
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
    }
  })

  layer.addEventListener('input', ev => {
    const bind = ev.target.dataset && ev.target.dataset.bind
    if (!bind || !PC.edit) return
    const e = STORE.entries.find(x => x.id === PC.edit.id)
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
    if (ev.key !== 'Escape' || !view.isConnected) return
    if (PC.edit) closePops()
    else if (PC.blk) hideBlk()
  })

  // 资料库里删掉条目时，侧栏日志同步
  STORE.listeners.add(() => {
    PC.mine = PC.mine.filter(id => STORE.entries.some(e => e.id === id))
    if (view.isConnected) {
      view.querySelector('.pc-side-host').innerHTML = pcSide()
      if (PC.edit && !STORE.entries.some(e => e.id === PC.edit.id)) closePops()
    }
  })
  pcRender(root)
}

// 在页面渲染后初始化原型
function initProtoCapture() {
  const root = document.querySelector('#proto-capture .cv-canvas')
  if (root) pcInit(root)
}
