# AnnHub 工程约定

> 本文件只放跨目录通用规则。当前代码的局部维护提示见下表的 `AGENTS.md`。
> 更新：2026-10-07。

## 项目与真源

当前仓库包含 Chrome MV3 扩展、TypeScript 领域核心和官网。目标会演进为 monorepo；现有目录只是当前代码位置，不代表最终 package 划分。

- 产品边界、目标契约与阶段验收以 [docs/v2/README.md](docs/v2/README.md) 为入口；当前代码行为以源码和测试为准。目标文档不代表功能已经实现。
- 不在 v2 文档里的能力不进入仓库；发现这样的代码、文案或配置时删除，而不是兼容或隔离。
- 本文件不复制数据结构、消息清单、目标包结构或产品决策。当前字段与消息看源码，已确认但仍在迭代的产品结论看 `docs/v2/`。

## 按目录读取

下表只定位当前代码。只在改动对应目录时读取局部约定；重组为 monorepo 时把仍有效的规则随模块迁移，删除失效路径，不按此表创建最终包结构。

| 目录                   | 专属约定                                                   |
| ---------------------- | ---------------------------------------------------------- |
| `entrypoints/content/` | [选区、高亮、采集与截图](entrypoints/content/AGENTS.md)    |
| `background-service/`  | [消息门面与浏览器服务](background-service/AGENTS.md)       |
| `learning-core/`       | [TypeScript 领域规则与 IndexedDB](learning-core/AGENTS.md) |
| `e2e/`                 | [Playwright 与浏览器实测](e2e/AGENTS.md)                   |
| `docs/v2/`             | [已确认产品文档维护](docs/v2/AGENTS.md)                    |

`website/` 是独立 Next.js 应用，运行方式和 Netlify 部署的注意事项见 [website/README.md](website/README.md)。其他扩展入口的事实以相邻源码为准。

## 跨目录规则

1. 优先复用现有服务、领域函数和 UI 模式；不要在入口层复制归一化、校验或调度规则。
2. 当前扩展消息联合类型在 `types/messages.ts`；协议修改时同步定义、handler、调用方和相关测试。写操作沿用 sender 权限校验；敏感配置 GET 不回传密钥。
3. 共享契约改变时，以 `docs/v2/` 的最新结论为准，同步受影响的 TypeScript、IndexedDB 和文档；迁移策略按实际用户数据决定。
4. 日志与指标事件不包含密钥、用户内容、完整页面或附件二进制。
5. 保存失败、返回或关闭流程不得丢失用户已输入的内容。不回退与当前任务无关的工作区改动。
6. 模块、消息、快捷键或数据契约变化时，更新受影响的 `README.md` 与 `docs/`；只在全局规则或目录导航变化时修改本文件。

## 联动一致性（强制）

环境、依赖、构建和部署的值同时写在多个文件里。只改其中一处、漏掉其余，是反复出现的错误（Node 版本、Next.js 版本、Netlify 配置都出现过），类型检查和单测发现不了。

1. **先找全，再动手。** 改任何版本号、包名、目录名、命令或 CI / 部署配置之前，先 `git grep` 这个值，列出全部出现处，范围至少含 `.github/`、`netlify.toml`、各 `package.json`、`README.md` 和 `docs/`。改完再搜一遍，确认没有残留。
2. **一个值一个真源。** 其余位置引用它或与它一致；不新增第二份真源，文档和本文件不抄版本号（抄了就会过期）。
3. **按下表联动。** 改左列，右列在同一个提交里一起改。表里没有的联动，按第 1 条自己找，并补进表和 `scripts/check-consistency.mjs`。
4. **断言兜底，不许绕。** `npm run check:consistency`（在 `verify` 和 CI 里）把能机器核对的联动写成断言。它失败说明漏改了某处：去改那一处，不要删断言、放宽匹配或加豁免来求绿。新增联动点时同步加断言和测试。
5. **主版本升级是迁移，不是改 `package.json`。** Node、Next.js、React、Tailwind、ESLint、TypeScript 的主版本变化，按下表逐项核对，并在本地跑对应的构建（website：`cd website && npm run build`）。Dependabot 开的主版本 PR 只是起点，要在它的分支上补齐联动改动；CI 是红的就不要合并。
6. **PR 描述写明核对过的位置**：列出搜过的命令和命中的文件，不要只写“已核对”。

| 改这里                                    | 同一个提交里核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.node-version`（Node 的唯一真源）        | `netlify.toml` 的 `NODE_VERSION`；各 `package.json` 的 `engines.node` 和 `@types/node` 主版本；根 `README.md` 的运行环境；workflow 只用 `node-version-file`，不写死版本                                                                                                                                                                                                                                                                                                                                       |
| `website/package.json` 的 `next`、`react` | `eslint-config-next` 同主版本；`website/README.md` 的技术栈；`proxy.ts`、`next.config.js` 等约定文件；`netlify.toml`（见下一行）；`cd website && npm run build`                                                                                                                                                                                                                                                                                                                                               |
| `netlify.toml`                            | `base` 是含 `next` 的应用目录（Netlify 在 base 里装依赖、找插件）；声明 `@netlify/plugin-nextjs`，并装在 `website/package.json` 里（Netlify 只自动加载装在站点设置里的运行时，这个站点没有）；`publish = ".next"`；`ignore` 在 base 里运行，路径用 `:/` 从仓库根写，并覆盖 `netlify.toml`，没有缓存、`CACHED_COMMIT_REF` 不是祖先时一律构建（改它先跑 `scripts/__tests__/netlify-ignore.test.ts`）；`NODE_VERSION`；`[[redirects]]` 指向的文件在 `public/`；[website/README.md](website/README.md) 的「部署」 |
| `tailwindcss` 的主版本                    | `postcss.config.*`（4 用 `@tailwindcss/postcss`，3 用 `tailwindcss` 插件）；样式入口与配置的写法；`.github/dependabot.yml` 里对它的 `ignore`；目视对比页面                                                                                                                                                                                                                                                                                                                                                    |
| `typescript`、`eslint` 的主版本           | `typescript-eslint`、`eslint-config-next` 内置插件的 peer 范围必须接受新版本，否则 `npm run lint` 崩溃；`.github/dependabot.yml` 里对它们的 `ignore`；本地跑 `npm run lint`                                                                                                                                                                                                                                                                                                                                   |
| 新增、移动含 `package.json` 的目录        | `.github/dependabot.yml`；`scheduled-audit.yml` 的矩阵；CI 里的安装与构建步骤；`scripts/check-lockfiles.mjs` 的列表；`netlify.toml`                                                                                                                                                                                                                                                                                                                                                                           |
| `package.json` 的 `scripts`、CI 任务      | `verify` 与 CI 运行同样的命令；`.github/rulesets/main.json` 的必需检查名；本文件「验证入口」                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 验证入口

- 提交前跑 `npm run verify`（format:check → lint → compile → vitest → check:docs → check:lockfiles → check:consistency）。格式由 Prettier 负责，`npm run format` 一次修复；ESLint 只管正确性。
- 扩展构建：`npm run build`。浏览器 E2E：先构建，再 `npx playwright test <spec>`；现有 `.output` 不会因源码变化自动重建。手工 Chrome 实测见 [e2e/README.md](e2e/README.md)。
- 按改动范围运行相关测试；消息协议和截图链路的最低验证见对应目录约定。
- CI（`.github/workflows/`）运行同样的命令，并加上 CodeQL 和依赖审查；合并以 CI 为准。CI 失败先在本地用上面的命令复现，不要跳过、禁用或隔离测试来求绿。
- CI 的任务不按路径过滤：有测试会读其他目录的文件（法律页测试读 `website/public/`），一份“不影响该任务的路径”清单就是又一处隐藏联动。要少跑，靠 Dependabot 分组和取消过期运行，不要加 `paths`。必需检查所在的工作流更不能加：被跳过的必需检查会一直 pending，阻塞合并（`check:consistency` 会拦）。

## 生成物与提交

- 不手改生成物或单一来源文件：`package-lock.json`（用 npm 11 的 `npm install`）。`.claude/hooks/protect-generated-files.mjs` 会拦截对它的编辑。
- 锁文件里的 `resolved` 只指向 `registry.npmjs.org`。本机把 npm 指向镜像加速时，`npm install` 会把镜像地址写进锁文件；提交前跑 `npm run check:lockfiles -- --fix`，它只换主机名，`integrity` 和依赖树不变。`npm run verify` 与 CI 都会检查。
- 提交信息用 Conventional Commits（`feat` / `fix` / `docs` / `test` / `chore` / `style` / `refactor`），正文写原因而不是复述 diff。一个提交对应一个完整的改动。
- 新增依赖前确认确实需要，并跑 `npm audit --omit=dev`；运行时依赖保持零已知漏洞。
