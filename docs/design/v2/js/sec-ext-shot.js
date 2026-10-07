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
  <span class="tb-b" title="撤销">${I('undo-2')}</span><span class="tb-b" title="下载">${I('download')}</span>
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
    notes: ['快捷键 <b>Ctrl/⌘+Shift+S</b> 进入：页面变暗，拖拽时选区保持明亮，显示<b>蓝色边框和像素尺寸</b>。', '拖拽选区、单击选元素共用同一入口；顶部提示条说明手势和快捷键，进入编辑后消失。', '精确选区（吸附、八向手柄、方向键微调、比例锁定、确认选区）属于 R3，阶段 V 之后排期，设计见下方“精确选区”。'],
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
      '<b>浮动工具栏贴近选区右下角</b>，空间不足时移到上方并约束在视口内；窄视口可横向滚动，不遮住“确认 / 取消”。工具：矩形、椭圆、箭头、画笔、马赛克、文字，五色，撤销（只撤销人工标注）、下载、取消、确认。',
      '“确认”把图片保存为一条 <code>screenshot</code> 条目，出现在资料库的“截图”视图；“下载”和“入库”是两个独立动作，下载后会话继续保留。',
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

  const ratio = board({
    title: '比例锁定 · Shift 或预设比例',
    ref: 'screenshot §1.2 · roadmap R3 · US-CAP-10',
    tag: 'R3',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:92px;top:92px;width:576px;height:324px">${selHandles()}<span class="shot-size">576 × 324 · 16:9 ${I('lock-keyhole', 'i-sm')}${pin(1, 'pin-r')}</span></div>
      <div class="shot-hint" style="gap:8px">${pin(2, 'pin-b')}比例 ${ratioChip('自由')}${ratioChip('1:1', 1, 1)}${ratioChip('3:4', 3, 4)}${ratioChip('4:5', 4, 5)}${ratioChip('16:9', 16, 9, { on: true })}<span class="muted-2">·</span>拖拽中按住 <kbd>Shift</kbd> 临时锁定</div></div>`,
    notes: ['尺寸标签同时给出像素与比例，并带锁形图标；锁定后拖拽始终输出目标比例。', '顶部提示条里的预设比例：自由 / 1:1 / 3:4 / 4:5 / 16:9。点选即锁定，再点“自由”解除；拖拽中按住 <b>Shift</b> 临时锁定当前比例，松开即解除。'],
  })

  const keysBoard = board({
    title: '手势与按键对照',
    ref: 'screenshot §1.2 · roadmap R3',
    tag: 'R3',
    w: 760,
    body: `<div style="padding:22px 24px 22px"><table class="sp-table"><thead><tr><th style="width:200px">手势 / 按键</th><th>效果</th></tr></thead><tbody>
      <tr><td>拖拽</td><td>对光标下的元素边缘实时吸附，起止点可吸附到元素矩形</td></tr>
      <tr><td>单击</td><td>选择整个元素；与吸附共存、互不冲突</td></tr>
      <tr><td>八向手柄</td><td>确认前拖拽二次调边</td></tr>
      <tr><td>${keys('←', '→', '↑', '↓')}</td><td>微调选区 1 像素</td></tr>
      <tr><td>${keys('Shift')} + 方向键</td><td>每次微调 10 像素</td></tr>
      <tr><td>拖拽中按住 ${keys('Shift')}</td><td>临时锁定当前比例</td></tr>
      <tr><td>比例预设</td><td>1:1 · 3:4 · 4:5 · 16:9；锁定后拖拽始终输出目标比例</td></tr>
      <tr><td>${keys('↵')} / ${keys('Esc')}</td><td>确认选区 / 取消会话</td></tr></tbody></table>
      <div class="banner brand" style="margin-top:16px">${I('shield-check')}<div><b>验收</b>：吸附、手柄与微调在普通页面和 SPA 页面都可用，与单击元素截图共存不冲突；比例锁定下拖拽始终输出目标比例。</div></div></div>`,
    notes: ['精确选区只改变“怎么框”，不改变后面的流程：确认后仍进入同一套原位编辑、匿名与保存（screenshot §1.1）。'],
  })

  return group(
    { id: 'ext-shot-r3', title: '精确选区 · R3', small: 'screenshot §1.2 · roadmap R3', desc: '截图选区的精度改进，惠及所有截图用户；阶段 V 之后排期。美化、品牌水印、下载格式与尺寸预设已由 D-18 移出范围，这里没有它们的入口。' },
    row(snap, handles),
    row(ratio, keysBoard),
  )
}
