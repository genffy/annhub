// 浏览器扩展 · 页面内：选区菜单、剪藏、高亮。依据 extension §2.1、§3，capture §6。
// 采集是一步完成：没有采集窗口，也没有表单。

const tipFor = (t, lang = 'zh') => tipBubble(lang === 'en' ? TYPES[t].en : TYPES[t].zh, lang === 'en' ? TYPES[t].tipEn : TYPES[t].tip, 'position:absolute;left:0;bottom:calc(100% + 10px);max-width:260px')

// 剪藏提示：已剪藏 · 撤销 · 编辑，约 3 秒，底部细条表示剩余时间
const clipToast = (o = {}) =>
  `<div class="toast ct ${o.cls || ''}">${I('bookmark')}<span>已剪藏</span><i class="sepd"></i><span class="act">撤销</span><span class="act">编辑</span><div class="tbar"><i style="--p:${o.p || 62}%"></i></div></div>`

// 快速编辑气泡：标题、标签、备注（extension §3）
const quickEdit = (o = {}) => `<div class="pop" data-anchor=".the-sel" data-place="below" style="width:322px">${o.pin ? pin(o.pin) : ''}
  <div class="qe">
    <div class="hd">${I('bookmark')}已剪藏<span class="grow"></span><span class="t-xs muted" style="font-weight:400">失焦即保存</span></div>
    <div class="field" style="gap:4px"><div class="label t-sm">标题</div>${input('Backpressure in Streams', { style: 'min-height:30px;font-size:12.5px' })}</div>
    <div class="field" style="gap:4px"><div class="label t-sm">标签</div><div class="tagin is-focus">${vtag('retry')}${vtag('streams')}<span class="t-sm muted-2 ph">添加标签…</span><i class="caret"></i></div></div>
    <div class="field" style="gap:4px"><div class="label t-sm">备注</div>${textarea('对照复盘里的流量曲线。', { h: 50, style: 'font-size:12.5px' })}</div>
    <div class="hs between"><span class="link t-sm hs g4">更多属性${I('arrow-up-right', 'i-sm')}</span>${btn('完成', { sm: true, v: 'primary' })}</div>
  </div></div>`

function extFlowGroup() {
  const menu = board({
    title: '选区菜单 · 选中文本后出现',
    ref: 'extension §2.1 · capture §2',
    tag: 'R1',
    w: 760,
    body: miniView(`${article({ sel: 'sel' })}${hoverMenu({ anchor: '.the-sel', hover: 0, pin: 1, tip: `${tipFor('clip')}${pin(2, 'pin-b')}` })}`, 400),
    notes: [
      '选区菜单只有<b>三项</b>：剪藏、高亮、截图，顺序固定；每项是图标 + 短文本，不依赖位置。图标带各自类型的色相，但<b>文字始终在</b>。',
      '悬停或键盘聚焦约 300ms，动作旁出现一句后果，让三种保存方式的差别在入口就看得见（是否分得清由 H-18 的首次使用走查验证）。',
      '<b>没有表单，没有“稍后整理”</b>：剪藏与高亮一次点击完成，整理（标签、属性）放到保存之后。',
    ],
  })

  const lang = board({
    title: '选区菜单 · 中英文界面',
    ref: 'extension §2.1 · §2.7',
    tag: 'R1',
    w: 760,
    body: `<div class="ui" style="padding:26px 30px 30px;background:var(--surface-2)">
      <div class="vs g20">
        <div class="vs g10"><div class="mh b t-sm muted">中文界面</div><div style="position:relative;padding-top:58px">${hoverMenu({ static: true, hover: 1, tip: tipFor('highlight') })}</div></div>
        <div class="vs g10"><div class="mh b t-sm muted">English UI</div><div style="position:relative;padding-top:58px">${hoverMenu({ static: true, lang: 'en', hover: 1, tip: tipFor('highlight', 'en') })}</div></div>
        <div class="help">界面语言随浏览器界面语言：中文系语言显示中文，其他语言显示英文，没有手动切换（D-15）。每条文案同时给出两种语言，保存到条目里的用户内容不翻译。</div>
      </div></div>`,
    notes: ['英文界面的菜单项同样是名词：Clip / Highlight / Screenshot。悬停提示也成对给出（“Mark it on the page; add a note if you like”）。'],
  })

  const paths = `<div class="sp-card ui" style="margin-top:22px;max-width:1040px">
    <h5>三种保存方式</h5><p>同一种条目，三个入口。差别只在“保存什么”和“页面上留下什么”。</p>
    <table class="sp-table"><thead><tr><th style="width:90px"></th><th>${tchip('clip')}</th><th>${tchip('highlight')}</th><th>${tchip('screenshot')}</th></tr></thead><tbody>
      <tr><td>入口</td><td>选区菜单“剪藏”</td><td>选区菜单“高亮”；连续高亮 <kbd>Alt</kbd><kbd>H</kbd></td><td>选区菜单“截图”；<kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd></td></tr>
      <tr><td>保存什么</td><td>选中的文字及语境</td><td>选中的文字、语境和颜色</td><td>处理后的图片</td></tr>
      <tr><td>页面上的痕迹</td><td>无</td><td>视觉标记，回访时恢复</td><td>无</td></tr>
      <tr><td>保存之后</td><td>约 3 秒可撤销 · 可编辑</td><td>可加备注、换颜色</td><td>可同时下载</td></tr>
      <tr><td>资料库里</td><td>“剪藏”视图</td><td>“高亮”视图，按页面分组</td><td>“截图”视图，画廊</td></tr></tbody></table></div>`

  return group(
    { id: 'ext-flow', title: '页面内入口：选区菜单', small: 'extension §2.1', desc: '用户选中文本后的第一个决定：留下文字、在页面留痕，还是保存画面。三条路径都是一步完成。' },
    row(menu, lang),
    paths,
  )
}

function extClipGroup() {
  const step1 = board({
    title: '① 点“剪藏”',
    ref: 'extension §3 · capture §6',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'sel' })}${hoverMenu({ anchor: '.the-sel', hover: 0, pin: 1 })}`, 400),
    notes: ['一次点击，<b>不打开任何窗口</b>：原文、语境、来源和定位立即保存，页面标题、作者、发布日期、描述等属性取得到就自动写入。'],
  })

  const step2 = board({
    title: '② 已剪藏 · 3 秒内可撤销',
    ref: 'extension §3 · metrics §6',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'none' })}<div class="toast-pos">${pin(1, 'pin-r')}${clipToast()}</div>`, 400),
    notes: ['提示约 <b>3 秒</b>，底部细条表示剩余时间；<b>撤销</b>会删除刚保存的这条条目，<b>编辑</b>打开快速编辑气泡。提示不遮挡内容，也不抢页面焦点。', '本地写入的 95 分位小于 300ms（metrics §6）。'],
  })

  const step3 = board({
    title: '③ 编辑 · 标题、标签、备注',
    ref: 'extension §3',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'sel' })}${quickEdit({ pin: 1 })}`, 560),
    notes: ['快速编辑只放最常改的三项：<b>标题</b>（默认页面标题）、<b>标签</b>、<b>备注</b>；失焦即保存，“完成”或 Esc 关闭。', '“更多属性”在资料库里打开这条条目的详情，那里才有完整的属性面板。写入失败时保留输入并显示重试。'],
  })

  const fails = board({
    title: '保存失败 · 撤销之后',
    ref: 'extension §3 · §6',
    tag: 'R1',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 22px;background:var(--surface-2);display:grid;grid-template-columns:repeat(2,480px);gap:20px">
      <div class="vs g8"><b class="t-sm">保存失败，选区保持</b><div class="mv" style="height:230px;border-radius:12px;position:relative">${article({ sel: 'sel' })}<div class="toast-pos" style="bottom:16px"><div class="toast is-error">${I('circle-alert')}<span>没有保存成功（存储空间不足）</span><span class="act">重试</span><span class="act">导出内容</span></div></div></div><div class="help">不显示成功；保存前先做配额校验，失败时提示导出，输入与选区都还在。</div></div>
      <div class="vs g8"><b class="t-sm">点“撤销”之后</b><div class="mv" style="height:230px;border-radius:12px;position:relative">${article({ sel: 'none' })}<div class="toast-pos" style="bottom:16px"><div class="toast">${I('undo-2')}<span>已撤销，这条剪藏已删除</span></div></div></div><div class="help">撤销只删除刚保存的这一条；不影响同一页上已有的高亮。</div></div>
    </div>`,
    notes: ['失败路径对应 extension §6：写入或配额失败时<b>不显示成功</b>，给出可读原因与可行动作（重试 / 导出内容），不丢用户已输入的内容。'],
  })

  return group(
    { id: 'ext-clip', title: '剪藏：一次点击', small: 'extension §3', desc: '剪藏优先速度：点一下就保存，之后在资料库整理。想改点什么，提示里的“编辑”在原处就能改。' },
    row(step1, step2, step3),
    row(fails),
  )
}

function extHlGroup() {
  const bubble = board({
    title: '高亮 · 颜色与备注气泡',
    ref: 'extension §3 · capture §6',
    tag: 'R1',
    w: 500,
    body: miniView(
      `${article({ sel: 'note', color: 'yellow' })}
      <div class="pop" data-anchor=".the-sel" data-place="below" style="width:320px">${pin(1)}
        <div class="hs between"><span class="hs g6 b">${I('highlighter')}高亮</span><span class="hs g8" role="radiogroup" aria-label="颜色">${HL_COLORS.map((c, i) => hlDot(c, i === 0)).join('')}${pin(2, 'pin-r')}</span></div>
        ${textarea('可以解释“消费者变慢时内存为什么一直涨”', { h: 56, focus: true, caret: true, style: 'margin-top:10px;font-size:12.5px' })}
        <div class="hs g8" style="margin-top:10px"><span class="t-xs muted">失焦即保存 · 只在页面留痕</span><span class="grow"></span>${btn('删除', { sm: true, v: 'ghost', icon: 'trash' })}</div>
      </div>`,
      400,
    ),
    notes: ['高亮保存后，选区旁的气泡可以<b>写备注</b>（失焦即保存，Esc 关闭）和<b>换颜色</b>；颜色保存为 <code>color</code> 属性，调色板五色，每个色块都有文字名称供读屏使用。', '气泡里的“删除”会删除这条条目，页面文本结构随之恢复；回访同一页面时标记会恢复（含 SPA 的延迟内容）。'],
  })

  const cont = board({
    title: '连续高亮模式 · Alt+H / ⌘⇧H',
    ref: 'extension §3 · §7.1',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'hl', color: 'green' })}<div class="capsule" style="left:50%;top:14px;transform:translateX(-50%)">${pin(1)}<i class="dotp"></i>连续高亮中<span style="opacity:.65">选中即高亮</span>${keys('Esc')}退出</div>`, 400),
    notes: ['开启后页面顶部出现一枚胶囊，选中文本即创建一条高亮，<b>不再弹出选区菜单</b>；<b>Esc</b> 或再按快捷键退出。', '胶囊不遮挡内容，并用文字说明当前处于哪个模式（颜色不是唯一表达）。'],
  })

  return group(
    { id: 'ext-hl', title: '高亮：在页面留痕', small: 'extension §3', desc: '高亮要轻：一次点击，页面上留下标记；备注和颜色是之后可选的。' },
    row(bubble, cont),
  )
}
