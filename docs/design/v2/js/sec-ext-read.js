// 浏览器扩展 · 阅读与高亮：在资料库里读剪藏、划重点。依据 extension §4.2，entry §4。
// 高亮是剪藏里的标注，只存在于 AnnHub：网页上没有标记，也没有回访恢复（D-19）。

function extReadGroup() {
  const e2 = ENTRIES0.find(e => e.id === 'e2')
  const green = e2.hls[0]
  const yellow = e2.hls[1]
  const tabUrl = id => ({ title: `${ENTRIES0.find(e => e.id === id).title} · AnnHub`, url: `chrome-extension://annhub/app.html#/read/${id}` })

  const select = board({
    title: '阅读视图 · 选中文字，点一个颜色',
    ref: 'extension §4.2 · entry §4',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'clip',
        main: reader(e2, {
          sel: mdSel(e2.content, '把等待时间翻倍，直到上限'),
          pins: { rail: 3 },
          overlay: hbar({ anchor: '.the-sel', hover: 0, kbd: true, pin: 1 }),
          pinsMd: { [yellow.id]: 2 },
        }),
      }),
      { active: 'clip', h: 820, ...tabUrl('e2') },
    ),
    notes: [
      '在正文里<b>选中文字</b>（鼠标或键盘），选区旁出现小工具条：五个颜色点和“备注”。<b>点颜色立即创建</b>；点“备注”以默认颜色创建并打开备注输入；键盘上选中后按 <kbd>H</kbd> 以默认颜色创建。',
      '已有的高亮带<b>底色和下划线</b>，有备注的末尾多一个小点；颜色只是用户的选择，不承担含义，每个色点都有文字名称供读屏朗读。',
      '右栏“高亮”按<b>在正文里的位置</b>列出这条剪藏的全部高亮，带颜色条、引文和备注；点一条滚动到它。另一个标签“属性”就是抽屉里同一个属性面板。',
    ],
  })

  const pop = board({
    title: '阅读视图 · 点已有高亮：改色、写备注、删除',
    ref: 'extension §4.2',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'clip',
        main: reader(e2, { on: yellow.id, overlay: hlPop(yellow, { anchor: '.hlm.is-on', pin: 1 }), tab: 'hl' }),
      }),
      { active: 'clip', h: 820, ...tabUrl('e2') },
    ),
    notes: [
      '点一下已有的高亮，旁边出现浮层：<b>改颜色</b>（五色）、<b>写备注</b>（失焦即保存，Esc 关闭）、<b>删除</b>。',
      '删除后出现约 3 秒的“已删除 · 撤销”；高亮不需要确认对话框，因为它随时可以撤销、也随时可以重新划。',
      '写入失败时保留所选范围与已输入的备注，显示错误与重试（extension §4.2）。',
    ],
  })

  const e8 = ENTRIES0.find(e => e.id === 'e8')
  const inDrawer = board({
    title: '详情抽屉里的原文也能高亮',
    ref: 'extension §4.1 · entry §4',
    tag: 'R2',
    w: 1280,
    body: appInTab(
      shell({
        active: 'clip',
        main: `${pageHead({ title: '剪藏', sub: '71 条', right: searchBox({}) })}
          <div class="pbody cap">${fbar({ noType: true, count: '共 71 条' })}${entryList(['e1', 'e2', 'e4', 'e5', 'e6'], { sel: 'e2' })}</div>`,
        drawer: drawer(e2, { pin: 1 }),
      }),
      { active: 'clip', h: 1010 },
    ),
    notes: [
      '抽屉里的“原文”用的是<b>同一个正文组件</b>：选中文字同样出现颜色点，已有高亮同样可以点开；“阅读”按钮只是换成更舒服的版式。',
      '<b>有高亮时原文只读</b>，并在“原文”标题旁写明原因：高亮的范围依赖它；删除全部高亮后恢复可编辑（entry §4 第 7 条）。',
      '列表行上，有高亮的剪藏多一枚“N 高亮”的小标签；搜索也会命中高亮的引文与备注（search §1）。',
    ],
  })

  const confirm = board({
    title: '删除有高亮的剪藏 · 确认',
    ref: 'extension §4.1',
    tag: 'R2',
    w: 1020,
    body: `<div class="ui" style="padding:26px 28px 28px;background:var(--surface-2);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;align-items:start">
      <div class="vs g10"><b class="t-sm">${I('trash', 'i-sm')} 删除前确认，写明会一并删除的高亮</b>
        <div class="dlg" style="width:auto;position:relative">${pin(1, 'pin-in-r')}<h3>删除这条剪藏？</h3><div class="help" style="margin:6px 0 14px">“Retries and backpressure”有 <b>2 条高亮</b>，会和它一起删除。这个操作不能撤销。</div><div class="hs g8 end">${btn('取消', { v: 'ghost' })}${btn('删除剪藏与高亮', { v: 'danger', icon: 'trash' })}</div></div></div>
      <div class="vs g10"><b class="t-sm">${I('lock', 'i-sm')} 想改有高亮的原文</b>
        <div class="banner info" style="position:relative">${pin(2, 'pin-in-r')}${I('lock')}<div><b>原文暂时只读</b>：这条剪藏有 2 条高亮，范围依赖原文。先删除高亮，或复制成一条新的剪藏再改。</div></div>
        <div class="help">没有高亮的剪藏，原文与语境可以直接改；改动在失焦时写入。</div></div>
    </div>`,
    notes: ['单独删除一条高亮不需要确认（可撤销）；删除整条剪藏才需要，并写明高亮数，因为高亮和它是同一条记录。', '“原文只读”是初始规则（entry §4 第 7 条），阶段 V 看是否有人被它卡住再校准。'],
  })

  // 合并与上限：小例子
  const demo = '指数退避：每次失败后翻倍，再乘一个随机因子。'
  const aQ = '每次失败后翻倍'
  const bQ = '再乘一个随机因子'
  const before = [
    { id: 'm1', s: demo.indexOf(aQ), e: demo.indexOf(aQ) + aQ.length, c: 'green', note: 'A' },
    { id: 'm2', s: demo.indexOf(bQ), e: demo.indexOf(bQ) + bQ.length, c: 'yellow', note: 'B' },
  ]
  const afterH = [{ id: 'm1', s: before[0].s, e: before[1].e, c: 'green', note: 'A' }]
  const selR = { s: demo.indexOf('翻倍'), e: demo.indexOf('再乘') + 2 }
  const limits = board({
    title: '合并、上限与图片占位',
    ref: 'entry §4 · capture §3.1',
    tag: 'R2',
    w: 1100,
    body: `<div class="ui" style="padding:24px 26px 26px;background:var(--surface-2);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px">
      <div class="sp-card"><h5>重叠的新选区合并为一条</h5><p>范围取并集，颜色沿用最早的那条，两条备注依次用空行连接（entry §4 第 6 条）。</p>
        <div class="vs g10">
          <div class="vs g4"><span class="t-xs muted">已有两条高亮</span><div class="md md-sm">${mdRender(demo, before)}</div></div>
          <div class="vs g4"><span class="t-xs muted">新选区（跨过两条）</span><div class="md md-sm">${mdRender(demo, before, { sel: selR })}</div></div>
          <div class="vs g4"><span class="t-xs muted">合并为一条，备注“A”与“B”并在一起</span><div class="md md-sm">${mdRender(demo, afterH)}</div></div>
        </div></div>
      <div class="sp-card"><h5>初始上限</h5><p>阶段 V 校准（D-19）；超限时就地说明原因，不丢已选内容。</p>
        <table class="sp-table" style="font-size:12.5px"><tbody>
          <tr><td>每条剪藏的高亮数</td><td class="tnum b">200</td></tr>
          <tr><td>一次选中的文字</td><td class="tnum b">2,000 字符</td></tr>
          <tr><td>高亮备注</td><td class="tnum b">1,000 字符</td></tr>
          <tr><td>剪藏正文</td><td class="tnum b">50,000 字符</td></tr></tbody></table>
        <div class="help is-error hs g6" style="margin-top:12px">${I('circle-alert', 'i-sm')}<span>一次最多高亮 2,000 个字符。缩短选区再试。</span></div></div>
      <div class="sp-card">${chip('提案 · D-21', { v: 'warn' })}<h5 style="margin-top:8px">剪藏里的图片：只留占位</h5><p>采集时保留图片的替代文字与原地址，阅读视图显示占位，不联网加载；要留住画面用截图。</p>
        <div class="md md-sm">${mdRender('下图是重试开始后的延迟曲线：\n\n![p99 延迟曲线](https://example.com/p99.png)\n\n拐点出现在第 3 分钟。', [])}</div></div>
      <div class="sp-card"><h5>渲染时的安全</h5><p>阅读视图与导出都不信任采集下来的内容。</p>
        <table class="sp-table" style="font-size:12.5px"><tbody>
          <tr><td>原始 HTML</td><td>采集时丢弃，渲染时也不解析</td></tr>
          <tr><td>链接</td><td>只允许 http(s)；新标签页打开，带 <code>rel="noopener noreferrer"</code></td></tr>
          <tr><td>脚本与样式</td><td>永不执行、永不应用</td></tr></tbody></table></div>
    </div>`,
    notes: ['左上是高亮的合并规则；右上是几个初始上限；左下是图片占位（D-21 的推荐做法 A）；右下是渲染的安全约定（capture §3.1）。'],
  })

  return group(
    { id: 'ext-read', title: '阅读与高亮：在资料库里读剪藏', small: 'extension §4.2 · entry §4', desc: '页面里不做高亮。保存之后，在资料库里打开剪藏，读一遍，选中重点划出来、写下想法——高亮是这条剪藏里的标注，只存在于 AnnHub。' },
    row(select),
    row(pop),
    row(inDrawer),
    row(confirm),
    row(limits),
  )
}
