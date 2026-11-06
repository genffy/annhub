// 资料库里的选择与下载（download.md §3）：选择模式的版式与状态、下载对话框、单条下载的入口与状态条、键盘与读屏。
// 画板带“提案”标签：规则在同一个 PR 里写进 docs/product，评审通过后去掉标签。零件见 download-parts.js。

const DL_PROPOSAL = 'download §3 评审中'
const dlEnt = id => ENTRIES0.find(e => e.id === id)

// 抽屉头部：阅读 · 下载（Markdown）· 回到来源 · 删除 · 关闭
const dlDrawerHead = (e, o = {}) =>
  `<div class="dh" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}${tchip(e.type)}<span class="grow"></span>${e.type === 'clip' ? btn('阅读', { sm: true, icon: 'book-open' }) : ''}${btn('下载', { sm: true, icon: 'file-down', cls: 'dl-dlbtn', attrs: 'title="下载为 Markdown" aria-label="下载为 Markdown"' })}${btn('回到来源', { sm: true, icon: 'arrow-up-right' })}${btn('', { icon: 'trash', iconOnly: true, sm: true, v: 'ghost', attrs: 'aria-label="删除"' })}${btn('', { icon: 'x', iconOnly: true, sm: true, v: 'ghost', attrs: 'aria-label="关闭"' })}</div>`

const dlTitleBlock = e => `<div class="dtitle"><div class="t">${esc(e.title)}</div><div class="t-xs muted" style="margin-top:3px">${e.host}${e.path} · ${e.when}</div></div>`

// 标记的几何：放大 5 倍的卡片左上角。圆心在卡片的角上，文字从 (14, 12) 开始，两者不相交
const dlGeometry = () => `<svg viewBox="0 0 400 250" width="400" height="250" role="img" aria-label="选中标记的几何：直径 20 像素，圆心在卡片的角上，卡片文字从 14、12 像素处开始" style="display:block;font:12px var(--font-ui)">
  <path d="M110 250V130A60 60 0 0 1 170 70H390V250Z" style="fill:var(--surface-2);stroke:var(--line-2);stroke-width:2"/>
  <g style="fill:var(--fg-4);opacity:.55"><rect x="180" y="140" width="190" height="16" rx="4"/><rect x="180" y="176" width="200" height="16" rx="4"/><rect x="180" y="212" width="140" height="16" rx="4"/></g>
  <path d="M110 70H160A50 50 0 0 1 110 120Z" style="fill:var(--brand);opacity:.2"/>
  <circle cx="110" cy="70" r="55" style="fill:none;stroke:#fff;stroke-width:10"/>
  <circle cx="110" cy="70" r="50" style="fill:var(--brand)"/>
  <path d="M96 72l10 10 20-22" style="fill:none;stroke:#fff;stroke-width:11;stroke-linecap:round;stroke-linejoin:round"/>
  <g style="stroke:var(--fg-3);stroke-width:1.5;fill:none"><path d="M60 22H160M60 17v10M160 17v10"/><path d="M180 130v-16M180 130h-16" style="stroke:oklch(.62 .2 25)"/><path d="M110 70L40 150" style="stroke-dasharray:3 3"/></g>
  <g style="fill:var(--fg-2)"><text x="110" y="14" text-anchor="middle">直径 20 px</text><text x="4" y="168">圆心在卡片</text><text x="4" y="184">的角上</text><text x="190" y="108" style="fill:oklch(.5 .2 25);font-weight:650">文字起点 14 / 12 px</text></g>
  <text x="400" y="244" text-anchor="end" style="fill:var(--brand-text)">阴影 = 标记盖住卡片的部分</text>
</svg>`

function extDownloadGroup() {
  const cards6 = (o = {}) => [
    dlCard(dlEnt('e1'), { on: true, pinN: o.pins ? 3 : 0 }),
    dlCard(dlEnt('e2'), { on: true }),
    dlCard(dlEnt('e3'), { on: true, pinN: o.pins ? 5 : 0 }),
    dlCard(dlEnt('e4'), { pinN: o.pins ? 4 : 0 }),
    dlCard(dlEnt('e5')),
    dlCard(dlEnt('e6')),
  ]
  const head = (picking, o = {}) => pageHead({ title: '全部', sub: '95 条 · 71 剪藏 · 24 截图', right: `<div class="hs g8" style="position:relative">${o.pin ? pin(o.pin, 'pin-r') : ''}${dlHeadRight(picking, { w: 300 })}</div>` })

  // ── 1. 选择模式 · 整页 ──────────────────────────────────────────────────────────
  const layout = board({
    title: '选择模式 · 版式',
    ref: 'download §3.2 · extension §2.3',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        main: `${head(true, { pin: 1 })}
          <div class="pbody has-slot">
            ${dlSlot(dlBar({ n: 3, m: 95, pin: 2 }))}
            <div class="egrid">${cards6({ pins: true }).join('')}</div>
          </div>`,
      }),
      { active: 'all', h: 800 },
    ),
    notes: [
      '<b>页头</b>：「选择」进入后留在原位，显示为按下（<code>aria-pressed</code>），再点一次退出；搜索框置灰并写明“选择时无法搜索”，<kbd>/</kbd> 不响应——选择始终对应眼前这一份列表，退出后搜索词与筛选原样保留。',
      '<b>选择条取代筛选条</b>：同一个位置、同一个高度，一行排完——✕ 退出、已选 N 条（状态播报）、全选 M 条、清除，行尾是唯一的动作「下载所选」。它<b>不是网格里的一个单元</b>，也不在筛选条之外另占一行。',
      '<b>选中的卡片</b>：标记变成实心并带对勾，边框加粗、下半部加浅底，读屏读出“已选中”——去掉颜色仍然分得出来。',
      '<b>未选中的卡片</b>：空心圆标记；悬停时标记描边转品牌色。标记的圆心在卡片的角上，是自绘的，不是浏览器原生的复选框；它不盖住文字，不占布局。',
      '<b>截图卡片</b>同样：悬停时的“下载图片”与删除在选择模式里隐藏，整张卡片只做一件事——切换选中。卡片里的标签不单独响应，不触发筛选。',
    ],
  })

  // ── 2. 同位同高：进入前后卡片不动 ───────────────────────────────────────────────────
  const panel = picking => `<div style="flex:1;min-width:0"><div style="margin-bottom:10px"><span class="ex-badge ${picking ? 'is-now' : ''}">${picking ? `${I('list-checks', 'i-sm')}选择中：选择条` : `${I('list-filter', 'i-sm')}平时：筛选条`}</span></div>
      <div class="ex-frame"><div class="main" style="height:430px;background:var(--surface)">
        <div class="phead" style="padding-inline:24px"><div class="grow"><h1>全部</h1><div class="sub">95 条</div></div>${picking ? dlSearchOff(190) : searchBox({ w: 190 })}${dlPickBtn(picking)}</div>
        <div class="pbody has-slot" style="--pad:24px;padding-inline:24px;overflow:hidden">
          ${dlSlot(picking ? dlBar({ n: 2, m: 95 }) : fbar({ count: '共 95 条' }))}
          <div style="position:relative"><i class="ex-gl" style="top:0;left:-24px;right:-24px"><span>卡片顶边</span></i>
            <div class="egrid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${['e1', 'e2', 'e4', 'e5'].map((id, i) => (picking ? dlCard(dlEnt(id), { on: i < 2 }) : entryCard(dlEnt(id)))).join('')}</div>
          </div>
        </div>
      </div></div></div>`
  const same = board({
    title: '选择模式 · 进入前后卡片不动',
    ref: 'download §3.2 · download §9',
    proposal: DL_PROPOSAL,
    w: 1320,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:28px"><div class="hs g28 top" style="--g:28px">${panel(false)}${panel(true)}</div></div>`,
    notes: [
      '两个面板是同一个列表：左边是平时（筛选条），右边是选择中（选择条）。<b>红色虚线是同一条水平线</b>——卡片的位置、宽度和高度一个像素都没有变，因为选择条占的是筛选条的位置、与它同高（36px），而不是挤进网格或另占一行。',
      '选中标记不占布局：它是压在卡片角上的绝对定位圆，不改变卡片的盒子。验收就是量这一点：进入、选中、退出前后，每张卡片的外接框完全相同（<a href="../product/download.md">download §9</a>）。',
      '筛选条因窄窗口折成多行时，选择条沿用它的高度，内容仍是单行、垂直居中。',
    ],
  })

  // ── 3. 滚动时选择条固定 ─────────────────────────────────────────────────────────────
  const sticky = board({
    title: '选择模式 · 滚动时选择条固定在顶部',
    ref: 'download §3.2',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        main: `${head(true)}
          <div class="pbody has-slot">
            ${dlSlot(`${dlBar({ n: 5, m: 95 })}`, { cls: 'is-stuck' }).replace('<div class="dl-slot-in">', `<div class="dl-slot-in" style="position:relative">${pin(1, 'pin-b')}`)}
            <div style="margin-top:-168px"><div class="egrid">${[dlCard(dlEnt('e1'), { on: true }), dlCard(dlEnt('e2'), { on: true }), dlCard(dlEnt('e3'), { on: true }), dlCard(dlEnt('e4'), { on: true }), dlCard(dlEnt('e5'), { on: true, pinN: 2 }), dlCard(dlEnt('e6'))].join('')}</div></div>
          </div>`,
      }),
      { active: 'all', h: 560 },
    ),
    notes: [
      '列表在滚动区里滚动，<b>选择条留在滚动区的顶部</b>：卡片从它下面经过（卡片被它遮住的部分不可见），选了几条、全选与下载始终够得着。有内容从下面经过时，选择条下沿有一道很轻的阴影。',
      '选择条的底色是不透明的，卡片和选中标记都从它下面过，不会从两侧露出来；滚动位置在进入与退出选择模式时保持不变。',
    ],
  })

  // ── 4. 选择条的状态与窄窗口 ─────────────────────────────────────────────────────────
  const barRow = (name, sub, bar, w) =>
    `<div class="hs g20" style="align-items:center"><div style="width:168px;flex:none"><div class="b">${name}</div><div class="t-xs muted">${sub}</div></div><div style="width:${w}px;flex:none;position:relative">${bar}</div></div>`
  const bars = board({
    title: '选择条 · 状态与窄窗口',
    ref: 'download §3.2',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface);padding:26px 32px"><div class="vs g16" style="--g:18px">
      ${barRow('刚进入', '0 条', dlBar({ n: 0, m: 95, pin: 1 }), 984)}
      ${barRow('选了几条', 'N = 3', dlBar({ n: 3, m: 95 }), 984)}
      ${barRow('全选之后', 'N = M，全选不可用', dlBar({ n: 95, m: 95 }), 984)}
      ${barRow('列表超过上限', 'M = 240', dlBar({ n: 0, m: 240, pin: 2 }), 984)}
      ${barRow('选满上限', 'N = 200', dlBar({ n: 200, m: 240 }), 984)}
      ${barRow('窄窗口', '内容区 480px', dlBar({ n: 3, m: 95, pin: 3 }), 480)}
      ${barRow('更窄', '内容区 360px', dlBar({ n: 3, m: 95 }), 360)}
    </div></div>`,
    notes: [
      '<b>0 条</b>：「清除」与「下载所选」不可用，「下载所选」的提示文字是“先选择条目”；中间的说明教一次怎么选（点击卡片，Shift 加点击选一段）。',
      '<b>列表超过上限</b>：「全选 M 条」不可用，说明写“一次最多选 200 条”；选满 200 条后说明换成“已选满 200 条”，其余卡片不可再选（见“卡片标记”画板）。',
      '<b>窄窗口不折行</b>：放不下时先省略中间的说明文字，再把「全选 M 条」缩成「全选」；✕、已选 N 条、清除和行尾的「下载所选」始终在。',
    ],
  })

  // ── 5. 卡片标记：状态矩阵与几何 ─────────────────────────────────────────────────────
  const noTitle = { ...dlEnt('e4'), title: '', tags: ['retry', 'api'] }
  const states = [
    ['未选中', '空心圆标记', {}],
    ['悬停', '标记描边转品牌色', { hov: true }],
    ['键盘焦点', '卡片外加焦点环', { focus: true }],
    ['已选中', '实心带对勾 · 边框加粗 · 浅底', { on: true }],
    ['选满上限', '其余卡片置灰，不可再选', { off: true }],
  ]
  const rowOf = (e, label) =>
    states.map(([name, cap, o], i) => `<div>${dlCard(e, { ...o, pinN: e === dlEnt('e1') && i === 3 ? 1 : 0 })}${label ? `<div class="ex-cap"><b>${name}</b><br>${cap}</div>` : ''}</div>`).join('')
  const matrix = board({
    title: '卡片标记 · 五种状态与几何',
    ref: 'download §3.2 · visual §4',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface);padding:34px 34px 28px"><div class="vs" style="--g:30px">
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:26px">${rowOf(dlEnt('e1'), true)}</div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:26px">${rowOf(dlEnt('e3'), false)}</div>
      <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:26px">${rowOf(noTitle, false)}</div>
      <div class="hs g28 top" style="--g:32px;padding-top:6px;border-top:1px solid var(--line)"><div style="padding-top:18px"><div class="b" style="margin-bottom:8px">标记的几何（放大 5 倍）</div>${dlGeometry()}</div>
        <div class="vs g10" style="padding-top:18px;max-width:560px;--g:10px">
          <div class="b">三类卡片都量一次</div>
          <div class="t-sm muted" style="line-height:1.65">上面三行依次是：有标题与标签的剪藏、截图、没有标题的剪藏。标记盖住的只是卡片的外角——标题、标签和预览文字不被遮挡，缩略图只被遮住最外角的一小块。</div>
          <div class="b" style="margin-top:6px">不只靠颜色</div>
          <div class="t-sm muted" style="line-height:1.65">已选中：标记由空心变实心并带对勾，边框加粗，读屏读出“已选中”。选满上限的卡片：标记变成虚线圆、卡片变淡，读屏读出“不可用”。</div>
          <div class="b" style="margin-top:6px">与“正在查看”区分</div>
          <div class="t-sm muted" style="line-height:1.65">抽屉里正在查看的卡片是品牌色描边加光晕；选择模式里没有打开的抽屉，两种样式不会同时出现。</div>
        </div></div>
    </div></div>`,
    notes: [
      '<b>标记是自绘的</b>：直径 20px，圆心在卡片的左上角上，外圈有 2px 的底色环，放在白底、缩略图与卡片边框上都清楚；不使用浏览器原生复选框（原生控件会随系统变样，且不能压在卡片角上）。',
      '标记是绝对定位的，<b>不改变卡片的布局</b>：没有位移、没有宽高变化。整张卡片是点击目标，标记本身不接收点击。',
    ],
  })

  // ── 6–8. 下载对话框 ─────────────────────────────────────────────────────────────────
  const dlgGrid = (...dlgs) => `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:26px"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;align-items:start">${dlgs.join('')}</div></div>`
  const w = { style: 'width:auto' }
  const prepare = board({
    title: '下载对话框 · 准备态',
    ref: 'download §3.3 · extension §2.2',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: dlgGrid(dlDialog('prepare', { ...w }), dlDialog('prepare', { ...w, offline: true, form: 'folder' }), dlDialog('prepare', { ...w, many: true, n: 48, clips: 40, shots: 8, files: 312 })),
    notes: [
      '沿用“导出内容”对话框的壳与键盘行为：遮罩、居中，打开时焦点落在「下载」上，<kbd>Tab</kbd> 在其中循环，<kbd>Esc</kbd> 关闭，关闭后焦点回到选择条的「下载所选」。头部是标题与一个状态标签。',
      '<b>准备态</b>：一行摘要（条数、剪藏与截图各几条、预计约几个文件）；形态用分段选择（文件夹 / ZIP，默认取设置）；「同时下载媒体」默认取设置。',
      '<b>离线</b>（中）：「同时下载媒体」不可选，写明“当前离线，只保存 Markdown”。<b>文件很多</b>（右）：预计文件数超过 100 时形态下方出现一行建议，<b>不自动切换</b>。',
    ],
  })
  const run = board({
    title: '下载对话框 · 进行、取消与完整',
    ref: 'download §3.3 · download §2.5',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: dlgGrid(dlDialog('progress', { ...w }), dlDialog('cancelled', { ...w }), dlDialog('full', { ...w })),
    notes: [
      '<b>进行态</b>：进度条与 n/N，一句当前阶段，按钮只有「取消」。<b>进行中 <kbd>Esc</kbd> 与点遮罩都不关闭对话框</b>——只有「取消」停止下载，避免误触丢掉一次长下载。',
      '<b>已取消</b>：写明已写好的文件已删除、浏览器建好的空文件夹留在哪里；已选的条目还在，「重新下载」可以改形态再来。',
      '<b>完整</b>：条数、图片数和保存位置；「显示文件」在系统的文件管理器里显示这次下载。关闭对话框后，选择模式与已选条目保持原样。',
    ],
  })
  const bad = board({
    title: '下载对话框 · 部分、失败与单条状态条',
    ref: 'download §3.1 · download §3.3',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:26px"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;align-items:start">
      ${dlDialog('partial', { ...w })}${dlDialog('failed', { ...w })}
      <div class="vs g12" style="--g:12px"><div class="b t-sm">单条下载的状态条（浮在内容区底部）</div>
        <div class="vs g10" style="--g:10px;align-items:flex-start;padding:16px;border-radius:12px;background:var(--surface)">${dlStatus('progress', { n: 3, total: 12 })}${dlStatus('full')}${dlStatus('partial', { missing: 2 })}${dlStatus('failed')}${dlStatus('busy')}</div>
        <div class="t-xs muted" style="line-height:1.6">进行中随进度更新；完整几秒后自行消失；部分与失败保留到用户关闭或重试。进行与完整用状态播报，失败用提醒播报。</div></div>
    </div></div>`,
    notes: [
      '<b>部分</b>：横幅是警告色并写明数量；前几项未保存的媒体连同原因直接列出，完整清单在 README；仍给「显示文件」。<b>不得显示为完整成功</b>。',
      '<b>失败</b>：本地化的原因短句（依据稳定的错误码，不显示浏览器的原始信息），已选的条目不丢，已经写好的文件保留，给「重试」。',
      '<b>单条下载没有对话框</b>：直接开始，进度与结果在浮在内容区底部的状态条里，不推动列表、抽屉与阅读正文；进行中再点下载入口，状态条提示“上一个还在进行”。',
    ],
  })

  // ── 9. 单条下载的入口 ───────────────────────────────────────────────────────────────
  const e2 = dlEnt('e2')
  const e3 = dlEnt('e3')
  const fr = (w, inner, cap) => `<div style="width:${w}px;flex:none"><div class="ex-frame" style="position:relative">${inner}</div><div class="ex-cap">${cap}</div></div>`
  const single = board({
    title: '单条下载 · 入口与“下载图片”的区分',
    ref: 'download §3.1 · extension §4.1 · extension §4.2',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:26px"><div class="vs g24" style="--g:26px">
      <div class="hs g24 top" style="--g:24px">
        ${fr(440, `${dlDrawerHead(e2, { pin: 1 })}${dlTitleBlock(e2)}<div style="height:34px"></div><div class="tip" data-anchor=".dl-dlbtn" data-place="below" style="position:absolute">下载为 Markdown</div>`, '<b>剪藏的抽屉头部</b>：「下载」是图标加文字；提示文字“下载为 Markdown”。')}
        ${fr(440, `${dlDrawerHead(e3, { pin: 2 })}${dlTitleBlock(e3)}<div class="dsec" style="border-bottom:0"><div class="h" style="position:relative">${I('image', 'i-sm')}图片<span class="grow"></span>${pin(3, 'pin-s')}${btn('下载图片', { sm: true, icon: 'image-down', v: 'ghost', attrs: 'aria-label="下载图片"' })}</div><div class="gt-img" style="border:1px solid var(--line);border-radius:10px;height:120px;overflow:hidden">${imgSvg(e3.img)}</div></div>`, '<b>截图的抽屉</b>：头部的「下载」取 Markdown 文件夹；图片节里的是“下载图片”，只取图片本身。')}
        ${fr(300, `<div class="egrid" style="grid-template-columns:1fr;padding:16px">${entryCard(e3, { hov: true, act: true, pin: 0 })}</div><div class="tip" data-anchor=".ec-act .btn" data-place="below" style="position:absolute">下载图片</div>`, '<b>截图卡片悬停</b>：图标按钮的名称与提示都是“下载图片”；选择模式里隐藏。')}
      </div>
      <div class="hs g24 top" style="--g:24px">
        ${fr(620, `<div class="rd-bar" style="margin:0;padding:12px 18px;border-bottom:1px solid var(--line);position:relative">${pin(4, 'pin-in-r')}${btn('返回', { sm: true, v: 'ghost', icon: 'arrow-left' })}<span class="grow"></span>${btn('下载', { sm: true, icon: 'file-down', attrs: 'title="下载为 Markdown" aria-label="下载为 Markdown"' })}${btn('回到来源', { sm: true, icon: 'arrow-up-right' })}</div><div style="padding:16px 18px 18px"><div class="b t-lg">${esc(e2.title)}</div><div class="t-xs muted" style="margin-top:4px">${e2.host}${e2.path} · ${e2.when}</div></div>`, '<b>阅读视图顶栏</b>：返回 · 下载 · 回到来源。')}
        <div class="vs g8" style="--g:8px;flex:1;min-width:0;padding-top:2px"><div class="b t-sm">同一屏上两个“下载”，名称就分得清</div><div class="t-sm muted" style="line-height:1.65">「下载」= 把这个条目取成 Markdown 文件夹（含图片）；「下载图片」= 只取图片本身。两者的图标也不同（文档加向下箭头 / 图片加向下箭头）。</div></div>
      </div>
    </div></div>`,
    notes: [
      '详情抽屉头部是类型徽标与五个动作：<b>阅读</b>（仅剪藏）、<b>下载</b>、<b>回到来源</b>、<b>删除</b>与<b>关闭</b>；440px 宽的抽屉里一行排得下。',
      '截图条目有两个“下载”，必须从名称上就分清：头部的「下载」取 Markdown 文件夹；图片节的“下载图片”与卡片悬停的图标按钮取图片本身。',
      '阅读视图顶栏：返回、下载、回到来源。一条直接开始，不弹准备态；进度与结果在底部的状态条里。',
    ],
  })

  // ── 10. 键盘与读屏 ─────────────────────────────────────────────────────────────────
  const keyRow = (k, t) => `<div class="k">${k}</div><div>${t}</div>`
  const keyboard = board({
    title: '选择模式 · 键盘与读屏',
    ref: 'download §3.2 · extension §7.2',
    proposal: DL_PROPOSAL,
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface);padding:28px 36px"><div class="hs g32 top" style="--g:48px">
      <div style="flex:1;min-width:0"><div class="b" style="margin-bottom:6px">键盘</div><div class="ex-keys" style="border-top:1px solid var(--line)">
        ${keyRow(keys('Tab'), '在页头、选择条的按钮与卡片之间移动；卡片都在 Tab 顺序里')}
        ${keyRow(keys('Space'), '切换焦点所在的卡片')}
        ${keyRow(`${keys('Shift')}+${keys('Space')}`, '选到焦点所在的卡片（同 Shift 加点击：从上一次点击的卡片选到这里）')}
        ${keyRow(`${keys('Ctrl')} / ${keys('⌘')} + ${keys('A')}`, '全选当前列表（同「全选 M 条」）；焦点在输入框里时除外')}
        ${keyRow(keys('Enter'), '在选择条与对话框的按钮上触发它')}
        ${keyRow(keys('Esc'), '退出选择并清空；有对话框打开时先关对话框；下载进行中不被它取消')}
      </div><div class="t-sm muted" style="margin-top:12px;line-height:1.65">进入选择模式后焦点留在页头的「选择」上，退出后回到它；对话框关闭后焦点回到「下载所选」。</div></div>
      <div style="flex:1;min-width:0"><div class="b" style="margin-bottom:6px">读屏会读到</div><div class="vs g8" style="--g:8px">
        ${[
          ['页头', '“选择，切换按钮，已按下”'],
          ['选择条', '“选择，工具栏”；数量变化后播报“已选 3 条”（状态播报，每次变化一次）'],
          ['卡片', '“Retries and backpressure，engineering.example.com，复选框，已选中”'],
          ['选满上限', '“……，复选框，未选中，不可用”'],
          ['对话框', '“下载所选条目，对话框”；进行中读出进度“12 / 31”'],
          ['状态条', '完整与进行：状态播报；失败：提醒播报；出现时不抢走焦点'],
        ]
          .map(([k, t]) => `<div class="hs g12 top" style="--g:12px;padding:8px 12px;border-radius:10px;background:var(--surface-2)"><span class="b t-sm" style="width:64px;flex:none">${k}</span><span class="t-sm" style="line-height:1.6">${t}</span></div>`)
          .join('')}
      </div></div>
    </div></div>`,
    notes: ['整个流程只用键盘走得通：进入选择、选一段、全选、下载、取消、退出，每一步都有对应的键；读屏用户不靠颜色也能知道哪些卡片被选中、选了几条。'],
  })

  return group(
    {
      id: 'ext-download',
      title: '资料库：选择与下载',
      small: 'download §3',
      desc: '资料库里把条目取成 Markdown 文件夹：单条在抽屉与阅读视图里直接下载；多条先进入选择模式——选择条取代筛选条、卡片不动、选中不只靠颜色——再在对话框里确认。这一组画板定义交互的约束，规则写在 download.md §3；资料库的可交互原型里可以直接试。',
    },
    row(layout),
    row(same),
    row(sticky),
    row(bars),
    row(matrix),
    row(prepare),
    row(run),
    row(bad),
    row(single),
    row(keyboard),
  )
}
