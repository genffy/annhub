# scripts/

仓库根的检查与 smoke 脚本都由 `package.json` 的 scripts 调用；每个脚本的职责见文件头注释。

## 体量预算

单个文件按字节设预算：`AGENTS.md`、`CLAUDE.md` 与 `notes/*.md` 8 KB（单行 ≤ 300 字符），其余 `*.md` 48 KB，测试 48 KB，代码 32 KB，CSS 40 KB。`docs/design/` 的原型素材、`scripts/data/`、html、json、yaml、锁文件、图片不设预算。预算是字节不是行数（中文一个字三字节）。

台账 `scripts/size-ledger.json` 记录已经超预算的存量文件，只降不升：台账里的文件不许再长（新代码进新文件）；变小后跑 `pnpm run check:size --lower` 记下新值，回到预算内条目自动删除；不手改台账（hook 会拦）。接近预算时按职责拆新文件，不按行数拆。

读取纪律：台账里的文件和超预算的文档不要整份读——先 `grep -n` 找标题或导出，再按行段读。

## 验证入口

- 提交前跑 `pnpm run verify`（format:check → lint → compile → vitest → check:docs → check:size → check:lockfiles → check:consistency）。`check:docs` 核对相对链接、`文档.md §N.M` 节号引用、被引用的编号有定义，以及正文的写法；格式由 Prettier 负责，ESLint 只管正确性。
- 扩展构建 `pnpm run build`（`.output` 不随源码自动重建）；浏览器 E2E 先构建再 `pnpm exec playwright test <spec>`，手工 Chrome 实测见 [e2e/README.md](../e2e/README.md)。
- 官网静态部署：`cd website && pnpm run build && pnpm run start`；另一个终端在仓库根运行 `WEBSITE_SMOKE_ORIGIN=http://localhost:3001 node scripts/smoke-website.mjs --local`。

## 联动表

环境、依赖、构建和部署的值同时写在多个文件里；规则见根目录 [AGENTS.md](../AGENTS.md) 的「联动一致性」，这里的表列出能列全的联动。改左列，右列在同一个提交里一起改；表里没有的联动，先 `git grep` 找全，并补进本表和 `check-consistency.mjs` 的断言。

| 改这里                                                       | 同一个提交里核对                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.node-version`（Node 的唯一真源）                           | 各 `package.json` 的 `engines.node` 和 `@types/node` 主版本；根 `README.md` 的运行环境；workflow 只用 `node-version-file`，不写死版本                                                                                                                                     |
| `website/package.json` 的 `next`、`react`                    | `eslint-config-next` 同主版本；`website/README.md` 的技术栈；`next.config.js` 的静态导出；`website/wrangler.json`；`cd website && pnpm run build`                                                                                                                         |
| `website/next.config.js` 的实验开关                          | `experimental.globalNotFound` 在 Next 主版本变化后先确认它还在、含义没变，再更新配置旁的复核注记；`check:consistency` 核对注记里的主版本                                                                                                                                  |
| `website/wrangler.json`、静态部署配置                        | `next.config.js` 的 `output: export`；`assets.directory` 与 CI 上传、下载目录；禁止 Worker 脚本与 `run_worker_first`；HTML 别名和 404；`lib/site.ts` 的域名；边缘规则与国家清单；CI 只发布同次运行且通过检查的 main 产物；[cloudflare/README.md](../cloudflare/README.md) |
| 官网生成类型与 `typecheck`                                   | `website/.gitignore` 忽略 `next-env.d.ts` 且 Git 不跟踪；`website/package.json` 的 `typecheck` 先 `next typegen` 再 `tsc`；CI 使用同一命令；`website/README.md`                                                                                                           |
| `website/` 读取的 `NEXT_PUBLIC_*` 变量                       | `cloudflare/production.json` 用同名字符串声明，只有生产构建读取；部署时的统计规则与是否有令牌一致；[website/README.md](../website/README.md) 的「部署」                                                                                                                   |
| `tailwindcss` 的主版本                                       | `postcss.config.*`（4 用 `@tailwindcss/postcss`，3 用 `tailwindcss` 插件）；样式入口与配置的写法；`.github/dependabot.yml` 里对它的 `ignore`；目视对比页面                                                                                                                |
| `typescript`、`eslint` 的主版本                              | `typescript-eslint`、`eslint-config-next` 内置插件的 peer 范围必须接受新版本，否则 `pnpm run lint` 崩溃；`.github/dependabot.yml` 里对它们的 `ignore`；本地跑 `pnpm run lint`                                                                                             |
| 新增、移动含 `package.json` 的目录                           | `.github/dependabot.yml`；`scheduled-audit.yml` 的矩阵；CI 里的安装与构建步骤；该目录自己的 `pnpm-lock.yaml`、`pnpm-workspace.yaml` 和与根一致的 `packageManager`；`website/wrangler.json`                                                                                |
| 根 `package.json` 的 `packageManager`（pnpm 版本的唯一真源） | 各 `package.json` 写同一个值；workflow 用 `pnpm/action-setup` 读它，不写死版本，跑 pnpm 的 job 先有这一步；workflow 里不出现 npm、npx                                                                                                                                     |
| `pnpm-workspace.yaml` 的 `allowBuilds`、`overrides`          | 扩展与官网各一份，互不继承；带安装脚本的新依赖会让安装停下，逐个写 `true` 或 `false`；`package.json` 里不留 `overrides`                                                                                                                                                   |
| `package.json` 的 `scripts`、CI 任务                         | `verify` 与 CI 运行同样的命令；`.github/rulesets/main.json` 的必需检查名；纯 Markdown/docs 的 PR 在 CI 里走 docs-only 快车道，跳过范围以 [ci.yml](../.github/workflows/ci.yml) 头注为准；本文件「验证入口」                                                               |
| 新增、移动或删除 skill                                       | `.agents/skills/<name>` 与 `.claude/skills/<name>` 同时存在且是同一个目录（一个是另一个的软链接）；只想手动调用时两边的开关都写上；`check:consistency` 核对目录                                                                                                           |
| `wxt.config.ts` 的权限与最低版本                             | [docs/product/permissions.md](../docs/product/permissions.md)；隐私政策页 `website/public/privacy-policy.html` 里的权限表（`utils/__tests__/legal-pages.test.ts` 核对它，不核对文档）；商店的权限说明；官网 `lib/site.ts` 的 `MIN_CHROME_VERSION`                         |
| 移动、重编号或删除被引用的节或编号                           | `check:docs` 兜底：引用不只在 `docs/`，源码、测试和 `docs/design/` 也有；引用与定义在同一个提交里一起改                                                                                                                                                                   |
| 官网组件的 `ah-*` 类名与样式选择器                           | 每个用到的 `ah-*` 类在官网样式里都有自己的规则（选择器里 `.类名` 开头一个复合选择器，后面不紧跟另一个类），`check:consistency` 核对                                                                                                                                       |
