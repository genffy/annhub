# AnnHub

> Browser extension for annotation, comment, capture, and share anywhere

一个功能强大的浏览器扩展，让你可以在任何网页上进行标注、评论、截图和分享。

## 核心功能

- **Mode A（精准模式）**：选中文本后弹出悬浮菜单，支持采集、备注、进入荧光笔
- **Mode B（扫射模式）**：开启荧光笔后选中即自动采集，右上角胶囊显示计数
- **高亮标注**：在任意网页上高亮文本并持久化到 IndexedDB
- **跨页回显**：列表页（如 x.com/home）创建的高亮在对应详情页也能恢复
- **站点感知**：自动提取推文等内容的详情永久链接
- **用户备注**：高亮记录支持附加文字备注
- **快捷键**：`Alt+H` / `Cmd+Shift+H` 切换荧光笔模式

## 项目结构

```
annhub/
├── entrypoints/            # 扩展入口点
│   ├── content/            # Content Script（Mode A/B 交互、高亮、采集）
│   └── background/         # Service Worker（快捷键、消息分发）
├── background-service/     # 后台服务管理（Highlight、Clip、Config）
├── components/             # React 组件（SidePanel 高亮列表等）
├── types/                  # TypeScript 类型（highlight, clip, action, messages）
├── utils/                  # 工具函数
├── e2e/                    # Playwright E2E 测试及 fixture
├── public/                 # 公共资源
├── website/                # 文档和落地页 (Next.js)
├── wxt.config.ts           # WXT 构建配置
├── vitest.config.ts        # 单元测试配置
├── playwright.config.ts    # E2E 测试配置
└── package.json            # 依赖配置
```

本项目采用扁平化结构，扩展代码位于根目录，文档和落地页位于 `website/` 目录。更详细的架构说明参见 [AGENTS.md](./AGENTS.md)。

## 快速开始

### 环境要求

- **Node.js**: 24.x LTS (Krypton) 或更高版本
- **包管理器**: npm (内置于 Node.js)
- **推荐**: 使用 [fnm](https://github.com/Schniz/fnm) 管理 Node.js 版本

### 安装 fnm (可选但推荐)

**macOS / Linux:**
```bash
# 使用 Homebrew
brew install fnm

# 或使用安装脚本
curl -fsSL https://fnm.vercel.app/install | bash
```

**Windows:**
```bash
# 使用 Scoop
scoop install fnm

# 或使用 Chocolatey
choco install fnm
```

安装后，将以下内容添加到你的 shell 配置文件 (`~/.zshrc`, `~/.bashrc` 等):

```bash
# fnm
eval "$(fnm env --use-on-cd)"
```

### 初始化项目

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd annhub
   ```

2. **使用 fnm 安装 Node.js 24** (如果使用 fnm)
   ```bash
   fnm use
   # fnm 会自动读取 .node-version 文件并安装/切换到 Node 24
   ```
   
   或手动安装 Node.js 24 并确保版本正确:
   ```bash
   node --version  # 应显示 v24.x.x
   ```

3. **安装扩展依赖**
   ```bash
   npm install
   ```

4. **安装 website 依赖** (如需运行文档网站)
   ```bash
   cd website
   npm install
   cd ..
   ```

## 开发

### 扩展开发

```bash
# 开发模式 (Chrome)
npm run dev

# 开发模式 (Firefox)
npm run dev:firefox

# 构建生产版本
npm run build

# 构建 Firefox 版本
npm run build:firefox

# 打包为 zip (用于发布)
npm run zip
npm run zip:firefox

# TypeScript 类型检查
npm run compile
```

开发模式启动后:
- Chrome: 访问 `chrome://extensions/`，启用"开发者模式"，加载 `.output/chrome-mv3` 目录
- Firefox: 访问 `about:debugging#/runtime/this-firefox`，加载临时扩展

### 测试

```bash
# 单元测试（Vitest + jsdom）
npm test
npm run test:watch

# E2E 测试（Playwright，需先构建扩展）
npm run build
npx playwright test
```

测试输出目录（`test-results/`、`playwright-report/`、`coverage/`）已加入 `.gitignore`。

### 文档网站开发

```bash
# 开发模式
npm run website:dev

# 构建生产版本
npm run website:build

# 运行生产构建
npm run website:start
```

文档网站将在 `http://localhost:3001` 运行（或其他可用端口）。

## 构建产物

### 扩展
- 开发构建: `.output/chrome-mv3/` 或 `.output/firefox-mv3/`
- 生产 zip: `.output/*.zip`

### 文档网站
- 构建输出: `website/.next/`

## 技术栈

### 扩展
- **框架**: [WXT](https://wxt.dev/) - 下一代 Web 扩展框架
- **UI**: React 19 + TypeScript
- **样式**: TailwindCSS 3
- **状态管理**: Zustand
- **路由**: React Router DOM 7
- **存储**: IndexedDB (idb) + chrome.storage.local
- **测试**: Vitest (单元) + Playwright (E2E)
- **工具库**: fabric.js, html2canvas, nanoid 等

### 文档网站
- **框架**: Next.js 13 (App Router + Pages Router)
- **UI**: React 18 + TypeScript
- **样式**: TailwindCSS 3 + Emotion
- **动画**: Framer Motion
- **国际化**: next-intl

## 代码格式化

```bash
npm run format
```

使用 Prettier 格式化所有代码文件。

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

请查看 [LICENSE](./LICENSE) 文件了解详情。

---

**注意**: 项目已从 Yarn workspace monorepo 结构重构为扁平化结构，使用 npm 作为包管理器，Node.js 升级到 24 LTS。
