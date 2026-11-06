// 资料库原型里的选择与下载（download.md §3）：选择模式、下载对话框、单条下载的状态条。
// 状态：PA.pick = { ids, anchor }（选择模式）、PA.dl = 下载对话框、PA.dst = 单条下载的状态条。零件与静态画板共用，见 download-parts.js。
// proto-app.js 在点击与键盘事件的最前面把事件交给 paSelClick / paSelKey，返回 true 表示已处理。
// 给地址加 ?cap=3 可以把上限临时改小，试“选满上限”的样子（真实的上限是 200）。

const PA_CAP = Number(new URLSearchParams(location.search).get('cap')) || DL_CAP

let paDlTimer = 0
let paDstTimer = 0
let paDstBusyTimer = 0
let paLiveFlip = false

const paPicked = id => !!PA.pick && PA.pick.ids.includes(id)

// 屏幕阅读器播报。同一句话连续两次也要读出来，所以交替追加一个零宽字符
const paLive = (root, text) => {
  const el = root.querySelector('.pa-live')
  if (el) el.textContent = text + ((paLiveFlip = !paLiveFlip) ? '\u200b' : '')
}

// 重绘之后把焦点放到列出的第一个可用的控件上：被点的按钮变成不可用时，键盘用户不会掉到页面顶部
const paFocusAfter = (ctx, ...fids) => {
  ctx.render()
  for (const f of fids) {
    const el = ctx.root.querySelector(`[data-fid="${f}"]`)
    if (el && !el.disabled) return el.focus({ preventScroll: true })
  }
}

// ── 列表页的零件 ────────────────────────────────────────────────────────────────
const PA_BAR_ATTRS = {
  done: 'data-act="pick-exit" data-fid="pick-exit"',
  all: 'data-act="pick-all" data-fid="pick-all"',
  clear: 'data-act="pick-clear" data-fid="pick-clear"',
  dl: 'data-act="pick-dl" data-fid="pick-dl"',
}

// 页头右侧：搜索框（选择中置灰）与「选择」
const paHeadRight = shown =>
  `<div class="hs g8" style="flex:none">${PA.pick ? dlSearchOff(300) : paSearchBox()}${dlPickBtn(!!PA.pick, { off: !shown && !PA.pick, attrs: 'data-act="pick-toggle" data-fid="pick-toggle"' })}</div>`

// 工具条槽：平时是筛选条，选择中是选择条，同一个位置、同一个高度
const paSlot = (shown, filterBar) => dlSlot(PA.pick ? dlBar({ n: PA.pick.ids.length, m: shown, cap: PA_CAP, attrs: PA_BAR_ATTRS }) : filterBar)

// 选择模式里的卡片：整张卡片是一个复选框，标签与属性小标签不单独响应
const paPickCard = e => {
  const on = paPicked(e.id)
  return dlCard(e, { on, off: !on && PA.pick.ids.length >= PA_CAP, attrs: `data-pick="${e.id}" data-fid="pick:${e.id}"` })
}

// 滚动区里有内容从选择条下面经过时，选择条下沿有一道轻阴影
const paStuck = app => {
  const body = app.querySelector('.pbody.has-slot')
  const slot = app.querySelector('.dl-slot')
  if (body && slot) slot.classList.toggle('is-stuck', body.scrollTop > 0)
}

// ── 选择 ────────────────────────────────────────────────────────────────────────
function paPickEnter(ctx) {
  PA.pick = { ids: [], anchor: null }
  PA.sel = null
  PA.adding = null
  PA.focus = 'pick-toggle'
  ctx.render()
  paLive(ctx.root, '已进入选择模式，已选 0 条')
}

function paPickExit(ctx) {
  PA.pick = null
  PA.dl = null
  PA.focus = 'pick-toggle'
  ctx.render()
  paLive(ctx.root, '已退出选择')
}

// 点击或 Space：切换一张卡片。Shift：选中上一次点击的卡片到这张之间、按列表顺序的全部卡片，不取消已选的，选到上限为止
function paPickToggle(ctx, id, range) {
  const p = PA.pick
  const shown = paShown().map(e => e.id)
  if (range && p.anchor && shown.includes(p.anchor) && shown.includes(id)) {
    const a = shown.indexOf(p.anchor)
    const b = shown.indexOf(id)
    const next = [...p.ids]
    let capped = false
    for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) {
      if (next.includes(x)) continue
      if (next.length >= PA_CAP) {
        capped = true
        break
      }
      next.push(x)
    }
    p.ids = next
    p.anchor = id
    ctx.render()
    return paLive(ctx.root, capped ? `已选满 ${PA_CAP} 条，这一段没有选完` : `已选 ${next.length} 条`)
  }
  const on = p.ids.includes(id)
  if (!on && p.ids.length >= PA_CAP) return paLive(ctx.root, `已选满 ${PA_CAP} 条，其余不可再选`)
  p.ids = on ? p.ids.filter(x => x !== id) : [...p.ids, id]
  p.anchor = id
  ctx.render()
  paLive(ctx.root, `${on ? '已取消选择，' : ''}已选 ${p.ids.length} 条`)
}

function paPickAll(ctx) {
  const shown = paShown()
  if (!PA.pick || !shown.length) return
  if (shown.length > PA_CAP) return paLive(ctx.root, `一次最多选 ${PA_CAP} 条，这个列表有 ${shown.length} 条`)
  PA.pick.ids = shown.map(e => e.id)
  paFocusAfter(ctx, 'pick-all', 'pick-dl', 'pick-exit')
  paLive(ctx.root, `已选 ${shown.length} 条`)
}

function paPickClear(ctx) {
  PA.pick.ids = []
  PA.pick.anchor = null
  paFocusAfter(ctx, 'pick-clear', 'pick-all', 'pick-exit')
  paLive(ctx.root, '已选 0 条')
}

// ── 下载对话框 ──────────────────────────────────────────────────────────────────
// 预计的文件数：每条一个 Markdown，截图带着自己的图片，剪藏在联网取媒体时每条约两张图，外加一份清单 README
const paDlCount = (ids, media) => {
  const es = ids.map(paEntry).filter(Boolean)
  const shots = es.filter(e => e.type === 'screenshot').length
  const clips = es.length - shots
  const images = shots + (media ? clips * 2 : 0)
  return { n: es.length, clips, shots, images, files: 1 + es.length + images }
}

const PA_DL_ATTRS = {
  form: k => `data-act="dl-form" data-v="${k}" data-fid="dl-form:${k}"`,
  media: 'data-act="dl-media" data-fid="dl-media"',
  cancel: 'data-act="dl-cancel" data-fid="dl-cancel"',
  start: 'data-act="dl-start" data-fid="dl-start"',
  close: 'data-act="dl-close" data-fid="dl-close"',
  show: 'data-act="dl-show" data-fid="dl-show"',
}

function paDlHtml() {
  const d = PA.dl
  const offline = !navigator.onLine
  const c = paDlCount(d.ids, d.media && !offline)
  const body = dlDialog(d.state, { n: c.n, clips: c.clips, shots: c.shots, files: c.files, form: d.form, media: d.media, offline, many: c.files > 100, done: d.done, total: d.total, images: d.images, attrs: PA_DL_ATTRS })
  return `<div class="dlg-back" data-act="dl-bg"><div data-dlg>${body}</div></div>`
}

function paDlOpen(ctx) {
  if (!PA.pick || !PA.pick.ids.length) return
  PA.dl = { state: 'prepare', form: 'folder', media: true, ids: PA.pick.ids.slice(), done: 0, total: 0, images: 0 }
  PA.focus = 'dl-start'
  ctx.render()
}

function paDlClose(ctx) {
  clearTimeout(paDlTimer)
  PA.dl = null
  PA.focus = 'pick-dl'
  ctx.render()
}

// 联网取回可以取消：已写好的文件删除，已选的条目还在
function paDlStart(ctx) {
  const d = PA.dl
  const c = paDlCount(d.ids, d.media && navigator.onLine)
  d.state = 'progress'
  d.done = 0
  d.total = c.files
  d.images = c.images
  PA.focus = 'dl-cancel'
  ctx.render()
  const step = () => {
    if (!PA.dl || PA.dl.state !== 'progress') return
    PA.dl.done = Math.min(PA.dl.total, PA.dl.done + Math.max(1, Math.ceil(PA.dl.total / 12)))
    if (PA.dl.done >= PA.dl.total) {
      PA.dl.state = 'full'
      PA.focus = 'dl-close'
      paLive(ctx.root, `已下载 ${PA.dl.ids.length} 条`)
    }
    ctx.render()
    if (PA.dl && PA.dl.state === 'progress') paDlTimer = setTimeout(step, 220)
  }
  paDlTimer = setTimeout(step, 220)
}

function paDlCancel(ctx) {
  clearTimeout(paDlTimer)
  PA.dl.state = 'cancelled'
  PA.focus = 'dl-start'
  ctx.render()
  paLive(ctx.root, '已取消，已选的条目还在')
}

// ── 单条下载的状态条 ────────────────────────────────────────────────────────────
const PA_DST_ATTRS = {
  cancel: 'data-act="dls-cancel" data-fid="dls-cancel"',
  show: 'data-act="dls-show" data-fid="dls-show"',
  close: 'data-act="dls-close" data-fid="dls-close"',
  retry: 'data-act="dls-retry" data-fid="dls-retry"',
}

// 浮在内容区（导航右边）的底部居中；叠层铺满整个应用，所以水平位置按内容区算
function paDstHtml(root) {
  const s = PA.dst
  const main = root.querySelector('.main')
  const sc = paScale(root)
  const left = main ? Math.round((main.getBoundingClientRect().left + main.getBoundingClientRect().width / 2 - root.getBoundingClientRect().left) / sc) : root.clientWidth / 2
  return `<div class="toast-pos pa-dst" style="left:${left}px">${dlStatus(s.busy ? 'busy' : s.state, { n: s.n, total: s.total, missing: s.missing, attrs: PA_DST_ATTRS })}</div>`
}

function paDstStart(ctx, id) {
  const e = paEntry(id)
  if (!e) return
  // 一次只进行一个下载：进行中再点下载入口，状态条提示“上一个还在进行”，不开始新的
  if (PA.dst && PA.dst.state === 'progress') {
    PA.dst.busy = true
    clearTimeout(paDstBusyTimer)
    paDstBusyTimer = setTimeout(() => {
      if (PA.dst) PA.dst.busy = false
      paOverlay(ctx.root)
    }, 2200)
    paOverlay(ctx.root)
    return paLive(ctx.root, '上一个还在进行')
  }
  clearTimeout(paDstTimer)
  // 示例里的剪藏没有真实的图片：假定每条有 12 个媒体，截图只有自己的一张图（不联网）
  PA.dst = { state: 'progress', n: 0, total: e.type === 'screenshot' ? 1 : 12, busy: false }
  const tick = () => {
    const s = PA.dst
    if (!s || s.state !== 'progress') return
    s.n += 1
    if (s.n >= s.total) {
      s.state = 'full'
      s.busy = false
      paLive(ctx.root, '已下载')
      paDstTimer = setTimeout(() => {
        PA.dst = null
        paOverlay(ctx.root)
      }, 3600)
    } else paDstTimer = setTimeout(tick, 260)
    paOverlay(ctx.root)
  }
  paDstTimer = setTimeout(tick, 260)
  paOverlay(ctx.root)
  paLive(ctx.root, '开始下载')
}

function paDstClose(ctx) {
  clearTimeout(paDstTimer)
  clearTimeout(paDstBusyTimer)
  PA.dst = null
  paOverlay(ctx.root)
}

// ── 事件入口 ────────────────────────────────────────────────────────────────────
// 返回 true 表示这次点击已处理，proto-app.js 不再往下分发
function paSelClick(ev, ctx) {
  const t = ev.target
  const card = PA.pick && !PA.dl && t.closest('[data-pick]')
  if (card) return paPickToggle(ctx, card.dataset.pick, ev.shiftKey), true
  const a = t.closest('[data-act]')
  const act = a && a.dataset.act
  if (!act) return false
  const e = paCur()
  switch (act) {
    case 'pick-toggle':
      return PA.pick ? paPickExit(ctx) : paPickEnter(ctx), true
    case 'pick-exit':
      return paPickExit(ctx), true
    case 'pick-all':
      return paPickAll(ctx), true
    case 'pick-clear':
      return paPickClear(ctx), true
    case 'pick-dl':
      return paDlOpen(ctx), true
    case 'dl-bg': // 进行中点遮罩不关闭，只有「取消」停止下载
      if (ev.target === a && PA.dl && PA.dl.state !== 'progress') paDlClose(ctx)
      return true
    case 'dl-form':
      if (PA.dl) PA.dl.form = a.dataset.v
      return ctx.render(), true
    case 'dl-media':
      if (PA.dl && navigator.onLine) PA.dl.media = !PA.dl.media
      return ctx.render(), true
    case 'dl-start':
      return paDlStart(ctx), true
    case 'dl-cancel':
      return paDlCancel(ctx), true
    case 'dl-close':
      return paDlClose(ctx), true
    case 'dl-show':
    case 'dls-show':
      return ctx.toast('真实实现里会在系统的文件管理器里显示这次下载', 'folder-open', 3000), true
    case 'dl-entry':
      return e && paDstStart(ctx, e.id), true
    case 'dl-img':
      return ctx.toast('真实实现里只把这张图片存到下载文件夹，不含 Markdown', 'image-down', 3000), true
    case 'dls-cancel':
      paDstClose(ctx)
      return ctx.toast('已取消，已写好的文件已删除', 'circle-alert', 2600), true
    case 'dls-close':
    case 'dls-retry':
      return paDstClose(ctx), true
    default:
      return false
  }
}

function paSelKey(ev, ctx) {
  const t = ev.target
  // 对话框打开时，Tab 在其中循环
  if (PA.dl && ev.key === 'Tab') {
    const dlg = ctx.root.querySelector('[data-dlg]')
    const f = dlg ? [...dlg.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter(x => x.offsetParent !== null) : []
    if (!f.length) return false
    const i = f.indexOf(document.activeElement)
    if (ev.shiftKey && i <= 0) f[f.length - 1].focus()
    else if (!ev.shiftKey && (i < 0 || i === f.length - 1)) f[0].focus()
    else return false
    return ev.preventDefault(), true
  }
  if (!PA.pick || PA.dl) return false
  const card = t.closest && t.closest('[data-pick]')
  if (card && (ev.key === ' ' || ev.key === 'Spacebar')) return ev.preventDefault(), paPickToggle(ctx, card.dataset.pick, ev.shiftKey), true
  // 卡片是复选框，Enter 不触发它
  if (card && ev.key === 'Enter') return ev.preventDefault(), true
  if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && (ev.key === 'a' || ev.key === 'A') && !(t.tagName && /^(input|textarea)$/i.test(t.tagName))) return ev.preventDefault(), paPickAll(ctx), true
  return false
}
