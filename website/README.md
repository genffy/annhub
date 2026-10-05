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

- **`base = "website"`**。Netlify 只在 base 目录里检测框架、安装依赖、读 `.node-version`，并按那里 `package.json` 的 `next` 版本选 Next.js 运行时（OpenNext 适配器，v5）：`next` 在 13.5 以上选 v5。Netlify 会在站点第一次成功构建后把插件钉在当时的主版本，base 留在仓库根目录时读不到 `next`，钉在 v4 的站点就一直留在 v4。v4 不认 Next 16 的 `proxy.ts`（产物里没有中间件函数，语言前缀路由不会运行），在 Netlify 上也曾在函数打包一步失败。base 指向 `website` 后，5.x 的版本条目会覆盖这个钉住。
- **不要声明 `@netlify/plugin-nextjs`**：不要写进 `netlify.toml` 的 `[[plugins]]`，也不要装进 `package.json`。运行时由 Netlify 自动安装并保持最新。构建命令里也不要再 `npm ci`：Netlify 在 base 里装依赖，选运行时版本时要用装好的 `next`。
- **`publish = ".next"`**，相对 base。写进文件是为了覆盖 Netlify 后台里可能留着的旧值（例如 `website/.next`），那个值在新 base 下会指向不存在的目录。后台的 Package directory 不需要设置（它只能在后台设置，`netlify.toml` 管不到），留空。
- **Node 版本**。Netlify 在 `website/` 里找不到仓库根目录的 `.node-version`，所以 `netlify.toml` 的 `NODE_VERSION` 要写一份，并与它一致。
- **什么时候构建**。`ignore` 命令只在 `website/` 或 `netlify.toml` 有变化时才构建；Deploy Preview 和分支部署一律跳过，看板上显示 Canceled，并没有真的构建。`ignore` 在 base 目录里运行，路径要写成 `:/website`，从仓库根起算；写成 `website` 会指向 `website/website`，永远没有差异，等于永远跳过。想让看板上也不出现这些条目，在后台关掉：Project configuration > Developer settings > Continuous deployment > Branches and deploy contexts > Configure，Branch deploys 选 None，并禁用 Deploy Previews（站点设置，仓库里改不了）。
- **语言前缀路由与法律页**。`proxy.ts` 的 matcher 放过 `privacy-policy`、`terms-of-service`、`api`、`_next` 和带扩展名的路径；前两个由 `netlify.toml` 的重写交给 `public/` 里的静态页。改其中一边，另一边一起改。

部署后看日志：应有 `Using Next.js Runtime - v5.x`。仍是 v4.x 说明选版本没有读到 `next`：先查后台 Build settings 里的 Base directory 与 Package directory，再查是否在后台装了 Essential Next.js 插件。

## 设计约束

- Hero 使用真实产品场景或真实界面，不使用抽象渐变插画替代产品。
- 首屏必须明确展示 AnnHub、浏览器 Extension、macOS Desktop 和本地优先定位。
- 功能截图来自真实构建；目标态功能标记“开发中”。
- 页面主 CTA 只有一个。
- 产品界面截图必须脱敏并检查文本可读性。
