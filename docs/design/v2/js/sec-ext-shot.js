// 浏览器扩展 · 截图：区域与元素截图、选区内原位编辑、失败状态；以及精确选区（R3，阶段 V 之后排期）。
// 依据 screenshot §1–§5。截图确认后保存为 screenshot 条目，出现在资料库的“截图”视图。

const chartWide = () => `<svg viewBox="0 0 640 170" aria-hidden="true">
  <rect width="640" height="170" fill="#fff"/>
  <path d="M24 36H620M24 76H620M24 116H620M24 150H620" stroke="#eceef3" stroke-width="1"/>
  <path d="M24 138 L130 134 L230 136 L310 130 L352 104 L392 56 L444 36 L520 42 L620 38" fill="none" stroke="#3b6fe0" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M352 22V152" stroke="#9aa1b2" stroke-width="1.4" stroke-dasharray="4 4"/>
  <text x="358" y="30" font-size="11" fill="#6b7280" font-family="sans-serif">retries begin</text>
  <text x="24" y="20" font-size="11" fill="#6b7280" font-family="sans-serif">downstream p99 (ms)</text>
  <text x="24" y="164" font-size="10" fill="#9aa1b2" font-family="sans-serif">0 min</text><text x="560" y="164" font-size="10" fill="#9aa1b2" font-family="sans-serif">10 min</text>
</svg>`

// ── 套餐页（中性示例）：切换条 + 三张卡片，三种状态；用于“可重复的取景框”（screenshot §1.4）──
const PLAN_PERIODS = {
  m: { label: '连续包月', prices: ['¥99', '¥399', '¥799'], old: ['', '', ''] },
  q: { label: '连续包季', tag: '8折', prices: ['¥79.2', '¥319.2', '¥639.2'], old: ['¥99', '¥399', '¥799'] },
  y: { label: '连续包年', tag: '7折', prices: ['¥69.3', '¥279.3', '¥559.3'], old: ['¥99', '¥399', '¥799'] },
}
const plansScene = (k = 'q') => {
  const P = PLAN_PERIODS[k]
  const seg = ['m', 'q', 'y'].map(x => `<span class="${x === k ? 'on' : ''}">${PLAN_PERIODS[x].label}${PLAN_PERIODS[x].tag ? `<b>${PLAN_PERIODS[x].tag}</b>` : ''}</span>`).join('')
  const cards = [['Starter', '日常使用', ['每周 1 万积分', '逐步开放新模型', '支持常用编程工具']], ['Plus', '高频使用', ['6 倍 Starter 额度', 'Starter 全部权益', '更快的生成速度']], ['Scale', '深度使用', ['14 倍 Starter 额度', 'Plus 全部权益', '高峰期资源优先']]]
  const card = ([t, sub, items], i) => `<div class="pl-card ${i === 1 ? 'hot' : ''}" style="left:${60 + i * 220}px;top:100px;width:200px;height:300px">
      <div class="pl-t">${t}${i === 1 ? '<em>最受欢迎</em>' : ''}</div><div class="sub">${sub}</div>
      <div class="pr">${P.prices[i]}<small>/月</small>${P.old[i] ? `<s>${P.old[i]}/月</s>` : ''}</div>
      <div class="bt">立即订阅</div>
      <ul>${items.map(x => `<li>${I('check')}${x}</li>`).join('')}</ul></div>`
  return `<i class="bar" style="left:60px;top:14px;width:240px"></i><i class="bar" style="left:60px;top:28px;width:420px"></i>
    <div class="pl-seg" data-pl="tabs" style="left:210px;top:48px;width:340px;height:36px">${seg}</div>
    ${cards.map(card).join('')}`
}

// 被截取的网页：骨架文字 + 一条动态 + 一张图
const shotScene = () => `
  <i class="bar" style="left:60px;top:20px;width:300px"></i><i class="bar" style="left:60px;top:38px;width:520px"></i>
  <div class="post" style="left:60px;top:72px;width:640px;height:92px;box-sizing:border-box">
    <div class="av"></div>
    <div><span class="nm">Display Name</span><span class="hd">@handle · 3h</span></div>
    <div class="tx">Retries amplified the outage: downstream p99 went from 120ms to 2s within five minutes.</div>
  </div>
  <figure class="fig" style="left:60px;top:178px;width:640px;margin:0">${chartWide()}<figcaption>Figure 2 · downstream p99 latency during the retry storm</figcaption></figure>
  <i class="bar" style="left:60px;top:410px;width:560px"></i><i class="bar" style="left:60px;top:428px;width:420px"></i>`

const shotToolbar = (o = {}) => `<div class="shot-tb" style="${o.style || 'right:48px;top:398px'}">
  <span class="tb-b ${o.tool === 'rect' ? 'on' : ''}" title="矩形">${I('square')}</span><span class="tb-b" title="椭圆">${I('circle')}</span><span class="tb-b" title="箭头">${I('move-up-right')}</span><span class="tb-b" title="画笔">${I('pencil-line')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b ${o.tool === 'mosaic' ? 'on' : ''}" title="马赛克">${I('grid-3x3')}</span><span class="tb-b" title="文字">${I('type')}</span>
  <i class="tb-sep"></i>
  <span class="tb-dots"><i class="on" style="background:#e5484d"></i><i style="background:#ffd84d"></i><i style="background:#22c4d6"></i><i style="background:#fff"></i><i style="background:#111"></i></span>
  <i class="tb-sep"></i>
  <span class="tb-b" title="撤销">${I('undo-2')}</span>
  <i class="tb-sep"></i>
  ${o.beautify ? `<span class="tb-b ${o.beautify === 'on' ? 'on' : ''}" title="美化">${I('palette')}</span>` : ''}<span class="tb-b ${o.copied ? 'copied' : ''} ${o.copyOff ? 'off' : ''}" title="复制">${I(o.copied ? 'clipboard-check' : 'clipboard-copy')}</span><span class="tb-b" title="下载">${I('download')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b" title="取消">${I('x')}</span><span class="tb-ok" title="确认入库">${I('check')}</span>
  ${o.pins ? pin(o.pins, 'pin-b') : ''}
</div>`

// 八向手柄：四角加四边中点，按选区尺寸的百分比摆放
const selHandles = () =>
  [[0, 0], [50, 0], [100, 0], [0, 50], [100, 50], [0, 100], [50, 100], [100, 100]]
    .map(([x, y]) => `<i class="sel-h" style="left:${x}%;top:${y}%"></i>`)
    .join('')

// 比例预设：小轮廓框按宽高比绘制，较长边 13px
const ratioChip = (label, w, h, o = {}) => {
  const k = w ? 13 / Math.max(w, h) : 0
  const glyph = w ? `<i class="rg" style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px"></i>` : I('move')
  return `<span class="rchip ${o.on ? 'on' : ''}">${glyph}${label}${o.on ? I('lock-keyhole') : ''}</span>`
}

function extShotGroup() {
  const selection = `<div class="shot-sel" style="left:52px;top:62px;width:656px;height:332px"><span class="shot-size">656 × 332</span></div>`
  const hint = `<div class="shot-hint">拖拽框选区域 <span class="muted-2">·</span> 单击选择元素 <span class="muted-2">·</span> <kbd>A</kbd> 匿名 开 <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div>`

  const region = board({
    title: '区域截图 · 拖拽选择',
    ref: 'screenshot §1 · §2',
    tag: 'R1',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}${selection.replace('<span class="shot-size">', `${pin(1, 'pin-in')}<span class="shot-size">`)}${hint}
      <div style="position:absolute;z-index:7;left:690px;top:384px;color:#fff">${I('crosshair', 'i-lg')}</div></div>`,
    notes: ['快捷键 <b>Ctrl/⌘+Shift+S</b> 进入：页面变暗，拖拽时选区保持明亮，显示<b>蓝色边框和像素尺寸</b>。', '拖拽选区、单击选元素共用同一入口；顶部提示条说明手势和快捷键，进入编辑后消失。', '比例预设在 R2（见“截图输出”）；精确选区（吸附、八向手柄、方向键微调、确认选区）属于 R3，阶段 V 之后排期，设计见下方“精确选区”。'],
  })

  const edit = board({
    title: '选区内原位编辑',
    ref: 'screenshot §1.1 · §3',
    tag: 'R1',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      ${selection.replace('<span class="shot-size">', `${pin(1, 'pin-in')}<span class="shot-size">`)}
      <div class="mosaic" style="left:76px;top:86px;width:40px;height:40px;border-radius:50%">${pin(2, 'pin-r')}<span class="x">${I('x')}</span></div>
      <div class="mosaic" style="left:128px;top:86px;width:172px;height:22px"><span class="x">${I('x')}</span></div>
      <div class="ann ann-rect" style="left:392px;top:196px;width:116px;height:104px"></div>
      <div class="ann ann-text" style="left:516px;top:210px">重试放大</div>
      ${shotToolbar({ tool: 'rect', pins: 3 })}
      <div class="shot-hint" style="top:auto;bottom:12px;z-index:8">${I('eye-off', 'i-sm')}匿名 开 · 已遮挡 2 处 <span class="muted-2">·</span> 点 × 可移除自动候选</div></div>`,
    notes: [
      '<b>图片直接占据选区</b>，不跳到居中的预览卡片；原位编辑，页面其余部分保持压暗。',
      '<b>匿名默认开启</b>：身份元素（头像、名字、@账号）被自动覆盖成马赛克候选，虚线框 + × 表示可以移除；用户也可以再手工加框。关闭自动匿名不等于关闭手工马赛克。',
      '<b>浮动工具栏贴近选区右下角</b>，空间不足时移到上方并约束在视口内；窄视口可横向滚动，不遮住“确认 / 取消”。工具：矩形、椭圆、箭头、画笔、马赛克、文字，五色，撤销（只撤销人工标注）、<b>复制</b>、下载、取消、确认。',
      '“确认”把图片保存为一条 <code>screenshot</code> 条目，出现在资料库的“截图”视图；“复制”“下载”和“入库”是三个独立动作，复制或下载后会话继续保留。',
    ],
  })

  const element = board({
    title: '元素截图 · 单击选择',
    ref: 'screenshot §1.1 · §2',
    tag: 'R1',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="elhi" style="left:58px;top:176px;width:644px;height:234px;box-shadow:0 0 0 9999px rgb(10 14 25 / 0.34)">${pin(1, 'pin-in-r')}<span class="tag-l">figure · 640 × 232</span></div>
      <div class="shot-hint">单击截取这个元素 <span class="muted-2">·</span> 拖拽改为框选 <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div></div>`,
    notes: ['悬停时用蓝框和尺寸标签标出可截取的元素；单击后进入同一套原位编辑，工具栏与区域截图一致。', '超出视口的元素按比例缩小预览，但<b>保存完整像素</b>；元素克隆前先匿名，跨域图片与字体失败时会降级并让用户在最终预览里检查。'],
  })

  const states = board({
    title: '成功 · 页面不允许 · 保存失败',
    ref: 'screenshot §4 · §5',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:18px;background:var(--surface-2);display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      <div class="vs g8"><b class="t-sm">保存为截图条目</b>
        <div class="shot" style="height:230px;border-radius:12px"><div style="position:absolute;inset:0;display:grid;place-items:end center;padding-bottom:18px;z-index:9">${toast('已保存到资料库<br><span class="act">查看截图</span>', { icon: 'scan' })}</div></div>
        <div class="help">入库成功才显示；下载成功不等于入库成功。</div></div>
      <div class="vs g8"><b class="t-sm">页面不允许截图</b>
        <div class="shot" style="height:230px;border-radius:12px"><div class="dim"></div><div style="position:absolute;inset:0;display:grid;place-items:center;z-index:9;padding:16px"><div class="dialog" style="padding:16px;text-align:center">${I('ban', 'i-lg c-danger')}<div class="b" style="margin:6px 0 4px">这个页面不允许截图</div><div class="help">浏览器不允许扩展截取商店等受限页面。没有写入任何记录。</div><div style="margin-top:10px">${btn('关闭', { sm: true })}</div></div></div></div>
        <div class="help">预览里给可读错误和取消入口，不写入记录。</div></div>
      <div class="vs g8"><b class="t-sm">保存失败，画布保留</b>
        <div class="shot" style="height:230px;border-radius:12px"><div class="dim"></div><div style="position:absolute;z-index:9;left:16px;right:16px;top:16px;background:#fff;border-radius:10px;padding:8px;height:92px;overflow:hidden"><div style="height:76px;background:#f3f4f8;border-radius:6px;position:relative"><div class="ann ann-rect" style="left:22px;top:18px;width:70px;height:34px;border-width:2px"></div><div class="mosaic" style="left:110px;top:16px;width:46px;height:14px"></div></div></div>
          <div style="position:absolute;z-index:9;left:12px;right:12px;bottom:12px">${banner('danger', '<b>没有保存成功</b>（存储空间不足）。图片与标注都还在。', { action: btn('重试', { sm: true, v: 'primary' }) })}<div class="hs g8" style="margin-top:6px;justify-content:flex-end">${btn('仅下载', { sm: true })}</div></div></div>
        <div class="help">失败保留图片与全部标注，可重试或仅下载。</div></div>
    </div>`,
    notes: ['保存前先做配额校验；IndexedDB 写入或校验失败时不显示成功，也不因下载成功就声称已入库（storage §5、screenshot §4）。', '退出会话时清理遮罩、离屏 surface、临时样式和监听器；重复触发会先结束旧会话。'],
  })

  return group(
    { id: 'ext-shot', title: '截图', small: 'screenshot', desc: '区域或元素截图，直接在原页面上标注、匿名，再保存为 screenshot 条目。它和剪藏、高亮是同一种条目，只是保存的是图片。' },
    row(region, edit),
    row(element, states),
  )
}

// ── 精确选区（R3，阶段 V 之后排期）──────────────────────────────────────────
function extShotR3Group() {
  const snap = board({
    title: '拖拽吸附 · 元素边缘',
    ref: 'screenshot §1.2 · roadmap R3 · US-CAP-10',
    tag: 'R3',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="snap-x" style="left:60px"></div><div class="snap-x" style="left:702px"></div>
      <div class="snap-y" style="top:72px"></div><div class="snap-y" style="top:410px">${pin(2, 'pin-in')}</div>
      <div class="shot-sel" style="left:60px;top:72px;width:642px;height:338px"><span class="shot-size">642 × 338${pin(3, 'pin-r')}</span></div>
      <i class="snap-dot" style="left:60px;top:72px"></i><i class="snap-dot" style="left:702px;top:410px"></i>
      <div class="snap-tag" style="left:588px;top:420px">${pin(1, 'pin-l')}${I('magnet')}吸附 · 图表右下角</div>
      <div style="position:absolute;z-index:8;left:696px;top:404px;color:#fff">${I('crosshair', 'i-lg')}</div>
      <div class="shot-hint">拖拽框选 <span class="muted-2">·</span> 靠近元素边缘自动吸附 <span class="muted-2">·</span> 单击选择整个元素 <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div></div>`,
    notes: [
      '<b>拖拽时实时吸附</b>：光标靠近元素边缘时，选区边自动贴上去，并用蓝色虚线与标签说明吸附到了哪条边；不需要额外的开关。',
      '<b>起止点可以吸附到不同元素的矩形</b>：示例里起点吸在帖子的左上角，终点吸在图表的右下角，选区因此恰好包住两个元素，不会多截或少截一圈。',
      '尺寸标签照常显示最终像素。吸附只发生在拖拽中，单击选择整个元素的手势不变，两者共存互不冲突（roadmap R3 验收）。',
    ],
  })

  const handles = board({
    title: '八向手柄 · 方向键微调 · 确认选区',
    ref: 'screenshot §1.2 · roadmap R3 · US-CAP-10',
    tag: 'R3',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:52px;top:84px;width:656px;height:310px">${selHandles()}<span class="shot-size">656 × 310${pin(1, 'pin-r')}</span></div>
      <div class="snap-tag" style="left:606px;top:232px">${pin(2, 'pin-l')}→ 1 px</div>
      <div class="shot-tb" style="right:52px;top:410px"><span class="tb-b">${I('x')}</span><span class="tb-ok txt">${I('check')}确认选区 <kbd>↵</kbd>${pin(3, 'pin-b')}</span></div>
      <div class="shot-hint">拖拽手柄调整边缘 <span class="muted-2">·</span> ${keys('←', '→', '↑', '↓')} 微调 1 px <span class="muted-2">·</span> ${keys('Shift')} + 方向键 10 px <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div></div>`,
    notes: [
      '确认前选区显示<b>八向手柄</b>（四角与四边中点），可拖拽二次调边；尺寸标签随调整实时更新，像素值始终是最终输出。',
      '方向键微调 1 像素，配合 Shift 每次 10 像素；微调时选区边旁显示方向与位移，便于对齐。',
      '<b>确认选区</b>：松开鼠标后选区保持可调，旁边出现“确认选区 ↵ / 取消”，Enter 或点击确认后才进入原位编辑，Esc 取消会话。单击元素的路径不变，直接进入原位编辑（screenshot §1.2）。',
    ],
  })

  // ─ 元素 + 边距：选到包含切换条与卡片的容器
  const EL = { x: 60, y: 48, w: 640, h: 352 } // 容器：切换条 + 三张卡片
  const MARGIN = 24
  const FR = { x: EL.x - MARGIN, y: EL.y - MARGIN, w: EL.w + 2 * MARGIN, h: EL.h + 2 * MARGIN }
  const marginChip = (label, on) => `<span class="rchip ${on ? 'on' : ''}">${label}</span>`
  const frameBoard = board({
    title: '元素 + 边距 · 选到容器',
    ref: 'screenshot §1.2 · §1.4 · roadmap R3',
    tag: 'R3',
    w: 760,
    body: `<div class="shot" style="height:470px">${plansScene('q')}
      <div class="shot-sel" style="left:${FR.x}px;top:${FR.y}px;width:${FR.w}px;height:${FR.h}px;background:color-mix(in oklab, #3b82f6 7%, transparent)">
        <span class="shot-size">${FR.w} × ${FR.h} · 元素 + ${MARGIN} px${pin(1, 'pin-r')}</span>
        <div class="frame-el" style="left:${MARGIN - 1.5}px;top:${MARGIN - 1.5}px;width:${EL.w}px;height:${EL.h}px"><span class="tag-l">div · ${EL.w} × ${EL.h}${pin(2, 'pin-r')}</span></div>
        <span class="mgn" style="left:0;top:${FR.h / 2 - 9}px;width:${MARGIN}px">${MARGIN}</span><span class="mgn" style="left:${FR.w / 2 - 12}px;top:0;width:24px">${MARGIN}</span>
      </div>
      <div class="snap-tag" style="left:${EL.x + 6}px;top:${EL.y + 44}px;z-index:7">${I('chevron-up')}<b style="margin:0 3px">↑ ×3</b>价格行 › 卡片 › 卡片列表 › 容器${pin(3, 'pin-b')}</div>
      <div class="shot-hint" style="top:auto;bottom:10px;gap:8px">${pin(4, 'pin-b')}边距 ${marginChip('0')}${marginChip('8')}${marginChip('16')}${marginChip('24', true)}${marginChip('32')}${marginChip('自定义…')}<span class="muted-2">·</span>${keys('↑')}${keys('↓')} 层级<span class="muted-2">·</span>${keys('Enter')} 确认</div></div>`,
    notes: [
      '悬停在卡片里的价格行上，按 <kbd>↑</kbd> 逐层选上一级：价格行 → 卡片 → 卡片列表 → 包含切换条与卡片的容器。<b>外框和下一层完全相同的层级会被跳过</b>，所以是 3 次，不是 4 次（实测见 market §4.5）。',
      '选中元素后，选区条上选<b>边距</b>：0 / 8 / 16 / 24 / 32 CSS 像素，也可以输入数值。取景框 = 元素外框向四周各外扩这个边距；标签写明“元素 + 24 px”，图中的虚线是元素自己的外框。',
      '边距里是元素周围<b>真实的页面</b>，每次都一样宽——这是手拖做不到的：起止点各差几个像素，三张图的尺寸就各不相同。',
      '选区条上的边距只在选中元素时出现；拖拽出来的自由选区没有元素，也就没有边距。比例预设（R2）与边距互不影响。',
    ],
  })

  // ─ 沿用上次取景框：三种状态同一个框
  const frameCrop = k => `<div style="width:${Math.round(FR.w * 0.4)}px;height:${Math.round(FR.h * 0.4)}px;overflow:hidden;border:1px solid var(--line-2);border-radius:6px;background:#fff"><div style="width:${FR.w}px;height:${FR.h}px;transform:scale(0.4);transform-origin:0 0;position:relative;overflow:hidden"><div style="position:absolute;left:${-FR.x}px;top:${-FR.y}px;width:760px;height:470px">${plansScene(k)}</div></div></div>`
  const miniShot = inner => `<div style="width:380px;height:235px;border-radius:10px;overflow:hidden"><div class="shot" style="width:760px;height:470px;transform:scale(0.5);transform-origin:0 0">${inner}</div></div>`
  const reuse = board({
    title: '沿用上次取景框 · 三种状态同一个框',
    ref: 'screenshot §1.4 · roadmap R3',
    tag: 'R3',
    w: 1180,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:flex;flex-direction:column;gap:20px">
      <div style="display:grid;grid-template-columns:380px 380px minmax(0,1fr);gap:20px;align-items:start">
        <div class="vs g8"><b class="t-sm">① 第一次：选中容器，边距 24，确认</b>
          ${miniShot(`${plansScene('m')}<div class="shot-sel" style="left:${FR.x}px;top:${FR.y}px;width:${FR.w}px;height:${FR.h}px"><span class="shot-size">${FR.w} × ${FR.h} · 元素 + ${MARGIN} px</span></div>`)}
          <div class="help">确认入库（或复制、下载）之后，这个取景框被记在<b>这个标签页的这个网页</b>里。</div></div>
        <div class="vs g8"><b class="t-sm">② 切到“包季”，再按截图快捷键</b>
          ${miniShot(`${plansScene('q')}<div class="shot-sel is-reuse" style="left:${FR.x}px;top:${FR.y}px;width:${FR.w}px;height:${FR.h}px"><span class="shot-size">${FR.w} × ${FR.h} · 上次取景框${pin(1, 'pin-r')}</span></div><div class="shot-hint" style="top:auto;bottom:10px;gap:8px">${pin(2, 'pin-b')}上次取景框 · 元素 + ${MARGIN} px ${keys('Enter')} 确认<span class="muted-2">·</span>拖拽或单击别处重新选</div>`)}
          <div class="help">它直接作为待确认的选区出现；<kbd>Enter</kbd> 进入原位编辑，拖拽或单击别处则换成新的。</div></div>
        <div class="vs g8"><b class="t-sm">记下的是什么</b>
          <div style="border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:6px 14px">
            ${statLine('锚点', '元素（不是屏幕位置）')}${statLine('边距', '24 px')}${statLine('尺寸', '688 × 400')}${statLine('范围', '这个标签页 · 这个网页')}
            <div class="help" style="padding:8px 0 6px">导航、关闭标签页或重启浏览器就清除；不写入条目、设置和导出。</div></div></div>
      </div>
      <div class="vs g8"><b class="t-sm">③ 三张输出</b>
        <div class="hs g16" style="align-items:flex-start">
          <div class="vs g4">${frameCrop('m')}<span class="t-xs muted">包月 · ${FR.w} × ${FR.h}</span></div>
          <div class="vs g4">${frameCrop('q')}<span class="t-xs muted">包季 · ${FR.w} × ${FR.h}</span></div>
          <div class="vs g4">${frameCrop('y')}<span class="t-xs muted">包年 · ${FR.w} × ${FR.h}</span></div>
          <div class="banner ok" style="flex:1;align-self:center">${I('circle-check')}<div>像素尺寸完全相同；只有切换条与价格文字不同，<b>边距环里没有差异</b>。${pin(3, 'pin-s')}</div></div></div></div>
    </div>`,
    notes: [
      '取景框记的是<b>元素</b>，不是屏幕位置：页面滚动了、窗口变了、内容刷新了，只要元素还在，取景框就跟着它走；沿用时页面自动滚动到让取景框完整落进窗口。',
      '“上次取景框”在确认入库、复制或下载之后才更新，取消不更新；导航到别的页面、关闭标签页、重启浏览器都会清掉，不写入条目、设置和导出。',
      '同一个取景框、同一个设备像素比，输出的像素尺寸相同：宽高由元素的宽高与边距决定，与元素在屏幕上的位置无关。截取前等待页面稳定，扩展的遮罩一出现，页面的悬停样式随之清掉。',
    ],
  })

  // ─ 依据与失败
  const cmp = (label, sizes, diff, ok) => `<tr><td style="width:210px"><b>${label}</b></td><td class="tnum" style="width:230px">${sizes}</td><td>${ok ? I('circle-check', 'i-sm c-ok') : I('circle-x', 'i-sm c-danger')} ${diff}</td></tr>`
  const evidence = board({
    title: '依据 · 一个真实套餐页上的三种取景方式，与两种失败',
    ref: 'market §4.5 · screenshot §1.4 · §5',
    tag: 'R3',
    w: 1100,
    body: `<div class="ui" style="padding:22px 26px 26px;background:var(--surface-2);display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:28px;align-items:start">
      <div class="vs g10"><b class="t-sm">同一个页面，三种状态各截一张（2026-10-08，Chromium 153，2 倍像素比）</b>
        <table class="sp-table" style="font-size:12.5px"><thead><tr><th>取景方式</th><th>三张图的像素尺寸</th><th>与第一张相比</th></tr></thead><tbody>
          ${cmp('元素 + 24 CSS 像素', '2496×1400 ×3', '只有切换条与价格不同；最外圈 48 像素环 <b>0</b> 个像素不同', true)}
          ${cmp('手动框选（±3 像素误差）', '2494×1392 · 2494×1390 · 2498×1402', '尺寸各不相同，无法逐像素对比', false)}
          ${cmp('记住屏幕矩形，页面多滚了 37 像素', '2496×1400 ×3', '<b>41%</b> 的像素不同，边距环里 18,163 个像素不同', false)}</tbody></table>
        <div class="help">页面切换周期时价格就地更新，切换条、卡片列表与三张卡片还是同一批节点，外框恒为 1200×652，没有过渡动画；所以元素能做锚点（market §4.5）。</div></div>
      <div class="vs g12"><b class="t-sm">失败与降级</b>
        <div class="vs g6"><span class="t-xs muted">找不到上次的元素，或它的大小相差超过 10%</span>${banner('warn', '<b>没找到上次的元素</b>，已沿用上次的位置和尺寸（688 × 400）。', { action: btn('重新选择', { sm: true }) + btn('确认 ↵', { sm: true, v: 'primary' }) })}</div>
        <div class="vs g6"><span class="t-xs muted">取景框比窗口大</span>${banner('danger', '<b>取景框比窗口大</b>（688 × 820）。减小边距，或缩小浏览器的页面缩放。', { action: btn('边距 0', { sm: true }) })}</div>
        <div class="help">取景框里若压着页面固定定位的浮层（客服挂件、吸顶导航），它们会像在页面上一样入图；预览里能看到。</div></div>
    </div>`,
    notes: ['三行对比用同一个真实页面、同一个窗口大小、同一个设备像素比；手动框选的误差取 ±3 CSS 像素，是认真拖时的常见量级。', '“记住屏幕矩形”是桌面截图工具的做法（CleanShot X 的 All-In-One 模式会保存上一次的选区）；在浏览器里，页面一滚动，同一个屏幕矩形框住的就是另一块内容。'],
  })

  const keysBoard = board({
    title: '手势与按键对照',
    ref: 'screenshot §1.2 · roadmap R3',
    tag: 'R3',
    w: 760,
    body: `<div style="padding:22px 24px 22px"><table class="sp-table"><thead><tr><th style="width:200px">手势 / 按键</th><th>效果</th></tr></thead><tbody>
      <tr><td>拖拽</td><td>对光标下的元素边缘实时吸附，起止点可吸附到元素矩形</td></tr>
      <tr><td>单击</td><td>选择整个元素；与吸附共存、互不冲突</td></tr>
      <tr><td>悬停时 ${keys('↑')} ${keys('↓')}</td><td>选上一级 / 回到下一级，跳过外框相同的层级</td></tr>
      <tr><td>边距</td><td>选中元素后，在选区条上选 0 / 8 / 16 / 24 / 32 像素或自定义</td></tr>
      <tr><td>八向手柄</td><td>确认前拖拽二次调边</td></tr>
      <tr><td>${keys('←', '→', '↑', '↓')}</td><td>微调选区 1 像素</td></tr>
      <tr><td>${keys('Shift')} + 方向键</td><td>每次微调 10 像素</td></tr>
      <tr><td>拖拽中按住 ${keys('Shift')}</td><td>临时锁定当前比例，松开即解除（预设比例的锁定在 R2）</td></tr>
      <tr><td>${keys('↵')} / ${keys('Esc')}</td><td>确认选区（含“上次取景框”）/ 取消会话</td></tr></tbody></table>
      <div class="banner brand" style="margin-top:16px">${I('shield-check')}<div><b>验收</b>：吸附、手柄与微调在普通页面和 SPA 页面都可用，与单击元素截图共存不冲突；<kbd>Shift</kbd> 锁定比例下拖拽始终输出当前比例。</div></div></div>`,
    notes: ['精确选区只改变“怎么框”，不改变后面的流程：确认后仍进入同一套原位编辑、匿名与保存（screenshot §1.1）。'],
  })

  return group(
    { id: 'ext-shot-r3', title: '精确选区与可重复的取景框 · R3', small: 'screenshot §1.2 · roadmap R3', desc: '截图选区的精度改进，惠及所有截图用户；阶段 V 之后排期。预设比例的锁定在 R2（见“截图输出”），这里只有拖拽中按住 Shift 的临时锁定。' },
    row(snap, handles),
    row(frameBoard, keysBoard),
    row(reuse),
    row(evidence),
  )
}

// ── 截图输出：复制、下载格式、比例预设、品牌水印、极简美化 ──────────────────────────
function extShotOutGroup() {
  const selection = `<div class="shot-sel" style="left:52px;top:62px;width:656px;height:332px"><span class="shot-size">656 × 332</span></div>`

  // ─ 复制与下载：成功、http 页面、剪贴板被拒、下载
  const miniTb = (o = {}) => `<div class="shot-tb" style="right:10px;top:10px">
    <span class="tb-b ${o.copied ? 'copied' : ''} ${o.copyOff ? 'off' : ''}" title="复制">${I(o.copied ? 'clipboard-check' : 'clipboard-copy')}</span><span class="tb-b ${o.dl ? 'on' : ''}" title="下载">${I('download')}</span>${o.pin ? pin(o.pin, 'pin-b') : ''}</div>`
  const frame = (inner, h = 250) => `<div class="shot" style="height:${h}px;border-radius:12px"><div class="dim"></div>
    <div style="position:absolute;z-index:6;left:12px;right:12px;top:58px;background:#fff;border-radius:8px;padding:8px;height:84px;overflow:hidden"><div style="height:68px;background:#f3f4f8;border-radius:6px;position:relative"><div class="ann ann-rect" style="left:22px;top:14px;width:70px;height:34px;border-width:2px"></div><div class="mosaic" style="left:110px;top:14px;width:46px;height:14px"></div></div></div>${inner}</div>`
  const outputs = board({
    title: '复制与下载 · 成功与失败',
    ref: 'screenshot §4.2 · §5 · permissions §4',
    tag: 'R1 · R2',
    w: 1160,
    body: `<div style="padding:18px;background:var(--surface-2);display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
      <div class="vs g8"><b class="t-sm">复制成功</b>
        ${frame(`${miniTb({ copied: true, pin: 1 })}<div style="position:absolute;z-index:9;left:0;right:0;bottom:12px;display:grid;place-items:center">${toast('已复制 · 可直接粘贴', { icon: 'clipboard-check' })}</div>`)}
        <div class="help">PNG 写进剪贴板，会话继续，可以接着下载或确认入库。</div></div>
      <div class="vs g8"><b class="t-sm">http 页面：不能复制</b>
        ${frame(`${miniTb({ copyOff: true })}<div class="tip" style="position:absolute;z-index:9;right:6px;top:52px">${pin(2, 'pin-l')}此页面是 http，不能复制<small>浏览器不开放剪贴板接口</small></div><div style="position:absolute;z-index:9;left:10px;right:10px;bottom:10px">${banner('info', '可以下载，或在 https 页面上复制。', { action: btn('改为下载', { sm: true, v: 'primary' }) })}</div>`)}
        <div class="help">按钮置灰并说明原因，下载照常可用。</div></div>
      <div class="vs g8"><b class="t-sm">复制失败：剪贴板被拒</b>
        ${frame(`${miniTb({})}<div style="position:absolute;z-index:9;left:10px;right:10px;bottom:10px">${banner('danger', '<b>没有复制成功</b>。图片与标注都在。', { action: btn('重试', { sm: true }) + btn('改为下载', { sm: true, v: 'primary' }) })}</div>`)}
        <div class="help">被拒或窗口没有焦点：保留画布，给出原因与出路。</div></div>
      <div class="vs g8"><b class="t-sm">下载：按设置的格式</b>
        ${frame(`${miniTb({ dl: true, pin: 3 })}<div style="position:absolute;z-index:9;left:0;right:0;bottom:12px;display:grid;place-items:center">${toast('已下载 · <span class="act">screenshot-1030.webp</span>', { icon: 'download' })}</div>`)}
        <div class="help">JPEG 与 WebP 有质量；复制总是 PNG，入库也总是 PNG。</div></div>
    </div>`,
    notes: [
      '“复制”发生在用户点击之后，由页面里的脚本直接把 PNG 写进剪贴板，<b>不需要 <code>clipboardWrite</code> 权限</b>（permissions §4）；快捷键 <kbd>Ctrl/⌘+C</kbd> 等价。我们在 Chromium 153 里验证过：https 页面与本机地址可以，<code>http:</code> 页面没有剪贴板接口（market §4.4）。',
      '复制、下载、入库是三个互相独立的动作：复制或下载失败不影响入库，入库失败也不影响已经成功的复制或下载；任何一个失败都保留图片与全部标注。',
      '下载的文件名是 <code>AnnHub/screenshot-&lt;时间&gt;.&lt;扩展名&gt;</code>，格式取自设置里的“下载格式”。',
    ],
  })

  // ─ 比例预设
  const ratio = board({
    title: '比例预设 · 先选比例再拖拽',
    ref: 'screenshot §1.3',
    tag: 'R2',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:92px;top:92px;width:576px;height:324px"><span class="shot-size">576 × 324 · 16:9 ${I('lock-keyhole', 'i-sm')}${pin(1, 'pin-r')}</span></div>
      <div class="shot-hint" style="gap:8px">${pin(2, 'pin-b')}比例 ${ratioChip('自由')}${ratioChip('1:1', 1, 1)}${ratioChip('4:5', 4, 5)}${ratioChip('3:4', 3, 4)}${ratioChip('16:9', 16, 9, { on: true })}<span class="muted-2">·</span><kbd>Esc</kbd> 取消</div></div>`,
    notes: [
      '尺寸标签同时给出像素与比例，并带锁形图标；锁定后拖拽始终输出目标比例，选区被夹在视口内。',
      '选区条上列出“自由”和<b>设置里启用的</b>比例（默认 1:1、4:5、3:4、16:9；可选还有 4:3、9:16）。点一个即锁定，再点“自由”解除；每次截图从“自由”开始。',
      '预设只约束选区的形状，<b>不预设像素大小</b>：截多大取决于页面，输出始终是选区的真实像素。单击元素的路径不受影响；R3 起拖拽中还可以按住 <kbd>Shift</kbd> 临时锁定当前比例。',
    ],
  })

  // ─ 品牌水印
  const wmEdit = board({
    title: '品牌水印 · 编辑时可见，复制与下载带上',
    ref: 'screenshot §4.3 · extension §2.5',
    tag: 'R2',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      ${selection}
      <div class="wm" style="left:526px;top:358px">${pin(1, 'pin-l')}<span class="wm-logo">${I('logo')}</span>@annhub_demo</div>
      ${shotToolbar({ tool: 'rect', pins: 2, beautify: 'off', style: 'right:20px;top:392px' })}
      <div class="shot-hint" style="top:auto;bottom:12px;left:24px;transform:none;z-index:8"><span class="st">${I('eye-off')}匿名 开 <kbd>A</kbd></span><span class="muted-2">·</span><span class="st">${I('stamp')}水印 开 <kbd>W</kbd></span>${pin(3, 'pin-b')}</div></div>`,
    notes: [
      '设置里启用水印后，编辑界面里就能看到它（默认右下角，四角可选）。位置不可拖动；位置、大小、透明度都在设置里调（见“设置”画板）。',
      '工具栏里的<b>复制、下载</b>输出的图片带水印；<b>入库的图片不带</b>（见右侧）。',
      '底部状态条：<kbd>A</kbd> 切换匿名，<kbd>W</kbd> 切换水印，只影响这一次截图。水印画在最上一层，不参与匿名与马赛克，也不进撤销栈。',
    ],
  })

  const thumb = (wm, note) => `<div style="position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff">${chartWide()}${wm ? `<div class="wm" style="right:4px;bottom:4px;font-size:10px;padding:1px 4px"><span class="wm-logo" style="width:14px;height:14px;border-radius:4px">${I('logo')}</span>@annhub_demo</div>` : ''}</div><div class="help">${note}</div>`
  const col = (icon, title, sub, wm, note) => `<div class="vs g8"><div class="hs g6"><span class="chip">${I(icon)}${title}</span></div><div class="t-xs muted">${sub}</div>${thumb(wm, note)}</div>`
  const wmOut = board({
    title: '同一张截图 · 三个去处的区别',
    ref: 'screenshot §4.1 · §4.2 · §4.3',
    tag: 'R2',
    w: 760,
    body: `<div style="padding:22px 24px 24px;background:var(--surface-2);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start">
      ${col('clipboard-copy', '复制', 'PNG · 带水印', true, '粘贴到文档、聊天或设计工具。')}
      ${col('download', '下载', '设置里选的格式 · 带水印', true, 'PNG、JPEG 或 WebP；文件名随格式。')}
      ${col('library', '入库', 'PNG · 不带水印', false, '资料库里的截图条目；重新下载得到的也是它。')}
    </div>`,
    notes: ['水印是对外分享时的署名，不是资料的一部分，所以只加在复制与下载的图片上。需要署名的人每次分享都有，入库的资料始终干净（screenshot §4.1）。'],
  })

  // ─ 极简美化（R2）
  const swatch = (bg, on, cls = '') => `<i class="bz-sw ${cls} ${on ? 'on' : ''}" style="${bg ? `background:${bg}` : ''}">${cls === 'none' ? I('ban') : ''}</i>`
  const panel = `<div class="bz" style="left:488px;top:24px">${pin(2, 'pin-in-r')}
      <div class="bz-hd">${I('palette')}美化<span class="grow" style="flex:1"></span><span style="font-weight:500;color:#aab1c3">复原</span></div>
      <div class="bz-sec"><div class="bz-lb">背景</div><div class="bz-sws">
        ${swatch('', false, 'none')}${swatch('#ffffff', false)}${swatch('#1f2430', false)}${swatch('linear-gradient(135deg,#7c5cff,#e56bb6)', true)}${swatch('linear-gradient(135deg,#22c4d6,#3b6fe0)', false)}${swatch('linear-gradient(135deg,#ffb86b,#ff6b8b)', false)}${swatch('linear-gradient(135deg,#7ee8a2,#2ea6a0)', false)}${swatch('linear-gradient(135deg,#d8dce6,#f3f4f8)', false)}</div></div>
      <div class="bz-sec"><div class="bz-row"><span>内边距</span><span class="bz-seg"><span>小</span><span class="on">中</span><span>大</span></span></div></div>
      <div class="bz-sec"><div class="bz-row"><span>圆角</span><span class="bz-seg"><span>0</span><span class="on">12</span><span>24</span></span></div></div>
      <div class="bz-sec"><div class="bz-row"><span>阴影</span>${sw(true)}</div></div>
      <div class="bz-sec"><div class="bz-lb">输出画布比例</div><div class="hs g6 wrap">${ratioChip('自由')}${ratioChip('1:1', 1, 1)}${ratioChip('4:5', 4, 5)}${ratioChip('16:9', 16, 9, { on: true })}</div></div>
    </div>`
  const chartCard = `<div style="padding:9px 14px 4px;font:600 11.5px var(--font-ui);color:#26241f">downstream p99 (ms)</div>${chartWide()}`
  const beautify = board({
    title: '美化面板 · 背景、留白、圆角、阴影、画布比例',
    ref: 'screenshot §4.4',
    tag: 'R2',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}<div class="dim"></div>
      <div class="bz-canvas" style="z-index:5;left:22px;top:24px;width:450px;height:253px;border-radius:12px;background:linear-gradient(135deg,#7c5cff,#e56bb6)">${pin(1, 'pin-in')}
        <div class="bz-img" style="width:366px;border-radius:10px;box-shadow:0 22px 44px -14px rgb(0 0 0 / 0.5)">${chartCard}</div></div>
      <div class="shot-hint" style="left:247px;top:292px;z-index:8;font-size:11.5px">输出画布 16:9 · 内容等比完整置入，留白画在背景上</div>
      ${panel}
      ${shotToolbar({ beautify: 'on', style: 'right:14px;top:410px', pins: 3 })}</div>`,
    notes: [
      '美化是工具栏上的一个面板：背景（无、纯色 2 款、渐变 5 款，共 8 款）、内边距（小、中、大）、圆角、阴影，以及<b>输出画布比例</b>——沿用比例预设，内容等比完整置入，留白画在背景上，不裁切内容。',
      '美化是输出样式，和水印一样<b>只作用于复制与下载</b>，入库的图片保持原样；参数是面板的即时状态，可“复原”，不进标注撤销栈。默认是否开启与初始样式在设置里。',
      '不做设备外框、模板、文案卡和自动平衡：那是设计工具这一档（Pika、Shots），不是资料工具（market §4.4、product §2.3）。',
    ],
  })

  const outFrame = (w, h, bg, label) => `<div class="vs g6" style="align-items:center"><div class="bz-out" style="width:${w}px;height:${h}px;background:${bg}"><div class="bz-img" style="width:${Math.round(w * 0.78)}px;border-radius:8px;box-shadow:0 14px 28px -10px rgb(0 0 0 / 0.5)">${chartWide()}</div></div><span class="t-xs muted">${label}</span></div>`
  const beautifyOut = board({
    title: '美化 · 同一张图的三种输出比例',
    ref: 'screenshot §4.4',
    tag: 'R2',
    w: 760,
    body: `<div style="padding:24px 28px 26px;background:var(--surface-2);display:flex;gap:26px;align-items:flex-end;justify-content:center">
      ${outFrame(300, 169, 'linear-gradient(135deg,#7c5cff,#e56bb6)', '16:9 · 文档、幻灯片、X')}
      ${outFrame(160, 200, 'linear-gradient(135deg,#22c4d6,#3b6fe0)', '4:5 · Instagram、小红书')}
      ${outFrame(180, 180, 'linear-gradient(135deg,#ffb86b,#ff6b8b)', '1:1 · 聊天、头像')}
    </div>`,
    notes: ['画布比例沿用“比例预设”里启用的那几种：想要哪个，在设置里勾上。同一张截图按不同比例输出时，内容都是完整的，留白画在背景上。', '没有把任何平台的像素尺寸写死：大小取决于截图本身，只约束比例。'],
  })

  return group(
    { id: 'ext-shot-out', title: '截图输出：复制、格式、比例、水印', small: 'screenshot §1.3 · §4', desc: '复制到剪贴板（R1），以及设置里的下载格式、品牌水印、比例预设与极简美化（R2）。水印与美化只加在复制与下载的图片上，入库的图片保持原样。' },
    row(outputs),
    row(ratio, wmEdit),
    row(wmOut),
    row(beautify, beautifyOut),
  )
}
