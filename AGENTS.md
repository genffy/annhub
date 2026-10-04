# AnnHub 工程约定

> 本文件只放跨目录通用规则。当前代码的局部维护提示见下表的 `AGENTS.md`。
> 更新：2026-09-24。

## 项目与真源

当前仓库包含 Chrome MV3 扩展、TypeScript 领域核心和 macOS Desktop。目标会演进为 monorepo；现有目录只是当前代码位置，不代表最终 package 划分。

- 产品边界、目标契约与阶段验收以 [docs/v2/README.md](docs/v2/README.md) 为入口；当前代码行为以源码和测试为准。目标文档不代表功能已经实现。
- 仓库仍有早期专项与兼容模块。除非任务明确涉及它们，不扩展其产品能力；删除前先查依赖和构建接线。
- 本文件不复制数据结构、消息清单、目标包结构或产品决策。当前字段与消息看源码，已确认但仍在迭代的产品结论看 `docs/v2/`。

## 按目录读取

下表只定位当前代码。只在改动对应目录时读取局部约定；重组为 monorepo 时把仍有效的规则随模块迁移，删除失效路径，不按此表创建最终包结构。

| 目录                   | 专属约定                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `entrypoints/content/` | [选区、高亮、采集与截图](entrypoints/content/AGENTS.md)    |
| `background-service/`  | [消息门面与浏览器服务](background-service/AGENTS.md)       |
| `learning-core/`       | [TypeScript 领域规则与 IndexedDB](learning-core/AGENTS.md) |
| `app/`                 | [Swift 核心与 Desktop](app/AGENTS.md)                      |
| `e2e/`                 | [Playwright 与浏览器实测](e2e/AGENTS.md)                   |
| `docs/v2/`             | [已确认产品文档维护](docs/v2/AGENTS.md)                    |

`website/` 是独立 Next.js 应用，运行方式见 [website/README.md](website/README.md)。其他扩展入口的事实以相邻源码为准。

## 跨目录规则

1. 优先复用现有服务、领域函数和 UI 模式；不要在入口层复制归一化、校验或调度规则。
2. 当前扩展消息联合类型在 `types/messages.ts`；协议修改时同步定义、handler、调用方和相关测试。写操作沿用 sender 权限校验；敏感配置 GET 不回传密钥。
3. 共享契约改变时，以 `docs/v2/` 的最新结论为准，同步受影响的 TypeScript、Swift、IndexedDB / SQLite、跨端 fixture 和文档；迁移策略按实际用户数据决定。
4. LLM 是可选能力；失败时保留手工或本地路径。日志和同步事件不包含密钥、完整页面或附件二进制。
5. 保存失败、返回或关闭流程不得丢失用户已输入的内容。不回退与当前任务无关的工作区改动。
6. 模块、消息、快捷键或数据契约变化时，更新受影响的 `README.md` 与 `docs/`；只在全局规则或目录导航变化时修改本文件。

## 验证入口

- 扩展：`npm run compile`、`npm test`、`npm run build`。
- 浏览器 E2E：先 `npm run build`，再 `npx playwright test <spec>`；现有 `.output` 不会因源码变化自动重建。手工 Chrome 实测见 [e2e/README.md](e2e/README.md)。
- 原生端：`cd app && swift test`；Desktop 构建命令见 [app/AGENTS.md](app/AGENTS.md)。
- 按改动范围运行相关测试；跨端契约、消息协议和截图链路的最低验证见对应目录约定。
