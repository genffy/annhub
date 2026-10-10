# 官网的 SEO 与 GEO

> 层级：website
> 状态：官网被搜索引擎与 AI 搜索发现、理解和引用的目标契约
> 更新：2026-10-11

本文规定官网在传统搜索（SEO）与生成式 AI 搜索（GEO）里的技术契约、内容写法和衡量方式。页面的信息架构与文案以 [website.md](website.md) 为准，产品定义以 [product.md §1](product.md) 为准，官网收集的访问数据以 [permissions.md §8](permissions.md) 为准，指标口径以 [metrics.md §11](metrics.md) 为准，搜索与 AI 平台的外部事实见 [market.md §4.6](market.md)。交付状态只看 [roadmap.md](roadmap.md)；待定的决策、假设与问题在 [validation.md](validation.md)。

## 1. 原则

1. **先是好页面**：Google 把面向生成式 AI 搜索的优化视为 SEO 本身，不要求专门的标记、文件或写法（[market.md §4.6](market.md)）。页面写给读者：原创、具体、结构清楚；不为 AI 另写一版，不把段落拆碎，不堆砌关键词。
2. **真实先行**：只描述有实现依据的能力；不为覆盖关键词写入 [product.md §2.3](product.md) 不做清单里的能力；不用“唯一”“最先进”“永不丢失”这类绝对化说法（[website.md §9](website.md)）。不制造评价、提及或链接。
3. **文字同源**：结构化数据、社交卡片和 `llms.txt` 里的文字取自页面的文案（可见文本与第 3.3 节的标题、描述），不另写；页面文案改了，这些位置一起改。对竞品的描述出自 [market.md](market.md) 并带核对日期，market.md 复核后日期一起更新。
4. **爬虫与访客看到同一份页面**：核心内容在构建时生成为语义化 HTML，不依赖脚本（第 4.3 节）；不对爬虫返回不同的内容，不用隐藏文字。
5. **隐私友好**：统计不用 Cookie，欧洲访客同意后才统计；不接入广告、跨站追踪或营销脚本（[permissions.md §8](permissions.md)）。
6. **低成本**：用托管平台、CDN 和站长平台自带的免费能力，不为 SEO 或统计引入新服务或付费套餐。

## 2. 阶段

| 阶段 | 开始条件                                                                              | 范围                                                                                     |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 基础 | 随时，随新版官网上线                                                                  | 第 3、4、6 节；第 5.1 节的 `FAQPage`；第 7.1 节的访问统计                                |
| 增长 | 扩展可从商店公开安装（[roadmap.md §6](roadmap.md)；商店条目见 [Q-14](validation.md)） | 第 5.2 节的 `SoftwareApplication`、第 5.4 节的 `llms.txt`；第 7 节的站长平台、探针与迭代 |

公开安装之前，页面可以被收录，但不主动提交、不跑探针：访客来了也无处安装。单页之外是否建对比页、用例页和指南页见 Q-18。

## 3. 技术契约

### 3.1 地址

- 站点只有一个主机 `https://annhub.org`：`www` 永久跳转到它；地址不带结尾斜杠，带斜杠的永久跳转到不带的。
- 页面是两个语言版本 `/zh-CN` 与 `/en`。根路径 `/` 按浏览器语言跳到匹配的版本，都不匹配时跳到 `/en`；它本身不是页面。新增页面同样带语言前缀，两个版本成对出现。
- 两个法律页 `/privacy-policy.html`、`/terms-of-service.html` 中英同页；去掉 `.html` 的地址显示同一页，规范地址是带 `.html` 的那个。
- 不存在的地址返回 404 状态。平台默认子域名等其他主机名上的副本，靠规范地址归并。

### 3.2 规范地址与语言版本

- 每个页面的规范地址（canonical）是它自己的绝对地址。
- 语言版本只在 HTML 里声明一次：每个语言页列出自己、另一个语言页和 `x-default`。`x-default` 指向 `/en`，与根路径的回退一致：浏览器语言既不是中文也不是英文的访客，读英文的可能性远大于中文。站点地图与 HTTP 响应头里不重复声明：三种方式对 Google 等价，同时使用没有好处，只多一处可能不一致（[market.md §4.6](market.md)）。
- `<html lang>` 与页面语言一致；语言切换是指向另一个语言页的普通链接，带 `hreflang`。
- 法律页只有一个规范地址，不声明语言版本。

### 3.3 标题、描述与社交卡片

- 每个语言页有自己的标题和描述。标题以 AnnHub 开头，后接 [website.md §4](website.md) 的第一句；描述按第 4.1 节从产品定义压缩而来。
- 品牌名在标题、`og:site_name` 与 H1 里写法一致。Google 的站点名称结构化数据只认域名根地址，而根路径只做跳转，所以不依赖它（[market.md §4.6](market.md)）。
- 社交卡片：`og:title`、`og:description`、`og:url`（规范地址）、`og:type`、`og:site_name`、`og:locale` 与 `og:locale:alternate`、`og:image` 与 `og:image:alt`；`twitter:card` 为 `summary_large_image`，标题、描述与图片沿用 OG。
- 社交卡片图：中英文各一张，1200×630 像素、300KB 以内，使用绝对地址；画面是产品窗口示意、品牌名与一句定位，使用示例数据并标注为示意（[website.md §10](website.md)）。

### 3.4 `robots.txt`

- 站点自己的 `robots.txt` 写三件事：所有爬虫全部放行；内容信号 `Content-Signal: search=yes, ai-input=yes, ai-train=yes`（第 6 节）；站点地图的地址。不屏蔽渲染页面所需的脚本、样式和图片。
- 对爬虫的偏好只写在这一个文件里。Cloudflare 的 AI 爬虫策略三类都是 Allow，这时它不往文件里写入任何内容（第 6 节）。
- Google 只认 `user-agent`、`allow`、`disallow` 与 `sitemap`，忽略内容信号；Search Console 可能把这一行报为无法识别的语法，不影响抓取（[market.md §4.6](market.md)）。

### 3.5 站点地图

- 地址是 `/sitemap.xml`，列出两个语言页与两个法律页的规范地址；根路径和非规范地址不列。
- `lastmod` 取内容实际变化的日期：语言页取文案或结构化数据最后一次实质改动的日期，法律页取页面上写明的更新日期；不用构建时间。不写 `priority` 和 `changefreq`，Google 忽略它们（[market.md §4.6](market.md)）。

### 3.6 性能

- 门槛是 Google 的“良好”线，移动端与桌面端分别按第 75 百分位计：LCP ≤ 2.5 秒，INP ≤ 200 毫秒，CLS ≤ 0.1。
- 公开安装之前用实验室数据验收：Lighthouse 的移动端配置，两个语言页各测三次取中位数。LCP 与 CLS 用上面的门槛；实验室测不出 INP，改看总阻塞时间（TBT），≤ 200 毫秒（[market.md §4.6](market.md)）。
- 有真实访问之后，以真实用户的数据为准（M-27）。
- 悬停与聚焦只改颜色、背景、阴影这类绘制属性，不改元素尺寸，指针下的内容不跳动。

## 4. 内容

### 4.1 产品定义

对外描述 AnnHub 是什么，都从 [product.md §1](product.md) 的定义压缩或节选，不另写一版：

- 名称写作 AnnHub；提到品类时写作“本地优先的浏览器扩展”（英文 local-first browser extension）。
- 只出现定义里有的能力：剪藏与截图连同来源存进一个本地库；在库里阅读、高亮、加属性；检索、回到来源、导出 Markdown。不加定义里没有的能力、对比或形容词。
- 适用于官网的标题、描述、结构化数据与 `llms.txt`，GitHub 仓库简介与 README，以及商店条目。有长度上限的位置（商店简介不超过 132 个字符）用更短的压缩，规则相同；英文是对应的译文。

### 4.2 写法

页面的说明段落与 FAQ 按读者的问题组织：

1. 第一句直接回答“是什么”或“能不能”。
2. 紧跟两三个可核对的事实，例如“数据保存在浏览器本地的 IndexedDB 与 `chrome.storage`，采集与导出断网可用”。
3. 写明边界，例如“没有云同步与手机端；导出的 ZIP 不能用来恢复 AnnHub 的数据库”。

段落自成一体，脱离上下文也能读懂。这是写给读者的写法，任何搜索引擎也都便于摘取；不为 AI 另写一版或拆碎。FAQ 的问题用访客自己的说法，涉及竞品的答案带核对日期。改写先改 [website.md](website.md)，再改页面。

### 4.3 无脚本可读

构建生成的 HTML 标记里必须有：H1 与 Hero 文案；各板块的标题与说明段落；一周走查每一步的标题与正文；差异化与隐私要点；FAQ 的全部问答（可以折叠，答案仍在标记里）；页脚的法律页与仓库链接。只出现在脚本数据里的文字不算。

可交互的界面示例（资料库示例、走查里的产品画面）可以在浏览器里渲染：它们是示意，不承载页面别处没有的文字；表达信息的画面有替代文字。

## 5. 结构化数据与 `llms.txt`

结构化数据用 JSON-LD，在构建时写进页面，文字与页面一致（原则 3）。没有真实数据的属性不写，也不为消除校验提示补占位值。语法用 Schema.org 的校验工具检查；Google 的富结果测试只用于仍有富结果的类型。

### 5.1 `FAQPage`

问答取自 [website.md §13](website.md) 的全部条目，文字与页面一致，涉及竞品的答案连同核对日期。Google 搜索不展示 FAQ 富结果，它的 AI 功能也不需要专门的标记（[market.md §4.6](market.md)）；保留它是给其他搜索引擎和 AI 读取的语义层，维护成本低。

### 5.2 `SoftwareApplication`（增长阶段）

| 属性                  | 取值                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `name`                | AnnHub                                                                                                   |
| `description`         | 页面的描述（第 3.3 节）                                                                                  |
| `applicationCategory` | `BrowserApplication`                                                                                     |
| `operatingSystem`     | 桌面版 Chromium 内核浏览器，最低版本取自 [permissions.md §5](permissions.md)；不逐个列出浏览器或操作系统 |
| `url`、`installUrl`   | 商店条目页（Q-14）                                                                                       |
| `sameAs`              | 商店条目页与 GitHub 仓库                                                                                 |

不写 `offers`（商业化见 [Q-07](validation.md)），不写 `aggregateRating` 与 `review`（没有真实评价，[website.md §12](website.md)）。Google 的软件应用富结果要求这些属性（[market.md §4.6](market.md)），所以这段标记只作语义层；Search Console 里相应的缺字段提示在预期之内。

### 5.3 不使用的类型

- `HowTo`：页面不是操作步骤。
- `WebSite`：站点名称只认域名根地址，而根路径只做跳转（第 3.3 节）。
- 价格、评分与评价：没有真实数据。

### 5.4 `llms.txt`（增长阶段）

`llms.txt` 是社区提案，不是标准；Google 说明它对 Google 搜索不需要，也不影响排名（[market.md §4.6](market.md)）。它维护成本低，供愿意读取它的 AI 工具使用：

- 位置 `/llms.txt`，英文，格式按提案：H1 写 AnnHub；摘要引用块写英文页的描述；正文写适用人群与核心取舍（本地优先、不改动原网页、类型化属性、Markdown 导出），文字取自英文页；再按二级标题分组列出链接。
- 链接：两个语言页、两个法律页、GitHub 仓库。条目字段、导出格式等契约只给链接，不在这里另写一份。

## 6. AI 爬虫

三类 AI 爬虫全部放行：

| 类别           | 例子（AI 产品的爬虫名单与用途见 [market.md §4.6](market.md)）      | 放行的理由                                                                                       |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 搜索索引       | Googlebot、Bingbot、OAI-SearchBot、Claude-SearchBot、PerplexityBot | 拦住就进不了搜索结果与 AI 回答的引用；Google 的 AI 概览与 AI 模式用的是 Googlebot 建立的搜索索引 |
| 用户触发的抓取 | ChatGPT-User、Claude-User、Perplexity-User                         | 用户在 AI 产品里问到 AnnHub 时，AI 要当场读官网                                                  |
| 模型训练       | GPTBot、ClaudeBot，以及 Google-Extended 这类控制标记               | 官网是写给外界看的产品介绍，不含用户数据；被模型学到，模型不联网时也更可能知道 AnnHub 并描述准确 |

- 内容信号三项都写 `yes`（第 3.4 节）：`search` 是搜索索引与链接、摘录，`ai-input` 是 AI 回答的实时输入（含 AI 生成的搜索摘要），`ai-train` 是训练与微调。
- Search Console 的“Search generative AI”控制保持默认的“包含”。
- Cloudflare 的 AI 爬虫策略（搜索、代理、训练三类）都设为 Allow：Block 会连 Googlebot、Bingbot 这类兼做搜索的爬虫一起拦下，Disallow AI Training 会拦下训练类爬虫，都与本节相反。防火墙规则也不拦截上表的爬虫。AI 爬虫控制只用来看各爬虫的请求记录。
- 每次改 Cloudflare 的设置之后，用 AI 爬虫控制的请求记录确认上表的爬虫仍然放行；增长阶段每月复查（第 7.3 节）。这一层依赖 Cloudflare 代理官网，风险见 RK-15。

## 7. 衡量与迭代

### 7.1 工具

| 工具                     | 用途                                                                         | 接入                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Google Search Console    | 收录、查询词的展现与点击；生成式 AI 功能里的展现；“Search generative AI”控制 | 网域资源，用 DNS 的 TXT 记录验证，站点里不放验证文件                                                                     |
| Bing Webmaster Tools     | 必应的收录与查询词                                                           | 从 Search Console 导入，自动完成验证；可开启 Cloudflare 的 Crawler Hints，用 IndexNow 通知内容变化                       |
| Cloudflare Web Analytics | 访问、来源网站、真实用户的核心网页指标                                       | 页面按访客的选择加载统计脚本（手动嵌入，不由代理注入；[permissions.md §8](permissions.md)）；不用 Cookie；没有自定义事件 |
| Cloudflare AI 爬虫控制   | 各 AI 爬虫的请求与放行状态                                                   | 与第 6 节同一处                                                                                                          |

统计脚本会被广告拦截器拦掉，访问数偏低，只看趋势与构成。站内交互（按钮点击、资料库示例里的操作）不统计：Web Analytics 没有自定义事件，为它另接一套统计不符合原则 6。隐私政策写明官网的统计和访客的选择，统计的范围或规则改变时先改政策（[permissions.md §8](permissions.md)）。

### 7.2 指标

口径与编号在 [metrics.md §11](metrics.md)：M-26 访问与来源（含来自 AI 产品的访问）、M-27 真实用户的核心网页指标、M-28 搜索展现与点击、M-29 AI 搜索提及率。初始判据见 H-22，增长阶段建立基线后校准。

### 7.3 月度检查

1. 站长平台：两个语言页与两个法律页都已收录，没有覆盖错误；记下展现最多的查询词。
2. Cloudflare 的设置（RK-15）：AI 爬虫控制里第 6 节的爬虫没有被拦截的请求，搜索索引类有成功的请求；线上的 `robots.txt` 与第 3.4 节一致，Cloudflare 没有往里写入规则；页面的 HTML 里没有统计脚本，它只由页面在浏览器里按访客的选择插入；从欧洲以外请求语言页，响应写入“不必先问”的 Cookie（[permissions.md §8](permissions.md)），没有就是拿不到国家，所有访客都在被询问。
3. 运行第 7.4 节的探针，结果连同本月的改动记入探针记录。

### 7.4 AI 搜索探针

每月一次。每条提示在每个引擎里各跑 3 次，每次新开会话；能不登录就不登录，必须登录的引擎用一个没有历史与记忆的专用账号。

| 编号 | 类型     | 提示                                                                                                          |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------- |
| AP-1 | 品类推荐 | What are the best local-first browser extensions for clipping web pages and screenshots into one library?     |
| AP-2 | 痛点求助 | How can I take a screenshot in the browser, annotate it and hide personal information before saving it?       |
| AP-3 | 品牌对比 | What are the main differences between AnnHub and Obsidian Web Clipper?                                        |
| AP-4 | 离线需求 | Is there a browser extension for clipping and highlighting web content that works offline without an account? |
| AP-5 | 中文场景 | 推荐几款适合工程师使用的本地网页剪藏与资料库浏览器扩展                                                        |

引擎：ChatGPT（开启搜索）、Perplexity、Claude（开启网页搜索）、Google 的 AI 概览与 AI 模式。AP-5 另在一个中文 AI 搜索里跑，选哪一个见 Q-19。

记录字段：日期、引擎、模型版本、地区、是否登录、是否联网、提示编号、第几次、是否出现 AI 回答、是否提及 AnnHub、是否链接到官网、推荐位次、有无事实错误（有就摘录原句）。没有出现 AI 回答的运行（例如这次没有 AI 概览）不计入分母；所有比例都报告分母。

### 7.5 迭代

```text
信号：高展现、低点击的查询词；探针里 AI 没有提及 AnnHub，或描述有误
  -> 先查：第 6 节的爬虫是否放行，页面是否已收录（第 7.3 节）
  -> 再改：按第 3.3 节调整标题与描述；按第 4.2 节改写对应段落或补 FAQ（先改 website.md）；核对各对外位置的描述（第 4.1 节）
  -> 回收：下一轮探针与站长平台的数据对比；改动与结果记在探针记录里
```
