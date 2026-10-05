// 总览：产品闭环与界面的对应、界面清单、设计原则。
function secOverview() {
  const step = (no, title, act, surface, metric) => `<div class="lp-step">
    <div class="no">${no}</div><h6>${title}</h6>
    <dl><div><dt>用户动作</dt><dd>${act}</dd></div><div><dt>主要界面</dt><dd>${surface}</dd></div><div><dt>关键指标</dt><dd>${metric}</dd></div></dl>
  </div>`

  const loop = `<div class="lp ui">
    <div class="lp-grid">
      <div></div>
      ${step('L1', '采集与语境', '选中内容，选择保存层级', '扩展：选区菜单、采集窗口、截图', 'M-02 · M-03 · M-04')}
      ${step('L2', '主动加工', '理解、核验确认、应用', '扩展：采集窗口', 'M-05')}
      ${step('L3', '间隔复习', '先回忆，再揭示，自评', 'Desktop：今日、复习会话', 'M-07 · M-08 · M-18')}

      <div class="lp-lane-label">浏览器扩展</div>
      <div class="lp-bar ext" style="grid-column: 2 / span 2">${I('puzzle')}采集与加工 <small>选区菜单 · 采集窗口 · 截图</small></div>
      <div class="lp-bar ext" style="grid-column: 4; opacity: 0.72">${I('library')}碎片库 · 截图集 · 设置 <small>随时可查询、编辑、导出；已连接时显示 Desktop 回传的复习状态</small></div>

      <div class="lp-lane-label">macOS Desktop</div>
      <div class="lp-bar desk" style="grid-column: 2 / span 2; opacity: 0.72">${I('server')}本机接口接收 <small>127.0.0.1 · 逐条写入 Fragment 与图片</small></div>
      <div class="lp-bar desk" style="grid-column: 4">${I('monitor')}复习 · 整理 <small>学习消费端，也是本地数据中枢</small></div>
    </div>
    <div class="lp-note">
      <span>${I('plug')}扩展断开 Desktop：仍可采集、查询、导出 Markdown ZIP</span>
      <span>${I('wifi-off')}Desktop 断网：仍可复习、整理</span>
      <span>${I('sparkles')}LLM 关闭：主流程完整可用</span>
    </div>
  </div>`

  const rel = r => `<span class="cv-tag">${r}</span>`
  const rowOf = (name, duty, doc, ver, link) =>
    `<tr><td>${name}</td><td>${duty}</td><td>${doc}</td><td>${ver}</td><td><a href="#${link}">查看 →</a></td></tr>`
  const head = label => `<tr><td colspan="5" style="padding:16px 0 6px;font-size:11.5px;letter-spacing:.06em;color:var(--brand-text);font-weight:700">${label}</td></tr>`

  const inventory = `<div class="sp-card ui" style="margin-top:22px">
    <h5>界面清单</h5>
    <p>每一行对应一组画板；“版本”取自 roadmap.md 的交付范围。R5 行是后置或排在阶段 V 之后的范围，画出来只表达目标体验，不代表进入开发。</p>
    <table class="sp-table">
      <thead><tr><th style="width:170px">界面</th><th>职责</th><th style="width:210px">依据</th><th style="width:150px">版本</th><th style="width:70px"></th></tr></thead>
      <tbody>
        ${head('浏览器扩展')}
        ${rowOf('选区菜单 HoverMenu', '选中文本后选择保存层级：碎片 / 高亮 / 剪藏 / 截图（/ 媒体片段）；悬停给出一句后果', 'extension §2.1 · capture §2', `${rel('R1')} 媒体片段 ${rel('R4')}`, 'ext-flow')}
        ${rowOf('采集窗口', '理解 → 核验 → 应用，按 kind 提问，安全出口与草稿恢复', 'extension §4 · processing · kinds', rel('R1'), 'ext-modal')}
        ${rowOf('高亮与剪藏', '页面内视觉标记与备注；一次点击的快速剪藏', 'extension §3 · capture §2', rel('R1'), 'ext-hl')}
        ${rowOf('截图', '区域 / 元素截图，原位标注、匿名与马赛克', 'screenshot §1–§5', rel('R1'), 'ext-shot')}
        ${rowOf('截图增强', '精确选区（吸附、手柄、比例锁定、选区确认）；美化与品牌；下载格式、复制与平台尺寸预设', 'screenshot §1 · §4 · roadmap R5', `${rel('R5.3')} ${rel('R5.1')} ${rel('R5.2')}`, 'ext-shot-r5')}
        ${rowOf('碎片库', '搜索、筛选、详情编辑、导出；回传后显示复习状态', 'extension §5 · search', `${rel('R1')} 状态 ${rel('R3')}`, 'ext-lib')}
        ${rowOf('截图集', '查看、重新下载、删除；转为 visual Fragment', 'extension §7 · screenshot §4', rel('R1'), 'ext-shots-page')}
        ${rowOf('设置', '连接 Desktop、模型能力、偏好、本地指标、导出；R5.1 起增加截图品牌', 'extension §6 · ai · metrics §11', `${rel('R1')} 截图品牌 ${rel('R5.1')}`, 'ext-settings')}
        ${rowOf('工具栏弹窗', '连接状态，打开新建灵感 / 碎片库 / 截图集；回传后显示 Desktop 到期数', 'extension §2.3 · product §8', `${rel('R1')} 到期数 ${rel('R3')}`, 'ext-popup')}
        ${head('macOS Desktop')}
        ${rowOf('今日', '行动清单：到期复习、最近写入；底部一行本周成功提取数', 'desktop §3', rel('R1'), 'desk-today')}
        ${rowOf('碎片库', '三栏：筛选 / 列表 / 详情；用户加工在原文之前', 'desktop §4 · search', rel('R1'), 'desk-library')}
        ${rowOf('复习会话', '题面 → 提示 → 揭示 → 四档自评；中断可恢复', 'desktop §5 · review · kinds', `${rel('R1')} 图像遮挡 ${rel('R4')}`, 'desk-review')}
        ${rowOf('系统', '本地服务、配对码、交付状态；技术信息默认折叠', 'desktop §6 · storage §8', rel('R1'), 'desk-system')}
        ${rowOf('菜单栏与通知', '高频状态；只发用户配置的每日复习提醒', 'desktop §7 · §8', rel('R1'), 'desk-menubar')}
        ${rowOf('命令面板 ⌘K', '全局搜索与命令', 'desktop §9 · search', rel('R1'), 'desk-palette')}
        ${rowOf('偏好设置', '每日建议量、提醒时间', 'desktop §8.2 · review §5', rel('R1'), 'desk-prefs')}
      </tbody>
    </table>
  </div>`

  const pr = (icon, title, rule, where) => `<div class="pr"><div class="n">${I(icon)}</div><div><h6>${title}</h6><p>${rule}</p><small>${where}</small></div></div>`
  const principles = `<div class="cv-cols">
    <div class="sp-card ui">
      <h5>产品原则 → 界面规则</h5>
      <p>product.md §6 的七条原则，各自落成一条可以在画板里检查的界面规则。</p>
      <div class="sp-grid">
        ${pr('gauge', '价值密度高于采集数量', '不展示“今日收藏了多少条”；碎片库头部只显示条数，今日页只在底部给一行“本周成功提取 N 个碎片”，队列提醒只给建议完成量，不用红色大数字。', '今日 · 碎片库头部')}
        ${pr('link', '原文永远可追溯', '每张卡片、每个揭示面都带来源与“回到原文”；定位失败时仍显示足以独立理解的语境。', '采集窗口 · 详情 · 复习揭示')}
        ${pr('pencil-line', '用户先生成，系统后辅助', '“模型建议”默认关闭且不预填；理解、应用永远由用户自己写；理解步骤先于模型答案。', '采集窗口 · 核验步骤')}
        ${pr('target', '每个学习动作都有真实对象', '复习卡对应单个 Fragment；评分、提示和揭示都落在这一条上，会话只显示进度条数，没有总分、计时或连胜。', '复习会话')}
        ${pr('shield-check', '失败不丢思考', '保存失败留在原步骤并保留输入；关闭有确认与“改存为高亮 / 剪藏”；未提交的表单自动存草稿。', '采集窗口状态 · 草稿恢复')}
        ${pr('sparkles', '建议不等于事实', '一切“建议”统一为虚线描边 + sparkles 图标 + 明确标签，可接受 / 修改 / 拒绝；未确认的不生效。', '核验建议 · kind 推断')}
        ${pr('layout-list', '默认界面克制', '一级导航在扩展与 Desktop 里都只有 3 项；技术信息折叠；连接问题只在需要处理时才出现。', '系统页 · 状态条')}
      </div>
    </div>
    <div class="sp-card ui">
      <h5>贯穿全局的界面约定</h5>
      <p>来自各 PRD 的可访问性、键盘与反馈要求，所有画板默认遵守。</p>
      <div class="sp-grid">
        ${pr('eye', '颜色不是唯一表达', 'kind = 图标 + 文字 + 色；连接状态 = 点 + 文字 + 图标；核验 = 勾 + 时间 + 来源徽标。', 'extension §10.1 · desktop §9')}
        ${pr('keyboard', '全流程可键盘完成', '采集 ⌘↵ 继续 / Esc 关闭；复习 1–4 评分（揭示前无效）；Desktop ⌘K 搜索，⌘1…3 切页。', 'extension §10 · desktop §9')}
        ${pr('plug', '断开也能用，不制造恐慌', '无 Desktop 时强调扩展仍可独立工作；待发送显示为状态而不是错误；任何连接状态都不阻塞本地保存。', 'extension §6 · §8')}
        ${pr('timer', '动效克制且可预期', '保存成功提示约 700ms；步骤切换不改变窗口外框尺寸；尊重“减少动态效果”。', 'extension §4.1 · §4.7')}
        ${pr('maximize', '窗口再小也不压坏内容', 'Desktop 窄窗口：详情改 sheet；扩展 Modal 小视口留 16px 边距。', 'desktop §4.1 · extension §4.1')}
        ${pr('lock', '本地优先的可见证据', '“仅监听本机”“默认关闭外发”“导出范围与缺失项”都以文字呈现，而不是藏在设置里。', 'storage §7–§8 · ai §5')}
      </div>
    </div>
  </div>`

  return `<section class="cv-section" id="overview" data-title="总览" style="padding-top:48px">
    <div class="cv-eyebrow">AnnHub v2 · UX / UI</div>
    <h1 class="cv-h2" style="font-size:44px;letter-spacing:-0.025em;margin-top:8px">把“收藏之后用不上”<br />改成一次理解、一次提取、一次应用</h1>
    <p class="cv-lead" style="max-width:860px">本稿为 <a href="../../v2/README.md" target="_blank" rel="noopener">docs/v2</a> 涉及的全部界面做 UX/UI 设计：<b>Chrome 扩展</b>负责采集与加工，<b>macOS Desktop</b> 负责复习与整理。每块画板标注了依据的文档章节与交付版本，编号标注对应画板下方的交互说明。</p>
    <div class="legend ui">
      <span><i class="pin" style="position:static;display:inline-block">1</i> 编号标注，对应画板下方说明（页眉可关闭）</span>
      <span><span class="cv-tag">R1</span> 交付版本，取自 roadmap.md</span>
      <span><span class="cv-tag is-live">可交互</span> 可以直接操作的原型</span>
      <span>${I('maximize-2', 'i-sm')} 悬停画板右上角可放大到 100%</span>
    </div>
    <div class="cv-group" id="ov-loop" style="margin-top:40px">
      <h3 class="cv-h3">闭环与两端分工<small>product.md §5 · README §1</small></h3>
      <p class="cv-desc">三层闭环决定了界面的归属：采集与加工发生在网页现场，所以在扩展；回忆需要专注环境，所以在 Mac。两端靠本机接口逐条交付，任何一端缺席都不影响另一端的核心功能。</p>
      ${loop}
    </div>
    <div class="cv-group" id="ov-inventory">${inventory}</div>
    <div class="cv-group" id="ov-principles">${principles}</div>
  </section>`
}
