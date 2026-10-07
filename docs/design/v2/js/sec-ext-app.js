// 应用页（左导航 + 右内容）：资料库的各视图、条目详情与属性、属性页、设置、空状态、窄窗口、导出、弹窗。
// 依据 extension.md §2.2–§2.6、§4、§5 与 entry.md §5。

const listHead = (title, sub, o = {}) => pageHead({ title, sub, right: searchBox({ q: o.q, focus: o.focus, pin: o.pinSearch }), pin: 0 })

// ── 资料库：全部 / 高亮 / 截图 ──────────────────────────────────────────────
function extAppGroup() {
  const all = board({
    title: '全部 · 统一列表与筛选',
    ref: 'extension §2.2 · §2.3 · search §3',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        pins: { nav: 1, foot: 5 },
        main: `${pageHead({ title: '全部', sub: '128 条 · 71 剪藏 · 33 高亮 · 24 截图', right: searchBox({ pin: 2 }) })}
          <div class="pbody cap">
            ${fbar({ pin: 3 })}
            ${entryList(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], { hov: 'e2', pinId: 'e1', pinN: 4 })}
          </div>`,
      }),
      { active: 'all', h: 800 },
    ),
    notes: [
      '<b>所有扩展页面都是“左侧导航 + 右侧内容”</b>：资料库的各个视图、属性页、设置页和弹窗共用同一套壳，导航的位置与顺序在所有页面里一致。当前视图用<b>底色、加粗和左侧竖条</b>标出，不只靠颜色（<code>aria-current="page"</code>）。',
      '搜索在页头右侧，按 <kbd>/</kbd> 聚焦；覆盖原文、语境、备注、来源和文本 / 列表属性（search §1），空查询只执行筛选。',
      '筛选条：类型（<b>只在“全部”里有</b>）、来源、标签、时间、属性。同维度 OR、跨维度 AND；条件写入 URL，刷新后恢复。',
      '每一行都带<b>类型图标 + 文字</b>、原文摘要、页面标题、来源主机、相对时间、标签，以及自定义属性的小标签（如 <code>project</code>）。列表类视图限制最大行宽以保证可读。“剪藏”视图与它同构，只是按 <code>type</code> 过滤，筛选条里没有“类型”。',
      '导航底部放<b>导出内容</b>（唯一的导出入口）、存储用量和截图快捷键提示；设置只通过导航进入，不在别处重复。',
    ],
  })

  const byProp = board({
    title: '筛选 · 按属性',
    ref: 'search §3 · entry §5.2',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        main: `${pageHead({ title: '全部', sub: '筛选后 2 条', right: searchBox({ q: '幂等键' }) })}
          <div class="pbody cap">
            <div style="position:relative">
              ${fbar({ active: [{ icon: 'layout-grid', label: '类型：高亮' }, { icon: 'sliders-horizontal', label: 'project 等于 支付重试' }], count: '2 条' })}
              <div class="pcombo" style="position:absolute;left:340px;top:36px;width:340px;z-index:6">${pin(1, 'pin-in')}
                <div class="hs g8" style="padding:4px 4px 8px"><span class="ptype on" style="flex:1">${pticon('text')}project</span><span class="chip">${PTYPES.text.zh}</span></div>
                <div class="hs g8" style="padding:0 4px 6px"><span class="select" style="min-height:30px;width:112px;font-size:12.5px">等于${I('chevron-down', 'i-sm muted')}</span><div class="input is-focus" style="min-height:30px;flex:1;font-size:12.5px">支付重试<i class="caret"></i></div></div>
                <div class="t-xs muted" style="padding:2px 6px 6px">${pin(2, 'pin-r')}运算符随属性类型：文本为包含 / 等于，列表为含有某一项，数字为等于 / 大于 / 小于 / 区间，复选框为是 / 否，日期与日期时间为区间。</div>
              </div>
            </div>
            <div style="height:128px"></div>
            ${entryList(['e2', 'e13'], { pinId: 'e2', pinN: 3 })}
          </div>`,
      }),
      { active: 'all', h: 640 },
    ),
    notes: [
      '“属性”筛选先从注册表里选一个属性，<b>运算符由它的类型决定</b>；多个属性条件之间取 AND，已生效的条件显示为高亮芯片，可逐个移除。',
      '运算符按类型给出：文本包含 / 等于；列表含有某一项；数字等于 / 大于 / 小于 / 区间；复选框是 / 否；日期与日期时间区间（search §3）。',
      '搜索词与筛选条件取 AND：这里先搜“幂等键”再按类型与 <code>project</code> 缩小，结果 2 条；筛选写入地址栏，刷新后仍在（examples §2.3）。',
    ],
  })

  const hl = board({
    title: '高亮 · 按页面分组',
    ref: 'extension §2.3 · capture §6',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'highlight',
        main: `${pageHead({ title: '高亮', sub: '33 条 · 来自 12 个页面', right: searchBox({}) })}
          <div class="pbody cap">
            ${fbar({ noType: true, count: '共 33 条' })}
            ${hlGroup('Retries and backpressure', 'engineering.example.com', ['e2', 'e13'], { pin: 1 })}
            ${hlGroup('Backpressure in Streams', 'engineering.example.com', ['e8', 'e14'], { fav: 1 })}
            ${hlGroup('Production incident triage', 'sre.example.org', ['e11'], { fav: 2 })}
          </div>`,
      }),
      { active: 'highlight', h: 800 },
    ),
    notes: [
      '高亮按<b>来源页面</b>分组：组头是页面标题、主机和条数，“回到来源”打开原页面并尽力定位；回访该页面时，这些标记会恢复。',
      '每行左侧的色条是它的 <code>color</code> 属性（调色板五色），原文下方是备注。颜色只是用户的选择，不承担含义。',
    ],
  })

  const shots = board({
    title: '截图 · 画廊',
    ref: 'extension §2.3 · screenshot §4',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'screenshot',
        main: `${pageHead({ title: '截图', sub: '24 张 · 已保存 89 MB', right: searchBox({}) })}
          <div class="pbody">
            ${fbar({ noType: true, count: '共 24 张' })}
            <div class="gal">${['e3', 'e7', 'e10', 'e12', 'e3', 'e7'].map((id, i) => galTile(ENTRIES0.find(e => e.id === id), { act: i === 0, sel: i === 0, pin: i === 0 ? 1 : 0 })).join('')}</div>
          </div>`,
      }),
      { active: 'screenshot', h: 800 },
    ),
    notes: [
      '截图是画廊：缩略图、标题、来源主机和属性小标签；悬停出现<b>下载</b>与<b>删除</b>，点开进入右侧详情抽屉。',
      '截图与剪藏、高亮是<b>同一种条目</b>：同样可以加标签和属性、同样被搜索与筛选覆盖。删除一张截图会同时删除它的图片。',
    ],
  })

  return group(
    { id: 'ext-app', title: '资料库：左导航 + 右内容', small: 'extension §2.2 · §2.3', desc: '一个应用页，左边是导航，右边是内容。“全部 / 剪藏 / 高亮 / 截图”是同一份数据的四个视图，共用搜索与筛选；切换视图时导航不动。' },
    row(all),
    row(byProp),
    row(hl),
    row(shots),
  )
}

// ── 条目详情与属性 ─────────────────────────────────────────────────────────
function extDetailGroup() {
  const e1 = ENTRIES0.find(e => e.id === 'e1')
  const e2 = ENTRIES0.find(e => e.id === 'e2')
  const e3 = ENTRIES0.find(e => e.id === 'e3')

  const detail = board({
    title: '条目详情 · 抽屉',
    ref: 'extension §4 · entry §5',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        main: `${pageHead({ title: '全部', sub: '128 条', right: searchBox({}) })}
          <div class="pbody cap">${fbar({})}${entryList(['e1', 'e2', 'e3', 'e4', 'e5'], { sel: 'e1' })}</div>`,
        drawer: drawer(e1, { pin: 1, hovTags: true }),
      }),
      { active: 'all', h: 1010 },
    ),
    notes: [
      '点一条条目，在右侧<b>抽屉</b>里打开详情；Esc 或点击遮罩关闭，窄窗口里抽屉占满内容区。标题可以直接改。',
      '<b>原文</b>与<b>备注</b>分开：原文来自页面，备注是用户自己的话；语境（所在句或段）作为原文的补充显示。',
      '<b>属性面板</b>与 Obsidian 的 Properties 同构：左边是类型图标与名称，右边是值编辑器。内置属性在前（title、tags、author、published…），自定义属性在后（project、reviewed…）。',
      '最下面是<b>系统字段，只读</b>（source、created、updated、type），带锁形图标；它们是系统字段而不是属性，导出时映射为 frontmatter 键。',
      '可编辑范围：标题、备注、全部属性；<code>clip</code> 的原文与语境可改；<code>highlight</code> 的原文与来源只读，因为页面标记靠它们恢复（extension §4）。',
    ],
  })

  const panel = (inner, h = 760) => `<div style="position:relative;height:${h}px;width:440px;background:var(--surface-2)">${inner}</div>`

  const addProp = board({
    title: '添加属性 · 补全、新建与校验',
    ref: 'extension §4 · entry §5.3',
    tag: 'R2',
    w: 1380,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:22px 22px 26px">
      <div style="display:grid;grid-template-columns:repeat(3,440px);gap:22px">
        ${panel(drawer(e1, { propsOnly: true, combo: { mode: 'search', q: 'pro', pin: 1 } }), 640)}
        ${panel(drawer(e1, { propsOnly: true, combo: { mode: 'create', q: 'owner', type: 'text', pin: 2 } }), 640)}
        ${panel(drawer(e1, { propsOnly: true, combo: { mode: 'create', q: 'source', type: 'text', error: '“source” 是保留名，不能用作属性名（还有 id、type、created、updated、content、note 和 annhub_ 开头的名称）。', pin: 3 } }), 640)}
      </div></div>`,
    notes: [
      '“+ 添加属性”打开一个<b>从注册表补全</b>的输入：边输边列出匹配的属性，每项带类型图标与类型名；选中即加到这条条目上，值的编辑器按类型出现。',
      '注册表里没有的名称，列表末尾给出<b>“创建属性”</b>：必须同时选一个类型（六选一），创建后写入注册表并立刻加到当前条目；类型创建后不可更改（entry §5.3 第 1、4 条）。',
      '校验就地给出原因：保留名（<code>id</code>、<code>type</code>、<code>source</code>、<code>created</code>、<code>updated</code>、<code>content</code>、<code>note</code>、<code>annhub_</code> 前缀）会被拒绝，按钮置灰；名称 1–64 字符、条目内不区分大小写唯一、每条条目至多 50 个属性。',
    ],
  })

  const variants = board({
    title: '详情 · 高亮与截图',
    ref: 'extension §4 · entry §3',
    tag: 'R2',
    w: 940,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:22px 22px 26px"><div style="display:grid;grid-template-columns:repeat(2,440px);gap:22px">
      ${panel(drawer(e2, { pin: 1 }), 960)}${panel(drawer(e3, { pin: 2 }), 960)}</div></div>`,
    notes: [
      '<b>高亮</b>：原文旁的色条取自 <code>color</code> 属性，原文与来源只读，备注可写；颜色在属性面板里换，页面上的标记同步变色。',
      '<b>截图</b>：显示可放大的图片和下载，没有“原文”；标题、备注、属性与另外两种类型完全一样——这就是“同一种条目”。',
    ],
  })

  return group(
    { id: 'ext-detail', title: '条目详情与属性', small: 'extension §4 · entry §5', desc: '三种类型共用同一个详情结构和同一个属性面板；差别只在上方的“原文 / 图片”那一块。' },
    row(detail),
    row(addProp),
    row(variants),
  )
}

// ── 属性页 ─────────────────────────────────────────────────────────────────
function extPropsGroup() {
  const reg = board({
    title: '属性页 · 注册表',
    ref: 'extension §2.4 · entry §5.3 · §5.4',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'properties',
        main: `${pageHead({ title: '属性', sub: '10 个属性 · 内置 6 · 自定义 4', right: `<span class="hs g8" style="position:relative">${pin(1, 'pin-l')}${btn('删除未使用（1）', { icon: 'trash' })}${btn('新建属性', { v: 'primary', icon: 'plus' })}</span>` })}
          <div class="pbody">
            ${banner('info', '<b>名称与类型全局绑定</b>：同一个名称在所有条目里是同一种类型。使用数为 0 才能删除；已被使用的属性不能改类型，也不提供重命名。', { cls: '' })}
            ${ptab({ pin: 2, sel: 'project' })}
          </div>`,
      }),
      { active: 'properties', h: 800 },
    ),
    notes: [
      '属性页是<b>属性注册表</b>的管理界面（借鉴 Obsidian Web Clipper 的属性类型表）：类型图标 + 名称、类型、默认值、<b>使用数</b>、剪藏 / 高亮 / 截图三列<b>类型预设</b>。',
      '<b>类型预设</b>：勾选后，采集该类型的条目时自动附加这个属性并带上默认值。<code>title</code> 与 <code>tags</code> 对三种类型固定附加（带锁，不可取消）；<code>tags</code> 永远存在。',
      '删除按钮只在“使用数为 0 且非内置”时可用，其余灰掉并说明原因（使用中 / 内置）；顶部的“删除未使用”一次清理使用数为 0 的自定义属性，先列出将被删除的名称。',
    ],
  })

  const card = (title, inner, pinN) => `<div class="set" style="position:relative;padding:16px 18px 18px"><div class="b t-md hs g6" style="margin-bottom:10px">${pin(pinN, 'pin-s')}${title}</div>${inner}</div>`
  const rules = board({
    title: '属性页 · 校验与限制',
    ref: 'entry §5.3 · §6',
    tag: 'R2',
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:22px 24px 26px"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px">
      ${card('新建：名称是保留名', `<div class="vs g8"><div class="hs g8">${input('source', { err: true, style: 'flex:1;min-height:32px' })}${select('文本', { style: 'width:104px;min-height:32px' })}</div><div class="help is-error hs g6">${I('circle-alert', 'i-sm')}<span>“source” 是保留名，换一个名称。</span></div><div class="hs g8 end">${btn('取消', { sm: true, v: 'ghost' })}${btn('创建', { sm: true, v: 'primary', off: true })}</div></div>`, 1)}
      ${card('新建：名称已存在', `<div class="vs g8"><div class="hs g8">${input('Project', { err: true, style: 'flex:1;min-height:32px' })}${select('数字', { style: 'width:104px;min-height:32px' })}</div><div class="help is-error hs g6">${I('circle-alert', 'i-sm')}<span>已有 <b>project</b>（文本）。名称不区分大小写，同名属性必须是同一种类型。</span></div><div class="hs g8 end">${btn('取消', { sm: true, v: 'ghost' })}${btn('创建', { sm: true, v: 'primary', off: true })}</div></div>`, 2)}
      ${card('删除：使用中的属性', `<div class="vs g8"><div class="ptab-r" style="border:1px solid var(--line);border-radius:10px;grid-template-columns:1fr auto;min-height:44px"><div class="nm">${pticon('text')}project</div><span class="chip">使用 6 条</span></div>${banner('warn', '<b>不能删除</b>：project 正被 6 条条目使用。先清空这些条目上的值，使用数为 0 后才能删除。类型也不能更改。')}</div>`, 3)}
    </div></div>`,
    notes: ['校验的原因都写在原地，按钮置灰而不是点了才报错；不提供重命名和改类型（先清空或新建一个名称），这是 v1 刻意的简化（entry §5.3 第 4 条、§5.6）。'],
  })

  return group(
    { id: 'ext-props', title: '属性页', small: 'extension §2.4 · entry §5', desc: '属性注册表：看到有哪些属性、各被多少条目使用，并为每种采集类型选好自动附加的属性。' },
    row(reg),
    row(rules),
  )
}

// ── 设置 ───────────────────────────────────────────────────────────────────
function extSettingsGroup() {
  const prefs =
    settingsRow('默认高亮颜色', '新建高亮时使用；每条高亮之后都可以改。', `<span class="hs g8">${HL_COLORS.map((c, i) => hlDot(c, i === 0)).join('')}</span>`) +
    settingsRow('截图默认匿名', '身份元素自动打上马赛克候选；每次截图时可以在预览里增删。', sw(true))
  const sc = `${settingsRow('连续高亮模式', '进入后每次选中创建一条高亮，Esc 退出。', `${keys('Alt', 'H')}<span class="muted">或</span>${keys('⌘', '⇧', 'H')}`)}${settingsRow('截图模式', '拖拽区域或单击元素。', `${keys('Ctrl', '⇧', 'S')}<span class="muted">/</span>${keys('⌘', '⇧', 'S')}`)}${settingsRow('关闭菜单 · 取消截图 · 关闭抽屉', '', keys('Esc'))}${settingsRow('在浏览器里修改快捷键', '浏览器级快捷键冲突在这里处理。', btn('打开', { sm: true, iconR: 'external-link' }))}`
  const data =
    `<div class="set-r"><div class="l grow" style="min-width:0"><b>本地存储</b><small>其中截图 89 MB。接近浏览器配额时，会在<b>保存前</b>提示，而不是写入失败后才告诉你。</small><div class="progress" style="margin-top:8px"><i style="width:3%"></i></div></div><div class="none tnum b">126 MB / 约 4.2 GB 可用</div></div>` +
    settingsRow('导出内容', '包含全部条目的 Markdown（属性即 frontmatter）和处理后的图片；不包含界面偏好，也不能用来恢复数据库。', btn('导出内容', { icon: 'download', v: 'primary' })) +
    settingsRow('异常残留', '没有任何条目引用的图片，以及指向缺失图片的条目。正常路径下为 0。', `<span class="muted">0 项</span>${btn('清理', { sm: true, off: true })}`)
  const metrics = `<div class="set-r" style="border-top:0">${banner('info', '指标<b>只在本机计算</b>，只显示聚合数字，<b>不显示原文、URL、标题或属性</b>。内测回访时共享屏幕给产品负责人看，没有导出或上传入口。', { cls: 'grow' })}</div>${metricRow('M-03', '采集用时（95 分位）', '剪藏 118 ms', '高亮 124 ms · 截图 —；护栏：剪藏、高亮 < 300 ms')}${metricRow('M-11', '激活', '24 小时内已再次打开', '安装后 24 小时内保存 1 条并再次打开')}${metricRow('M-19', '本周找回', '17 条', '被再次打开、搜索筛选后打开或导出的条目（去重）')}${metricRow('M-20', '属性使用率', '近 14 天已使用', '至少给一条条目加过标签或自定义属性')}`

  const page = board({
    title: '设置',
    ref: 'extension §2.5 · metrics §10 · storage §7',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'settings',
        pins: { nav: 1 },
        main: `${pageHead({ title: '设置', sub: '偏好只保存在本机' })}
          <div class="pbody" style="overflow:hidden"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;max-width:1040px;align-items:start">
            <div class="vs g16">${settingsCard('采集', '只有两项偏好，每一项都用一句话说清后果。', prefs, { pin: 2 })}${settingsCard('快捷键', '只显示当前绑定。', sc, { pin: 3 })}</div>
            <div class="vs g16">${settingsCard('数据', '', data, { pin: 4 })}${settingsCard('本地指标 · 阶段 V', '', metrics, { pin: 5 })}</div>
          </div></div>`,
      }),
      { active: 'settings', h: 1080 },
    ),
    notes: [
      '设置页和资料库<b>是同一套壳</b>（左导航 + 右内容），浏览器的“扩展选项”入口打开的就是这个页面（<code>#/settings</code>）。',
      '<b>采集</b>只有两项：默认高亮颜色、截图默认匿名；没有“模式”之类的开关——采集一步完成，不需要偏好来解释它。',
      '<b>快捷键</b>只展示文档定义的几组，浏览器级冲突去浏览器的快捷键设置页处理。',
      '<b>数据</b>：存储用量以“已用 / 可用”呈现；导出前说清包含与不包含；异常残留只有在出现异常时才会有数字。',
      '<b>本地指标</b>只在阶段 V 内测期间需要，只显示聚合数字，覆盖 M-03、M-11、M-19、M-20（metrics §5）。',
    ],
  })

  return group(
    { id: 'ext-settings', title: '设置', small: 'extension §2.5', desc: '设置页只放三类东西：怎么采集、本机有什么数据、阶段 V 的本地指标。' },
    row(page),
  )
}

// ── 空状态、窄窗口、导出 ───────────────────────────────────────────────────
function extStatesGroup() {
  const first = board({
    title: '首次使用 · 空库与引导卡',
    ref: 'extension §5 · metrics §2',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        counts: { all: null, clip: null, highlight: null, screenshot: null, properties: 6 },
        used: '0 MB',
        main: `${pageHead({ title: '全部', sub: '0 条', right: searchBox({}) })}
          <div class="pbody cap">
            ${onboarding({ pin: 1 })}
            ${emptyState('library', '还没有条目', '选中网页中的一段文字，点“剪藏”或“高亮”；按 ⌘⇧S 框选一张截图。', hoverMenu({ static: true, below: false, style: 'position:relative;display:inline-flex' }).replace('class="hm ', 'class="hm static '))}
          </div>`,
      }),
      { active: 'all', h: 640 },
    ),
    notes: ['安装后的第一屏：引导卡用三句话说明剪藏、高亮、截图各是什么，并给出“打开示例页面”；可关闭。示例页只用于试用，<b>不会混入用户的库</b>。', '空库不放营销信息，只告诉用户下一步做什么：选中文字，点菜单。'],
  })

  const none = board({
    title: '无搜索结果 · 保留筛选',
    ref: 'extension §5 · search §3',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'all',
        main: `${pageHead({ title: '全部', sub: '筛选后 0 条', right: searchBox({ q: 'kubernetes', focus: true }) })}
          <div class="pbody cap">
            ${fbar({ active: [{ icon: 'sliders-horizontal', label: 'project 等于 支付重试' }], count: '0 条' })}
            ${emptyState('search', '没有符合条件的条目', '当前搜索词与筛选条件下没有结果。筛选条件都还保留着，可以逐个移除。', btn('清除筛选', { v: 'primary' }))}
          </div>`,
      }),
      { active: 'all', h: 560 },
    ),
    notes: ['无结果时<b>保留当前筛选器</b>并提供“清除筛选”，不显示导入或营销信息。'],
  })

  const shotsEmpty = board({
    title: '截图视图为空',
    ref: 'extension §5',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'screenshot',
        counts: { all: 104, screenshot: 0 },
        main: `${pageHead({ title: '截图', sub: '0 张', right: searchBox({}) })}
          <div class="pbody">${emptyState('scan', '还没有截图', `按 ${keys('⌘', '⇧', 'S')}（Windows / Linux 为 ${keys('Ctrl', '⇧', 'S')}）进入截图：拖拽框选区域，或单击一个元素。`, btn('了解截图', { icon: 'arrow-up-right' }))}</div>`,
      }),
      { active: 'screenshot', h: 600 },
    ),
    notes: ['某个视图为空时，显示对应入口的提示，例如截图视图写明快捷键。'],
  })

  const narrow = board({
    title: '窄窗口 · 导航折叠为图标栏',
    ref: 'extension §2.2 · §7.2',
    tag: 'R2',
    w: 1480,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:20px"><div style="display:grid;grid-template-columns:repeat(2,700px);gap:20px">
      <div style="height:600px;position:relative;border-radius:12px;overflow:hidden;box-shadow:var(--sh-2)">${shell({
        active: 'all',
        rail: true,
        pins: { nav: 1 },
        main: `${pageHead({ title: '全部', sub: '128 条', right: searchBox({ w: 200 }) })}<div class="pbody">${fbar({ count: '128 条' })}${entryList(['e1', 'e2', 'e3', 'e4'], { hov: 'e2' })}</div>`,
      })}</div>
      <div style="height:600px;position:relative;border-radius:12px;overflow:hidden;box-shadow:var(--sh-2)">${shell({
        active: 'all',
        rail: true,
        main: `${pageHead({ title: '全部', sub: '128 条' })}<div class="pbody">${entryList(['e1', 'e2', 'e3'], { sel: 'e1' })}</div>`,
        drawer: drawer(ENTRIES0[0], { pin: 2 }),
      })}</div>
    </div></div>`,
    notes: [
      '窗口变窄（或用户手动折叠）时，导航<b>折叠成左侧 60px 的图标栏</b>，不会换成顶栏；图标有文字提示，当前视图仍有竖条和底色，仍可键盘操作。',
      '窄窗口里详情抽屉<b>占满内容区</b>（右图），Esc 或关闭按钮回到列表；折叠后导出变成图标按钮，存储用量收起。具体宽度与断点见“设计系统 · 应用壳规格”。',
    ],
  })

  const exp = board({
    title: '导出内容 · 四种状态',
    ref: 'storage §6 · extension §6',
    tag: 'R1',
    w: 1280,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:24px"><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;align-items:start">
      ${['ready', 'progress', 'full', 'partial'].map(s => exportDlg(s, { style: 'width:auto' })).join('')}</div></div>`,
    notes: ['导出是唯一的用户导出命令：前后都说清范围。缺失图片时<b>不得显示为完整成功</b>：状态写“部分导出”和数量，缺失的资产 ID 列入 README，仍允许下载部分 ZIP（storage §6）。'],
  })

  return group(
    { id: 'ext-states', title: '空状态、窄窗口与导出', small: 'extension §5 · §2.2', desc: '第一次打开、没有结果、窗口很窄、导出到一半缺了图片——这些状态都和正常状态用同一套壳。' },
    row(first),
    row(none),
    row(shotsEmpty),
    row(narrow),
    row(exp),
  )
}

// ── 工具栏弹窗 ─────────────────────────────────────────────────────────────
function extPopupGroup() {
  const pop = board({
    title: '工具栏弹窗 · 紧凑壳',
    ref: 'extension §2.6',
    tag: 'R2',
    w: 760,
    body: browser(
      `<div class="pg" style="height:100%"><div class="pg-nav"><b>engineering.example.com</b></div>
        <div style="position:absolute;right:14px;top:8px">${pin(1, 'pin-in')}${popup({ active: 'all' })}</div></div>`,
      { h: 460 },
    ),
    notes: [
      '弹窗是<b>同一套壳的紧凑版</b>：左边是图标栏（全部、剪藏、高亮、截图，带数量角标；设置在底部），右边是当前类型<b>最近 5 条</b>，点一条在资料库里打开它，“在资料库中打开”进入完整页面。',
      '它也是 <code>chrome://</code> 等页面内入口失效时的兜底。弹窗不提供编辑。',
    ],
  })
  const variants = board({
    title: '弹窗 · 切换到剪藏 / 截图',
    ref: 'extension §2.6',
    tag: 'R2',
    w: 1100,
    body: `<div class="app" style="height:auto;display:block;background:var(--surface-2);padding:22px"><div style="display:flex;gap:22px">${popup({ active: 'clip', items: ['e1', 'e4', 'e6', 'e9'].map(id => ENTRIES0.find(e => e.id === id)) })}${popup({ active: 'screenshot', items: ['e3', 'e7', 'e10', 'e12'].map(id => ENTRIES0.find(e => e.id === id)) })}</div></div>`,
    notes: ['左侧图标栏就是视图切换；每个视图只列最近 5 条，截图显示标题。想看更多或整理属性，进入资料库。'],
  })
  return group(
    { id: 'ext-popup', title: '工具栏弹窗', small: 'extension §2.6', desc: '点击浏览器工具栏图标时的落点：同一套“左导航 + 右内容”，只是更小。' },
    row(pop),
    row(variants),
  )
}
