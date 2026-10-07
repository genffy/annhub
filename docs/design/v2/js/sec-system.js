// 设计系统：令牌、条目类型、字阶、应用壳规格、属性类型、组件、视觉语法、图标、动效与可访问性。

const swatch = (name, cssVar, use) => `<div class="sw" data-var="${cssVar}"><i style="background:var(${cssVar});height:44px"></i><div><b>${name}</b><code>${cssVar}</code><span class="hexv" style="display:block;margin-top:2px"></span>${use ? `<span style="display:block;margin-top:2px">${use}</span>` : ''}</div></div>`

const specGroup = (title, desc, inner) => `<div class="sp-card" style="flex:1;min-width:0"><h5>${title}</h5><p>${desc}</p>${inner}</div>`

// 壳的示意图：按 1:2 比例画出视口、导航、内容与抽屉
const shellDiagram = (o) => {
  const k = 0.5
  const W = o.w * k
  const H = 230
  const navW = o.nav * k
  const dr = o.drawer ? (o.drawerFull ? W - navW : 440 * k) : 0
  return `<div style="width:${W}px">
    <div class="hs between t-xs muted" style="margin-bottom:6px"><b style="color:var(--fg)">${o.title}</b><span class="mono">${o.range}</span></div>
    <div style="position:relative;height:${H}px;border:1.5px solid var(--line-2);border-radius:10px;background:var(--surface-2);overflow:hidden">
      <div style="position:absolute;left:0;top:0;bottom:0;width:${navW}px;background:color-mix(in oklab,var(--brand) 9%,var(--surface));border-right:1.5px solid color-mix(in oklab,var(--brand) 35%,var(--line-2));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--brand-text);font-weight:650">${navW < 50 ? `<span style="writing-mode:vertical-rl;letter-spacing:.06em">导航 · <span class="mono" style="font-weight:500">${o.nav}</span></span>` : `<span>导航</span><span class="mono" style="font-weight:500">${o.nav}</span>`}</div>
      <div style="position:absolute;left:${navW}px;right:0;top:0;bottom:0;padding:14px 16px;display:flex;flex-direction:column;gap:7px"><span class="t-xs muted">内容 · 自适应</span>${[90, 70, 82, 60, 76].map(p => `<i style="display:block;height:12px;width:${p}%;border-radius:6px;background:var(--surface-3)"></i>`).join('')}</div>
      ${o.drawer ? `<div style="position:absolute;right:0;top:0;bottom:0;width:${dr}px;background:var(--surface);border-left:1.5px dashed var(--line-2);box-shadow:-10px 0 20px -14px rgb(15 23 42 / .35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--fg-3);font-weight:650"><span>抽屉</span><span class="mono" style="font-weight:500">${o.drawerFull ? '占满内容区' : '440'}</span></div>` : ''}
    </div>
  </div>`
}

function secSystem() {
  const color = group(
    { id: 'ds-color', title: '色彩', small: 'tokens.css', desc: '中性色沿用扩展现有的 slate 令牌，品牌紫取自 logo（#673AB8）。品牌色只用于主操作、选中、焦点环与品牌标识；语义色只表达状态，并且总是配图标和文字。页眉的开关可以切到暗色，所有令牌成对定义。' },
    row(
      specGroup('中性与线', '表面、文本、描边；侧栏用一档略带蓝紫的浅底，和内容区拉开层次。网页模拟区（文章页）始终保持亮色，不随主题。', `<div class="sp-grid" style="grid-template-columns:repeat(4,1fr)">
        ${swatch('表面', '--surface', '内容区、卡片、输入框')}${swatch('侧栏', '--side', '左导航')}${swatch('表面 2', '--surface-2', '悬停、弱背景')}${swatch('表面 3', '--surface-3', '按压、进度底')}
        ${swatch('文字', '--fg', '正文、标题')}${swatch('文字 2', '--fg-2', '次级正文')}${swatch('文字 3', '--fg-3', '辅助说明')}${swatch('描边', '--line', '分隔线、卡片边')}</div>`),
      specGroup('品牌与语义', '一种品牌色 + 四种语义色。', `<div class="sp-grid" style="grid-template-columns:repeat(4,1fr)">
        ${swatch('品牌', '--brand', '主按钮、选中')}${swatch('品牌文字', '--brand-text', '链接、选中文字')}${swatch('成功', '--ok', '已保存、导出完整')}${swatch('警告', '--warn', '部分导出')}
        ${swatch('危险', '--danger', '失败、删除')}${swatch('信息', '--info', '说明')}${swatch('焦点环', '--ring', '键盘焦点')}${swatch('遮罩', '--scrim', '对话框背景')}</div>`),
    ),
  )

  const typeRows =
    TYPE_ORDER.map(t => `<tr><td>${tchip(t, { en: false })}</td><td>${ttile(t)}</td><td class="mono t-xs muted">--t-${t}</td><td>${TYPES[t].tip}</td><td class="mono t-xs muted">${TYPES[t].icon}</td></tr>`).join('') +
    `<tr><td><span class="tchip t-highlight">${I(HLV.icon)}${HLV.zh}</span></td><td><span class="ttile t-highlight">${I(HLV.icon)}</span></td><td class="mono t-xs muted">--t-highlight</td><td>${HLV.tip}（不是条目类型）</td><td class="mono t-xs muted">${HLV.icon}</td></tr>`
  const types = group(
    { id: 'ds-type-code', title: '条目类型与高亮的编码', small: 'visual §3', desc: '两种条目类型（剪藏、截图）和库里的高亮是产品里出现频率最高的标识。每种都用<b>图标 + 文字 + 颜色</b>三重编码，颜色只是辅助；芯片底色与文字色由同一个 --t 混合得出，亮暗两套自动适配。高亮不是条目类型，它只在导航、入口和阅读视图里出现。' },
    row(
      specGroup('芯片 · 图块', 'tchip（22px）用于列表和详情，ttile（32px）用于列表行左侧与导航。', `<table class="sp-table"><thead><tr><th>类型</th><th>图块</th><th>令牌</th><th>一句话</th><th>图标</th></tr></thead><tbody>${typeRows}</tbody></table>`),
      specGroup('出现的位置', '导航、列表行、详情、弹窗、页面里的选区菜单，类型出现的任何地方都同时有图标和文字。', `<div class="vs g16">
        <div><div class="t-xs muted" style="margin-bottom:6px">列表芯片 · 小号 / 标准</div><div class="hs g8 wrap">${TYPE_ORDER.map(t => tchip(t, { sm: true })).join('')}${TYPE_ORDER.map(t => tchip(t)).join('')}<span class="tchip t-highlight">${I(HLV.icon)}${HLV.zh}</span></div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">导航项里的类型图标</div><div class="app" style="height:auto;display:block;background:transparent;width:200px"><div class="nav" style="border:1px solid var(--line);border-radius:10px;padding:8px">${NAV.slice(1).map(it => navItem(it, 'highlight', 'zh')).join('')}</div></div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">高亮调色板（五色，每个色点都有文字名称）</div><div class="hs g10 wrap">${HL_COLORS.map((c, i) => `<span class="hs g6">${hlDot(c, i === 0)}<span class="t-xs muted">${HL_NAMES[c]}</span></span>`).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">正文里的高亮：底色 + 下划线，有备注的带小点</div><div class="md md-sm" style="max-width:360px">${mdRender('黄色、绿色、蓝色、粉色、紫色。', [0, 1, 2, 3, 4].map(i => { const w = ['黄色', '绿色', '蓝色', '粉色', '紫色'][i]; const s = '黄色、绿色、蓝色、粉色、紫色。'.indexOf(w); return { id: 'x' + i, s, e: s + 2, c: HL_COLORS[i], note: i === 0 ? 'n' : '' } }))}</div></div>
        <div class="banner info">${I('eye')}<div>色盲友好：去掉颜色后仍可凭图标与文字区分类型；高亮在底色之外还有下划线；色相不单独承担含义，也不大面积铺底。</div></div></div>`),
    ),
  )

  const type = group(
    { id: 'ds-scale', title: '字阶、间距与圆角', small: '', desc: '界面字体用系统字体栈（SF Pro / PingFang SC），不嵌入网络字体。应用页基础字号 14px，页面内浮层 13px；网页模拟使用衬线体仅为区分“用户的网页”和“我们的界面”。' },
    row(
      specGroup('字阶', '', `<div class="vs g10">
        ${[['标题 · Display', '三种方式留下内容', '44 / 700 · -0.025em'], ['页标题', '全部', '22 / 700 · -0.02em'], ['标题 LG', '最近的条目', '18 / 650'], ['标题 MD', '属性', '15 / 650'], ['正文 / 控件', '指数退避加抖动：基础间隔 × 2^n，再乘一个随机因子。', '14 / 400–500（浮层 13）'], ['辅助', '共 128 条 · 本周新增 5', '12–13 / 400'], ['标注', 'engineering.example.com · 周一', '11 / 400']]
          .map(([n, s, spec], i) => `<div class="hs between" style="border-bottom:1px solid var(--line);padding-bottom:8px"><span style="font-size:${[28, 22, 18, 15, 14, 12.5, 11][i]}px;font-weight:${[700, 700, 650, 650, 500, 400, 400][i]};letter-spacing:${i === 0 ? '-0.02em' : '0'}">${s}</span><span class="t-xs muted none" style="text-align:right">${n}<br>${spec}</span></div>`).join('')}
        <div class="hs between"><span class="mono" style="font-size:14px;letter-spacing:.1em">656 × 332</span><span class="t-xs muted">等宽 · 尺寸标签、代码、frontmatter</span></div></div>`),
      specGroup('间距、圆角、阴影', '4px 基准。圆角随容器层级递增，对话框最大。', `<div class="vs g16">
        <div><div class="t-xs muted" style="margin-bottom:6px">间距（4 / 8 / 12 / 16 / 20 / 24 / 32）</div><div class="hs g8" style="align-items:flex-end">${[4, 8, 12, 16, 20, 24, 32].map(n => `<div class="vs g4" style="align-items:center"><i style="display:block;width:${n}px;height:${n}px;background:color-mix(in oklab,var(--brand) 30%,var(--surface));border-radius:2px"></i><span class="t-xs muted tnum">${n}</span></div>`).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">圆角：控件 8 · 芯片 6 · 卡片与列表 12 · 对话框 16 · 胶囊 999</div><div class="hs g10">${[6, 8, 12, 16, 999].map(r => `<i style="display:block;width:52px;height:36px;border:1.5px solid var(--line-2);background:var(--surface-2);border-radius:${Math.min(r, 18)}px"></i>`).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:8px">阴影：卡片 · 浮层 · 对话框 · 窗口</div><div class="hs g14" style="gap:16px;padding:6px 4px 12px">${['--sh-1', '--sh-2', '--sh-modal', '--sh-window'].map(v => `<i style="display:block;width:68px;height:44px;border-radius:12px;background:var(--surface);box-shadow:var(${v})"></i>`).join('')}</div></div></div>`),
    ),
  )

  const spec = board({
    title: '应用壳规格',
    ref: 'extension §2.2 · visual §4',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:26px 28px 30px"><div class="hs top g28" style="gap:34px;align-items:flex-start">
      ${shellDiagram({ title: '展开', range: '≥ 1100', w: 1280, nav: 232, drawer: true })}
      ${shellDiagram({ title: '可折叠', range: '720 – 1099', w: 900, nav: 232, drawer: true })}
      ${shellDiagram({ title: '图标栏', range: '< 720', w: 640, nav: 60, drawer: true, drawerFull: true })}
    </div>
    <table class="sp-table" style="margin-top:26px"><thead><tr><th style="width:160px">项</th><th style="width:230px">值</th><th>说明</th></tr></thead><tbody>
      <tr><td>导航宽度</td><td class="mono">232 / 60</td><td>展开 232px，图标栏 60px；折叠后图标有文字提示，当前视图仍有底色与竖条</td></tr>
      <tr><td>内容区</td><td>自适应 · 列表最大行宽 960</td><td>页头左右 32（窄窗口 20）、上 22；列表类视图限制最大行宽，画廊与属性表占满</td></tr>
      <tr><td>详情抽屉</td><td class="mono">440</td><td>覆盖在内容之上，Esc 或点击遮罩关闭；窄窗口里占满内容区</td></tr>
      <tr><td>阅读视图</td><td class="mono">正文最大 700 · 右栏 320</td><td>正文居中，右栏是“高亮 / 属性”两个标签，与抽屉共用属性面板；窄窗口里右栏收到正文下方（extension §4.2），本稿没有单独画这一态</td></tr>
      <tr><td>断点</td><td class="mono">1100 · 720</td><td>≥ 1100 展开；720–1099 默认展开、可手动折叠；&lt; 720 默认折叠为图标栏。任何宽度都不换成顶部导航</td></tr>
      <tr><td>控件高度</td><td class="mono">导航项 34 · 属性行 34 · 按钮 32 · 搜索 36</td><td>可点击区域不低于 28px；主要按钮 32–36px</td></tr>
      <tr><td>弹窗</td><td class="mono">520 × 340 · 图标栏 52</td><td>同一套壳的紧凑版，右侧只列最近 5 条</td></tr>
    </tbody></table></div>`,
    notes: ['这些数值是设计稿的建议起点，落地后在首次使用走查里验证；docs/v2 只写规则（“所有页面都是左导航 + 右内容；窄窗口折叠为图标栏，不出现顶部导航”），具体宽度与断点以本稿为准。'],
  })

  const ptypeRows = PTYPE_ORDER.map(t => {
    const editor = {
      text: input('支付重试', { style: 'min-height:30px;max-width:230px' }),
      list: `<div class="tagin" style="max-width:260px">${vtag('retry')}${vtag('reliability')}<span class="muted-2">${I('plus', 'i-sm')}</span></div>`,
      number: input('3', { style: 'min-height:30px;max-width:120px' }),
      checkbox: cbx(true, '已读'),
      date: `<div class="input" style="min-height:30px;max-width:180px;display:flex;align-items:center;gap:8px">${I('calendar', 'i-sm muted')}2026-10-07</div>`,
      datetime: `<div class="input" style="min-height:30px;max-width:220px;display:flex;align-items:center;gap:8px">${I('calendar-clock', 'i-sm muted')}2026-10-07 10:30</div>`,
    }[t]
    return `<tr><td><span class="hs g8 b">${pticon(t)}${PTYPES[t].zh}<span class="muted t-xs" style="font-weight:400">${PTYPES[t].en}</span></span></td><td>${editor}</td><td>${PTYPES[t].stored}</td><td class="muted">${PTYPES[t].limit}</td><td>${PTYPES[t].ops}</td></tr>`
  }).join('')
  const ptypes = board({
    title: '属性类型 · 六种',
    ref: 'entry §5.2 · search §3',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:24px 28px 26px"><table class="sp-table"><thead><tr><th style="width:190px">类型</th><th style="width:310px">值编辑器</th><th style="width:210px">存储值</th><th style="width:260px">格式与上限</th><th>筛选运算符</th></tr></thead><tbody>${ptypeRows}</tbody></table>
      <div class="banner brand" style="margin-top:16px">${I('info')}<div>与 Obsidian 的 Properties 同构：类型图标 + 名称在左，值编辑器在右；<b>名称与类型全局绑定</b>，不支持嵌套，值里不渲染 Markdown，长文字放备注（entry §5.3）。</div></div></div>`,
    notes: ['六种类型就是全部：文本、列表、数字、复选框、日期、日期时间。每种都用图标 + 文字区分，不靠颜色。', '日期时间不带时区（与 Obsidian 一致）；列表去重，标签（tags）是一个固定存在的列表属性。'],
  })

  const comps = board({
    title: '组件速查',
    ref: 'extension §2 · §4',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:26px 28px 30px;display:grid;grid-template-columns:repeat(4,1fr);gap:22px 28px">
      <div class="vs g12"><div class="mh">按钮与表单</div>
        <div class="hs g8 wrap">${btn('主按钮', { v: 'primary' })}${btn('次按钮', {})}${btn('幽灵', { v: 'ghost' })}${btn('删除', { v: 'danger' })}</div>
        <div class="hs g8 wrap">${btn('导出内容', { icon: 'download' })}${btn('聚焦', { focus: true })}${btn('禁用', { off: true })}${btn('', { icon: 'ellipsis', iconOnly: true })}</div>
        ${field('文本框', input('默认', {}))}${field('错误', input('source', { err: true }), { help: '“source” 是保留名，换一个名称。', err: true })}
        <div class="hs g16 wrap">${cbx(true, '勾选')}${cbx(false, '未勾选')}${sw(true)}${sw(false)}</div>
        <div class="hs g12"><span class="seg"><span class="on">列表</span><span>卡片</span></span></div></div>
      <div class="vs g12"><div class="mh">导航与筛选</div>
        <div class="app" style="height:auto;display:block;background:transparent"><div class="hs g8"><div class="nav" style="border:1px solid var(--line);border-radius:10px;padding:6px 6px 6px 12px;width:150px">${navItem(NAV[0], 'x', 'zh')}${navItem(NAV[1], 'x', 'zh')}${navItem(NAV[2], 'highlight', 'zh')}</div><div class="nav" style="border:1px solid var(--line);border-radius:10px;padding:6px 6px 6px 12px;width:154px">${navItem(NAV[0], 'x', 'en')}${navItem(NAV[1], 'x', 'en')}${navItem(NAV[2], 'highlight', 'en')}</div></div></div>
        <div class="hs g6 wrap"><span class="fchip">${I('globe')}来源${I('chevron-down')}</span><span class="fchip on">${I('tag')}标签：retry${I('x')}</span></div>
        <div class="hs g8"><div class="search" style="height:32px">${I('search')}<span>搜索条目…</span><span class="grow"></span><kbd>/</kbd></div></div>
        <div class="hs g6 wrap">${keys('/')}<span class="t-xs muted">聚焦搜索</span>${keys('Esc')}<span class="t-xs muted">关闭抽屉</span></div></div>
      <div class="vs g12"><div class="mh">条目与属性</div>
        <div class="hs g6 wrap">${TYPE_ORDER.map(t => tchip(t)).join('')}<span class="hlc">${I('highlighter', 'i-sm')}3 高亮</span></div>
        <div class="hs g6 wrap">${tags(['retry', 'reliability'])}<span class="ppill">${I('text')}<span>project</span><b>支付重试</b></span><span class="ppill">${I('square-check')}<span>reviewed</span></span></div>
        <div class="vs g2">${propRow('project', 'text', '支付重试')}${propRow('tags', 'list', vtag('retry') + vtag('streams'), { hov: true })}${propRow('source', 'text', '<span class="c-brand">engineering.example.com</span>', { ro: true })}</div></div>
      <div class="vs g10"><div class="mh">反馈</div>
        ${banner('info', '<b>信息</b>：属性名称与类型全局绑定。')}${banner('ok', '<b>已保存</b>：95 条条目。')}${banner('warn', '<b>部分导出</b>：2 张图片缺失。')}${banner('danger', '<b>失败</b>：没有保存成功，输入都还在。', { action: btn('重试', { sm: true }) })}
        <div class="hs g10 top">${clipToast({ p: 44 })}</div>
        <div class="hs g10" style="margin-top:6px">${tipBubble('剪藏', '保存原文和语境，之后查阅', 'position:static;flex:none')}<div class="menu" style="min-width:130px;flex:none">${menuItem('arrow-up-right', '回到来源', { on: true })}${menuItem('trash', '删除', { danger: true })}</div></div></div>
    </div>`,
    notes: ['所有可点击元素都有可见的焦点环（品牌紫 40% 的 2px 外环）；禁用态降到 45% 不透明度，并在需要时给出原因，而不是只置灰。'],
  })

  const grammar = board({
    title: '三条贯穿全局的视觉语法',
    ref: 'product §6 · extension §6 · §7.2',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:26px 28px 28px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px">
      <div class="vs g12"><b class="t-lg">1 · 来源始终可见</b><div class="help" style="margin-top:-6px">任何一条内容都能回答“这是从哪来的、怎么回去”。</div>
        <div class="list">${entryRow(ENTRIES0[0])}</div>
        ${banner('info', '原页面可能已经变化；<b>原文和语境都存在这里</b>，可以继续阅读、高亮和整理。', { icon: 'unplug' })}</div>
      <div class="vs g12"><b class="t-lg">2 · 状态不只靠颜色</b><div class="help" style="margin-top:-6px">每个状态至少有两种线索：图标 / 文字 / 形状之一加颜色。</div>
        <table class="sp-table" style="font-size:12.5px"><tbody>
          <tr><td>当前视图</td><td><span class="nav-i on" style="width:150px;height:30px">${I('library')}<span>全部</span><span class="n">95</span></span></td></tr>
          <tr><td>类型</td><td>${tchip('clip')}</td></tr>
          <tr><td>高亮</td><td><span class="md md-sm">${mdRender('底色加下划线。', [{ id: 'g', s: 0, e: 6, c: 'yellow', note: '' }])}</span></td></tr>
          <tr><td>使用中，不可删</td><td><span class="hs g8 muted">${I('trash')}${I('lock', 'i-sm')} project · 使用 6 条</span></td></tr>
          <tr><td>保存失败</td><td>${chip('没有保存成功', { icon: 'circle-x', v: 'danger' })}</td></tr>
          <tr><td>部分导出</td><td>${chip('部分导出 · 缺 2 张图', { icon: 'triangle-alert', v: 'warn' })}</td></tr></tbody></table></div>
      <div class="vs g12"><b class="t-lg">3 · 输入不丢</b><div class="help" style="margin-top:-6px">失败时输入留在原处，并给出可行动作；校验原因写在原地。</div>
        ${textarea('对照复盘里的流量曲线。', { h: 56, err: true, style: 'font-size:12.5px' })}
        ${banner('danger', '<b>没有保存成功</b>（存储空间不足）。备注与属性都还在。', { action: btn('重试', { sm: true, v: 'primary' }) })}
        <div class="hs g8 end">${btn('复制我的输入', { sm: true })}${btn('导出内容', { sm: true })}</div></div>
    </div>`,
    notes: ['这三条语法对应 product §6 的原则 2、3、4：原文可追溯、失败不丢输入、属性小而原子（校验就地给出原因）。它们决定一个组件“长什么样”，而不是单个页面的设计。'],
  })

  const iconRows = [
    ...TYPE_ORDER.map(t => [TYPES[t].zh, TYPES[t].icon, '条目类型（选区菜单）']),
    [HLV.zh, HLV.icon, '入口与导航（不是条目类型）'], ['阅读', 'book-open', '操作'],
    ['资料库', 'library', '导航'], ['属性', 'tags', '导航'], ['设置', 'settings', '导航'], ['折叠导航', 'panel-left-close', '导航'],
    ...PTYPE_ORDER.map(t => [PTYPES[t].zh, PTYPES[t].icon, '属性类型']),
    ['导出', 'download', '操作'], ['删除', 'trash', '操作'], ['回到来源', 'arrow-up-right', '操作'], ['搜索', 'search', '操作'], ['备注', 'message-square-text', '内容'], ['原文', 'quote', '内容'],
    ['成功', 'circle-check', '状态'], ['警告', 'triangle-alert', '状态'], ['本机 / 锁定', 'lock', '状态'], ['不可用', 'ban', '状态'],
  ]
  const icons = board({
    title: '图标 · lucide',
    ref: 'extension §2.1',
    w: 1536,
    body: `<div style="padding:24px 28px 28px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px 28px">${iconRows.map(([n, l, u]) => `<div class="hs g10" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="ttl-i" style="width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:var(--surface-2);color:var(--fg-2);flex:none">${I(l)}</span><div class="grow" style="min-width:0"><div class="b t-md">${n}</div><div class="mono t-xs muted truncate">${l}</div></div><span class="t-xs muted-2 none">${u}</span></div>`).join('')}</div></div>`,
    notes: ['扩展使用 lucide（仓库已有依赖），docs/extension.md 指定了选区菜单的 bookmark / scan，高亮的入口与导航用 highlighter；属性类型图标参照 Obsidian Properties 的习惯（文本 / 列表 / 数字 / 复选框 / 日期 / 日期时间）。'],
  })

  const a11y = board({
    title: '动效、焦点与可访问性',
    ref: 'extension §7',
    w: 1536,
    body: `<div style="padding:24px 28px 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px" class="ui">
      <div class="vs g8"><b>动效</b><table class="sp-table" style="font-size:12.5px"><tbody>
        <tr><td>剪藏提示</td><td>约 3 秒，细条表示剩余时间</td></tr><tr><td>悬停提示</td><td>延迟约 300ms，淡入 120ms</td></tr><tr><td>详情抽屉</td><td>从右滑入 160ms；Esc 关闭</td></tr><tr><td>减少动态</td><td>全部降级为瞬时切换</td></tr></tbody></table></div>
      <div class="vs g8"><b>焦点与键盘</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>选区菜单可用 Tab / ← → / Enter，不抢页面焦点</li><li>资料库按 / 聚焦搜索；导航可用 ↑ ↓ 切换；阅读视图里选中文字按 H 高亮</li><li>抽屉打开时焦点进入并被限制在其中，关闭后回到触发位置</li><li>Esc 依次关闭气泡、抽屉、菜单</li></ul></div>
      <div class="vs g8"><b>读屏与语义</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>导航是 <code>nav</code> 地标，当前视图 <code>aria-current</code>；折叠为图标栏后仍有可读名称</li><li>每一行读出：类型、标题、来源、时间</li><li>图标按钮一律有 aria-label；颜色色块有文字名称；正文里的高亮读作“高亮，颜色名”</li></ul></div>
      <div class="vs g8"><b>对比度与尺寸</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>正文与控件文字对背景 ≥ 4.5:1（亮 / 暗两套都校验，见下方实测表）</li><li>状态传达至少两种线索，不只靠颜色</li><li>可点击区域 ≥ 28px 高；主要按钮 32–36px</li><li>文字可随系统字号放大，布局不依赖固定字数</li></ul></div>
    </div>`,
    notes: ['这些数值是本稿的建议起点，落地后在首次使用走查（E-03）里验证；与 extension §7 的验收条款一致。'],
  })

  const contrast = `<div class="sp-card ui" style="margin-top:22px"><h5>实测对比度（本页实时计算）</h5><p>按当前主题，对两种类型芯片、高亮芯片、五色高亮里的正文和当前导航项计算 WCAG 对比度；低于 4.5:1 的会标红。切换页眉的亮 / 暗主题后会重新计算。</p><div id="contrast-table"></div></div>`

  return section(
    {
      id: 'system',
      nav: '设计系统',
      eyebrow: 'Design System',
      title: '一套令牌，一套壳',
      lead: '扩展的所有界面共用同一套令牌、字阶、条目类型编码和应用壳（左导航 + 右内容）。下面是落地时需要对齐的最小集合。',
      sub: [['ds-color', '色彩'], ['ds-type-code', '条目类型'], ['ds-scale', '字阶与间距'], ['ds-shell', '应用壳规格'], ['ds-ptypes', '属性类型'], ['ds-components', '组件'], ['ds-grammar', '视觉语法'], ['ds-icons', '图标'], ['ds-a11y', '动效与可访问性']],
    },
    color,
    types,
    type,
    group({ id: 'ds-shell', title: '应用壳规格', small: 'extension §2.2', desc: '所有扩展页面共用的版式：左边是导航，右边是内容；窄窗口折叠为图标栏，不换成顶栏。' }, row(spec)),
    group({ id: 'ds-ptypes', title: '属性类型', small: 'entry §5.2', desc: '六种类型，每种有图标、值编辑器、存储值和筛选运算符。' }, row(ptypes)),
    group({ id: 'ds-components', title: '组件', small: '', desc: '最常用的基础件。所有画板都由它们拼装，不引入额外的一次性样式。' }, row(comps)),
    group({ id: 'ds-grammar', title: '视觉语法', small: 'product §6', desc: '比单个组件更重要的是三条跨组件的约定。' }, row(grammar)),
    group({ id: 'ds-icons', title: '图标', small: '', desc: '统一使用 lucide，语义一一对应。' }, row(icons)),
    group({ id: 'ds-a11y', title: '动效与可访问性', small: '', desc: '' }, row(a11y), contrast),
  )
}

// 运行时：色板回填十六进制、类型芯片与当前导航项的对比度实测
function fillSystemRuntime() {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const toRgb = css => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const hex = ([r, g, b]) => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
  const lum = ([r, g, b]) => {
    const f = v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  document.querySelectorAll('.sw[data-var]').forEach(el => {
    const i = el.querySelector('i')
    const rgb = toRgb(getComputedStyle(i).backgroundColor)
    el.querySelector('.hexv').textContent = rgb[3] < 1 ? `${hex(rgb)} · ${Math.round(rgb[3] * 100)}%` : hex(rgb)
  })
  const host = document.getElementById('contrast-table')
  if (!host) return
  const surf = toRgb(getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff')
  const side = toRgb(getComputedStyle(document.documentElement).getPropertyValue('--side').trim() || '#fff')
  const probeRow = (label, cls, base) => {
    const probe = document.createElement('span')
    probe.className = cls
    probe.style.cssText = 'position:absolute;left:-9999px;top:0'
    const wrap = document.createElement('div')
    wrap.className = 'ui'
    wrap.appendChild(probe)
    document.body.appendChild(wrap)
    const cs = getComputedStyle(probe)
    const fg = toRgb(cs.color)
    const bg = toRgb(cs.backgroundColor)
    const mix = bg.map((v, i) => (i < 3 ? Math.round(v * bg[3] + base[i] * (1 - bg[3])) : 1))
    const r = ratio(fg, mix)
    wrap.remove()
    return `<tr><td>${label}</td><td class="mono t-xs">${hex(fg)} on ${hex(mix)}</td><td class="tnum b ${r < 4.5 ? 'c-danger' : 'c-ok'}">${r.toFixed(2)} : 1</td><td>${r < 4.5 ? '低于 4.5:1，需要调整' : '达标'}</td></tr>`
  }
  const rows = [
    ...TYPE_ORDER.map(t => probeRow(tchip(t), `tchip t-${t}`, surf)),
    probeRow(`<span class="tchip t-highlight">${I(HLV.icon)}${HLV.zh}</span>`, 'tchip t-highlight', surf),
    ...HL_COLORS.map(c => probeRow(`<span class="md md-sm"><mark class="hlm c-${c}">正文里的高亮 · ${HL_NAMES[c]}</mark></span>`, `hlm c-${c}`, surf)),
    probeRow('<span class="nav-i on" style="width:auto">当前导航项</span>', 'nav-i on', side),
  ]
  host.innerHTML = `<table class="sp-table" style="font-size:12.5px"><thead><tr><th>元素</th><th>文字色 / 底色</th><th>对比度</th><th>结论</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}
