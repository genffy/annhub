// 可交互原型 1：页面里的两种剪藏与截图。保存的条目写入共享的 STORE，资料库原型里能看到。
// 规则是真的：剪藏一次点击，约 3 秒内可撤销、可编辑；选区菜单只有“剪藏”和“截图”，页面上不留任何标记。
// 区块剪藏（capture §6.2）：指针停下约 400ms（每 100ms 移动不到 6px 算停着），描出指针下最内层的块，上沿标出类型与范围；
// 胶囊「剪藏 · 截图 · 下载 | 里一层 · 外一层 | 更多」沿目标链换层，停在换层按钮上先用虚线描出下一层；点偏选区菜单或按键关掉胶囊之后，这一块暂停，移到别的块上才出现。
const PC = { toast: null, edit: null, pos: null, log: { clip: 0, block: 0, screenshot: 0 }, mine: [], seq: 0, blk: null, pause: null }

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
        : `<div class="help">选中左侧文章里的一段文字，选区上方出现菜单；或者不选文字，把指针停在一段正文、一个标题、代码块或页面底部的帖子上，等描边、标注和胶囊出现。胶囊里的「外一层」把目标一层层换到一节、整篇文章，停在它上面先用虚线看到范围。点偏选区菜单、或按任意键关掉胶囊之后，原处这一块不再出胶囊，移到别的块上才出现。保存的内容会出现在下面的“资料库”原型里，在那里读和高亮。</div>`
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

// 页面里的目标链（capture §6.2 的内容看法）：带 data-blk 的是单元（一节、文章、代码块、帖子），初始化时给段落、列表、标题打上 data-blkb（块）。
// 真实实现里 Markdown 由共享的转换模块从 DOM 生成；原型里单元用写好的 Markdown，块取它的文字。
// 外层的 Markdown 由里层拼成，描边框住什么就保存什么：一节含它的代码块，文章含一节与帖子
const PC_CODE_MD = '```ts\n// 重试预算：用掉 20% 的额度就快速失败\nconst policy = retry({\n  budget: 0.2,\n  backoff: \'exponential\',\n  jitter: true,\n})\n```'
const PC_POST_MD = '**Display Name** @handle · 2026-10-08\n\nRetries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓\n\n[example.com/retry-budgets](https://example.com/retry-budgets)'
const PC_SECTION_MD = `### Three common strategies\n\n1. Demand signaling: the consumer grants credits and the producer sends no more than it was granted.\n2. Bounded buffers: queues with a hard limit that block or reject at the edge.\n3. Load shedding: drop the least valuable work first, on purpose.\n\n${PC_CODE_MD}`
const PC_BLOCKS = {
  strategies: { md: PC_SECTION_MD },
  article: { md: `## Backpressure in Streams\n\nWhen a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down with it.\n\n**Backpressure** is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, ${SEL_TEXT}.\n\n${PC_SECTION_MD}\n\n${PC_POST_MD}` },
  code: { md: PC_CODE_MD },
  post: { md: PC_POST_MD },
}
const PC_BLOCK_NAMES = { p: '段落', li: '列表项', ol: '列表', ul: '列表', h1: '标题', h2: '标题', h3: '标题', h4: '标题' }
const pcText = el => (el.textContent || '').replace(/\s+/g, ' ').trim()
const pcLen = el => (el.textContent || '').replace(/\s/g, '').length
const pcCut = (text, n = 16) => {
  const chars = Array.from(text)
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : text
}

// 标注：类型 · 范围（块与引用取开头 16 个字符，一节的标题取 24 个）
function pcLabel(el) {
  const key = el.dataset.blk
  if (key === 'article') return '文章 · 整篇'
  if (key === 'post') return '帖子 · @handle'
  if (key === 'code') return `代码块 · ${el.querySelector('pre').textContent.split('\n').length} 行`
  if (key === 'strategies') return `一节 · ${pcCut(pcText(el.querySelector('h2')), 24)}`
  return `${PC_BLOCK_NAMES[el.tagName.toLowerCase()] || '块'} · ${pcCut(pcText(el))}`
}

function pcMd(el) {
  const key = el.dataset.blk
  if (key) return PC_BLOCKS[key].md
  const tag = el.tagName.toLowerCase()
  if (tag === 'ol' || tag === 'ul') return [...el.children].map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${pcText(li)}`).join('\n')
  if (tag === 'li') return `- ${pcText(el)}`
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]) + 1)} ${pcText(el)}`
  return pcText(el)
}

// 指针下从里到外的链，到文章为止；start 是起点：指在标题上时是它开头的一节（标题本身留在链里，往里一层就到）
function pcChain(target) {
  const found = []
  for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
    if (el.dataset.blk || el.dataset.blkb !== undefined) found.push(el)
    if (el.dataset.blk === 'article') break
  }
  if (!found.length) return null
  // 外一层多出的文字不到 20 个字符、也没有多出图片时，两层并成一层，范围取外面那一层
  const layers = []
  for (const el of found) {
    const prev = layers[layers.length - 1]
    if (prev && pcLen(el) - pcLen(prev) < 20 && el.querySelectorAll('img').length === prev.querySelectorAll('img').length) layers[layers.length - 1] = el
    else layers.push(el)
  }
  const start = /^h[1-4]$/.test(layers[0].tagName.toLowerCase()) && layers.length > 1 ? 1 : 0
  return { layers, start }
}
const pcStartOf = target => {
  const chain = target ? pcChain(target) : null
  return chain ? chain.layers[chain.start] : null
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
  let leave = null
  let pillHover = false
  let pt = null // 指针最近的位置与目标
  let sample = null // 上一次取样的位置
  let still = 0 // 连续停着的取样次数
  let sampler = null

  const hideMenu = () => (menuHost.innerHTML = '')
  const hideBlk = () => {
    clearTimeout(leave)
    pillHover = false
    PC.blk = null
    blkHost.innerHTML = ''
  }
  // 暂停：记在当时指针下的起点上，指针下的起点变了才解除（capture §6.2）
  const pauseHere = target => {
    PC.pause = pcStartOf(target)
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
    return { left: `${Math.max(8, Math.min(cx - w / 2, view.clientWidth - w - 8))}px`, top: `${Math.min((rect.bottom - vr.top) / scale() + view.scrollTop + 10, view.scrollTop + view.clientHeight - 250)}px` }
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
      el.style.top = `${Math.max(view.scrollTop + 8, (r.top - vr.top) / scale() + view.scrollTop - el.offsetHeight - 10)}px`
      el.style.setProperty('--caret', '50%')
      el.querySelectorAll('.hm-b').forEach((b, i) => (b.dataset.menu = ['clip', 'screenshot'][i]))
    }, 0)
  })
  document.addEventListener('mousedown', e => {
    if (menuHost.contains(e.target) || layer.contains(e.target)) return
    // 点偏了选区菜单、落在页面上：菜单收起、选区塌缩，胶囊在这一块上暂停
    const hadMenu = !!menuHost.firstElementChild || !!window.getSelection().toString().trim()
    setTimeout(() => {
      if (window.getSelection().toString()) return
      hideMenu()
      if (hadMenu && view.contains(e.target)) pauseHere(e.target)
    }, 0)
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

  // ── 区块胶囊（capture §6.2）──────────────────────────────────────────────
  // 状态：PC.blk = { chain, idx, hot, at }。idx 是链上当前的层，起点是 chain.start；hot 是指针停着的换层按钮；at 是胶囊的位置（换层时右缘不动）
  const blkRect = el => {
    const vr = view.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return { left: (r.left - vr.left) / scale() + view.scrollLeft, top: (r.top - vr.top) / scale() + view.scrollTop, width: r.width / scale(), height: r.height / scale() }
  }
  const ring = (el, cls, label, labelRight) => {
    const r = blkRect(el)
    // 目标比窗口高时，标注贴着窗口里可见部分的上沿
    const emTop = Math.max(-10, view.scrollTop - (r.top - 6) + 8)
    return `<i class="blk ${cls}" style="inset:auto;left:${r.left - 10}px;top:${r.top - 6}px;width:${r.width + 20}px;height:${r.height + 12}px">${label ? `<em class="${labelRight ? 'at-r' : ''}" style="top:${emTop}px">${label}</em>` : ''}</i>`
  }
  const pillHtml = () => {
    const { chain, idx, hot } = PC.blk
    const top = idx >= chain.layers.length - 1
    const tip = k => (k === 'outer' ? (top ? '已是最外一层' : `外一层 · ${pcLabel(chain.layers[idx + 1])}`) : k === 'inner' ? `里一层 · ${pcLabel(chain.layers[idx - 1])}` : '')
    const seg = (k, icon, label, cls = '', attrs = '') =>
      `<span class="bp-seg pa-click ${cls} ${hot === k ? 'is-hot' : ''}" data-blk-act="${k}" tabindex="0" role="button" title="${label}" aria-label="${label}" ${attrs}>${I(icon)}${hot === k ? `<span class="bp-tip">${tip(k)}</span>` : ''}</span>`
    return `<div class="blk-pill pc-pill ${PC.blk.at && PC.blk.at.leftSide ? 'at-tl' : ''}" style="right:auto;left:0;top:0" role="group" aria-label="${pcLabel(chain.layers[idx])}">${seg('clip', 'bookmark', PC.blk.saved ? '已剪藏' : '剪藏', 'bp-seg-clip')}${seg('shot', 'scan', '截图', 'is-alt bp-seg-shot')}${seg('download', 'download', '下载', 'is-alt bp-seg-dl')}<i class="bp-sep" aria-hidden="true"></i>${idx > 0 ? seg('inner', 'shrink', '里一层', 'bp-lv') : ''}${seg('outer', 'expand', '外一层', `bp-lv ${top ? 'is-off' : ''}`, top ? 'aria-disabled="true"' : '')}<i class="sub pa-click" data-blk-act="off" tabindex="0" role="button" title="更多" aria-label="更多">${I('ellipsis', 'i-sm')}</i></div>`
  }
  const paintBlk = () => {
    const { chain, idx, hot } = PC.blk
    const cur = chain.layers[idx]
    const next = hot === 'outer' ? chain.layers[idx + 1] : hot === 'inner' ? chain.layers[idx - 1] : null
    blkHost.innerHTML = ring(cur, PC.blk.saved ? 'is-saved' : '', pcLabel(cur), PC.blk.at && PC.blk.at.leftSide) + (next ? ring(next, 'is-preview', '') : '') + pillHtml()
    const pill = blkHost.querySelector('.pc-pill')
    const w = pill.offsetWidth
    const h = pill.offsetHeight
    if (!PC.blk.at) {
      // 位置：右上角、左上角、右下角、左下角，选第一个不盖住页面自己的控件（data-ctl）的；块比窗口高时贴着可见部分的上沿
      const r = blkRect(cur)
      const ctls = [...view.querySelectorAll('[data-ctl]')].map(blkRect)
      const spots = [
        { left: r.left + r.width - w - 6, top: r.top - 18 },
        { left: r.left + 6, top: r.top - 18, leftSide: true },
        { left: r.left + r.width - w - 6, top: r.top + r.height - h + 18 },
        { left: r.left + 6, top: r.top + r.height - h + 18, leftSide: true },
      ]
      const clash = c => ctls.some(k => c.left < k.left + k.width && c.left + w > k.left && c.top < k.top + k.height && c.top + h > k.top)
      const at = spots.find(c => !clash(c)) || spots[0]
      const left = Math.max(8, Math.min(at.left, view.clientWidth - w - 8))
      PC.blk.at = { right: left + w, top: Math.max(view.scrollTop + 8, Math.min(at.top, view.scrollTop + view.clientHeight - h - 8)), leftSide: !!at.leftSide }
      if (at.leftSide) return paintBlk() // 标注换到右端、提示向右展开
    }
    // 换层之后胶囊留在原处：右缘不动，多出的「里一层」长在左边
    pill.style.left = `${PC.blk.at.right - w}px`
    pill.style.top = `${PC.blk.at.top}px`
  }
  const showBlk = chain => {
    PC.blk = { chain, idx: chain.start, hot: null, at: null }
    pillHover = false
    paintBlk()
  }
  const scheduleHide = () => {
    clearTimeout(leave)
    leave = setTimeout(() => !pillHover && hideBlk(), 150)
  }
  const insideCurrent = () => {
    if (!PC.blk || !pt) return false
    const r = PC.blk.chain.layers[PC.blk.idx].getBoundingClientRect()
    return pt.x >= r.left - 10 && pt.x <= r.right + 10 && pt.y >= r.top - 6 && pt.y <= r.bottom + 6
  }

  // 停下按位移判断：每 100ms 取一次指针位置，移动不到 6px 算停着，连续约 400ms 出胶囊；手抖与触控板的漂移不重新计时
  const onSample = () => {
    if (!pt) return
    still = sample && Math.hypot(pt.x - sample.x, pt.y - sample.y) < 6 ? still + 1 : 0
    sample = { x: pt.x, y: pt.y }
    const start = pcStartOf(pt.target)
    if (PC.pause && PC.pause !== start) PC.pause = null // 指针下的起点变了，暂停解除
    if (still < 4 || !start || start === PC.pause) return
    if (typeof PA !== 'undefined' && PA.blockOn === false) return // 资料库“设置”里关掉区块入口后，这里不再出现
    if (PC.edit || window.getSelection().toString().trim() || menuHost.firstElementChild) return
    if (PC.blk && PC.blk.chain.layers[PC.blk.chain.start] === start) return
    if (pillHover) return
    showBlk(pcChain(pt.target))
  }
  const art = view.querySelector('.pg-art')
  // 给段落、列表、标题打上块的标记；帖子与代码块是小单元，里面不再分出块
  art.querySelectorAll('h1, h2, h3, h4, p, ol, ul, li, .pg-by').forEach(el => {
    if (!el.closest('[data-blk="code"], [data-blk="post"]')) el.dataset.blkb = ''
  })
  art.addEventListener('mouseenter', () => {
    clearInterval(sampler)
    still = 0
    sample = null
    sampler = setInterval(onSample, 100)
  })
  art.addEventListener('mousemove', ev => {
    pt = { x: ev.clientX, y: ev.clientY, target: ev.target }
    if (!PC.blk) return
    if (insideCurrent()) clearTimeout(leave)
    else if (!pillHover) scheduleHide()
  })
  art.addEventListener('mouseleave', () => {
    clearInterval(sampler)
    pt = null
    scheduleHide()
  })
  blkHost.addEventListener('mouseover', ev => {
    if (!ev.target.closest('.blk-pill') || !PC.blk) return
    pillHover = true
    clearTimeout(leave)
    // 指针停在换层按钮上：虚线先描出点下去会换到的那一层，提示写出它的标注
    const lv = ev.target.closest('[data-blk-act="outer"], [data-blk-act="inner"]')
    const hot = lv ? lv.dataset.blkAct : null
    if (hot !== PC.blk.hot) {
      PC.blk.hot = hot
      paintBlk()
    }
  })
  blkHost.addEventListener('mouseout', ev => {
    if (!ev.target.closest('.blk-pill') || !PC.blk) return
    const into = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget : null
    if (into && into.closest('.blk-pill')) return
    pillHover = false
    if (PC.blk.hot) {
      PC.blk.hot = null
      paintBlk()
    }
    scheduleHide()
  })
  blkHost.addEventListener('click', ev => {
    const a = ev.target.closest('[data-blk-act]')
    if (!a || !PC.blk) return
    const act = a.dataset.blkAct
    const cur = PC.blk.chain.layers[PC.blk.idx]
    if (act === 'outer' || act === 'inner') {
      const next = PC.blk.idx + (act === 'outer' ? 1 : -1)
      if (next < 0 || next >= PC.blk.chain.layers.length) return // 到了最外一层：不回绕
      PC.blk.idx = next
      paintBlk()
    } else if (act === 'download') {
      const url = URL.createObjectURL(new Blob([pcMd(cur)], { type: 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'AnnHub-example.md'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      hideBlk()
      setText('download', '已下载原型示例 Markdown · 不创建资料库条目', 2600)
    } else if (act === 'shot') {
      const label = pcLabel(cur)
      hideBlk()
      pcNewEntry('screenshot', label)
      PC.log.screenshot++
      setText('scan', `已以“${label}”为目标保存为截图条目 · 选区内编辑见上方“截图”画板`, 2600)
    } else if (act === 'clip') {
      PC.blk.saved = true
      PC.blk.hot = null
      paintBlk()
      blkHost.querySelector('.pc-pill').classList.add('is-press')
      saveClip(pcMd(cur), 'block', cur.getBoundingClientRect())
      setTimeout(hideBlk, 650)
    } else {
      hideBlk()
      setText('ban', '原型里不会真的停用；真实实现里会在这个网站停用区块胶囊', 2600)
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
    if (!view.isConnected) return
    // 按键关掉胶囊：这一块暂停，指针在这里再动也不会又出来
    if (PC.blk && !PC.edit && !['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) {
      PC.pause = PC.blk.chain.layers[PC.blk.chain.start]
      hideBlk()
      return
    }
    if (ev.key === 'Escape' && PC.edit) closePops()
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
