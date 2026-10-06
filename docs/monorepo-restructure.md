# Monorepo 重组方案

> 更新时间：2026-10-07。状态：**方案已确认，待实施**。实施前置条件：feat/annhub-phase1 稳定并合入 main。产品收窄为浏览器扩展（[D-17](./v2/validation.md)）后，Desktop 不再是工作区的一员，本方案已去掉对应的包与阶段，其余没有重新评估。
> 本文档是工程归位方案，不是产品契约；产品边界与目标契约见 [v2 产品文档](./v2/README.md)，`docs/v2/` 不规定包结构。

## 背景与目标

仓库当前是"根 package.json 即扩展包"的平铺结构，混杂 TS 扩展和 Next.js 官网两个可独立交付的产品。重组目标：

1. 按产品与复用边界划分 workspace 包，目录语义与最终交付物一致；
2. 消除模块间的错误依赖方向（background-service 反向依赖 entrypoints）；
3. 全程**只归位、不重写**：不动模块内部布局、不改运行时行为、不动消息协议，保证每个阶段收口时存量测试全绿。

## 已确认决策（2026-09-24）

| 决策点               | 结论                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| 包管理器             | pnpm workspace；不引入 Turborepo（当前 JS 包规模不值得构建编排器）                        |
| 实施时机             | 先稳定 feat/annhub-phase1 并合入 main，再从 main 开 `chore/monorepo-restructure`          |
| 死引用               | `build:sidebar` / `check:sidebar`（引用不存在的 `scripts/build-sidebar.js`）在阶段 1 删除 |
| 共享包               | `types` + `utils` 合并为 `@annhub/shared` 单包                                            |
| Python memory server | **已退役**（2026-09-24 执行）：`server/` 整目录删除，扩展侧 memory-sync 接线全摘          |

## 目标结构

```text
annhub/
├── package.json              # 工作区根：scripts 聚合 + 共享 devDeps（typescript/prettier/vitest）
├── pnpm-workspace.yaml       # packages: packages/*, apps/*
├── packages/
│   ├── learning-core/        # @annhub/learning-core —— TS 领域核心，仅外部依赖（nanoid/idb）
│   └── shared/               # @annhub/shared —— types + utils，依赖 learning-core
├── apps/
│   ├── extension/            # WXT 扩展：entrypoints + background-service + components
│   │                         #   + styles/locales/public/assets/constants.ts + wxt/tailwind/postcss 配置
│   └── website/              # Next.js 官网（已是独立包 @annhub/client）
├── e2e/                      # Playwright 留根：跨构建产物的验收层，由根门禁驱动
├── docs/ · scripts/ · .github/
```

包依赖方向（箭头为被依赖方）：

```text
@annhub/learning-core  ◀──  @annhub/shared  ◀──  apps/extension
```

## 关键技术决策

1. **内部包以 TS 源码形态消费**：`@annhub/*` 的 `main`/`exports` 直接指向 `src/index.ts`，不预编译。WXT/Vite、vitest、tsc 各自编译，无 dual-package 与产物同步问题，对扩展打包零副作用。
2. **vitest 保持根级单一配置**：`include` 改为 `['packages/**/*.test.ts', 'apps/extension/**/*.test.ts']`，不拆 per-package project——这是"存量测试全绿"的最稳路径。测试文件仍与源码同级放 `__tests__/`（见 e2e/AGENTS.md 约定）。
3. **compile 透传**：各包自带 tsconfig；extension 的 tsconfig 继续 extends 包内 `.wxt/tsconfig.json`（postinstall 在包内执行 `wxt prepare`）；根 `npm run compile` 透传为 `pnpm -r compile`。对外命令名（`compile`/`test`/`build`/`test:e2e`）全部保留。
4. **git 历史**：全部用 `git mv`，PR 以 rename 为主、可 review。
5. **E2E 路径**：`e2e/fixtures.ts` 与 global-setup 改指 `apps/extension/.output/chrome-mv3`；Chrome 手工实测流程按 e2e/README 同步。

## 分阶段实施

每阶段收口必须全量门禁绿，再进入下一阶段。

| 阶段                     | 内容                                                                                                                                                                                                                                                                                                                                                             | 验证门禁                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0 基线                   | main 上跑全量门禁并存档结果；删除 Desktop 与复习（D-17）移除了一批实现和测试，基线在这之后取                                                                                                                                                                                                                                                                     | compile / vitest / build / e2e 全量，结果记入下方基线表        |
| 1 workspace 骨架         | 引入 pnpm-workspace.yaml（lockfile 更换、node_modules 重装）；website → `apps/website`；根 scripts 与 `.npmrc` 迁移；删 `build:sidebar` 死引用                                                                                                                                                                                                                   | website build；扩展 compile+test+build 全绿（扩展代码未动）    |
| 2 抽 learning-core       | `git mv` → `packages/learning-core`，建包 package.json/tsconfig；全仓消费方 import 改包名                                                                                                                                                                                                                                                                        | vitest 全量、compile、build、E2E 抽测（fragment 相关）         |
| 3 抽 shared + 消反向依赖 | types+utils → `packages/shared`；import 全仓改包名                                                                                                                                                                                                                                                                                                               | 同上                                                           |
| 4 扩展归位               | entrypoints/background-service/components/… → `apps/extension/`；`wxt prepare` 在包内跑；e2e fixtures 与 global-setup 改路径；按 e2e/README 更新 Chrome 手工实测路径                                                                                                                                                                                             | compile、vitest 全量、build、**E2E 全量**、Chrome 手工装载冒烟 |
| 5 文档与配置收尾         | 重写根/各包 AGENTS.md 路径表（规则随模块迁移、删失效路径）；README、docs 内源码路径引用全仓扫描；CI workflow 路径；.gitignore/.prettierignore/.zcodeignore/.vscode；netlify.toml 归位 website（`base`、`ignore` 里的 `:/website`、`NODE_VERSION` 一并改，见 [website/README.md](../website/README.md) 的「部署」；`npm run check:consistency` 会指出漏改的位置） | **终局全量门禁，测试数与阶段 0 基线逐项对齐**                  |

## 基线

2026-09-24 记录的数字（482 个单测、45 个 E2E 用例等）已过期：输出工坊、关系、Desktop 与复习的实现和测试先后被移除。阶段 0 重新测量后写在这里。

## 风险与对策

| 风险                      | 对策                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| WXT 对 workspace 包的打包 | 内部包不预编译、以 TS 源被 Vite 处理；阶段 2 落地即跑 build+E2E 验证 |
| `.wxt` 生成时序           | postinstall 与 CI 安装顺序在阶段 4 重点验证                          |
| 测试散布深层目录          | vitest include 用目录前缀而非仅顶层；阶段 0 固化文件清单对照         |
| pnpm 换装                 | 放阶段 1 开头，此时扩展代码未动，问题易定位                          |
