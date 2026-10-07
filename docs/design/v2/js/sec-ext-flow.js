// 浏览器扩展 · 页面内：选区菜单与选区剪藏。依据 extension §2.1、§3，capture §6。
// 采集是一步完成：没有采集窗口，也没有表单；页面里没有高亮，也不留任何标记（D-19）。

const tipFor = (t, lang = 'zh') => tipBubble(lang === 'en' ? TYPES[t].en : TYPES[t].zh, lang === 'en' ? TYPES[t].tipEn : TYPES[t].tip, 'position:absolute;left:0;bottom:calc(100% + 10px);max-width:260px')

// 剪藏提示：已剪藏 · 撤销 · 编辑，约 3 秒，底部细条表示剩余时间
const clipToast = (o = {}) =>
  `<div class="toast ct ${o.cls || ''}">${I('bookmark')}<span>已剪藏</span><i class="sepd"></i><span class="act">撤销</span><span class="act">编辑</span><div class="tbar"><i style="--p:${o.p || 62}%"></i></div></div>`

// 快速编辑气泡：标题、标签、备注（extension §3）
const quickEdit = (o = {}) => `<div class="pop" data-anchor="${o.anchor || '.the-sel'}" data-place="below" style="width:322px">${o.pin ? pin(o.pin) : ''}
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
      '选区菜单只有<b>两项</b>：剪藏、截图，顺序固定；每项是图标 + 短文本，不依赖位置。图标带各自类型的色相，但<b>文字始终在</b>。<b>菜单里没有高亮</b>：划重点发生在资料库里读剪藏的时候（D-19）。',
      '悬停或键盘聚焦约 300ms，动作旁出现一句后果，让两种保存方式的差别在入口就看得见（是否分得清由 H-18 的首次使用走查验证）。',
      '<b>没有表单，没有“稍后整理”</b>：剪藏一次点击完成；阅读、高亮、标签和属性都放到保存之后。',
    ],
  })

  const lang = board({
    title: '选区菜单 · 中英文界面',
    ref: 'extension §2.1 · §2.7',
    tag: 'R1',
    w: 760,
    body: `<div class="ui" style="padding:26px 30px 30px;background:var(--surface-2)">
      <div class="vs g20">
        <div class="vs g10"><div class="mh b t-sm muted">中文界面</div><div style="position:relative;padding-top:58px">${hoverMenu({ static: true, hover: 0, tip: tipFor('clip') })}</div></div>
        <div class="vs g10"><div class="mh b t-sm muted">English UI</div><div style="position:relative;padding-top:58px">${hoverMenu({ static: true, lang: 'en', hover: 0, tip: tipFor('clip', 'en') })}</div></div>
        <div class="help">界面语言随浏览器界面语言：中文系语言显示中文，其他语言显示英文，没有手动切换（D-15）。每条文案同时给出两种语言，保存到条目里的用户内容不翻译。</div>
      </div></div>`,
    notes: ['英文界面的菜单项同样是名词：Clip / Screenshot。悬停提示也成对给出（“Save what you selected; read and highlight it in the library later”）。'],
  })

  const cell = (h, ...c) => `<tr><td>${h}</td>${c.map(x => `<td>${x}</td>`).join('')}</tr>`
  const paths = `<div class="sp-card ui" style="margin-top:22px;max-width:1180px">
    <h5>两种页面采集，一种库内高亮</h5><p>页面里只做“留下”：剪藏（选区或整块）与截图，页面上不留任何记号。要读懂、划重点，等保存之后在资料库里做。</p>
    <table class="sp-table"><thead><tr><th style="width:90px"></th><th>${tchip('clip')} 选区</th><th>${tchip('clip')} 区块 ${chip('提案 · D-20')}</th><th>${tchip('screenshot')}</th><th><span class="tchip t-highlight">${I('highlighter')}高亮</span> 在资料库里</th></tr></thead><tbody>
      ${cell('入口', '选区菜单“剪藏”', '指针停在整体内容上，区块旁的“剪藏”', '选区菜单“截图”；<kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd>', '阅读视图或抽屉里选中原文，点一个颜色')}
      ${cell('保存什么', '选中的内容（Markdown）和语境', '整个区块（Markdown），区块自己的永久链接', '处理后的图片', '剪藏里的一段标注：范围、颜色、备注')}
      ${cell('页面上的痕迹', '无', '无', '无', '无：只存在于 AnnHub')}
      ${cell('保存之后', '约 3 秒可撤销 · 可编辑', '同选区剪藏', '可同时下载', '可改色、写备注、删除（可撤销）')}
      ${cell('资料库里', '“剪藏”视图', '“剪藏”视图', '“截图”视图，画廊', '“高亮”视图，按剪藏分组')}</tbody></table></div>`

  return group(
    { id: 'ext-flow', title: '页面内入口：选区菜单', small: 'extension §2.1', desc: '用户选中文本后的第一个决定：留下文字，还是保存画面。两条路径都是一步完成；读懂与划重点留到资料库。' },
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
    notes: ['一次点击，<b>不打开任何窗口</b>：内容（转成 Markdown）、语境和来源立即保存，页面标题、作者、发布日期、描述等属性取得到就自动写入。'],
  })

  const step2 = board({
    title: '② 已剪藏 · 3 秒内可撤销',
    ref: 'extension §3 · metrics §6',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'none' })}<div class="toast-pos">${pin(1, 'pin-r')}${clipToast()}</div>`, 400),
    notes: ['提示约 <b>3 秒</b>，底部细条表示剩余时间；<b>撤销</b>会删除刚保存的这条条目，<b>编辑</b>打开快速编辑气泡。提示不遮挡内容，也不抢页面焦点；页面上不会留下“已剪藏”的记号。', '本地写入的 95 分位小于 300ms（metrics §6）。'],
  })

  const step3 = board({
    title: '③ 编辑 · 标题、标签、备注',
    ref: 'extension §3',
    tag: 'R1',
    w: 500,
    body: miniView(`${article({ sel: 'sel' })}${quickEdit({ pin: 1 })}`, 560),
    notes: ['快速编辑只放最常改的三项：<b>标题</b>（默认页面标题）、<b>标签</b>、<b>备注</b>；失焦即保存，“完成”或 Esc 关闭。', '“更多属性”在资料库里打开这条条目的详情，那里才有完整的属性面板和阅读视图。写入失败时保留输入并显示重试。'],
  })

  const fails = board({
    title: '保存失败 · 撤销之后',
    ref: 'extension §3 · §6',
    tag: 'R1',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 22px;background:var(--surface-2);display:grid;grid-template-columns:repeat(2,480px);gap:20px">
      <div class="vs g8"><b class="t-sm">保存失败，选区保持</b><div class="mv" style="height:230px;border-radius:12px;position:relative">${article({ sel: 'sel' })}<div class="toast-pos" style="bottom:16px"><div class="toast is-error">${I('circle-alert')}<span>没有保存成功（存储空间不足）</span><span class="act">重试</span><span class="act">导出内容</span></div></div></div><div class="help">不显示成功；保存前先做配额校验，失败时提示导出，输入与选区都还在。</div></div>
      <div class="vs g8"><b class="t-sm">点“撤销”之后</b><div class="mv" style="height:230px;border-radius:12px;position:relative">${article({ sel: 'none' })}<div class="toast-pos" style="bottom:16px"><div class="toast">${I('undo-2')}<span>已撤销，这条剪藏已删除</span></div></div></div><div class="help">撤销只删除刚保存的这一条；页面本身从头到尾没有被改动。</div></div>
    </div>`,
    notes: ['失败路径对应 extension §6：写入或配额失败时<b>不显示成功</b>，给出可读原因与可行动作（重试 / 导出内容），不丢用户已输入的内容。'],
  })

  return group(
    { id: 'ext-clip', title: '选区剪藏：一次点击', small: 'extension §3', desc: '剪藏优先速度：点一下就保存，之后在资料库里读和整理。想改点什么，提示里的“编辑”在原处就能改。' },
    row(step1, step2, step3),
    row(fails),
  )
}
