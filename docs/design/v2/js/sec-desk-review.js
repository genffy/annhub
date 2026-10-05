// macOS Desktop · 复习会话。题面、提示梯度、评分文案取自 desktop §5、review §2–§5、kinds §1/§4。

const rvTb = (cur = 2, n = 5, o = {}) => `<span class="btn btn-ghost btn-sm" style="position:relative">${o.pin ? pin(o.pin, 'pin-in') : ''}${I('chevron-left')}退出复习</span><span class="grow"></span>
  <div class="hs g10" style="position:relative">${o.pin2 ? pin(o.pin2, 'pin-b') : ''}<div class="rv-prog">${Array.from({ length: n }, (_, i) => `<i class="${i < cur - 1 ? 'done' : i === cur - 1 ? 'cur' : ''}"></i>`).join('')}</div><span class="t-sm muted tnum">${cur} / ${n}</span></div>
  <span class="grow"></span><span class="t-xs muted" style="width:170px;text-align:right">评分用 ${keys('1', '2', '3', '4')}（揭示后）</span>`

const CONCEPT_HINTS = ['需求信号 / 缓冲 / 丢弃', 'Backpressure in Streams · #streams #reliability', '…something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down. <b>Backpressure</b> is how <span class="mask"></span>…', '已确认 · 来源：原文　摘要：不只是固定速率限流，还涉及队列边界和反馈机制']

const rvMeta = (kind, cur = 2, n = 5) => `<div class="rv-meta">${kchip(kind)}<span class="tnum">${cur} / ${n}</span></div>`

// 评分按钮：预计间隔由当前调度状态实时算出（review §3）
const rvRate = (iv = ['1 天', '1 天', '1 天', '4 天'], pins) => `<div class="rv-rate" style="position:relative">${pins ? pin(pins, 'pin-in') : ''}${RATINGS.map((r, i) => `<div class="${r.id}"><kbd>${r.key}</kbd><div class="nm">${r.zh}</div><div class="iv">${iv[i]}</div></div>`).join('')}</div>`

// state: q 题面 | hint 提示 | rev 揭示
const rvCard = (kind, state, o = {}) => {
  const k = KINDS[kind]
  const topic = o.topic || 'Backpressure'
  const hints = o.hints || CONCEPT_HINTS
  const used = state === 'hint' ? o.used || 1 : state === 'rev' ? o.used || 1 : 0
  const labels = k.hints
  const hintRows = Array.from({ length: used }, (_, i) => `<div class="rv-hint ${state === 'hint' && i === used - 1 ? 'new' : ''}"><span class="n">提示 ${i + 1}/4 · ${labels[i]}</span><span>${hints[i]}</span></div>`).join('')
  if (state === 'rev')
    return `<div class="rv-card ${o.md ? 'md' : ''}">
      <div class="hs between">${rvMeta(kind)}${used ? chip(`已用提示 ${used} 级`, { icon: 'lightbulb' }) : ''}</div>
      <div class="rv-topic" style="margin-top:12px"><span class="l">主题</span><span class="v">${topic}</span></div>
      <div class="rv-rev" style="margin-top:12px">
        ${o.reveal || `<div class="rv-sec"><div class="l">${I('pencil-line', 'i-sm')}你的理解</div><div class="v">下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游</div></div>
        <div class="rv-sec"><div class="l">${I('badge-check', 'i-sm')}核验</div><div class="v hs g8 wrap">${chip('已确认 · 周一', { icon: 'circle-check', v: 'ok' })}${srcBadge('source-material')}<span class="t-md muted">不只是固定速率限流，还涉及队列边界和反馈机制</span></div></div>
        <div class="rv-sec" style="border-bottom:0"><div class="l">${I('target', 'i-sm')}你的应用</div><div class="v">检查当前事件管道为什么在消费者变慢后耗尽内存</div></div>`}
      </div>
      ${rvRate(o.iv, o.pinRate)}
      <div class="hs between" style="margin-top:14px"><span class="link t-sm hs g4">回到来源${I('arrow-up-right', 'i-sm')}</span><span class="t-xs muted">评分只记录你的自评；使用提示已写入日志，不会改写你的选择</span></div>
    </div>`
  return `<div class="rv-card ${o.md ? 'md' : ''}">
    ${rvMeta(kind)}
    <h2 class="rv-q" style="position:relative">${o.pinQ ? pin(o.pinQ, 'pin-l') : ''}${k.q}</h2>
    <div class="rv-topic" style="position:relative">${o.pinT ? pin(o.pinT, 'pin-l') : ''}<span class="l">主题</span><span class="v">${topic}</span></div>
    ${hintRows}
    ${state === 'q' ? `<div class="rv-help">先自己作答，再点「揭示」</div>` : ''}
    <div class="rv-act" style="position:relative">${o.pinA ? pin(o.pinA, 'pin-l') : ''}
      ${state === 'q' ? btn(`提示 0/4`, { lg: true, icon: 'lightbulb' }) : btn(`再给一级提示 ${used + 1}/4`, { lg: true, icon: 'lightbulb' })}
      <span class="grow"></span>${btn('揭示', { lg: true, v: 'primary', kbd: 'Space' })}</div>
  </div>`
}

const rvWindow = (card, o = {}) => macWindow({ nav: 'today', due: 5, h: o.h || 860, tb: rvTb(o.cur || 2, 5, o), body: `<div class="rv">${card}</div>` })

function deskReviewGroup() {
  const hero = board({
    title: '复习会话 · ① 题面',
    ref: 'desktop §5.1 · review §2 · kinds §4.2',
    tag: 'R1',
    w: 1360,
    bare: true,
    cls: 'mac',
    body: rvWindow(rvCard('concept', 'q', { pinQ: 1, pinT: 2, pinA: 3 }), { pin: 4, pin2: 5 }),
    notes: [
      '<b>题面只问该 kind 的那一个问题</b>（kinds.md 里写一次），字号放大，周围没有任何答案线索；版面刻意留白，让注意力在“回忆”上。',
      '<b>主题</b>是被提问的对象（概念名 / 论点 / 步骤标题）；没有“请输入答案”的文本框——首版答案由用户自评，不自动判定长文本（desktop §5.2）。',
      '<b>两个按钮</b>：左边“提示 0/4”，右边主按钮“揭示”（空格也可）。<b>评分按钮此刻不存在</b>，只有揭示后才出现。',
      '<b>退出</b>不会丢会话：游标持久化，评分成功后才前进；今日页显示“继续复习 N/M”。',
      '<b>进度</b>用分段条 + “2 / 5”，没有计时、没有连续天数、没有连胜（metrics §6.2 / product §6）。',
    ],
  })

  const hintAndReveal = board({
    title: '② 提示逐级点开 · ③ 揭示后才出现评分',
    ref: 'desktop §5.1 · §5.3 · review §3–§4',
    tag: 'R1',
    w: 1360,
    body: `<div style="padding:28px;background:var(--surface-2);display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start" class="mac">
      <div>${rvCard('concept', 'hint', { used: 2, md: true })}</div>
      <div style="position:relative">${rvCard('concept', 'rev', { used: 1, md: true, pinRate: 1 })}</div>
    </div>`,
    notes: [
      '<b>四级提示由粗到细</b>：1 kind 特定的关键词或结构 → 2 来源标题与标签 → 3 原文的非答案部分（答案被遮挡）→ 4 核验确认状态（有摘要则展示摘要，没有则回看原始语境）。使用<b>任何一级</b>都记 usedHint，评分仍由你自己选。',
      '<b>评分按钮上的预计间隔</b>由当前调度状态实时算出（新卡：1 / 1 / 1 / 4 天），键盘 1…4 对应四档；揭示前按键无效。四档按钮用<b>文字 + 间隔 + 顶部色条</b>表达，不靠颜色单独区分。',
      '揭示面按“你的理解 → 核验 → 你的应用”排布，回扣采集时的加工，并保留“回到来源”。',
    ],
  })

  const grid = `<div style="padding:24px;background:var(--surface-2);display:grid;grid-template-columns:repeat(3,1fr);gap:14px" class="mac">${[...KIND_ORDER.filter(k => k !== 'excerpt'), 'excerpt', 'media-clip']
    .map(k => `<div class="mcard" style="padding:16px 18px;border-radius:16px"><div class="hs between">${kchip(k, { full: true })}<span class="cv-tag">${KINDS[k].rel}</span></div>
      <div class="t-lg b" style="margin:10px 0 8px;line-height:1.4;letter-spacing:-0.005em">${KINDS[k].q}</div>
      <div class="ladder">${KINDS[k].hints.map((h, i) => `<div><b>${i + 1}${i === 3 ? ' · 核验' : ''}</b>${h}</div>`).join('')}</div></div>`)
    .join('')}</div>`
  const kinds = board({
    title: '按 kind 的题面与提示梯度',
    ref: 'kinds §1 · §4',
    tag: 'R1 · R4',
    w: 1360,
    body: grid,
    notes: ['九种 kind 各有一个默认题面和四级梯度，全部取自 kinds.md；界面不另写题面。四档 v1 中每个 kind 只有一个默认题型（Q-01 待定）。', '第四级统一为“核验确认”；有摘要时再展示摘要，没有摘要时回看原始语境（desktop §5.3）。'],
  })

  const vcard = (cap, inner, o = {}) => `<div class="vs g8"><div class="hs between"><b class="t-sm">${cap}</b>${o.tag ? `<span class="cv-tag">${o.tag}</span>` : ''}</div>${inner}${o.note ? `<div class="help">${o.note}</div>` : ''}</div>`
  const vFront = occl => `<div class="rv-card md" style="padding:20px 22px">${rvMeta('visual')}<h3 class="rv-q" style="font-size:19px;margin-top:12px">${KINDS.visual.q}</h3>
    <div class="rv-topic" style="margin-top:12px"><span class="l">来源</span><span class="v t-md" style="font-weight:600">sre.example.org · 周二</span></div>
    ${occl ? `<div style="margin-top:12px;height:96px;border-radius:12px;background:repeating-conic-gradient(#b4b9c7 0% 25%, #d9dce6 0% 50%) 0 0/12px 12px;position:relative;display:grid;place-items:center"><span class="chip" style="background:var(--surface)">${I('eye-off')}图像已遮挡，回答后揭示</span></div>` : `<div class="rv-help" style="margin-top:12px">图片先不显示：先回忆关键细节，再揭示。</div>`}
    <div class="rv-act" style="margin-top:16px">${btn('提示 0/4', {})}<span class="grow"></span>${btn('揭示', { v: 'primary' })}</div></div>`
  const vBack = missing => `<div class="rv-card md" style="padding:20px 22px">${rvMeta('visual')}<div class="rv-rev" style="margin-top:6px">
    <div class="rv-sec"><div class="l">文字描述</div><div class="v t-md">重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s；红线标出了重试放大的时间点</div></div>
    <div class="rv-sec" style="border-bottom:0"><div class="l">原图</div>${missing ? `<div class="banner warn" style="margin-top:2px">${I('triangle-alert')}<div><b>图片待重试</b>：文字卡与你的加工都在，可以照常评分。</div></div>` : thumb({ style: 'width:100%;height:118px' })}</div></div>
    ${rvRate(['1 天', '1 天', '1 天', '4 天']).replace('margin-top:20px', '')}</div>`
  const mFront = `<div class="rv-card md" style="padding:20px 22px">${rvMeta('media-clip')}<h3 class="rv-q" style="font-size:19px;margin-top:12px">${KINDS['media-clip'].q}</h3>
    <div class="rv-topic" style="margin-top:12px"><span class="l">主题</span><span class="v t-md" style="font-weight:600">幂等键的生成时机</span></div><div class="rv-act" style="margin-top:16px">${btn('提示 0/4', {})}<span class="grow"></span>${btn('揭示', { v: 'primary' })}</div></div>`
  const mBack = `<div class="rv-card md" style="padding:20px 22px">${rvMeta('media-clip')}<div class="rv-rev" style="margin-top:6px"><div class="rv-sec"><div class="l">区间</div><div class="v hs g8">${chip('17:20 – 19:05', { icon: 'film' })}<span class="t-sm muted">只显示时间，不嵌播放器</span></div></div>
    <div class="rv-sec" style="border-bottom:0"><div class="l">要点与转写节选</div><div class="v t-md">幂等键应在请求首次落库时生成，并与结果一起保存至重试窗口结束。</div></div></div></div>`
  const vm = board({
    title: '视觉与媒体的题面',
    ref: 'desktop §5.2 · kinds §4.7 · §4.9 · review §4',
    tag: 'R1 · R4',
    w: 1360,
    body: `<div style="padding:24px;background:var(--surface-2);display:grid;grid-template-columns:repeat(3,1fr);gap:20px 18px" class="mac">
      ${vcard('视觉 · 题面（R1）', vFront(false), { note: '先给来源和任务提示，让用户回忆关键细节；揭示后再展示文字描述和截图。' })}
      ${vcard('视觉 · 图像遮挡题面', vFront(true), { tag: 'R4', note: '揭示前以马赛克遮挡图像，回答后再露出原图。' })}
      ${vcard('视觉 · 揭示后', vBack(false))}
      ${vcard('视觉 · 附件缺失', vBack(true), { note: '附件暂时缺失时保留文字题面与加工内容，并显示待重试。' })}
      ${vcard('媒体片段 · 题面', mFront, { tag: 'R4' })}
      ${vcard('媒体片段 · 揭示后', mBack, { tag: 'R4', note: '参考信息含 mm:ss 区间与转写节选；不为媒体另建播放或训练系统。' })}
    </div>`,
    notes: ['视觉和媒体沿用同一套“题面 → 提示 → 揭示 → 评分”，只是揭示面多一块图或时间区间；<b>缺图不阻塞复习</b>。'],
  })

  const endCard = `<div class="rv-card md" style="text-align:center;padding:34px 30px">
    <div class="iconchip" style="margin:0 auto 12px;width:46px;height:46px;border-radius:50%;background:color-mix(in oklab,var(--ok) 14%,var(--surface));color:var(--ok)">${I('circle-check', 'i-lg')}</div>
    <div class="t-xl b" style="letter-spacing:-0.01em">这一轮完成了</div>
    <div class="muted t-md" style="margin-top:6px">已评分 5 条 · 其中 2 条用过提示 · 1 条“再来一次”</div>
    <div class="t-sm muted" style="margin-top:12px;padding:10px;border-radius:10px;background:var(--surface-2)">下一批到期：明天 2 条 · 周日 1 条</div>
    <div class="hs g8 center" style="margin-top:18px">${btn('回到今日', { lg: true })}${btn('继续下一会话 · 还有 3 条到期', { lg: true, v: 'primary' })}</div></div>`
  const capCard = `<div class="rv-card md" style="text-align:center;padding:34px 30px">
    <div class="iconchip n" style="margin:0 auto 12px;width:46px;height:46px;border-radius:50%">${I('gauge', 'i-lg')}</div>
    <div class="t-xl b" style="letter-spacing:-0.01em">今天的建议量已完成</div>
    <div class="muted t-md" style="margin-top:6px;line-height:1.6">建议量 20 / 20。还有 6 条到期，保留原到期时间，明天继续。<br>想多练一轮也可以。</div>
    <div class="hs g8 center" style="margin-top:18px">${btn('回到今日', { lg: true, v: 'primary' })}${btn('再来一轮（超出建议量）', { lg: true })}</div></div>`
  const skipCard = `<div class="vs g12" style="align-items:stretch">${toast('已跳过 1 条：这条碎片在另一个窗口被删除了。', { icon: 'info', cls: '' }).replace('class="toast ', 'style="align-self:center" class="toast ')}${rvCard('concept', 'q', { md: true, topic: '退避加抖动' })}</div>`
  const ends = board({
    title: '收尾 · 每日上限 · 异常跳过',
    ref: 'desktop §5.4–§5.5 · review §5 · US-REV-02',
    tag: 'R1',
    w: 1360,
    body: `<div style="padding:28px;background:var(--surface-2);display:grid;grid-template-columns:repeat(3,1fr);gap:24px;align-items:start" class="mac">
      <div class="vs g8"><b class="t-sm">本轮完成</b>${endCard}</div><div class="vs g8"><b class="t-sm">每日建议量已满</b>${capCard}</div><div class="vs g8"><b class="t-sm">碎片被删除时跳过</b>${skipCard}</div></div>`,
    notes: ['收尾页只陈述事实：评分条数、提示使用、下一批到期时间；<b>没有连续天数、徽章或庆祝动画</b>。用户可以主动继续下一会话，未完成的到期项保留原 nextReviewAt。', '默认每日建议上限 20（可在 5–50 配置），单次会话默认最多 13 条（≈10 分钟）；预计超过 10 分钟时只生成一个短会话。', '会话期间碎片在其他窗口被删除：跳过并记录原因，会话不崩溃，只给一行轻提示。'],
  })

  return group(
    { id: 'desk-review', title: '复习会话', small: 'desktop §5 · review · kinds', desc: '先回忆，再揭示，最后自评。整个会话的界面服务于一件事：让“回忆”真实发生——题面留白、答案后置、评分后置、提示有代价但不惩罚。' },
    row(hero),
    row(hintAndReveal),
    row(kinds),
    row(vm),
    row(ends),
  )
}
