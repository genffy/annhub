// 浏览器扩展 · 页面内：区块剪藏（提案，D-20）。依据 capture §6.2、extension §2.1。
// 推文、帖子、一篇文章这样的整体内容，不必先拖选：指针停在上面，区块旁出现“剪藏”。
// 入口怎样出现、识别哪些区块、默认开不开尚未确认（validation D-20），这里画的是对它的提案。

function extBlockGroup() {
  const hoverFeed = board({
    title: '悬停出现 · 一条推文',
    ref: 'capture §6.2 · extension §2.1',
    proposal: 'D-20',
    w: 760,
    body: miniView(feedPage({ blk: { pin: 2, pill: { pin: 1 } } }), 440),
    notes: [
      '指针在一条推文上停留约 400ms，推文周围出现描边，右上角出现“剪藏”胶囊。<b>没有选区也能用</b>，一次点击保存整条推文。',
      '描边与胶囊都是扩展自己的浮层，<b>不改网页</b>；指针离开约 150ms 后消失。保存之后页面上也不会留下“已剪藏”的记号。',
      '保存的是这条推文的 Markdown，来源取推文自己的永久链接，作者与发布时间取得到就写进属性。',
    ],
  })

  const hoverSection = board({
    title: '悬停出现 · 文章里的一节',
    ref: 'capture §6.2 · extension §2.1',
    proposal: 'D-20',
    w: 760,
    body: miniView(retriesPage({ hover: 's2', blk: { pin: 2, pill: { up: true, pin: 1 } }, outer: { faint: true, label: 'article', pin: 3 } }), 520),
    notes: [
      '指针取<b>最内层</b>满足条件的区块：这里是带标题的一节（“指数退避加抖动”），而不是整篇文章或其中的一个段落。',
      '胶囊上的 <b>⌃</b> 选<b>上一级</b>（整篇 <code>article</code>，虚线框），键盘上用 <kbd>↑</kbd> / <kbd>↓</kbd> 在层级之间移动。',
      '这一节存成 Markdown：标题层级、三步列表和链接都在，图片只留占位（D-21）。',
    ],
  })

  const skipBox = (label, extra = '') => `<div class="sch-box skip"><em>${label}</em>${extra || '<i class="ln" style="width:70%"></i>'}</div>`
  const scope = board({
    title: '识别范围 · 出现与不出现',
    ref: 'capture §6.2',
    proposal: 'D-20',
    w: 1100,
    body: `<div class="ui" style="padding:24px 26px 26px;display:grid;grid-template-columns:430px minmax(0,1fr);gap:28px;background:var(--surface-2)">
      <div class="sch">
        ${skipBox('nav · header', '<i class="ln" style="width:55%"></i>')}
        <div class="sch-row">
          <div class="sch-main">
            <div class="sch-box cand" style="padding-top:20px">${pin(1, 'pin-in-r')}<em>article</em><i class="ln" style="width:80%"></i><i class="ln" style="width:92%"></i>
              <div class="sch-box cand inner"><em>带标题的 section</em><i class="ln" style="width:64%"></i></div>
              <div class="sch-box skip short"><em>文字太少</em></div>
            </div>
            <div class="sch-box cand"><em>平台规则 · 一条帖子 / 评论</em><i class="ln" style="width:72%"></i></div>
          </div>
          ${skipBox('aside', '')}
        </div>
        ${skipBox('form · 输入框', '<i class="ln" style="width:48%"></i>')}
        ${skipBox('footer', '<i class="ln" style="width:40%"></i>')}
      </div>
      <div class="vs g14">
        <div class="vs g8"><div class="hs g8 b">${chip('出现', { v: 'brand' })}<span class="t-sm muted">满足其一，且文字量足够</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:150px"><code>article</code></td><td>语义上的一篇内容</td></tr>
            <tr><td><code>[role=article]</code></td><td>无障碍标注为文章的容器</td></tr>
            <tr><td>带标题的 <code>section</code></td><td>有 <code>h1–h4</code> 的一节，取最内层</td></tr>
            <tr><td>平台规则</td><td>推文、帖子、评论：规则与永久链接规则一起集中维护</td></tr></tbody></table></div>
        <div class="vs g8"><div class="hs g8 b">${chip('不出现')}<span class="t-sm muted">这些情形不打扰</span></div>
          <table class="sp-table" style="font-size:12.5px"><tbody>
            <tr><td style="width:150px"><code>nav</code> <code>header</code> <code>footer</code> <code>aside</code></td><td>页面骨架，不是内容</td></tr>
            <tr><td>表单与输入框</td><td>焦点在输入框里时一律不出现</td></tr>
            <tr><td>不可见元素</td><td>隐藏、折叠、不在视口里的区块</td></tr>
            <tr><td>文字太少</td><td>没有一段完整文字的区块（不设固定字数，阶段 V 校准）</td></tr>
            <tr><td>选区、拖选、滚动中</td><td>此时出现的是选区菜单，或什么都不出现</td></tr>
            <tr><td>扩展自己的界面</td><td>指针在菜单、胶囊、气泡上时不再识别</td></tr></tbody></table></div>
        <div class="banner info">${I('info')}<div><b>推荐 A</b>：只认语义元素与平台规则，不引入通用的正文评分——可预期、好解释；识别不到的页面，用户仍可以选区剪藏。</div></div>
      </div></div>`,
    notes: ['紫色实线框是会出现入口的区块，灰色虚线斜纹是不出现的。识别在指针停留之后才运行，只检查指针下的祖先链，不整页扫描（annotation 架构 §7）。', '“文字太少”的阈值不在文档里写死数字：初值待阶段 V 在真实页面上校准。'],
  })

  const savedEntry = ENTRIES0.find(e => e.id === 'e2')
  const after = board({
    title: '点击之后 · 保存了什么',
    ref: 'capture §3.1 · §6.2',
    proposal: 'D-20',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:480px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">页面：描边闪一下，出现提示</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { saved: true, pill: { saved: true, press: true, pin: 1 } } })}<div class="toast-pos" style="bottom:14px">${clipToast({ p: 70 })}</div></div></div>
      <div class="vs g8"><b class="t-sm">资料库：同一条剪藏</b>
        <div style="border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:16px 18px;box-shadow:var(--sh-1)">
          <div class="hs g8" style="margin-bottom:10px">${tchip('clip')}<span class="t-xs muted">engineering.example.com/posts/retries</span></div>
          <div class="md md-sm">${mdRender(savedEntry.content, [])}</div>
        </div>
        <div class="help">${pin(2, 'pin-s')}Markdown：标题层级、列表和链接都在；图片只保留占位，不联网加载（D-21）。选区剪藏与区块剪藏保存出来是同一种条目。</div></div>
    </div>`,
    notes: ['点击“剪藏”：描边变绿闪一下，随后出现与选区剪藏<b>完全一致</b>的“已剪藏 · 撤销 · 编辑”提示；撤销、编辑、失败重试的规则都相同。', '内容超过 50,000 个字符时在块边界截断，并在提示里说明“只保存了前 50,000 个字符”（capture §3.1）。'],
  })

  const keyboard = board({
    title: '键盘路径与开关',
    ref: 'extension §7 · capture §6.2',
    proposal: 'D-20',
    w: 1020,
    body: `<div class="ui" style="padding:20px 22px 24px;background:var(--surface-2);display:grid;grid-template-columns:480px minmax(0,1fr);gap:22px;align-items:start">
      <div class="vs g8"><b class="t-sm">快捷键进入区块模式（与元素截图一致）</b><div class="mv" style="height:360px;border-radius:12px;position:relative">${retriesPage({ hover: 's2', blk: { pin: 2 }, outer: { faint: true, label: 'article' } })}
        <div class="capsule" style="left:50%;top:12px;transform:translateX(-50%)">${pin(1)}<i class="dotp"></i>区块剪藏模式<span style="opacity:.65">${keys('↑')}${keys('↓')} 选层级</span>${keys('Enter')}剪藏${keys('Esc')}退出</div></div>
        <div class="help">悬停入口之外的等价路径：键盘与读屏用户同样能剪藏整块。快捷键本身待定（浏览器的快捷键设置页里可改）。</div></div>
      <div class="vs g12"><b class="t-sm">开关与按网站停用</b>
        <div style="position:relative;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden">${pin(3, 'pin-in-r')}
          ${settingsRow('区块剪藏入口', '指针停在整体内容上时，区块旁出现“剪藏”。', sw(true))}
          ${settingsRow('已停用的网站', '在悬停入口的菜单里选“在此网站停用”。', `<span class="chip">2 个</span>${btn('管理', { sm: true })}`)}
        </div>
        <div class="vs g6"><span class="t-xs muted">悬停入口里的“更多”菜单</span>
          <div class="menu" style="width:230px">${menuItem('ban', '在 engineering.example.com 停用', { on: true })}${menuItem('eye-off', '关闭区块剪藏入口')}${menuItem('settings', '设置…')}</div></div>
      </div></div>`,
    notes: ['区块模式：悬停描边、<kbd>↑</kbd> / <kbd>↓</kbd> 在层级之间移动、<kbd>Enter</kbd> 剪藏、<kbd>Esc</kbd> 退出；模式胶囊用文字说明当前状态。', '默认开，才能被发现；整体关闭与按网站停用把干扰交给用户（D-20 推荐）。设置里的开关与悬停入口里的“更多”菜单是同一个状态。'],
  })

  return group(
    { id: 'ext-block', title: '区块剪藏：指一下就留下整块', small: 'capture §6.2 · D-20', desc: '推文、帖子、一篇文章这样的整体内容，不必先拖选：指针停在上面，区块旁出现“剪藏”。入口怎样出现、识别哪些区块、默认开不开尚未确认（D-20），下面各块是对它的提案。' },
    row(hoverFeed, hoverSection),
    row(scope),
    row(after),
    row(keyboard),
  )
}
