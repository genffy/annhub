// 总览：产品闭环与界面的对应、界面清单、设计原则。
function secOverview() {
  const step = (no, title, act, surface, metric) => `<div class="lp-step">
    <div class="no">${no}</div><h6>${title}</h6>
    <dl><div><dt>用户动作</dt><dd>${act}</dd></div><div><dt>主要界面</dt><dd>${surface}</dd></div><div><dt>关键指标</dt><dd>${metric}</dd></div></dl>
  </div>`

  const loop = `<div class="lp ui">
    <div class="lp-grid">
      <div></div>
      ${step('1', '采集', '选中内容或框选画面，点一下', '页面内：选区菜单、剪藏提示、高亮标记、截图遮罩', 'M-03')}
      ${step('2', '整理', '给条目加标题、标签与属性', '资料库：详情抽屉、属性页', 'M-20')}
      ${step('3', '找回与带走', '搜索、筛选、回到来源、导出', '资料库：全部 / 剪藏 / 高亮 / 截图', 'M-19')}

      <div class="lp-lane-label">浏览器扩展</div>
      <div class="lp-bar ext">${I('bookmark')}页面内 <small>选区菜单 · 剪藏 · 高亮 · 截图</small></div>
      <div class="lp-bar ext" style="grid-column: 3 / span 2">${I('library')}扩展页：左导航 + 右内容 <small>资料库 · 属性 · 设置 · 工具栏弹窗</small></div>
    </div>
    <div class="lp-note">
      <span>${I('wifi-off')}断网：仍可采集、检索、整理、导出 Markdown ZIP</span>
      <span>${I('layers')}三种采集是同一种条目：同样的来源、同样的属性</span>
      <span>${I('lock')}数据只在浏览器本地</span>
    </div>
  </div>`

  const rel = r => `<span class="cv-tag">${r}</span>`
  const rowOf = (name, duty, doc, ver, link) => `<tr><td>${name}</td><td>${duty}</td><td>${doc}</td><td>${ver}</td><td><a href="#${link}">查看 →</a></td></tr>`

  const inventory = `<div class="sp-card ui" style="margin-top:22px">
    <h5>界面清单</h5>
    <p>每一行对应一组画板；“版本”取自 roadmap.md 的交付范围。R3 排在阶段 V 之后，画出来只表达目标体验，不代表进入开发。</p>
    <table class="sp-table">
      <thead><tr><th style="width:170px">界面</th><th>职责</th><th style="width:230px">依据</th><th style="width:100px">版本</th><th style="width:70px"></th></tr></thead>
      <tbody>
        ${rowOf('选区菜单', '选中文本后选择剪藏、高亮或截图；悬停给出一句后果；中英文界面', 'extension §2.1 · capture §2', rel('R1'), 'ext-flow')}
        ${rowOf('剪藏', '一次点击保存；约 3 秒内撤销；编辑标题、标签、备注', 'extension §3 · capture §6', rel('R1'), 'ext-clip')}
        ${rowOf('高亮', '页面留痕、备注、换颜色、连续高亮，回访时恢复', 'extension §3 · capture §6', rel('R1'), 'ext-hl')}
        ${rowOf('截图', '区域 / 元素截图，原位标注、匿名与马赛克；保存为截图条目', 'screenshot §1–§5', rel('R1'), 'ext-shot')}
        ${rowOf('精确选区', '拖拽吸附、八向手柄、方向键微调、比例锁定、确认选区', 'screenshot §1.2 · roadmap R3', rel('R3'), 'ext-shot-r3')}
        ${rowOf('资料库', '全部 / 剪藏 / 高亮 / 截图四个视图；搜索与筛选（含按属性）', 'extension §2.2 · §2.3 · search', rel('R2'), 'ext-app')}
        ${rowOf('条目详情与属性', '抽屉里编辑标题、备注与属性；添加、新建、校验', 'extension §4 · entry §5', rel('R2'), 'ext-detail')}
        ${rowOf('属性页', '注册表、使用数、类型预设、删除未使用', 'extension §2.4 · entry §5.3', rel('R2'), 'ext-props')}
        ${rowOf('设置', '默认高亮颜色、截图默认匿名、快捷键、数据、本地指标', 'extension §2.5', rel('R2'), 'ext-settings')}
        ${rowOf('空状态与导出', '首次使用、无结果、窄窗口、导出对话框', 'extension §5 · storage §6', `${rel('R1')} ${rel('R2')}`, 'ext-states')}
        ${rowOf('工具栏弹窗', '同一套壳的紧凑版：图标栏 + 最近 5 条', 'extension §2.6', rel('R2'), 'ext-popup')}
      </tbody>
    </table>
  </div>`

  const pr = (icon, title, rule, where) => `<div class="pr"><div class="n">${I(icon)}</div><div><h6>${title}</h6><p>${rule}</p><small>${where}</small></div></div>`
  const principles = `<div class="cv-cols">
    <div class="sp-card ui">
      <h5>产品原则 → 界面规则</h5>
      <p>product.md §6 的五条原则，各自落成一条可以在画板里检查的界面规则。</p>
      <div class="sp-grid">
        ${pr('bookmark', '保存先于整理', '剪藏与高亮一次点击完成，不开窗口、没有表单；标签和属性放到保存之后，在资料库详情里整理。', '选区菜单 · 剪藏提示')}
        ${pr('link', '原文永远可追溯', '每一行、每个详情都带来源主机与“回到来源”；定位失败时仍显示足以读懂的原文与语境。', '资料库 · 详情抽屉')}
        ${pr('shield-check', '失败不丢输入', '保存失败不显示成功，截图预览与标注、编辑中的备注与属性都保留，可以重试或改为下载 / 导出。', '剪藏失败 · 截图失败')}
        ${pr('tags', '属性小而原子', '属性有类型、同名同类型；长文字放备注；校验原因写在原地，按钮置灰而不是点了才报错。', '详情 · 属性页')}
        ${pr('panel-left-open', '默认界面克制', '所有页面都是左导航 + 右内容，导航只有六项；技术细节不出现在主流程里。', '应用壳')}
      </div>
    </div>
    <div class="sp-card ui">
      <h5>贯穿全局的界面约定</h5>
      <p>来自 PRD 的可访问性、键盘与反馈要求，所有画板默认遵守。</p>
      <div class="sp-grid">
        ${pr('eye', '颜色不是唯一表达', '类型 = 图标 + 文字 + 色；当前视图 = 底色 + 加粗 + 竖条；属性类型 = 图标 + 文字；状态 = 图标 + 文字。', 'extension §7.2')}
        ${pr('keyboard', '全流程可键盘完成', '选区菜单可用 Tab / Enter；资料库按 / 聚焦搜索；Esc 关闭菜单、抽屉与气泡；截图 ⌘⇧S。', 'extension §7')}
        ${pr('timer', '动效克制且可预期', '剪藏提示约 3 秒；悬停提示延迟约 300ms；尊重“减少动态效果”。', 'extension §2.1 · §3')}
        ${pr('minimize-2', '窗口再小也不压坏内容', '导航折叠为图标栏而不是换成顶栏；抽屉占满内容区。', 'extension §2.2')}
        ${pr('lock', '本地优先的可见证据', '“只保存在本机”“导出范围与缺失项”都以文字呈现，而不是藏在设置里。', 'storage §6')}
      </div>
    </div>
  </div>`

  return `<section class="cv-section" id="overview" data-title="总览" style="padding-top:48px">
    <div class="cv-eyebrow">AnnHub v2 · UX / UI</div>
    <h1 class="cv-h2" style="font-size:44px;letter-spacing:-0.025em;margin-top:8px">三种方式留下内容，<br />一个库找回它们</h1>
    <p class="cv-lead" style="max-width:860px">本稿为 <a href="../../v2/README.md" target="_blank" rel="noopener">docs/v2</a> 涉及的全部界面做 UX/UI 设计：<b>Chrome 扩展</b>负责采集、整理、检索与导出。剪藏、高亮、截图是同一种条目，所以界面只有一套：页面里一个选区菜单，扩展里一个<b>左导航 + 右内容</b>的应用。每块画板标注了依据的文档章节与交付版本，编号标注对应画板下方的交互说明。</p>
    <div class="legend ui">
      <span><i class="pin" style="position:static;display:inline-block">1</i> 编号标注，对应画板下方说明（页眉可关闭）</span>
      <span><span class="cv-tag">R1</span> 交付版本，取自 roadmap.md</span>
      <span><span class="cv-tag is-live">可交互</span> 可以直接操作的原型</span>
      <span>${I('maximize-2', 'i-sm')} 悬停画板右上角可放大到 100%</span>
    </div>
    <div class="cv-group" id="ov-loop" style="margin-top:40px">
      <h3 class="cv-h3">闭环与界面归属<small>product.md §5 · README §1</small></h3>
      <p class="cv-desc">采集发生在网页现场，所以入口在页面里；整理与找回发生在需要用的时候，所以在扩展自己的页面里。产品只有这一个客户端，核心链路断网可用。</p>
      ${loop}
    </div>
    <div class="cv-group" id="ov-inventory">${inventory}</div>
    <div class="cv-group" id="ov-principles">${principles}</div>
  </section>`
}
