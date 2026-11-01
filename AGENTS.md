# AnnHub 工程约定

> 本文件只放跨目录通用规则。当前代码的局部维护提示见下表的 `AGENTS.md`。

## 项目与真源

仓库包含 Chrome MV3 扩展、TypeScript 领域核心和官网；会演进为 monorepo，现有目录只是当前代码位置，不代表最终 package 划分。

- 产品边界、契约与验收以 [docs/product/README.md](docs/product/README.md) 为入口；代码行为以源码和测试为准，交付状态见 [roadmap.md](docs/product/roadmap.md)。
- 新功能的规格与代码在同一个 PR 里进入仓库，流程见 [docs/product/AGENTS.md](docs/product/AGENTS.md)；没有产品文档依据的代码、文案或配置，发现时删除。
- 待确认的决策（`D-`）与其默认在 [validation.md 第 2 节](docs/product/validation.md)：实现不等回复，先按默认走；真机验收项在 [roadmap.md 第 5 节](docs/product/roadmap.md)。

## 文档怎么写

- 只写现在是什么：不写日期、版本、状态标签、轮次、修复经过；什么时候改的看 git，交付状态只在 [roadmap.md](docs/product/roadmap.md)。
- 约束连同原因写成一句现在时；细节放进被引用的文档，不在约定里复述实现。
- 引用节号一律写成 `文档.md §N.M`；被引用过的节不移动、不复用。稳定编号（`D-`、`Q-`、`RK-`、`M-`、`US-` 等）不改号、不复用。
- 机器检查是 `npm run check:docs`（链接、节号引用、编号引用、写法）。

## 按目录读取

只在改动对应目录时读取局部约定；重组为 monorepo 时把仍有效的规则随模块迁移，不按此表创建最终包结构。

| 目录                   | 专属约定                                                        | 什么时候读                  |
| ---------------------- | --------------------------------------------------------------- | --------------------------- |
| `entrypoints/content/` | [选区、区块、截图与页面批注](entrypoints/content/AGENTS.md)     | 改页面侧采集、批注、截图时  |
| `entrypoints/library/` | [应用页、阅读与高亮、属性与设置](entrypoints/library/AGENTS.md) | 改扩展页面、弹窗或样式时    |
| `background-service/`  | [消息门面与浏览器服务](background-service/AGENTS.md)            | 改消息、handler、后台服务时 |
| `learning-core/`       | [领域规则与 IndexedDB](learning-core/AGENTS.md)                 | 改领域规则、校验、存储时    |
| `e2e/`                 | [Playwright 与浏览器实测](e2e/AGENTS.md)                        | 写或跑浏览器测试时          |
| `docs/product/`        | [产品文档维护与新功能流程](docs/product/AGENTS.md)              | 开始功能或改产品结论时      |
| `website/`             | [运行方式与 Cloudflare 静态部署](website/README.md)             | 构建官网或动部署配置时      |

其他扩展入口（options、popup、offscreen）的事实以相邻源码为准。

## 按任务读取

| 任务                               | 先读                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| 改版本号、依赖、构建、CI、部署配置 | [scripts/README.md](scripts/README.md) 的联动表                                             |
| 加或改消息、handler                | [background-service/AGENTS.md](background-service/AGENTS.md) 与 `types/messages.ts`         |
| 改 IndexedDB 结构或数据契约        | [learning-core/AGENTS.md](learning-core/AGENTS.md) 与 [storage.md](docs/product/storage.md) |
| 新功能、改产品行为                 | [docs/product/AGENTS.md](docs/product/AGENTS.md)                                            |
| 改权限或 manifest                  | [permissions.md](docs/product/permissions.md) 与联动表                                      |

## Agent skills

- skill 的正本在 `.agents/skills/<name>/`；`.claude/skills/<name>` 是它的软链接，两边始终是同一个目录（Windows 检出需开 `core.symlinks`）。
- 例外是 `babysit`：正本在 `.claude/skills/babysit/`，`.agents/skills/babysit` 链接过去——远程执行环境按这个路径到 PR 分支上读它。
- 只允许手动调用的 skill 两边各写一处：frontmatter 的 `disable-model-invocation: true` 与 `agents/openai.yaml` 的 `policy.allow_implicit_invocation: false`。pstack 的 `create-*` skill 见 `.agents/docs/harness/`。

## 跨目录规则

1. 优先复用现有服务、领域函数和 UI 模式；不要在入口层复制归一化、校验或调度规则。
2. 消息联合类型在 `types/messages.ts`；协议修改时同步定义、handler、调用方与测试。写操作沿用 sender 权限校验；敏感配置 GET 不回传密钥。
3. 共享契约改变时，以 `docs/product/` 的最新结论为准，同步受影响的 TypeScript、IndexedDB 和文档；迁移策略按实际用户数据决定。
4. 日志与指标事件不包含密钥、用户内容、完整页面或附件二进制。
5. 保存失败、返回或关闭流程不得丢失用户已输入的内容。不回退与当前任务无关的工作区改动。
6. 模块、消息、快捷键或数据契约变化时，更新受影响的 `README.md` 与 `docs/`；只有全局规则或目录导航变化才改本文件。

## 联动一致性（强制）

只改联动值中的一处、漏掉其余，类型检查和单测发现不了。表在 [scripts/README.md](scripts/README.md)，改这类值之前先读。

1. **先找全，再动手。** 改版本号、包名、目录名、命令或 CI / 部署配置之前，先 `git grep` 这个值找全出现处（至少含 `.github/`、`cloudflare/`、`website/wrangler.json`、各 `package.json`、`README.md`、`docs/`），改完再搜一遍。
2. **一个值一个真源。** 其余位置引用它或与它一致；不新增第二份真源，文档和本文件不抄版本号。
3. **按 `scripts/README.md` 的联动表联动。** 改左列，右列在同一个提交里一起改；表里没有的联动，按第 1 条自己找，并补进那张表和 `scripts/check-consistency.mjs`。
4. **断言兜底，不许绕。** `npm run check:consistency` 失败说明漏改了某处：去改那一处，不删断言、不放宽匹配、不加豁免；新增联动点时同步加断言和测试。
5. **主版本升级是迁移，不是改 `package.json`。** Node、Next.js、React、Tailwind、ESLint、TypeScript 的主版本变化按联动表逐项核对，本地跑对应构建；Dependabot 的主版本 PR 只是起点，在它的分支上补齐联动改动。
6. **PR 描述写明核对过的位置**：列出搜过的命令和命中的文件，不要只写“已核对”。

## 验证入口

- 提交前跑 `npm run verify`；每个检查做什么、E2E 与官网冒烟怎么跑，见 [scripts/README.md](scripts/README.md)。
- CI（`.github/workflows/`）跑同样的命令并加 CodeQL 与依赖审查；失败先在本地复现，不跳过、不禁用、不隔离测试来求绿。任务不按路径过滤（测试会读其他目录的文件；必需检查被跳过会一直 pending 阻塞合并，`check:consistency` 会拦），要少跑靠 Dependabot 分组与取消过期运行。

## 生成物与提交

- 不手改 `package-lock.json`（用 npm 11 的 `npm install`；`.claude/hooks/protect-generated-files.mjs` 拦截手改）。锁文件的 `resolved` 只指向 `registry.npmjs.org`：本机镜像会把加速地址写进锁文件，提交前跑 `npm run check:lockfiles -- --fix`。
- 提交信息用 Conventional Commits（`feat` / `fix` / `docs` / `test` / `chore` / `style` / `refactor`），正文写原因而不是复述 diff；一个提交对应一个完整的改动。新增依赖前跑 `npm audit --omit=dev`。
