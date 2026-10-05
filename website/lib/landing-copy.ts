export type LandingCopy = ReturnType<typeof getLandingCopy>

// Content follows docs/v2/website.md. The page never promises more than the
// roadmap says is delivered: interface scenes are design sketches, not
// screenshots of a public build (website.md §10, §14).
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
      title: '把网页中的知识，变成工作中用得上的能力。',
      description: '在浏览器中连同语境采集概念、论点和方法，在 Mac 上按类型复习。本地优先，AI 可选。',
      cta: '查看项目进展',
      secondary: '查看 90 秒工作流',
      note: '面向高级工程师、架构师与技术负责人',
      preview: '产品方向预览 · 界面为示意稿',
    },
    problem: {
      eyebrow: '收藏之后',
      title: '收藏没有失败。失败的是收藏之后没有下一步。',
      items: [
        { title: '失去语境', body: '只剩一句摘录，不知道当时为什么重要。' },
        { title: '缺少加工', body: '原样搬运，没有留下自己的理解和用法。' },
        { title: '没有提取', body: '反复阅读，却从未主动回忆。' },
      ],
    },
    workflow: {
      eyebrow: '一条完整链路',
      title: '从一次选区，到一次主动回忆',
      description: 'AnnHub 不试图保存所有东西。它只把真正值得内化的内容推进到下一步。',
      steps: [
        { id: 'capture', index: '01', title: '连同语境采集', body: '自动保留选区、上下文、标题、来源和定位。' },
        { id: 'process', index: '02', title: '留下自己的理解', body: '先解释和判断，再查看原文或模型建议。' },
        { id: 'review', index: '03', title: '在合适时间重新提取', body: '不是重新阅读，而是解释概念、重建步骤和回忆理由。' },
      ],
    },
    story: {
      eyebrow: '工程师用户故事',
      title: '从一篇技术文档，到一次主动回忆',
      description: '同一条 Backpressure 概念穿过采集、理解和复习，而不是停在收藏夹里。',
      stages: [
        { label: '阅读', title: '保存 Backpressure 的解释', body: 'AnnHub 自动保留所在段落和原文链接。' },
        { label: '理解', title: '写下它与当前内存问题的关系', body: '用户先形成判断，AI 只负责可选核验。' },
        { label: '提取', title: 'Desktop 到期时解释边界', body: '先自己作答，再揭示参考信息，最后评 again / hard / good / easy。' },
        { label: '回看', title: '发现理解有误，回到来源修正', body: '揭示面保留“回到来源”，对照原文再确认一次。' },
      ],
    },
    scenes: {
      reveal: {
        label: '精选界面',
        body: '揭示之后，把你自己的理解、核验和用法放在一起对照；理解有出入时，一步回到原文。',
      },
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
        title: 'Desktop：提取与整理',
        body: '今日页只展示可执行事项；复习按 kind 提问；碎片库按类型、来源和标签整理。',
        bullets: ['不超过 10 分钟的复习会话', '每种 kind 有各自的题面与提示', '数据保存在本地 SQLite'],
      },
    },
    principles: {
      eyebrow: '产品立场',
      title: '不是另一个稍后读，也不是自动生成的第二大脑',
      items: [
        { title: '不是网页收藏夹', body: 'Highlight 和 Clip 可以很多，Fragment 必须包含应用。' },
        { title: '不是需要自己拼装的插件系统', body: '采集与复习使用同一份领域模型。' },
        { title: '不让 AI 替你理解', body: 'AI 只提供核验建议，用户先生成，建议经你确认才生效。' },
        { title: '本地优先且可阅读', body: '核心链路离线可用；扩展内容和已保存图片可导出为 Markdown ZIP。' },
      ],
    },
    trust: {
      eyebrow: 'Local first',
      title: '你的材料，不应该成为使用工具的代价',
      body: 'Extension 使用浏览器本地存储，Desktop 使用本地 SQLite。核心链路断网可用，正文、URL 和用户产出不会作为默认遥测上传。LLM 默认关闭，也可以使用自己的 Provider。',
      items: ['断网可用', 'LLM 默认关闭或 BYOK', 'Markdown + 原图 ZIP 导出，不依赖 Desktop', '导出供其他工具阅读，不还原复习状态'],
    },
    faq: {
      eyebrow: 'FAQ',
      title: '几个重要边界',
      items: [
        {
          q: '它和 Obsidian 有什么区别？',
          a: 'Obsidian 提供通用本地知识库和插件平台；AnnHub 提供从网页采集、主动加工到复习的一条固定工作流，不试图替代 Obsidian 编辑器。',
        },
        { q: '必须使用 AI 吗？', a: '不需要。采集、核验、复习和扩展内容导出都可以离线运行。' },
        { q: '数据保存在哪里？', a: 'Extension 使用浏览器本地存储，Desktop 使用本地 SQLite；两端通过本机接口交付数据。' },
        { q: '为什么没有手机端？', a: '当前产品集中在桌面浏览与深度工作闭环，避免在核心体验验证前分散到更多客户端。' },
        {
          q: '能导出吗？',
          a: '可以在扩展中下载 Markdown 与已保存图片组成的 ZIP，不需要安装 Desktop。该 ZIP 适合其他工具阅读，不是可恢复 Desktop 学习状态的数据库备份。',
        },
        { q: '现在所有功能都已经完成了吗？', a: '不是。页面展示的是产品方向，界面为示意稿。当前实现状态以公开路线图为准，尚未交付的能力会标记为开发中。' },
      ],
    },
    footer: {
      line: '让真正值得收藏的内容，经历一次理解和一次提取。',
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
      title: 'Turn knowledge from the web into something you can use at work.',
      description: 'Capture concepts, claims, and procedures with their original context in the browser. Review them by type on Mac. Local-first. AI optional.',
      cta: 'View project progress',
      secondary: 'See the 90-second workflow',
      note: 'Built first for senior engineers, architects, and technical leads',
      preview: 'Product direction preview · interface sketches',
    },
    problem: {
      eyebrow: 'After saving',
      title: 'Saving worked. What failed was everything that should happen next.',
      items: [
        { title: 'Context disappears', body: 'A quote remains, but the reason it mattered is gone.' },
        { title: 'No processing', body: 'It is copied as-is, with none of your own interpretation or intended use.' },
        { title: 'No retrieval', body: 'You reread material without ever recalling it on purpose.' },
      ],
    },
    workflow: {
      eyebrow: 'One complete loop',
      title: 'From one selection to one act of recall',
      description: 'AnnHub is not designed to save everything. It moves only high-value knowledge into the next step.',
      steps: [
        { id: 'capture', index: '01', title: 'Capture with context', body: 'Keep the selection, surrounding passage, title, source, and locator automatically.' },
        { id: 'process', index: '02', title: 'Leave your own interpretation', body: 'Explain and judge first. Source material or AI suggestions come second.' },
        { id: 'review', index: '03', title: 'Retrieve at the right time', body: 'Not rereading: explain the concept, rebuild the steps, recall the reason.' },
      ],
    },
    story: {
      eyebrow: 'Engineer user story',
      title: 'From a technical document to an act of recall',
      description: 'The same Backpressure concept moves through capture, interpretation, and review instead of stopping in a bookmark list.',
      stages: [
        { label: 'Read', title: 'Save the explanation of Backpressure', body: 'AnnHub keeps the surrounding passage and permanent source link.' },
        { label: 'Interpret', title: 'Connect it to the current memory problem', body: 'The user forms the first judgment. AI is optional verification.' },
        { label: 'Retrieve', title: 'Explain the boundary when Desktop says it is due', body: 'Answer first, reveal the reference, then rate: again / hard / good / easy.' },
        { label: 'Revisit', title: 'Found a gap? Go back to the source', body: 'The reveal keeps “back to source” so you can confirm against the original again.' },
      ],
    },
    scenes: {
      reveal: {
        label: 'Selected screen',
        body: 'After the reveal, your own interpretation, verification, and intended use sit side by side. When they disagree with the source, the original is one click away.',
      },
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
        title: 'Desktop: retrieve and organize',
        body: 'Today is an action list, review questions depend on the Fragment kind, and the library is organized by type, source, and tag.',
        bullets: ['Review sessions under ten minutes', 'Each kind has its own prompt and hints', 'Data stays in a local SQLite database'],
      },
    },
    principles: {
      eyebrow: 'Product stance',
      title: 'Not another read-later app. Not an automatically generated second brain.',
      items: [
        { title: 'Not a bookmark list', body: 'Highlights and Clips can be plentiful. A Fragment must include an intended application.' },
        { title: 'Not a plugin kit you assemble yourself', body: 'Capture and review share a single domain model.' },
        { title: 'AI does not do your understanding', body: 'AI only suggests verification. You generate first, and a suggestion counts only after you confirm it.' },
        { title: 'Local-first and readable', body: 'The core loop works offline; extension content and saved images export as a Markdown ZIP.' },
      ],
    },
    trust: {
      eyebrow: 'Local first',
      title: 'Your material should not be the price of using the tool',
      body: 'The Extension stores data locally in the browser. Desktop uses local SQLite. The core loop works offline, and page content, URLs, and your writing are not sent as default telemetry. The LLM is off by default, or you can connect your own provider.',
      items: ['Works offline', 'LLM off by default, or BYOK', 'Markdown + original images ZIP, no Desktop needed', 'For reading elsewhere; does not restore review state'],
    },
    faq: {
      eyebrow: 'FAQ',
      title: 'Important boundaries',
      items: [
        {
          q: 'How is this different from Obsidian?',
          a: 'Obsidian is a general local knowledge base and plugin platform. AnnHub provides one opinionated workflow from web capture and active processing to review. It is not trying to replace the Obsidian editor.',
        },
        {
          q: 'Is AI required?',
          a: 'No. Capture, verification, review, and exporting the extension’s content all work offline.',
        },
        { q: 'Where is the data stored?', a: 'The Extension uses local browser storage and Desktop uses local SQLite. The two deliver data through a local interface.' },
        { q: 'Why is there no mobile app?', a: 'The current product stays focused on desktop browsing and deep work until the core loop has been validated.' },
        {
          q: 'Can I export?',
          a: 'The extension can download a ZIP of Markdown files and the images you saved, without installing Desktop. The ZIP is meant for reading in other tools. It is not a database backup that restores Desktop review state.',
        },
        {
          q: 'Is every feature shown already complete?',
          a: 'No. The page shows the product direction, and the interfaces are sketches. The public roadmap identifies what is implemented and what remains in progress.',
        },
      ],
    },
    footer: {
      line: 'Make the knowledge worth saving go through one act of interpretation and one act of retrieval.',
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
