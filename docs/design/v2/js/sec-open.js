// 范围边界：明确不在本稿范围内的内容。
// 设计稿里没有文档依据的方案，按 docs/v2/AGENTS.md 先登记到 validation.md，确认后才迁入真源，再回到这里列出。
function secOpen() {
  const out = `<div class="sp-card ui" style="margin-top:22px"><h5>明确没有设计的内容</h5><p>按“不为未进入当前版本的能力提前增加 UI 入口”（roadmap §1）。精确选区与可重复的取景框（R3）是排在阶段 V 之后、但画了目标体验的范围。</p><table class="sp-table" style="font-size:12.5px"><tbody>
      <tr><td style="width:200px">网页上的高亮标记</td><td>页面里没有高亮入口，也不留任何标记；高亮在资料库里读剪藏时完成，网页保持原样（entry §4）。</td></tr>
      <tr><td>AI 与模型接入</td><td>与“内容不离开本机”的承诺冲突；设置里没有任何 Provider 或密钥入口（permissions §1）。</td></tr>
      <tr><td>设备外框、封面与文案卡模板、自动平衡、模板市场</td><td>不做：截图首先是资料，不是设计稿；美化只做背景、留白、圆角与阴影（screenshot §4.4、product §2.3）。</td></tr>
      <tr><td>整页剪藏、模板与 URL 触发的类型预设</td><td>未决（Q-10、Q-11）：区块剪藏保存的是一个整体内容，不是整页；类型预设在属性页手工勾选。</td></tr>
      <tr><td>剪藏里的图片</td><td>只保留原地址和占位，不下载、不联网加载；要保留画面用截图（capture §3.1）。</td></tr>
      <tr><td>X 线程与评论串的自动展开</td><td>不做：一次剪一个帖子（capture §8）。</td></tr>
      <tr><td>属性重命名、改已使用属性的类型、批量编辑；给单条高亮加标签或属性</td><td>不做（entry §5.6）：使用中的属性不可改类型，需要时先清空或新建；高亮的标签与属性随所属剪藏。</td></tr>
      <tr><td>PDF 采集</td><td>不在路线图；是否排期取决于 H-15（roadmap §3）。</td></tr>
      <tr><td>手机端、独立的桌面应用、团队协作、通用笔记</td><td>product §2.3 明确不做。</td></tr>
      <tr><td>平台发布与分享</td><td>明确不做：真实发布动作、平台 API 与社媒账号授权；截图产物以入库、复制与下载为终点，编辑器里没有任何上传入口。</td></tr>
      <tr><td>官网</td><td>docs/v2/website.md 的对外页面不属于扩展，不在本稿内。</td></tr></tbody></table></div>`

  return section(
    {
      id: 'open',
      nav: '范围边界',
      eyebrow: 'Scope',
      title: '故意没画的',
      lead: '这里只列出故意没有设计的范围，方便核对“为什么这里没有页面”。',
    },
    `<div class="cv-group" id="open-scope" style="margin-top:8px">${out}</div>`,
  )
}
