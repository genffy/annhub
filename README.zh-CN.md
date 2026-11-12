<!-- README.md（英文，默认）与 README.zh-CN.md（中文）互为译本：同一个提交里一起改。`pnpm run check:docs` 比对两份的结构，并对照仓库核对它们写出的命令、路径、快捷键与版本（联动表见 scripts/README.md）。 -->

# AnnHub

[English](README.md) | **简体中文**

[![CI](https://github.com/genffy/annhub/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/genffy/annhub/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/genffy/annhub/badge)](https://scorecard.dev/viewer/?uri=github.com/genffy/annhub)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/16415/badge)](https://www.bestpractices.dev/projects/16415)
[![License: MIT](https://img.shields.io/github/license/genffy/annhub)](LICENSE)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/jpooljigbeplpgciohfjklgbfdfnnmfn)

> 把网页里值得留下的内容，存进同一个本地库。

![AnnHub 资料库的界面示意，使用示例数据：按属性筛选出的剪藏与截图，以及一段高亮](website/public/og/zh-CN.png)

AnnHub 是一个本地优先的浏览器扩展，服务于你工作时读到的资料。选中一段内容，或指一下整条帖子、整节内容，一步剪藏；也可以框选画面截图。它们连同来源保存为统一的条目，之后在资料库里阅读、划出高亮，用带类型的属性分类，需要时检索、回到原页面，或导出为 Markdown。

[添加到 Chrome](https://chromewebstore.google.com/detail/jpooljigbeplpgciohfjklgbfdfnnmfn)，或者免安装[体验资料库](https://annhub.org/zh-CN#library)（使用示例数据）。

[功能](#功能) · [安装](#安装) · [使用](#使用) · [本地优先与隐私](#本地优先与隐私) · [开发](#开发) · [文档](#文档) · [参与贡献](#参与贡献)

## 功能

以下是最新商店版本的能力。已合并、尚未发布的能力见[路线图](docs/product/roadmap.md)，各项功能背后的契约见 [docs/product](docs/product/README.md)。

- **页面里的两种采集。** 剪藏：选中一段，或指一下整条帖子、代码块、表格、图、引用、一节、整篇文章，一次点击存成 Markdown；也可以对区域或元素截图。页面上不留任何标记。
- **库里的高亮。** 在资料库里读剪藏，选中原文，划出重点、选颜色、写备注。高亮是这条剪藏里的标注，不是网页上的标记。
- **每条条目都带来源。** 每条条目记录来源 URL（信息流里取内容项的永久链接），选区剪藏还带所在语境；保存前去掉带令牌的查询参数；“回到来源”打开原页面。
- **统一的条目与带类型的属性。** 剪藏与截图共用一种存储格式。内置属性（标题、标签、作者、发布日期等）之外，可以添加自己的带类型属性：文本、列表、数字、复选框、日期、日期时间。思路参考 Obsidian Web Clipper 的 Properties。
- **截图。** 区域或元素截图，选区内原位标注（画笔、荧光笔、直线、序号），身份信息匿名、马赛克，再复制到剪贴板或下载；水印、比例预设与极简美化只作用于复制与下载。滚动长图把长文章拼成一张图。
- **页面批注。** 在当前标签页上画箭头、形状、文字与序号。墨迹跟着页面滚动，退出批注层即清除，画过的内容可以直接截进截图编辑器。
- **录屏。** 把当前标签页录成本地 WebM，可带麦克风旁白。录制中可以用单键画墨迹、开光标高亮，两者都会进入视频。
- **下载。** 把一个区块、整页正文或资料库里选中的条目取成本地 Markdown 文件夹或 ZIP，含媒体。
- **资料库。** 全部、剪藏、高亮、截图、属性、设置各有视图。按类型、标签或属性搜索与筛选；路由与筛选写入 URL hash，刷新不丢，详情抽屉可编辑标题、标签与备注。
- **唯一的导出。** 一个 ZIP，里面是 Markdown 文件（属性写成 YAML frontmatter，高亮写成 `==…==`）加上已保存的原图，供 Obsidian 等工具阅读。它用来在别处阅读，不是能恢复 AnnHub 数据库的备份。
- **本地优先。** 数据保存在浏览器的 IndexedDB，采集、阅读、检索与导出断网也能用。界面有中英文，亮暗两种外观。

## 安装

从 [Chrome 应用商店](https://chromewebstore.google.com/detail/jpooljigbeplpgciohfjklgbfdfnnmfn)安装。需要桌面版 Chrome 116 或更高版本，或同版本内核的其他 Chromium 系桌面浏览器。

想自己构建，见[开发](#开发)。

## 使用

1. **剪藏。** 在任意网页上选中文字，点出现的菜单里的「剪藏」。一次点击就存下，不开窗口；约 3 秒内可以撤销，也可以当场补标签和备注。不选中任何内容时，把指针停在一个区块（帖子、代码块、表格、图、引用、一节或整篇文章）上，点出现的胶囊里的「剪藏」。
2. **截图。** 点同一个菜单里的「截图」，或用下面的快捷键：框选区域或点选元素，原位标注，再保存、复制或下载。
3. **阅读与整理。** 在工具栏弹窗里点「在资料库中打开」，读一条剪藏，选中文字划高亮，再加标签与属性。
4. **找回。** 在资料库里搜索与筛选，用「回到来源」打开原页面。
5. **带走。** 在资料库里导出 Markdown ZIP，或把一个页面的正文下载成 Markdown 文件夹。

### 键盘快捷键

| 操作                     | Windows、Linux、ChromeOS | macOS             |
| ------------------------ | ------------------------ | ----------------- |
| 区域或元素截图           | `Ctrl+Shift+S`           | `Command+Shift+S` |
| 区块模式：选一整块并剪藏 | `Ctrl+Shift+E`           | `Command+Shift+E` |

页面批注、录屏与下载本页正文没有默认快捷键：用工具栏弹窗，或在 `chrome://extensions/shortcuts` 里自己绑定。

## 本地优先与隐私

- 条目、图片、设置和本地指标只保存在浏览器本地（IndexedDB 与 `chrome.storage`）。没有账号，没有 AnnHub 服务器，也没有 AI 服务。
- 页面内容、URL、标题和你整理的内容，不会发往 AnnHub 或任何第三方。
- 扩展只读你指认的内容：选中的文字、一个区块、一次截图，或一次明确的页面下载。
- 仅有的出站请求由后台在你点击之后发起，只指向页面自己引用的地址，不带凭据，只接受公网地址：元素截图时代取页面里的跨域图片，以及下载 Markdown 文件夹时取回页面声明的媒体。
- 不加载远程代码：扩展页面只执行扩展自带的脚本。

扩展申请了哪些权限、为什么，见 [permissions.md](docs/product/permissions.md)。对外的[隐私政策](https://annhub.org/privacy-policy.html)为中英双语。

## 产品边界

AnnHub 只解决一条主链路：遇到值得留下的内容，一步剪藏或截图并连同来源保存，在库里读一遍、划出高亮，之后检索、回到来源或导出。浏览器扩展承担采集、整理和查询。

不在产品范围内的：团队协作、手机端与独立的桌面应用、AI 摘要与问答、通用笔记与白板、稍后读收件箱与整页阅读器、网页上的高亮标记、整页剪藏与模板系统。完整清单与原因见 [product.md §2.3](docs/product/product.md)。

### 数据原则

1. 原始内容、来源和你的整理，默认保存在本地。
2. 剪藏与截图是同一种条目的两个类型，共用来源与属性，类型创建后不改；高亮是剪藏里的标注，不是类型。
3. 属性小而原子：有类型，同名同类型，长文字放备注。
4. 只提供一种用户导出：Markdown 与已保存图片的 ZIP，供其他工具阅读，不可恢复 AnnHub 数据库。

## 架构

```text
┌──────────────────────────────────────────────────────────┐
│ Browser extension                                        │
│ Selection menu / Block clip / Annotation layer           │
│ Screenshot session / Cursor highlight                    │
│ Library / Popup / Options / Offscreen document           │
└────────────────────────────┬─────────────────────────────┘
                             │ chrome.runtime.sendMessage
┌────────────────────────────▼─────────────────────────────┐
│ Background service worker                                │
│ Entries / Screenshot / Recording / Download / System     │
└────────────────────────────┬─────────────────────────────┘
                             │ domain API
┌────────────────────────────▼─────────────────────────────┐
│ core                                                     │
│ normalize / validate / query / store                     │
│ IndexedDB (annhub) / Markdown ZIP export                 │
└──────────────────────────────────────────────────────────┘
```

`core` 由后台、内容脚本、资料库、弹窗与 offscreen 文档共同使用。消息权限与任务编排由后台负责；图片读取、整库导出和下载打包按各入口的运行环境执行。

### 项目结构

以下只是当前代码位置，最终将演进为 monorepo；目标包结构尚未在产品文档中确定。

```text
annhub/
├── entrypoints/                      # 扩展入口
│   ├── background/                   # 后台 service worker 入口
│   ├── content/                      # 页面内采集与批注：选区菜单、区块剪藏、截图会话、批注层
│   │   ├── markdown.ts               # DOM → Markdown 转换
│   │   ├── blocks.ts                 # 七种区块的识别
│   │   ├── annotation/               # 页面批注层与墨迹
│   │   └── screenshot/               # 区域、元素与滚动长图截图，匿名处理，编辑器
│   ├── library/                      # 资料库页面：浏览、阅读与高亮、属性、设置；导出的 ZIP 在这里构造
│   ├── offscreen/                    # 录制、按需正文提取、下载媒体取回与打包
│   ├── options/                      # 设置页
│   └── popup/                        # 工具栏弹窗：批注与录制的入口，受限页面上的兜底
├── background-service/               # 后台的消息门面与浏览器服务
│   └── services/                     # 每个服务一个目录
│       ├── download/                 # 页面与资料库下载的编排、取消与恢复
│       ├── entries/                  # 条目、属性、高亮与查询的消息门面
│       ├── metrics/                  # 本地指标的浏览器存储适配
│       ├── recording/                # 标签页录制的编排与下载
│       ├── screenshot/               # 截取、跨域代取、下载
│       └── system/                   # 偏好与本地指标
├── core/                             # 共享的领域核心，纯 TypeScript：规则、校验、查询、IndexedDB、Markdown ZIP 导出
├── types/                            # 消息协议
├── utils/                            # 共享的辅助：界面文案、语言、日志、格式化
├── locales/                          # 清单里的字符串（名称、描述、快捷键说明）
├── styles/                           # 共享的设计令牌
├── public/                           # 扩展的静态文件：图标与示例页
├── assets/                           # 标志源文件
├── e2e/                              # 针对构建产物的 Playwright 测试
├── tests/                            # 把官网与文档、设计令牌对照的测试
├── scripts/                          # 仓库检查与冒烟脚本
├── docs/                             # 产品文档、设计稿与审查问题
├── website/                          # 落地页：Next.js，静态导出，部署在 Cloudflare
├── cloudflare/                       # 官网的部署配置与边缘规则
├── .github/                          # CI、发布与安全工作流，规则集
├── .agents/                          # 智能体的 skill 与运行环境说明
├── .claude/                          # Claude Code 的设置、hook 与 skill
├── .vscode/                          # 推荐的编辑器扩展
├── AGENTS.md                         # 工程约定
└── wxt.config.ts                     # 清单、权限与快捷键
```

工程约定从 [AGENTS.md](AGENTS.md) 进入，目录细则在各级 `AGENTS.md`；产品定位、数据契约和路线图从 [docs/product/README.md](docs/product/README.md) 进入。

## 开发

### 环境

- Node.js 24.x 或更高版本
- pnpm，版本以 `package.json` 的 `packageManager` 为准
- Chrome 或 Chromium（最低版本见[安装](#安装)）

### 构建与加载

```bash
pnpm install
pnpm run dev       # 监听模式，输出在 .output/chrome-mv3-dev/
pnpm run build     # 生产构建，输出在 .output/chrome-mv3/
pnpm run zip       # Chrome 应用商店安装包
pnpm run compile   # 类型检查
```

打开 `chrome://extensions/`，开启开发者模式，点「加载已解压的扩展程序」，选择上面的输出目录。

### 测试与提交前检查

```bash
pnpm run verify                           # 格式、ESLint、类型、带覆盖率的单测、文档检查、文件体量预算、锁文件注册表、联动一致性
pnpm exec playwright install chromium     # 首次跑 E2E 之前装一次
pnpm run test:e2e                         # 针对构建产物的 Playwright 测试；构建过期时自动重建
```

`pnpm run format` 一次修复格式。CI（`.github/workflows/`）跑同样的命令，外加 CodeQL、依赖审查和工作流检查；合并门禁是 `ci-pass` 加上 `.github/rulesets/main.json` 里列出的检查。每个检查做什么见 [scripts/README.md](scripts/README.md)，在真实 Chrome 里手工实测见 [e2e/README.md](e2e/README.md)。

### 官网

落地页在 `website/`（Next.js，导出为静态文件，由 Cloudflare Workers Static Assets 托管）。`pnpm run website:dev`、`pnpm run website:build` 与 `pnpm run website:start` 运行它，细节见 [website/README.md](website/README.md)。

<details>
<summary>维护者：发布与仓库设置</summary>

- **发布：** 给提交打标签 `v<package.json 的 version>`。`release.yml` 先跑完整门禁，再构建、核对清单版本与标签一致、生成构建来源证明并创建 GitHub Release。这个标签已有 Release（包括草稿）时，它只替换附件，不改发布状态，草稿要手工发布。上传到商店是手工步骤，素材与披露要求见 [permissions.md](docs/product/permissions.md)。
- **一次性的仓库设置**，工作流文件替代不了：导入 `.github/rulesets/main.json`（Settings → Rules → Rulesets → Import；导入前先让必需检查在一个 PR 上各跑一次，否则 GitHub 找不到检查名）；Actions 里把默认令牌设为只读、要求 action 固定到完整 commit SHA、fork PR 的工作流需要批准；Code security 里开启 secret scanning 与 push protection、Dependabot alerts 与 security updates、private vulnerability reporting。

</details>

## 文档

产品与工程文档为中文。

- [产品文档](docs/product/README.md)：入口与文档地图
- [产品定位](docs/product/product.md)
- [条目数据契约](docs/product/entry.md)
- [产品路线图](docs/product/roadmap.md)：发布了什么、正在做什么，交付状态的唯一真源
- [待决事项：决策、风险与开放问题](docs/product/validation.md)
- [截图采集设计](docs/product/screenshot.md)
- [权限与数据边界](docs/product/permissions.md)
- [UX/UI 设计稿](docs/design/README.md)
- [安全策略](SECURITY.md)

## 参与贡献

欢迎提交 issue 和 PR。

- **想法与缺陷：** 在 [GitHub issue](https://github.com/genffy/annhub/issues) 里提。候选功能是带 `enhancement` 标签的 issue；产品负责人选定一个开始做时，写进[路线图](docs/product/roadmap.md)。
- **一个功能一个 PR：** [docs/product](docs/product/README.md) 里的规格、用户故事与验收、指标、代码和测试在同一个 PR 里一起改。流程见 [docs/product/AGENTS.md](docs/product/AGENTS.md)；功能越过 [product.md §2.3](docs/product/product.md) 的不做清单时，在同一个 PR 里改那一行。
- **推送之前：** 跑 `pnpm run verify`，并填写 [PR 模板](.github/pull_request_template.md)。
- **约定：** [AGENTS.md](AGENTS.md) 是工程约定的入口，对人和对编码智能体都一样。提交信息用 [Conventional Commits](https://www.conventionalcommits.org/)。
- **两份 README 保持同步：** `README.md` 与 `README.zh-CN.md` 互为译本，改一份就在同一个提交里改另一份。`pnpm run check:docs` 核对它们的结构仍然对应，并核对它们写出的命令、路径、快捷键与版本仍与仓库一致。

## 安全

请通过 GitHub 私下报告漏洞（**Security → Report a vulnerability**），不要开公开 issue；见 [SECURITY.md](SECURITY.md)。发布的 zip 带构建来源证明：`gh attestation verify <zip> --repo genffy/annhub`。

## 许可证

[MIT](LICENSE)
