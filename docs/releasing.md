# 发布与供应链

> 适用于仓库的 CI、安全扫描与发布流程。产品范围与交付状态以 [docs/v2/roadmap.md](v2/roadmap.md) 为准，本文不重复。
> 更新：2026-10-07。

## 1. 每次合并前自动验证什么

合并门禁是一个状态检查：`ci-pass`。它汇总下表的任务，任何一个失败、取消或被跳过都会让它失败。

| 工作流                  | 任务                                        | 验证内容                                                                                                                      |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | `extension`                                 | 格式、ESLint、类型、vitest、文档链接、锁文件注册表、联动一致性、构建、MV3 清单、Playwright E2E                                |
| `ci.yml`                | `website`                                   | 官网类型与构建                                                                                                                |
| `codeql.yml`            | `Analyze (javascript-typescript / actions)` | CodeQL 静态分析                                                                                                               |
| `dependency-review.yml` | `Dependency review`                         | 拦截引入 high / critical 已知漏洞依赖的 PR                                                                                    |
| `workflow-lint.yml`     | `actionlint`、`zizmor`                      | 工作流语法与安全（未固定的 action、模板注入、权限过宽、凭据残留）；每个 PR 都跑，不按路径过滤：被跳过的必需检查会一直 pending |

不在合并路径上的：

- `scheduled-audit.yml`：每周对运行时依赖做 `npm audit`。新公告不应让无关 PR 变红，所以不放进门禁。
- `scorecard.yml`：OpenSSF Scorecard，每周与分支保护变更时运行，结果进 Security 页。
- Dependabot（`.github/dependabot.yml`）：每个 Dependabot PR 都要跑完整门禁，所以要控制 PR 的数量。npm 与 GitHub Actions 每月更新；每个 npm 目录同时最多开 3 个版本更新 PR；每个目录只有一个 minor / patch 分组，主版本不分组（eslint 10 和 typescript 7 的两个独立 PR 曾被合成一个 “toolchain” 分组 PR，看起来像例行维护，红着就被合并了）；新版本先冷却 7 天。安全更新不受计划、冷却和数量上限限制。`ignore` 会同时拦住安全更新，所以只用在没有运行时暴露、且下一个主版本需要迁移的构建工具上：`@types/node`（跟 `.node-version`，手工一起升）、`tailwindcss`、`typescript`，以及 website 的 `eslint`；做完迁移就删掉对应条目。其余主版本 PR 是迁移的起点，按 [AGENTS.md「联动一致性」](../AGENTS.md#联动一致性强制)在它的分支上补齐，CI 红着不要合并。

所有第三方 action 都固定到完整 commit SHA（注释里写版本），默认 `permissions: {}`，每个任务只声明自己需要的权限，checkout 不保留凭据。更新由 Dependabot 提交。

## 2. 仓库设置（需要管理员一次性配置）

工作流文件不能替代下列设置，它们在仓库 Settings 里：

1. **分支规则**：导入 [`.github/rulesets/main.json`](../.github/rulesets/main.json)（Settings → Rules → Rulesets → Import）。它要求 PR、线性历史、禁止强推与删除，并要求 `ci-pass`、两个 CodeQL 任务、Dependency review、actionlint 与 zizmor 通过。管理员只能通过 PR 绕过，不能直接推送。首次导入前先让这些检查在一个 PR 上各跑一次，否则 GitHub 找不到要求的检查名。
2. **Actions 权限**：Settings → Actions → General：默认 `GITHUB_TOKEN` 设为只读；开启 “Require actions to be pinned to a full-length commit SHA”；fork PR 的工作流需要批准。
3. **Code security**：开启 secret scanning 与 push protection、Dependabot alerts 与 security updates、private vulnerability reporting（见 [SECURITY.md](../SECURITY.md)）。

## 3. 发布

### 浏览器扩展

给提交打标签 `v<package.json 的 version>`（例如 `v1.0.4`）。`release.yml` 先复用 `ci.yml` 跑完整门禁，再构建、校验压缩包里的 `manifest.json` 版本与标签一致、生成构建来源证明（attestation）并创建 GitHub Release。商店上传仍是手工步骤，上传前按下面的清单准备素材。

#### 扩展 ID 与更新测试

已发布扩展的 ID 是 `jpooljigbeplpgciohfjklgbfdfnnmfn`。本地加载的未打包构建 ID 不同；需要用同一个 ID 测试更新路径时，把商店后台“程序包 → 查看公钥”里的公钥放进环境变量再构建扩展，构建会把它写进清单的 `key`，未打包的扩展就拿到同一个 ID：

```bash
ANNHUB_EXTENSION_KEY='MIIBIjANBg…' npm run build
```

发布构建不设置这个变量。

#### 商店素材与披露

- 名称与描述来自 `locales/en.yaml` 和 `locales/zh_CN.yaml` 的 `extName` / `extDescription`（上限 75 / 132 字符，测试会检查）。
- 截图和宣传图用 `npm run store:assets` 从真实扩展截取：1280×800 的碎片库、选中文字、采集窗口和设置页，以及 440×280 小宣传图与 1400×560 题图，写入不入库的 `store-assets/`。素材可以由源码重现，所以不提交二进制文件，也就不会像手绘示意图那样过期。中文和英文各一套，分别写入 `store-assets/zh/` 和 `store-assets/en/`（[D-15](v2/validation.md)）：英文商店页必须配英文截图，截图里的界面语言由浏览器界面语言决定。
- 隐私政策与服务条款是 `website/public/privacy-policy.html` 和 `terms-of-service.html`（中英双语，商店填写它们的公开地址）。`utils/__tests__/legal-pages.test.ts` 保证政策里的权限表与 `wxt.config.ts` 一致、不含已移除的功能；改了数据流或权限，同步改政策和日期。
- 权限的用途说明见 [extension-permissions.md](extension-permissions.md)。
- 分发范围按 [D-08](v2/validation.md) 先用私有可见性。

### 校验下载的构建

```bash
gh attestation verify <下载的 zip> --repo genffy/annhub
```

## 4. 本地复现 CI

```bash
npm run verify                 # 格式、ESLint、类型、vitest、文档链接、锁文件注册表、联动一致性
npm run build && npx playwright test
```

工作流文件改动后，本地可用 [actionlint](https://github.com/rhysd/actionlint) 与 [zizmor](https://github.com/zizmorcore/zizmor) 检查，规则与 CI 相同。
