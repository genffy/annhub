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

审查分支是 `chore/hardening-followups`（§1 第 10 条）。组间的先后：类型检查与 lint → 唤醒后台。类型检查与 lint 组里 RV-TEST-13 先做，后两条的新检查才覆盖得到 skill 里的脚本；唤醒后台在类型检查与 lint 之后做，新代码直接按收紧的规则写。

接手前先知道的几件事：

- `entrypoints/content/screenshot/index.ts` 离 32 KB 的代码预算只剩约 150 字节，`entrypoints/content/target-chain.ts` 约 600 字节，`entrypoints/library/settings-view.tsx` 约 800 字节：哪一条改到它们，先把一块挪进同目录的新文件，不进台账。
- `store-assets/` 被 git 忽略，只在产品负责人的检出里有，worktree 里没有：RV-TEST-13 的验收在 worktree 里自己建一个同名目录来验。
- 查工具的选项时读已安装版本的类型与文档（Vitest 的 `coverage.thresholds`、Playwright 的 `failOnFlakyTests`、typescript-eslint 的规则），不凭记忆写配置。

### 类型检查与 lint

#### RV-TEST-13 入库的商店截图脚本没有检查，被忽略的 `store-assets/` 反而被检查（中）

**问题**

- 商店截图脚本在 `.agents/skills/store-submission/shots/`，其中 `capture.spec.ts` 导入 `e2e/fixtures` 的 `test` 与 `e2e/helpers` 的七个函数。`eslint.config.js` 忽略整个 `.agents/**`；根 `tsconfig.json` 不写 `include`，默认的通配不进以点开头的目录。类型检查与 lint 都不读这三个文件：`e2e/helpers.ts` 里的函数改名或改签名，商店截图流程要到下次发布才发现跑不起来。
- 反过来，根 `tsconfig.json` 只排除 `node_modules` 与 `website`，ESLint 也不忽略 `store-assets/`。产品负责人的检出里，被 git 忽略的 `store-assets/` 有两份存档里的 `playwright.config.ts`（`archive-v2.0.0/`、`archive-v2.1.0/`），本机的 `pnpm run compile` 与 `pnpm run lint` 会读它们，本机与 CI 检查的文件因此不同；以后存档里再放脚本也一样。

**要求**

1. `.agents/skills/store-submission/shots/*.ts` 进入 `pnpm run compile` 的类型检查与 `pnpm run lint`。其余 skill 照旧不查；`.claude/skills/` 是软链接，同一份文件不查两遍。
2. `tsconfig.json` 与 `eslint.config.js` 明确排除 `store-assets/`，并注明原因：它只放每次发布的成品与存档，不入库。

**验收**

1. `pnpm exec tsc --noEmit --listFilesOnly -p tsconfig.json` 列出 skill 里的 `capture.spec.ts`，不列出 `store-assets/` 下的任何文件。在 worktree 里自己建一个 `store-assets/`，放一个有类型错误、也违反 lint 规则的 `.ts`，`pnpm run compile` 与 `pnpm run lint` 仍通过。
2. 临时给 `capture.spec.ts` 用到的一个 helper 改名，`pnpm run compile` 在 `capture.spec.ts` 报错。
3. `pnpm run verify` 通过。

#### RV-TEST-17 `tsconfig.json` 还有三项检查没开（低）

**问题**

- 根 `tsconfig.json` 自己写了一套选项，没有继承 WXT 生成的 `.wxt/tsconfig.json`；后者开着的 `verbatimModuleSyntax` 与 `noImplicitOverride` 在根配置里没开。打开后都是 0 处错误。
- `exactOptionalPropertyTypes` 没开，打开后 62 处错误：`entrypoints/` 23、`background-service/` 21、`core/` 15、`utils/` 2、`e2e/` 1。消息走 JSON，值为 `undefined` 的字段在传输中消失，所以协议用 `null` 表示清除（`background-service/AGENTS.md`）；这个选项在类型上分开“字段是 `undefined`”和“没有这个字段”，兜住的正是这类写法。

**要求**

1. 打开这三项；`tsconfig.worker.json` 继承根配置，一起生效。
2. 62 处按含义改：表示“没有”的去掉字段或用条件展开，表示“清除”的按协议用 `null`；不用 `as` 绕过。

**验收**

1. `pnpm run compile` 通过；临时给一个可选字段赋 `undefined`，编译失败。
2. 改动前后 `pnpm run build` 的 `content.js` 与 `background.js` 字节数写进交付说明，有差异就说明来源。
3. `pnpm run verify` 通过；动到哪个入口，跑那个目录 `AGENTS.md`「验证」里列的 E2E。

#### RV-TEST-18 带类型信息的 lint 还差一档（低）

**问题**

- `eslint.config.js` 读类型的规则只有五条。typescript-eslint 的 `recommendedTypeChecked` 其余的规则里，`unbound-method` 以外在发布代码（不含测试、`e2e/` 与 `scripts/`）里有违例的是八条，一共 33 处，其余规则没有违例：
  - `no-unsafe-member-access` 8、`no-unsafe-assignment` 6、`no-unsafe-return` 1，在 `background-service/services/download/index.ts`、`background-service/services/recording/index.ts`、`entrypoints/offscreen/main.ts`、`utils/message/index.ts`：从 `chrome.*` 事件、端口与消息拿到的 `any` 没经收窄就往下用，这些地方正是不可信输入进来的边界。
  - `only-throw-error` 6，都在 `entrypoints/content/screenshot/stitcher.ts`：抛出的不是 `Error`。
  - `require-await` 7，在 `background-service/event-handlers/installation-handler.ts`、`background-service/services/system/index.ts`、`core/store.ts`、`entrypoints/content/screenshot/index.ts`、`entrypoints/library/App.tsx`、`entrypoints/offscreen/download-extract.ts`。
  - `no-redundant-type-constituents` 3（`entrypoints/content/screenshot/drag-frame.ts`、`picking-chrome.ts`）、`restrict-template-expressions` 1（`core/export.ts`）、`no-base-to-string` 1（`entrypoints/library/settings-view.tsx`）。
- 测试与 e2e 里同样的规则约 300 处，多是桩函数与 mock，收益小。

**要求**

1. 发布代码打开 `recommendedTypeChecked` 的全部规则（`unbound-method` 除外），都设为 `error`；测试、`e2e/`、`scripts/` 不开。33 处一次清掉。
2. `any` 在边界处收窄：用已有的校验函数或类型守卫，不用 `as` 断言。`stitcher.ts` 改抛 `Error` 或它的子类，失败码不变。
3. `require-await` 的命中处要么去掉 `async`，要么在旁边写明为什么保持 async；`command-handler.ts`、`installation-handler.ts` 的监听器照旧保持 async（理由已写在它们旁边）。
4. `unbound-method`（发布代码 86 处，多是接口用方法写法引起的误报）与 `no-unnecessary-condition`（138 处）不开。

**验收**

1. `pnpm run lint` 通过；在一个非测试文件里临时写 `JSON.parse(text).a.b`，lint 失败。
2. `pnpm run verify` 通过；动到哪个入口，跑那个目录 `AGENTS.md`「验证」里列的 E2E。

### 唤醒后台

#### RV-CAP-19 打开网页就唤醒 service worker，同源子框架的光标高亮只认加载时的录制状态（中）

**问题**

- `entrypoints/content/index.tsx` 的 `wireCursorHighlight` 在每个页面、以及其中每个同源子框架启动时都发 `RECORDING_STATUS`；`wireBlockEntries` 在每个页面第一次停在区块上时发 `GET_SETTINGS`。worker 空闲 30 秒被挂起，这两条消息每次都把它拉起来、重新初始化服务，日常浏览里它几乎不休眠。`background-service/AGENTS.md` 为了不让“改一次标题就唤醒 worker”，把标签页监听器做成只在需要时挂着；这两处与那个取舍相反。
- 按代码推断，没有在浏览器里复现：同源子框架靠启动时那次询问打开光标高亮，却不理会停止。`services/recording` 把 `RECORDING_LIFECYCLE` 发给整个标签页，子框架的监听器一开头就返回。所以录制停止以后，指针移到这个 iframe 上光标高亮还在，违反 [annotate.md §3.3](product/annotate.md)；iframe 加载之后才开始的录制，iframe 里也没有光标高亮。[annotate.md §3.2](product/annotate.md) 只把另一个来源的 iframe 列为限制。

**要求**

1. 先复现子框架的情形，写成 E2E，用例名带本编号：用 `e2e/iframe-host.html` 一类的同源 iframe 夹具，打开光标高亮录制，停止之后指针移到 iframe 上。
2. 子框架的光标高亮与顶层一样跟着录制的开始与停止；批注层仍只属于顶层框架。
3. 按 D-100 的默认，普通的页面加载与第一次停在区块上都不唤醒 worker；结论写进归属文档、删掉 D-100，与实现在同一组里完成（[validation.md §2](product/validation.md)）。
4. 不加权限；`chrome.storage.session` 的访问级别不放开（`background-service/AGENTS.md`）。

**验收**

1. 复现用例改动前失败、改动后通过。
2. 新的 E2E：用 `e2e/helpers.ts` 的 `stopServiceWorker` 停掉 worker，打开带同源 iframe 的页面，停在一个区块上直到胶囊出现，worker 没有被重新启动（用 CDP 的 ServiceWorker 域看运行状态，`stopServiceWorker` 用的也是它）；区块入口的开关与已停用网站的设置照常生效（`e2e/block-clip.spec.ts`）。
3. `pnpm run verify` 通过；`e2e/recording-annotation.spec.ts`、`e2e/block-clip.spec.ts`、`e2e/cold-start.spec.ts` 通过。

## 3. 已知问题

#### RV-CORE-11 列表查询的内存摘要随 service worker 回收（低）

- 现象与位置：`core/store.ts` 的 `summaries` 与 `textFields` 缓存在 worker 的 `EntryStore` 实例里，worker 空闲 30 秒被回收后，下一次查询把摘要整表重新读进内存。
- 为什么现在不修：实测（`e2e/query-latency.spec.ts`，真机 Chrome，评审口径的 10,000 条正文体量，多次运行）冷查询（worker 停止后的首次 `QUERY_ENTRIES`，含 worker 启动与摘要整表重读）224–367 ms，热查询 200–211 ms，均在 `background-service/AGENTS.md`「重启后每个视图 2.5 秒内就绪」预算的一半以下，用户感知不到。改为页面直读要引入第二条查询路径与 `annhub.entries` 广播的缓存失效，代价大于收益。
- 影响与绕行：资料库页面活得比 worker 久，每次 worker 回收后的第一个列表查询多付约 0.1–0.2 秒；无绕行，也无需绕行。
- 锁定当前行为的用例：`e2e/query-latency.spec.ts`（用例名带本编号）持续测量并打印两个数字，断言两条路径都成功。
- 什么情况下重新处理：实测冷查询超过 500 ms，或条目体量口径（评审的 10,000 条 / 65 MB）被上调后重新测量越线；届时把「页面直读，用现有的 `annhub.entries` 广播让缓存失效」的方案与取舍登记进 `docs/product/validation.md`，由产品负责人决定。

其他条目按 §1 第 2 条写：现象与位置、为什么现在不修、影响与绕行、锁定当前行为的用例、什么情况下重新处理。
