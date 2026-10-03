export type LandingCopy = ReturnType<typeof getLandingCopy>

const copy = {
  'zh-CN': {
    locale: 'zh-CN',
    languageLabel: 'EN',
    languageHref: '/en',
    nav: {
      workflow: '工作流',
      useCase: '真实场景',
      product: '产品',
      principles: '原则',
    },
    hero: {
      eyebrow: '产品方向预览',
      title: '把网页中的知识，变成工作中用得上的能力',
      description: '在浏览器中连同语境采集概念、论点和方法，在 Mac 上复习、输出并建立可信关系。本地优先，AI 可选。',
      cta: '查看项目进展',
      secondary: '查看 90 秒工作流',
      note: '面向高级工程师、架构师与技术负责人',
      preview: '产品方向预览 · R1 构建中',
    },
    problem: {
      eyebrow: '收藏之后',
      title: '收藏没有失败。失败的是收藏之后没有下一步。',
      items: [
        { title: '失去语境', body: '只剩一句摘录，不知道当时为什么重要。' },
        { title: '没有提取', body: '反复阅读，却从未主动解释、重建或判断。' },
        { title: '没有应用', body: '写方案时仍然重新搜索同一份资料。' },
      ],
    },
    workflow: {
      eyebrow: '一条完整链路',
      title: '从一次选区，到一次真实应用',
      description: 'AnnHub 不试图保存所有东西。它只把真正值得内化的内容推进到下一步。',
      steps: [
        { id: 'capture', index: '01', title: '连同语境采集', body: '保留选区、上下文、标题、永久链接和定位。' },
        { id: 'process', index: '02', title: '留下自己的理解', body: '先解释和判断，再查看原文或模型建议。' },
        { id: 'review', index: '03', title: '在合适时间重新提取', body: '不是重读，而是解释边界、重建步骤和回忆理由。' },
        { id: 'apply', index: '04', title: '用于真实工作', body: '从当前方案、分析或复盘反向调用相关 Fragment。' },
      ],
    },
    story: {
      eyebrow: '工程师用户故事',
      title: '从一篇技术文档，到一个设计决策',
      description: '同一条 Backpressure Fragment 穿过采集、复习、输出和关系确认，而不是停在收藏夹里。',
      stages: [
        { label: '阅读', title: '选中 Backpressure 的解释', body: 'AnnHub 自动保留所在段落和原文链接。' },
        { label: '理解', title: '写下它与当前内存问题的关系', body: '用户先形成判断，AI 只负责可选核验。' },
        { label: '提取', title: '在 Desktop 回忆定义和适用边界', body: '揭示参考信息后，再评 again / hard / good / easy。' },
        { label: '应用', title: '用于“设计失败重试策略”', body: '和 Retry storm、Idempotency 一起进入真实技术方案。' },
      ],
    },
    product: {
      eyebrow: 'Extension + Desktop',
      title: '浏览现场保持轻，深度工作留给 Desktop',
      extension: {
        title: 'Extension：指认、保留、加工',
        body: '选中文本后明确选择 Fragment、Highlight 或 Clip。Fragment 才需要核验和应用，其他内容不会被强行塞进复习队列。',
        bullets: ['永久链接与可编辑语境', '七种文本 Fragment，包括原创灵感', '断开 Desktop 仍可采集和导出'],
      },
      desktop: {
        title: 'Desktop：提取、输出、连接',
        body: '今日页只展示可执行事项；复习按 kind 提问；输出工坊从真实任务反向推荐过去的知识。',
        bullets: ['不超过 10 分钟的复习会话', '逐 Fragment 输出反馈', '建议关系必须由用户确认'],
      },
    },
    principles: {
      eyebrow: '产品立场',
      title: '不是另一个稍后读，也不是自动生成的第二大脑',
      items: [
        { title: 'Fragment 少而有价值', body: 'Highlight 和 Clip 可以很多；Fragment 必须包含应用。' },
        { title: '输出优先于大图谱', body: '能在真实任务中正确使用，比看到很多连接更重要。' },
        { title: '用户事实与 AI 建议分离', body: 'AI 可以建议核验、反馈和关系，但不能替你理解。' },
        { title: '本地优先但不封闭', body: '核心链路离线可用，Markdown 与已保存图片的开放导出正在建设。' },
      ],
    },
    trust: {
      eyebrow: 'Local first',
      title: '你的材料，不应该成为使用工具的代价',
      body: 'Extension 使用浏览器本地存储，Desktop 使用本地 SQLite。正文、URL 和用户产出不会作为默认遥测上传。LLM 可以关闭，也可以使用自己的 Provider。',
      items: ['断网可用', 'AI 可选 / BYOK', '开放导出开发中', '建议关系可拒绝'],
    },
    faq: {
      eyebrow: 'FAQ',
      title: '几个重要边界',
      items: [
        {
          q: '它和 Obsidian 有什么区别？',
          a: 'Obsidian 是通用本地知识库和插件平台；AnnHub 提供从网页采集、主动加工、复习到真实输出的一条固定工作流。AnnHub 不试图替代 Markdown 编辑器。',
        },
        { q: '必须使用 AI 吗？', a: '不需要。采集、手工核验、复习和用户自评都可以离线运行。AI 只用于可选的核验、反馈和关系建议。' },
        { q: '为什么没有手机端？', a: '当前产品集中在桌面浏览与深度工作闭环，避免在核心体验验证前分散到更多客户端。' },
        { q: '数据保存在哪里？', a: 'Extension 使用 IndexedDB，Desktop 使用本地 SQLite，两端通过本机接口交付碎片。' },
        { q: '现在所有功能都已经完成了吗？', a: '不是。页面展示的是 R1 与 R2 的产品方向。当前实现状态以公开路线图为准，尚未交付的能力会标记为开发中。' },
      ],
    },
    footer: {
      line: '让真正值得收藏的内容，经历一次理解、一次提取和一次应用。',
      roadmap: '公开路线图',
      github: 'GitHub',
      privacy: '隐私政策',
      terms: '服务条款',
    },
  },
  'en': {
    locale: 'en',
    languageLabel: '中文',
    languageHref: '/zh-CN',
    nav: { workflow: 'Workflow', useCase: 'Use case', product: 'Product', principles: 'Principles' },
    hero: {
      eyebrow: 'Product direction preview',
      title: 'Turn knowledge from the web into something you can use at work',
      description: 'Capture concepts, claims, and procedures with their original context in the browser. Review, apply, and connect them on Mac. Local-first. AI optional.',
      cta: 'View project progress',
      secondary: 'See the 90-second workflow',
      note: 'Built first for senior engineers, architects, and technical leads',
      preview: 'Product direction preview · R1 in progress',
    },
    problem: {
      eyebrow: 'After saving',
      title: 'Saving worked. What failed was everything that should happen next.',
      items: [
        { title: 'Context disappears', body: 'A quote remains, but the reason it mattered is gone.' },
        { title: 'Recall never happens', body: 'You reread material without ever explaining or reconstructing it.' },
        { title: 'Application never happens', body: 'When writing the design, you search for the same source again.' },
      ],
    },
    workflow: {
      eyebrow: 'One complete loop',
      title: 'From one selection to one real application',
      description: 'AnnHub is not designed to save everything. It moves only high-value knowledge into the next step.',
      steps: [
        { id: 'capture', index: '01', title: 'Capture with context', body: 'Keep the selection, surrounding passage, title, permalink, and locator.' },
        { id: 'process', index: '02', title: 'Leave your own interpretation', body: 'Explain and judge first. Source material or AI suggestions come second.' },
        { id: 'review', index: '03', title: 'Retrieve at the right time', body: 'Explain boundaries, reconstruct procedures, and recall the reason behind decisions.' },
        { id: 'apply', index: '04', title: 'Use it in real work', body: 'Start from the design, analysis, or retrospective you are working on now.' },
      ],
    },
    story: {
      eyebrow: 'Engineer user story',
      title: 'From a technical document to a design decision',
      description: 'The same Backpressure Fragment moves through capture, retrieval, output, and relationship confirmation instead of stopping in a bookmark list.',
      stages: [
        { label: 'Read', title: 'Select the explanation of Backpressure', body: 'AnnHub keeps the surrounding passage and permanent source link.' },
        { label: 'Interpret', title: 'Connect it to the current memory problem', body: 'The user forms the first judgment. AI is optional verification.' },
        { label: 'Retrieve', title: 'Recall the definition and boundary on Desktop', body: 'Reference material is revealed before rating the result.' },
        { label: 'Apply', title: 'Use it in “Design a retry strategy”', body: 'It enters a real design with Retry storm and Idempotency.' },
      ],
    },
    product: {
      eyebrow: 'Extension + Desktop',
      title: 'Keep the browsing moment light. Move deep work to Desktop.',
      extension: {
        title: 'Extension: identify, preserve, process',
        body: 'Choose Fragment, Highlight, or Clip deliberately. Only a Fragment requires verification and an intended application.',
        bullets: ['Permalinks and editable context', 'Seven text Fragment types, including original ideas', 'Capture and export without Desktop'],
      },
      desktop: {
        title: 'Desktop: retrieve, apply, connect',
        body: 'Today is an action list, review questions depend on the Fragment kind, and Output Workshop starts from real work.',
        bullets: ['Review sessions under ten minutes', 'Per-Fragment output feedback', 'Suggested relations require confirmation'],
      },
    },
    principles: {
      eyebrow: 'Product stance',
      title: 'Not another read-later app. Not an automatically generated second brain.',
      items: [
        { title: 'Fewer, denser Fragments', body: 'Highlights and Clips can be plentiful. A Fragment must include an intended application.' },
        { title: 'Output before a giant graph', body: 'Using knowledge correctly in real work matters more than seeing many connections.' },
        { title: 'User facts stay separate from AI suggestions', body: 'AI may suggest verification, feedback, and relationships, but it cannot do your understanding for you.' },
        { title: 'Local-first, not locked in', body: 'The core loop works offline, with an open Markdown and saved-image export in development.' },
      ],
    },
    trust: {
      eyebrow: 'Local first',
      title: 'Your material should not be the price of using the tool',
      body: 'The Extension stores data locally in the browser. Desktop uses local SQLite. Page content, URLs, and writing are not sent as default telemetry. AI can be disabled or connected to your own provider.',
      items: ['Works offline', 'Optional AI / BYOK', 'Open export in progress', 'Rejectable relationship suggestions'],
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Important boundaries',
      items: [
        {
          q: 'How is this different from Obsidian?',
          a: 'Obsidian is a general local knowledge base and plugin platform. AnnHub provides one opinionated workflow from web capture to active processing, retrieval, and real output. It is not trying to replace a Markdown editor.',
        },
        {
          q: 'Is AI required?',
          a: 'No. Capture, manual verification, review, and self-assessment work offline. AI is optional for verification, feedback, and relationship suggestions.',
        },
        { q: 'Why is there no mobile app?', a: 'The current product stays focused on desktop browsing and deep work until the core loop has been validated.' },
        { q: 'Where is the data stored?', a: 'The Extension uses IndexedDB and Desktop uses local SQLite. Fragments are delivered through a local interface.' },
        {
          q: 'Is every feature shown already complete?',
          a: 'No. The page shows the R1 and R2 product direction. The public roadmap identifies what is implemented and what remains in progress.',
        },
      ],
    },
    footer: {
      line: 'Make the knowledge worth saving go through interpretation, retrieval, and application.',
      roadmap: 'Public roadmap',
      github: 'GitHub',
      privacy: 'Privacy',
      terms: 'Terms',
    },
  },
} as const

export function getLandingCopy(locale: string) {
  return locale === 'zh-CN' ? copy['zh-CN'] : copy.en
}
