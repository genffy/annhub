// 范围边界：明确不在本稿范围内的内容。
// 设计稿提出的补充方案与发现的文档不一致都已经确认并写入 docs/v2（D-12、D-13、D-14），这里不再有待确认的提案；
// 再出现“文档没有定义、本稿给了方案”的地方，按 docs/v2/AGENTS.md 先登记到 validation.md，再回到这里列出。
function secOpen() {
  const out = `<div class="sp-card ui" style="margin-top:22px"><h5>明确没有设计的内容</h5><p>按“不为未进入当前版本的能力提前增加 UI 入口”（roadmap §1）。R5 截图增强是应产品负责人要求补画的例外，只表达目标体验，不代表进入开发：R5.3 在阶段 V 之后排期，R5.1、R5.2 以 H-14 为门槛。</p><table class="sp-table" style="font-size:12.5px"><tbody>
      <tr><td style="width:180px">设备端模型 Provider</td><td>阶段 V 之后；设置里没有“系统内置 / 浏览器内置模型”选项，也不标“推荐”。</td></tr>
      <tr><td>PDF 采集</td><td>不在路线图（D-09）。</td></tr>
      <tr><td>输出工坊、关系确认</td><td>D-10 已移出产品范围：设计稿里没有这两个页面、入口、数据与指标，Desktop 导航只有今日、碎片库、系统。</td></tr>
      <tr><td>手机端、团队协作、全库知识图谱、通用笔记</td><td>product §2.3 明确不做。</td></tr>
      <tr><td>平台发布与分享</td><td>R5 明确不做：真实发布动作、平台 API 与社媒账号授权；截图编辑器里没有任何上传入口。</td></tr>
      <tr><td>官网</td><td>docs/v2/website.md 的对外页面不属于扩展与 Desktop，不在本稿内。</td></tr></tbody></table></div>`

  return section(
    {
      id: 'open',
      nav: '范围边界',
      eyebrow: 'Scope',
      title: '故意没画的',
      lead: '设计稿提出的补充方案和发现的文档不一致都已经确认，并写入 docs/v2（D-12、D-13、D-14）。这里只列出故意没有设计的范围，方便核对“为什么这里没有页面”。',
    },
    `<div class="cv-group" id="open-scope" style="margin-top:8px">${out}</div>`,
  )
}
