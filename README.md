# AnnHub

> 让网页中稍纵即逝的信息，变成可检索、可复习、可应用的知识碎片。

AnnHub 是一个本地优先的知识碎片系统。浏览器扩展负责从网页采集文本、高亮和截图，并保留来源与上下文；桌面客户端负责复习、整理与本地数据中枢。

## 核心能力

- **精准采集**：选中文本后打开操作菜单，保存碎片、备注或创建高亮
- **连续高亮**：进入荧光笔模式后，连续选区即可快速保存
- **语境保留**：碎片同时记录原文、所在上下文、页面标题、来源 URL 和定位信息
- **原创灵感**：可不依赖网页选区记录短篇想法与触发背景，再进入同一学习链路
- **主动加工**：采集时完成“理解、核验、应用”，避免系统退化成收藏夹
- **截图采集**：支持区域或元素截图、选区内标注、身份信息匿名、马赛克、下载和本地截图集
- **碎片库**：按类型、来源、标签与时间的统一检索，编辑需重新核验，高亮与剪藏可升级为碎片
- **唯一的导出**：一键生成 Markdown + 已保存原图的 ZIP，供 Obsidian 等工具阅读；无需 Desktop
- **间隔复习**：Desktop 按碎片类型出题、提示梯度与四档评分，会话中断可恢复（复习日志不可变）
- **本机交付**：扩展把碎片与图片逐条幂等写入 Desktop 本地服务（127.0.0.1:8765）；断线保留待发送队列
- **本地优先**：浏览器使用 IndexedDB，原生客户端使用 SQLite；关闭 LLM、断网、无 Desktop 均可降级运行

## 产品边界

AnnHub 只解决一条主链路：

```text
遇到有价值的信息
  -> 连同语境采集
  -> 当场完成一次主动加工
  -> 在合适时间复习
```

浏览器扩展承担采集、查询和轻量编辑；Desktop 承担专注复习、碎片整理和跨端数据收敛。当前产品形态仅包含这两端。输出工坊与知识关系不在产品范围内，见 [docs/v2/product.md §2.3](./docs/v2/product.md)。

## 架构总览

```text
┌─────────────────────────────────────────────────────┐
│ Browser Extension                                   │
│ HoverMenu / Capture Modal / Highlighter / Screenshot│
└───────────────────────┬─────────────────────────────┘
                        │ chrome.runtime.sendMessage
┌───────────────────────▼─────────────────────────────┐
│ Background Service Worker                           │
│ Config / Highlight / Clip / Fragment / Screenshot   │
│ per-item delivery / optional LLM                    │
└───────────────────────┬─────────────────────────────┘
                        │ domain API
┌───────────────────────▼─────────────────────────────┐
│ learning-core                                       │
│ normalize / validate / query / review / wire        │
│ IndexedDB store (v4) / Markdown ZIP export          │
└───────────────────────┬─────────────────────────────┘
                        │ shared data contract
┌───────────────────────▼─────────────────────────────┐
│ AnnHub Desktop                                      │
│ macOS SwiftUI + AnnHubCore + SQLite                 │
│ 今日 / 碎片库 / 系统 / 复习会话 / PUT v1 交付接口   │
└─────────────────────────────────────────────────────┘
```

## 项目结构

以下只是当前代码位置，最终将演进为 monorepo；目标包结构尚未在产品文档中确定。

```text
annhub/
├── entrypoints/
│   ├── content/                 # 页面内采集、高亮与截图
│   │   ├── annotation-core/     # 站点规则、DOM policy、Range 与 marker 工具
│   │   ├── highlight/           # 高亮创建、恢复与删除
│   │   ├── capture/             # 碎片采集流程
│   │   └── screenshot/          # 区域/元素截图与匿名处理
│   ├── options/                 # 设置页
│   ├── library/                 # 碎片库与截图集
│   └── popup/
├── background-service/
│   └── services/
│       ├── fragment/            # 碎片服务
│       ├── highlight/           # 高亮存储
│       ├── screenshot/          # 截图后台与截图集
│       └── llm/                 # 可选的模型能力
├── learning-core/               # 共享领域核心，纯 TypeScript
├── app/                         # macOS Desktop 与 AnnHubCore
├── types/                       # 消息与数据类型
├── fixtures/interop/            # TS↔Swift 跨语言契约 fixtures（单条 PUT/图片字节/拒绝案例）
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
- 开发 Desktop 时需要 Xcode 与 XcodeGen

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

`npm run format` 一次修复格式。CI 跑同样的命令，外加 CodeQL、依赖审查、Swift 格式与 macOS 构建；细节与仓库设置见 [发布与供应链](./docs/releasing.md)。

原生核心与 Desktop：

```bash
cd app
swift test                        # Core：领域规则、SQLite、本地服务（含真实 socket）
xcodegen generate                 # AnnHub.xcodeproj 由 project.yml 生成，不入库
xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
xcodebuild -project AnnHub.xcodeproj -scheme AnnHubDesktop \
  -destination 'platform=macOS' test CODE_SIGNING_ALLOWED=NO   # Desktop：模型、命令面板、窗口、视图渲染
```

扩展与真实运行的 Desktop 进程之间的两端连测（仅 macOS；先构建扩展和 Desktop，找不到 Desktop 构建时自动跳过，`ANNHUB_DESKTOP_APP` 可指定 `.app`）：

```bash
npm run build
npx playwright test e2e/desktop-two-end.spec.ts
```

## 数据原则

1. 原始内容、来源、用户加工与复习记录默认保存在本地。
2. LLM 是可选增强；关闭后采集、复习和扩展内容导出仍可运行。
3. 高亮、剪藏、截图和学习碎片是不同实体，不互相吞并。
4. R1 目标只提供一种用户导出：扩展内容的 Markdown 与已保存图片 ZIP，供其他工具阅读；Desktop 通过本地服务逐项接收，不依赖该 ZIP 交付。
5. 自动推断和模型建议只是建议，用户确认后才生效。

## 文档

- [产品文档入口](./docs/v2/README.md)
- [产品定位](./docs/v2/product.md)
- [Fragment 数据契约](./docs/v2/fragments.md)
- [产品路线图](./docs/v2/roadmap.md)
- [验证计划与决策登记](./docs/v2/validation.md)
- [截图采集设计](./docs/v2/screenshot.md)
- [UX/UI 设计稿](./docs/design/v2/README.md)
- [发布与供应链](./docs/releasing.md)、[扩展权限说明](./docs/extension-permissions.md)、[安全策略](./SECURITY.md)

## License

MIT
