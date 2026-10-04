// 扩展页 · 碎片库、详情与编辑。

const guideCard = (o = {}) => `<div class="banner brand" style="padding:16px 18px;border-radius:14px;align-items:flex-start;position:relative">${o.pin ? pin(o.pin) : ''}
  <div class="grow vs g10">
    <div class="t-lg b">选中网页中的一段内容，保存你的第一个知识碎片。</div>
    <div class="vs g6 t-md" style="line-height:1.55">
      <div class="hs top g8">${I('highlighter')}<span><b>高亮</b>：只在页面留下标记和备注，不进入复习。</span></div>
      <div class="hs top g8">${I('bookmark')}<span><b>剪藏</b>：把原文和语境存起来，以后查阅，也不进入复习。</span></div>
      <div class="hs top g8">${I('brain')}<span><b>碎片</b>：准备理解并使用——核验、写下应用，之后到 Desktop 复习。</span></div>
    </div>
    <div class="hs g8">${btn('打开示例页面', { v: 'primary' })}<span class="help">示例只在演示模式里，不会混进你的库。</span></div>
  </div>
  <span class="btn btn-ghost btn-icon btn-sm none" aria-label="关闭引导">${I('x')}</span>
</div>`

const connectPrompt = () => `<div class="banner brand" style="padding:14px 16px;border-radius:14px;align-items:flex-start">
  <div class="grow vs g8">
    <div class="b t-md">已保存第一个碎片。连接 Desktop 开始复习</div>
    <div class="hs g16 t-sm" style="flex-wrap:wrap;color:var(--fg-2)">
      <span class="hs g6"><span class="cv-tag">1</span>下载并启动 Desktop</span>${I('chevron-right', 'i-sm muted')}
      <span class="hs g6"><span class="cv-tag">2</span>在 Desktop 的“系统”页复制配对码</span>${I('chevron-right', 'i-sm muted')}
      <span class="hs g6"><span class="cv-tag">3</span>粘贴到扩展设置</span>
    </div>
    <div class="hs g8">${btn('去连接', { sm: true, v: 'primary' })}${btn('稍后再说', { sm: true, v: 'ghost' })}<span class="help">不连接也不影响任何本地功能。</span></div>
  </div>
</div>`

function extLibGroup() {
  const hero = board({
    title: '碎片库 · 默认',
    ref: 'extension §5 · search · roadmap R3.1',
    tag: 'R1 · 状态 R3',
    w: 1280,
    body: extPage(
      `<div class="xp-main">
        ${libTop({ pins: [1, 2] })}
        ${libFilters({ pins: [3], r3: true })}
        ${libList(['f1', 'f2', 'f10', 'f4', 'f11'], { r3: true, pinCard: 'f1', pinN: 4 })}
      </div>`,
      { tab: 'lib', h: 800 },
    ),
    notes: [
      '<b>顶栏</b>：全文搜索（按检索契约：词在 content / 理解 / 核验 / 应用 / 标签 / 来源任一字段的子串命中）、<b>新建灵感</b>（无需网页选区）、更多菜单。',
      '<b>连接状态永远在顶栏可见</b>：状态点 + 文字 + 最近交付时间；“打开 Desktop”是主按钮，因为深度学习动作都在那里。',
      '<b>筛选</b>：类型 / 来源 / 标签 / 时间，同维度 OR、跨维度 AND，写入 URL 刷新可恢复；“复习状态”在 Desktop 数据回传后才出现（R3）。头部只显示条数，不展示收藏数量当成就。',
      '<b>卡片只放 6 样东西</b>：kind、标题、一行语境、来源 host、相对时间、标签；回传后右侧显示复习状态。完整加工字段与修改历史在详情抽屉里。',
    ],
  })

  const first = board({
    title: '首次使用 · 空库与引导卡',
    ref: 'extension §8 · US-CAP-01',
    tag: 'R1',
    w: 760,
    body: extPage(`<div class="xp-main" style="width:auto;margin:0 32px">${libTop({ conn: 'none', n: 0, connExtra: '' })}${guideCard({ pin: 1 })}<div style="margin-top:34px;text-align:center" class="muted">${I('inbox', 'i-lg muted-2')}<div class="t-md" style="margin-top:6px">还没有碎片</div></div></div>`, { tab: 'lib', h: 560 }),
    notes: ['首次使用只给<b>一张可关闭的引导卡</b>，用三句话讲清高亮 / 剪藏 / 碎片的区别；“打开示例页面”进入独立的演示模式。', '空库不放营销图，也不催用户“连接 Desktop”：状态是“未配置”，本地功能完全可用。'],
  })

  const connectBoard = board({
    title: '保存第一个之后 · 不阻塞的连接提示',
    ref: 'extension §8 · §6',
    tag: 'R1',
    w: 760,
    body: extPage(`<div class="xp-main" style="width:auto;margin:0 32px">${libTop({ conn: 'none', connExtra: '' })}<div style="margin-top:16px">${connectPrompt()}</div><div class="fbar"><span class="grow"></span><span class="t-sm muted">共 1 条</span></div>${libList(['f1'])}</div>`, { tab: 'lib', h: 560 }),
    notes: ['保存第一条后出现<b>一条不阻塞的提示</b>，三步说明连接方式，可以跳过；跳过不改变任何本地功能，之后在设置和碎片库顶部仍可连接。', '这是 H-08（安装 → 配对 → 第一条碎片抵达）漏斗的入口，提示文案要短，步骤用同一套数字标记。'],
  })

  const noResult = board({
    title: '无搜索结果 · 保留筛选',
    ref: 'extension §8 · search §2',
    tag: 'R1',
    w: 760,
    body: extPage(
      `<div class="xp-main" style="width:auto;margin:0 32px">${libTop({ q: 'kubernetes 滚动发布', focus: true })}${libFilters({ on: 'kind', count: '共 0 条' })}
        <div style="text-align:center;padding:50px 0" class="vs g8 center"><div style="align-self:center">${I('search', 'i-lg muted-2')}</div><div class="t-md b">没有匹配“kubernetes 滚动发布”的碎片</div><div class="help">每个词都要在 content、理解、核验、应用、标签或来源中命中。当前筛选：类型 = 概念 · 方法</div><div style="align-self:center;margin-top:4px">${btn('清除筛选', { sm: true })}</div></div></div>`,
      { tab: 'lib', h: 560 },
    ),
    notes: ['无结果时<b>保留当前搜索词和筛选条件</b>，只提供“清除筛选”；不显示导入入口或营销信息。', '高亮、剪藏、截图集是独立视图，搜索口径单独标识，不混入这里的碎片计数。'],
  })

  const noDesktop = board({
    title: '没有 Desktop · 强调可独立工作',
    ref: 'extension §8 · §6 · US-DATA-01',
    tag: 'R1',
    w: 760,
    body: extPage(
      `<div class="xp-main" style="width:auto;margin:0 32px">${libTop({ conn: 'none', connExtra: '' })}
        <div style="margin:14px 0 4px">${banner('info', '<b>扩展可以独立工作</b>：采集、搜索、编辑和导出都不需要 Desktop。想要每日复习时，再连接 Desktop。', { icon: 'plug', action: btn('下载 Desktop', { sm: true }) + btn('我已安装，去配对', { sm: true, v: 'primary' }) })}</div>
        ${libFilters({ count: '共 5 条' })}${libList(['f1', 'f4'])}</div>`,
      { tab: 'lib', h: 560 },
    ),
    notes: ['没有 Desktop 时用<b>平和的信息条</b>而不是警告：说明扩展仍可独立工作，并给出下载 / 配对入口；<b>不制造“数据会丢”的恐慌</b>。', '卡片上不显示复习状态：这是 Desktop 的事实，回传后才出现。'],
  })

  const states = board({
    title: '连接状态 · 四态',
    ref: 'extension §6 · storage §8',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 24px 22px"><table class="sp-table"><thead><tr><th style="width:130px">状态</th><th>表现</th><th style="width:210px">可用操作</th></tr></thead><tbody>
      <tr><td>${conn('none')}</td><td>本地保存正常，顶栏显示配对入口</td><td>${btn('连接 Desktop', { sm: true })}</td></tr>
      <tr><td>${conn('ok', { extra: '2 分钟前交付' })}</td><td>状态点 + 最近交付时间</td><td>${btn('立即重试', { sm: true, v: 'ghost' })}</td></tr>
      <tr><td>${conn('pending', { n: '记录 3 · 图片 1' })}</td><td>显示记录与图片各自的待发送数；后台按退避重试，<b>这不是错误</b></td><td>${btn('立即重试', { sm: true })}</td></tr>
      <tr><td>${conn('error')}</td><td>用一句话说明原因，其余放进详情：<br><span class="c-danger">配对已失效（401），已停止自动重试，请重新配对。</span></td><td class="hs g6 wrap">${btn('重新配对', { sm: true, v: 'primary' })}${btn('查看详情', { sm: true })}${btn('导出内容', { sm: true, v: 'ghost' })}</td></tr>
    </tbody></table>
    <div class="sp-card" style="margin-top:14px;padding:14px 16px;background:var(--surface-2);border:0"><h5 class="t-sm">交付错误详情里会出现的几种原因（storage §8）</h5>
      <table class="sp-table" style="font-size:12.5px"><tbody>
        <tr><td style="width:110px">401 / 403</td><td>配对已失效或来源未授权 → 停止自动重试，提示重新配对</td></tr>
        <tr><td>410</td><td>Desktop 已本地删除这一条 → 停止该条的重试并标记</td></tr>
        <tr><td>413</td><td>图片超过大小上限 → 图片保留在本机，给出可操作提示</td></tr>
        <tr><td>网络 / 5xx</td><td>Desktop 未启动或暂时不可用 → 按退避自动重试</td></tr>
      </tbody></table></div></div>`,
    notes: ['任何连接状态都<b>不能阻塞本地保存</b>；“有待发送”是常态而不是故障，所以用琥珀色加时钟图标，而不是红色。', '只有鉴权失败等需要用户动作的情况才进入“交付错误”，并把可执行的下一步放在同一行。'],
  })

  const menu = board({
    title: '更多菜单 · 导出内容',
    ref: 'extension §2.2 · §5.1 · storage §7',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 24px 24px;background:var(--surface-2);display:grid;grid-template-columns:200px 1fr;gap:22px;align-items:start">
      <div class="menu" style="position:relative">${pin(1)}
        ${menuItem('download', '导出内容', { on: true })}
        <div class="menu-sep"></div>
        ${menuItem('highlighter', '高亮列表')}
        ${menuItem('bookmark', '剪藏列表')}
      </div>
      <div class="vs g12">
        <div class="dialog" style="padding:16px 18px;position:relative">${pin(2)}
          <div class="hs between"><b class="t-lg">导出内容</b><span class="chip">Markdown + 图片 ZIP</span></div>
          <div class="help" style="margin:6px 0 10px;font-size:12.5px">包含已提交的碎片、高亮、剪藏、截图说明与已保存的原图；不包含未提交的表单、Desktop 的复习记录、配对码和密钥。</div>
          <div class="progress"><i style="width:68%"></i></div>
          <div class="t-xs muted" style="margin-top:6px">正在逐个读取图片…（87 / 128）</div>
        </div>
        <div class="dialog" style="padding:16px 18px;position:relative">${pin(3)}
          ${banner('warn', '<b>部分导出</b>：已导出 126 / 128 条，2 张图片缺失。缺失项已列入 README，Markdown 里标注“图片缺失”。', { action: btn('下载部分 ZIP', { sm: true, v: 'primary' }) + btn('查看缺失项', { sm: true }) })}
          <div class="help" style="margin-top:8px">这是一份供 Obsidian 等工具阅读的开放格式，不能用来恢复 AnnHub 的复习状态。</div>
        </div>
      </div>
    </div>`,
    notes: ['“导出内容”是扩展里<b>唯一的用户导出</b>；不提供第二种 JSON / CSV 导出，也不提供导入。高亮列表、剪藏列表是碎片库里的独立视图，不新增一级导航；设置只通过顶部一级导航进入，菜单里不重复（extension §2.2）。', '导出前说明范围与不包含的内容；导出过程按 Blob 分批读取，进度可见。', '有缺失图片时<b>绝不显示成“完整成功”</b>：标题写“部分导出”，给出数量，并在 README 列出资产 ID。'],
  })

  return group(
    { id: 'ext-lib', title: '碎片库', small: 'extension §5 · §8', desc: '扩展里最常回来的页面：找、改、导出。它不是复习界面，所以连接状态和“打开 Desktop”比统计数字更醒目。' },
    row(hero),
    row(first, connectBoard),
    row(noResult, noDesktop),
    row(states, menu),
  )
}

function extDetailGroup() {
  const f = fragById('f1')
  const drawer = `<div class="drawer">
    <div class="hs g8" style="padding:14px 20px;border-bottom:1px solid var(--line);position:relative">${pin(1, 'pin-in')}
      <span class="cm-kind on k-concept" style="height:26px">${I('atom')}概念${I('chevron-down', 'i-sm')}</span><span class="t-xs muted">修订 2</span><span class="grow"></span>${btn('回到原文', { sm: true, iconR: 'arrow-up-right' })}
      <span class="btn btn-ghost btn-icon btn-sm">${I('x')}</span></div>
    <div style="overflow:hidden;flex:1">
      <div class="dsec"><div class="t-xl b" style="letter-spacing:-0.01em">Backpressure</div><div class="t-sm muted" style="margin-top:2px">engineering.example.com · 周一 10:12 采集</div></div>
      <div class="dsec" style="position:relative">${pin(2, 'pin-in-r')}<div class="h">${I('target', 'i-sm')}应用</div><div class="t-md" style="line-height:1.6;border-left:3px solid var(--brand);padding-left:12px">检查当前事件管道为什么在消费者变慢后耗尽内存</div>
        <div class="h" style="margin-top:12px">${I('pencil-line', 'i-sm')}理解</div><div class="t-md" style="line-height:1.6;color:var(--fg-2)">下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游</div></div>
      <div class="dsec"><div class="h">${I('badge-check', 'i-sm')}核验</div>
        <div class="hs g8 wrap">${chip('已确认 · 周一 10:12', { icon: 'circle-check', v: 'ok' })}${srcBadge('source-material')}</div>
        <div class="t-md" style="margin-top:8px;line-height:1.55;color:var(--fg-2)">不只是固定速率限流，还涉及队列边界和反馈机制。</div></div>
      <div class="dsec" style="position:relative">${pin(3, 'pin-in-r')}<div class="h">${I('quote', 'i-sm')}原始语境</div>
        <div class="quote t-md" style="line-height:1.6">…Instead of letting buffers absorb the mismatch indefinitely, <mark style="background:var(--page-sel);color:#1c1b1a;border-radius:3px">the consumer signals demand upstream so the producer slows down</mark>…</div>
        <div class="hs g6 t-sm muted" style="margin-top:8px">${favicon(0)}<span class="truncate">Backpressure in Streams</span><span>·</span><span class="truncate">engineering.example.com/posts/backpressure-in-streams</span></div></div>
      <div class="dsec"><div class="h">${I('list-plus', 'i-sm')}详情字段 <span class="opt-add" style="margin-left:auto;height:20px">定义</span><span class="opt-add" style="height:20px">边界</span><span class="opt-add" style="height:20px">示例</span><span class="opt-add" style="height:20px">反例</span></div></div>
      <div class="dsec"><div class="h">${I('tag', 'i-sm')}标签</div><div class="hs g6">${tags(f.tags)}<span class="opt-add" style="height:20px">添加</span></div></div>
      <div class="dsec" style="position:relative;background:var(--surface-2)">${pin(4, 'pin-in-r')}<div class="h">${I('monitor', 'i-sm')}来自 Desktop（只读） <span class="cv-tag">R3</span></div>
        <div class="vs g6 t-sm"><div class="hs between"><span class="muted">复习</span><span>已复习 3 次 · 下次 明天</span></div></div></div>
    </div>
    <div class="hs g8" style="padding:12px 20px;border-top:1px solid var(--line);position:relative">${pin(5, 'pin-in')}${btn('删除本地记录', { v: 'danger', icon: 'trash-2' })}<span class="grow"></span>${btn('取消', { v: 'ghost' })}${btn('保存', { v: 'primary', kbd: '⌘↵' })}</div>
  </div>`

  const detail = board({
    title: '碎片详情 · 抽屉',
    ref: 'extension §5.3–§5.4 · desktop §4.3',
    tag: 'R1 · 回传 R3',
    w: 1280,
    body: extPage(`<div class="xp-main" style="margin-left:48px;width:560px"><div class="search" style="margin-bottom:0">${I('search')}<span>搜索碎片…</span></div>${libFilters({})}${libList(['f1', 'f2', 'f10'], { sel: 'f1' })}</div>${drawer}`, { tab: 'lib', h: 840 }),
    notes: [
      '<b>修正 kind</b>：详情顶部可改类型，修订号随采集字段变化而递增（captureRevision）。',
      '<b>用户加工在前</b>：应用（强调）→ 理解；与 Desktop 详情一致。核验区显示确认时间和来源徽标，摘要、备注只在用户填过时出现。',
      '<b>原始语境可编辑、可回到原文</b>：保护字段（内容、语境、来源、kind）改动后会清除核验确认，见下一块画板。',
      '<b>来自 Desktop 的状态只读</b>：复习状态在回传后才显示，并明确标注“只读”；扩展不提供复习评分。',
      '<b>删除只作用于本机</b>：不向 Desktop 发请求，已交付的 Desktop 副本保持原状；扩展保留本地删除标记，R3 回传时也不会把它带回来。',
    ],
  })

  const edit = board({
    title: '修改保护字段 · 删除确认',
    ref: 'fragments §7 · extension §5.4 · storage §10',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 24px 24px;background:var(--surface-2);display:grid;gap:18px">
      <div class="dialog" style="padding:16px 18px;position:relative">${pin(1)}
        <div class="hs between" style="margin-bottom:10px"><b>核验</b>${chip('需要重新确认', { icon: 'rotate-ccw', v: 'warn' })}</div>
        ${banner('warn', '你修改了<b>内容</b>。核验确认已清除——保存前请回看来源，并重新点“确认已核对”。修改标签、应用或备注不需要重新确认。')}
        <div style="margin-top:10px">${confirmRow({ on: false })}</div>
      </div>
      <div class="dialog" style="padding:18px 20px;position:relative">${pin(2)}
        <div class="t-lg b">删除这条碎片？</div>
        <div class="help" style="margin:6px 0 14px;font-size:12.5px;line-height:1.6">只会删除<b>本机扩展</b>里的记录和它的待发送任务。已经交付到 Desktop 的副本不受影响，Desktop 需要时请在那里删除。</div>
        <div class="hs g8 end">${btn('取消', { v: 'ghost' })}${btn('删除本地记录', { v: 'danger-solid' })}</div>
      </div>
    </div>`,
    notes: ['修改<b>内容、上下文、来源或 kind</b>后，核验确认被清除并要求重做；标签、应用文字、可选备注不影响已确认状态（fragments §7）。', '删除确认如实说明作用范围——只删本机，不向 Desktop 发送任何请求。'],
  })

  const lists = board({
    title: '高亮与剪藏 · 独立视图',
    ref: 'extension §3 · §5.1 · search §1',
    tag: 'R1',
    w: 760,
    body: extPage(
      `<div class="xp-main" style="width:auto;margin:0 32px">
        <div class="hs g8 t-sm" style="margin-bottom:12px"><span class="link hs g4">${I('arrow-left', 'i-sm')}碎片库</span><span class="muted">/</span><b>高亮</b><span class="muted">34 条 · 不计入碎片数</span></div>
        <div class="fcard" style="grid-template-columns:1fr auto">${pin(1, 'pin-in')}<div class="vs g6"><div class="hs g8">${chip('高亮', { icon: 'highlighter' })}</div><div class="ttl" style="font-weight:500;font-family:var(--font-serif)"><span class="pg"><span class="hl note" style="font-size:15px">the consumer signals demand upstream so the producer slows down</span></span></div><div class="ex">备注：可以解释“消费者变慢时内存为什么一直涨”</div><div class="meta">${I('globe')}engineering.example.com · 3 天前</div></div><div class="vs end g6">${btn('升级为碎片', { sm: true, icon: 'brain' })}${btn('删除', { sm: true, v: 'ghost' })}</div></div>
        <div class="hs g8 t-sm" style="margin:18px 0 12px"><span class="muted">另一个视图：</span><b>剪藏</b><span class="muted">12 条</span></div>
        <div class="fcard">${pin(2, 'pin-in')}<div class="vs g6"><div class="hs g8">${chip('剪藏', { icon: 'bookmark' })}</div><div class="ttl" style="font-weight:500">Retries can amplify an outage when the dependency is already saturated.</div><div class="meta">${I('globe')}engineering.example.com · 周一</div></div><div class="vs end g6">${btn('转为碎片', { sm: true, icon: 'brain' })}${btn('删除', { sm: true, v: 'ghost' })}</div></div>
      </div>`,
      { tab: 'lib', h: 560 },
    ),
    notes: ['高亮和剪藏是<b>独立视图</b>，计数与搜索口径单独标识，不混入碎片结果数。', '“升级为碎片 / 转为碎片”会带着原文打开采集窗口，由用户完成核验与应用；<b>永远不会自动升级</b>。'],
  })

  return group(
    { id: 'ext-detail', title: '详情与编辑', small: 'extension §5.3–§5.4', desc: '详情才展示完整加工字段、来自 Desktop 的状态与修改历史；编辑遵守“保护字段要重新核验”的规则。' },
    row(detail),
    row(edit, lists),
  )
}
