# 发布与供应链

> 适用于仓库的 CI、安全扫描与发布流程。产品范围与交付状态以 [docs/v2/roadmap.md](v2/roadmap.md) 为准，本文不重复。
> 更新：2026-10-04。

## 1. 每次合并前自动验证什么

合并门禁是一个状态检查：`ci-pass`。它汇总下表的任务，任何一个失败、取消或被跳过都会让它失败。

| 工作流                  | 任务                                                | 验证内容                                                                                                                                  |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`                | `extension`                                         | 格式、ESLint、类型、vitest、文档链接、Swift 夹具与 TypeScript 源一致、构建、MV3 清单、Playwright E2E                                      |
| `ci.yml`                | `website`                                           | 官网类型与构建                                                                                                                            |
| `ci.yml`                | `swift-format`                                      | 固定 Swift 6.0.3 容器里的 `swift format lint --strict`，不随 Xcode 升级漂移                                                               |
| `ci.yml`                | `macos`                                             | `swift test`；用固定版本并校验摘要的 XcodeGen 生成工程，`xcodebuild` 无签名构建 Desktop；检查产物里的 `LSUIElement`、Bundle ID 和隐私清单 |
| `codeql.yml`            | `Analyze (javascript-typescript / actions / swift)` | CodeQL 静态分析；Swift 在 macOS 上手动构建后抽取                                                                                          |
| `dependency-review.yml` | `Dependency review`                                 | 拦截引入 high / critical 已知漏洞依赖的 PR                                                                                                |
| `workflow-lint.yml`     | `actionlint`、`zizmor`                              | 工作流语法与安全（未固定的 action、模板注入、权限过宽、凭据残留）                                                                         |

不在合并路径上的：

- `scheduled-audit.yml`：每周对运行时依赖做 `npm audit`。新公告不应让无关 PR 变红，所以不放进门禁。
- `scorecard.yml`：OpenSSF Scorecard，每周与分支保护变更时运行，结果进 Security 页。
- Dependabot（`.github/dependabot.yml`）：npm 与 GitHub Actions 每周更新，新版本先冷却 7 天；安全更新不受冷却限制。

所有第三方 action 都固定到完整 commit SHA（注释里写版本），默认 `permissions: {}`，每个任务只声明自己需要的权限，checkout 不保留凭据。更新由 Dependabot 提交。

## 2. 仓库设置（需要管理员一次性配置）

工作流文件不能替代下列设置，它们在仓库 Settings 里：

1. **分支规则**：导入 [`.github/rulesets/main.json`](../.github/rulesets/main.json)（Settings → Rules → Rulesets → Import）。它要求 PR、线性历史、禁止强推与删除，并要求 `ci-pass`、三个 CodeQL 任务、Dependency review、actionlint 与 zizmor 通过。管理员只能通过 PR 绕过，不能直接推送。首次导入前先让这些检查在一个 PR 上各跑一次，否则 GitHub 找不到要求的检查名。
2. **Actions 权限**：Settings → Actions → General：默认 `GITHUB_TOKEN` 设为只读；开启 “Require actions to be pinned to a full-length commit SHA”；fork PR 的工作流需要批准。
3. **Code security**：开启 secret scanning 与 push protection、Dependabot alerts 与 security updates、private vulnerability reporting（见 [SECURITY.md](../SECURITY.md)）。
4. **Environment `desktop-release`**：Desktop 发布用，放签名与公证的 secrets，并设置必需审批人。

## 3. 发布

### 浏览器扩展

给提交打标签 `v<package.json 的 version>`（例如 `v1.0.4`）。`release.yml` 先复用 `ci.yml` 跑完整门禁，再构建、校验压缩包里的 `manifest.json` 版本与标签一致、生成构建来源证明（attestation）并创建 GitHub Release。商店上传仍是手工步骤，上传前按下面的清单准备素材。

#### 扩展 ID 与本地联调

已发布扩展的 ID 是 `jpooljigbeplpgciohfjklgbfdfnnmfn`。Desktop 的本机服务只接受 `Origin: chrome-extension://<这个 ID>` 的浏览器请求（`DesktopHub.publishedExtensionIds`，[存储契约 §8](v2/storage.md)），其他扩展和网页都会被拒绝。

本地加载的未打包构建 ID 不同，所以连不上 Desktop。联调时把商店后台“程序包 → 查看公钥”里的公钥放进环境变量再构建，构建会把它写进清单的 `key`，未打包的扩展就拿到同一个 ID：

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

### Desktop

给提交打标签 `desktop-v<project.yml 的 MARKETING_VERSION>`。`release-desktop.yml` 在仓库变量 `DESKTOP_RELEASE_ENABLED` 为 `true` 之前整个跳过。启用后依次：门禁 → 导入证书到临时钥匙串 → `xcodebuild archive`（Developer ID 签名、hardened runtime）→ `notarytool` 公证并 staple → 打包 → 来源证明 → 创建 Release。

所需 secrets（放在 `desktop-release` environment）：

| Secret                                       | 内容                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `MACOS_CERTIFICATE_P12_BASE64`               | “Developer ID Application” 证书导出的 `.p12`，base64 |
| `MACOS_CERTIFICATE_PASSWORD`                 | 该 `.p12` 的密码                                     |
| `MACOS_TEAM_ID`                              | Apple 开发者团队 ID                                  |
| `NOTARY_API_KEY_P8_BASE64`                   | App Store Connect API 密钥（`.p8`），base64          |
| `NOTARY_API_KEY_ID` / `NOTARY_API_ISSUER_ID` | 该密钥的 Key ID 与 Issuer ID                         |

公证用 App Store Connect API 密钥而不是 Apple ID 密码：可按需撤销，不绑定个人账号。这条流水线还没有在真实证书上跑过，首次启用时在一个预发布标签上走一遍。

### 校验下载的构建

```bash
gh attestation verify <下载的 zip> --repo genffy/annhub
shasum -a 256 -c AnnHub-<version>-macos.zip.sha256
# 解压后（macOS）
spctl --assess --type execute --verbose=4 AnnHubDesktop.app
```

## 4. 本地复现 CI

```bash
npm run verify                 # 格式、ESLint、类型、vitest、文档链接
npm run build && npx playwright test
cd app && swift test           # 只能在 macOS 上
swift format lint --configuration .swift-format --strict --recursive Sources Tests Desktop Package.swift
```

工作流文件改动后，本地可用 [actionlint](https://github.com/rhysd/actionlint) 与 [zizmor](https://github.com/zizmorcore/zizmor) 检查，规则与 CI 相同。更新 `setup-xcodegen` 里的 XcodeGen 版本时，同时更新它的 SHA-256。
