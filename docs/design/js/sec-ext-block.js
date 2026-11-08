// 浏览器扩展 · 页面内：区块剪藏。依据 capture §6.2、extension §2.1、market §4.3、§4.9。
// 指到哪一块就是哪一块：指针停在一段正文上，描出这一段，上沿标出类型与范围；胶囊里的「外一层」沿目标链一层层换到一节、整篇文章。
const BLK_PROPOSAL = 'capture §6.2 评审中'

// 标注的范围：开头 16 个字符（一节的标题 24 个），超出的截断并加省略号
const blkCut = (text, n = 16) => {
  const chars = Array.from(text)
  return chars.length > n ? `${chars.slice(0, n).join('')}…` : text
}
const BLK_LB = {
  p1: `段落 · ${blkCut('依赖已经饱和时，每一次重试都在给一个正在失败的系统加负载')}`,
  p2: `段落 · ${blkCut('重试不要立刻发出：每次失败后把等待时间翻倍')}`,
  h2: '标题 · 指数退避加抖动',
  s2: '一节 · 指数退避加抖动',
  art: '文章 · 整篇',
}

// 一篇很长的文章：整篇比窗口高，上下都延伸到窗口之外。从“退避与抖动”的第一段连点两次「外一层」到了整篇：
// 标注贴着窗口里可见部分的上沿，胶囊留在那一段的角上，「外一层」变灰
const longPage = () => `<div class="pg pg-rt"><div class="pg-art" style="position:relative;margin-top:0">
  <i class="blk" style="inset:-260px -12px -260px -12px"><em style="top:268px">${BLK_LB.art}${pin(2, 'pin-r')}</em></i>
  <section class="sx"><h2>重试预算</h2><p>给每个下游设一个重试配额，用完就快速失败，而不是继续放大负载。预算按服务端的实际承载量调，不要照抄示例里的数字。</p></section>
  <section class="sx"><h2>退避与抖动</h2><div class="mk"><p>重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的随机因子，让客户端不再同时重试。</p>${blkOverlay({ noRing: true, pill: { pin: 1, inner: true, top: true, hot: 'outer', tip: '已是最外一层' } })}</div><p>完整推导见 AWS 架构博客里那篇关于抖动的文章，结论是加了抖动之后总完成时间几乎不变，而峰值负载明显下降。</p></section>
  <section class="sx"><h2>熔断</h2><p>依赖持续失败时快速失败，给下游留出恢复时间；半开状态下只放过少量探测请求。</p></section>
</div></div>`

// 页面上的指针（静态画板用）
const blkPointer = (left, top, o = {}) => `<div style="position:absolute;z-index:26;left:${left}px;top:${top}px;color:#1b1f2a;${o.faded ? 'opacity:.45' : ''}">${I(o.icon || 'mouse-pointer', 'i-lg')}${o.pin ? pin(o.pin, 'pin-r') : ''}</div>`

function extBlockGroup() {
  const hoverPara = board({
    title: '起点 · 指到哪一段就是哪一段',
    ref: 'capture §6.2 · market §4.9',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(retriesPage({ marks: { p2: { pin: 2, label: BLK_LB.p2, pill: { pin: 1, hot: 'outer', tip: `外一层 · ${BLK_LB.s2}` } }, s2: { preview: true, pin: 3 } } }), 520),
    notes: [
      '指针在一段正文上停下约 400ms，<b>描出的就是这一段</b>，上沿标出类型与范围：“段落 · ”加开头 16 个字。取法和截图取景相同：指针下最内层的块；三个入口指着同一处，描出同一个范围。',
      '胶囊多了一组换层按钮，和三个动作之间隔一条细线。起点往里没有层，所以只有「外一层」；指针停在它上面，悬停提示写出下一层的标注：“外一层 · 一节 · 指数退避加抖动”。',
      '同时<b>虚线描出点下去会换到的那一层</b>——这一节从标题到最后一段；实线仍在这一段上。剪走更大的一块之前，先看得见它有多大。',
    ],
  })

  const hoverStep = board({
    title: '外一层 · 一节，再一层是整篇',
    ref: 'capture §6.2',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(
      retriesPage({ marks: { p2: { noRing: true, pill: { pin: 1, inner: true, hot: 'outer', tip: `外一层 · ${BLK_LB.art}` } }, s2: { pin: 2, label: BLK_LB.s2 }, art: { preview: true, pin: 3 } } }),
      520,
    ),
    notes: [
      '点一下「外一层」：实线与标注换到这一节。胶囊<b>留在原处</b>，不追到这一节的角上；胶囊靠右缘定位，多出的「里一层」长在「外一层」左边，指针下的「外一层」不移位，可以连点。',
      '平铺的文档页上，从段落往外一层是一节，不会一步跳到整篇；首个标题之前的段落没有一节，外一层直接是文章。',
      '再停在「外一层」上，虚线描出整篇文章，提示写“外一层 · 文章 · 整篇”。点下去之后「外一层」变灰：文章之外不再有层，也<b>不回绕</b>到起点——回绕时多点一下，就要绕满一圈才回得来。指针移到别的块上，层级回到起点。',
    ],
  })

  // 胶囊的几种状态：静态排开，换层按钮的提示写出下一层的标注
  // 胶囊靠右放：提示从换层按钮向左展开，和页面上一样
  const pillAt = (o, caption, sub) =>
    `<div class="hs g16" style="align-items:flex-start"><div style="flex:none;width:262px;height:${o.hot ? 64 : 36}px;display:flex;justify-content:flex-end">${blkPill({ ...o, style: 'position:relative;top:0;right:auto;left:0' })}</div><div class="vs g4" style="padding-top:6px"><b class="t-sm">${caption}</b><span class="t-xs muted">${sub}</span></div></div>`
  const tick = (ms, d, still, show) =>
    `<div class="vs g4" style="align-items:center;flex:1"><span class="t-xs muted">${ms}</span><i style="display:block;width:14px;height:14px;border-radius:50%;background:${still ? 'var(--brand)' : 'transparent'};border:2px solid ${still ? 'var(--brand)' : 'var(--fg-3)'}"></i><span class="t-xs" style="color:${still ? 'var(--brand)' : 'var(--fg-3)'}">${d}</span>${show ? `<span class="chip" style="height:20px;font-size:11px">${show}</span>` : '<span style="height:20px"></span>'}</div>`
  const capsuleSpec = board({
    title: '胶囊 · 按钮、换层与停下的判断',
    ref: 'capture §6.2 · extension §7.2 · market §4.9',
    proposal: BLK_PROPOSAL,
    w: 1180,
    body: `<div class="ui" style="padding:22px 26px 26px;background:var(--surface-2);display:grid;grid-template-columns:560px minmax(0,1fr);gap:30px;align-items:start">
      <div class="vs g12"><b class="t-sm">${pin(1, 'pin-s')}按钮从左到右：剪藏、截图、下载 | （里一层）、外一层 | 更多</b>
        <div class="vs g12">
          ${pillAt({}, '起点', '往里没有链上的层，只有「外一层」')}
          ${pillAt({ hot: 'outer', tip: `外一层 · ${BLK_LB.s2}` }, '停在「外一层」上', '提示写出下一层的标注，页面上虚线描出它')}
          ${pillAt({ inner: true }, '往外走过一层之后', '「里一层」长在左边，右缘与「外一层」不动')}
          ${pillAt({ inner: true, top: true, hot: 'outer', tip: '已是最外一层' }, '到了最外一层', '「外一层」变灰，aria-disabled，读屏里仍在')}
          ${pillAt({ inner: true, hot: 'inner', tip: `里一层 · ${BLK_LB.h2}` }, '起点是标题开头的一节', '标题本身在链里，往里一层就到')}
          ${pillAt({ lang: 'en', hot: 'outer', tip: 'Expand · Article · Whole page' }, '英文界面', 'Clip · Screenshot · Download · Shrink · Expand · More；最外一层的提示是 Outermost layer')}
          ${pillAt({ noShot: true }, '同源 iframe 里', '没有截图与下载，换层照常')}
        </div></div>
      <div class="vs g14">
        <div class="vs g8"><div class="hs g8 b">${pin(2, 'pin-s')}${chip('停下', { v: 'brand' })}<span class="t-sm muted">每 100ms 取一次指针位置，移动不到 6px 算停着；连续停约 400ms 出胶囊</span></div>
          <div style="border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:12px 14px" class="vs g10">
            <div class="hs g10" style="align-items:flex-start"><span class="t-xs b" style="width:92px;padding-top:16px">按位移判断</span>${tick('0', '12px', false)}${tick('100ms', '3px', true)}${tick('200ms', '5px', true)}${tick('300ms', '1px', true)}${tick('400ms', '4px', true, '出胶囊')}</div>
            <div class="hs g10" style="align-items:flex-start;opacity:.7"><span class="t-xs b" style="width:92px;padding-top:16px">每动一下重新计时</span>${tick('0', '12px', false)}${tick('100ms', '3px', false)}${tick('200ms', '5px', false)}${tick('300ms', '1px', false)}${tick('400ms', '4px', false, '还在等')}</div>
          </div>
          <div class="help">手抖与触控板的漂移每次只有几个像素：按事件计时，胶囊迟迟不出；按位移判断，停在原处约 400ms 就出来（hoverIntent 的做法，market §4.9）。30×10、6px 与 100ms 在真机验收时校准（roadmap §5）。</div></div>
        <div class="vs g8"><div class="hs g8 b">${pin(3, 'pin-s')}${chip('标注')}<span class="t-sm muted">描边上沿的“类型 · 范围”；范围取开头 16 个字符，一节的标题取 24 个</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:110px"><b>块</b></td><td>${BLK_LB.p2}</td><td class="muted">Paragraph · When a producer emi…</td></tr>
            <tr><td><b>帖子</b></td><td>帖子 · @handle</td><td class="muted">Post · @handle</td></tr>
            <tr><td><b>代码块</b></td><td>代码块 · 18 行</td><td class="muted">Code block · 18 lines</td></tr>
            <tr><td><b>表格</b></td><td>表格 · 6 行 × 4 列</td><td class="muted">Table · 6 rows × 4 columns</td></tr>
            <tr><td><b>图</b></td><td>图 · 重试间隔的分布（没有图注时 640 × 360）</td><td class="muted">Figure · 640 × 360</td></tr>
            <tr><td><b>一节</b></td><td>${BLK_LB.s2}</td><td class="muted">Section · Exponential backoff…</td></tr>
            <tr><td><b>文章</b></td><td>${BLK_LB.art}</td><td class="muted">Article · Whole page</td></tr>
            <tr><td><b>截图取景</b></td><td>figure · 640 × 360；一节写“一节”与尺寸</td><td class="muted">像素看法，标签照旧</td></tr></tbody></table></div>
      </div></div>`,
    notes: [
      '换层按钮成对：起初只有「外一层」，往外走过一层（或起点就是标题开头的一节、小块外面的那一层）才有「里一层」。悬停不接管方向键，页面要用它们滚动；键盘用户在区块模式里用 <kbd>↑</kbd> <kbd>↓</kbd>。',
      '停下按位移、不按事件：识别只在停下之后运行，所以照样不拖慢滚动。',
      '标注放在描边上沿的左端，胶囊在左上角时放到右端；块太窄、会碰到胶囊时只写类型。截图取景仍写元素名与尺寸。',
    ],
  })

  const hoverHeading = board({
    title: '起点 · 指在标题上，取它开头的一节',
    ref: 'capture §6.2 · market §4.9',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(retriesPage({ marks: { s2: { pin: 2, label: BLK_LB.s2, pill: { pin: 1, inner: true, hot: 'inner', tip: `里一层 · ${BLK_LB.h2}` } }, h2: { preview: true, pin: 3 } } }), 520),
    notes: [
      '只剪一个标题几乎没有用处：指针停在标题上，起点是<b>这个标题开头的那一节</b>，标注写“一节 · 指数退避加抖动”。Firefox 截图的自动取景同样跳过 H1–H6（market §4.9）。',
      '标题本身仍在链里，是这一节里面的一层，所以起点就有「里一层」。停在它上面，虚线只框住标题。',
      '截图取景用同一个起点：单击标题截的是这一节。这比只截标题顺手，由产品负责人在真机验收时确认（roadmap §5）。',
    ],
  })

  const pause = board({
    title: '暂停 · 点偏了选区菜单之后',
    ref: 'capture §6.2 · extension §2.1',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: `<div class="mv" style="height:520px">${retriesPage({ marks: { p1: { label: BLK_LB.p1, pill: { pin: 4 } } } })}
      ${blkPointer(300, 34, { faded: true, pin: 1 })}
      <div class="cont" style="top:80px;left:330px">${I('ban', 'i-sm')} 点偏之后这一段暂停：停多久都不出胶囊${pin(2, 'pin-r')}</div>
      <div class="cont" style="top:104px;left:330px;border-style:dashed">${I('arrow-down', 'i-sm')} 移到别的块上${pin(3, 'pin-r')}</div>
      ${blkPointer(300, 156)}
    </div>`,
    notes: [
      '选区菜单与胶囊都是深色、只有图标的胶囊。点偏了菜单、落在页面上时，菜单收起、选区塌缩；这时指针若再停约 400ms 就在原处出胶囊，用户会以为还在用菜单，剪走的却是整块。',
      '所以这一下之后，胶囊在<b>当时指针下的这一块</b>上暂停：指针在这里停多久都不出现。按键关掉胶囊之后同样暂停。',
      '指针下的起点变了才解除——移到别的块上，或页面滚动让另一块来到指针下。暂停跟着块走、不计时：点偏之后人往往在原处停不止 1 秒，计时的冷却只是把胶囊推后。',
      '在新的块上照常计时，约 400ms 后描边、标注与胶囊一起出现。',
    ],
  })

  const hoverFeed = board({
    title: '悬停出现 · X 的一条帖子',
    ref: 'capture §6.2 · extension §2.1',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(feedPage({ blk: { pin: 2, label: '帖子 · @handle', labelAt: 'r', pill: { cls: 'at-tl', pin: 1, top: true } } }), 440),
    notes: [
      '指针在一条帖子上停留约 400ms，帖子周围出现描边与标注“帖子 · @handle”，旁边出现胶囊。帖子是小单元，里面不再分出块：指在帖子的哪一行文字上，起点都是这条帖子。<b>没有选区也能用</b>，一次点击保存整条帖子。',
      '帖子右上角是 X 自己的“更多”按钮，胶囊<b>改放左上角</b>，标注随之放到上沿的右端。胶囊的左右缘留在帖子轮廓内，不伸到旁边的边栏上。位置按顺序试：右上角、左上角、右下角、左下角，再沿上沿向左，选第一个不盖住页面控件的。',
      '时间线的列并列着很多条帖子，不是一层：帖子就是最外一层，「外一层」变灰；被引用的帖子之外才是外层帖。保存的是这条帖子的 Markdown，来源取它自己的永久链接；入口和描边是扩展自己的浮层，<b>不改网页</b>。',
    ],
  })

  const hoverCode = board({
    title: '悬停出现 · 文档里的代码块',
    ref: 'capture §6.2 · market §4.3',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(docsPage({ hover: 'code', blk: { pin: 2, label: '代码块 · 6 行', labelAt: 'r', pill: { cls: 'at-tl', pin: 1, hot: 'outer', tip: '外一层 · 一节 · 配置重试预算' } }, sec: { preview: true, pin: 3 } }), 440),
    notes: [
      '代码块右上角是文档站自己的“复制”按钮：Docusaurus、MkDocs Material、VitePress 的抽样页面里，每个代码块都有。胶囊因此放在<b>左上角</b>，标注放到右端，谁也不盖谁。',
      '代码块、表格、图这类<b>难以选中的单元</b>，是一次点击最有价值的地方；Obsidian Web Clipper 的高亮器也只允许点击这几种（market §4.3）。保存为带语言标记的围栏代码块，“复制”按钮与行号不进 Markdown。',
      '停在「外一层」上，虚线描出它所在的一节，提示写“外一层 · 一节 · 配置重试预算”；代码块外面包着的卡片只多几个字，和代码块并成一层，不单独占一次点击。',
    ],
  })

  const hoverTabs = board({
    title: '悬停出现 · 带语言标签页的代码块（文档站）',
    ref: 'capture §6.2 · §3.1 · market §4.3',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: miniView(docsTabsPage({ hover: true, blk: { pin: 2, label: '代码块 · 7 行', pill: { cls: 'at-br', pin: 1 } } }), 420),
    notes: [
      'OpenAI、Anthropic 的文档把示例放进语言标签页：标签在代码块上方，右边是页面自己的“复制”。右上角与左上角都被占住，胶囊按顺序落到<b>右下角</b>，标注留在上沿左端。',
      '其余语言的代码在页面里也存在，但是隐藏的（OpenAI 的 Function calling 页 94 个 <code>pre</code> 里只有 23 个可见）。<b>转换只保存当前显示的这一页</b>，想要别的语言就切过去再剪（capture §3.1）。',
      '这两家的文档页都用 <code>article</code> 作正文容器，标题都有 <code>id</code>：一节的来源链接带上标题锚点，“回到来源”直接落在那一节。',
    ],
  })

  const tall = board({
    title: '长文章 · 标注和胶囊贴着窗口里可见部分的上沿',
    ref: 'capture §6.2 · market §4.3',
    proposal: BLK_PROPOSAL,
    w: 760,
    body: `<div class="mv" style="height:440px">
      ${longPage()}
      <div class="sbar"></div>
      <div class="cont" style="top:8px;left:58%">${I('chevron-up', 'i-sm')} 文章在这里往上还有约 3 屏</div>
      <div class="cont" style="bottom:8px;left:42%">${I('chevron-down', 'i-sm')} 往下还有约 5 屏</div>
    </div>`,
    notes: [
      '从“退避与抖动”的第一段连点两次「外一层」，目标到了整篇。胶囊<b>留在原处</b>，「外一层」变灰，提示“已是最外一层”；文章之外不再有层。',
      '整篇文章是很高的一块：抽样的 33 个页面里，27 个的正文容器高于 1.2 个视口，中位约 8.4 个视口。它的上沿在窗口之外，标注“文章 · 整篇”就贴着<b>窗口里可见部分的上沿</b>，剪走整篇之前看得见。',
      '起点本身比窗口高时（很长的代码块、长帖子，或指针停在正文容器自己的空白处、起点就是整篇），胶囊也贴着可见部分的上沿，指针在这一块里的任何位置，胶囊都在视野里。滚动时立即收起，停下后重新出现。',
    ],
  })

  const skipBox = (label, extra = '') => `<div class="sch-box skip"><em>${label}</em>${extra || '<i class="ln" style="width:70%"></i>'}</div>`
  const candBox = (label, inner = '', cls = '') => `<div class="sch-box cand ${cls}"><em>${label}</em>${inner}</div>`
  const lines = (...w) => w.map(x => `<i class="ln" style="width:${x}%"></i>`).join('')
  const scope = board({
    title: '目标链 · 八种层、两种看法与不出现的情形',
    ref: 'capture §6.2',
    proposal: BLK_PROPOSAL,
    w: 1100,
    body: `<div class="ui" style="padding:24px 26px 26px;display:grid;grid-template-columns:430px minmax(0,1fr);gap:28px;background:var(--surface-2)">
      <div class="sch">
        ${skipBox('nav · header', lines(55))}
        <div class="sch-row">
          <div class="sch-main">
            <div class="sch-box cand" style="padding-top:20px">${pin(1, 'pin-in-r')}<em>文章 · article / main / 内容容器</em>${candBox('段落 · 首个标题之前', lines(80), 'inner')}
              ${candBox('一节 · 标题到下一个标题', candBox('标题', lines(40), 'inner') + candBox('段落 · 块', lines(64), 'inner') + candBox('代码块 · pre', lines(50), 'inner') + candBox('表格 · table', lines(40), 'inner'), 'inner')}
              <div class="sch-box skip short"><em>不足 120 个字符的 section 是块</em></div>
            </div>
            ${candBox('帖子 · 平台规则（X）', lines(72))}
          </div>
          ${skipBox('aside', '')}
        </div>
        ${skipBox('form · 输入框', lines(48))}
        ${skipBox('footer', lines(40))}
      </div>
      <div class="vs g14">
        <div class="vs g8"><div class="hs g8 b">${chip('目标链里的层', { v: 'brand' })}<span class="t-sm muted">按包含关系从里到外；文字量按字符数，中文同样适用</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:96px"><b>块</b></td><td>计算样式不是行内的元素；行内元素往外取到它所在的块。段落、列表项、列表、标题按元素称呼，其余叫块</td></tr>
            <tr><td><b>帖子</b></td><td>平台规则：X 的一条帖子，含图片、卡片和被引用的帖子</td></tr>
            <tr><td><b>代码块</b></td><td><code>pre</code>，保留语言标记</td></tr>
            <tr><td><b>表格</b></td><td>有表头或至少两行两列的数据表；包住整篇正文的布局表格不算</td></tr>
            <tr><td><b>图</b></td><td><code>figure</code>，或宽度不小于 200px 的图片</td></tr>
            <tr><td><b>引用</b></td><td><code>blockquote</code>，不少于 20 个字符</td></tr>
            <tr><td><b>一节</b></td><td>标题到下一个同级或更高级标题之间；页面用 <code>section</code> 包住时取它；每一级标题各是一层；不少于 120 个字符</td></tr>
            <tr><td><b>文章</b></td><td><code>article</code>、<code>[role=article]</code>；没有时取 <code>main</code> 和常见内容容器（<code>.entry-content</code>、<code>.markdown-body</code> 等）；再没有就取包含至少三个有文字量的段落的最内层容器</td></tr></tbody></table></div>
        <div class="vs g8"><div class="hs g8 b">${chip('两种看法')}<span class="t-sm muted">同一条链，截图与剪藏看到的层数不同</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:150px"><b>像素看法</b><br><span class="muted">截图取景</span></td><td>指针下的块和它的每一个祖先都是一层，直到 <code>body</code> 之下；只跳过外框完全相同的层；一节插在段落与容器之间；侧栏、页眉照样取得到</td></tr>
            <tr><td><b>内容看法</b><br><span class="muted">悬停胶囊与区块模式</span></td><td>外一层多出的文字不到 20 个字符、也没有多出图片或视频时并成一层；帖子、代码块、表格、图、引用里面不再分出块；链到文章为止，信息流的列不进链</td></tr></tbody></table></div>
        <div class="vs g8"><div class="hs g8 b">${chip('不出现')}<span class="t-sm muted">这些情形不打扰</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:150px"><code>nav</code> <code>header</code> <code>footer</code> <code>aside</code></td><td>页面骨架，不是内容</td></tr>
            <tr><td>表单、输入框、对话框</td><td>焦点在输入框或可编辑区里时一律不出现</td></tr>
            <tr><td>不可见元素、空的块</td><td>隐藏、折叠的元素；既没有文字也没有图片或视频的块</td></tr>
            <tr><td>选区、拖选、滚动中</td><td>此时出现的是选区菜单，或什么都不出现</td></tr>
            <tr><td>暂停中的块</td><td>点偏选区菜单、选区塌缩或按键关掉胶囊之后，移到别的块之前</td></tr>
            <tr><td>扩展自己的界面</td><td>指针在菜单、胶囊、气泡上时不再识别</td></tr></tbody></table></div>
        <div class="banner info">${I('info')}<div>起点是指针下最内层的块，两个例外：指在标题上取它开头的一节；宽不到 30 或高不到 10 像素的块取外面一层，不再往外放大。识别只在指针停下之后运行，只检查指针下的祖先链和标题所在的同级元素（含 open shadow root），不整页扫描。</div></div>
      </div></div>`,
    notes: [
      '紫色实线框是链上的层，灰色虚线斜纹是不出现的。示意里一节嵌在文章里，标题、段落、代码块和表格又嵌在一节里：指针在代码块上，起点是代码块；在一段正文上，起点是这一段，往外一层是这一节。',
      '文字量按字符数计，而不是词数：通用提取库按“至少 7 个词”判断段落，对中文不成立（market §4.3）。120、20、200px 都是初始值，按真实页面的识别结果调整。',
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
        <div class="help">33 个可评估页面：技术文档 20（含 Anthropic、OpenAI 各 3 页）、Medium 1、英文博客 8、中文博客 4；另有 Claude Code 文档等 8 页未计入。用脚本只读 DOM 统计；X 对无头浏览器返回 403，没有抽样。</div></div>
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
    proposal: BLK_PROPOSAL,
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:480px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">页面：描边闪一下，出现提示</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { saved: true, label: BLK_LB.s2, pill: { saved: true, press: true, pin: 1, inner: true } } })}<div class="toast-pos" style="bottom:14px">${clipToast({ p: 70 })}</div></div></div>
      <div class="vs g8"><b class="t-sm">资料库：同一条剪藏</b>
        <div style="border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;box-shadow:var(--sh-1)">
          <div class="hs g8" style="margin-bottom:10px">${tchip('clip')}<span class="t-xs muted">engineering.example.com/posts/retries#指数退避加抖动</span></div>
          <div class="md md-sm">${mdRender(savedEntry.content, [])}</div>
        </div>
        <div class="help">${pin(2, 'pin-s')}Markdown：标题层级、列表和链接都在；图片只保留占位和“打开原图”，不联网加载。来源地址带着这一节标题的锚点。选区剪藏与区块剪藏保存出来是同一种条目。</div></div>
    </div>`,
    notes: ['点击“剪藏”：描边变绿闪一下，随后出现与选区剪藏<b>完全一致</b>的“已剪藏 · 撤销 · 编辑”提示；撤销、编辑、失败重试的规则都相同。剪的是哪一层，就存哪一层：段落存一段，一节存从标题到最后一段。', '内容超过 100,000 个字符时在块边界截断，提示写明“只保存了前 100,000 个字符”并建议改选其中一节（capture §3.1、validation Q-17）。'],
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
    proposal: BLK_PROPOSAL,
    w: 1120,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:680px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">区块模式：用键盘选目标并剪藏</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { pin: 2, label: BLK_LB.s2 } })}
        <div class="capsule" style="left:50%;top:12px;transform:translateX(-50%)">${pin(1)}<i class="dotp"></i>区块模式 · ${BLK_LB.s2}<span style="opacity:.65">${keys('Tab')} 同档 ${keys('↑')}${keys('↓')} 层级</span>${keys('Enter')}剪藏${keys('S')}截图${keys('D')}下载${keys('Esc')}退出</div></div>
        <div class="help">悬停入口之外的等价路径：键盘与读屏用户同样能剪整块。默认 <b>Ctrl/⌘+Shift+E</b>，可在浏览器的快捷键设置页里改；模式里页面链接暂不响应点击。</div></div>
      <div class="vs g12"><b class="t-sm">开关与按网站停用</b>
        <div style="position:relative;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden">${pin(3, 'pin-in-r')}
          ${settingsRow('区块剪藏入口', '指针停在一块内容上时，旁边出现胶囊。默认开启；区块模式不受这个开关影响。', sw(true))}
          ${settingsRow('已停用的网站', '在胶囊的“更多”里选“在此网站停用”。', `<span class="chip">2 个</span>${btn('管理', { sm: true })}`)}
        </div>
        <div class="vs g6"><span class="t-xs muted">胶囊里的“更多”菜单</span>
          <div class="menu" style="width:230px">${menuItem('ban', '在 engineering.example.com 停用', { on: true })}${menuItem('eye-off', '关闭区块剪藏入口')}${menuItem('settings', '设置…')}</div></div>
      </div></div>`,
    notes: [
      '区块模式用内容看法的链，描边与标注同悬停入口：<kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> 在同档目标间移动（块与小单元一档，一节按标题级别各一档，文章一档），<kbd>↑</kbd> / <kbd>↓</kbd> 换层级（同「外一层」「里一层」），<kbd>Enter</kbd> 剪藏、<kbd>S</kbd> 截图、<kbd>D</kbd> 下载、<kbd>Esc</kbd> 退出。',
      '打开就有目标：键盘焦点所在元素的起点，没有焦点时是窗口里第一个起点。块这一档里 <kbd>Tab</kbd> 停在标题本身，不停在外层的包装上；模式胶囊用文字说明当前目标的标注和这些按键，读屏读出类型与摘要。',
      '悬停入口默认开启，才能被发现；整体关闭与按网站停用把干扰交给用户。设置里的开关与胶囊里的“更多”菜单是同一个状态。',
    ],
  })

  return group(
    {
      id: 'ext-block',
      title: '区块剪藏：指一下就留下整块',
      small: 'capture §6.2',
      desc: '指到哪一块就是哪一块：指针停在一段正文上，描出这一段，上沿标出类型与范围；胶囊里的「外一层」一层层换到一节、整篇文章，每一步先用虚线看到范围。点偏了选区菜单之后，原处这一块暂停，移到别的块上才出现。入口只是浮层，不改网页；位置避开页面自己的控件。',
    },
    row(hoverPara, hoverStep),
    row(capsuleSpec),
    row(hoverHeading, pause),
    row(hoverFeed, hoverCode),
    row(hoverTabs, tall),
    row(scope),
    row(evidence),
    row(after),
    row(post),
    row(keyboard),
  )
}
