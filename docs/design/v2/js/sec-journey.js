// 一个人的一周：把 examples.md §2 的主线走查画成时间线，并把验收场景 A–C 对应到画板。
function secJourney() {
  const cell = (cls, t, body, link, tag) => `<div class="jc ${cls}"><div class="t"><span>${t}</span>${tag ? `<span>${tag}</span>` : ''}</div>${body}${link ? `<div style="margin-top:4px"><a href="#${link[0]}">→ ${link[1]}</a></div>` : ''}</div>`
  const none = text => `<div class="jc empty">${text}</div>`

  const phases = [
    ['周一 · 采集', '读文章时'],
    ['周二 · 阅读与整理', '晚上，在资料库里'],
    ['周四 · 找回', '写设计文档时'],
    ['周五 · 带走', '评审当天'],
  ]

  const inPage = [
    [
      cell('ext', '周一 10:12', '选中“重试风暴”，点<b>剪藏</b>：一次点击，约 3 秒的“已剪藏 · 撤销 · 编辑”。', ['ext-clip', '选区剪藏'], 'M-03'),
      cell('ext', '10:14', '点“编辑”：标签写 <code>retry</code>，备注写“对照复盘里的流量曲线”。', ['ext-clip', '快速编辑']),
      cell('ext', '10:20', '指针停在“指数退避加抖动”那一节上，点旁边胶囊里的<b>剪藏</b>：整节存成 Markdown，不用选中，页面上没有任何记号。', ['ext-block', '区块剪藏']),
      cell('ext', '10:40', '<kbd>⌘</kbd><kbd>⇧</kbd><kbd>S</kbd> 框选延迟曲线图，核对匿名后确认，入库为截图条目。', ['ext-shot', '截图']),
    ],
    [none('页面内没有操作：阅读与整理放在保存之后，在资料库里做。')],
    [cell('ext', '周四 16:05', '读文章二，剪藏一段“幂等键”的说明：条目<b>自动带上</b> <code>project: 支付重试</code>（周二设的类型预设）。', ['ext-props', '类型预设'])],
    [none('评审当天不需要回到网页。')],
  ]

  const library = [
    [none('周一没有打开资料库：保存不被整理打断。')],
    [
      cell('ext', '周二 19:20', '打开“指数退避加抖动”那条，点<b>阅读</b>；选中三步做法里的“随机因子”，点黄色，写备注“解释为什么要抖动”。', ['ext-read', '阅读与高亮'], 'M-21'),
      cell('ext', '19:30', '把三条都加上标签 <code>retry</code>；给“重试风暴”添加自定义属性 <b>project</b>（文本）和 <b>reviewed</b>（复选框）：注册表里没有，先选类型再创建。', ['ext-detail', '添加属性']),
      cell('ext', '19:40', '属性页：project 使用数 1；给它勾选“剪藏”预设，默认值填“支付重试”。', ['ext-props', '属性页']),
    ],
    [
      cell('ext', '周四 19:20', '搜索“幂等键”，再按属性 <code>project = 支付重试</code> 筛选；条件写入地址栏。', ['ext-app', '按属性筛选'], 'M-19'),
      cell('ext', '19:23', '想看自己划过的重点：打开“高亮”视图，同样按 project 筛选，点一条回到阅读视图里的原位置。', ['ext-app', '高亮视图']),
      cell('ext', '19:26', '点“回到来源”，核对原文；条目里的备注、属性和高亮仍是当时写下的。', ['ext-detail', '条目详情']),
    ],
    [cell('ext', '评审当天', '点<b>导出内容</b>：每条一份 Markdown，属性就是 frontmatter，高亮写成 <code>==…==</code>，图片只存一份；把 ZIP 拖进 Obsidian 的库。', ['ext-states', '导出对话框'], 'M-19')],
  ]

  const col = (lane, i) => `<div class="jny-cell">${lane[i].join('')}</div>`
  const grid = `<div class="jny ui"><div class="jny-grid">
    <div></div>${phases.map(([t, s]) => `<div class="jny-h">${t}<small>${s}</small></div>`).join('')}
    <div class="jny-lane">${I('bookmark', 'i-sm')} 页面内</div>${[0, 1, 2, 3].map(i => col(inPage, i)).join('')}
    <div class="jny-lane">${I('library', 'i-sm')} 资料库</div>${[0, 1, 2, 3].map(i => col(library, i)).join('')}
  </div>
  <div class="banner brand" style="margin-top:18px">${I('info')}<div><b>这条走查要证明的事</b>：L 周一用很少的时间留下三种内容（选中的一段、整整一节、一张图），没有被任何表单打断，网页上也没有留下任何东西；周二在库里把整节读了一遍并划出重点，再用标签和一个自定义属性分类；周四写文档时用搜索加属性筛选找回，并回到来源核对；周五把带属性和高亮的 Markdown 带进 Obsidian。<b>没有任何一步依赖网络。</b></div></div></div>`

  const scenarios = `<div class="sp-card ui" style="margin-top:22px"><h5>验收场景 A–C 对应的画板</h5><p>examples.md §3 的三个场景，各自要靠哪些界面状态来通过。</p>
    <table class="sp-table"><thead><tr><th style="width:150px">场景</th><th>要看到的界面状态</th><th style="width:420px">画板</th></tr></thead><tbody>
      <tr><td>A 断网采集</td><td>选区剪藏、区块剪藏、截图都保存成功；高亮后刷新仍在；搜索命中；ZIP 里剪藏的高亮写成 <code>==…==</code>，截图的图片链接有效，缺失项有报告</td><td><a href="#ext-clip">选区剪藏</a> · <a href="#ext-block">区块剪藏</a> · <a href="#ext-read">阅读与高亮</a> · <a href="#ext-states">导出内容 · 四种状态</a></td></tr>
      <tr><td>B 属性</td><td>注册表出现类型为文本的 project；其他条目上同名属性只能是文本；按它筛选命中；导出含 project；使用数为 1 时不可删，清空后可删</td><td><a href="#ext-detail">添加属性</a> · <a href="#ext-props">属性页</a> · <a href="#ext-app">按属性筛选</a></td></tr>
      <tr><td>C 同一套壳</td><td>全部、剪藏、高亮、截图、属性、设置、阅读视图与弹窗都是左导航 + 右内容；窗口最窄时折叠为图标栏，没有顶部导航</td><td><a href="#ext-app">资料库</a> · <a href="#ext-read">阅读视图</a> · <a href="#ext-states">窄窗口</a> · <a href="#ext-popup">工具栏弹窗</a></td></tr>
    </tbody></table></div>`

  return section(
    {
      id: 'journey',
      nav: '一周走查',
      eyebrow: 'End to End',
      title: '一个人的一周',
      lead: '把 examples.md §2 的主线走查（为支付系统设计失败重试策略）画成时间线，每张卡片都能跳到对应的画板。它同时是演示脚本和端到端验收的路线图。',
    },
    `<div class="cv-group" id="jny-lane" style="margin-top:8px">${grid}${scenarios}</div>`,
  )
}
