// 浏览器扩展 · 截图增强（R5）：R5.3 精确选区；R5.1 美化与品牌；R5.2 导出增强。
// 依据 screenshot.md §1.1–§1.2、§4 与 roadmap R5。R5.3 在阶段 V 之后排期；R5.1、R5.2 后置，以 H-14 为门槛，
// 它们是同一个编辑器的像素处理增强，不是社交分享：没有任何平台上传或账号操作。

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

// R5 的完整工具栏：R1 的标注工具之外，多了美化 / 品牌（R5.1）与复制 / 下载格式（R5.2）
const shotToolbarR5 = (o = {}) => `<div class="shot-tb" style="${o.style || 'right:28px;top:408px'}">
  <span class="tb-b">${I('square')}</span><span class="tb-b">${I('circle')}</span><span class="tb-b">${I('move-up-right')}</span><span class="tb-b">${I('pencil')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b">${I('grid-3x3')}</span><span class="tb-b">${I('type')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b">${I('undo-2')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b txt ${o.panel === 'beautify' ? 'on' : ''}">${I('palette')}美化</span><span class="tb-b txt ${o.panel === 'brand' ? 'on' : ''}">${I('stamp')}品牌</span>
  <i class="tb-sep"></i>
  <span class="tb-b txt ${o.copy ? 'on' : ''}">${I('clipboard-copy')}复制${o.pinCopy ? pin(o.pinCopy, 'pin-b') : ''}</span><span class="tb-b txt ${o.dl ? 'on' : ''}">${I('download')}下载${I('chevron-down', 'i-sm')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b">${I('x')}</span><span class="tb-ok">${I('check')}</span>
</div>`

// 被截取的图表：美化预览里放在衬底中央
const bzImage = w => `<div class="bz-img" style="width:${w}px;border-radius:9px;box-shadow:0 10px 24px -8px rgb(40 20 80 / 0.5)">${chartWide()}<div class="cap">Figure 2 · downstream p99 latency during the retry storm</div></div>`

const bzSlider = (label, pct, val, cols) => `<div class="bz-sl" ${cols ? `style="grid-template-columns:${cols}"` : ''}><span>${label}</span><div class="slider"><i style="width:${pct}%"></i><b style="left:${pct}%"></b></div><span class="bz-val">${val}</span></div>`

function extShotR5Group() {
  // ── R5.3 精确选区 ────────────────────────────────────────────────────────
  const snap = board({
    title: '拖拽吸附 · 元素边缘',
    ref: 'screenshot §1.1 · roadmap R5.3 · US-CAP-10',
    tag: 'R5.3',
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
      '尺寸标签照常显示最终像素。吸附只发生在拖拽中，单击选择整个元素的手势不变，两者共存互不冲突（roadmap R5.3 验收）。',
    ],
  })

  const handles = board({
    title: '八向手柄 · 方向键微调 · 确认选区',
    ref: 'screenshot §1.1 · roadmap R5.3 · US-CAP-10',
    tag: 'R5.3',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:52px;top:84px;width:656px;height:310px">${selHandles()}<span class="shot-size">656 × 310${pin(1, 'pin-r')}</span></div>
      <div class="snap-tag" style="left:606px;top:232px">${pin(2, 'pin-l')}→ 1 px</div>
      <div class="shot-tb" style="right:52px;top:410px"><span class="tb-b">${I('x')}</span><span class="tb-ok txt">${I('check')}确认选区 <kbd>↵</kbd>${pin(3, 'pin-b')}</span></div>
      <div class="shot-hint">拖拽手柄调整边缘 <span class="muted-2">·</span> ${keys('←', '→', '↑', '↓')} 微调 1 px <span class="muted-2">·</span> ${keys('Shift')} + 方向键 10 px <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div></div>`,
    notes: [
      '确认前选区显示<b>八向手柄</b>（四角与四边中点），可拖拽二次调边；尺寸标签随调整实时更新，像素值始终是最终输出。',
      '方向键微调 1 像素，配合 Shift 每次 10 像素；微调时选区边旁显示方向与位移，便于对齐。',
      '<b>确认选区</b>：松开鼠标后选区保持可调，旁边出现“确认选区 ↵ / 取消”，Enter 或点击确认后才进入原位编辑，Esc 取消会话。单击元素的路径不变，直接进入原位编辑（screenshot §1.1）。',
    ],
  })

  const ratio = board({
    title: '比例锁定 · Shift 或预设比例',
    ref: 'screenshot §1.1 · roadmap R5.3 · US-CAP-10',
    tag: 'R5.3',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:92px;top:92px;width:576px;height:324px">${selHandles()}<span class="shot-size">576 × 324 · 16:9 ${I('lock-keyhole', 'i-sm')}${pin(1, 'pin-r')}</span></div>
      <div class="shot-hint" style="gap:8px">${pin(2, 'pin-b')}比例 ${ratioChip('自由')}${ratioChip('1:1', 1, 1)}${ratioChip('3:4', 3, 4)}${ratioChip('4:5', 4, 5)}${ratioChip('16:9', 16, 9, { on: true })}<span class="muted-2">·</span>拖拽中按住 <kbd>Shift</kbd> 临时锁定</div></div>`,
    notes: [
      '尺寸标签同时给出像素与比例，并带锁形图标；锁定后拖拽始终输出目标比例。',
      '顶部提示条里的预设比例：自由 / 1:1 / 3:4 / 4:5 / 16:9。点选即锁定，再点“自由”解除；拖拽中按住 <b>Shift</b> 临时锁定当前比例，松开即解除。',
    ],
  })

  const keysBoard = board({
    title: '手势与按键对照',
    ref: 'screenshot §1.1 · roadmap R5.3',
    tag: 'R5.3',
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

  // ── R5.1 美化与品牌 ──────────────────────────────────────────────────────
  const canvasBg = 'linear-gradient(140deg,#c5b3f4 0%,#f2b8d9 100%)'
  const beautify = board({
    title: '美化 · 衬底、内边距、圆角与输出比例',
    ref: 'screenshot §1.2 · §2 · roadmap R5.1 · US-CAP-09',
    tag: 'R5.1 · 后置',
    w: 760,
    body: `<div class="shot" style="height:520px">${shotScene()}<div class="dim" style="background:rgb(10 14 25 / 0.68)"></div>
      <div class="bz-tag" style="left:44px;top:16px">预览 29% · 输出 1080 × 1440${pin(1, 'pin-r')}</div>
      <div class="bz-canvas" style="left:44px;top:44px;width:309px;height:412px;background:${canvasBg}">${bzImage(257)}${pin(2, 'pin-in')}</div>
      <div class="bz-panel" style="left:424px;top:20px">${pin(3, 'pin-r')}
        <div class="bz-hd">${I('palette')}美化<span class="grow"></span>${btn('复原', { sm: true, v: 'ghost' })}</div>
        <div class="bz-sec"><div class="bz-lb">背景</div>
          <span class="seg" style="justify-self:start"><span>无</span><span>纯色</span><span class="on">渐变</span></span>
          <div class="bz-sw"><i class="on" style="background:${canvasBg}"></i><i style="background:linear-gradient(140deg,#a8d8f0,#b7f0d0)"></i><i style="background:linear-gradient(140deg,#ffd6a5,#ffadad)"></i><i style="background:#1b1f2a"></i><i style="background:#f4f1ea"></i><i style="background:#e9edf5"></i><span class="chip" style="margin-left:2px">${I('pipette')}自定义</span></div></div>
        <div class="bz-sec"><div class="bz-lb">内容</div>
          ${bzSlider('内边距', 40, '48 px')}${bzSlider('圆角', 25, '16 px')}
          <div class="bz-row"><span>细边框</span>${sw(false)}</div><div class="bz-row"><span>柔和阴影</span>${sw(true)}</div></div>
        <div class="bz-sec" style="position:relative">${pin(4, 'pin-r')}<div class="bz-lb">输出</div>
          <span class="seg" style="justify-self:start"><span>原始</span><span>1:1</span><span class="on">3:4</span><span>4:5</span><span>16:9</span></span>
          <div class="bz-row"><span>尺寸预设 <span class="cv-tag">R5.2</span></span>${select('小红书 3:4 · 1080×1440', { style: 'min-height:26px;width:176px;font-size:12px' })}</div></div>
        <div class="t-xs muted">预览按比例缩小，保存完整像素；参数即时生效，不进入标注撤销栈。</div>
      </div>
      ${shotToolbarR5({ panel: 'beautify', style: 'right:20px;bottom:14px' })}</div>`,
    notes: [
      '预览标签说明缩放：画布超出视口时按比例缩小预览，但保存的是完整像素（1080 × 1440）。',
      '启用衬底后，画布在原选区之外扩展出背景、内边距、圆角与阴影；<b>非原始比例时内容等比完整置入</b>，留白画在衬底上，不裁切内容。',
      '美化是浮动工具栏上的面板：参数即时生效、可“复原”，<b>不进入标注撤销栈</b>；关闭面板后所有行为与 R1 截图链路一致。',
      '输出比例：原始 / 1:1 / 3:4 / 4:5 / 16:9。平台“尺寸预设”（R5.2）只约束输出尺寸，放在“输出”区、比例选择的下面（screenshot §1.2 · §4）。',
    ],
  })

  const brand = board({
    title: '品牌 · 水印、LOGO 与预设',
    ref: 'screenshot §1.2 · §5 · roadmap R5.1 · US-CAP-09',
    tag: 'R5.1 · 后置',
    w: 760,
    body: `<div class="shot" style="height:520px">${shotScene()}<div class="dim" style="background:rgb(10 14 25 / 0.68)"></div>
      <div class="bz-tag" style="left:44px;top:16px">预览 29% · 输出 1080 × 1440</div>
      <div class="bz-canvas" style="left:44px;top:44px;width:309px;height:412px;background:${canvasBg}">${bzImage(257)}
        <div class="bz-wm" style="left:18px;bottom:16px;opacity:0.92"><span class="bz-logo">N</span></div>
        <div class="bz-wm" style="right:18px;bottom:19px;opacity:0.7">@annhub · 工程笔记</div></div>
      <div class="bz-panel" style="left:424px;top:20px">
        <div class="bz-hd">${I('stamp')}品牌<span class="grow"></span>${btn('保存为预设…', { sm: true })}</div>
        <div class="bz-sec" style="position:relative">${pin(1, 'pin-r')}<div class="bz-lb">品牌预设</div>
          <div class="hs g6 wrap">${chip('小红书封面', { icon: 'circle-check', v: 'brand' })}${chip('X 配图')}${chip('无水印')}</div>
          <div class="t-xs muted">套用会整体替换衬底、比例、圆角与水印样式。</div></div>
        <div class="bz-sec" style="position:relative">${pin(2, 'pin-r')}<div class="bz-lb">文字水印</div>
          ${input('@annhub · 工程笔记', { style: 'min-height:28px;font-size:12px' })}${bzSlider('字号', 30, '13 px')}</div>
        <div class="bz-sec" style="position:relative">${pin(3, 'pin-r')}<div class="bz-lb">LOGO 图章</div>
          <div class="bz-row"><span class="hs g8"><span class="bz-logo">N</span><span>logo.png · 38 KB</span></span>${sw(true)}</div>
          <div class="t-xs muted">LOGO 在设置页上传，仅存扩展本地。<span class="link">去设置</span></div></div>
        <div class="bz-sec" style="position:relative">${pin(4, 'pin-r')}<div class="bz-lb">位置</div>
          <div class="hs g12 top"><div class="pos9"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i class="on"></i></div>
            <div class="vs g8 grow">${bzSlider('边距', 25, '20 px', '38px 1fr 40px')}${bzSlider('不透明', 70, '70%', '38px 1fr 40px')}</div></div></div>
      </div>
      ${shotToolbarR5({ panel: 'brand', style: 'right:20px;bottom:14px' })}</div>`,
    notes: [
      '<b>品牌预设</b>把衬底、比例、圆角与水印样式整体存为命名预设，一键套用，可保存多个；“保存为预设…”保存当前参数。',
      '<b>文字水印</b>：自定义文案（账号名或一句话），字号与不透明度可调；水印画在最终合成层，<b>不参与匿名与马赛克</b>。',
      '<b>LOGO 图章</b>：素材在设置页上传（PNG，不超过 512 KB），只存在扩展本地，不进入学习记录、不跨端同步、不外发。',
      '<b>位置</b>用九宫格选四角或边中，另可调边距与不透明度。',
    ],
  })

  const logoBody = `<div class="hs g16 top"><div class="logo-tile"><span class="bz-logo">N</span></div>
    <div class="grow vs g4"><div class="b t-md">logo.png</div><div class="help">PNG · 38 KB · 不超过 512 KB</div></div>
    <div class="hs g6 none">${btn('更换', { sm: true, icon: 'upload' })}${btn('移除', { sm: true, v: 'ghost' })}</div></div>`
  const presetRow = (name, chips) => `<div class="preset-row"><div><div class="b t-md">${name}</div><div class="hs g4 wrap" style="margin-top:5px">${chips.map(c => chip(c)).join('')}</div></div><div class="hs g6">${btn('重命名', { sm: true, v: 'ghost' })}${btn('删除', { sm: true, v: 'ghost' })}</div></div>`
  const presetBody = `<div style="margin-top:-6px">${presetRow('小红书封面', ['渐变 · 紫粉', '3:4', '圆角 16', '水印 · 右下'])}${presetRow('X 配图', ['纯色 · 浅灰', '16:9', '圆角 12', '水印 · 左下'])}${presetRow('无水印', ['渐变 · 蓝绿', '原始', '圆角 8'])}</div>`
  const brandSettings = board({
    title: '设置 · 截图品牌',
    ref: 'screenshot §1.2 · §5 · roadmap R5.1',
    tag: 'R5.1 · 后置',
    w: 760,
    body: extPage(
      `<div class="xp-main" style="width:auto;margin:0 28px"><div class="hs g8 t-sm" style="margin-bottom:12px"><span class="link hs g4">${I('arrow-left', 'i-sm')}设置</span><span class="muted">/</span><b>截图品牌</b></div>
        <div class="vs g14">
          ${settingCard('LOGO 图章', '在截图编辑器的“品牌”面板里作为图章使用。素材只存在这台电脑的扩展里，不进入学习记录、不跨端同步、不外发。', logoBody, { pin: 1 })}
          ${settingCard('品牌预设', '把衬底、比例、圆角与水印样式整体存为命名预设；在编辑器的“品牌”面板里套用或保存。', presetBody, { pin: 2, right: '<span class="t-xs muted">已保存 3 个</span>' })}
        </div></div>`,
      { tab: 'set', h: 700 },
    ),
    notes: [
      '设置页新增“截图品牌”一节：LOGO 在这里上传、更换、移除（PNG，不超过 512 KB），只存扩展本地（screenshot §1.2）。',
      '品牌预设在这里重命名、删除；编辑器的“品牌”面板里只负责套用与保存（screenshot §1.2）。',
    ],
  })

  const fails = board({
    title: '失败与降级 · LOGO · 预设 · 剪贴板',
    ref: 'screenshot §5 · roadmap R5.1 · R5.2',
    tag: 'R5.1 · R5.2',
    w: 760,
    body: `<div style="padding:22px 24px 22px;background:var(--surface-2);display:grid;gap:20px">
      <div class="vs g8"><b class="t-sm">LOGO 素材损坏或加载失败</b>
        <div class="dialog" style="padding:12px 14px;position:relative">${pin(1)}
          <div class="bz-row" style="margin-bottom:10px"><span class="hs g10"><span class="logo-tile" style="width:36px;height:36px;border-radius:8px">${I('image-off', 'muted')}</span><span class="b t-md">logo.png</span></span>${chip('加载失败', { icon: 'triangle-alert', v: 'warn' })}</div>
          ${banner('warn', '<b>LOGO 没能加载</b>，已按无 LOGO 继续编辑。请到设置里重新上传。', { action: btn('去设置', { sm: true }) })}</div>
        <div class="help">不阻塞截图会话；文字水印与其他参数照常可用。</div></div>
      <div class="vs g8"><b class="t-sm">品牌预设损坏或保存失败</b>
        <div class="dialog vs g8" style="padding:12px 14px;position:relative">${pin(2)}
          ${banner('warn', '<b>有 1 个预设已损坏</b>，已跳过并回到默认参数。其余预设不受影响。')}
          ${banner('danger', '<b>没有保存成功</b>：当前参数还在，可以重试。', { action: btn('重试', { sm: true, v: 'primary' }) })}</div>
        <div class="help">保存失败时保留当前参数，不显示“已保存”。</div></div>
      <div class="vs g8"><b class="t-sm">剪贴板写入失败</b>
        <div class="dialog" style="padding:12px 14px;position:relative">${pin(3)}
          ${banner('danger', '<b>没有复制成功</b>：浏览器拒绝了剪贴板权限，或页面没有焦点。画布与标注都在。', { action: btn('重试', { sm: true }) + btn('改为下载', { sm: true, v: 'primary' }) })}</div>
        <div class="help">不影响已完成的编辑，可改用下载。</div></div>
    </div>`,
    notes: [
      'LOGO 损坏或加载失败时，以无 LOGO 状态继续编辑，水印面板提示重新上传，不阻塞截图会话。',
      '品牌预设损坏或超限时，跳过损坏条目并回退默认参数；保存失败时保留当前参数，不显示已保存。',
      '剪贴板写入失败（权限被拒或无焦点）时给出可读错误并保留画布，可改用下载；不影响已完成的编辑。',
    ],
  })

  // ── R5.2 导出增强 ────────────────────────────────────────────────────────
  const exportBoard = board({
    title: '下载格式 · 复制图片',
    ref: 'screenshot §1.1 · §4 · roadmap R5.2 · US-CAP-09',
    tag: 'R5.2 · 后置',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}
      <div class="shot-sel" style="left:52px;top:62px;width:656px;height:332px"><span class="shot-size">656 × 332</span></div>
      <div class="mosaic" style="left:76px;top:86px;width:40px;height:40px;border-radius:50%"><span class="x">${I('x')}</span></div>
      <div class="mosaic" style="left:128px;top:86px;width:172px;height:22px"><span class="x">${I('x')}</span></div>
      <div class="ann ann-rect" style="left:392px;top:196px;width:116px;height:104px"></div>
      <div class="ann ann-text" style="left:516px;top:210px">重试放大</div>
      ${shotToolbarR5({ dl: true, pinCopy: 1, style: 'right:28px;top:408px' })}
      <div class="fmt-menu" style="right:108px;bottom:70px">${pin(2, 'pin-in-r')}
        <div class="bz-lb" style="padding:4px 9px 6px">下载格式</div>
        <div class="it on">${I('circle-check')}PNG<small>默认</small></div>
        <div class="it">${I('file-image')}JPEG<small>质量 0.9</small></div>
        <div class="it">${I('image')}WebP</div>
        <div class="menu-sep"></div>
        <div class="t-xs muted" style="padding:7px 9px 3px;font-family:var(--font-mono)">AnnHub/screenshot-20261004-1015.png</div>
        <div class="t-xs muted" style="padding:2px 9px 6px;position:relative">${pin(3, 'pin-in-r')}入库统一保存 PNG；格式与质量只影响下载与复制。</div>
      </div></div>`,
    notes: [
      '<b>复制图片</b>：以 PNG 复制当前处理结果到剪贴板，编辑会话继续保留；新增 clipboardWrite 权限，随商店隐私披露与权限说明一并交代。',
      '<b>下载</b>带格式选项：PNG（默认）/ JPEG（默认质量 0.9）/ WebP；文件名沿用 AnnHub/screenshot-&lt;时间&gt; 前缀并按格式取扩展名。',
      '“确认”入库永远是 PNG：格式与质量选择只作用于下载与复制，不改变入库字节；“下载”与“入库”仍是两个独立动作。',
    ],
  })

  const sizes = board({
    title: '平台尺寸预设 · 复制成功',
    ref: 'screenshot §1.2 · §4 · roadmap R5.2',
    tag: 'R5.2 · 后置',
    w: 760,
    body: `<div style="padding:22px 24px 24px;display:grid;gap:18px">
      <div class="sp-card" style="padding:16px 18px;position:relative">${pin(1)}
        <div class="hs between" style="margin-bottom:6px"><b class="t-md">输出尺寸预设</b><span class="t-xs muted">只约束输出尺寸</span></div>
        ${[
          [false, '原始尺寸', '跟随选区 · 656 × 332'],
          [true, '小红书 · 3:4', '1080 × 1440'],
          [false, '小红书 · 1:1', '1080 × 1080'],
          [false, 'X · 16:9', '1600 × 900 · 单图不超过 5 MB'],
        ]
          .map(([on, n, v]) => `<div class="hs between" style="padding:9px 0;border-top:1px solid var(--line)">${rdo(on, `<span class="${on ? 'b' : ''}">${n}</span>`)}<span class="t-sm muted">${v}</span></div>`)
          .join('')}
      </div>
      <div class="vs g8"><b class="t-sm">复制成功</b>
        <div class="hs g12" style="position:relative">${pin(2)}${toast('已复制 PNG · 可粘贴到外部编辑器', { icon: 'clipboard-check' })}</div>
        <div class="help">成功只给一条轻提示，编辑会话继续保留，不自动关闭。</div></div>
      ${banner('info', '<b>编辑器内没有任何平台上传、发布或账号操作</b>：产物只落到本地下载与截图集入库。', { icon: 'shield-check' })}
    </div>`,
    notes: [
      '平台尺寸预设：小红书 3:4（约 1080 × 1440）、1:1（1080 × 1080）；X 16:9（1600 × 900，单图不超过 5 MB）。预设只约束输出尺寸，内容等比完整置入，留白画在衬底上。',
      '复制成功给一条轻提示；失败时的处理见“失败与降级”。',
    ],
  })

  return group(
    {
      id: 'ext-shot-r5',
      title: '截图增强 · R5',
      small: 'screenshot §1 · §4 · roadmap R5',
      desc: '同一个编辑器的三组增强：R5.3 精确选区（阶段 V 之后排期）；R5.1 美化与品牌、R5.2 导出增强（后置，以 H-14 为门槛）。它们只增强像素处理，不是社交分享——没有任何平台上传或账号操作，产物只落到本地下载与截图集。',
    },
    row(snap, handles),
    row(ratio, keysBoard),
    row(beautify, brand),
    row(brandSettings, fails),
    row(exportBoard, sizes),
  )
}
