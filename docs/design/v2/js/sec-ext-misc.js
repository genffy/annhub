// 扩展页 · 截图集、设置、工具栏弹窗。

const diagramSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><g fill="#eef2ff" stroke="#6b7bd6" stroke-width="1.6"><rect x="14" y="40" width="40" height="30" rx="6"/><rect x="64" y="14" width="40" height="30" rx="6"/><rect x="64" y="66" width="40" height="30" rx="6"/><rect x="114" y="40" width="40" height="30" rx="6"/></g><g stroke="#9aa1b2" stroke-width="1.6" fill="none"><path d="M54 52 L64 34"/><path d="M54 58 L64 78"/><path d="M104 32 L114 48"/><path d="M104 80 L114 62"/></g><g font-size="7" fill="#4b5563" font-family="sans-serif"><text x="20" y="58">closed</text><text x="70" y="32">open</text><text x="68" y="84">half-open</text><text x="120" y="58">probe</text></g></svg>`
const tableSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><g fill="#f3f4f8"><rect x="10" y="12" width="148" height="16"/></g><g stroke="#e6e8ee" stroke-width="1"><path d="M10 44H158M10 60H158M10 76H158M10 92H158"/></g><g font-size="7" fill="#4b5563" font-family="sans-serif"><text x="16" y="23">service</text><text x="66" y="23">budget</text><text x="116" y="23">used</text><text x="16" y="55">gateway</text><text x="66" y="55">10%</text><text x="116" y="55">7%</text><text x="16" y="71">ledger</text><text x="66" y="71">5%</text><text x="116" y="71">9%</text><text x="16" y="87">notify</text><text x="66" y="87">20%</text><text x="116" y="87">3%</text></g></svg>`
const barsSvg = () => `<svg viewBox="0 0 168 112" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="168" height="112" fill="#fff"/><path d="M12 92H156" stroke="#d6d9e2"/><g fill="#7c8be0"><rect x="22" y="62" width="16" height="30"/><rect x="48" y="48" width="16" height="44"/><rect x="74" y="30" width="16" height="62"/><rect x="100" y="52" width="16" height="40"/><rect x="126" y="70" width="16" height="22"/></g><text x="14" y="16" font-size="8" fill="#6b7280" font-family="sans-serif">error rate by hour</text></svg>`

const shotCard = (o = {}) => `<div class="scard ${o.sel ? 'sel' : ''}" style="position:relative">${o.pin ? pin(o.pin, 'pin-in') : ''}
  <div class="scard-img"><div>${(o.svg || chartSvg)()}</div>${o.act ? `<div class="scard-act">${btn('', { icon: 'download', iconOnly: true, sm: true })}${btn('', { icon: 'trash-2', iconOnly: true, sm: true })}</div>` : ''}</div>
  <div class="vs g4" style="padding:10px 12px 12px">
    <div class="b t-md clamp-1">${o.title}</div>
    <div class="t-xs muted">${o.host} · ${o.when}</div>
    <div class="hs g4 wrap" style="margin-top:4px">${o.chips}</div>
  </div>
</div>`

const metricRow = (id, name, v, hint) => `<tr><td style="width:56px"><span class="cv-tag">${id}</span></td><td>${name}</td><td class="tnum b" style="width:90px">${v}</td><td class="muted" style="width:230px">${hint}</td></tr>`

const settingCard = (title, desc, body, o = {}) => `<div class="sp-card" style="padding:18px 22px;position:relative">${o.pin ? pin(o.pin) : ''}
  <div class="hs between"><h5 style="font-size:15px;margin:0">${title}</h5>${o.right || ''}</div>
  ${desc ? `<p style="margin:4px 0 14px;font-size:12.5px">${desc}</p>` : '<div style="height:12px"></div>'}${body}</div>`

const setRow = (label, desc, control) => `<div class="hs between g16" style="padding:10px 0;border-top:1px solid var(--line)"><div><div class="b t-md">${label}</div>${desc ? `<div class="help">${desc}</div>` : ''}</div><div class="none">${control}</div></div>`

function extShotsPageGroup() {
  const page = board({
    title: '截图集',
    ref: 'extension §6 · screenshot §4',
    tag: 'R1',
    w: 1280,
    body: extPage(
      `<div class="xp-main" style="width:1100px">
        <div class="hs between" style="margin-bottom:16px"><div><div class="t-2xl b" style="letter-spacing:-0.015em">截图集 <span class="muted t-md" style="font-weight:500">24 张</span></div><div class="help" style="margin-top:2px;font-size:13px">截图默认只留在这里，<b>不要求加工</b>。写下关键细节并确认核验后，才会转为视觉碎片。</div></div>${btn('导出内容', { icon: 'download' })}</div>
        <div class="sgrid">
          ${shotCard({ title: '重试开始后 p99 延迟曲线', host: 'sre.example.org', when: '周二', chips: chip('已转为视觉碎片', { icon: 'brain', v: 'brand' }), pin: 1, act: true })}
          ${shotCard({ title: '熔断器状态机示意图', host: 'engineering.example.com', when: '周五', chips: chip('仅在截图集', {}) + chip('已匿名 0 处', {}), svg: diagramSvg })}
          ${shotCard({ title: '容量规划表（二季度）', host: 'arch.example.net', when: '上周', chips: chip('仅在截图集', {}) + chip('已匿名 2 处', { icon: 'eye-off' }), svg: tableSvg })}
          ${shotCard({ title: '值班手册 · 升级路径', host: 'sre.example.org', when: '上周', chips: chip('已转为视觉碎片', { icon: 'brain', v: 'brand' }), svg: tableSvg })}
          ${shotCard({ title: '重试预算仪表盘', host: 'engineering.example.com', when: '3 周前', chips: chip('仅在截图集', {}), svg: barsSvg })}
          ${shotCard({ title: '错误率对比图', host: 'sre.example.org', when: '3 周前', chips: chip('仅在截图集', {}), svg: chartSvg })}
        </div>
      </div>`,
      { tab: 'shots', h: 700 },
    ),
    notes: ['截图集是<b>独立的第二个一级页面</b>：查看、重新下载、删除；悬停卡片出现下载 / 删除，点开进入详情与“转为碎片”。', '状态都写成文字芯片：仅在截图集 / 已转为视觉碎片（同一个 assetId，不复制图片）/ 已匿名 N 处。', '删除截图集条目只删引用；仍被 Fragment 引用的图片继续保留，确认文案要说清这一点。'],
  })

  const convert = board({
    title: '转为视觉碎片',
    ref: 'screenshot §4 · kinds §4.7 · US-CAP-07',
    tag: 'R1',
    w: 640,
    body: modalOnPage(
      captureModal({
        kind: 'visual',
        step: 'verify',
        title: '转为视觉碎片',
        host: 'sre.example.org',
        ctxHtml: `<div class="cm-ctx" style="grid-template-columns:44px 1fr">
          <div class="lb">原图</div><div class="hs g10 top" style="position:relative">${pin(1)}${thumb({ style: 'width:112px;height:76px' })}<div class="vs g4 grow"><div class="b t-md">重试开始后 p99 延迟曲线</div><div class="t-xs muted">sre.example.org/incidents/2026-09 · 周二</div>${chip('同一个 assetId，不复制图片', { icon: 'link' })}</div></div>
          <div class="lb" style="padding-top:5px">细节</div><div>${textarea('重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s；红线标出了重试放大的时间点', { h: 54, style: 'font-size:12.5px', focus: true })}<div class="help" style="margin-top:3px">这是<b>你的描述</b>，不是网页原文；页面语境在下方单独标识。</div></div>
          <div class="lb">类型</div><div class="hs g6"><span class="cm-kind on k-visual">${I('image')}视觉</span><span class="t-xs muted">${I('lock', 'i-sm')} 截图只能转为视觉</span></div></div>`,
        body: bodyVerify('visual', { noOpt: false, nolink: true, label: '页面语境', text: '…<mark>Figure 2 · downstream p99 latency during the retry storm</mark>。At minute 5 the retry wave starts and p99 climbs from 120ms to 2s while the error rate stays flat…' }),
      }),
      { h: 640, sel: 'none' },
    ),
    notes: ['从截图集转换：先写“关键细节”（<b>必填</b>，就是 Fragment 的 content），页面原文与用户描述在界面上<b>分别标识</b>，不会把描述说成网页内容。', 'kind 锁定为视觉；核验、应用沿用同一套三步；确认后 Fragment 与截图集引用同一个 assetId。'],
  })

  return group(
    { id: 'ext-shots-page', title: '截图集', small: 'extension §6 · screenshot §4', desc: '截图的归宿。它刻意和碎片库分开：图片很多、价值不一，只有写下细节并确认核验的才会成为碎片。' },
    row(page),
    row(convert),
  )
}

function extSettingsGroup() {
  const prefs =
    setRow('深度模式', '先写“理解”，再核验、应用。全局偏好，也可在单次采集窗口里临时切换。', sw(false)) +
    setRow('同时高亮原文', '保存碎片时默认勾选；每次采集时可取消。', sw(true)) +
    setRow('首次使用引导卡', '碎片库顶部的三句话说明；关闭后可在这里重新显示。', btn('重新显示', { sm: true }))
  const keys = `<table class="sp-table" style="font-size:12.5px"><tbody>
    <tr><td style="width:190px">连续高亮模式</td><td>${keys_('Alt', 'H')} <span class="muted">或</span> ${keys_('⌘', '⇧', 'H')}</td></tr>
    <tr><td>截图模式</td><td>${keys_('Ctrl', '⇧', 'S')} <span class="muted">/</span> ${keys_('⌘', '⇧', 'S')}</td></tr>
    <tr><td>关闭菜单 / 取消截图 / 请求关闭窗口</td><td>${keys_('Esc')}</td></tr>
    <tr><td>当前步骤继续或保存</td><td>${keys_('⌘', '↵')} <span class="muted">/</span> ${keys_('Ctrl', '↵')}</td></tr></tbody></table>
    <div class="help" style="margin-top:8px">浏览器级快捷键可在 <span class="mono">chrome://extensions/shortcuts</span> 修改。</div>`

  const a = board({
    title: '设置 · 采集偏好与快捷键',
    ref: 'extension §9',
    tag: 'R1',
    w: 1280,
    body: extPage(
      `<div class="xp-main" style="width:1060px"><div class="hs top g24">
        <div class="vs g2 none" style="width:170px;padding-top:6px;position:sticky;top:0">${['采集偏好', '快捷键', '模型能力', '本地指标', '数据与导出', '关于与隐私'].map((t, i) => `<div class="xp-tab ${i === 0 ? 'on' : ''}" style="font-size:13px">${t}</div>`).join('')}</div>
        <div class="grow vs g16">
          ${settingCard('采集偏好', '', `<div style="margin-top:-12px">${prefs}</div>`, { pin: 1 })}
          ${settingCard('快捷键', '', keys, { pin: 2 })}
        </div></div></div>`,
      { tab: 'set', h: 600 },
    ),
    notes: ['偏好只有三项：深度模式、同时高亮默认值、引导卡；每一项都用一句话说明后果。', '快捷键只列出文档定义的四组；真正的浏览器级冲突在 chrome://extensions/shortcuts 处理。'],
  })

  const aiBody = `<div class="vs g12">
    <div class="banner info">${I('shield-check')}<div><b>默认全部关闭。</b>需要外发的能力由你逐项开启；开启某一项不会开启别的。核验建议只发送当前碎片和必要上下文，<b>不发送</b>页面标题、URL、其他碎片或浏览历史。密钥只存本机，不进日志、不进导出。</div></div>
    <div class="hs g12 top"><div class="field grow" style="gap:4px"><div class="label t-sm">Base URL</div>${input('https://api.example.com/v1', { style: 'min-height:30px' })}</div><div class="field" style="gap:4px;width:200px"><div class="label t-sm">模型</div>${input('model-name', { style: 'min-height:30px' })}</div></div>
    <div class="field" style="gap:4px"><div class="label t-sm">API Key</div><div class="hs g8">${input('••••••••••••••••a3f9', { style: 'min-height:30px;font-family:var(--font-mono);letter-spacing:0.05em' })}${btn('更换', { sm: true })}${btn('测试连接', { sm: true })}</div><div class="help">已保存在本机，不会再显示完整内容。</div></div>
    ${setRow('核验建议', '在核验步骤出现“模型建议”来源；建议未经你确认不会生效。', sw(false))}
    ${setRow('外发前预览内容', '每次发送前展示本次将要发送的文字，由你确认。', sw(true))}
    <div class="hs between t-sm" style="padding-top:8px;border-top:1px solid var(--line)"><span class="muted">最近错误</span><span>无 · 日志只记录阶段、错误码和耗时，不记录正文</span></div></div>`
  const dataBody = `<div class="hs g16 top"><div class="grow vs g8">
      <div class="hs between t-sm"><span>本地存储</span><span class="b tnum">126 MB / 约 4.2 GB 可用</span></div><div class="progress"><i style="width:3%"></i></div>
      <div class="help">其中截图 89 MB。接近浏览器配额时，会在<b>保存前</b>提示，而不是写入失败后才告诉你。</div></div>
    <div class="none">${btn('导出内容', { icon: 'download', v: 'primary' })}</div></div>
    <div class="hs g16 top t-sm" style="margin-top:14px"><div class="grow"><div class="b" style="margin-bottom:4px">包含</div><div class="muted" style="line-height:1.6">已提交的碎片、高亮、剪藏、截图集说明，以及已保存的处理后图片原字节。</div></div>
    <div class="grow"><div class="b" style="margin-bottom:4px">不包含</div><div class="muted" style="line-height:1.6">未提交的表单、模型密钥与界面偏好。不可用于恢复 AnnHub 的数据库。</div></div></div>`

  const b = board({
    title: '设置 · 模型能力与数据',
    ref: 'ai §1–§6 · storage §5 · §6',
    tag: 'R1',
    w: 1280,
    body: extPage(
      `<div class="xp-main" style="width:1060px"><div class="hs top g24">
        <div class="vs g2 none" style="width:170px;padding-top:6px">${['采集偏好', '快捷键', '模型能力', '本地指标', '数据与导出', '关于与隐私'].map((t, i) => `<div class="xp-tab ${i === 2 || i === 4 ? 'on' : ''}" style="font-size:13px">${t}</div>`).join('')}</div>
        <div class="grow vs g16">
          ${settingCard('模型能力（可选）', 'LLM 是核验的可选加速器，不是主链路的必需品；关闭后采集、保存、导出照常可用。', aiBody, { pin: 1 })}
          ${settingCard('数据与导出', '', dataBody, { pin: 2 })}
        </div></div></div>`,
      { tab: 'set', h: 940 },
    ),
    notes: ['<b>默认关闭 + 逐项开启</b>：每个能力单独一行，开关旁用一句话说清它会发送什么、不发送什么。不在界面上把任何 Provider 标为“推荐”。', '设置页展示 Provider、模型与最近错误，不隐藏成本来源；API Key 保存后只显示末四位，更换要重新输入。', '导出前说清<b>包含与不包含</b>；存储配额以“已用 / 可用”呈现，接近上限在保存前提示。'],
  })

  const metrics = board({
    title: '本地指标面板 · 阶段 V',
    ref: 'metrics §5 · §11 · roadmap V.1',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 26px 24px"><div class="banner info" style="margin-bottom:14px">${I('lock')}<div>指标<b>只在本机计算</b>，只显示聚合数字，<b>不显示任何正文、URL 或标题</b>。内测回访时可共享屏幕给产品负责人看，没有导出或上传入口。</div></div>
      <table class="sp-table"><tbody>
        ${metricRow('M-02', '采集窗口完成率', '71%', '打开 34 → 保存 24')}
        ${metricRow('M-03', '中位完成时间', '标准 48 秒 · 深度 95 秒', '目标 &lt; 60 秒 / &lt; 120 秒')}
        ${metricRow('M-14', 'kind 修正率', '12%', '高于 20% 时不得隐藏选择器')}
        ${metricRow('M-16', '安全出口使用率', '31%', '放弃时改存高亮 / 剪藏')}
      </tbody></table>
      <div class="hs g6 wrap t-xs muted" style="margin-top:12px"><span>退出阶段漏斗：</span>${chip('理解 2', {})}${chip('核验 5', {})}${chip('应用 3', {})}${chip('改存高亮 2', {})}${chip('改存剪藏 1', {})}</div></div>`,
    notes: ['内测期间（阶段 V）才需要这块面板，覆盖 A 级假设所需的 M-02、M-03、M-16，并尽量覆盖 M-14。', '数字旁都给出口径与护栏（例如修正率 &gt; 20% 不得隐藏 kind 选择器），避免把指标当成成就展示。'],
  })

  return group(
    { id: 'ext-settings', title: '设置', small: 'extension §2.2 · ai · metrics §11', desc: '设置页只放三类东西：怎么采集、哪些能力要外发、本机有什么数据。所有“外发”默认关闭，所有“数据”都说清范围。' },
    row(a),
    row(b),
    row(metrics),
  )
}

// 工具栏弹窗（extension §2.3）
function extPopupGroup() {
  const popup = board({
    title: '工具栏弹窗',
    ref: 'extension §2.3',
    tag: 'R1',
    w: 520,
    body: browser(
      `<div class="pg" style="height:100%"><div class="pg-nav"><b>engineering.example.com</b></div>
      <div class="pop" style="right:14px;top:8px;width:340px;padding:0;overflow:hidden">${pin(1, 'pin-in')}
        <div class="hs between" style="padding:12px 14px;border-bottom:1px solid var(--line)"><span class="hs g8 b"><svg class="i" style="width:20px;height:20px;color:var(--brand)"><use href="#i-logo"/></svg>AnnHub</span></div>
        <div class="vs g2" style="padding:8px">
          <div class="menu-i">${I('lightbulb')}新建灵感<span class="sc">无需选区</span></div>
          <div class="menu-i">${I('library')}打开碎片库<span class="sc">128 条</span></div>
          <div class="menu-i">${I('images')}打开截图集<span class="sc">24 张</span></div>
        </div>
        <div class="t-xs muted" style="padding:9px 14px;border-top:1px solid var(--line)">选中网页文字即可保存 · ${keys_('⌘', '⇧', 'S')} 截图</div>
      </div></div>`,
      { h: 420 },
    ),
    notes: ['弹窗只有<b>最小职责</b>：给出新建灵感 / 碎片库 / 截图集三个入口；不提供编辑或设置。它也是 chrome:// 等页面内入口失效时的兜底。'],
  })
  return group(
    { id: 'ext-popup', title: '工具栏弹窗', small: 'extension §2.3', desc: '点击浏览器工具栏图标时的落点。它是页面内入口失效时（例如 chrome:// 页面）的兜底。' },
    row(popup),
  )
}

const keys_ = (...ks) => ks.map(k => `<kbd>${k}</kbd>`).join(' ')
