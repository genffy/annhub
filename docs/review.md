# 审查问题

代码审查发现的问题登记在这里，直到修好或被接受为已知问题。修好的条目从本文删除，编号留在锁定它的测试用例名里；所以本文只有还没处理的问题（§2）和已知问题（§3），不随迭代变长。

## 1. 规则

1. **编号** `RV-<区域>-<序号>`，稳定、不复用。区域：`BG` 后台、`CORE` 领域核心、`LIB` 资料库与扩展页、`CAP` 页面采集、`TEST` 测试设施、`REC` 录屏、`DL` 下载、`DOC` 文档与约定。新序号取该区域用过的最大值加一，用过的编号这样列出：`git log -p -G 'RV-[A-Z]+-[0-9]' | grep -ohE 'RV-[A-Z]+-[0-9]+' | sort -u`。
2. **只有两种去向**，都在处理它的那一组里完成，合并时不留第三种：
   - 修好：删掉条目；产品可见的行为写进归属规格；至少一个测试用例的名字带编号，有归属规格时同时带规格节号，如 `it('… (annotate.md §3.3, RV-REC-02)')`，改动前失败、改动后通过。这个用例只在产品方向改变、规格那一节随之改写时一起改或删。
   - 接受为已知问题：条目移到 §3，补上为什么现在不修、影响与绕行、什么情况下重新处理；产品可见的局限用现在时写进归属规格；加一个锁定当前行为的用例，名字带编号。以后修好时，这个用例改成断言修好的行为，条目删掉。
3. **纯文档的条目**（`DOC`）没有可测的行为：能用 `check:docs` 或 `check:consistency` 的断言兜住的，加断言和它的测试；兜不住的，修好直接删。
4. **门禁**：审查分支的 §2 为空才合并进 main，main 上的 §2 因此总是空的；§3 的每一条都有锁定当前行为的用例，由产品负责人在发布前确认仍然接受（[roadmap.md §4](product/roadmap.md)）。
5. **不进本文的**：超出字节预算的文件由 `scripts/size-ledger.json` 登记；待确认的产品决策、风险与开放问题进 [validation.md](product/validation.md)，条目里只写它们的编号；候选的新功能是 GitHub issue。
6. **条目写法**：问题（现象、位置、违反的规格）、要求、验收（编号列表，验收者逐条核对）。代码位置写文件与函数名，不写行号。相关的条目编成一组，一组一个 worktree（第 10 条），组内每条一个提交；组间的先后写在 §2 开头，一组合并时一起改。
7. **交付**：执行者在 worktree 里做完，交给验收者一份交付说明：照 `.github/pull_request_template.md` 逐项核对（review.md 那一项只看本组的条目），另外给出每条验收的证据（命令输出、测试名、截图或真机步骤）、改动前失败的那次输出，以及 `git diff --stat <审查分支>...HEAD`，越出这一组的文件写明原因。没做的检查写“未做”和原因。
8. **验收**：验收者在这一组的 worktree 里自己重跑 `pnpm run verify`，动了扩展代码的再 `pnpm run build` 并跑这一组列出的 E2E，只写在交付说明里的结果不采信。逐条核对验收项：测试类读断言，确认测的就是那条说的情形；命令类自己跑；执行者做不了的真机项，验收者在真实 Chrome 里补做，记下版本与步骤。不通过就写明哪条、看到的现象和复现命令，执行者在同一个 worktree 里接着改。
9. **通用要求**：不手改 `pnpm-lock.yaml`，不加依赖与扩展权限；日志、指标与 `chrome.storage` 里不存密钥、页面正文或附件内容，`storage.session` 里也不存页面标题；不跳过、不禁用测试，不放宽任何 `check:*` 断言；行为变了，规格、用户故事与代码在同一组里改。
10. **审查分支**：条目登记在审查分支上，也在这条分支上消除，同一时间只有一条。主工作区（仓库本身的检出，不是另拉的 worktree）检出它，只做登记与合并，合并前不留未提交的改动。每组从审查分支拉一个 worktree，执行与验收都在里面；各组的分支不推到 GitHub：执行、验收与合并都在本机，不为每一组和外部环境往返。main 有了新提交，在主工作区把 main 合并进审查分支并跑 `pnpm run verify`；不变基，各组的 worktree 是从它拉出的。
11. **合并**：验收通过才合并，执行者不合并自己的分支。合并前在 worktree 里并入审查分支的最新提交、重跑 `pnpm run verify`，再在主工作区用 `git merge --ff-only` 合并，审查分支上落下的就是跑过检查的那个提交。并入时 review.md 可能冲突（各组删的是相邻的节），保留别组的节；别的文件也冲突，说明两组改的代码相交，回到验收。合并后删掉 worktree 与它的分支。

## 2. 待处理

这些条目都在 `chore/engineering-hardening` 分支上消除：一条一个提交，不拆 PR，§2 清空后整条分支合并。分支上已有的提交见 `git log origin/main..HEAD`，它们的结论不在这里重复。

组间的先后：测试设施 → 消息协议 → 内容脚本体积 → 热点文件 → 数据访问路径；「归位与流程」与其他组无关，随时可做；「收尾验证」最后做。

接手前先知道的几件事：

- 包管理器是 pnpm。给脚本传参直接写在后面，不加 `--`（pnpm 会把 `--` 原样交给脚本，官网的生产构建是 `pnpm run build --production`）；跑依赖里的命令用 `pnpm exec`；本机 registry 是镜像时 `pnpm audit` 要带 `--registry https://registry.npmjs.org`。
- 每个提交之前跑 `pnpm run verify`；相关 E2E 直接跑，global-setup 会自动重建过期的构建（`scripts/build-freshness.ts`）。
- 根 `AGENTS.md` 与 `background-service/AGENTS.md` 离 8 KB 上限只差几个字节：新约定写进同目录的 `notes/` 或 `scripts/README.md`，不往这两个文件里加。
- 依赖方向由 `eslint.config.js` 的 `no-restricted-imports` 守，worker 一侧由 `tsconfig.worker.json` 不带 DOM 库再查一遍；`utils/` 的导出不是全局变量，用到就 import。
- `command-handler.ts`、`installation-handler.ts` 的监听器保持 async：它们的测试 await 监听器的返回值。
- 查不熟悉的工具行为时读已安装版本的文档或源码（pnpm 12、vitest 5、wxt 0.21 都比常见资料新），不凭记忆写配置。

### 内容脚本体积

量法：构建后看 `.output/chrome-mv3/` 的文件大小；各部分的占比用 esbuild 单独打包那一部分（minify）得到。

### 热点文件

### 数据访问路径

#### RV-CORE-11 列表查询的内存摘要随 service worker 回收（低，先测量）

**问题**

- `core/store.ts` 的 `summaries` 与 `textFields` 缓存在 worker 的 `EntryStore` 实例里。worker 空闲 30 秒被回收，下一次查询要把摘要整表重新读进内存；`background-service/AGENTS.md` 为此给了“重启后每个视图 2.5 秒内就绪”的预算（1 万条）。资料库页面活得比 worker 久，而且同源，可以直接读 IndexedDB。
- 现在没有数字说明冷查询在真实体量下用户是否感觉得到。

**要求**

1. 本条只测量，不改查询路径。用 `e2e/library-browse.spec.ts` 的 `seedRealisticLibrary` 量 worker 冷启动后的首次查询与热查询。
2. 冷查询超过 500 ms 时，把“页面直读，用现有的 `annhub.entries` 广播让缓存失效”的方案与取舍登记进 `docs/product/validation.md`（新的 `D-` 编号），由产品负责人决定。
3. 冷查询不到 500 ms 时，本条按 §1 第 2 条移到 §3，写明数字。

**验收**

1. 测量的命令与结果写在交付说明里，可重跑。
2. 条目按要求 2 或 3 有了去向。

### 归位与流程

#### RV-TEST-11 官网的测试放在扩展的 `utils/__tests__/` 里（低）

**问题**

- `utils/__tests__/` 下的 `website.test.ts`、`website-consent.test.ts`、`website-search.test.ts`、`website-not-found-copy.test.ts`、`legal-pages.test.ts`、`token-parity.test.ts` 测的是 `website/` 的源码或跨目录的一致性，与 `utils/` 无关。根 `vitest.config.ts` 与根 `tsconfig.json` 都排除 `website/`，所以它们只能待在外面。

**要求**

1. 挪到说得出职责的位置：仓库根下一个专门的目录，或 `website/__tests__/`（那样要调 vitest 的 include 与两个 tsconfig）。二选一，不给 `website/` 增加测试依赖。
2. 一起改指向旧路径的地方：`website/README.md`、`scripts/README.md`、`.github/workflows/ci.yml` 头注里点名的两个文件、`scripts/check-consistency.mjs` 里的说明。

**验收**

1. `utils/__tests__/` 里没有这六个文件；`pnpm test` 的用例数不变。
2. `git grep -nE "utils/__tests__/(website|legal-pages|token-parity)"` 无结果。

#### RV-DOC-04 商店提交流程只存在于一台机器上（中）

**问题**

- `store-assets/` 整个被 `.gitignore` 忽略。里面有两种语言的商店文案（`listing-en.md`、`listing-zh.md`）、提交说明（`SUBMIT.md`），以及生成商店截图的 Playwright 脚本与演示页（`capture.spec.ts`、`content.ts`、`playwright.config.ts`、`demo-article*.html`、`promo.html`）。流程和脚本不在版本控制里，换一台机器就没有了，也没有检查能发现它和产品文档漂移。

**要求**

1. 做成只允许手动调用的 skill：正本在 `.agents/skills/<name>/`，`.claude/skills/<name>` 是软链接，两边的手动开关都写上（根 `AGENTS.md` 的「Agent skills」），`check:consistency` 核对目录。
2. skill 固化不随版本变的部分：发布链路（改 `package.json` 的版本，PR，打 `v<version>` 标签，`release.yml` 产出带构建证明的 zip，`gh release download` 与 `gh attestation verify`，上传商店）；截图生成脚本与演示页；文案的结构和每个字段的出处（权限说明以 `docs/product/permissions.md` 为准，隐私披露以 `website/public/privacy-policy.html` 为准）；提交前的核对清单。
3. 每次发布才变的东西（zip、截图成品、校验和、各版本的存档）继续留在被忽略的 `store-assets/`；`.gitignore` 里那一行挪出 ZCode 段并注明原因。
4. 文案正文是否入库由产品负责人决定；入库就放进 skill 的 `references/`，接受 `check:docs` 的写法检查。
5. skill 里不写日期、版本号和逐版本的记录。

**验收**

1. 在干净检出里照 skill 能生成两种语言各五张 1280×800 的截图。
2. `SUBMIT.md` 里每个版本都重复的内容，都能在 skill 里找到。
3. `pnpm run check:consistency` 与 `pnpm run check:docs` 通过。

### 收尾验证

#### RV-TEST-12 分支上有只能在 CI 与全量 E2E 里验证的改动（高）

**问题**

- 分支把包管理器换成了 pnpm，改了全部 workflow。本机没有 actionlint 与 zizmor，下面这些没有运行过：`pnpm/action-setup` 与 `actions/setup-node` 的 `cache: pnpm` 配合；`scheduled-audit.yml` 的 `pnpm audit --prod --audit-level high`；`deploy-website` 的 `pnpm dlx "wrangler@$WRANGLER_VERSION" deploy`（本机只跑过 `--version`）；Dependabot 读两份 `pnpm-lock.yaml`；依赖审查。
- E2E 没有全量跑过。这些文件只改了类型写法，通过了类型检查，没有执行：`e2e/page-annotation.spec.ts`、`e2e/recording-annotation.spec.ts`、`e2e/screenshot-stitch.spec.ts`、`e2e/screenshot-frame.spec.ts`、`e2e/screenshot-watermark.spec.ts`、`e2e/library-layout.spec.ts`、`e2e/library-layout-cards.spec.ts`、`e2e/page-shapes.spec.ts`。

**要求**

1. 本机全量跑一遍：`pnpm run build`，再 `pnpm exec playwright test`。
2. 推分支、开 PR，六个必需检查全绿；红了先在本地复现（`.claude/skills/babysit/SKILL.md`），不跳过、不放宽。
3. PR 描述按根 `AGENTS.md`「联动一致性」第 6 条列出搜过的命令和命中的文件；包管理器迁移那一步搜的是 `git grep -nIE "npm (ci|run|install|test|exec|audit)|npx |package-lock"`。
4. 合并后的第一次 main 运行：确认 `deploy-website` 成功，或在部署开关关着时确认它被跳过；确认 Dependabot 下一次运行能解析两个目录。

**验收**

1. 全量 E2E 通过，失败的用例都有结论。
2. PR 上六个必需检查通过。
3. 要求 4 的两项有结果；出了问题登记成新的条目。

## 3. 已知问题

没有条目。接受一条已知问题时按 §1 第 2 条写：现象与位置、为什么现在不修、影响与绕行、锁定当前行为的用例、什么情况下重新处理。
