# AnnHub Website

AnnHub 的公开网站与产品展示页。网站代码位于独立 Next.js 应用中，产品文案以 `docs/product/` 为准。

## 内容真源

实现或修改 Landing Page 前，必须先阅读：

- [网站内容蓝图](../docs/product/website.md)
- [官网的 SEO 与 GEO](../docs/product/seo-geo.md)
- [产品定位](../docs/product/product.md)
- [用户故事与验收](../docs/product/user-stories.md)
- [产品路线图](../docs/product/roadmap.md)

网站不得自行发明：

- 还没有发布的功能（[路线图](../docs/product/roadmap.md) §2 之外的能力）。
- [网站蓝图](../docs/product/website.md)里没有的下载或安装 CTA。
- 未经验证的用户评价或使用人数。
- “完全准确”“永不丢失”等无法证明的绝对承诺。

## 页面定位

网站是稳定的产品介绍页，围绕问题、完整工作流、资料库体验和本地数据边界组织内容。主 CTA「体验资料库」指向站内可交互示例（`#library`），次要 CTA「查看工作流」指向页内的一周走查（`#story`）。页面不展示交付进度；功能表述仍以源码和[路线图](../docs/product/roadmap.md)核对。扩展已在 Chrome 应用商店公开发布；安装入口先写进网站蓝图再实现（[#97](https://github.com/genffy/annhub/issues/97)）。参见[网站蓝图 §14](../docs/product/website.md)。

资料库示例使用内存中的示例数据，刷新后重置。任务入口在窗口上方，点击后让说明与结果保持在视口内。可体验导航、搜索、阅读和高亮；来源与属性供查看，“导出预览”显示 Markdown 示例，不模拟下载成功。未提供交互的筛选、设置、删除与属性编辑不显示成可点击入口。产品窗口保持“界面示意”标注，不能暗示访客已经安装扩展。

## 开发

```bash
cd website
npm ci
npm run dev
```

开发时直接访问 `http://localhost:3001/en` 或 `/zh-CN`。技术栈是 Next.js 16、React 19 和 next-intl 4，Node.js 版本以仓库根目录 `.node-version` 为准。`npm run lint` 直接运行 ESLint。页面在构建时导出成静态文件；本地快速开发用 Next.js，验收路由用下面的静态预览。

`next-env.d.ts` 由 Next.js 自动生成并被 Git 忽略；开发与构建会分别引用 `.next/dev/types` 和 `.next/types`，不手改或提交这个文件。`npm run typecheck` 先运行 `next typegen` 再运行 TypeScript，干净检出也能检查。

`npm run dev` 会即时编译，并在每次请求时重新渲染这个包含大量产品界面元素的页面，因此首访和刷新都比生产构建慢；开发模式的 React 还会为元素记录调用栈。走查区只挂载当前步骤的场景，减少浏览器首次加载的 DOM 和观察器数量。检查访客实际得到的版式、滚动和交互流畅度时，用 `npm run build && npm run start` 看导出的页面。CPU 被别的进程占满时（先看 `uptime` 的负载和活动监视器），开发模式会被放大得更明显。

## 构建

```bash
cd website
npm run build
npm run start
```

构建产物在 `out/`，`npm run start` 用 Wrangler 本地服务这些文件；它不是 Next.js 服务端。两种语言、法律页的别名、静态导航数据和 404 都通过同一份产物验证。`/` 在本地回退到 `/en`；生产的浏览器语言和地区规则需要在真实 Cloudflare zone 验证，本地不能通过伪造请求头模拟 Cloudflare 国家判断。

## 部署

官网由 GitHub Actions 构建，Cloudflare Workers Static Assets 托管。配置、首次上线、凭证权限和回滚见 [cloudflare/README.md](../cloudflare/README.md)。改配置前先读 [AGENTS.md「联动一致性」](../AGENTS.md#联动一致性强制)。

- **一次构建**：CI 的 website 任务检查类型、Lint，生成静态文件并在 Wrangler 中检查路由；main 的生产产物以提交 SHA 命名、保留一天。`ci-pass` 成功后，部署任务下载同一次运行的产物，核对 SHA，上传并检查线上版本，不重新构建。
- **部署开关**：仓库变量 `CLOUDFLARE_DEPLOY_ENABLED=true` 才启用自动发布。PR、合并队列、手动 CI 和扩展发布标签都只验证，不发布官网。部署使用标准 Linux runner，并串行执行；轮到发布时已被 main 新提交取代的任务会跳过。
- **纯静态边界**：`next.config.js` 的 `output: 'export'`、`wrangler.json` 的 `assets.directory` 与 CI 上传目录一致。Wrangler 没有 `main` 脚本、不使用 `run_worker_first`，没有 Next.js 运行时、图片处理或请求函数。
- **路径**：静态别名和响应头由 [scripts/website-static.mjs](../scripts/website-static.mjs) 在构建后写入产物。`/en`、`/zh-CN`、两种法律页地址可直接访问，未知路径返回 404。`html_handling` 为 `none`，避免平台自动去掉法律页规范地址的 `.html`。站内链接始终用路径；生产地址的内容真源是 `lib/site.ts`，法律页 canonical 和 robots 的 Sitemap 同步核对。
- **语言选择**：生产根路径先读有效的 `NEXT_LOCALE` 会话 Cookie，否则按 Cloudflare 已按权重排序的浏览器首选语言选择：`zh` 和 `zh-*` 到中文，其余与未知语言到英文。最高优先级是不支持的语言时回退英文，不扫描较低优先级的语言。中文根请求由 URL Transform Rule 改写到内部跳转路径，再由静态重定向发出 302，保留查询参数；跳转响应不缓存。语言切换用完整页面导航，以便响应规则更新会话 Cookie。
- **统计**：`cloudflare/production.json` 是生产 `NEXT_PUBLIC_*` 构建变量的唯一来源。普通 `npm run build` 不读取它；main 使用 `npm run build -- --production`。站点令牌是公开值，密钥不得写进这个文件。没有令牌就不加载统计、不写地区 Cookie、不显示同意卡片；本地可显式传入测试令牌。
- **地区与缓存**：页面 HTML 对所有人相同。带统计的静态响应先清除地区标记，Cloudflare 响应头规则在无需先询问的国家覆盖为 `annhub-region=outside`；没有国家规则的主机默认先问。国家集合直接来自 `lib/consent.ts`，不维护第二份清单。地区规则先执行，语言 Cookie 规则追加执行，避免互相覆盖。Cloudflare Web Analytics 使用手动嵌入，禁止代理自动注入；AI 爬虫策略仍按 [seo-geo.md §6](../docs/product/seo-geo.md) 配置。

本地路由验收（先启动静态预览）：

```sh
WEBSITE_SMOKE_ORIGIN=http://localhost:3001 node ../scripts/smoke-website.mjs --local
```

修改静态部署链路时同时更新一致性断言及测试。`npm run verify`、官网构建和上述路由验收是最低验证；首次生产上线还需确认地区 Cookie、语言协商、www 跳转和生产 SHA。

## 设计与代码结构

视觉来自 [设计稿](../docs/design/README.md)：设计稿的范围边界写明官网不在稿内，所以官网沿用它的令牌和界面零件，内容与结构仍以 [网站蓝图](../docs/product/website.md) 为准。

```text
app/[locale]/globals.css          设计令牌（亮色；.theme-dark 为暗色）与基础样式，令牌取自设计稿 css/tokens.css
lib/copy/                         中英文文案。types.ts 是唯一的结构，zh-CN.ts 与 en.ts 逐项对应，缺一项就编译失败
lib/site.ts                       生产域名（只给爬虫读的地址用）与统计令牌
lib/consent.ts                    什么时候加载统计、哪些国家先问：纯函数，utils/__tests__/website-consent.test.ts 覆盖
app/sitemap.ts                    站点地图：两个语言页与两个法律页
public/robots.txt                 全部放行、内容信号与站点地图的地址
components/landing/               页面的各个区块（hero、问题、三种方式、走查、资料库、取舍、隐私、FAQ、收束）与统计同意卡片
components/product/               扩展界面的复刻：选区菜单、剪藏提示、区块胶囊、截图、资料库、阅读视图与高亮、属性、导出
components/product/product-*.css  从设计稿 css/ui.css、css/ext.css 移植，类名统一加 ah- 前缀，不与 Tailwind 冲突
components/product/sample.ts      示例数据，取自 docs/product/examples.md 的一周走查，来源是中性域名
```

- **界面复刻不是截图**。设计稿里的界面用 React 和 CSS 重画，页面上标注“界面示意”。真实构建的截图（[蓝图 §16](../docs/product/website.md)）就绪后再替换；替换前不要把它们描述成公开构建的截图。
- **站点地图的日期跟着内容走**：语言页的 `lastmod` 取 `lib/copy/*` 里的 `meta.updated`，文案或结构化数据有实质改动时改成当天；法律页取页面上写明的更新日期（[seo-geo.md §3.5](../docs/product/seo-geo.md)）。
- **界面里的字符串跟扩展一致**：`lib/copy/*` 里的 `ui` 取自扩展的 `utils/ui-text.ts`，设计稿或扩展改了文案，这里同步。
- **设计稿变了，先改移植的那份 CSS 和组件**，再看页面。选区菜单、剪藏胶囊这类浮层锚定在被选中的文字或区块上，不写死像素，字体回退或换行变了也不会错位；必须按像素摆放的场景（整个截图会话、整张浏览器窗口）用 `Fit` 缩放。
- **悬停和聚焦只改外观，不改尺寸**。设计稿用固定的 `.hov` 类画“悬停中”的静态状态，移植成真正的 `:hover` 时，如果靠 `display` 让操作按钮出现，就多出一列、文字重新换行，那一行和它下面所有行的高度都会在指针下变化。条目行的操作区始终占位，隐藏时只改 `visibility`；`:hover`、`:focus` 规则只能改背景、颜色、阴影这类绘制属性，`utils/__tests__/website.test.ts` 核对这一点。
- **页内锚点平滑滚动，换页不滚动画**。`globals.css` 给 `html` 设了 `scroll-behavior: smooth`，所以 `layout.tsx` 的 `<html>` 要带 `data-scroll-behavior="smooth"`。有它，Next 在换页（语言切换）时临时关掉平滑滚动，新页面直接停在顶部；没有它，新页面会用约 1 秒的动画从原来的位置滑回顶部，开发时控制台还会警告。同一个测试核对两处一致。
- 产品窗口圆角不超过 8px；不用渐变球、发光背景和玻璃拟态；紫色只作品牌与操作强调（[蓝图 §5](../docs/product/website.md)）。
- 页面主 CTA 统一为“体验资料库”，各入口都指向站内示例。
- 手机顶栏保留主 CTA。走查在窄屏用 `StoryFocus` 展示原尺寸的关键局部，在宽屏展示完整窗口；两者复用同一份示例数据与产品零件。静态场景的内部内容设置 `inert`，替代文字留在外层，键盘只进入真正可操作的控件。
- 问题区与取舍区采用紧凑条目，功能区每项只展示一个主要动作。资料库文案按“搜索、阅读、找回”等用户任务组织。
- 不展示未经验证的评价和使用人数，不写“完全准确”“永不丢失”这类无法证明的承诺。
- 对其他产品的对比只写在 FAQ 里，并带 [market.md](../docs/product/market.md) 的核对日期。

**渲染方式**：两个语言的页面在构建时预渲染成静态 HTML。`app/[locale]/layout.tsx` 和 `page.tsx` 里的 `setRequestLocale(locale)` 就是为此而写：去掉它，next-intl 会去读请求头，页面退回按请求渲染。客户端边界包括 `Fit`（缩放像素定位的场景）、`StoryStepper`（步骤切换，只挂载当前画面）、`TourWindow`（接近视口时加载 `LibraryTour`，加载前后复用 `TourControls` 保持说明可读）、`LibraryTour`（操作只影响内存中的示例）、`AnalyticsConsent`（需读取 Cookie 和本地存储）和 `AnalyticsSettings`（页脚的统计设置）。

**验证**：`npm run lint`、`npm run typecheck`、`npm run build`；官网的单测在仓库根目录的 `utils/__tests__/website*.test.ts`，随根目录的 `npm test` 运行。涉及版式的改动，用真实浏览器在 390、820、1024、1280、1440 和 1920 宽度各看一遍，中英文都看；只看一个宽度会漏掉场景缩放和英文长文案带来的问题。

交互回归：构建并启动静态预览后，在仓库根运行 `WEBSITE_SMOKE_ORIGIN=http://localhost:3001 node scripts/check-website-ui.mjs`。它用 Playwright 检查中英文六种宽度的任务结果是否在视口内、手机工作流是否保留原尺寸文字，以及搜索、高亮、导出预览和键盘焦点；截图目视检查仍需另做。
