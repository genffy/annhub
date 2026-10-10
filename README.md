# AnnHub

> 把网页里值得留下的内容，剪藏、截图存进同一个本地库，再在库里读、划高亮。

AnnHub 是一个本地优先的浏览器扩展：选中网页内容或指一下整块内容，一步剪藏；或框选画面截图。它们连同来源保存为统一的条目，之后在资料库里阅读、划出高亮，用可扩展的属性分类，需要时检索、回到原页面，或导出为 Markdown。

## 核心能力

以下按 [docs/v2](./docs/v2/README.md) 的契约描述当前实现；交付到哪一步见 [路线图](./docs/v2/roadmap.md)。

- **页面里的两种采集**：剪藏（选中一段，或指一下整篇文章、整条推文，一次点击存成 Markdown）和截图，`Ctrl/Cmd+Shift+S` 截图、`Ctrl/Cmd+Shift+E` 区块模式；页面上不留任何标记
- **库里的高亮**：在资料库的阅读视图里选中原文划出重点、写备注，高亮是这条剪藏里的标注（R2 界面）
- **来源**：每条条目都记录来源 URL（信息流里取内容项的永久链接），选区剪藏还带所在语境；保存前去掉带令牌的查询参数；“回到来源”打开原页面
- **统一条目与属性**：剪藏与截图共用一种存储格式；标题、标签、作者、发布日期等内置属性，也可以添加自己的带类型属性（文本、列表、数字、复选框、日期、日期时间），思路参考 Obsidian Web Clipper 的 Properties
- **截图**：区域或元素截图、选区内标注、身份信息匿名、马赛克、复制到剪贴板与下载
- **资料库**：搜索与筛选写入 URL hash，详情抽屉可编辑标题、标签、备注
- **唯一的导出**：一键生成 Markdown + 已保存原图的 ZIP，属性写成 YAML frontmatter，供 Obsidian 等工具阅读
- **本地优先**：数据保存在浏览器的 IndexedDB；断网可正常运行

## 产品边界

AnnHub 只解决一条主链路：

```text
遇到值得留下的内容
  -> 一步剪藏或截图，连同来源
  -> 在库里读一遍，划出高亮，用标签和属性分类
  -> 之后检索、回到来源或导出
```

浏览器扩展承担采集、整理和查询。碎片与主动加工、复习调度、桌面客户端、输出工坊与知识关系、AI 功能都不在产品范围内，见 [docs/v2/product.md §2.3](./docs/v2/product.md)。

## 架构总览

```text
┌─────────────────────────────────────────────────────┐
│ Browser Extension                                   │
│ Selection Menu / Block Clip / Screenshot Session    │
└───────────────────────┬─────────────────────────────┘
                        │ chrome.runtime.sendMessage
┌───────────────────────▼─────────────────────────────┐
│ Background Service Worker                           │
│ Entries / Screenshot / System (settings, metrics)   │
└───────────────────────┬─────────────────────────────┘
                        │ domain API
┌───────────────────────▼─────────────────────────────┐
│ learning-core                                       │
│ normalize / validate / query / store                │
│ IndexedDB (annhub) / Markdown ZIP export            │
└─────────────────────────────────────────────────────┘
```

## 项目结构

以下只是当前代码位置，最终将演进为 monorepo；目标包结构尚未在产品文档中确定。

```text
annhub/
├── entrypoints/
│   ├── content/                 # 页面内采集：选区菜单、区块剪藏、截图会话
│   │   ├── markdown.ts          # DOM→Markdown 转换（唯一实现）
│   │   ├── blocks.ts            # 七种区块识别
│   │   └── screenshot/          # 区域/元素截图与匿名处理
│   ├── library/                 # 资料库页面（浏览、阅读与高亮、属性、设置；导出的 ZIP 在这里构造）
│   ├── options/                 # 设置页
│   └── popup/                   # 工具栏弹窗兜底入口
├── background-service/
│   └── services/
│       ├── entries/             # 条目/属性/高亮/查询消息门面
│       ├── screenshot/          # 截取、跨域代取、下载
│       └── system/              # 偏好与本地指标
├── learning-core/               # 共享领域核心，纯 TypeScript
├── types/                       # 消息协议
├── e2e/                         # Playwright 测试
├── docs/                        # 工程文档与 v2 产品文档
└── website/                     # 独立落地页
```

工程约定从 [AGENTS.md](./AGENTS.md) 进入，目录细则在各级 `AGENTS.md`；产品定位、数据契约和路线图见 [docs/v2/README.md](./docs/v2/README.md)。

## 快速开始

### 环境

- Node.js 24.x 或更高版本
- npm
- Chrome 或 Chromium

### 安装

```bash
npm install
```

### 扩展开发

```bash
npm run dev
npm run build
npm run compile
```

开发构建位于 `.output/chrome-mv3/`。在 `chrome://extensions/` 开启开发者模式后加载该目录。

### 测试与提交前检查

```bash
npm run verify                    # 格式、ESLint、类型、vitest、文档链接、锁文件注册表、联动一致性
npm run build && npx playwright test
```

`npm run format` 一次修复格式。CI（`.github/workflows/`）跑同样的命令，外加 CodeQL、依赖审查和工作流检查；合并门禁是 `ci-pass` 加上 `.github/rulesets/main.json` 里列出的检查。

### 发布与仓库设置

- 发布：给提交打标签 `v<package.json 的 version>`。`release.yml` 先跑完整门禁，再构建、核对清单版本与标签一致、生成构建来源证明并创建 GitHub Release；上传到商店是手工步骤，素材与披露要求见 [权限与数据边界](./docs/v2/permissions.md)。
- 仓库管理员的一次性设置，工作流文件替代不了：导入 `.github/rulesets/main.json`（Settings → Rules → Rulesets → Import；导入前先让必需检查在一个 PR 上各跑一次，否则 GitHub 找不到检查名）；Actions 里把默认令牌设为只读、要求 action 固定到完整 commit SHA、fork PR 的工作流需要批准；Code security 里开启 secret scanning 与 push protection、Dependabot alerts 与 security updates、private vulnerability reporting。

## 数据原则

1. 原始内容、来源和用户整理默认保存在本地。
2. 剪藏与截图是同一种条目的两个类型，共用来源与属性，类型创建后不改；高亮是剪藏里的标注，不是类型。
3. 属性小而原子：有类型、同名同类型，长文字放备注。
4. 只提供一种用户导出：扩展内容的 Markdown 与已保存图片 ZIP，供其他工具阅读，不可恢复 AnnHub 数据库。

## 文档

- [产品文档入口](./docs/v2/README.md)
- [产品定位](./docs/v2/product.md)
- [条目数据契约](./docs/v2/entry.md)
- [产品路线图](./docs/v2/roadmap.md)
- [验证计划与决策登记](./docs/v2/validation.md)
- [截图采集设计](./docs/v2/screenshot.md)
- [UX/UI 设计稿](./docs/design/v2/README.md)
- [权限与数据边界](./docs/v2/permissions.md)、[安全策略](./SECURITY.md)

## License

MIT
