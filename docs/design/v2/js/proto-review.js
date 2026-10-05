// 可交互原型：Desktop 窗口。侧栏可切换页面，今日 → 复习会话（含提示梯度、评分、中断恢复），⌘K 打开命令面板。
// 评分后的预计间隔由 review.md §3 的四档 v1 纯函数现算。
const schedule = (st, rating) => {
  const prev = Math.max(1, st.intervalDays)
  const next = { ...st }
  if (rating === 'again') Object.assign(next, { intervalDays: 1, repetitions: 0, lapses: st.lapses + 1, ease: Math.max(1.3, st.ease - 0.2) })
  if (rating === 'hard') Object.assign(next, { intervalDays: Math.max(1, Math.round(prev * 1.2)), ease: Math.max(1.3, st.ease - 0.15) })
  if (rating === 'good') Object.assign(next, { intervalDays: st.repetitions === 0 ? 1 : st.repetitions === 1 ? 6 : Math.max(1, Math.round(prev * st.ease)), repetitions: st.repetitions + 1 })
  if (rating === 'easy') Object.assign(next, { intervalDays: st.repetitions === 0 ? 4 : Math.max(2, Math.round(prev * st.ease * 1.3)), repetitions: st.repetitions + 1, ease: st.ease + 0.15 })
  return next
}

const RS_CARDS = [
  { kind: 'concept', topic: 'Backpressure', st: { repetitions: 0, lapses: 0, ease: 2.5, intervalDays: 0 },
    hints: ['需求信号 / 缓冲 / 丢弃', 'Backpressure in Streams · #streams #reliability', '…Queues grow, memory climbs… <b>Backpressure</b> is how <span class="mask"></span>…', '已确认 · 来源：原文　摘要：不只是固定速率限流，还涉及队列边界和反馈机制'],
    guess: '下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游', verify: '不只是固定速率限流，还涉及队列边界和反馈机制', use: '检查当前事件管道为什么在消费者变慢后耗尽内存' },
  { kind: 'procedure', topic: '指数退避加抖动', st: { repetitions: 2, lapses: 0, ease: 2.5, intervalDays: 6 },
    hints: ['共 3 步', '第一步：基础间隔 × 2^n', '完整流程：①基础间隔翻倍 ②乘 0–1 随机因子 <span class="mask"></span>', '已确认 · 来源：原文'],
    guess: '基础间隔翻倍重试，再乘一个随机因子', verify: '补上第三步：设置重试上限与预算', use: '写进支付重试方案的“重试策略”章节' },
  { kind: 'claim', topic: 'Most microservice failures are organizational failures.', st: { repetitions: 1, lapses: 0, ease: 2.5, intervalDays: 1 },
    hints: ['微服务 / 组织', '证据：团队边界、部署责任、接口治理的三个例子', '原文：Most microservice failures are <span class="mask"></span>', '已确认 · 立场：不确定'],
    guess: '不完全赞同：技术原因也不少，但边界划分确实常出问题', verify: '证据偏案例，缺少统计支撑；立场保持“不确定”', use: '评审“拆服务即可提升交付速度”时，追问团队边界与发布责任' },
  { kind: 'decision', topic: '首版不做实时协作', st: { repetitions: 3, lapses: 1, ease: 2.35, intervalDays: 9 },
    hints: ['首版不做实时协作', '约束：单人本地优先；协作引入账号、权限、冲突', '理由：<span class="mask"></span>', '已确认 · 来源：手工'],
    guess: '要先验证单人闭环，协作会拉长验证周期', verify: '备选：共享文件、云工作区；后果：用户提需求时需重评', use: '用户提出共享需求时，用真实使用数据重新评估' },
]

const RS = { phase: 'today', page: 'today', i: 0, used: 0, revealed: false, done: [], palette: false }

const rsRatingsFor = st => RATINGS.map(r => `${schedule(st, r.id).intervalDays} 天`)

function rsCardHtml() {
  const c = RS_CARDS[RS.i]
  const k = KINDS[c.kind]
  const meta = rvMeta(c.kind, RS.i + 1, RS_CARDS.length)
  if (!RS.revealed) {
    const rows = c.hints.slice(0, RS.used).map((h, i) => `<div class="rv-hint ${i === RS.used - 1 ? 'new' : ''}"><span class="n">提示 ${i + 1}/4 · ${k.hints[i]}</span><span>${h}</span></div>`).join('')
    return `<div class="rv-card">${meta}<h2 class="rv-q">${k.q}</h2><div class="rv-topic"><span class="l">主题</span><span class="v">${c.topic}</span></div>${rows}
      ${RS.used === 0 ? '<div class="rv-help">先自己作答，再点「揭示」</div>' : ''}
      <div class="rv-act">${btn(RS.used >= 4 ? '提示已用完 4/4' : RS.used === 0 ? '提示 0/4' : `再给一级提示 ${RS.used + 1}/4`, { lg: true, icon: 'lightbulb', off: RS.used >= 4, attrs: 'data-act="hint"' })}<span class="grow"></span>${btn('揭示', { lg: true, v: 'primary', kbd: 'Space', attrs: 'data-act="reveal"' })}</div></div>`
  }
  const iv = rsRatingsFor(c.st)
  return `<div class="rv-card"><div class="hs between">${meta}${RS.used ? chip(`已用提示 ${RS.used} 级`, { icon: 'lightbulb' }) : ''}</div>
    <div class="rv-topic" style="margin-top:12px"><span class="l">主题</span><span class="v">${c.topic}</span></div>
    <div class="rv-rev" style="margin-top:12px">
      <div class="rv-sec"><div class="l">${I('pencil-line', 'i-sm')}你的理解</div><div class="v">${c.guess}</div></div>
      <div class="rv-sec"><div class="l">${I('badge-check', 'i-sm')}核验</div><div class="v hs g8 wrap">${chip('已确认', { icon: 'circle-check', v: 'ok' })}${srcBadge('source-material')}<span class="t-md muted">${c.verify}</span></div></div>
      <div class="rv-sec" style="border-bottom:0"><div class="l">${I('target', 'i-sm')}你的应用</div><div class="v">${c.use}</div></div></div>
    <div class="rv-rate">${RATINGS.map((r, i) => `<div class="${r.id}" data-act="rate" data-v="${r.id}" style="cursor:pointer"><kbd>${r.key}</kbd><div class="nm">${r.zh}</div><div class="iv">${iv[i]}</div></div>`).join('')}</div>
    <div class="hs between" style="margin-top:14px"><span class="link t-sm hs g4">回到来源${I('arrow-up-right', 'i-sm')}</span><span class="t-xs muted">预计间隔按当前调度状态现算（repetitions ${c.st.repetitions} · ease ${c.st.ease.toFixed(2)}）</span></div></div>`
}

function rsDoneHtml() {
  const lastRatings = RS.done.map(d => d.rating)
  const again = lastRatings.filter(r => r === 'again').length
  return `<div class="rv-card" style="text-align:center;padding:34px 30px"><div class="iconchip" style="margin:0 auto 12px;width:46px;height:46px;border-radius:50%;background:color-mix(in oklab,var(--ok) 14%,var(--surface));color:var(--ok)">${I('circle-check', 'i-lg')}</div>
    <div class="t-xl b">这一轮完成了</div><div class="muted t-md" style="margin-top:6px">已评分 ${RS.done.length} 条 · ${again} 条“再来一次”</div>
    <div class="vs g6 t-sm" style="margin:14px auto 0;max-width:420px;text-align:left">${RS.done.map(d => `<div class="hs between" style="padding:6px 0;border-bottom:1px solid var(--mac-sep)"><span>${kchip(d.kind, { sm: true })} <b>${esc(d.topic.length > 24 ? d.topic.slice(0, 24) + '…' : d.topic)}</b></span><span class="muted">${RATINGS.find(r => r.id === d.rating).zh} → ${d.next} 天后</span></div>`).join('')}</div>
    <div class="hs g8 center" style="margin-top:18px">${btn('回到今日', { lg: true, attrs: 'data-act="home"' })}${btn('重新开始原型', { lg: true, v: 'primary', attrs: 'data-act="restart"' })}</div></div>`
}

// 北极星 M-18：本周此前已有 4 个；本轮评为良好或容易的才计入，再来一次 / 较难不计（每张卡一轮只评一次，天然去重）
const rsWeekCount = () => 4 + RS.done.filter(d => d.rating === 'good' || d.rating === 'easy').length

function rsTodayHtml() {
  const left = RS_CARDS.length - RS.done.length
  const resumable = RS.done.length > 0 && RS.done.length < RS_CARDS.length
  return `<div class="today"><div><h1>今天需要完成什么</h1><div class="sub">10 月 3 日 周六 · 今日建议 ${RS_CARDS.length} / 20 条</div></div>
    <div class="mcard"><div class="hs g16 top"><span class="iconchip">${I('repeat')}</span><div class="grow vs g4"><div class="t-xl b">到期复习</div>
      <div class="muted t-md">${left} 条 · 预计 ${Math.max(1, Math.round((left * 45) / 60))} 分钟</div><div class="t-sm muted">逾期主题：Backpressure / 指数退避加抖动 / 首版不做实时协作</div>
      ${resumable ? `<div class="hs g10" style="margin-top:8px"><div class="progress grow" style="max-width:260px"><i style="width:${(RS.done.length / RS_CARDS.length) * 100}%"></i></div><span class="t-sm muted tnum">已评分 ${RS.done.length} / ${RS_CARDS.length}</span></div>` : ''}</div>
      <div class="none">${left === 0 ? btn('今天没有更多到期', { lg: true, off: true }) : btn(resumable ? `继续复习 · ${RS.done.length}/${RS_CARDS.length}` : '开始复习', { lg: true, v: 'primary', icon: 'play', attrs: 'data-act="start"' })}</div></div></div>
    ${recentList(['f1', 'f3', 'f10'])}${weekLine(rsWeekCount())}</div>`
}

function rsPaletteHtml() {
  return `<div style="position:absolute;inset:0;z-index:20;background:rgb(15 23 42 / 0.28);display:grid;place-items:start center;padding-top:90px" data-act="palette-bg"><div class="pal">
    <div class="pal-in">${I('search', 'i-lg muted')}<span>重试</span><span class="caret" style="height:1em"></span><span class="grow"></span><kbd>esc</kbd></div>
    <div class="pal-g"><div class="mh">碎片 · 3 条匹配</div>${['f3', 'f4', 'f12'].map((id, i) => { const f = fragById(id); return `<div class="pal-i ${i === 0 ? 'on' : ''}">${kchip(f.kind, { sm: true })}<span class="grow truncate">${esc(f.title).replace('重试', '<mark>重试</mark>')}</span><span class="t-xs muted none">命中：内容</span></div>` }).join('')}</div>
    <div class="pal-g"><div class="mh">命令</div><div class="pal-i" data-act="start-from-palette">${I('play', 'muted')}<span class="grow">开始复习</span><span class="t-xs muted">${RS_CARDS.length - RS.done.length} 条到期</span></div><div class="pal-i" data-nav="system">${I('settings', 'muted')}<span class="grow">打开系统页</span></div></div>
    <div class="hs g14" style="padding:10px 18px;border-top:1px solid var(--mac-sep);font-size:12px;color:var(--fg-3)">${keys('↑', '↓')} 选择 ${keys('↵')} 打开 ${keys('esc')} 关闭</div></div></div>`
}

function rsPage(root) {
  const nav = RS.phase === 'session' || RS.phase === 'done' ? 'today' : RS.page
  root.querySelectorAll('.mw-nav').forEach(n => n.classList.toggle('on', n.dataset.nav === nav))
  const tb = root.querySelector('.mw-tb')
  const body = root.querySelector('.mw-body')
  const session = RS.phase === 'session' || RS.phase === 'done'
  if (session) {
    tb.innerHTML = `<span class="btn btn-ghost btn-sm" data-act="exit">${I('chevron-left')}退出复习</span><span class="grow"></span><div class="hs g10"><div class="rv-prog">${RS_CARDS.map((_, i) => `<i class="${i < RS.done.length ? 'done' : i === RS.done.length && RS.phase === 'session' ? 'cur' : ''}"></i>`).join('')}</div><span class="t-sm muted tnum">${Math.min(RS.done.length + 1, RS_CARDS.length)} / ${RS_CARDS.length}</span></div><span class="grow"></span><span class="t-xs muted" style="width:170px;text-align:right">评分用 ${keys('1', '2', '3', '4')}（揭示后）</span>`
    body.innerHTML = `<div class="rv">${RS.phase === 'done' ? rsDoneHtml() : rsCardHtml()}</div>`
  } else {
    tb.innerHTML = `<span class="ttl">${MAC_TITLE[RS.page]}</span><span class="grow"></span>${macSearch()}`
    body.innerHTML = { today: rsTodayHtml(), library: libraryBody({ sel: 'f1' }), system: sysBody('ok', { show: false }) }[RS.page]
  }
  body.insertAdjacentHTML('beforeend', RS.palette ? rsPaletteHtml() : '')
}

function initProtoReview() {
  const root = document.querySelector('#proto-desktop .mw')
  if (!root) return
  const render = () => rsPage(root)
  const rate = id => {
    const c = RS_CARDS[RS.i]
    const next = schedule(c.st, id)
    RS.done.push({ kind: c.kind, topic: c.topic, rating: id, next: next.intervalDays, usedHint: RS.used })
    c.st = next
    RS.i++
    RS.used = 0
    RS.revealed = false
    RS.phase = RS.i >= RS_CARDS.length ? 'done' : 'session'
    render()
  }
  root.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]')
    if (nav) {
      RS.page = nav.dataset.nav
      RS.palette = false
      if (RS.phase !== 'today') RS.phase = 'today'
      return render()
    }
    const t = e.target.closest('[data-act]')
    if (!t) return
    const a = t.dataset.act
    if (a === 'start' || a === 'start-from-palette') {
      RS.palette = false
      RS.page = 'today'
      if (RS.done.length >= RS_CARDS.length) return
      RS.phase = 'session'
      RS.i = RS.done.length
      RS.used = 0
      RS.revealed = false
    } else if (a === 'hint') RS.used = Math.min(4, RS.used + 1)
    else if (a === 'reveal') RS.revealed = true
    else if (a === 'rate') return rate(t.dataset.v)
    else if (a === 'exit' || a === 'home') RS.phase = 'today'
    else if (a === 'restart') {
      RS.phase = 'today'
      RS.done = []
      RS.i = 0
      RS.used = 0
      RS.revealed = false
      RS_CARDS.forEach((c, i) => (c.st = [{ repetitions: 0, lapses: 0, ease: 2.5, intervalDays: 0 }, { repetitions: 2, lapses: 0, ease: 2.5, intervalDays: 6 }, { repetitions: 1, lapses: 0, ease: 2.5, intervalDays: 1 }, { repetitions: 3, lapses: 1, ease: 2.35, intervalDays: 9 }][i]))
    } else if (a === 'palette') RS.palette = true
    else if (a === 'palette-bg') {
      if (e.target === t) RS.palette = false
    }
    render()
  })
  document.addEventListener('keydown', e => {
    if (!root.isConnected) return
    const r = root.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      RS.palette = !RS.palette
      return render()
    }
    if (e.key === 'Escape' && RS.palette) {
      RS.palette = false
      return render()
    }
    if (RS.phase !== 'session') return
    if (e.key === ' ' && !RS.revealed) {
      e.preventDefault()
      RS.revealed = true
      return render()
    }
    // 评分键 1–4 在揭示前无效
    if (RS.revealed && ['1', '2', '3', '4'].includes(e.key)) rate(RATINGS[+e.key - 1].id)
  })
  render()
}

function deskProtoGroup() {
  const win = board({
    title: '原型 · Desktop：切换页面、做一轮复习、⌘K',
    ref: 'desktop §2 · §5 · §9 · review §3',
    live: true,
    w: 1360,
    bare: true,
    cls: 'mac',
    id: 'proto-desktop',
    body: macWindow({ nav: 'today', due: 5, h: 880, body: '' }),
    notes: [
      '<b>试试看</b>：点“开始复习”→ 先“提示”再“揭示” → 用鼠标或键盘 <b>1–4</b> 评分（揭示前按 1–4 无效）。中途点“退出复习”回到今日，主按钮会变成“继续复习 · k/4”。',
      '<b>评分按钮上的间隔是现算的</b>：用 review §3 的四档 v1 纯函数，同一张卡在不同状态下“良好”可能是 1 天、6 天或 15 天；评分后下一张卡立刻出现，已评分的不会重复。',
      '<b>今日页底部的“本周成功提取”会随评分变化</b>：只有评为良好或容易的碎片才计入（M-18），再来一次、较难不计；同一碎片一周内只计一次。',
      '<b>侧栏可点</b>：碎片库、系统都是上面静态画板里的同一套页面；按 <b>⌘K</b>（Ctrl+K）或点工具栏的搜索打开命令面板，Esc 关闭。',
    ],
  })
  return group(
    { id: 'desk-proto', title: '可交互原型', small: '', desc: '把复习会话接成一条能点的流程，同时让侧栏导航和命令面板能用，方便整体感受 Desktop 的节奏。' },
    row(win),
  )
}
