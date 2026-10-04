// 设计系统：令牌、kind 体系、字阶、组件、“建议 vs 事实”语法、图标对照、动效与可访问性。

const swatch = (name, cssVar, use) => `<div class="sw" data-var="${cssVar}"><i style="background:var(${cssVar});height:44px"></i><div><b>${name}</b><code>${cssVar}</code><span class="hexv" style="display:block;margin-top:2px"></span>${use ? `<span style="display:block;margin-top:2px">${use}</span>` : ''}</div></div>`

const specGroup = (title, desc, inner) => `<div class="sp-card" style="flex:1;min-width:0"><h5>${title}</h5><p>${desc}</p>${inner}</div>`

function secSystem() {
  const color = group(
    { id: 'ds-color', title: '色彩', small: 'tokens.css', desc: '中性色沿用扩展现有的 shadcn slate 令牌，品牌紫取自 logo（#673AB8）。品牌色只用于主操作、选中、焦点环与品牌标识；语义色只表达状态，并且总是配图标和文字。页眉的开关可以切到暗色，所有令牌成对定义。' },
    row(
      specGroup('中性与线', '表面、文本、描边。网页模拟区（文章页）始终保持亮色，不随主题。', `<div class="sp-grid" style="grid-template-columns:repeat(4,1fr)">
        ${swatch('表面', '--surface', '卡片、窗口、输入框')}${swatch('表面 2', '--surface-2', '悬停、弱背景')}${swatch('表面 3', '--surface-3', '按压、进度底')}${swatch('描边', '--line', '分隔线、卡片边')}
        ${swatch('文字', '--fg', '正文、标题')}${swatch('文字 2', '--fg-2', '次级正文')}${swatch('文字 3', '--fg-3', '辅助说明')}${swatch('文字 4', '--fg-4', '占位、禁用')}</div>`),
      specGroup('品牌与语义', '一种品牌色 + 四种语义色。', `<div class="sp-grid" style="grid-template-columns:repeat(4,1fr)">
        ${swatch('品牌', '--brand', '主按钮、选中')}${swatch('品牌文字', '--brand-text', '链接、选中文字')}${swatch('成功', '--ok', '已确认、已连接')}${swatch('警告', '--warn', '待发送、到期、需要重新确认')}
        ${swatch('危险', '--danger', '失败、删除、再来一次')}${swatch('信息', '--info', '说明、扩展侧')}${swatch('焦点环', '--ring', '键盘焦点')}${swatch('遮罩', '--scrim', '模态背景')}</div>`),
    ),
  )

  const kindRows = Object.keys(KINDS)
    .map(k => `<tr><td>${kchip(k, { full: true })}</td><td><span class="ktile k-${k}" style="width:30px;height:30px">${I(KINDS[k].icon)}</span></td><td class="mono t-xs muted">--k-${k}</td><td>${KINDS[k].when}</td><td><span class="cv-tag">${KINDS[k].rel}</span></td></tr>`)
    .join('')
  const kind = group(
    { id: 'ds-kind', title: 'Kind 体系', small: 'kinds §1', desc: '九种 kind 是产品里出现频率最高的标识。每种都用<b>图标 + 文字 + 颜色</b>三重编码，颜色只是辅助；芯片底色与文字色由同一个 --k 混合得出，亮暗两套自动适配。' },
    row(
      specGroup('芯片 · 图块', 'kchip（22px）用于卡片和列表，ktile（32px）用于需要更大识别度的位置。', `<table class="sp-table"><thead><tr><th>kind</th><th>图块</th><th>令牌</th><th>一句话</th><th>版本</th></tr></thead><tbody>${kindRows}</tbody></table>`),
      specGroup('尺寸与组合', '三档：采集窗口里的选择器（带选中态）、列表里的芯片、详情页的完整名称。', `<div class="vs g16">
        <div><div class="t-xs muted" style="margin-bottom:6px">采集窗口选择器（选中项带图标与着色）</div>${cmKinds('concept', { inferred: true })}</div>
        <div><div class="t-xs muted" style="margin-bottom:6px">列表芯片 · 小号 / 标准</div><div class="hs g8 wrap">${KIND_ORDER.map(k => kchip(k, { sm: true })).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">详情页完整名称</div><div class="hs g8 wrap">${['question', 'inspiration', 'visual', 'media-clip'].map(k => kchip(k, { full: true })).join('')}</div></div>
        <div class="banner info">${I('eye')}<div>色盲友好：去掉颜色后仍可凭图标与文字区分；<b>kind 自动推断</b>只是建议，选择器始终可见（推断修正率 &gt; 20% 时不得隐藏）。</div></div></div>`),
    ),
  )

  const type = group(
    { id: 'ds-type', title: '字阶、间距与圆角', small: '', desc: '界面字体用系统字体栈（SF Pro / PingFang SC），不嵌入网络字体。基础字号 13px，扩展与 Desktop 共用同一套层级；网页模拟使用衬线体仅为区分“用户的网页”和“我们的界面”。' },
    row(
      specGroup('字阶', '', `<div class="vs g10">
        ${[['今日标题 · Display', '今天需要完成什么', '28 / 700 · -0.02em'], ['标题 2XL', '碎片库', '22 / 700'], ['标题 XL', '到期复习', '18 / 650'], ['标题 LG', '最近由扩展写入', '15 / 650'], ['正文 / 控件', '用自己的话解释它，并给出一个适用边界。', '13 / 400–500'], ['辅助', '5 条 · 预计 4 分钟', '12 / 400'], ['标注', 'engineering.example.com · 3 天前', '11 / 400']]
          .map(([n, s, spec], i) => `<div class="hs between" style="border-bottom:1px solid var(--line);padding-bottom:8px"><span style="font-size:${[28, 22, 18, 15, 13, 12, 11][i]}px;font-weight:${[700, 700, 650, 650, 500, 400, 400][i]};letter-spacing:${i === 0 ? '-0.02em' : '0'}">${s}</span><span class="t-xs muted none" style="text-align:right">${n}<br>${spec}</span></div>`).join('')}
        <div class="hs between"><span class="mono" style="font-size:14px;letter-spacing:.1em">K7QX-39FD-M2LA</span><span class="t-xs muted">等宽 · 配对码、尺寸标签、代码</span></div></div>`),
      specGroup('间距、圆角、阴影', '4px 基准。圆角随容器层级递增，窗口最大。', `<div class="vs g16">
        <div><div class="t-xs muted" style="margin-bottom:6px">间距（4 / 8 / 12 / 16 / 20 / 24）</div><div class="hs g8" style="align-items:flex-end">${[4, 8, 12, 16, 20, 24].map(n => `<div class="vs g4" style="align-items:center"><i style="display:block;width:${n}px;height:${n}px;background:color-mix(in oklab,var(--brand) 30%,var(--surface));border-radius:2px"></i><span class="t-xs muted tnum">${n}</span></div>`).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:6px">圆角：控件 8 · 芯片 6 · 卡片 12–16 · 采集窗口 16 · macOS 窗口 24 · 胶囊 999</div><div class="hs g10">${[6, 8, 12, 16, 24, 999].map(r => `<i style="display:block;width:52px;height:36px;border:1.5px solid var(--line-2);background:var(--surface-2);border-radius:${Math.min(r, 18)}px"></i>`).join('')}</div></div>
        <div><div class="t-xs muted" style="margin-bottom:8px">阴影：卡片 · 浮层 · 模态 · 窗口</div><div class="hs g14" style="gap:16px;padding:6px 4px 12px">${['--sh-1', '--sh-2', '--sh-modal', '--sh-window'].map(v => `<i style="display:block;width:68px;height:44px;border-radius:12px;background:var(--surface);box-shadow:var(${v})"></i>`).join('')}</div></div></div>`),
    ),
  )

  const comps = board({
    title: '组件速查（扩展 · macOS 两种质感）',
    ref: 'extension §4 · desktop §5',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:26px 28px 30px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px 28px">
      <div class="vs g12"><div class="mh">按钮 · 扩展（8px 圆角）</div>
        <div class="hs g8 wrap">${btn('主按钮', { v: 'primary' })}${btn('次按钮', {})}${btn('幽灵', { v: 'ghost' })}${btn('删除', { v: 'danger' })}</div>
        <div class="hs g8 wrap">${btn('保存', { v: 'primary', kbd: '⌘↵' })}${btn('聚焦', { focus: true })}${btn('禁用', { off: true })}${btn('带图标', { icon: 'download' })}${btn('', { icon: 'ellipsis', iconOnly: true })}</div>
        <div class="hs g8 wrap">${btn('大', { lg: true, v: 'primary' })}${btn('标准', { v: 'primary' })}${btn('小', { sm: true, v: 'primary' })}</div>
        <div class="mh" style="margin-top:6px">按钮 · macOS（胶囊）</div>
        <div class="mac hs g8 wrap">${btn('开始复习', { v: 'primary', lg: true })}${btn('次按钮', {})}${btn('幽灵', { v: 'ghost' })}${btn('删除', { v: 'danger-solid' })}</div></div>
      <div class="vs g12"><div class="mh">表单</div>
        ${field('文本框', input('默认', {}))}${field('聚焦', input('正在输入', { focus: true }))}${field('错误', input('不合法的值', { err: true }), { help: '再具体一点：用在哪个任务？', err: true })}
        <div class="hs g16 wrap">${cbx(true, '勾选')}${cbx(false, '未勾选')}${rdo(true, '单选')}${rdo(false, '单选')}${sw(true)}${sw(false)}</div>
        <div class="hs g12"><span class="seg"><span class="on">标准</span><span>深度</span></span><span class="seg"><span>支持</span><span>反对</span><span class="on">不确定</span></span></div></div>
      <div class="vs g12"><div class="mh">芯片与徽标</div>
        <div class="hs g6 wrap">${kchip('concept')}${kchip('claim')}${kchip('procedure', { sm: true })}</div>
        <div class="hs g6 wrap">${srcBadge('source-material')}${srcBadge('manual')}${srcBadge('llm', { pending: true })}${srcBadge('llm')}</div>
        <div class="hs g6 wrap">${chip('已确认 · 周一', { icon: 'circle-check', v: 'ok' })}${chip('到期', { icon: 'clock', v: 'warn' })}${chip('待加强', { icon: 'circle-alert', v: 'warn' })}${chip('失败', { icon: 'circle-x', v: 'danger' })}${chip('系统建议', { icon: 'sparkles', cls: 'chip-suggest' })}</div>
        <div class="hs g6 wrap">${conn('none')}${conn('ok', { extra: '2 分钟前交付' })}${conn('pending', { n: '3' })}${conn('error')}</div>
        <div class="hs g8 wrap">${tags(['retry', 'streams'])}${keys('⌘', 'K')}${keys('1')}${keys('Esc')}</div></div>
      <div class="vs g10" style="grid-column:span 2"><div class="mh">提示与反馈</div>
        <div class="hs g12 top"><div class="grow vs g8">${banner('info', '<b>信息</b>：扩展可以独立工作。')}${banner('ok', '<b>成功</b>：已连接。')}${banner('warn', '<b>待处理</b>：1 张图片待重试。')}${banner('danger', '<b>失败</b>：没有保存成功，输入都还在。', { action: btn('重试', { sm: true }) })}</div>
        <div class="vs g10 none" style="width:330px">${toast('已剪藏 · 不进入复习 <span class="act" style="margin-left:6px">撤销</span>', { icon: 'bookmark' })}<div class="hs g10">${tipBubble('碎片', '理解并应用 · 进入复习', 'position:static;flex:none')}<div class="menu" style="min-width:140px;flex:none">${menuItem('download', '导出内容', { on: true })}${menuItem('highlighter', '高亮列表')}${menuItem('bookmark', '剪藏列表')}</div></div></div></div></div>
      <div class="vs g10"><div class="mh">进度与步骤</div>
        <div class="progress"><i style="width:62%"></i></div>
        <div class="cm-steps" style="padding:0"><span class="cm-step done"><span class="n">${I('check')}</span>核验</span>${I('chevron-right', 'cm-chev')}<span class="cm-step on"><span class="n">2</span>应用</span></div>
        <div class="rv-prog"><i class="done"></i><i class="done"></i><i class="cur"></i><i></i><i></i></div>
        <div class="mac"><div class="rv-rate" style="margin-top:0;grid-template-columns:repeat(2,1fr)">${RATINGS.slice(0, 2).map((r, i) => `<div class="${r.id}"><kbd>${r.key}</kbd><div class="nm">${r.zh}</div><div class="iv">1 天</div></div>`).join('')}</div></div></div>
    </div>`,
    notes: ['按钮在扩展里是 8px 圆角，在 macOS 里是胶囊，遵循各自平台的默认形状；色彩、字阶与状态语法完全共用。', '所有可点击元素都有可见的焦点环（品牌紫 40% 的 2px 外环）；禁用态降到 45% 不透明度，并在需要时给出原因，而不是只置灰。'],
  })

  const grammar = board({
    title: '三条贯穿全局的视觉语法',
    ref: 'product §6 · ai §4 · extension §10.1',
    w: 1536,
    cls: 'ui',
    body: `<div style="padding:26px 28px 28px;display:grid;grid-template-columns:repeat(3,1fr);gap:26px">
      <div class="vs g12"><b class="t-lg">1 · 建议 ≠ 事实</b><div class="help" style="margin-top:-6px">一切由规则或模型提出、尚待用户确认的内容，统一用<b>虚线描边 + sparkles 图标 + 明确标签</b>；用户确认后才变成实线。</div>
        <div class="vs g8"><div class="hs g8">${srcBadge('llm', { pending: true })}<span class="t-sm muted">→ 采用后</span>${srcBadge('llm')}</div>
          <div class="suggest-card vs g6"><div class="hs between">${chip('模型建议 · 未确认', { icon: 'sparkles', cls: 'chip-suggest' })}</div><div class="t-md">不只是固定速率限流，还涉及队列边界和反馈机制。</div><div class="hs g6">${btn('采用', { sm: true, v: 'primary' })}${btn('忽略', { sm: true, v: 'ghost' })}</div></div>
          <div class="hs g6">${chip('自动推断', { icon: 'sparkles', cls: 'chip-suggest' })}<span class="t-sm muted">kind 默认值，可改</span></div></div></div>
      <div class="vs g12"><b class="t-lg">2 · 状态不只靠颜色</b><div class="help" style="margin-top:-6px">每个状态至少有两种线索：<b>图标 / 文字 / 形状</b> 之一加颜色。</div>
        <table class="sp-table" style="font-size:12.5px"><tbody>
          <tr><td>核验已确认</td><td>${chip('已确认 · 周一', { icon: 'circle-check', v: 'ok' })}</td></tr>
          <tr><td>有待发送</td><td>${conn('pending', { n: '记录 3 · 图片 1' })}</td></tr>
          <tr><td>交付错误</td><td>${conn('error')}</td></tr>
          <tr><td>到期</td><td>${chip('到期', { icon: 'clock', v: 'warn' })}</td></tr>
          <tr><td>步骤状态</td><td><span class="cm-step done"><span class="n">${I('check')}</span>核验</span> <span class="cm-step on"><span class="n">2</span>应用</span> <span class="cm-step off"><span class="n">1</span>理解</span></td></tr>
          <tr><td>评分</td><td><span class="chip" style="border-top:3px solid var(--danger)">1 再来一次</span> <span class="chip" style="border-top:3px solid var(--brand)">3 良好</span></td></tr></tbody></table></div>
      <div class="vs g12"><b class="t-lg">3 · 来源始终可见</b><div class="help" style="margin-top:-6px">任何一条内容都能回答“这是谁说的、什么时候确认的”。</div>
        <div class="vs g8">
          <div class="hs g8 wrap">${srcBadge('source-material')}<span class="t-sm muted">来自原始材料</span></div>
          <div class="hs g8 wrap">${srcBadge('manual')}<span class="t-sm muted">你自己写的</span></div>
          <div class="hs g8 wrap">${chip('本地来源 · annhub://manual', { icon: 'lock' })}<span class="t-sm muted">不伪装成网页</span></div>
          <div class="banner brand">${I('link')}<div>每张卡片、揭示面和详情都带<b>来源 host + 回到原文</b>；定位失败时仍显示足以独立理解的语境。</div></div></div></div>
    </div>`,
    notes: ['这三条语法对应 product §6 的原则 3、6、2：先生成后辅助、建议不等于事实、原文可追溯。它们决定了一个组件“长什么样”，而不是单个页面的设计。'],
  })

  const iconRows = [
    ['碎片', 'brain', 'brain', '选区菜单（docs 指定）'], ['高亮', 'highlighter', 'highlighter', '选区菜单（docs 指定）'], ['剪藏', 'bookmark', 'bookmark', '选区菜单（docs 指定）'], ['截图', 'scan', 'viewfinder', '选区菜单（docs 指定）'], ['媒体片段', 'film', 'film', 'R4'],
    ['概念', 'atom', 'atom', 'kind'], ['论点', 'scale', 'scalemass', 'kind'], ['方法', 'list-checks', 'checklist', 'kind'], ['决策', 'git-branch', 'arrow.triangle.branch', 'kind'], ['问题', 'circle-question-mark', 'questionmark.circle', 'kind'], ['灵感', 'lightbulb', 'lightbulb', 'kind'], ['视觉', 'image', 'photo', 'kind'], ['摘录', 'quote', 'quote.opening', 'kind'],
    ['今日', 'sun', 'sun.max', 'Desktop 导航'], ['碎片库', 'layout-grid', 'square.grid.2x2', 'Desktop 导航'], ['系统', 'settings', 'gearshape.2', 'Desktop 导航'],
    ['已确认', 'circle-check', 'checkmark.circle.fill', '状态'], ['待处理 / 到期', 'clock', 'clock', '状态'], ['警告', 'triangle-alert', 'exclamationmark.triangle', '状态'], ['建议', 'sparkles', 'sparkles', '状态'], ['本机 / 锁定', 'lock', 'lock', '状态'], ['删除', 'trash-2', 'trash', '操作'],
  ]
  const icons = board({
    title: '图标对照 · lucide（扩展）↔ SF Symbols（Desktop）',
    ref: 'extension §2.1 · desktop §2',
    w: 1536,
    body: `<div style="padding:24px 28px 28px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px 28px">${iconRows.map(([n, l, sf, u]) => `<div class="hs g10" style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="ktile" style="width:30px;height:30px;background:var(--surface-2);color:var(--fg-2)">${I(l)}</span><div class="grow" style="min-width:0"><div class="b t-md">${n}</div><div class="mono t-xs muted truncate">${l} ↔ ${sf}</div></div><span class="t-xs muted-2 none">${u}</span></div>`).join('')}</div></div>`,
    notes: ['扩展使用 lucide（仓库已有依赖），docs/extension.md 明确指定了 brain / highlighter / bookmark / scan / film；Desktop 使用 SF Symbols，侧栏三项为 sun.max、square.grid.2x2、gearshape.2。', '浏览器里无法渲染 SF Symbols，本稿用最接近的 lucide 图形代替；落地时以 SF Symbols 为准。'],
  })

  const a11y = board({
    title: '动效、焦点与可访问性',
    ref: 'extension §4.1 · §4.7 · §10 · desktop §9',
    w: 1536,
    body: `<div style="padding:24px 28px 28px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px" class="ui">
      <div class="vs g8"><b>动效</b><table class="sp-table" style="font-size:12.5px"><tbody>
        <tr><td>保存成功</td><td>约 700ms 后自动关闭</td></tr><tr><td>悬停提示</td><td>延迟约 300ms，淡入 120ms</td></tr><tr><td>步骤切换</td><td>内容淡入 150ms；<b>窗口外框不变</b></td></tr><tr><td>评分后</td><td>卡片切换 200ms，游标在写入成功后才前进</td></tr><tr><td>减少动态</td><td>全部降级为瞬时切换</td></tr></tbody></table></div>
      <div class="vs g8"><b>焦点与键盘</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>窗口打开时焦点进入并被限制在窗口内，关闭后回到触发位置</li><li>采集窗口 ⌘/Ctrl+↵ 继续或保存，Esc 请求关闭</li><li>复习 1…4 评分（揭示前无效），Space 揭示</li><li>Desktop ⌘K 搜索，⌘1…3 切页面</li><li>选区菜单可用 Tab / ← → / Enter，不抢页面焦点</li></ul></div>
      <div class="vs g8"><b>读屏与语义</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>每张卡片读出：kind、标题、来源、到期状态</li><li>采集窗口读出：当前步骤（第几步 / 共几步）与来源</li><li>图标按钮一律有 aria-label；装饰性图标 aria-hidden</li></ul></div>
      <div class="vs g8"><b>对比度与尺寸</b><ul class="t-sm" style="margin:0;padding-left:18px;line-height:1.75;color:var(--fg-2)"><li>正文与控件文字对背景 ≥ 4.5:1（亮 / 暗两套都校验，见下方实测表）</li><li>状态传达至少两种线索，不只靠颜色</li><li>可点击区域 ≥ 28px 高；主要按钮 32–36px</li><li>文字可随系统字号放大，布局不依赖固定字数</li></ul></div>
    </div>`,
    notes: ['这些数值是本稿的建议起点，落地后在首次使用走查（E-03）里验证；与各 PRD 的验收条款一致。'],
  })

  const contrast = `<div class="sp-card ui" style="margin-top:22px"><h5>实测对比度（本页实时计算）</h5><p>按当前主题，对每种 kind 芯片的文字色与底色计算 WCAG 对比度；低于 4.5:1 的会标红。切换页眉的亮 / 暗主题后会重新计算。</p><div id="contrast-table"></div></div>`

  return section(
    {
      id: 'system',
      nav: '设计系统',
      eyebrow: 'Design System',
      title: '一套令牌，两种质感',
      lead: '扩展与 Desktop 共用同一套令牌、字阶与状态语法，只在控件形状上遵循各自平台（扩展 8px 圆角，macOS 胶囊）。下面是落地时需要对齐的最小集合。',
      sub: [['ds-color', '色彩'], ['ds-kind', 'Kind 体系'], ['ds-type', '字阶与间距'], ['ds-components', '组件'], ['ds-grammar', '视觉语法'], ['ds-icons', '图标'], ['ds-a11y', '动效与可访问性']],
    },
    color,
    kind,
    type,
    group({ id: 'ds-components', title: '组件', small: '', desc: '最常用的基础件。所有画板都由它们拼装，不引入额外的一次性样式。' }, row(comps)),
    group({ id: 'ds-grammar', title: '视觉语法', small: 'product §6', desc: '比单个组件更重要的是三条跨组件的约定。' }, row(grammar)),
    group({ id: 'ds-icons', title: '图标', small: '', desc: '两端各用本平台的图标库，语义一一对应。' }, row(icons)),
    group({ id: 'ds-a11y', title: '动效与可访问性', small: '', desc: '' }, row(a11y), contrast),
  )
}

// 运行时：色板回填十六进制、kind 芯片对比度实测
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
  const rows = Object.keys(KINDS).map(k => {
    const probe = document.createElement('span')
    probe.className = `kchip k-${k}`
    probe.style.cssText = 'position:absolute;left:-9999px;top:0'
    const wrap = document.createElement('div')
    wrap.className = 'ui'
    wrap.appendChild(probe)
    document.body.appendChild(wrap)
    const cs = getComputedStyle(probe)
    const fg = toRgb(cs.color)
    const bg = toRgb(cs.backgroundColor)
    // 芯片底色带透明度时，叠加到 surface 上计算
    const surf = toRgb(getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff')
    const mix = bg.map((v, i) => (i < 3 ? Math.round(v * bg[3] + surf[i] * (1 - bg[3])) : 1))
    const r = ratio(fg, mix)
    wrap.remove()
    return `<tr><td>${kchip(k)}</td><td class="mono t-xs">${hex(fg)} on ${hex(mix)}</td><td class="tnum b ${r < 4.5 ? 'c-danger' : 'c-ok'}">${r.toFixed(2)} : 1</td><td>${r < 4.5 ? '低于 4.5:1，需要调整' : '达标'}</td></tr>`
  })
  host.innerHTML = `<table class="sp-table" style="font-size:12.5px"><thead><tr><th>kind</th><th>文字色 / 底色</th><th>对比度</th><th>结论</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}
