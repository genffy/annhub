// macOS Desktop · 窗口与导航、今日、碎片库。

const kindBlock = (kind, o = {}) => {
  const li = items => `<div class="vs g4 t-md" style="line-height:1.55">${items.map((t, i) => `<div class="hs top g8"><span class="muted tnum" style="width:16px">${i + 1}.</span><span>${t}</span></div>`).join('')}</div>`
  const bl = (label, body) => `<div class="mh" style="margin:10px 0 4px">${label}</div>${body}`
  switch (kind) {
    case 'procedure':
      return bl('步骤', li(['确认影响', '限制扩散', '保存证据', '建立时间线', '验证恢复'])) + bl('失败模式', '<div class="t-md">过早重启导致证据丢失</div>')
    case 'claim':
      return `<div class="hs g8" style="margin-top:2px"><span class="t-sm muted">立场</span>${chip('不确定', { icon: 'scale' })}</div>` + bl('证据', li(['团队边界的例子', '部署责任的例子', '接口治理的例子'])) + bl('隐含前提', '<div class="t-md">服务边界与团队边界一致</div>')
    case 'question':
      return `<div class="hs g8"><span class="t-sm muted">状态</span>${chip('open · 待验证', { icon: 'circle-dot' })}</div>` + bl('当前假设', '<div class="t-md">Highlight / Fragment 分流可以降低放弃率</div>') + bl('下一步', '<div class="t-md">观察 Modal 退出率和完成时间</div>')
    case 'visual':
      return o.missing
        ? `<div style="margin-top:4px;border:1px dashed var(--line-2);border-radius:10px;padding:14px;background:var(--surface-2)"><div class="hs g8 c-warn t-md b">${I('triangle-alert')}图片还没有送达（待重试）</div><div class="help" style="margin-top:4px">文字描述和你的加工都已保存，仍可阅读与复习；扩展恢复连接后会重新交付这张图。</div><div style="margin-top:8px">${btn('查看待发送项', { sm: true })}</div></div>${bl('关键细节', '<div class="t-md">重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s</div>')}`
        : `${thumb({ style: 'width:100%;height:140px;margin-top:4px' })}${bl('关键细节', '<div class="t-md">重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s；红线标出了重试放大的时间点</div>')}`
    case 'decision':
      return bl('理由', '<div class="t-md">单人本地优先是核心验证，协作会引入账号、权限和冲突复杂度。</div>') + bl('备选', li(['共享文件', '云工作区'])) + bl('后果', '<div class="t-md">用户提出共享需求时需要重新评估</div>')
    case 'inspiration':
      return `<div class="hs g8"><span class="t-sm muted">形式</span>${chip('随感', { icon: 'lightbulb' })}${chip('本地来源 · annhub://manual', { icon: 'lock' })}</div>` + bl('触发背景', '<div class="t-md">设计今日页时，发现任务计数无法表达理解的演化。</div>')
    case 'media-clip':
      return `<div class="hs g8"><span class="t-sm muted">区间</span>${chip('17:20 – 19:05', { icon: 'film' })}</div>` + bl('转写节选', '<div class="t-md">幂等键应在请求首次落库时生成，并与结果一起保存至重试窗口结束。</div>')
    default:
      return ''
  }
}

const detailMini = (f, kind, o = {}) => `<div class="mcard" style="padding:0;overflow:hidden;width:372px;position:relative">
  ${o.pin ? pin(o.pin, 'pin-in') : ''}
  <div class="hs g8" style="padding:11px 16px;border-bottom:1px solid var(--mac-sep)">${kchip(kind, { full: true })}<span class="grow"></span><span class="lockhint">${I('lock')}只读</span></div>
  <div style="padding:14px 16px">
    <div class="t-lg b" style="line-height:1.4;letter-spacing:-0.005em">${esc(f.title)}</div>
    <div class="mh" style="margin:12px 0 5px">${I('target', 'i-sm')}用户应用</div><div class="t-md" style="line-height:1.55;border-left:3px solid var(--brand);padding-left:11px">${o.use || '在支付网关故障复盘中，检查客户端重试是否放大了流量'}</div>
    <div style="border-top:1px solid var(--mac-sep);margin-top:12px;padding-top:2px">${kindBlock(kind, o)}</div>
  </div></div>`

const emptyLibrary = () => `<div style="position:absolute;inset:0;display:grid;place-items:center"><div class="vs g12" style="width:460px;align-items:flex-start;position:relative">${pin(1)}
  <span class="iconchip n" style="width:48px;height:48px;border-radius:14px">${I('layout-grid', 'i-lg')}</span>
  <div class="t-2xl b" style="letter-spacing:-0.015em">还没有碎片。</div>
  <div class="vs g8 t-md" style="line-height:1.6">
    <div class="hs top g10"><span class="cv-tag" style="margin-top:2px">1</span><span>在 Chrome 中安装 AnnHub 扩展，保存第一个碎片</span></div>
    <div class="hs top g10"><span class="cv-tag" style="margin-top:2px">2</span><span>在“系统”页复制配对码，输入到扩展</span></div>
  </div>
  <div class="muted t-sm">扩展里的碎片会在这里逐条出现；没有 Desktop 时扩展也能独立使用。</div>
  <div class="hs g8" style="position:relative">${pin(2, 'pin-r')}${btn('打开系统页', { v: 'primary', lg: true })}${btn('复制配对码', { lg: true, icon: 'copy' })}</div>
  <div class="hs g8 t-sm muted" style="margin-top:6px"><i class="dot ok"></i>正在监听 127.0.0.1 · 等待第一条碎片</div>
</div></div>`

function deskShellGroup() {
  const skeleton = board({
    title: '窗口骨架',
    ref: 'desktop §2 · §9',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({
      nav: 'today',
      w: 980,
      h: 620,
      due: 5,
      keys: true,
      body: `<div style="position:absolute;inset:6px 22px 22px 8px;border:1.5px dashed var(--line-2);border-radius:14px;display:grid;place-items:center;color:var(--fg-3);position:absolute">${pin(3, 'pin-in')}<div class="vs g6 center" style="text-align:center"><div class="t-lg b">页面内容区</div><div class="t-sm">今日 · 碎片库 · 系统</div><div class="t-xs muted-2">最小窗口 980 × 600</div></div></div>`,
      tb: `<span style="position:relative">${pin(2, 'pin-in')}<span class="ttl">页面标题</span></span><span class="grow"></span>${macSearch()}`,
      over: `<div style="position:absolute;left:16px;top:16px;width:1px;height:1px">${pin(1, 'pin-in')}</div>`,
    }),
    notes: [
      '<b>浮动侧栏 + 内容区</b>：沿用 macOS 26 的 NavigationSplitView 外观；一级导航只有三项：今日、碎片库、系统。',
      '<b>工具栏</b>：左侧页面标题，右侧只有全局搜索 / 命令面板入口（⌘K）；页面自己的动作放在各自内容区，不堆进工具栏。',
      '<b>内容区</b>：每个页面自己决定一栏、两栏还是三栏；窗口过窄时碎片库的右栏变 sheet，不把三栏压到不可读。',
      '<b>侧栏底部</b>只放一行本地服务状态：运行中为绿点，未运行为红点 + 文案；详细信息在“系统”页。',
    ],
  })

  const spec = board({
    title: '导航与快捷键',
    ref: 'desktop §2 · §9',
    tag: 'R1',
    w: 540,
    body: `<div style="padding:22px 24px 22px"><table class="sp-table"><thead><tr><th>页面</th><th>快捷键</th><th>图标（SF Symbols）</th></tr></thead><tbody>
      ${[['今日', '⌘1', 'sun.max'], ['碎片库', '⌘2', 'square.grid.2x2'], ['系统', '⌘3', 'gearshape.2']].map(([a, b, c]) => `<tr><td>${a}</td><td>${keys(b)}</td><td class="mono">${c}</td></tr>`).join('')}
    </tbody></table>
    <div class="vs g8 t-sm" style="margin-top:14px;color:var(--fg-2);line-height:1.6">
      <div>默认页是<b>今日</b>；首次安装且没有数据时默认进入<b>碎片库</b>的空状态。</div>
      <div>⌘1…3 按侧栏顺序切换页面。</div>
      <div>⌘K 打开全局搜索 / 命令面板；复习评分用 1…4，揭示前无效。</div>
      <div>菜单栏状态项与通知见“菜单栏与通知”一组画板。</div>
    </div></div>`,
    notes: ['侧栏图标沿用现有实现使用的 SF Symbols 名称；本稿里为浏览器渲染用 lucide 近似图形代替。'],
  })

  return group(
    { id: 'desk-shell', title: '窗口与导航', small: 'desktop §2 · §9', desc: 'Desktop 是学习消费端和本地数据中枢：默认页是行动清单，不是仪表盘；导航只有三项，且每一项都对应一个学习动作或一类连接状态。' },
    row(skeleton, spec),
  )
}

function deskTodayGroup() {
  const hero = board({
    title: '今日 · 默认',
    ref: 'desktop §3 · review §5',
    tag: 'R1',
    w: 1360,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'today', due: 5, h: 600, body: todayBody('default', { pins: true }) }),
    notes: [
      '<b>可执行事项优先</b>：第一块永远是“到期复习”——数量 + 预计用时（按每条 45 秒估算）+ 一个主按钮；逾期主题最多列三个，不展示全部列表。数字用中性色，不用红色大数字制造焦虑（metrics §6.2）。',
      '<b>最近由扩展写入</b>：新碎片不要求再次编辑，点开进入详情；R1 起 Desktop 的采集字段只读，要改回扩展里改。',
      '<b>统计放到最底部且是次要信息</b>：只有一行“本周成功提取 N 个碎片”（M-18：本周评为良好或容易的去重碎片数，再来一次与较难不计），不展示今日收藏数。',
    ],
  })

  const session = board({
    title: '今日 · 有进行中的复习会话',
    ref: 'desktop §3.1 · review §5 · US-REV-02',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'today', due: 3, w: 980, h: 560, body: todayBody('session') }),
    notes: ['会话在开始时持久化，评分成功后才前进；中途退出后今日页的主按钮变成“继续复习 · 2/5”，并显示已评分进度。', '还剩多少条按“未评分 + 仍到期”计；被其他窗口删除的碎片会被跳过并记录原因。'],
  })

  const none = board({
    title: '今日 · 没有到期复习',
    ref: 'desktop §3.1–§3.2',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'today', w: 980, h: 520, body: todayBody('none') }),
    notes: ['没有到期时仍给出可执行入口：<b>整理最近碎片</b>，而不是一个空的“恭喜”页面；新碎片创建后立即到期，下一批到期时间写在同一张卡里。'],
  })

  return group(
    { id: 'desk-today', title: '今日', small: 'desktop §3', desc: '一张行动清单：今天有什么要复习、做到哪了、新进来了什么。统计放在底部，不抢主线。' },
    row(hero),
    row(session, none),
  )
}

function deskLibraryGroup() {
  const hero = board({
    title: '碎片库 · 三栏',
    ref: 'desktop §4 · search · fragments §9',
    tag: 'R1',
    w: 1360,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'library', due: 5, h: 900, body: libraryBody({ pins: true, sel: 'f1' }) }),
    notes: [
      '<b>左栏：筛选与保存视图</b>：类型 / 来源 / 标签（同维度 OR、跨维度 AND），保存的视图是“新建、到期、待加强”这三种由事实派生的状态，不另存布尔字段（fragments §9）。',
      '<b>中栏：可排序列表</b>：默认列 内容（附来源与标签）/ 类型 / 复习 / 采集时间，其余字段可在“列”里打开；<b>内容和类型不可隐藏</b>。复习状态以 Desktop 的 SQLite 事实计算，1 万条以内首屏 200ms。',
      '<b>右栏：详情</b>，R1 的采集字段只读（顶部锁形提示）。',
      '<b>刻意把“用户加工”放在原文前面</b>：应用 → 理解 → 核验 → 原始语境，避免详情退化成剪藏查看器；标签和元数据放在最后。',
      '<b>原始语境永远带“回到来源”</b>；定位失败时仍显示足以独立理解的文字语境。',
      '<b>复习摘要</b>来自 ReviewLog：状态、间隔、遗忘次数、最近评分。',
    ],
  })

  const kinds = board({
    title: '详情 · 按 kind 的字段区',
    ref: 'kinds §4 · desktop §4.3',
    tag: 'R1',
    w: 1536,
    body: `<div style="padding:24px;background:var(--surface-2);display:flex;gap:16px;align-items:flex-start" class="mac">
      ${detailMini(fragById('f2'), 'procedure', { pin: 1 })}${detailMini(fragById('f7'), 'claim', { use: '评审“拆服务即可提升交付速度”时，追问团队边界与发布责任' })}${detailMini(fragById('f10'), 'visual', { missing: true, pin: 2, use: '在复盘文档里作为“重试放大”的证据图' })}${detailMini(fragById('f9'), 'question', { use: '观察 Modal 退出率和完成时间，两周后复核假设' })}
    </div>`,
    notes: [
      '每个 kind 在详情里只多一块<b>该 kind 的字段区</b>：方法的步骤与失败模式、论点的立场与证据、问题的状态与假设、决策的理由与备选、灵感的形式与触发背景、媒体片段的时间区间与转写节选。其余 kind 同理，字段见 kinds §4。',
      '<b>附件缺失时仍可读</b>：视觉碎片的图片没到时，文字描述和用户加工照常显示，并给出“待重试”和查看待发送项的入口；不显示空白图片框。',
    ],
  })

  const narrow = board({
    title: '窄窗口 · 详情变 sheet',
    ref: 'desktop §4.1',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({
      nav: 'library',
      w: 980,
      h: 700,
      due: 5,
      body: `<div class="lib3"><div class="lib-l" style="border-left:0"><div class="lib-bar"><span class="mw-search" style="min-width:160px;flex:1">${I('search')}搜索碎片</span>${btn('筛选', { sm: true, icon: 'list-filter' })}${btn('列', { sm: true, icon: 'columns-3' })}</div>
        <div style="overflow:hidden;flex:1;padding:0 8px"><table class="mt"><colgroup><col /><col style="width:92px" /><col style="width:84px" /></colgroup><thead><tr><th>内容</th><th>类型</th><th>复习</th></tr></thead><tbody>${['f2', 'f1', 'f4', 'f5', 'f3', 'f10', 'f9', 'f12'].map(id => { const f = fragById(id); return `<tr class="${id === 'f1' ? 'sel' : ''}"><td><div class="c1 truncate">${esc(f.title)}</div><div class="c2 truncate">${f.host}</div></td><td>${kchip(f.kind, { sm: true })}</td><td>${reviewState(f)}</td></tr>` }).join('')}</tbody></table></div></div>
        <div style="position:absolute;inset:0;background:rgb(15 23 42 / 0.12)"></div>
        <div class="mcard" style="position:absolute;right:16px;top:58px;bottom:16px;width:420px;padding:0;overflow:hidden;box-shadow:var(--sh-modal);z-index:8">${pin(1, 'pin-in')}${detailPane(fragById('f1')).replace('class="lib-d"', 'style="width:100%;display:flex;flex-direction:column;height:100%"')}</div></div>`,
    }),
    notes: ['窗口宽度不足以放下三栏时，<b>右栏改为从右侧滑出的 sheet</b>，筛选栏收进“筛选”按钮；不把三栏压缩到不可读（desktop §4.1）。', 'sheet 打开时列表保持可见，Esc 或点列表空白处关闭；选中行高亮不丢。'],
  })

  const empty = board({
    title: '首次安装 · 空状态',
    ref: 'desktop §2 · H-08',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'library', w: 980, h: 700, body: emptyLibrary() }),
    notes: ['首次安装且没有数据时默认进入碎片库，用两步说明连接方式；底部一行说明本地服务正在监听，让用户知道“已经在等了”。', '“复制配对码”直接把配对码复制到剪贴板（H-08：这是漏斗里最容易断的一步），主按钮仍是“打开系统页”。'],
  })

  const del = board({
    title: '删除与批量操作',
    ref: 'desktop §4.4 · storage §10',
    tag: 'R1 · R3',
    w: 760,
    body: `<div style="padding:22px 24px 24px;background:var(--surface-2);display:grid;gap:18px" class="mac">
      <div class="dialog" style="position:relative">${pin(1)}<div class="t-lg b">删除这条碎片？</div>
        <div class="help" style="margin:6px 0 14px;font-size:12.5px;line-height:1.65">将同时删除它的<b>复习记录</b>。<br>只作用于 Desktop；扩展里的副本不受影响，旧请求也不会让它复活。</div>
        <div class="hs g8 end">${btn('取消', { v: 'ghost' })}${btn('删除', { v: 'danger-solid' })}</div></div>
      <div class="mcard" style="padding:10px 14px;position:relative">${pin(2)}<div class="hs g8"><b class="t-md">已选 3 条</b><span class="grow"></span>${btn('添加标签', { sm: true, icon: 'tag' })}${btn('移除标签', { sm: true })}${btn('归档', { sm: true, icon: 'archive' })}${btn('删除…', { sm: true, v: 'danger' })}</div></div>
    </div>`,
    notes: ['删除确认如实写出<b>连带删除什么、不影响什么</b>：复习记录一并删除；扩展里的副本不受影响，本地删除标记也阻止旧请求让它复活。', '批量操作条（R3 起）只提供标签、归档、删除；<b>不提供批量修改理解、核验和应用</b>，避免一次写出多条错误结构。归档待目标契约增加后启用。'],
  })

  return group(
    { id: 'desk-library', title: '碎片库', small: 'desktop §4 · search', desc: '找到、看清、整理。三栏结构，用户加工在原文前面；R1 起 Desktop 的采集字段只读，要改回扩展里改。' },
    row(hero),
    row(kinds),
    row(narrow, empty),
    row(del),
  )
}
