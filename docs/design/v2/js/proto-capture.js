// 可交互原型：选中文字 → 选区菜单 → 采集窗口（标准 / 深度）→ 保存 / 安全出口。
// 只演示 concept / excerpt 这类没有额外必填项的流程；其他 kind 的额外字段见“按 kind 的表单”。
const PC = { open: false, step: 'verify', deep: false, kind: 'concept', inferred: true, sel: '', guess: '', apply: '', confirmed: false, source: 'source-material', hl: true, closing: false, success: false, err: '', log: { hl: 0, clip: 0, frag: 0, exit: 0 }, items: [], toast: '' }

const pcInfer = t => {
  if (/\?|？/.test(t)) return 'question'
  if (/(\b1\.|\bthen\b|→|->|步骤|first,)/i.test(t)) return 'procedure'
  if (/(decided|instead of|chose|trade-?off)/i.test(t)) return 'decision'
  if (t.split(/\s+/).length <= 4) return 'concept'
  if (/(should|must|is how|failures are)/i.test(t)) return 'claim'
  return t.length > 140 ? 'excerpt' : 'concept'
}

const pcApplyState = () => {
  const a = PC.apply.trim()
  if (!a) return 'empty'
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim()
  if (norm(a) === norm(PC.sel) || (a.length > 24 && norm(PC.sel).includes(norm(a).slice(0, Math.max(20, norm(a).length - 4))))) return 'copy'
  if (a.length < 10 || /^(以后|参考|了解|学习|可能|有用|later|maybe|useful)/i.test(a)) return 'vague'
  return 'good'
}

const pcDirty = () => !!(PC.guess.trim() || PC.apply.trim() || PC.confirmed)

function pcBody() {
  const kind = PC.kind
  if (PC.step === 'guess')
    return `<div class="cm-body"><div class="prompt">${KINDS[kind].guess}</div>
      <textarea class="textarea is-focus" data-bind="guess" style="height:112px" placeholder="先写下你现在的理解，再去对照来源">${esc(PC.guess)}</textarea>
      <div class="sub">${I('pencil-line', 'i-sm')} 这一步由你自己写；可以留空直接进入核验。</div></div>`
  if (PC.step === 'verify')
    return `<div class="cm-body"><div class="hs between"><div class="prompt">${KINDS[kind].verify}</div><span class="link hs g4 t-sm">回看来源${I('arrow-up-right', 'i-sm')}</span></div>
      ${srcCard({ guess: PC.deep && PC.guess.trim() ? esc(PC.guess) : '', text: `…<b>Backpressure</b> is how a system pushes that pain back where it belongs. <mark>${esc(PC.sel)}</mark>…` })}
      <div class="hs g8">${optAdd('摘要（可选）')}${optAdd('备注（可选）')}</div>
      <div style="margin-top:auto">${PC.err ? banner('warn', PC.err, { cls: 'shake' }) + '<div style="height:8px"></div>' : ''}
        <div class="cm-confirm ${PC.confirmed ? 'on' : ''}"><div class="hs g10 top" data-act="confirm" style="cursor:pointer"><i class="cb ${PC.confirmed ? 'on' : ''}" style="margin-top:2px">${PC.confirmed ? I('check') : ''}</i>
          <div class="grow"><div class="t">确认已核对</div><div class="d">${PC.confirmed ? `已确认 · 来源：${SRC_LABEL[PC.source]} · 刚刚` : '我已回看来源，并确认当前内容。这不代表内容被证实。'}</div></div></div>
          <div class="cm-srcrow"><span class="muted">核验来源</span>
            <span data-act="src" data-v="source-material" style="cursor:pointer">${rdo(PC.source === 'source-material', '原文')}</span>
            <span data-act="src" data-v="manual" style="cursor:pointer">${rdo(PC.source === 'manual', '手工')}</span>
            <span title="未启用：在设置里开启后可选" style="opacity:.6">${rdo(false, '模型建议 · 未启用')}</span></div></div></div></div>`
  const st = pcApplyState()
  const help = { empty: ['写下它会用在哪个任务、文档或判断上。', ''], copy: ['不能只复制原文——写下你准备怎么用它。', 'err'], vague: ['再具体一点：用在哪个任务？打算检查、转成、追问还是验证什么？', 'err'], good: ['', ''] }[st]
  return `<div class="cm-body"><div class="prompt">${KINDS[kind].use}</div>
    <textarea class="textarea is-focus ${PC.err && st !== 'good' ? 'is-error' : ''}" data-bind="apply" style="height:78px" placeholder="写下对象和动作：哪个任务、文档或判断，准备怎么用">${esc(PC.apply)}</textarea>
    ${st === 'good' ? `<div class="help c-ok">${I('circle-check', 'i-sm')} 有对象，也有动作。</div>` : `<div class="help ${PC.err ? 'is-error' : ''}">${PC.err ? I('circle-alert', 'i-sm') + ' ' : ''}${PC.err ? help[0] : st === 'empty' ? help[0] : help[0]}</div>`}
    ${exampleBlock(kind)}</div>`
}

function pcModal() {
  const kind = PC.kind
  const sel = esc(PC.sel.length > 96 ? PC.sel.slice(0, 96) + '…' : PC.sel)
  const stepName = { guess: 'guess', verify: 'verify', apply: 'apply' }[PC.step]
  const first = PC.deep ? PC.step === 'guess' : PC.step === 'verify'
  const last = PC.step === 'apply'
  const kinds = KIND_ORDER.map(k => `<span class="cm-kind ${k === kind ? `on k-${k}` : ''}" data-act="kind" data-v="${k}" style="cursor:pointer">${k === kind ? I(KINDS[k].icon) : ''}${KINDS[k].zh}</span>`).join('')
  const over = PC.closing
    ? `<div style="position:absolute;inset:0;background:rgb(15 23 42 / 0.35);border-radius:16px;display:grid;place-items:center;z-index:5"><div class="dialog" style="width:400px;padding:18px 20px">
        <div class="t-lg b">放弃已填写的内容？</div><div class="help" style="margin:6px 0 14px;font-size:12.5px">也可以改存为高亮或剪藏，已填写的文字会作为备注保留，不会自动升级为碎片。</div>
        <div class="hs g6 wrap">${btn('继续编辑', { v: 'primary', sm: true, attrs: 'data-act="keep"' })}${btn('改存为高亮', { sm: true, attrs: 'data-act="as-hl"' })}${btn('改存为剪藏', { sm: true, attrs: 'data-act="as-clip"' })}<span class="grow"></span>${btn('放弃', { v: 'danger', sm: true, attrs: 'data-act="discard"' })}</div></div></div>`
    : ''
  if (PC.success)
    return `<div class="cm" style="height:300px;display:grid;place-items:center"><div class="vs g8 center" style="align-items:center;text-align:center"><div class="iconchip" style="width:46px;height:46px;border-radius:50%;background:color-mix(in oklab,var(--ok) 14%,var(--surface));color:var(--ok)">${I('circle-check', 'i-lg')}</div><div class="t-lg b">已保存为「${KINDS[kind].zh}」</div><div class="progress" style="width:120px"><i style="width:100%;transition:width .7s linear"></i></div></div></div>`
  return `<div class="cm" style="position:relative">
    ${cmHeader({ title: 'Backpressure in Streams' }).replace('<span class="btn btn-ghost btn-icon btn-sm" aria-label="关闭">', '<span class="btn btn-ghost btn-icon btn-sm" aria-label="关闭" data-act="close" style="cursor:pointer">')}
    <div class="cm-ctx"><div class="lb">选区</div><div class="cm-sel">「${sel}」</div>
      <div class="lb">上下文</div><div class="cm-ctxrow">${I('chevron-right', 'i-sm')}<span class="truncate">前后各一句，可编辑</span></div>
      <div class="lb" style="padding-top:5px">类型</div><div><div class="cm-kinds">${kinds}${PC.inferred ? `<span class="chip chip-suggest" style="margin-left:6px;height:20px;font-size:11px">${I('sparkles')}自动推断</span>` : ''}</div></div></div>
    <div class="cm-steps">${[['guess', '理解'], ['verify', '核验'], ['apply', '应用']].map(([s, n], i, arr) => {
      if (s === 'guess' && !PC.deep) return `<span class="cm-step off"><span class="n">1</span>理解<span class="muted t-xs">深度模式</span></span>`
      const order = ['guess', 'verify', 'apply']
      const state = s === PC.step ? 'on' : order.indexOf(PC.step) > order.indexOf(s) ? 'done' : ''
      return `<span class="cm-step ${state}"><span class="n">${state === 'done' ? I('check') : i + 1}</span>${n}</span>`
    }).join(I('chevron-right', 'cm-chev'))}<span class="grow"></span>
      <span class="seg"><span class="${PC.deep ? '' : 'on'}" data-act="mode" data-v="std" style="cursor:pointer">标准</span><span class="${PC.deep ? 'on' : ''}" data-act="mode" data-v="deep" style="cursor:pointer">深度</span></span></div>
    ${pcBody()}
    <div class="cm-f"><span data-act="hl" style="cursor:pointer">${cbx(PC.hl, '同时高亮原文')}</span><span class="grow"></span>${btn('取消', { v: 'ghost', attrs: 'data-act="close"' })}${first ? '' : btn('上一步', { v: 'ghost', attrs: 'data-act="back"' })}${btn(last ? '保存' : '下一步', { v: 'primary', kbd: '⌘↵', attrs: 'data-act="next"' })}</div>
    ${over}</div>`
}

function pcSide() {
  return `<div class="pc-side"><div class="b t-md" style="margin-bottom:8px">原型日志</div>
    <div class="hs g6 wrap" style="margin-bottom:10px">${chip(`高亮 ${PC.log.hl}`, { icon: 'highlighter' })}${chip(`剪藏 ${PC.log.clip}`, { icon: 'bookmark' })}${chip(`碎片 ${PC.log.frag}`, { icon: 'brain', v: PC.log.frag ? 'brand' : '' })}${chip(`安全出口 ${PC.log.exit}`, { icon: 'shield-check' })}</div>
    ${PC.items.length ? PC.items.map(it => `<div class="fcard" style="margin:0 0 8px;padding:10px 12px;grid-template-columns:1fr">${kchip(it.kind, { sm: true })}<div class="b t-sm clamp-2">${esc(it.title)}</div><div class="t-xs muted clamp-2">应用：${esc(it.use)}</div></div>`).join('') : `<div class="help">选中左侧文章里的一段文字，选区上方会出现菜单。保存的碎片会出现在这里。</div>`}
    <div class="help" style="margin-top:8px">${keys('⌘', '↵')} 继续 / 保存 · ${keys('Esc')} 请求关闭</div></div>`
}

function pcRender(root) {
  const view = root.querySelector('.bf-view')
  view.querySelector('.pc-layer').innerHTML =
    (PC.open ? `<div class="cm-scrim" style="z-index:30"></div><div class="cm-wrap" style="z-index:31">${pcModal()}</div>` : '') + (PC.toast ? `<div class="toast-pos" style="z-index:40">${PC.toast}</div>` : '')
  view.querySelector('.pc-side-host').innerHTML = pcSide()
}

function pcInit(root) {
  const view = root.querySelector('.bf-view')
  const board = root.closest('.cv-board')
  const scale = () => (board && board.__scale) || 1
  const menuHost = view.querySelector('.pc-menu')
  let range = null
  const toast = (html, ms = 2200) => {
    PC.toast = html
    pcRender(root)
    clearTimeout(toast.t)
    toast.t = setTimeout(() => {
      PC.toast = ''
      pcRender(root)
    }, ms)
  }
  const wrapHl = () => {
    if (!range) return
    try {
      const m = document.createElement('mark')
      m.className = 'hl'
      range.surroundContents(m)
    } catch {}
  }
  const hideMenu = () => (menuHost.innerHTML = '')
  const reset = () => Object.assign(PC, { open: false, step: PC.deep ? 'guess' : 'verify', guess: '', apply: '', confirmed: false, source: 'source-material', closing: false, success: false, err: '' })

  view.querySelector('.pg').addEventListener('mouseup', () => {
    if (PC.open) return
    setTimeout(() => {
      const s = window.getSelection()
      const text = s ? s.toString().trim() : ''
      if (!text || !s.rangeCount || !view.querySelector('.pg-art').contains(s.anchorNode)) return hideMenu()
      range = s.getRangeAt(0).cloneRange()
      PC.sel = text
      PC.kind = pcInfer(text)
      PC.inferred = true
      const r = range.getClientRects()[0]
      const vr = view.getBoundingClientRect()
      menuHost.innerHTML = hoverMenu({ style: '' })
      const el = menuHost.firstElementChild
      el.style.left = `${Math.max(8, Math.min((r.left + r.width / 2 - vr.left) / scale() - el.offsetWidth / 2, view.clientWidth - el.offsetWidth - 8))}px`
      el.style.top = `${Math.max(8, (r.top - vr.top) / scale() - el.offsetHeight - 10)}px`
      el.style.setProperty('--caret', '50%')
      el.querySelectorAll('.hm-b').forEach((b, i) => (b.dataset.menu = ['frag', 'hl', 'clip', 'shot'][i]))
    }, 0)
  })
  document.addEventListener('mousedown', e => {
    if (!menuHost.contains(e.target) && !PC.open) setTimeout(() => !window.getSelection().toString() && hideMenu(), 0)
  })
  menuHost.addEventListener('mousedown', e => e.preventDefault())
  menuHost.addEventListener('click', e => {
    const b = e.target.closest('[data-menu]')
    if (!b) return
    const m = b.dataset.menu
    if (m === 'frag') {
      reset()
      PC.open = true
      PC.step = PC.deep ? 'guess' : 'verify'
      hideMenu()
      pcRender(root)
      setTimeout(() => view.querySelector('textarea') && view.querySelector('textarea').focus(), 0)
    } else if (m === 'hl') {
      wrapHl()
      PC.log.hl++
      hideMenu()
      window.getSelection().removeAllRanges()
      toast(toastHtml('已高亮 · 只在页面留痕', 'highlighter'))
    } else if (m === 'clip') {
      PC.log.clip++
      hideMenu()
      window.getSelection().removeAllRanges()
      toast(toastHtml('已剪藏 <span class="act" style="margin-left:6px">撤销</span>', 'bookmark'))
    } else {
      hideMenu()
      toast(toastHtml('截图模式：见上方“截图”画板（此原型不演示）', 'scan'))
    }
  })
  const toastHtml = (t, icon) => toast_(t, icon)

  const next = () => {
    if (PC.step === 'guess') PC.step = 'verify'
    else if (PC.step === 'verify') {
      if (!PC.confirmed) {
        PC.err = '先点“确认已核对”才能继续——这一步只是确认你回看过来源。'
        return pcRender(root)
      }
      PC.err = ''
      PC.step = 'apply'
    } else {
      if (pcApplyState() !== 'good') {
        PC.err = 'x'
        return pcRender(root)
      }
      PC.success = true
      PC.log.frag++
      PC.items.unshift({ kind: PC.kind, title: PC.sel, use: PC.apply })
      if (PC.hl) wrapHl()
      pcRender(root)
      setTimeout(() => {
        reset()
        window.getSelection().removeAllRanges()
        pcRender(root)
      }, 900)
      return
    }
    PC.err = PC.step === 'apply' ? '' : PC.err
    pcRender(root)
    const ta = view.querySelector('textarea')
    if (ta) ta.focus()
  }
  const close = () => {
    if (pcDirty()) {
      PC.closing = true
      pcRender(root)
    } else {
      reset()
      pcRender(root)
    }
  }

  view.querySelector('.pc-layer').addEventListener('click', e => {
    const t = e.target.closest('[data-act]')
    if (!t) return
    const a = t.dataset.act
    if (a === 'close') close()
    else if (a === 'next') next()
    else if (a === 'back') {
      PC.step = PC.step === 'apply' ? 'verify' : 'guess'
      PC.err = ''
      pcRender(root)
    } else if (a === 'confirm') {
      PC.confirmed = !PC.confirmed
      PC.err = ''
      pcRender(root)
    } else if (a === 'src') {
      PC.source = t.dataset.v
      pcRender(root)
    } else if (a === 'kind') {
      PC.kind = t.dataset.v
      PC.inferred = false
      PC.confirmed = false
      pcRender(root)
    } else if (a === 'mode') {
      PC.deep = t.dataset.v === 'deep'
      if (!PC.deep && PC.step === 'guess') PC.step = 'verify'
      pcRender(root)
    } else if (a === 'hl') {
      PC.hl = !PC.hl
      pcRender(root)
    } else if (a === 'keep') {
      PC.closing = false
      pcRender(root)
    } else if (a === 'as-hl' || a === 'as-clip') {
      if (a === 'as-hl') {
        wrapHl()
        PC.log.hl++
      } else PC.log.clip++
      PC.log.exit++
      reset()
      window.getSelection().removeAllRanges()
      pcRender(root)
      toast(toastHtml(a === 'as-hl' ? '已改存为高亮' : '已改存为剪藏', a === 'as-hl' ? 'highlighter' : 'bookmark'))
    } else if (a === 'discard') {
      reset()
      window.getSelection().removeAllRanges()
      pcRender(root)
    }
  })
  view.querySelector('.pc-layer').addEventListener('input', e => {
    const bind = e.target.dataset && e.target.dataset.bind
    if (!bind) return
    PC[bind] = e.target.value
    if (PC.step === 'apply') PC.err = ''
    const pos = e.target.selectionStart
    pcRender(root)
    const ta = view.querySelector(`textarea[data-bind="${bind}"]`)
    if (ta) {
      ta.focus()
      ta.setSelectionRange(pos, pos)
    }
  })
  document.addEventListener('keydown', e => {
    if (!PC.open || !view.isConnected) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      next()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      PC.closing ? ((PC.closing = false), pcRender(root)) : close()
    }
  })
  pcRender(root)
}

const toast_ = (html, icon) => toast(html, { icon })

function extProtoGroup() {
  const proto = board({
    title: '原型 · 选中文字，走完一次采集',
    ref: 'extension §2–§4 · US-CAP-01',
    live: true,
    w: 1040,
    id: 'proto-capture',
    body: browser(
      `${article({ sel: 'none' })}<div class="pc-menu"></div><div class="pc-side-host"></div><div class="pc-layer"></div>`,
      { h: 700 },
    ),
    notes: [
      '<b>试试看</b>：在文章里选中一段文字 → 选区菜单出现 → 点“碎片”。标准模式 = 核验 → 应用；右上角切到“深度”会多一步“理解”。',
      '<b>规则是真的</b>：不点“确认已核对”无法继续；应用留空、只复制原文、或只写“以后可能用得上”都会被拦下并给出具体提示；写出对象和动作才能保存。',
      '<b>安全出口</b>：写了内容后点取消或按 Esc，会出现确认，可以改存为高亮 / 剪藏而不丢内容；点类型可改 kind（会清除核验确认）。',
      '原型只演示 concept / excerpt 这类没有额外必填项的流程；其余 kind 的额外字段见“按 kind 的表单”。选区菜单里的“截图”此处不演示。',
    ],
  })
  return group(
    { id: 'ext-proto', title: '可交互原型', small: '', desc: '把上面静态画板里的规则接成一条能点的流程：选区菜单、三步加工、校验提示、安全出口。' },
    row(proto),
  )
}

// 在页面渲染后初始化原型
function initProtoCapture() {
  const root = document.querySelector('#proto-capture .cv-canvas')
  if (root) pcInit(root)
}
