// 浏览器扩展 · 页面内：区块剪藏。依据 capture §6.2、extension §2.1、market §4.3。
// 帖子、代码块、一节、整篇文章这样的整体内容，不必先拖选：指针停在上面，旁边出现胶囊「剪藏 | 截图 | 上一级 | 更多」。

// 一篇很长的文章：区块比窗口高，上下都延伸到窗口之外
const longPage = () => `<div class="pg pg-rt"><div class="pg-art" style="position:relative;margin-top:-34px">
  <i class="blk is-faint" style="inset:-260px -12px -260px -12px"><em style="top:270px">article</em></i>
  <section class="sx"><h2>重试预算</h2><p>给每个下游设一个重试配额，用完就快速失败，而不是继续放大负载。预算按服务端的实际承载量调，不要照抄示例里的数字。</p></section>
  <section class="sx"><h2>退避与抖动</h2><p>重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的随机因子，让客户端不再同时重试。</p><p>完整推导见 AWS 架构博客里那篇关于抖动的文章，结论是加了抖动之后总完成时间几乎不变，而峰值负载明显下降。</p></section>
  <section class="sx"><h2>熔断</h2><p>依赖持续失败时快速失败，给下游留出恢复时间；半开状态下只放过少量探测请求。</p></section>
</div></div>`

function extBlockGroup() {
  const hoverFeed = board({
    title: '悬停出现 · X 的一条帖子',
    ref: 'capture §6.2 · extension §2.1',
    w: 760,
    body: miniView(feedPage({ blk: { pin: 2, pill: { cls: 'at-tl', pin: 1 } } }), 440),
    notes: [
      '指针在一条帖子上停留约 400ms，帖子周围出现描边，旁边出现胶囊「剪藏 | 截图 | 更多」。<b>没有选区也能用</b>，一次点击保存整条帖子。',
      '帖子右上角是 X 自己的“更多”按钮，胶囊<b>改放左上角</b>，不盖住它。位置按顺序试：右上角、左上角、右下角、左下角，选第一个不盖住页面控件的；都被占住时放在指针旁。',
      '保存的是这条帖子的 Markdown：作者与账号、发布时间、正文、图片的替代文字、被引用的帖子；来源取帖子自己的永久链接。入口和描边是扩展自己的浮层，<b>不改网页</b>，也不会留下“已剪藏”的记号。',
    ],
  })

  const hoverCode = board({
    title: '悬停出现 · 文档里的代码块',
    ref: 'capture §6.2 · market §4.3',
    w: 760,
    body: miniView(docsPage({ hover: 'code', blk: { pin: 2, pill: { cls: 'at-tl', up: true, pin: 1 } } }), 440),
    notes: [
      '代码块右上角是文档站自己的“复制”按钮：Docusaurus、MkDocs Material、VitePress 的抽样页面里，每个代码块都有。胶囊因此放在<b>左上角</b>，两个按钮并排，谁也不盖谁。',
      '代码块、表格、图这类<b>难以选中的单元</b>，是一次点击最有价值的地方；Obsidian Web Clipper 的高亮器也只允许点击这几种（market §4.3）。',
      '保存为带语言标记的围栏代码块；“复制”按钮、行号和外框这些页面自己的界面不进入 Markdown。胶囊上的 <b>⌃</b> 可以选到它所在的一节。',
    ],
  })

  const hoverTabs = board({
    title: '悬停出现 · 带语言标签页的代码块（文档站）',
    ref: 'capture §6.2 · §3.1 · market §4.3',
    w: 760,
    body: miniView(docsTabsPage({ hover: true, blk: { pin: 2, pill: { cls: 'at-br', up: true, pin: 1 } } }), 420),
    notes: [
      'OpenAI、Anthropic 的文档把示例放进语言标签页：标签在代码块上方，右边是页面自己的“复制”。右上角与左上角都被占住，胶囊按顺序落到<b>右下角</b>。',
      '其余语言的代码在页面里也存在，但是隐藏的（OpenAI 的 Function calling 页 94 个 <code>pre</code> 里只有 23 个可见）。<b>转换只保存当前显示的这一页</b>，想要别的语言就切过去再剪（capture §3.1）。',
      '这两家的文档页都用 <code>article</code> 作正文容器，标题都有 <code>id</code>：一节的来源链接带上标题锚点，“回到来源”直接落在那一节。',
    ],
  })

  const hoverSection = board({
    title: '层级 · 从一节到整篇文章',
    ref: 'capture §6.2',
    w: 760,
    body: miniView(retriesPage({ hover: 's2', blk: { pin: 2, pill: { up: true, pin: 1 } }, outer: { faint: true, label: 'article', pin: 3 } }), 520),
    notes: [
      '<b>段落不是区块</b>：指针停在一段正文上，目标是它所在的一节（带标题的 <code>section</code>，或从这个标题到下一个同级标题之间的内容）；页面没有标题时才是整篇文章。',
      '胶囊上的 <b>⌃</b> 选<b>上一级</b>（整篇 <code>article</code>，虚线框），<kbd>↑</kbd> / <kbd>↓</kbd> 在层级之间移动。顺序是：帖子、代码块、表格、图、引用 → 一节 → 文章。',
      '这一节存成 Markdown：标题层级、三步列表和链接都在，图片只保留占位；来源取页面地址加这一节标题的锚点，“回到来源”直接落在这一节。',
    ],
  })

  const tall = board({
    title: '长文章 · 胶囊贴着窗口里可见部分的上沿',
    ref: 'capture §6.2 · market §4.3',
    w: 760,
    body: `<div class="mv" style="height:440px">
      ${longPage()}
      <div class="sbar"></div>
      <div class="cont" style="top:8px;left:42%">${I('chevron-up', 'i-sm')} 文章在这里往上还有约 3 屏</div>
      <div class="cont" style="bottom:8px;left:42%">${I('chevron-down', 'i-sm')} 往下还有约 5 屏</div>
      ${blkPill({ cls: 'pin-top', up: true, pin: 1, style: 'top:40px' })}
      <div style="position:absolute;z-index:5;left:300px;top:230px;color:#1b1f2a">${I('mouse-pointer-click', 'i-lg')}${pin(2, 'pin-r')}</div>
    </div>`,
    notes: [
      '整篇文章是很高的一块：抽样的 33 个页面里，27 个的正文容器高于 1.2 个视口，中位约 8.4 个视口。胶囊如果贴在区块自己的右上角，多数时候在视野之外。',
      '区块比窗口高时，胶囊贴着<b>窗口里可见部分的上沿</b>，指针在这篇文章里的任何位置，胶囊都在视野里；滚动时立即收起，停下后重新出现。',
      '整篇文章靠上面的 ⌃ 或区块模式选到，不会在每一段正文上自动弹出：段落的目标是它所在的一节。',
    ],
  })

  const skipBox = (label, extra = '') => `<div class="sch-box skip"><em>${label}</em>${extra || '<i class="ln" style="width:70%"></i>'}</div>`
  const candBox = (label, inner = '', cls = '') => `<div class="sch-box cand ${cls}"><em>${label}</em>${inner}</div>`
  const lines = (...w) => w.map(x => `<i class="ln" style="width:${x}%"></i>`).join('')
  const scope = board({
    title: '识别范围 · 七种区块，与不出现的情形',
    ref: 'capture §6.2',
    w: 1100,
    body: `<div class="ui" style="padding:24px 26px 26px;display:grid;grid-template-columns:430px minmax(0,1fr);gap:28px;background:var(--surface-2)">
      <div class="sch">
        ${skipBox('nav · header', lines(55))}
        <div class="sch-row">
          <div class="sch-main">
            <div class="sch-box cand" style="padding-top:20px">${pin(1, 'pin-in-r')}<em>文章 · article / main / 内容容器</em>${lines(80, 92)}
              ${candBox('一节 · 标题到下一个标题', lines(64) + candBox('代码块 · pre', lines(50), 'inner') + candBox('表格 · table', lines(40), 'inner'), 'inner')}
              <div class="sch-box skip short"><em>不足 120 个字符</em></div>
            </div>
            ${candBox('帖子 · 平台规则（X）', lines(72))}
          </div>
          ${skipBox('aside', '')}
        </div>
        ${skipBox('form · 输入框', lines(48))}
        ${skipBox('footer', lines(40))}
      </div>
      <div class="vs g14">
        <div class="vs g8"><div class="hs g8 b">${chip('七种区块', { v: 'brand' })}<span class="t-sm muted">指针下满足条件的最内层；文字量按字符数，中文同样适用</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:96px"><b>帖子</b></td><td>平台规则：X 的一条帖子，含图片、卡片和被引用的帖子</td></tr>
            <tr><td><b>代码块</b></td><td><code>pre</code>，保留语言标记</td></tr>
            <tr><td><b>表格</b></td><td>有表头或至少两行两列的数据表；包住整篇正文的布局表格不算</td></tr>
            <tr><td><b>图</b></td><td><code>figure</code>，或宽度不小于 200px 的图片</td></tr>
            <tr><td><b>引用</b></td><td><code>blockquote</code>，不少于 20 个字符</td></tr>
            <tr><td><b>一节</b></td><td>标题到下一个同级或更高级标题之间；页面用 <code>section</code> 包住时取它；不少于 120 个字符</td></tr>
            <tr><td><b>文章</b></td><td><code>article</code>、<code>[role=article]</code>；没有时取 <code>main</code> 和常见内容容器（<code>.entry-content</code>、<code>.markdown-body</code> 等）；再没有就取包含至少三个有文字量的段落的最内层容器</td></tr></tbody></table></div>
        <div class="vs g8"><div class="hs g8 b">${chip('不出现')}<span class="t-sm muted">这些情形不打扰</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:150px"><code>nav</code> <code>header</code> <code>footer</code> <code>aside</code></td><td>页面骨架，不是内容</td></tr>
            <tr><td>表单、输入框、对话框</td><td>焦点在输入框或可编辑区里时一律不出现</td></tr>
            <tr><td>不可见元素</td><td>隐藏、折叠、不在视口里的区块</td></tr>
            <tr><td>选区、拖选、滚动中</td><td>此时出现的是选区菜单，或什么都不出现</td></tr>
            <tr><td>扩展自己的界面</td><td>指针在菜单、胶囊、气泡上时不再识别</td></tr></tbody></table></div>
        <div class="banner info">${I('info')}<div>段落、列表项和标题本身<b>不是区块</b>：想剪一句话，选中它；想剪一整段所在的一节，指一下。识别只在指针停下之后运行，只检查指针下的祖先链（含 open shadow root），不整页扫描。</div></div>
      </div></div>`,
    notes: [
      '紫色实线框是会出现入口的区块，灰色虚线斜纹是不出现的。示意里一节嵌在文章里，代码块和表格又嵌在一节里：指针在代码块上，目标是代码块；在一节的正文上，目标是这一节。',
      '文字量按字符数计，而不是词数：通用提取库按“至少 7 个词”判断段落，对中文不成立（market §4.3）。120、20、200px 都是初始值，阶段 V 在真实页面上校准。',
    ],
  })

  const cov = (label, sub, n, w) => `<div class="cov"><span>${label}<br><small class="muted">${sub}</small></span><div class="trk"><i style="width:${w}%"></i></div><span class="n">${n} / 33</span></div>`
  const evidence = board({
    title: '依据 · 41 个真实页面的抽样',
    ref: 'market §4.3',
    w: 1020,
    body: `<div class="ui" style="padding:22px 26px 26px;background:var(--surface-2);display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:30px;align-items:start">
      <div class="vs g8"><b class="t-sm">能包住页面里 75% 以上正文段落的页面数</b>
        <div style="border-top:1px solid var(--line)">
          ${cov('只认语义容器', 'article · [role=article] · 带标题的 section', 20, 60.6)}
          ${cov('再加 main 与常见内容容器', '.entry-content · .markdown-body · main …', 30, 90.9)}
          ${cov('再加文字密集的容器', '包含至少三个有文字量的段落', 32, 97)}
        </div>
        <div class="help">33 个可评估页面：技术文档 20（含 Anthropic、OpenAI 各 3 页）、Medium 1、英文博客 8、中文博客 4；另有 Claude Code 文档等 8 页未计入。2026-10-08 用脚本只读 DOM 统计；X 对无头浏览器返回 403，没有抽样。</div></div>
      <div class="vs g8"><b class="t-sm">其他发现</b>
        <ul class="t-sm" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:7px;color:var(--fg-2)">
          <li><b>整篇文章很高</b>：27 个页面的正文容器高于 1.2 个视口，中位约 8.4 个视口</li>
          <li><b>一节常常不是元素</b>：20 个技术文档页里 12 个没有带标题的 <code>section</code>；标题基本都有 <code>id</code></li>
          <li><b>代码块的“复制”按钮在右上角</b>：Docusaurus、MkDocs Material、VitePress 的 8 / 8；Anthropic 压在右上角外沿，OpenAI 在代码块上方的标题栏</li>
          <li><b>标签页里的代码是隐藏的</b>：OpenAI 的 Structured outputs 页 DOM 里 50 多万字符，可见约 2.6 万</li>
          <li><b>MDN 的代码示例在 open shadow root 里</b>：普通 DOM 里的 <code>pre</code> 为 0</li>
          <li><b>字数</b>：整篇正文（可见文字）中位约 1.2 万字符，3 / 35 超过 5 万（Effective Go、Overreacted、Claude Code 的 Hooks 页）</li>
          <li><b>没有任何规则能识别</b>：Paul Graham 的表格布局页，只能选区剪藏</li></ul></div>
    </div>`,
    notes: ['这些数字决定了前面几块的取舍：不能只认语义标签；胶囊不能固定贴在区块自己的角上；代码块要避开“复制”和语言标签页；转换只保存可见内容；open shadow root 要能识别；字数上限定在 10 万，并看被截断的比例（validation Q-17）。', 'Anthropic、OpenAI 的文档用 <code>article</code>，Claude Code 的文档与 Anthropic 的 API 参考页只有 <code>main</code>，现有规则都能识别（market §4.3）。'],
  })

  const savedEntry = ENTRIES0.find(e => e.id === 'e2')
  const after = board({
    title: '点击之后 · 保存了什么',
    ref: 'capture §3.1 · §5 · §6.2',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:480px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">页面：描边闪一下，出现提示</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { saved: true, pill: { saved: true, press: true, pin: 1 } } })}<div class="toast-pos" style="bottom:14px">${clipToast({ p: 70 })}</div></div></div>
      <div class="vs g8"><b class="t-sm">资料库：同一条剪藏</b>
        <div style="border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;box-shadow:var(--sh-1)">
          <div class="hs g8" style="margin-bottom:10px">${tchip('clip')}<span class="t-xs muted">engineering.example.com/posts/retries#指数退避加抖动</span></div>
          <div class="md md-sm">${mdRender(savedEntry.content, [])}</div>
        </div>
        <div class="help">${pin(2, 'pin-s')}Markdown：标题层级、列表和链接都在；图片只保留占位和“打开原图”，不联网加载。来源地址带着这一节标题的锚点。选区剪藏与区块剪藏保存出来是同一种条目。</div></div>
    </div>`,
    notes: ['点击“剪藏”：描边变绿闪一下，随后出现与选区剪藏<b>完全一致</b>的“已剪藏 · 撤销 · 编辑”提示；撤销、编辑、失败重试的规则都相同。', '内容超过 100,000 个字符时在块边界截断，提示写明“只保存了前 100,000 个字符”并建议改选其中一节（capture §3.1、validation Q-17）。'],
  })

  const mdSrc = `**Display Name** @handle · 2026-10-08

Retries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓

![retry budget dashboard](https://example.com/media/retry-budget.png)

[example.com/retry-budgets](https://example.com/retry-budgets)

> **Another Name** @other · 2026-10-07
> Backpressure is a feature, not a bug.`
  const post = board({
    title: '点击之后 · 一条帖子保存成什么样',
    ref: 'capture §3.1 · §5',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">Markdown 源文本（保存在条目里）</b>
        <pre class="mdsrc">${esc(mdSrc)}</pre>
        <div class="help">${pin(1, 'pin-s')}按平台规则组装：作者与账号、发布时间、正文、图片的替代文字与原地址、卡片链接、被引用的帖子（以引用块保存）。表情图片换成它的替代文字，账号链接保留文字。</div></div>
      <div class="vs g8"><b class="t-sm">资料库里读到的样子</b>
        <div style="border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;box-shadow:var(--sh-1)">
          <div class="hs g8" style="margin-bottom:10px">${tchip('clip')}<span class="t-xs muted">x.com/handle/status/1234567890123456789</span></div>
          <div class="md md-sm">${mdRender(mdSrc, [])}</div>
        </div>
        <div class="help">${pin(2, 'pin-s')}来源是这条帖子自己的永久链接，取自帖子里发布时间的链接。图片只有占位和“打开原图”；需要保留画面，就点胶囊里的“截图”。</div></div>
    </div>`,
    notes: ['平台规则失效（站点改版）时退回通用识别，内容可能带着页面的界面，仍然保存，不阻塞（capture §7）。', '不自动展开线程或评论串：一次剪一条帖子，想要整串时逐条剪，或者截图。'],
  })

  const keyboard = board({
    title: '键盘路径与开关',
    ref: 'extension §2.5 · §7.1 · capture §6.2',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:560px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">区块模式：用键盘选区块并剪藏</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { pin: 2 }, outer: { faint: true, label: 'article' } })}
        <div class="capsule" style="left:50%;top:12px;transform:translateX(-50%)">${pin(1)}<i class="dotp"></i>区块模式 · 一节<span style="opacity:.65">${keys('Tab')} 同层 ${keys('↑')}${keys('↓')} 层级</span>${keys('Enter')}剪藏${keys('S')}截图${keys('Esc')}退出</div></div>
        <div class="help">悬停入口之外的等价路径：键盘与读屏用户同样能剪整块。默认 <b>Ctrl/⌘+Shift+E</b>，可在浏览器的快捷键设置页里改；模式里页面链接暂不响应点击。</div></div>
      <div class="vs g12"><b class="t-sm">开关与按网站停用</b>
        <div style="position:relative;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden">${pin(3, 'pin-in-r')}
          ${settingsRow('区块剪藏入口', '指针停在区块上时，旁边出现胶囊。默认开启；区块模式不受这个开关影响。', sw(true))}
          ${settingsRow('已停用的网站', '在胶囊的“更多”里选“在此网站停用”。', `<span class="chip">2 个</span>${btn('管理', { sm: true })}`)}
        </div>
        <div class="vs g6"><span class="t-xs muted">胶囊里的“更多”菜单</span>
          <div class="menu" style="width:230px">${menuItem('ban', '在 engineering.example.com 停用', { on: true })}${menuItem('eye-off', '关闭区块剪藏入口')}${menuItem('settings', '设置…')}</div></div>
      </div></div>`,
    notes: ['区块模式：悬停描边、<kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> 在同层区块间移动、<kbd>↑</kbd> / <kbd>↓</kbd> 换层级、<kbd>Enter</kbd> 剪藏、<kbd>S</kbd> 截图、<kbd>Esc</kbd> 退出；模式胶囊用文字说明当前的区块类型和这些按键，读屏会读出区块类型与摘要。', '悬停入口默认开启，才能被发现；整体关闭与按网站停用把干扰交给用户。设置里的开关与胶囊里的“更多”菜单是同一个状态。'],
  })

  return group(
    { id: 'ext-block', title: '区块剪藏：指一下就留下整块', small: 'capture §6.2', desc: '帖子、代码块、一节、整篇文章这样的整体内容，不必先拖选：指针停在上面，旁边出现胶囊「剪藏 | 截图 | 上一级 | 更多」。入口只是浮层，不改网页；位置避开页面自己的控件。' },
    row(hoverFeed, hoverCode),
    row(hoverTabs, hoverSection),
    row(tall),
    row(scope),
    row(evidence),
    row(after),
    row(post),
    row(keyboard),
  )
}
