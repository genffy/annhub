// 跨端旅程：把 examples.md §3 的三周走查画成泳道，并把验收场景 A–E 对应到画板。
function secJourney() {
  const cell = (cls, t, body, link, tag) => `<div class="jc ${cls}"><div class="t"><span>${t}</span>${tag ? `<span>${tag}</span>` : ''}</div>${body}${link ? `<div style="margin-top:4px"><a href="#${link[0]}">→ ${link[1]}</a></div>` : ''}</div>`
  const empty = text => `<div class="jc empty">${text}</div>`

  const phases = [
    ['第 1 周 · 采集', '还没有 Desktop'],
    ['第 1 周 · 连接与回忆', '周五晚上'],
    ['第 2 周 · 复习与修正', '发现一处理解有误'],
    ['第 3 周 · 评审之后', '修正与带走'],
  ]

  const ext = [
    [
      cell('ext', '周一 10:12', '选中“重试风暴”，点<b>碎片</b>：类型自动推断为概念，核验一次单击，应用写“检查支付网关故障复盘中，客户端重试是否放大了流量”，⌘↵。', ['ext-modal', '采集窗口'], 'M-03 约 48 秒'),
      cell('ext', '10:20', '同一页再存“指数退避加抖动”，<b>切到深度模式</b>：先写记得的步骤，再核验、应用。', ['ext-kinds', '按 kind 的表单'], '约 95 秒'),
      cell('ext', '10:31 · 10:40', '宣传文字一键<b>剪藏</b>；延迟曲线图 ⌘⇧S <b>截图</b>，核对匿名后入库（不是 Fragment）。', ['ext-shot', '截图'], '安全出口'),
      cell('ext', '周二', '截图集里把这张图<b>转为视觉碎片</b>；扩展显示待发送：3 条碎片、1 张图片。', ['ext-shots-page', '截图集'], ''),
    ],
    [
      cell('ext', '19:30', '在设置里粘贴 Desktop 的配对码，状态变为“已连接”，5 条碎片与 1 张图片逐条写入。', ['ext-settings', '设置与连接'], 'M-06'),
      empty('复习发生在 Desktop，扩展只显示状态。'),
    ],
    [
      cell('ext', '周二 19:36', '揭示面点“回到来源”核对原文；之后在扩展碎片库修正“幂等”的理解与应用（Desktop 里采集字段只读）。修订号递增，重新交付，Desktop 已有的评分不被覆盖。', ['ext-detail', '详情与编辑'], ''),
      cell('ext', '周三 11:05', '读到“重试预算”，保存为 question：假设“按服务端计更稳妥”，下一步“评审时请 SRE 给出两个方案的故障案例”。', ['ext-kinds', '按 kind 的表单'], ''),
    ],
    [
      cell('ext', '评审当天', '碎片库里把那条 question 改为 answered，写下答案；采集字段在扩展修改，修订号递增后重新交付。', ['ext-detail', '详情与编辑'], ''),
      cell('ext', '当晚', '关掉 Desktop，点<b>导出内容</b>，把资料带进 Obsidian：ZIP 含 Markdown 与图片，README 写清范围，不承诺恢复学习状态。', ['ext-lib', '导出'], ''),
    ],
  ]
  const desk = [
    [empty('尚未安装 Desktop：能搜索、能导出，但没有复习。这是价值时间线里的空白（H-08）。')],
    [
      cell('desk', '19:30', 'Desktop 首次启动，<b>系统页</b>复制配对码，回扩展输入。', ['desk-system', '系统'], ''),
      cell('desk', '19:32', '<b>今日</b>：到期复习 5 条 · 预计 4 分钟，点“开始复习”。', ['desk-today', '今日'], 'M-12'),
      cell('desk', '19:33–19:34', '<b>复习</b>：先自己作答，看一级提示，揭示，评分 good；下一条评 hard。', ['desk-review', '复习会话'], 'M-07'),
      cell('desk', '19:38', '中途退出接电话，今日显示“继续复习 2/5”。', ['desk-today', '今日 · 有会话'], ''),
    ],
    [
      cell('desk', '周二 19:30', '<b>复习“幂等”</b>：先自己作答再揭示，发现把幂等键和限流混为一谈，评分 again；1 天后再次到期。', ['desk-review', '复习会话'], 'M-07'),
      cell('desk', '周四 19:20', '<b>今日 → 复习</b>：“幂等”先看一级提示再作答，评分 good；“重试风暴”评分 good。本周 M-18 = 2。', ['desk-today', '今日'], 'M-18'),
    ],
    [empty('Desktop 已关闭；本地数据完好。')],
  ]

  const col = (list, i) => `<div class="jny-cell">${list[i].join('')}</div>`
  const grid = `<div class="jny ui"><div class="jny-grid">
    <div></div>${phases.map(([t, s]) => `<div class="jny-h">${t}<small>${s}</small></div>`).join('')}
    <div class="jny-lane">${I('puzzle', 'i-sm')} 扩展</div>${[0, 1, 2, 3].map(i => col(ext, i)).join('')}
    <div class="jny-lane">${I('monitor', 'i-sm')} Desktop</div>${[0, 1, 2, 3].map(i => col(desk, i)).join('')}
  </div>
  <div class="banner brand" style="margin-top:18px">${I('target')}<div><b>这条走查要证明的事</b>：第一周花很少时间采集了五条碎片；周五晚上完成第一次回忆；第二周在复习中发现并修正了一个概念的理解，并留住了一个未解决的问题；评审后补上了答案。<b>没有任何一步依赖 LLM。</b></div></div></div>`

  const scenarios = `<div class="sp-card ui" style="margin-top:22px"><h5>验收场景 A–C 对应的画板</h5><p>examples.md §5 的三个场景，各自要靠哪些界面状态来通过。</p>
    <table class="sp-table"><thead><tr><th style="width:150px">场景</th><th>要看到的界面状态</th><th style="width:300px">画板</th></tr></thead><tbody>
      <tr><td>A 断网采集</td><td>保存成功并可搜索；顶栏显示待发送（记录 + 图片）而不是错误；导出 ZIP 链接有效，缺失项有报告</td><td><a href="#ext-states">保存成功 / 失败</a> · <a href="#ext-lib">连接状态四态、导出</a></td></tr>
      <tr><td>B 扩展到 Desktop</td><td>配对 → 逐条交付 → 重复不重复；系统页显示已接收数量与缺失图片</td><td><a href="#ext-settings">首次连接</a> · <a href="#desk-system">系统</a></td></tr>
      <tr><td>C 通用复习</td><td>四种 kind 题面与提示梯度各不相同；中途退出后从未评分的一条继续</td><td><a href="#desk-review">复习会话</a> · <a href="#desk-today">今日 · 有会话</a></td></tr>
    </tbody></table></div>`

  return section(
    {
      id: 'journey',
      nav: '跨端旅程',
      eyebrow: 'Part 3 · End to End',
      title: '一个人的三周',
      lead: '把 examples.md §3 的主线走查（为支付系统设计失败重试策略）画成泳道：上一条是扩展，下一条是 Desktop，每张卡片都能跳到对应的画板。它同时是演示脚本和端到端验收的路线图。',
    },
    `<div class="cv-group" id="jny-lane" style="margin-top:8px">${grid}${scenarios}</div>`,
  )
}
