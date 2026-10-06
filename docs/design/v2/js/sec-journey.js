// 一个人的三周：把 examples.md §3 的主线走查画成时间线，并把验收场景 A–C 对应到画板。
function secJourney() {
  const cell = (cls, t, body, link, tag) => `<div class="jc ${cls}"><div class="t"><span>${t}</span>${tag ? `<span>${tag}</span>` : ''}</div>${body}${link ? `<div style="margin-top:4px"><a href="#${link[0]}">→ ${link[1]}</a></div>` : ''}</div>`

  const phases = [
    ['第 1 周 · 采集', '周一到周五'],
    ['第 2 周 · 找回与修正', '写设计文档时'],
    ['第 3 周 · 评审之后', '补答案与带走'],
  ]

  const ext = [
    [
      cell('ext', '周一 10:12', '选中“重试风暴”，点<b>碎片</b>：类型自动推断为概念，核验一次单击，应用写“检查支付网关故障复盘中，客户端重试是否放大了流量”，⌘↵。', ['ext-modal', '采集窗口'], 'M-03 约 48 秒'),
      cell('ext', '10:20', '同一页再存“指数退避加抖动”，<b>切到深度模式</b>：先写记得的步骤，再核验、应用。', ['ext-kinds', '按 kind 的表单'], '约 95 秒'),
      cell('ext', '10:31 · 10:40', '宣传文字一键<b>剪藏</b>；延迟曲线图 ⌘⇧S <b>截图</b>，核对匿名后入库（不是 Fragment）。', ['ext-shot', '截图'], '安全出口'),
      cell('ext', '周二', '截图集里把这张图<b>转为视觉碎片</b>；图片只存一份。', ['ext-shots-page', '截图集'], ''),
    ],
    [
      cell('ext', '周二 19:30', '写设计文档时搜索“幂等”，找到周四保存的概念，点“回到来源”核对原文。', ['ext-lib', '碎片库'], ''),
      cell('ext', '周二 19:36', '发现之前的理解把幂等键和限流混为一谈，在详情里改写理解与应用，修订号递增。', ['ext-detail', '详情与编辑'], ''),
      cell('ext', '周三 11:05', '读到“重试预算”，保存为 question：假设“按服务端计更稳妥”，下一步“评审时请 SRE 给出两个方案的故障案例”。', ['ext-kinds', '按 kind 的表单'], ''),
      cell('ext', '周四 19:20', '按类型筛选“方法”，找到“指数退避加抖动”的三步做法，对照着写进文档。', ['ext-lib', '碎片库'], ''),
    ],
    [
      cell('ext', '评审当天', '碎片库里把那条 question 改为 answered，写下评审得出的答案，修订号递增。', ['ext-detail', '详情与编辑'], ''),
      cell('ext', '当晚', '点<b>导出内容</b>，把资料带进 Obsidian：ZIP 含 Markdown 与图片，README 写清范围，不承诺恢复 AnnHub 数据库。', ['ext-lib', '导出'], ''),
    ],
  ]

  const col = i => `<div class="jny-cell">${ext[i].join('')}</div>`
  const grid = `<div class="jny ui"><div class="jny-grid">
    <div></div>${phases.map(([t, s]) => `<div class="jny-h">${t}<small>${s}</small></div>`).join('')}
    <div class="jny-lane">${I('puzzle', 'i-sm')} 扩展</div>${[0, 1, 2].map(col).join('')}
  </div>
  <div class="banner brand" style="margin-top:18px">${I('target')}<div><b>这条走查要证明的事</b>：第一周花很少时间采集了五条碎片和一张图；第二周写文档时用搜索找回它们，修正了一个概念的理解，并留住了一个未解决的问题；评审后补上了答案并导出。<b>没有任何一步依赖 LLM。</b></div></div></div>`

  const scenarios = `<div class="sp-card ui" style="margin-top:22px"><h5>验收场景 A–C 对应的画板</h5><p>examples.md §5 的三个场景，各自要靠哪些界面状态来通过。</p>
    <table class="sp-table"><thead><tr><th style="width:150px">场景</th><th>要看到的界面状态</th><th style="width:300px">画板</th></tr></thead><tbody>
      <tr><td>A 断网采集</td><td>保存成功并可搜索；导出 ZIP 链接有效，缺失项有报告</td><td><a href="#ext-states">保存成功 / 失败</a> · <a href="#ext-lib">更多菜单 · 导出内容</a></td></tr>
      <tr><td>B 找回与修正</td><td>搜索命中；回到来源；修改“应用”后保存，修订号递增</td><td><a href="#ext-lib">碎片库</a> · <a href="#ext-detail">详情与编辑</a></td></tr>
      <tr><td>C 各类型的采集</td><td>四种 kind 的采集提问与必填项各不相同；缺必填项不能保存，已输入的内容不丢失</td><td><a href="#ext-kinds">按 kind 的表单</a> · <a href="#ext-states">状态与恢复</a></td></tr>
    </tbody></table></div>`

  return section(
    {
      id: 'journey',
      nav: '三周走查',
      eyebrow: 'End to End',
      title: '一个人的三周',
      lead: '把 examples.md §3 的主线走查（为支付系统设计失败重试策略）画成时间线，每张卡片都能跳到对应的画板。它同时是演示脚本和端到端验收的路线图。',
    },
    `<div class="cv-group" id="jny-lane" style="margin-top:8px">${grid}${scenarios}</div>`,
  )
}
