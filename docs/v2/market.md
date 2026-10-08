# 市场与参照产品证据

> 层级：vision
> 状态：外部事实证据；不是产品决策
> 核对日期：2026-10-03；第 2 节 Obsidian + Web Clipper 一行与第 4.2 节核对于 2026-10-07；第 4.3 至 4.5 节核对于 2026-10-08（均不晚于 2027-01-01 复核）
> 更新：2026-10-08

本文只记录**可核对的外部事实**及其对 AnnHub 的含义。产品决策写在 [product.md](product.md)、[roadmap.md](roadmap.md) 和 [validation.md](validation.md)，本文不替它们做决定。

事实取自官方页面或一手来源，第三方评测只作佐证并标明。价格为美元、官网标注的年付折算价，随时会变，复核时以官网为准。表中“—”表示**所查官方页面未列出**，不等于产品不支持。

## 1. 先看结论

1. **把网页内容存下来的现有路线有两条**：存进本地笔记库（Obsidian + Web Clipper：模板、属性、高亮器），或存进云端的阅读与高亮服务（Readwise）。AnnHub 的位置是第三种：在浏览器里一个不依赖笔记软件的本地库中放下剪藏与截图，并能在库里读剪藏、划高亮，用类型化属性分类，导出对 Obsidian 友好。这个位置站不站得住，由 [H-16、H-17](validation.md) 与 [RK-11](validation.md) 验证。
2. **托管服务会突然消失**：Omnivore（2024）、Pocket（2025）和独立的 ChatGPT Atlas 浏览器（2026）都在短期内关停，导出窗口从两周到三个月不等。本地优先加一种开放导出，是对这类风险的直接回答。
3. **最强的对手是免费且开源的 Obsidian Web Clipper**：它已经有模板、属性和高亮器。AnnHub 不靠功能数量胜过它，靠的是不需要 Obsidian 也有完整的库，并且截图、剪藏与库内高亮在同一处。
4. **AnnHub 明显弱于对手的地方**：没有手机端、没有 PDF 与电子书来源、没有导入、没有协作、没有整页剪藏与模板触发器。这些大多是刻意取舍，但每一项都要有退出条件（第 5 节）。

## 2. 能力对照

按采集、分类、导出对照各产品**官方页面明确列出**的能力。✓ = 明确列出；◐ = 部分、有限额或间接；— = 未列出。

| 产品                   | 网页采集                                                       | 属性与分类                                                            | 本地与导出                              | AI 辅助                                                       |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Readwise               | ✓ 多来源高亮同步                                               | ◐ 标签与笔记                                                          | ◐ 云服务；可导出到 Notion、Obsidian 等  | —                                                             |
| Obsidian + Web Clipper | ✓ 页面与元数据存为本地文件，模板化；Highlighter 高亮后回访可见 | ✓ 模板定义属性（6 种类型），名称全局绑定类型，落盘为 YAML frontmatter | ✓ 本地文件，核心免费                    | ✓ Interpreter：用户选择模型服务商，用自然语言提示填充模板变量 |
| Capacities             | ◐ 从聊天应用、邮件保存                                         | ✓ 类型化对象                                                          | ✓ 完整导入导出，核心免费                | ✓ 付费                                                        |
| **AnnHub（设计目标）** | ✓ 剪藏（选区、区块）、截图；库内阅读与高亮，带来源             | ✓ 类型化属性，两种类型预设，同名同类型                                | ✓ 本地优先；Markdown + frontmatter 导出 | —                                                             |

## 3. 定价与形态

核对于 2026-10-03。

| 产品       | 价格（美元）                                                                                              | 数据与形态                                                       | 来源                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Readwise   | Lite 5.59 / Full 9.99 每月（年付折算）；30 天试用                                                         | 订阅制云服务；高亮可导出到 Notion、Obsidian 等                   | [定价页](https://readwise.io/pricing)                                             |
| Obsidian   | 核心应用免费、无需注册；Sync 4 / 月（年付）；Publish 8 / 站点 / 月（年付）；商业许可 50 / 用户 / 年，自愿 | 本地 Markdown 文件，主张“文件优先于应用”；Web Clipper 为官方扩展 | [定价页](https://obsidian.md/pricing)、[Web Clipper](https://obsidian.md/clipper) |
| Capacities | 基础版免费，官方承诺核心产品保持免费；Pro 另付（价格未核对）                                              | 类型化对象，完整导入导出                                         | [定价页](https://capacities.io/pricing)                                           |

定价参照用于阶段 V 之后的商业化评估（[Q-07](validation.md)；阶段 V 免费内测）：已核对的同类订阅为每月 4 到 10 美元左右（Readwise 5.59 至 9.99，Obsidian Sync 4），核心能力多为免费。

## 4. 行业信号

### 4.1 服务会消失，数据要能带走

| 事件          | 经过                                                                                       | 含义                                                      | 来源                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Omnivore      | 2024-10-29 宣布团队加入 ElevenLabs；服务于 2024-11-15 关闭，导出窗口约两周；代码仍保持开源 | 开源不等于服务存续；窗口很短                              | [TechCrunch](https://techcrunch.com/2024/10/29/elevenlabs-has-hired-the-team-behind-omnivore-a-reader-app/)            |
| Pocket        | 2025-05-22 宣布；2025-07-08 停止服务并转为仅导出；2025-10-08 起数据永久删除                | 大厂背书也不保证存续                                      | [gHacks](https://www.ghacks.net/2025/05/23/mozilla-to-shut-down-pocket-in-july-2025-fakespot-is-closing-too/)          |
| ChatGPT Atlas | OpenAI 于 2026-07 宣布停止独立浏览器，2026-08-09 起不再运行，能力并入 ChatGPT 桌面应用     | AI 浏览器的形态仍不稳定；不宜把采集入口押在某款新浏览器上 | [9to5Mac](https://9to5mac.com/2026/08/04/openai-explains-what-will-happen-when-chatgpt-atlas-shuts-down-this-weekend/) |

“本地优先软件”的七项理想（Ink & Switch，2019）里，与此直接相关的是：网络是可选的、长久可用（The Long Now）、用户保有最终所有权与控制（[原文](https://www.inkandswitch.com/essay/local-first/)）。AnnHub 的对应做法是本地存储加一种可独立阅读的 Markdown ZIP（[storage.md §6](storage.md)）。

### 4.2 Obsidian Web Clipper 的属性与高亮设计

核对于 2026-10-07，取自官方帮助文档（`obsidian.md/help`）与扩展源码。

| 事实                                                                                                                                                                                                              | 对 AnnHub 的含义                                                                                                          | 来源                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Obsidian 的属性类型有文本、列表、数字、复选框、日期、日期时间和标签；属性名一旦指定了类型，库里所有同名属性都用同一类型；不支持嵌套属性，也不支持属性里的 Markdown，属性是小而原子的信息；落盘为 YAML frontmatter | 条目的属性采用同样的类型、全局绑定与扁平约束（[entry.md §5](entry.md)）                                                   | [Properties](https://obsidian.md/help/properties)                                                                                        |
| Web Clipper 的模板决定页面被存成什么：笔记名、位置、正文格式与一组属性（名称、值、类型）；变量、过滤器与逻辑填充值；可按 URL（前缀或正则）或 schema.org 数据自动选用模板                                          | 类型预设是它最小的对应物；变量语言与触发器不做（[Q-10](validation.md)）                                                   | [Templates](https://obsidian.md/help/web-clipper/templates)、[Variables](https://obsidian.md/help/web-clipper/variables)                 |
| 默认模板的属性是 title、source、author、published、created、description、tags；设置里有一张属性类型表（名称、类型、默认值、使用数），`tags` 固定为多值文本，没有被引用的属性类型才能删除                          | 内置属性、注册表、使用数与“删除未使用”照此设计                                                                            | 源码 [obsidianmd/obsidian-clipper](https://github.com/obsidianmd/obsidian-clipper) 的 `template-manager.ts`、`property-types-manager.ts` |
| Highlighter 可在页面上高亮文字与元素，高亮被保存，回访页面时可见；有专门的页面查看与搜索，可导出为 JSON                                                                                                           | AnnHub 不在网页上高亮：高亮在库里读剪藏时完成，与剪藏同库                                                                 | [Highlighter](https://obsidian.md/help/web-clipper/highlight)                                                                            |
| 默认不下载图片，笔记里链接到网页上的图片地址，离线或链接失效后看不到；可以事后用 Obsidian 的命令“Download attachments for current file”下载                                                                       | 剪藏同样保留原图地址、不下载（[capture.md §3.1](capture.md)），需要画面时用截图；截图保存处理后的图片字节，导出时一并带走 | [Clip web pages](https://obsidian.md/help/web-clipper/capture)                                                                           |
| Interpreter 用用户选择的模型服务商运行自然语言提示，官方提示有成本与隐私考虑                                                                                                                                      | AnnHub 不做 AI 功能（[product.md §2.3](product.md)）                                                                      | [Variables](https://obsidian.md/help/web-clipper/variables)                                                                              |
| 官方称内容保存在本地库、不收集使用数据，代码开源                                                                                                                                                                  | 本地优先不是差异化，是门槛                                                                                                | [Web Clipper](https://obsidian.md/help/web-clipper)                                                                                      |

### 4.3 区块与元素的指认：现有做法与页面抽样

核对于 2026-10-08。下表取自 Obsidian Web Clipper 的帮助文档与源码（`main` 分支）和它使用的提取库 Defuddle 的源码；页面抽样是我们自己用脚本做的，方法见表后。

| 事实                                                                                                                                                                                                                                                                                                                                       | 对 AnnHub 的含义                                                                                                      | 来源                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Highlighter 是显式模式：用工具栏图标、快捷键（默认 `Alt+Shift+H`，macOS 为 `Opt+Shift+H`）或右键菜单打开，同样的方式退出；模式里选中的文字、图片和元素都进入高亮，页面里的链接被临时禁用                                                                                                                                                   | 区块入口不要求先进入模式，但保留键盘模式作为等价路径（[capture.md §6.2](capture.md)）                                 | [Highlighter](https://obsidian.md/help/web-clipper/highlight)、[Clip web pages](https://obsidian.md/help/web-clipper/capture)、源码 `src/utils/highlighter.ts` |
| 模式里一次点击就高亮整块，只对 `figure`、`picture`、`img`、`table`、`pre` 生效；含文字的块（段落、标题）不能点，要用选区                                                                                                                                                                                                                   | 整块点击最有价值的是难以选中的单元：代码块、表格、图；段落走选区剪藏                                                  | 源码 `src/utils/highlighter.ts`、`src/utils/highlighter-overlays.ts`                                                                                           |
| 保存什么的优先级是：自定义模板，其次选区，其次高亮；都没有时默认提取页面主体；`Ctrl/Cmd+A` 可选中整页                                                                                                                                                                                                                                      | 整篇文章是剪藏工具最常见的对象；AnnHub 把它放在区块层级的最外一层，而不是另设“整页”命令                               | [Clip web pages](https://obsidian.md/help/web-clipper/capture)                                                                                                 |
| Defuddle 对常见站点有专门的提取器：X（含长文）、Medium、Substack、Reddit、GitHub、Hacker News、Mastodon、Bluesky、Threads、LinkedIn、YouTube、Wikipedia 等。X 的提取器依赖 `article[data-testid="tweet"]`、`User-Name`、`tweetText`、`tweetPhoto`、`card.wrapper`，永久链接取自 `time` 外面的链接；源码注释写明通用提取在 X 上“产出不可用” | 帖子需要专门规则，不能指望通用识别；平台规则集中维护、逐个追加（[capture.md §5](capture.md)）                         | [defuddle](https://github.com/kepano/defuddle) 源码 `src/extractors/`                                                                                          |
| Medium 的提取器先清掉 `article` 里的界面再转换：互动按钮（Clap、Bookmark、Share、Response）、作者头像与阅读时长、会员与订阅提示、相关文章预览、“Press enter or click to view image in full size”这类界面文字                                                                                                                               | Medium 的 `article` 里混着界面；转成 Markdown 之前必须先去掉按钮、工具栏、订阅与推荐（[capture.md §3.1](capture.md)） | [defuddle](https://github.com/kepano/defuddle) 源码 `src/extractors/medium.ts`                                                                                 |
| 通用提取靠一张有序的入口选择器清单找正文（`#post`、`.post-content`、`.entry-content`、`.markdown-body`、`article`、`[role=article]`、`main` 等，最后是 `body`），并用文字量判断段落：不少于 7 个词、有句末标点、链接文字不超过七成                                                                                                         | 博客引擎常用类名而不是语义标签，识别不能只认 `article`；文字量不能按词数算，中文要按字符数                            | [defuddle](https://github.com/kepano/defuddle) 源码 `src/constants.ts`、`src/content-boundary.ts`                                                              |

**页面抽样**（2026-10-08，无头 Chromium 153，视口 1280×900，只读 DOM）：抽样 41 个页面，33 个可评估（正文 `<p>` 段落不少于 5 个）：技术文档 20（MDN、React、Docusaurus、MkDocs Material、Rust 手册、Next.js、GitHub README、Sphinx、VitePress、Tailwind、Effective Go、Kubernetes、PostgreSQL 手册、GitHub Docs，以及 Anthropic 与 OpenAI 的各 3 页）、Medium 1、英文个人博客 8、中文博客 4（阮一峰、少数派、美团技术团队、博客园）。其余 8 个未计入：Claude Code 文档的 2 页正文主要是表格、列表和代码，几乎没有 `<p>`（下文单列）；Paul Graham 的 2 个页面没有 `<p>`；Medium 的 2 个页面（一个渲染成空页，一个没有取到文章链接）；Joel on Software 返回 403，酷壳返回 500。X 对无头浏览器返回 403，没有抽样，它的结构以上表为准。“正文段落”指中文不少于 25 个字符、其他不少于 60 个字符的 `<p>`，统计它被哪一层容器包住；字数按**可见文字**计，隐藏的标签页不算。

| 识别规则                                                      | 能包住页面里 75% 以上正文段落的页面数 |
| ------------------------------------------------------------- | ------------------------------------- |
| 只认语义容器：`article`、`[role=article]`、带标题的 `section` | 20 / 33                               |
| 再加 `main` 与上表的常见内容容器                              | 30 / 33                               |
| 再加文字密集的容器（直接包含至少三个有文字量的段落）          | 32 / 33                               |

其他发现：

- **只认语义容器会漏掉近四成的页面**（13 / 33）：Rust 手册、VitePress、Kubernetes、GitHub Docs、Dan Luu、美团技术团队、博客园、Anthropic 的 API 参考页只有 `main` 或类名容器；Martin Fowler 与阮一峰只有一部分段落在 `article` 或带标题的 `section` 里。加上 `main` 与常见类名后，仍识别不到的是 Simon Willison 的博客（全是 `div`）、Tailwind 与 PostgreSQL 手册（没有 `main`），它们要靠“文字密集的容器”。Paul Graham 的文章是表格布局、没有 `<p>`（不在 33 个之内），任何规则都识别不到，这类页面只能用选区剪藏。
- **整篇文章是很高的一块**：按“再加 `main` 与常见内容容器”这一档统计，27 / 33 个页面里包住正文段落的容器高于 1.2 个视口，容器高度的中位数约 8.4 个视口。35 个整篇正文（33 个可评估页面，加 Claude Code 文档的 2 页）的可见字符数中位约 1.2 万，3 个超过 5 万（Effective Go 约 10 万、Overreacted 约 6.3 万、Claude Code 的 Hooks 页约 21 万），另有 4 个在 4 万到 5 万之间（Anthropic 的 Prompt caching 页约 4.3 万、Martin Fowler、Simon Willison、Dan Luu）。
- **“带标题的一节”常常不是一个元素**：20 个技术文档页里有 12 个（React、Docusaurus、MkDocs Material、GitHub README、VitePress、Tailwind、Effective Go、Kubernetes、PostgreSQL 手册、Anthropic 的 3 页）没有包住各节的带标题 `section`，各节是平铺的标题与段落；MDN、Sphinx、Next.js 的有。这些页面的标题基本都有 `id`，可以拼出一节自己的链接。
- **代码块右上角常有页面自己的“复制”按钮**：Docusaurus、MkDocs Material、VitePress 的样本里，8 / 8 个代码块都有；Anthropic 的压在代码块右上角外沿，OpenAI 的在代码块上方的标题栏里。
- **MDN 的代码示例全部在 open shadow root 里**：10 个 `mdn-code-example`，普通 DOM 里的 `pre` 为 0；只在普通 DOM 里找会漏掉。
- **Medium 的文章页是一个包住全文的 `article`**：只有 1 个页面可评估，样本很小；它的界面混在 `article` 里，转换前要先去掉（上表 Defuddle 的 Medium 提取器）。

**Anthropic 与 OpenAI 的文档**（同一天抽样）：

| 站点                                              | 正文容器                                                                  | 代码块与“复制”按钮                                                 | 标签页与隐藏内容                                                                                                                                         | 对 AnnHub 的含义                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Anthropic API 指南（platform.claude.com/docs）    | `article`；标题都有 `id`，各节平铺                                        | `pre`；复制按钮压在代码块右上角外沿                                | 多语言示例放在标签页里，不显示的页签在 DOM 里是隐藏的；Prompt caching 页可见约 4.3 万字符，DOM 里约 6.0 万                                               | 文章、一节、代码块都能识别；胶囊避让右上角；转换只取当前页签                           |
| Anthropic API 参考（同站 `/docs/en/api/`）        | 只有 `main`；正文多是 `span` 与 `p`                                       | 这类页面里没有 `pre` 形式的代码块                                  | 可见约 3.9 万字符，DOM 里约 9.8 万                                                                                                                       | 靠 `main` 识别文章；一节靠标题切分                                                     |
| Claude Code 文档（code.claude.com/docs）          | `main`；正文主要在表格、列表和代码里，`<p>` 很少；标题都有 `id`，各节平铺 | `pre`（语法高亮）；Hooks 页有 97 个可见代码块、75 张表格           | 隐藏的页签多：概览页 DOM 里约 4.4 万字符，可见只有约 0.5 万；Hooks 页可见约 21 万字符                                                                    | `main` 规则就能识别；表格与代码块是主要的区块；整页超过字数上限时建议改选一节          |
| OpenAI API 文档（developers.openai.com/api/docs） | `article#mainContent`；标题都有 `id`                                      | `pre`；复制按钮在代码块上方的标题栏里，距代码块上沿约 33px，右对齐 | 每个示例的各语言版本都在 DOM 里，只有一个可见：Function calling 页 94 个 `pre` 里只有 23 个可见；Structured outputs 页 DOM 里 50 多万字符，可见约 2.6 万 | 文章、一节、代码块都能识别；转换必须丢弃隐藏内容，否则一页会膨胀二十倍；胶囊避让标题栏 |

**抽样页面清单**（41 个；† 是列表页，取页内第一篇文章；“未计入”见上文）：

- 技术文档：[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write)、[React](https://react.dev/learn/managing-state)、[Docusaurus](https://docusaurus.io/docs/markdown-features/code-blocks)、[MkDocs Material](https://squidfunk.github.io/mkdocs-material/reference/code-blocks/)、[Rust 手册](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html)、[Next.js](https://nextjs.org/docs/app/getting-started/layouts-and-pages)、[GitHub README](https://github.com/microsoft/playwright/blob/main/README.md)、[Sphinx](https://requests.readthedocs.io/en/latest/user/quickstart/)、[VitePress](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)、[Tailwind](https://tailwindcss.com/docs/flex)、[Effective Go](https://go.dev/doc/effective_go)、[Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/)、[PostgreSQL 手册](https://www.postgresql.org/docs/current/indexes-types.html)、[GitHub Docs](https://docs.github.com/en/get-started/start-your-journey/about-github-and-git)。
- Anthropic 与 OpenAI 的文档：[Anthropic 概览](https://platform.claude.com/docs/en/build-with-claude/overview)、[Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[Messages API 参考](https://platform.claude.com/docs/en/api/messages)、[OpenAI Text](https://developers.openai.com/api/docs/guides/text)、[Function calling](https://developers.openai.com/api/docs/guides/function-calling)、[Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)；未计入的 Claude Code 文档：[概览](https://code.claude.com/docs/en/overview)、[Hooks](https://code.claude.com/docs/en/hooks)。
- Medium：[Abramov](https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367)；未计入：[Karpathy](https://medium.com/@karpathy/software-2-0-a64152b37c35)、[Netflix 技术博客](https://netflixtechblog.com/)†。
- 英文个人博客：[Overreacted](https://overreacted.io/a-complete-guide-to-useeffect/)、[Dan Luu](https://danluu.com/p95-skill/)、[Julia Evans](https://jvns.ca/blog/2024/11/18/how-to-import-a-javascript-library/)、[Martin Fowler](https://martinfowler.com/articles/microservices.html)、[Simon Willison](https://simonwillison.net/2024/Dec/31/llms-in-2024/)、[Ghost](https://www.ghost.org/changelog/)†、[WordPress.org](https://wordpress.org/news/)†、[Substack（Lenny）](https://www.lennysnewsletter.com/archive)†；未计入：[Paul Graham](https://paulgraham.com/greatwork.html)、[Paul Graham 文章列表](https://paulgraham.com/articles.html)†、[Joel on Software](https://www.joelonsoftware.com/2000/08/09/the-joel-test-12-steps-to-better-code/)。
- 中文博客：[阮一峰](https://www.ruanyifeng.com/blog/2024/12/weekly-issue-330.html)、[少数派](https://sspai.com/post/90191)、[美团技术团队](https://tech.meituan.com/)†、[博客园](https://www.cnblogs.com/)†；未计入：[酷壳](https://coolshell.cn/articles/21140.html)。

### 4.4 截图的输出与美化

核对于 2026-10-08，取自各产品的官方页面与 MDN。

| 产品        | 官方页面列出的相关能力                                                                                                                                                                                 | 对 AnnHub 的含义                                                                                           | 来源                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| CleanShot X | 背景工具：加背景、调内边距与对齐、改画布比例，自带 20 个背景、可加自己的背景、存为预设，“自动平衡”调整内容四周的留白；裁剪工具可指定宽高比并吸附边缘；截图后的浮层可直接复制、保存、标注或拖进其他应用 | 背景、留白、画布比例、预设是这类工具成对出现的最小集合；复制是一级动作；裁剪时锁定宽高比是标配             | [All features](https://cleanshot.com/features) |
| Xnapper     | 自动平衡、自动背景色、自定义渐变或图片背景、社交媒体尺寸与比例、预设、自动遮挡敏感信息（邮箱、银行卡、IP 地址、API 密钥）、压缩输出；免费使用但带水印，一次性付费去除水印                              | 自动遮挡敏感信息已是同类的卖点，对应 AnnHub 的 DOM 匿名与马赛克；水印可以是产品自己的，AnnHub 只做用户署名 | [xnapper.com](https://xnapper.com)             |
| Shottr      | 渐变背景、阴影和圆角；标注、像素化、滚动截图、OCR                                                                                                                                                      | 美化的最小集合是背景、阴影与圆角                                                                           | [shottr.cc](https://shottr.cc)                 |
| Pika        | Chrome 扩展快速截取；加外框、改背景、标注、预设；按社交媒体的尺寸导出；有设备样机、推文与代码模板；每月 15 美元                                                                                        | 样机与模板属于设计工具这一档，不是资料工具                                                                 | [pika.style](https://pika.style)               |
| Shots       | 设备样机、背景、动画与视频缩放                                                                                                                                                                         | 同上                                                                                                       | [shots.so](https://shots.so)                   |

写入剪贴板：浏览器扩展用 `navigator.clipboard`，只在安全上下文（https 与本机）里可用，扩展的内容脚本在 `http:` 页面上用不了；写入通常要求用户刚做过操作，声明 `clipboardWrite` 后则不需要（[MDN：Interact with the clipboard](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard)）。我们在 Chromium 153 里用一个不声明任何权限的未打包扩展验证：内容脚本在 https 页面和 `http://127.0.0.1` 上把 PNG 写进了剪贴板；在 `http://example.com` 上 `navigator.clipboard` 不存在。Chrome 的权限列表写明 `clipboardWrite` 会在安装时显示“Modify data you copy and paste”（[Permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)）。含义：复制图片不需要 `clipboardWrite`，也就不多这一条警告；`http:` 页面上改为提示下载（[permissions.md §4](permissions.md)）。

### 4.5 同一界面的不同状态：重复截取

核对于 2026-10-08。要把同一个界面在不同状态下截成取景完全一致的几张图（切换套餐周期、主题、语言），手动框选做不到：每次起止点都差几个像素。

| 事实                                                                                                                                                                                               | 对 AnnHub 的含义                                                                           | 来源                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| CleanShot X 的 All-In-One 模式可以指定尺寸、锁定宽高比，并保存上一次的选区，方便重拍                                                                                                               | 桌面工具重拍的是屏幕矩形；浏览器里页面一滚动，同一个屏幕矩形框住的就是另一块内容（见下表） | [All features](https://cleanshot.com/features)         |
| 智谱套餐页（bigmodel.cn/glm-coding，个人套餐）：切换“连续包月 / 包季 / 包年”时价格就地更新，切换条、卡片列表和三张卡片还是同一批节点，外框恒为 1200×652 CSS 像素，没有过渡动画；悬停卡片不改变外框 | 元素可以做取景框的锚点，页面状态切换前后锚点不变，尺寸不变                                 | 2026-10-08 在 Chromium 153（1440×900，2 倍像素比）测得 |
| 从卡片里的价格行选到包含切换条与三张卡片的容器，要向上经过 4 层父元素，其中 1 层与它的下一层外框完全相同                                                                                           | “选上一级”要跳过外框相同的层级，否则要多按好几下才有变化                                   | 同上                                                   |

同一个页面、三种状态，三种取景方式的结果：

| 取景方式                                                 | 三张图的像素尺寸                | 与第一张相比                                                   |
| -------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| 元素外框向四周外扩 24 CSS 像素                           | 2496×1400、2496×1400、2496×1400 | 只有切换条与价格文字不同；最外圈 48 像素环里 0 个像素不同      |
| 手动框选（起止点各带 ±3 CSS 像素的误差）                 | 2494×1392、2494×1390、2498×1402 | 尺寸各不相同，无法逐像素对比                                   |
| 记住第一张的屏幕矩形，第二、三张前页面多滚了 37 CSS 像素 | 2496×1400、2496×1400、2496×1400 | 41% 的像素不同，最外圈里 18,163 个像素不同：框住的是另一块内容 |

含义：重拍要靠元素做锚点，而不是靠屏幕位置；边距由用户选定的数值决定，不由手决定（[screenshot.md §1.4](screenshot.md)）。

## 5. AnnHub 的位置与短板

### 5.1 路线对比

| 路线           | 谁整理                                                   | 去哪里                            | 代表                   |
| -------------- | -------------------------------------------------------- | --------------------------------- | ---------------------- |
| 存进本地笔记库 | 用户用模板与属性整理                                     | 本地 Markdown 文件，需要 Obsidian | Obsidian + Web Clipper |
| 云端高亮与回顾 | 服务汇总，用户打标签与写笔记                             | 云服务，可导出                    | Readwise               |
| **AnnHub**     | 采集时自动带来源、语境与页面元数据，用户用类型化属性分类 | 浏览器内的本地库，可导出 Markdown | —                      |

### 5.2 短板与退出条件

| 短板                     | 对手现状                                    | AnnHub 的态度                             | 何时重新评估                                             |
| ------------------------ | ------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- |
| 没有手机端               | 多数对手有移动端                            | 刻意不做（[product.md §2.2](product.md)） | 阶段 V 的访谈中频繁出现                                  |
| 没有 PDF 与电子书来源    | Readwise 多来源                             | 暂不做（[roadmap.md §3](roadmap.md)）     | [H-15](validation.md) 未通过                             |
| 没有导入                 | 对手多支持从其他工具导入                    | 暂不排期（[Q-05](validation.md)）         | 冷启动问题在阶段 V 的访谈中频繁出现                      |
| 没有协作                 | Capacities 等支持共享                       | 刻意不做                                  | 用户明确提出共享需求                                     |
| 没有整页剪藏与模板触发器 | Obsidian Web Clipper 提供                   | 暂不做（[Q-10、Q-11](validation.md)）     | 阶段 V 的访谈中频繁出现                                  |
| 没有网页上的高亮标记     | Obsidian Web Clipper 的 Highlighter 提供    | 刻意不做：高亮在库里完成                  | [H-19](validation.md) 未通过，或伙伴频繁要求在页面上标记 |
| 没有 AI 功能             | Web Clipper 的 Interpreter、Capacities 提供 | 刻意不做（[product.md §2.3](product.md)） | 无                                                       |

## 6. 来源与复核

- 复核方法：逐项打开第 3 节和第 4.2 节的官方页面与来源，核对价格、限额和功能描述，更新核对日期。第 4.3 与 4.5 节的页面抽样和验证用无头浏览器重跑同样的页面，对照数字；页面改版会让个别数字变化，只看结论是否仍成立。
- 第三方比较文章多出自竞品厂商，只用于发现候选，不作为事实依据。
- 任何用于对外页面的对比表述，必须出自本文并带核对日期（[website.md §13](website.md)）。
