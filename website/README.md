# AnnHub Website

AnnHub 的公开网站与产品展示页。网站代码位于独立 Next.js 应用中，产品文案以 `docs/v2/` 为准。

## 内容真源

实现或修改 Landing Page 前，必须先阅读：

- [网站内容蓝图](../docs/v2/website.md)
- [官网的 SEO 与 GEO](../docs/v2/seo-geo.md)
- [产品定位](../docs/v2/product.md)
- [用户故事与验收](../docs/v2/user-stories.md)
- [产品路线图](../docs/v2/roadmap.md)

网站不得自行发明：

- 尚未进入路线图的功能。
- 尚无公开可用目标的下载或安装 CTA。
- 未经验证的用户评价或使用人数。
- “完全准确”“永不丢失”等无法证明的绝对承诺。

## 页面定位

网站是稳定的产品介绍页，围绕问题、完整工作流、资料库体验和本地数据边界组织内容。主 CTA「体验资料库」指向站内可交互示例（`#library`），次要 CTA「查看工作流」指向页内的一周走查（`#story`）。页面不展示交付进度；功能表述仍以源码和[路线图](../docs/v2/roadmap.md)核对。公开构建可用之前没有下载入口。参见[网站蓝图 §14](../docs/v2/website.md)。

资料库示例使用内存中的示例数据，刷新后重置。产品窗口保持“界面示意”标注，不能暗示访客已经安装扩展。

## 开发

```bash
cd website
npm ci
npm run dev
```

默认开发地址为 `http://localhost:3001`，具体端口以 Next.js 启动输出为准。技术栈是 Next.js 16、React 19 和 next-intl 4，需要 Node.js 20.9 以上（仓库根目录 `.node-version`）。`npm run lint` 直接运行 ESLint（Next 16 已移除 `next lint`）；语言前缀路由在 `proxy.ts`（Next 16 对 `middleware` 的新称呼）。

`npm run dev` 会即时编译，并在每次请求时重新渲染这个包含大量产品界面元素的页面，因此首访和刷新都比生产构建慢；开发模式的 React 还会为元素记录调用栈。走查区只挂载当前步骤的场景，减少浏览器首次加载的 DOM 和观察器数量。检查访客实际得到的版式、滚动和交互流畅度时，用 `npm run build && npm run start` 看预渲染的生产页面。CPU 被别的进程占满时（先看 `uptime` 的负载和活动监视器），开发模式会被放大得更明显。

## 构建

```bash
cd website
npm run build
npm run start
```

## 部署

站点由 Netlify 按仓库根目录的 [netlify.toml](../netlify.toml) 构建，只有生产分支（main）会部署。这几条互相牵连，改其中一条前先读 [AGENTS.md「联动一致性」](../AGENTS.md#联动一致性强制)；`npm run check:consistency` 会核对其中能机器检查的部分。

- **`base = "website"`**。Netlify 在 base 目录里安装依赖、读 `.node-version`，也从 base 的 `node_modules` 里找插件。base 留在仓库根目录时插件不在那里，Netlify 会另装一份它自己选的：按站点第一次成功构建时钉住的主版本，早先用旧版 Next 部署过的站点拿到的是 v4（面向 Next 13.5 之前）。v4 不认 Next 16 的 `proxy.ts`（产物里没有中间件函数，语言前缀路由不会运行），在 Netlify 上也曾在函数打包一步失败。
- **Next.js 运行时在 `netlify.toml` 里声明，并装在 `website/package.json` 里**（`@netlify/plugin-nextjs`，版本由 lockfile 决定，Dependabot 每月升级）。Netlify 只会自动加载装在站点设置里的运行时，这个站点没有：不声明，构建里就没有运行时（日志里没有 `Using Next.js Runtime`），部署出去的只是 `.next` 目录；只声明、不装，Netlify 会自己装一份 v4。装在 `package.json` 里的插件被直接使用，不再经过 Netlify 的版本钉住。构建命令里不用 `npm ci`：Netlify 在 base 里装依赖。
- **工具链的大版本是迁移，不是升级**。`tailwindcss` 的主版本决定 `postcss.config.js` 怎么写（4 用 `@tailwindcss/postcss`，3 用 `tailwindcss` 插件）和样式入口怎么写；`typescript`、`eslint` 的新主版本要先被 `typescript-eslint`、`eslint-config-next` 内置插件的 peer 范围接受，否则 `npm run lint` 崩溃。Tailwind 4、ESLint 10、TypeScript 7 曾在 CI 是红的时被合进 main，生产构建因此失败。现在是 Tailwind 3.4、ESLint 9、TypeScript 6.0（`typescript-eslint` 接受的最新主版本）；ESLint 10 会让 `eslint-config-next` 自带的 `eslint-plugin-react` 崩溃（它调用了 ESLint 10 移除的 `context.getFilename()`）。Dependabot 对 `tailwindcss`、`typescript`、`eslint` 忽略主版本。
- **`publish = ".next"`**，相对 base。写进文件是为了覆盖 Netlify 后台里可能留着的旧值（例如 `website/.next`），那个值在新 base 下会指向不存在的目录。后台的 Package directory 不需要设置（它只能在后台设置，`netlify.toml` 管不到），留空。
- **Node 版本**。Netlify 在 `website/` 里找不到仓库根目录的 `.node-version`，所以 `netlify.toml` 的 `NODE_VERSION` 要写一份，并与它一致。
- **什么时候构建**。`ignore` 命令只在 `website/` 或 `netlify.toml` 有变化时才构建；Deploy Preview 和分支部署一律跳过，看板上显示 Canceled，并没有真的构建。`ignore` 在 base 目录里运行，路径要写成 `:/website`，从仓库根起算；写成 `website` 会指向 `website/website`，永远没有差异，等于永远跳过。`CACHED_COMMIT_REF` 不能直接信：Netlify 文档写明没有缓存的构建里它等于 `COMMIT_REF`，diff 恒为空；PR 预览被取消后，它也可能是 rebase 或 squash 合并前的头提交，内容和合并结果相同、却不在 `main` 的历史里。所以命令在这两种情形（以及取不到提交时）一律构建，只有它确实是祖先且监视的路径没有差异才跳过；`scripts/__tests__/netlify-ignore.test.ts` 用真实的 git 仓库执行这条命令。Netlify 对任何 `ignore` 取消都报 “Canceled build due to no content change”，所以部署页的报错分辨不出原因。想让看板上也不出现这些条目，在后台关掉：Project configuration > Developer settings > Continuous deployment > Branches and deploy contexts > Configure，Branch deploys 选 None，并禁用 Deploy Previews（站点设置，仓库里改不了）。
- **语言前缀路由与法律页**。`proxy.ts` 的 matcher 放过 `privacy-policy`、`terms-of-service`、`api`、`_next` 和带扩展名的路径；前两个由 `netlify.toml` 的重写交给 `public/` 里的静态页。改其中一边，另一边一起改。两个静态页互相的链接、回首页的链接都写成站内路径（`/privacy-policy.html`、`/terms-of-service.html`、`/`），不写域名：写了域名，在本机、预览和分支部署里点一下就跳到线上，看到的是线上还没更新的旧页面。只有给爬虫读的地址写域名：两个静态页的 `rel="canonical"`、`lib/site.ts` 的 `SITE_ORIGIN`（`metadataBase` 和站点地图用它）、`public/robots.txt` 的 `Sitemap` 行；`utils/__tests__/website.test.ts` 核对这一点。

部署后看日志：应有 `Using Next.js Runtime - v5.x`。没有这一行，说明运行时没被加载：查 `netlify.toml` 的 `[[plugins]]` 和 `website/package.json`。是 v4.x，说明 Netlify 没有从 `website/node_modules` 里找到插件：先查后台 Build settings 里的 Base directory 与 Package directory。

再核对路由：`/` 按浏览器语言跳到 `/zh-CN` 或 `/en`，中文以外的语言都跳到 `/en`，响应头里没有 `Link`；`/en` 返回 200；`/privacy-policy` 与 `/terms-of-service` 返回静态页；`/robots.txt` 与 `/sitemap.xml` 符合 [seo-geo.md](../docs/v2/seo-geo.md) 第 3.4、3.5 节。本机的 `netlify serve` 在子目录 base 下所有路由都返回 500（它重打包的函数副本里没有 `.next`，部署用的 zip 里有），验证不了路由，要在真实的生产部署上看；`ignore` 取消过的部署不算（部署页写 “Canceled build due to no content change”）。

## 设计与代码结构

视觉来自 [设计稿](../docs/design/v2/README.md)：设计稿的范围边界写明官网不在稿内，所以官网沿用它的令牌和界面零件，内容与结构仍以 [网站蓝图](../docs/v2/website.md) 为准。

```text
app/[locale]/globals.css          设计令牌（亮色；.theme-dark 为暗色）与基础样式，令牌取自设计稿 css/tokens.css
lib/copy/                         中英文文案。types.ts 是唯一的结构，zh-CN.ts 与 en.ts 逐项对应，缺一项就编译失败
lib/site.ts                       生产域名（只给爬虫读的地址用）
app/sitemap.ts                    站点地图：两个语言页与两个法律页
public/robots.txt                 全部放行、内容信号与站点地图的地址
components/landing/               页面的各个区块（hero、问题、三种方式、走查、资料库、取舍、隐私、FAQ、收束）
components/product/               扩展界面的复刻：选区菜单、剪藏提示、区块胶囊、截图、资料库、阅读视图与高亮、属性、导出
components/product/product-*.css  从设计稿 css/ui.css、css/ext.css 移植，类名统一加 ah- 前缀，不与 Tailwind 冲突
components/product/sample.ts      示例数据，取自 docs/v2/examples.md 的一周走查，来源是中性域名
```

- **界面复刻不是截图**。设计稿里的界面用 React 和 CSS 重画，页面上标注“界面示意”。真实构建的截图（[蓝图 §16](../docs/v2/website.md)）就绪后再替换；替换前不要把它们描述成公开构建的截图。
- **站点地图的日期跟着内容走**：语言页的 `lastmod` 取 `lib/copy/*` 里的 `meta.updated`，文案或结构化数据有实质改动时改成当天；法律页取页面上写明的更新日期（[seo-geo.md §3.5](../docs/v2/seo-geo.md)）。
- **界面里的字符串跟扩展一致**：`lib/copy/*` 里的 `ui` 取自扩展的 `utils/ui-text.ts`，设计稿或扩展改了文案，这里同步。
- **设计稿变了，先改移植的那份 CSS 和组件**，再看页面。选区菜单、剪藏胶囊这类浮层锚定在被选中的文字或区块上，不写死像素，字体回退或换行变了也不会错位；必须按像素摆放的场景（整个截图会话、整张浏览器窗口）用 `Fit` 缩放。
- **悬停和聚焦只改外观，不改尺寸**。设计稿用固定的 `.hov` 类画“悬停中”的静态状态，移植成真正的 `:hover` 时，如果靠 `display` 让操作按钮出现，就多出一列、文字重新换行，那一行和它下面所有行的高度都会在指针下变化。条目行的操作区始终占位，隐藏时只改 `visibility`；`:hover`、`:focus` 规则只能改背景、颜色、阴影这类绘制属性，`utils/__tests__/website.test.ts` 核对这一点。
- **页内锚点平滑滚动，换页不滚动画**。`globals.css` 给 `html` 设了 `scroll-behavior: smooth`，所以 `layout.tsx` 的 `<html>` 要带 `data-scroll-behavior="smooth"`。有它，Next 在换页（语言切换）时临时关掉平滑滚动，新页面直接停在顶部；没有它，新页面会用约 1 秒的动画从原来的位置滑回顶部，开发时控制台还会警告。同一个测试核对两处一致。
- 产品窗口圆角不超过 8px；不用渐变球、发光背景和玻璃拟态；紫色只作品牌与操作强调（[蓝图 §5](../docs/v2/website.md)）。
- 页面主 CTA 统一为“体验资料库”，各入口都指向站内示例。
- 不展示未经验证的评价和使用人数，不写“完全准确”“永不丢失”这类无法证明的承诺。
- 对其他产品的对比只写在 FAQ 里，并带 [market.md](../docs/v2/market.md) 的核对日期。

**渲染方式**：两个语言的页面在构建时预渲染成静态 HTML。`app/[locale]/layout.tsx` 和 `page.tsx` 里的 `setRequestLocale(locale)` 就是为此而写：去掉它，next-intl 会去读请求头，页面退回按请求渲染。只有三个客户端组件：`Fit`（把像素定位的场景缩到容器宽度）、`StoryStepper`（走查的步骤切换，只挂载当前场景）和 `LibraryTour`（可操作的资料库，数据只在内存里，刷新即重置）。

**验证**：`npm run lint`、`npx tsc --noEmit`、`npm run build`；官网的单测在仓库根目录的 `utils/__tests__/website*.test.ts`，随根目录的 `npm test` 运行。涉及版式的改动，用真实浏览器在 390、820、1024、1280、1440 和 1920 宽度各看一遍，中英文都看；只看一个宽度会漏掉场景缩放和英文长文案带来的问题。
