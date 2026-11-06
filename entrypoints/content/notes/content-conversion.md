# 内容转换与元数据

> 适用范围：页面内容转换、平台提取与元数据。上级约定见 [../AGENTS.md](../AGENTS.md)。

- `markdown.ts` 是唯一的 DOM→Markdown 转换（链接、标题层级、列表、代码块、表格、强调、图片、直链视频/音频与嵌入播放器；页面界面与隐藏内容剔除；剪藏按 100k 块边界截断，下载不截断并保留评论、回复与折叠正文），选区与区块共用，不各自实现；媒体地址的解析顺序（浏览器选中 source 的最大 srcset→currentSrc→src→data-*）只在 `media-source.ts` 一份，转换器与下载采集器（`download-collect.ts`）共用。
- `platform-x.ts` 以语义 article、状态链接和正文换行样式提取 X 帖子与长文，区块剪藏和下载共用正文、标题、作者与日期；长文的正文容器是嵌套在帖子 article 里、没有自己时间戳的 article（阅读视图），permalink 页面上它就是顶层 article；标题取 og:title/doc.title 或唯一的 h1，permalink 行在 article 外时元数据以页面地址为准，正文里的引用卡转成引用块；锚点不足时回退通用转换。
- 阅读视图按视口虚拟化渲染：页面下载先滚动全文，把已渲染的块按序拼装成一份独立副本再转换（`collectFullXArticle`）；页面下载把组装结果标上 `data-ann-platform` 再交给 worker，回程不再二次提取。
- 本页正文下载先由 `download-snapshot.ts` 在原页面筛掉不可见内容、保留折叠正文并固定图片候选，再交给 offscreen 按需加载 Defuddle 识别与标准化；关闭远程提取，结果仍由 `markdown.ts` 输出（Q-29、Q-30），不把提取库装进内容脚本。
- `markdown-table.ts` 展开 rowspan/colspan 并保留表题，所有输出行列数一致；figure 按子内容顺序转换，列表保留起始编号与下载任务勾选状态。
- `markdown-special.ts` 处理公式与脚注：下载输出 TeX、删除线和文末脚注，剪藏输出代码形式的公式与来源链接；正文转义随用途区分（capture.md §3.3）。
- 可见公式的 TeX 可能藏在透明的辅助 MathML 中，先把它作为公式元数据保留再过滤隐藏节点；辅助节点与回退图片只输出一次，不借此纳入整块隐藏正文。
- `markdown-code.ts` 统一解析代码语言与行边界，读取代码节点及相邻包装层的显式语言；正文快照保留开放 Shadow DOM 的示例，避免脱离原页面样式后丢失换行。
- 约定：`<br>` 是硬换行（行尾两个空格），表格单元格内折叠为空格；
- 嵌套列表缩进到父项内容列；
- 页面界面按 class/id 的**词**匹配剔除（语义容器不做 class 启发式）；
- 文本节点里的 Markdown 记号按字面转义（`escapeText`），渲染器 `entrypoints/library/markdown-view.tsx` 的 `inlineRuns` 与 `core/markdown.ts` 的纯文本化共用同一个转义约定，改一处要三处一起改。
- `page-meta.ts`：语境提取（取选区两端最近的块级祖先，上限、包含选区）、页面 meta（author/published/description/title）与永久链接（X 帖子 status 链接、一节标题锚点、其余页面地址）。meta 过长或不合规时降级而不是让保存失败：title、description 在字符边界截断并折叠换行，多位作者按分隔符拆开、超长单项丢弃。
