# AnnHub Website

AnnHub 的公开网站与产品展示页。网站代码位于独立 Next.js 应用中，产品文案以 `docs/v2/` 为准。

## 内容真源

实现或修改 Landing Page 前，必须先阅读：

- [网站内容蓝图](../docs/v2/website.md)
- [产品定位](../docs/v2/product.md)
- [用户故事与验收](../docs/v2/user-stories.md)
- [产品路线图](../docs/v2/roadmap.md)

网站不得自行发明：

- 尚未进入路线图的功能。
- 与当前产品阶段不一致的 CTA。
- 未经验证的用户评价或使用人数。
- “完全准确”“永不丢失”等无法证明的绝对承诺。

## 产品阶段

当前页面展示产品方向，主 CTA 指向项目进展。功能必须按实际交付情况标记“已实现”或“开发中”；下载入口只在真实构建可用时出现。参见 [网站蓝图 §14](../docs/v2/website.md)。

## 开发

```bash
cd website
npm ci
npm run dev
```

默认开发地址为 `http://localhost:3001`，具体端口以 Next.js 启动输出为准。技术栈是 Next.js 16、React 19 和 next-intl 4，需要 Node.js 20.9 以上（仓库根目录 `.node-version`）。`npm run lint` 直接运行 ESLint（Next 16 已移除 `next lint`）；语言前缀路由在 `proxy.ts`（Next 16 对 `middleware` 的新称呼）。

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
- **语言前缀路由与法律页**。`proxy.ts` 的 matcher 放过 `privacy-policy`、`terms-of-service`、`api`、`_next` 和带扩展名的路径；前两个由 `netlify.toml` 的重写交给 `public/` 里的静态页。改其中一边，另一边一起改。

部署后看日志：应有 `Using Next.js Runtime - v5.x`。没有这一行，说明运行时没被加载：查 `netlify.toml` 的 `[[plugins]]` 和 `website/package.json`。是 v4.x，说明 Netlify 没有从 `website/node_modules` 里找到插件：先查后台 Build settings 里的 Base directory 与 Package directory。

## 设计约束

- Hero 使用真实产品场景或真实界面，不使用抽象渐变插画替代产品。
- 首屏必须明确展示 AnnHub、浏览器 Extension、macOS Desktop 和本地优先定位。
- 功能截图来自真实构建；目标态功能标记“开发中”。
- 页面主 CTA 只有一个。
- 产品界面截图必须脱敏并检查文本可读性。
