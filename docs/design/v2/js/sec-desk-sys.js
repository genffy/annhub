// macOS Desktop · 系统、菜单栏与通知、命令面板、偏好设置。

const pairCode = (show = false) => `<div class="hs g8"><span class="code">${show ? 'K7QX-39FD-M2LA' : '••••-••••-••••'}</span>${btn(show ? '隐藏' : '显示', { sm: true })}${btn('复制', { sm: true, icon: 'copy' })}${btn('重新生成', { sm: true })}</div>`

const sysBody = (v = 'ok', o = {}) => `<div class="sysp">
  <div><h1 style="margin:0;font-size:26px;letter-spacing:-0.02em">系统</h1><div class="sub" style="color:var(--fg-3);font-size:13px;margin-top:4px">本地服务与扩展连接。技术信息默认折叠，只在需要处理时才出现提醒。</div></div>
  ${v === 'issue' ? `<div class="banner warn" style="position:relative">${o.pin ? pin(1, 'pin-in-r') : ''}${I('triangle-alert')}<div class="grow"><b>有 2 件事需要处理</b><div style="margin-top:4px;line-height:1.7">· 1 张图片尚未送达（扩展里仍在待发送，恢复连接后会自动补上）<br>· 一个使用旧配对码的扩展仍在连接，已拒绝 3 次——请在那台浏览器里重新配对</div></div>${btn('查看详情', { sm: true })}</div>` : ''}
  <div class="mcard" style="position:relative">${o.pin ? pin(v === 'issue' ? 2 : 1, 'pin-in-r') : ''}<div class="mh">连接</div>
    <div class="hs g8" style="margin-bottom:12px">${v === 'down' ? `<i class="dot danger"></i><b>本地服务未运行</b>` : `<i class="dot ok"></i><b>本地服务运行中</b>`}<span class="chip">${I('lock')}仅监听本机</span>${v === 'down' ? '' : ''}</div>
    ${v === 'down' ? `<div class="banner danger" style="margin-bottom:12px">${I('circle-alert')}<div class="grow"><b>端口被占用，服务没有启动。</b>扩展仍可独立使用，已保存的内容会在服务恢复后继续交付。</div>${btn('重试启动', { sm: true, v: 'primary' })}</div>` : ''}
    <div class="hs between top" style="padding:10px 0;border-top:1px solid var(--mac-sep)"><div><div class="b t-md">配对码</div><div class="help">输入到扩展的“设置 → 连接 Desktop”</div></div>${pairCode(o.show)}</div>
    <div class="hs between" style="padding:10px 0;border-top:1px solid var(--mac-sep)"><span class="b t-md">最近扩展连接</span><span class="muted">${v === 'down' ? '—' : '2 分钟前'}</span></div></div>
  <div class="mcard" style="position:relative">${o.pin ? pin(v === 'issue' ? 3 : 2, 'pin-in-r') : ''}<div class="mh">最近交付</div>
    <div class="hs g16 t-md" style="flex-wrap:wrap"><span><b class="tnum">5</b> 条碎片已接收</span><span><b class="tnum">${v === 'issue' ? 0 : 1}</b> 张图片已接收</span><span class="${v === 'issue' ? 'c-warn' : ''}">缺失图片 <b class="tnum">${v === 'issue' ? 1 : 0}</b></span></div>
    <div class="hs g8 t-sm" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--mac-sep)"><span class="muted">需要处理：</span>${v === 'ok' ? '<span>无</span>' : v === 'issue' ? chip('1 张图片待补发', { icon: 'clock', v: 'warn' }) + chip('旧配对 · 已拒绝 3 次', { icon: 'ban', v: 'danger' }) : '<span>等待服务恢复</span>'}</div></div>
  <div class="mcard flat" style="position:relative">${o.pin ? pin(v === 'issue' ? 4 : 3, 'pin-in-r') : ''}<div class="hs g8 b t-md">${I(o.open ? 'chevron-down' : 'chevron-right')}技术信息 <span class="muted t-sm" style="font-weight:400">服务地址 · 数据库版本 · 契约版本 · 交付错误明细</span></div>${o.open ? o.open : ''}</div>
</div>`

const techOpen = () => `<div class="vs g10" style="margin-top:12px">
  <table class="sp-table" style="font-size:12.5px"><tbody>
    <tr><td style="width:130px">服务地址</td><td class="mono">http://127.0.0.1:47831</td></tr><tr><td>数据库版本</td><td class="mono">sqlite · schema 4</td></tr><tr><td>契约版本</td><td class="mono">fragment wire v4</td></tr></tbody></table>
  <div class="mh" style="margin:6px 0 0">交付错误明细</div>
  <table class="mt" style="font-size:12px"><colgroup><col style="width:92px"/><col style="width:76px"/><col /><col style="width:120px"/></colgroup><thead><tr><th>时间</th><th>状态码</th><th>项目 / 说明</th><th>处理</th></tr></thead><tbody>
    <tr><td>10:41</td><td><span class="chip chip-danger">401</span></td><td>未授权请求（旧配对码）</td><td class="muted">已拒绝，不再重试</td></tr>
    <tr><td>10:38</td><td><span class="chip chip-warn">413</span></td><td>图片超过大小上限（asset_456）</td><td class="muted">扩展保留本地</td></tr>
    <tr><td>周四</td><td><span class="chip">410</span></td><td>已在 Desktop 删除的碎片被再次写入</td><td class="muted">已拒绝</td></tr></tbody></table>
  <div class="mh" style="margin:6px 0 0">同步冲突报告 <span class="cv-tag">R3</span></div>
  <div class="t-sm muted">采集字段与复习字段按归属合并；仅同一字段域内的并发更新进入这里。当前没有冲突。</div></div>`

function deskSystemGroup() {
  const ok = board({
    title: '系统 · 正常',
    ref: 'desktop §6 · storage §8',
    tag: 'R1',
    w: 1360,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'system', due: 5, h: 700, body: sysBody('ok', { pin: true }) }),
    notes: [
      '<b>连接</b>：本地服务运行状态 + “仅监听本机”；<b>配对码默认遮住</b>，提供显示 / 复制 / 重新生成；最近扩展连接时间。',
      '<b>最近交付</b>：碎片与图片已接收的数量、缺失图片数、需要处理的事项——正常时写“无”。',
      '<b>技术信息默认折叠</b>：服务地址、数据库版本、契约版本、交付错误明细，只在排障时展开（desktop §6）。',
    ],
  })

  const issue = board({
    title: '系统 · 有需要处理的事',
    ref: 'desktop §6 · storage §8',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'system', w: 980, h: 800, due: 5, body: sysBody('issue', { pin: true }) }),
    notes: ['<b>异常只在需要处理时出现</b>，并放在页面最上方；用一句话说清是什么、要谁做什么。待发送图片不是错误，只是“还没送达”。', '旧配对码的客户端被拒绝（401/403）会在这里列出，并指引去那台浏览器重新配对；本地数据与待发送任务不受影响。'],
  })

  const down = board({
    title: '系统 · 本地服务未运行',
    ref: 'extension §6 · US-DATA-01',
    tag: 'R1',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'system', w: 980, h: 800, svc: 'off', due: 5, body: sysBody('down') }),
    notes: ['服务没起来时，红点同时出现在侧栏底部和本页；文案先说“扩展仍可独立使用”，不制造数据丢失的恐慌，再给“重试启动”。'],
  })

  const regen = board({
    title: '重新生成配对码 · 确认',
    ref: 'desktop §6 · storage §8',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:26px 28px;background:var(--scrim)" class="mac"><div class="dialog" style="width:520px;margin:0 auto;padding:22px 24px;position:relative">${pin(1)}
      <div class="hs g12 top"><span class="iconchip" style="background:color-mix(in oklab,var(--warn) 16%,var(--surface));color:var(--warn)">${I('key-round')}</span><div><div class="t-lg b">重新生成配对码？</div>
      <div class="help" style="margin-top:6px;font-size:12.5px;line-height:1.7">旧码会立即失效，已配对的扩展需要重新输入新码。<b>本地数据与待发送任务都会保留</b>，重新配对后会继续交付。</div></div></div>
      <div class="hs g8 end" style="margin-top:18px">${btn('取消', { v: 'ghost' })}${btn('重新生成', { v: 'primary' })}</div></div></div>`,
    notes: ['“重新生成”会让旧扩展连接失效，所以需要确认；确认文案同时说明<b>不会丢任何数据</b>。复制配对码是安装漏斗最容易断的一步，耗时由 H-08 衡量。'],
  })

  const tech = board({
    title: '技术信息展开',
    ref: 'desktop §6 · storage §8–§9',
    tag: 'R1 · R3',
    w: 980,
    bare: true,
    cls: 'mac',
    body: macWindow({ nav: 'system', w: 980, h: 990, due: 5, body: sysBody('ok', { open: techOpen() }) }),
    notes: ['错误明细按状态码给出处理结果（401/403 停止自动重试、410 停止该条重试、413 图片保留在扩展）；网络错误与 5xx 才按退避重试。', 'R3 起增加同步冲突报告：同一字段域内的并发更新进入这里，不能整条 Fragment 后写覆盖。'],
  })

  return group(
    { id: 'desk-system', title: '系统', small: 'desktop §6 · storage §8', desc: '连接状态页：让“装好、配对、第一条碎片到达”这条漏斗尽可能顺，并在出错时给出可执行的下一步。' },
    row(ok),
    row(issue, down),
    row(tech, regen),
  )
}

function deskMenubarGroup() {
  const wall = (inner, h) => `<div style="height:${h}px;position:relative;background:linear-gradient(135deg,#9db4e8 0%,#c9b6ec 48%,#f0c6d8 100%);overflow:hidden">${inner}</div>`
  const bar = `<div class="menubar"><b style="font-size:14px"></b><b>AnnHub</b><span>文件</span><span>编辑</span><span>显示</span><span>窗口</span><span class="grow"></span>
    <span style="position:relative;display:inline-flex;padding:2px 6px;border-radius:6px;background:rgb(0 0 0 / 0.12)">${pin(1, 'pin-in')}<svg class="i" style="width:16px;height:16px;color:currentColor"><use href="#i-logo"/></svg></span><span>${I('wifi-off', 'i-sm')}</span><span>周六 10月3日 10:45</span></div>`
  const menu = `<div class="macmenu" style="position:absolute;right:56px;top:34px">
    <div class="it" style="padding-bottom:2px"><b>AnnHub</b></div>
    <div class="it on" style="position:relative">${pin(2, 'pin-in-r')}${I('repeat')}<span>今日：5 条到期 · 预计 4 分钟</span><span class="sc">开始复习</span></div>
    <div class="it">${I('inbox')}<span>扩展交付：2 分钟前收到 1 条碎片</span></div>
    <div class="it">${I('plug')}<span>连接：Chrome 扩展已连接</span></div>
    <div class="it">${I('server')}<span>本地服务：运行中 · 仅本机</span></div>
    <hr class="sep" style="margin:5px 8px;border-color:var(--mac-sep)" />
    <div class="it">${I('layout-grid')}<span>打开主窗口</span></div>
    <div class="it" style="opacity:.55">${I('refresh-cw')}<span>立即同步</span><span class="sc">R3</span></div>
    <hr class="sep" style="margin:5px 8px;border-color:var(--mac-sep)" />
    <div class="it"><span>退出 AnnHub</span><span class="sc">⌘Q</span></div></div>`
  const mb = board({
    title: '菜单栏状态项',
    ref: 'desktop §7',
    tag: 'R1',
    w: 680,
    body: wall(bar + menu, 330),
    notes: ['菜单栏只放<b>高频状态和命令</b>：到期数量与开始复习、最近交付、连接、本地服务、打开主窗口、退出；R3 增量同步上线后多一个“立即同步”。', '状态项图标是单色 logo，<b>不带数字徽标</b>（避免催促感）；<b>配对码不在菜单栏首屏</b>，进入系统页查看。'],
  })

  const notifs = board({
    title: '通知',
    ref: 'desktop §8',
    tag: 'R1 · R3',
    w: 680,
    body: wall(`<div style="padding:26px;display:grid;gap:14px;justify-items:end">
      <div class="notif">${pin(1, 'pin-in-r')}<span class="ic"><svg class="i"><use href="#i-logo"/></svg></span><div><div class="hs between"><b class="t-md">AnnHub</b><span class="t-xs muted">20:30</span></div><div class="t-md">今天有 5 条到期，约 4 分钟。</div><div class="hs g8" style="margin-top:8px">${btn('开始复习', { sm: true, v: 'primary' })}${btn('稍后', { sm: true })}</div></div></div>
      <div class="notif" style="position:relative">${pin(2, 'pin-in-r')}<span class="ic" style="background:var(--warn)">${I('triangle-alert')}</span><div><div class="hs between"><b class="t-md">同步已失败超过 24 小时</b><span class="t-xs muted">R3</span></div><div class="t-md">有 3 条碎片待发送。请检查扩展与 Desktop 的连接。</div><div class="hs g8" style="margin-top:8px">${btn('打开系统页', { sm: true })}</div></div></div>
      <div class="banner" style="width:360px;background:rgb(255 255 255 / 0.88)">${I('ban')}<div class="t-sm"><b>不会发送</b>：采集数量、连续使用天数、营销通知。</div></div></div>`, 340),
    notes: ['R1 只允许<b>用户配置的每日复习提醒</b>；R3 增量同步上线后，才增加“连续 24 小时同步失败且有待发送数据”的通知。', '通知文案只陈述事实（几条、多久），没有“别断签”这类措辞。'],
  })

  return group(
    { id: 'desk-menubar', title: '菜单栏与通知', small: 'desktop §7–§8', desc: '不打开主窗口也能知道 Desktop 的状态；但打扰要少，且永远不带采集数量、连续天数或营销。' },
    row(mb, notifs),
  )
}

function deskPaletteGroup() {
  const hl = (t, q) => t.replace(q, `<mark>${q}</mark>`)
  const item = (f, field, on) => `<div class="pal-i ${on ? 'on' : ''}">${kchip(f.kind, { sm: true })}<span class="grow truncate">${hl(esc(f.title), '重试')}</span><span class="t-xs muted none">命中：${field}</span></div>`
  const pal = board({
    title: '命令面板 ⌘K',
    ref: 'desktop §9 · search §1–§3',
    tag: 'R1',
    w: 900,
    body: `<div style="padding:34px 0 40px;background:linear-gradient(180deg,#8ea3d6,#b9a9dd);display:grid;place-items:start center" class="mac"><div class="pal">
      <div class="pal-in" style="position:relative">${pin(1, 'pin-in')}${I('search', 'i-lg muted')}<span>重试</span><span class="caret" style="height:1em"></span><span class="grow"></span><kbd>esc</kbd></div>
      <div class="pal-g" style="position:relative">${pin(2, 'pin-in-r')}<div class="mh">碎片 · 5 条匹配</div>
        ${item(fragById('f3'), '内容', true)}${item(fragById('f4'), '内容 · 标签', false)}${item({ kind: 'concept', title: '幂等' }, '应用', false).replace('幂等', '幂等 <span class="muted t-xs">…重试前先确认幂等键</span>')}${item(fragById('f12'), '内容', false)}</div>
      <div class="pal-g" style="position:relative">${pin(3, 'pin-in-r')}<div class="mh">命令</div>
        <div class="pal-i">${I('play', 'muted')}<span class="grow">开始复习</span><span class="t-xs muted">5 条到期</span></div>
        <div class="pal-i">${I('settings', 'muted')}<span class="grow">打开系统页</span></div></div>
      <div class="hs g14" style="padding:10px 18px;border-top:1px solid var(--mac-sep);font-size:12px;color:var(--fg-3);gap:14px">${keys('↑', '↓')} 选择 ${keys('↵')} 打开 ${keys('esc')} 关闭<span class="grow"></span>搜索范围：内容 · 理解 · 核验 · 应用 · 标签 · 来源</div>
    </div></div>`,
    notes: [
      '<b>一个入口，两类结果</b>：碎片（按检索契约匹配）与命令。输入时每个词都要命中，可落在不同字段；高亮命中的词，右侧标出<b>命中的字段</b>。',
      '<b>排序</b>：content 5 分、理解 / 核验 / 应用 4 分、标签 3 分、来源标题 2 分，其余 1 分；同分按采集时间倒序、id 升序，保证稳定。',
      '命令只列出当前可用的：没有到期时“开始复习”不出现。<b>Highlight / Clip / 截图集不混进碎片结果。</b>',
    ],
  })
  return group(
    { id: 'desk-palette', title: '命令面板', small: 'desktop §9 · search', desc: '⌘K 的全局搜索与命令：键盘优先，搜索规则只在共享领域层实现一次，两端结果一致。' },
    row(pal),
  )
}

function deskPrefsGroup() {
  const prefWin = (title, inner) => `<div class="pref"><div class="mw-lights" style="top:16px"><i></i><i></i><i></i></div><div class="pref-title">${title}</div><div style="padding:8px 30px 26px">${inner}</div></div>`
  const review = prefWin('复习', `
    <div class="pref-row" style="position:relative">${pin(1, 'pin-in-r')}<div class="b t-md" style="padding-top:2px">每日建议上限</div><div><div class="hs between"><span class="t-sm muted">5</span><b class="tnum t-lg">20 条</b><span class="t-sm muted">50</span></div><div class="slider"><i style="width:33%"></i><b style="left:33%"></b></div>
      <div class="help">它限制当天的<b>建议量</b>，不强制同一会话做完。单次会话按每条 45 秒估算，默认最多 13 条（约 10 分钟）。</div></div></div>
    <div class="pref-row" style="border-top:1px solid var(--mac-sep);position:relative">${pin(2, 'pin-in-r')}<div class="b t-md" style="padding-top:2px">每日复习提醒</div><div><div class="hs g12">${sw(true)}<span class="t-md">每天</span><span class="select" style="width:96px;min-height:26px">20:30</span></div><div class="help" style="margin-top:6px">只会发复习提醒，不发采集数量、连续使用天数或营销通知。</div></div></div>`)
  const a = board({
    title: '偏好设置 · 复习',
    ref: 'desktop §8.2 · review §5',
    tag: 'R1',
    w: 700,
    body: `<div style="padding:24px 30px 28px;background:linear-gradient(180deg,#c9d3ee,#dcd2ef)" class="mac">${review}</div>`,
    notes: ['标准 macOS 设置窗口（⌘,），目前只有“复习”一页、两项设置：每日建议上限（5–50，默认 20）与每日复习提醒。', '说明文字里直接写出<b>后果</b>（建议量不强制做完、会话时长怎么估），并重申提醒的边界。Desktop 没有需要模型的能力（D-10），所以没有模型页。'],
  })
  return group(
    { id: 'desk-prefs', title: '偏好设置', small: 'desktop §8.2', desc: '需要用户配置的只有两项：每日建议量和提醒时间。用标准的 macOS 设置窗口承载，Desktop 没有需要模型的能力，所以没有模型页。' },
    row(a),
  )
}
