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

## 设计约束

- Hero 使用真实产品场景或真实界面，不使用抽象渐变插画替代产品。
- 首屏必须明确展示 AnnHub、浏览器 Extension、macOS Desktop 和本地优先定位。
- 功能截图来自真实构建；目标态功能标记“开发中”。
- 页面主 CTA 只有一个。
- 产品界面截图必须脱敏并检查文本可读性。
