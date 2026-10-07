// 范围边界：明确不在本稿范围内的内容。
// 设计稿里没有文档依据的方案，按 docs/v2/AGENTS.md 先登记到 validation.md，确认后才迁入真源，再回到这里列出。
function secOpen() {
  const out = `<div class="sp-card ui" style="margin-top:22px"><h5>明确没有设计的内容</h5><p>按“不为未进入当前版本的能力提前增加 UI 入口”（roadmap §1）。精确选区（R3）是唯一排在阶段 V 之后、但画了目标体验的范围。</p><table class="sp-table" style="font-size:12.5px"><tbody>
      <tr><td style="width:200px">采集窗口与三步加工</td><td>D-18 已移出：剪藏与高亮一步完成，没有表单；也没有深度模式、核验、应用、“改存为”出口与草稿恢复。</td></tr>
      <tr><td>碎片与九种类型、灵感、媒体片段</td><td>D-18 已移出：只有剪藏、高亮、截图三种条目，没有按类型的采集提问。</td></tr>
      <tr><td>AI 与模型建议</td><td>D-18 已移出：加工移除后没有功能消费者；设置里没有任何 Provider 或密钥入口。</td></tr>
      <tr><td>截图美化、品牌水印、下载格式、尺寸预设</td><td>D-18 已移出（原 R5.1、R5.2）：截图编辑器里没有这些入口，也没有 <code>clipboardWrite</code>。</td></tr>
      <tr><td>整页剪藏、模板与 URL 触发的类型预设</td><td>未决（Q-10、Q-11）：只保存选区；类型预设在属性页手工勾选。</td></tr>
      <tr><td>属性重命名、改已使用属性的类型、批量编辑</td><td>v1 不做（entry §5.6）：使用中的属性不可改类型，需要时先清空或新建。</td></tr>
      <tr><td>PDF 采集</td><td>不在路线图（D-09）。</td></tr>
      <tr><td>桌面客户端、间隔复习</td><td>D-17 已移出产品范围：设计稿里没有 Desktop 的任何页面，也没有复习、配对与交付的入口。</td></tr>
      <tr><td>输出工坊、关系确认</td><td>D-10 已移出产品范围：设计稿里没有这两个页面、入口、数据与指标。</td></tr>
      <tr><td>手机端、团队协作、全库知识图谱、通用笔记</td><td>product §2.3 明确不做。</td></tr>
      <tr><td>平台发布与分享</td><td>明确不做：真实发布动作、平台 API 与社媒账号授权；截图编辑器里没有任何上传入口。</td></tr>
      <tr><td>官网</td><td>docs/v2/website.md 的对外页面不属于扩展，不在本稿内。</td></tr></tbody></table></div>`

  return section(
    {
      id: 'open',
      nav: '范围边界',
      eyebrow: 'Scope',
      title: '故意没画的',
      lead: '这里只列出故意没有设计的范围，方便核对“为什么这里没有页面”。原稿里的采集窗口、九种类型、模型建议和截图美化与品牌，都随 D-18 移出了产品范围。',
    },
    `<div class="cv-group" id="open-scope" style="margin-top:8px">${out}</div>`,
  )
}
