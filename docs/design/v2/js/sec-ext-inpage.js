// 浏览器扩展 · 页面内：高亮与剪藏、截图。

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
  <span class="tb-b ${o.tool === 'rect' ? 'on' : ''}" title="矩形">${I('square')}</span><span class="tb-b" title="椭圆">${I('circle')}</span><span class="tb-b" title="箭头">${I('move-up-right')}</span><span class="tb-b" title="画笔">${I('pencil')}</span>
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

function extHlGroup() {
  const note = board({
    title: '高亮 · 备注气泡',
    ref: 'extension §3.2 · capture §2',
    tag: 'R1',
    w: 500,
    body: `<div class="mv" style="height:380px">${article({ sel: 'note' })}
      <div class="pop" data-anchor=".the-sel" data-place="below" style="width:310px">${pin(1)}
        <div class="hs between"><span class="hs g6 b">${I('highlighter')}高亮</span><span class="t-xs muted">只在页面留痕</span></div>
        ${textarea('可以解释“消费者变慢时内存为什么一直涨”', { h: 56, focus: true, caret: true, style: 'margin-top:10px;font-size:12.5px' })}
        <div class="hs g8" style="margin-top:10px">${btn('升级为碎片', { sm: true, icon: 'brain' })}<span class="grow"></span>${btn('删除', { sm: true, v: 'ghost', icon: 'trash-2' })}</div>
      </div></div>`,
    notes: ['高亮只创建视觉标记与可选备注：<b>不要求加工</b>。备注气泡贴着高亮出现，失焦自动保存，Esc 关闭。', '气泡里的“升级为碎片”会带着高亮原文打开采集窗口；高亮本身不会被自动升级。'],
  })

  const cont = board({
    title: '连续高亮模式 · Alt+H / ⌘⇧H',
    ref: 'extension §9',
    tag: 'R1',
    w: 500,
    body: `<div class="mv" style="height:380px">${article({ sel: 'hl' })}
      <div class="capsule" style="left:50%;top:14px;transform:translateX(-50%)">${pin(1)}<i class="dotp"></i>连续高亮中<span style="opacity:.65">选中即高亮</span><kbd>Esc</kbd>退出</div></div>`,
    notes: ['开启后页面顶部出现一枚胶囊，选中文本即高亮，不再弹出选区菜单；<b>Esc</b> 或再按快捷键退出。', '胶囊不遮挡内容，并有文字说明当前处于哪个模式（颜色不是唯一表达）。'],
  })

  const clip = board({
    title: '剪藏 · 一次点击',
    ref: 'extension §3.3 · capture §2',
    tag: 'R1',
    w: 500,
    body: `<div class="mv" style="height:380px">${article({ sel: 'sel' })}
      ${hoverMenu({ anchor: '.the-sel', hover: 2, below: false })}
      <div class="toast-pos">${pin(1, 'pin-r')}${toast('已剪藏 <span class="act" style="margin-left:6px">撤销</span>', { icon: 'bookmark' })}</div></div>`,
    notes: ['剪藏优先速度：点一下就保存原文与语境，不要求任何加工；提示约 3 秒后消失，期间可“撤销”，撤销会删除刚保存的这条剪藏（extension §3.3）。', '之后在碎片库“剪藏”视图里可“转为碎片”，但从不自动升级。'],
  })

  return group(
    { id: 'ext-hl', title: '高亮与剪藏', small: 'extension §3', desc: '两条“保留”路径：留痕要轻、剪藏要快。它们都不要求加工，也都留着升级为碎片的出口。' },
    row(note, cont, clip),
  )
}

function extShotGroup() {
  const selection = `<div class="shot-sel" style="left:52px;top:62px;width:656px;height:332px"><span class="shot-size">656 × 332</span></div>`
  const hint = `<div class="shot-hint">拖拽框选区域 <span class="muted-2">·</span> 单击选择元素 <span class="muted-2">·</span> <kbd>A</kbd> 匿名 开 <span class="muted-2">·</span> <kbd>Esc</kbd> 取消</div>`

  const region = board({
    title: '区域截图 · 拖拽选择',
    ref: 'screenshot §1.1 · §2',
    tag: 'R1',
    w: 760,
    body: `<div class="shot" style="height:470px">${shotScene()}${selection.replace('<span class="shot-size">', `${pin(1, 'pin-in')}<span class="shot-size">`)}${hint}
      <div style="position:absolute;z-index:7;left:690px;top:384px;color:#fff">${I('crosshair', 'i-lg')}</div></div>`,
    notes: ['快捷键 <b>Ctrl/⌘+Shift+S</b> 进入：页面变暗，拖拽时选区保持明亮，显示<b>蓝色边框和像素尺寸</b>。', '拖拽选区、单击选元素共用同一入口；顶部提示条说明手势和快捷键，进入编辑后消失。', '精确选区（吸附、八向手柄、方向键微调、比例锁定）属于 R5.3，阶段 V 之后排期，设计见下方“截图增强 · R5”。'],
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
      <div class="shot-hint" style="top:auto;bottom:12px;z-index:8">${I('eye-off', 'i-sm')}匿名 开 · 已遮挡 2 处 <span class="muted-2">·</span> 点 × 可移除自动建议</div></div>`,
    notes: [
      '<b>图片直接占据选区</b>，不跳到居中的预览卡片；原位编辑，页面其余部分保持压暗。',
      '<b>匿名默认开启</b>：身份元素（头像、名字、@账号）被自动覆盖成马赛克候选，虚线框 + × 表示“建议”，用户可移除或再手工加框；关闭自动匿名不等于关闭手工马赛克。',
      '<b>浮动工具栏贴近选区右下角</b>，空间不足时移到上方并约束在视口内；窄视口可横向滚动，不遮住“确认 / 取消”。工具：矩形、椭圆、箭头、画笔、马赛克、文字，五色（红黄青白黑），撤销（只撤销人工标注）、下载、取消、确认。',
      '“确认”入库到截图集（不是 Fragment）；“下载”和“入库”是两个独立动作，下载后会话继续保留。',
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
      <div class="vs g8"><b class="t-sm">保存到截图集</b>
        <div class="shot" style="height:230px;border-radius:12px"><div class="dim" style="background:rgb(10 14 25 / 0.0)"></div><div style="position:absolute;inset:0;display:grid;place-items:end center;padding-bottom:18px;z-index:9">${toast('已保存到截图集<br><span class="act">查看截图集</span>', { icon: 'images' })}</div></div>
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
    { id: 'ext-shot', title: '截图', small: 'screenshot', desc: '区域或元素截图，直接在原页面上标注、匿名，再入库到截图集。截图默认只留在截图集；只有用户写下关键细节并确认核验，才转为 visual Fragment。' },
    row(region, edit),
    row(element, states),
  )
}
