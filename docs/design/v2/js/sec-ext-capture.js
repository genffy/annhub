// 浏览器扩展 · 页面内：选区菜单、保存分流、采集窗口、各 kind 表单、状态与恢复。

// 核验步骤里随 kind 出现的额外字段（kinds.md 的“表单必填”）；其余字段在详情里编辑
const kindExtra = (kind, o = {}) => {
  const seg = (items, on) => `<span class="seg">${items.map((t, i) => `<span class="${i === on ? 'on' : ''}">${t}</span>`).join('')}</span>`
  const ta = (txt, h = 44, ph = '') => textarea(txt, { h, ph, style: 'font-size:12.5px;padding:5px 9px' })
  const small = (label, control, opt) => `<div class="field" style="gap:4px"><div class="label t-sm">${label}${opt ? `<span class="opt">${opt}</span>` : ''}</div>${control}</div>`
  switch (kind) {
    case 'claim':
      return small('立场', `<div class="vs g6" style="align-items:flex-start">${seg(['支持', '反对', '不确定'], o.none ? -1 : 2)}<span class="help">必选；有争议的论点保持“不确定”是正确用法</span></div>`, '（必选）')
    case 'procedure':
      return small(
        '步骤',
        `<div class="vs g4">${['确认影响', '限制扩散', '保存证据'].map((s, i) => `<div class="hs g6"><span class="muted tnum t-sm" style="width:14px">${i + 1}</span>${input(s, { style: 'min-height:26px;padding:3px 9px;font-size:12.5px' })}</div>`).join('')}<span class="opt-add" style="align-self:flex-start;margin-left:20px">${I('plus')}添加步骤</span></div>`,
        '（至少一项）',
      )
    case 'decision':
      return small('理由', ta('单人本地优先是核心验证，协作会引入账号、权限和冲突复杂度。', 48), '（必填）')
    case 'question':
      return small(
        '状态与假设',
        `<div class="vs g6">${seg(['open', 'testing', 'answered'], 0)}${ta('Highlight / Fragment 分流可以降低放弃率', 40)}<span class="help">open / testing 需要假设或下一步；answered 需要答案</span></div>`,
      )
    case 'inspiration':
      return small('触发背景', ta('设计今日页时，发现任务计数无法表达理解的演化。', 44), '（必填）')
    case 'visual':
      return small('关键细节描述', ta('重试开始后 5 分钟，下游 p99 延迟从 120ms 升到 2s', 44), '（必填）')
    case 'media-clip':
      return small('起止时间', `<div class="hs g8">${input('17:20', { style: 'width:72px;min-height:26px;padding:3px 9px' })}<span class="muted">—</span>${input('19:05', { style: 'width:72px;min-height:26px;padding:3px 9px' })}<span class="help">标记起止或直接输入秒数</span></div>`, '（必填）')
    default:
      return ''
  }
}

const kindCard = kind => {
  const k = KINDS[kind]
  const extra = kindExtra(kind)
  return `<div class="kg">
    <div class="hs g8 between">${kchip(kind, { full: true })}<span class="cv-tag">${k.rel}</span></div>
    <div class="t-sm muted" style="margin:6px 0 10px">${k.when}</div>
    <div class="kg-q"><b>理解</b><span>${k.guess}</span><b>核验</b><span>${k.verify}</span><b>应用</b><span>${k.use}</span></div>
    <div class="kg-x">${extra || `<span class="help">${kind === 'excerpt' ? '无必填项：理解可选，说得出为什么留即可' : '无额外必填项；定义、边界、示例等在详情中补充'}</span>`}</div>
  </div>`
}

// ── 组 1：保存分流与页面内入口 ─────────────────────────────────────────────
function extFlowGroup() {
  const hero = board({
    title: '选区菜单 · 选中文本后出现',
    ref: 'extension §2.1 · capture §2',
    tag: 'R1',
    w: 1040,
    body: browser(
      article({ sel: 'sel' }) +
        hoverMenu({
          anchor: '.the-sel',
          pins: { menu: 1, sep: 2, tip: 3 },
          hover: 0,
          tip: tipBubble('碎片', '理解并应用 · 约 30–90 秒 · 进入复习', 'bottom:calc(100% + 10px);left:0', pin(3, 'pin-r')),
        }),
      { h: 620 },
    ),
    notes: [
      '<b>入口即分流</b>：选区菜单只有“碎片、高亮、剪藏、截图”四项，图标 + 短文本，不依赖位置测试。出现在选区上方，空间不足时翻到下方。',
      '<b>学习与保留用分隔线区开</b>：“碎片”排第一，图标染品牌紫；右侧三项都是“不进入复习”的保留动作。',
      '<b>悬停 / 聚焦约 300ms 出现一句话后果</b>：说明耗时、产物、是否进入复习，让三条路径的差别在入口就看得见（US-CAP-01）。',
      '键盘：选区存在时 Tab 进入菜单，← → 切换，Enter 触发，Esc 关闭；菜单不抢占页面焦点，不影响继续选择。',
    ],
  })

  const paths = board({
    title: '三条保存路径',
    ref: 'extension §3 · capture §2 · product §5.2',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 24px 20px"><div class="paths">
      <div class="h"></div>
      <div class="h"><span class="hs g6 b t-lg">${I('highlighter')}高亮</span></div>
      <div class="h"><span class="hs g6 b t-lg">${I('bookmark')}剪藏</span></div>
      <div class="h"><span class="hs g6 b t-lg c-brand">${I('brain')}碎片</span></div>

      <div class="lb">用户意图</div><div>保留页面位置和备注</div><div>保存一段内容供查阅</div><div><b>准备理解并应用</b></div>
      <div class="lb">要做的事</div><div>一次点击，可加备注</div><div>一次点击</div><div>核验 + 应用，约 30–90 秒；深度模式再加“理解”</div>
      <div class="lb">产物</div><div>Highlight：页面标记</div><div>Clip：原文 + 语境</div><div>Fragment：内容 + 语境 + 你的加工</div>
      <div class="lb">进入复习</div><div class="muted">否</div><div class="muted">否</div><div class="c-ok b">是（创建即到期）</div>
      <div class="lb">之后</div><div>详情里“升级为碎片”</div><div>碎片库里“转为碎片”</div><div>在 Desktop 复习</div>
      <div class="lb">边界</div><div>不会自动升级</div><div>不会自动升级</div><div>说不出为什么留？不要建，存剪藏</div>
    </div>
    <div class="banner brand" style="margin-top:16px">${I('shield-check')}<div><b>安全出口</b>：放弃采集窗口时，可以改存为高亮或剪藏——不创建复习，也不丢已写的内容。选择会记入 M-16。</div></div></div>`,
    notes: ['三者的差别同时出现在：选区菜单的悬停提示、首次使用引导卡的三句话、放弃采集窗口时的确认对话框。', '不存在“稍后加工”的半成品 Fragment；说不出保留原因就是剪藏（kinds §2）。'],
  })

  const variants = board({
    title: '选区菜单 · 变体',
    ref: 'extension §2.1 · §10.1',
    tag: 'R1 · R4',
    w: 760,
    body: `<div style="padding:22px 24px 18px;background:var(--surface-2)">
      ${[
        ['默认：无媒体的页面只显示前四项', hoverMenu({ style: 'position:relative' })],
        ['页面存在可捕获的 &lt;video&gt; / &lt;audio&gt; 时追加“媒体片段”（R4）', hoverMenu({ style: 'position:relative', media: true })],
        ['键盘聚焦：焦点环用浅紫内描边，不依赖颜色以外的差异', hoverMenu({ style: 'position:relative', focus: 0, hover: 2 })],
      ]
        .map(([cap, m]) => `<div style="margin-bottom:18px"><div class="t-sm muted" style="margin-bottom:8px">${cap}</div>${m}</div>`)
        .join('')}
      <div class="t-sm muted" style="margin:4px 0 8px">悬停提示文案（一句话后果）</div>
      <table class="sp-table" style="font-size:12.5px"><tbody>
        <tr><td style="width:130px">碎片</td><td>理解并应用 · 约 30–90 秒 · 进入复习</td></tr>
        <tr><td>高亮</td><td>只在页面留痕，可加备注 · 不进入复习</td></tr>
        <tr><td>剪藏</td><td>保存原文和语境，之后查阅 · 不进入复习</td></tr>
        <tr><td>截图</td><td>框选区域或单击元素 · 先进入截图集</td></tr>
        <tr><td>媒体片段</td><td>标记起止时间，手工转写 · 保存为 media-clip</td></tr>
      </tbody></table></div>`,
    notes: ['“媒体片段”只在页面存在可捕获媒体时出现；没有时不留空位、不显示置灰项。', '悬停提示文案见 extension §2.1，是否让用户分清三条路径由 H-05（E-03 走查）验证；英文界面使用对应译文（D-15）。'],
  })

  const lang = board({
    title: '选区菜单 · 中英文界面',
    ref: 'extension §2.1 · validation D-11',
    tag: 'R1',
    w: 760,
    body: `<div style="padding:22px 24px 18px;background:var(--surface-2)">
      ${[
        ['中文界面', hoverMenu({ style: 'position:relative' })],
        ['English UI', hoverMenu({ style: 'position:relative', lang: 'en' })],
        ['English UI · with media', hoverMenu({ style: 'position:relative', lang: 'en', media: true })],
      ]
        .map(([cap, m]) => `<div style="margin-bottom:18px"><div class="t-sm muted" style="margin-bottom:8px">${cap}</div>${m}</div>`)
        .join('')}
      <table class="sp-table" style="font-size:12.5px;margin-top:4px"><thead><tr><th style="width:90px">图标</th><th>中文</th><th>English</th></tr></thead><tbody>
        ${[['brain', '碎片', 'Fragment'], ['highlighter', '高亮', 'Highlight'], ['bookmark', '剪藏', 'Clip'], ['scan', '截图', 'Screenshot'], ['film', '媒体片段', 'Media clip']]
          .map(([ic, zh, en]) => `<tr><td>${I(ic)}</td><td>${zh}</td><td>${en}</td></tr>`)
          .join('')}
      </tbody></table></div>`,
    notes: [
      '<b>按界面语言本地化（D-11）</b>：中文界面把 Fragment 称为“碎片”，英文界面保留 “Fragment”；第一项直接用这个名词，不加“保存为”，保存这个动作由悬停提示说明。图标、顺序和分隔线两种语言完全一致。',
      '字段名、实体名和文档里的概念名不变，只有用户看到的按钮、提示和空状态文案随语言切换；本稿其余画板按中文界面绘制。',
    ],
  })

  return group(
    { id: 'ext-flow', title: '保存分流与页面内入口', small: 'extension §2–§3', desc: '用户选中文本后的第一个决定：只是留痕、以后查阅，还是准备理解并使用。入口要在不打断阅读的前提下，把三者的差别讲清楚。' },
    row(hero),
    row(paths, variants),
    row(lang),
  )
}

// ── 组 2：采集窗口 ────────────────────────────────────────────────────────
function extModalGroup() {
  const hero = board({
    title: '采集窗口 · 标准模式 · 核验步骤',
    ref: 'extension §4.1 · §4.5 · processing §2',
    tag: 'R1',
    w: 1040,
    body: browser(
      modalOnPage(
        captureModal({ kind: 'concept', step: 'verify', pins: { header: 1, ctx: 2, kinds: 3, steps: 4, body: 5, frame: 6 } }),
        { h: 626 },
      ),
      { h: 704 },
    ),
    notes: [
      '<b>来源条</b>：来源标题、host、回到原文。“回到原文”会把窗口收成底部一条并滚到选区，已填内容保留，再点即展开。',
      '<b>选区只读，上下文折叠成一行</b>，展开后可编辑（不含导航、按钮、广告和扩展自身 UI）。打开时立刻显示本地可得字段，不等模型（&lt; 150ms 可交互）。',
      '<b>类型</b>：自动推断只是默认值，选择器始终可见；“自动推断”用虚线标签表示这是建议。',
      '<b>步骤条</b>：标准模式下“理解”是虚线禁用态并标注“深度模式”；右侧切换标准 / 深度，切换不丢内容。',
      '<b>核验 = 一次单击</b>：摘要、备注可选，折成“＋”；点“确认已核对”才能继续；核验来源三选一并始终可见，“模型建议”需在设置里启用。',
      '内容区高度固定，三个步骤之间切换时窗口外框不变；最大宽度 560px，小视口只留 16px 边距。',
    ],
  })

  const stdApply = board({
    title: '标准模式 · 应用步骤（校验提示）',
    ref: 'extension §4.6 · kinds §3',
    tag: 'R1',
    w: 640,
    body: modalOnPage(captureModal({ kind: 'concept', step: 'apply', state: 'vague' }), { h: 628 }),
    notes: [
      '“应用”是硬门槛：非空、不能等于原文或语境，并至少含动作、目标、问题或场景之一。',
      '校验不用固定字数；不足时给出针对该 kind 的具体提示，而不是只显示“太短”。下方固定放一组“弱 / 好”示例作为标尺（kinds §3）。',
      '最后一步的主按钮变为“保存 ⌘↵”，保存按钮在校验通过前保持可点击——点击时才定位到错误，避免出现一个无解释的禁用按钮。',
    ],
  })

  const deepGuess = board({
    title: '深度模式 · 理解步骤',
    ref: 'extension §4.2 · processing §2',
    tag: 'R1',
    w: 640,
    body: modalOnPage(captureModal({ kind: 'concept', step: 'guess', deep: true, guessText: '下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游' }), { h: 628 }),
    notes: [
      '深度模式先写“理解”：该 kind 的第一问，数据层可选，可留空直接进入核验。',
      '<b>先生成，后辅助</b>：这一步看不到任何模型建议，界面直接说明“这一步由你自己写”。',
      '返回上一步不清空后续草稿；全局偏好在设置里切换，也可以在单次窗口里临时切换。',
    ],
  })

  const states = board({
    title: '应用输入的四种状态',
    ref: 'extension §4.6 · processing §4',
    tag: 'R1',
    w: 1040,
    body: `<div style="padding:22px 24px 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${[
        ['空', 'empty', '还没写：提示该写什么'],
        ['只复制原文', 'copy', '与选区几乎相同：不接受'],
        ['太笼统', 'vague', '缺对象或动作：给出具体追问'],
        ['合格', 'good', '有对象，也有动作'],
      ]
        .map(
          ([t, s, d]) => `<div class="vs g8"><div class="hs between"><b>${t}</b><span class="t-xs muted">${d}</span></div><div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface)">${bodyApply('concept', { state: s, bare: true })}</div></div>`,
        )
        .join('')}
    </div>`,
    notes: ['同一个文本框，四种反馈：反馈出现在文本框下方一行，错误用文字 + 图标表达，不只靠红色边框。', '校验只在 domain 层执行前三项（非空、已核验、不等于原文/语境）；“有动作或对象”无法可靠自动判断时只给提示，不阻止保存。'],
  })

  return group(
    { id: 'ext-modal', title: '采集窗口', small: 'extension §4 · processing', desc: '主动加工的现场。窗口要小、要稳、要快：外框不随步骤变化，输入不会丢，核验只需一次单击，应用不能被糊弄。' },
    row(hero),
    row(stdApply, deepGuess),
    row(states),
  )
}

// ── 组 3：各 kind 的表单 ──────────────────────────────────────────────────
function extKindsGroup() {
  const gallery = board({
    title: '九种 kind · 提问与额外字段',
    ref: 'kinds §1 · §4',
    tag: 'R1 · R4',
    w: 1040,
    body: `<div style="padding:22px 24px 24px"><div class="kg-grid">${[...KIND_ORDER, 'media-clip'].map(kindCard).join('')}</div></div>`,
    notes: [
      '三步提问文案全部取自 kinds.md 的“采集提问”，不在界面里另写一套；每个 kind 的校验提示也只在那里维护。',
      '“额外字段”只出现在<b>核验步骤</b>里，因此标准模式也不会漏掉必填项；其余字段（定义、边界、证据、前提等）放在详情里编辑，降低采集摩擦。',
      '`inspiration` 的触发背景、`visual` 的描述、`media-clip` 的起止时间是该 kind 的必填项，缺失时在对应字段下给出具体提示。',
    ],
  })

  const proc = board({
    title: '方法 · 核验步骤',
    ref: 'kinds §4.4',
    tag: 'R1',
    w: 640,
    body: modalOnPage(
      captureModal({ kind: 'procedure', step: 'verify', body: bodyVerify('procedure', { extra: kindExtra('procedure'), noOpt: true, on: true }) }),
      { h: 628 },
    ),
    notes: ['步骤是必填（至少一项）；选区里识别到有序列表时自动拆成步骤预填，用户可增删改。', '核验区折成两行：确认已核对在下，来源三选一在同一行，释放出空间给步骤列表。'],
  })

  const decision = board({
    title: '决策 · 核验步骤（理由必填）',
    ref: 'kinds §4.5',
    tag: 'R1',
    w: 640,
    body: modalOnPage(captureModal({ kind: 'decision', step: 'verify', body: bodyVerify('decision', { extra: kindExtra('decision'), noOpt: true }) }), { h: 628 }),
    notes: ['“理由”必填：没有理由和约束的结论只能存剪藏（kinds §4.5 何时不选）。', '复盘时不改写旧决策：新建一条决策，旧决策保留（kinds §4.5 常见误用）。'],
  })

  const manual = board({
    title: '新建灵感 · 无网页选区',
    ref: 'extension §5.1 · kinds §4.8 · US-CAP-08',
    tag: 'R1',
    w: 640,
    body: modalOnPage(
      captureModal({
        kind: 'inspiration',
        step: 'verify',
        noBack: true,
        title: '新建灵感',
        host: 'annhub://manual',
        ctxHtml: `<div class="cm-ctx">
          <div class="lb">想法</div><div>${textarea('软件的提醒不应该只问“今天完成了什么”，还应让我看见哪些判断改变了', { h: 54, style: 'font-size:13px' })}<div class="counter" style="margin-top:3px">64 / 500</div></div>
          <div class="lb">形式</div><div><span class="seg"><span>想法</span><span class="on">随感</span></span></div>
          <div class="lb">类型</div><div>${cmKinds('inspiration', { inferred: false })}</div></div>`,
        body: bodyVerify('inspiration', { extra: kindExtra('inspiration'), noOpt: true, nolink: true, source: 'manual' }),
      }),
      { h: 628, sel: 'none' },
    ),
    notes: ['碎片库顶部的“新建灵感”进入这里：没有网页选区，也不推断网页字段；来源显示为<b>本地来源</b>，绝不伪装成引述。', '想法 ≤ 500 字符；超过一个知识单位的长篇随笔不属于 AnnHub，写在自己的写作工具里。', '核验的含义是“回看触发背景，区分观察与推测”，不要求证明灵感正确，来源默认“手工”。'],
  })

  return group(
    { id: 'ext-kinds', title: '按 kind 的表单', small: 'kinds §4', desc: '同一套三步结构，按 kind 只显示必要字段。下面是全部 kind 的提问与额外字段总览，以及三个字段最特殊的窗口实例。' },
    row(gallery),
    row(proc, decision),
    row(manual),
  )
}

// ── 组 4：状态、失败与恢复 ────────────────────────────────────────────────
function extStatesGroup() {
  const llmFail = board({
    title: '核验 · 模型建议失败，降级为手工',
    ref: 'extension §4.5 · ai §3',
    tag: 'R1',
    w: 640,
    body: modalOnPage(
      captureModal({
        kind: 'concept',
        step: 'verify',
        body: bodyVerify('concept', {
          source: 'llm',
          banner: banner('danger', '<b>模型暂时不可用</b>（超时）。可以重试，或直接手工核对——不会阻塞保存。', {
            action: btn('重试', { sm: true }) + btn('手工核对', { sm: true, v: 'primary' }),
          }) + '<div style="height:8px"></div>',
        }),
      }),
      { h: 628 },
    ),
    notes: ['错误提示就在核验区内，给出“重试”和“手工核对”两个出口；不弹窗、不关闭流程，也不挡住“下一步”。', '截断、超时、鉴权、schema 失败使用不同错误码，文案不暴露原始异常对象（ai §3）。'],
  })

  const llmOk = board({
    title: '核验 · 模型建议（待用户确认）',
    ref: 'extension §4.5 · ai §4',
    tag: 'R1',
    w: 640,
    body: modalOnPage(
      captureModal({
        kind: 'concept',
        step: 'verify',
        body: `<div class="cm-body">
          <div class="hs between"><div class="prompt">${KINDS.concept.verify}</div><span class="link hs g4 t-sm">回看来源${I('arrow-up-right', 'i-sm')}</span></div>
          <div class="suggest-card vs g6">
            <div class="hs between">${chip('模型建议 · 未确认', { icon: 'sparkles', cls: 'chip-suggest' })}<span class="t-xs muted">示例模型 · prompt v3</span></div>
            <div class="t-md" style="line-height:1.55">不只是固定速率限流，还涉及队列边界和反馈机制。下游通过需求信号把压力传回上游。</div>
            <div class="hs g6">${btn('采用', { sm: true, v: 'primary' })}${btn('编辑后采用', { sm: true })}${btn('忽略', { sm: true, v: 'ghost' })}<span class="grow"></span><span class="t-xs muted">采用前不会自动确认</span></div>
          </div>
          <div style="margin-top:auto">${confirmRow({ source: 'llm' })}</div>
        </div>`,
      }),
      { h: 628 },
    ),
    notes: ['<b>建议 ≠ 事实</b>：建议卡是虚线 + sparkles + “未确认”，只有点“采用”（或编辑后采用）才写入摘要，且仍需用户点“确认已核对”。', '编辑后采用会把来源改记为“手工”，并保留 basedOnModel；不再宣称由模型完成。', '外发前可在设置里开启“预览本次发送的内容”，默认只发当前碎片和必要上下文。'],
  })

  // 保存结果三态
  const result = board({
    title: '保存：成功 · 失败（保留输入）',
    ref: 'extension §4.7 · §9',
    tag: 'R1',
    w: 1040,
    body: `<div style="padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;background:var(--surface-2)">
      <div class="vs g10"><b>成功（约 700ms 后自动关闭）</b>
        <div class="dialog" style="width:100%;padding:0"><div class="vs g10 center" style="align-items:center;padding:36px 24px 28px;text-align:center">
          <div class="ktile k-concept" style="width:44px;height:44px;border-radius:50%;background:color-mix(in oklab,var(--ok) 14%,var(--surface));color:var(--ok)">${I('circle-check', 'i-lg')}</div>
          <div class="t-lg b">已保存为「概念」</div>
          <div class="hs g8">${btn('在碎片库查看', { sm: true })}${btn('继续阅读', { sm: true, v: 'primary' })}</div>
          <div class="progress" style="width:120px;margin-top:6px"><i style="width:62%"></i></div>
        </div></div>
        <div class="help">默认继续阅读并关闭窗口；“在碎片库查看”在新扩展页打开。同时高亮失败不回滚 Fragment，只给可重试提示。</div>
      </div>
      <div class="vs g10"><b>失败（窗口不关闭，输入原样保留）</b>
        <div class="dialog" style="padding:0;overflow:hidden">
          <div style="padding:14px 16px">${banner('danger', '<b>没有保存成功</b>：本地存储写入失败（空间不足）。你写的内容都还在。', { action: btn('重试', { sm: true, v: 'primary' }) })}</div>
          <div style="padding:0 16px 14px" class="vs g8">
            ${textarea('检查当前事件管道为什么在消费者变慢后耗尽内存', { h: 56 })}
            <div class="hs g12 t-sm">${I('copy', 'i-sm')}<span class="link">复制我的输入</span><span class="muted">·</span><span class="link">改存为剪藏</span><span class="muted">·</span><span class="link">导出内容</span></div>
          </div>
        </div>
        <div class="help">保存失败停留在当前步骤；“复制我的输入”是最后的保底出口。保存前先做配额校验，不会显示成功后才失败。</div>
      </div>
    </div>`,
    notes: ['成功状态不阻塞：700ms 后自动回到阅读；失败状态绝不自动关闭，错误文字说明原因和下一步。', '失败时除“重试”外提供三个保底出口：复制我的输入、改存为剪藏、导出内容（extension §9），不改变存储契约。'],
  })

  const closing = board({
    title: '关闭确认 · 草稿恢复 · 重复提示',
    ref: 'extension §4.1 · §9 · capture §7',
    tag: 'R1',
    w: 1040,
    body: `<div style="padding:24px;display:grid;grid-template-columns:1.05fr 1fr;gap:24px;background:var(--surface-2)">
      <div class="vs g10"><b>放弃已填写的内容？</b>
        <div class="dialog" style="position:relative">${pin(1)}
          <div class="t-lg b">放弃已填写的内容？</div>
          <div class="help" style="margin:6px 0 16px;font-size:12.5px">你在“应用”里写了 18 个字。改存为高亮或剪藏不会创建复习，也不会自动升级为碎片。</div>
          <div class="hs g8 wrap">${btn('继续编辑', { v: 'primary' })}${btn('改存为高亮', { icon: 'highlighter' })}${btn('改存为剪藏', { icon: 'bookmark' })}<span class="grow"></span>${btn('放弃', { v: 'danger' })}</div>
        </div>
      </div>
      <div class="vs g12">
        <div class="vs g6"><b>重新打开同一来源：恢复草稿</b>
          <div style="position:relative">${pin(2)}${banner('brand', '<b>有一份未提交的草稿</b>（2 分钟前，停在“核验”）', { icon: 'history', action: btn('恢复', { sm: true, v: 'primary' }) + btn('丢弃', { sm: true, v: 'ghost' }) })}</div>
        </div>
        <div class="vs g6"><b>采集时发现重复</b>
          <div style="position:relative">${pin(3)}${banner('warn', '<b>已有相同内容</b>：Backpressure · 3 天前 · engineering.example.com。仍可保存。', { icon: 'copy', action: btn('查看已有', { sm: true }) })}</div>
        </div>
      </div>
    </div>`,
    notes: [
      '任一字段有改动，关闭（含 Esc、点遮罩）都要确认。“改存为高亮 / 剪藏”是安全出口，选择记入 <code>capture.exited.fallback</code>（M-16）。',
      '输入以约 300ms 防抖写入会话级存储（含 tab、来源、选区的 draft ID）；Worker 重启或同页导航后提示恢复。浏览器完整退出会清除草稿，界面不承诺跨重启恢复。',
      '重复检测按“内容 + 来源 + 语境”预检，命中只提示并展示已有记录，用户确认后仍可保存。',
    ],
  })

  return group(
    { id: 'ext-states', title: '状态、失败与恢复', small: 'extension §4.5–§4.7 · §9', desc: '采集窗口的底线是“失败不丢思考”：模型失败、保存失败、误关窗口、页面导航，都有明确的出口。' },
    row(llmFail, llmOk),
    row(result),
    row(closing),
  )
}
