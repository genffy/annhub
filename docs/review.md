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
- 每个提交之前跑 `pnpm run verify`；动了扩展源码，`pnpm run build` 之后再跑相关 E2E（RV-TEST-09 做完之前，`.output` 不随源码重建）。
- 根 `AGENTS.md` 与 `background-service/AGENTS.md` 离 8 KB 上限只差几个字节：新约定写进同目录的 `notes/` 或 `scripts/README.md`，不往这两个文件里加。
- 依赖方向由 `eslint.config.js` 的 `no-restricted-imports` 守，worker 一侧由 `tsconfig.worker.json` 不带 DOM 库再查一遍；`utils/` 的导出不是全局变量，用到就 import。
- `command-handler.ts`、`installation-handler.ts` 的监听器保持 async：它们的测试 await 监听器的返回值。
- 查不熟悉的工具行为时读已安装版本的文档或源码（pnpm 12、vitest 5、wxt 0.21 都比常见资料新），不凭记忆写配置。

### 测试设施

#### RV-TEST-08 单测全部在 jsdom 里跑，覆盖率跑不起来（中）

**问题**

- `vitest.config.ts` 给全部测试文件用 jsdom 环境；`pnpm test` 末尾 Vitest 自己的统计显示创建 jsdom 占掉约六成时间。`core/`、`background-service/`、`utils/`、`entrypoints/offscreen/`、`scripts/` 的测试不碰 DOM。
- `core/AGENTS.md` 说 `core/` 不依赖 DOM，但它的测试跑在有 DOM 的环境里，用了也不会失败。
- `vitest.config.ts` 配了 `coverage.reportsDirectory`，仓库却没有装覆盖率 provider，`vitest run --coverage` 跑不起来。

**要求**

1. 用 Vitest 的 `projects` 把不碰 DOM 的目录放进 node 环境，`entrypoints/content/`、`entrypoints/library/`、`entrypoints/popup/` 留在 jsdom。个别文件需要 DOM 时用 `// @vitest-environment jsdom` 逐文件声明，不把整个目录退回 jsdom。
2. `vitest.setup.ts` 设置 `navigator.language` 的做法在 node 环境里也要成立。
3. 装 `@vitest/coverage-v8`（先 `pnpm audit --prod`）。给 `core/**` 设行、分支、函数三个阈值，取当前实测值向下取整；阈值只升不降。
4. `verify` 与 CI 的 unit job 跑同一条带覆盖率的命令。`scripts/check-consistency.mjs` 有两条断言认 `pnpm test` 这个写法（verify 的每条命令要原样出现在 `ci.yml`；单测步骤不得依赖 docs-only 分类），命令变了就同步改断言和它们的测试。
5. `scripts/README.md` 的「验证入口」写上覆盖率门槛。

**验收**

1. `pnpm test` 的统计里，jsdom 的创建次数不超过留在 jsdom 的测试文件数；全部用例通过，用例数不少于改动之前。
2. 在 `core/` 的测试里临时用到 `document`，该用例失败。
3. 临时删掉 `core/` 里一个测试文件，覆盖率门槛让 `pnpm run verify` 失败。
4. `pnpm run check:consistency` 通过。

#### RV-TEST-09 E2E 会拿过期的构建来测（中）

**问题**

- `e2e/global-setup.ts` 只在 `.output/chrome-mv3` 不存在或 `BUILD_FORCE=1` 时构建。源码改了而没有重建，E2E 测的是上一次的产物，结果是绿的。
- “改源码必须先重建”靠人记，写在 `e2e/AGENTS.md`、`e2e/README.md`、`entrypoints/content/AGENTS.md`、`entrypoints/content/screenshot/AGENTS.md`、`entrypoints/library/AGENTS.md`、`scripts/README.md` 六处。

**要求**

1. 构建输入里有文件比 `.output/chrome-mv3/manifest.json` 新，global-setup 就重建，并打印是哪个文件触发的。构建输入是 `entrypoints/`、`background-service/`、`core/`、`utils/`、`types/`、`styles/`、`locales/`、`public/`、`assets/`、`constants.ts`、`wxt.config.ts`、`package.json`、`pnpm-lock.yaml`、`tsconfig*.json`，不含 `__tests__/` 与 `*.test.*`。
2. 判断写成 `scripts/` 下的纯函数并配单测（`e2e/` 不在 vitest 的范围里），`e2e/global-setup.ts` 调用它。`BUILD_FORCE=1` 保留。
3. 上面六处文档改成现在的行为，删掉要求手动重建的句子；`e2e/real-chrome-scenarios.md` 的手工步骤不动。

**验收**

1. 改一个源码文件后直接跑 `pnpm exec playwright test e2e/cold-start.spec.ts`，日志显示先重建；只改 spec 文件时不重建。
2. CI 的 e2e job 在自己的构建步骤之后不再构建第二次（看 global-setup 的日志）。
3. 单测覆盖四种情形：输入更新、输入不更新、构建目录不存在、只有测试文件更新。

### 消息协议

#### RV-BG-12 消息协议只约束请求，不约束响应（中）

**问题**

- `MessageUtils.sendMessage<T>` 的响应类型由调用方自己写：非测试源码里约 50 处。`GET_SETTINGS` 在 `entrypoints/popup/App.tsx`、`entrypoints/content/index.tsx`、`entrypoints/content/screenshot/index.ts` 里被写成三种形状。handler 的返回类型是 `Promise<ResponseMessage>`，`data` 是 `unknown`，改了 handler 返回的字段，调用方照样编译通过。
- `TRIGGER_SCREENSHOT`、`TRIGGER_BLOCK_MODE`、`TRIGGER_ANNOTATE`、`TRIGGER_DOWNLOAD_MAIN` 不在 `types/messages.ts` 的联合里，`background-service/event-handlers/command-handler.ts`、`entrypoints/content/index.tsx`、`entrypoints/popup/App.tsx` 各写各的字符串，违反根 `AGENTS.md` 跨目录规则第 2 条。

**要求**

1. `types/messages.ts` 增加“消息类型 → 响应 `data` 的类型”的映射。逐个 handler 读出它实际返回的形状来写，不照调用方的类型实参抄。
2. `MessageHandlers` 的返回类型按映射约束；`sendMessage` 的返回类型由消息类型推导，调用方的类型实参全部删掉。
3. 发给标签页的消息（四个 `TRIGGER_*`、`RECORDING_LIFECYCLE`、`DOWNLOAD_NOTICE`）单列一个联合；`command-handler.ts` 的 `sendToActiveTab`、popup 里的 `chrome.tabs.sendMessage`、内容脚本的 `onMessage` 都用它。
4. 不改任何消息的字段与语义，不加依赖。
5. 新约定写进 `background-service/notes/`，并在 `background-service/AGENTS.md` 里用等长的一句换掉被它取代的句子。

**验收**

1. `git grep -n "sendMessage<" -- entrypoints utils background-service ':!*__tests__*' ':!*.test.ts'` 无结果。
2. 临时给任意一个 handler 的返回字段改名，`pnpm run compile` 在调用方报错。
3. `git grep -n "TRIGGER_"` 的每一处都带类型：没有不带类型标注的字符串对象。
4. `pnpm run verify` 通过；`e2e/cold-start.spec.ts`、`e2e/popup-entry.spec.ts`、`e2e/selection-clip.spec.ts`、`e2e/library-browse.spec.ts` 通过。

#### RV-BG-13 写操作的广播名单是手写的，漏了 `RESTORE_HIGHLIGHT`（中）

**问题**

- `entrypoints/background/index.ts` 的 `MUTATION_MESSAGE_TYPES` 是一个字符串集合，里面没有 `RESTORE_HIGHLIGHT`（撤销删除高亮）。按代码推断：两个资料库标签页同时开着，一个里撤销删除，另一个的高亮视图与计数不刷新。这一条没有在浏览器里复现过。
- `background-service/service-manager.ts` 的 `IDEMPOTENT_TYPES` 也是字符串集合。新增一个写消息时，没有东西提醒补这两张名单。

**要求**

1. 先复现，写成 E2E 或单测，用例名带本编号。
2. 两张名单从一张对 `ExtensionMessage['type']` 穷尽的分类表派生：新消息不分类就编译不过。
3. 属性注册表的三个写操作（`UPSERT_PROPERTY`、`DELETE_PROPERTY`、`DELETE_UNUSED_PROPERTIES`）是否广播，按 `docs/product/extension.md` 的现有约定判断；文档没有写的行为不加。

**验收**

1. 复现用例改动前失败、改动后通过。
2. 临时往联合里加一个消息类型而不分类，`pnpm run compile` 失败。
3. `pnpm run verify` 与 `e2e/reading-highlight.spec.ts` 通过。

### 内容脚本体积

量法：构建后看 `.output/chrome-mv3/` 的文件大小；各部分的占比用 esbuild 单独打包那一部分（minify）得到。

#### RV-CAP-16 内容脚本为一个无状态工具栏打包了整个 React（高）

**问题**

- `content-scripts/content.js` 是 540 KB（gzip 164 KB），清单把它注入所有页面的所有 frame（`<all_urls>`、`all_frames`、`document_start`）。
- 其中 React 与 react-dom 占 223 KB（41%），只为 `entrypoints/content/screenshot/toolbar.tsx`：243 行，没有任何 hook。`entrypoints/content/screenshot/index.ts` 用 `createRoot` 加 `flushSync` 渲染它；同一个会话里其余界面都是 `createElement` 手写的。

**要求**

1. 工具栏改成原生 DOM。DOM 结构、类名、`aria-*`、`data-*` 与键盘焦点行为不变：E2E 和 `e2e/real-chrome-scenarios.md` 附录 A 靠它们取元素。React 每次重渲染会保住焦点，原生写法要么只改属性，要么重建之后把焦点放回去。
2. 图标沿用 `entrypoints/content/icons.ts` 的写法，补上工具栏用到的 17 个 lucide 图标。
3. 内容脚本不再导入 `react`、`react-dom`、`lucide-react`，并在 `eslint.config.js` 里对 `entrypoints/content/**` 加一条 `no-restricted-imports` 兜底。
4. 界面的样子以现有 CSS 为准，不改样式表里的规则。

**验收**

1. 构建后 `content.js` 不超过 320 KB。
2. `git grep -nE "from 'react|lucide-react" -- entrypoints/content` 无结果。
3. `entrypoints/content/screenshot/__tests__` 与全部 `e2e/screenshot-*.spec.ts` 通过。

#### RV-CAP-17 内容脚本带着所有界面的文案（中）

**问题**

- `utils/ui-text.ts` 把五张字符串表合成一个 `STRINGS`，`uiText` 按键名动态取，打包器摇不掉。内容脚本里因此有资料库、设置、弹窗的全部文案：全表 minify 后 63.5 KB，采集那张表只有 12 KB。
- `ERROR_TEXT` 的键跨多张表；service worker 只用 `currentUiLanguage`，却和字符串表在同一个模块里。

**要求**

1. 每个入口只打包自己用到的表。键名仍在编译期检查：入口用了自己没带的表里的键要报错，不能等运行时把键名显示给用户。
2. 先列出内容脚本实际用到的键（`git grep -ohE "uiText\('[a-zA-Z.]+'" entrypoints/content | sort -u`），再定它带哪几张表；快速编辑气泡会用到属性的错误文案。
3. `currentUiLanguage` 挪到不带字符串表的模块。
4. `utils/__tests__/ui-text.test.ts`、`ui-literals.test.ts`、`locale-keys.test.ts` 的断言不放宽。

**验收**

1. 构建后的 `content.js` 里搜不到 `library.searchPlaceholder` 与 `settings.title`；`background.js` 里搜不到任何文案键。
2. `pnpm run verify` 通过；`e2e/selection-clip.spec.ts`、`e2e/popup-entry.spec.ts`、`e2e/library-shell.spec.ts` 通过。

#### RV-TEST-10 构建产物没有体积预算（中）

**问题**

- `check:size` 只管源码文件。`content.js` 长到 540 KB 的过程里没有任何检查提醒。

**要求**

1. 新脚本（`pnpm run check:bundle`）读 `.output/chrome-mv3`，给 `content-scripts/content.js` 与 `background.js` 设字节上限，取前两条做完之后的实际值向上留一成；超了就失败并打印各文件大小，没有构建目录时说明要先构建。
2. 它依赖构建，不进 `verify`。CI 在 e2e job 的构建之后和 `build-extension.yml` 的打包之后各跑一次。`scripts/check-consistency.mjs` 现在要求每个 `check:` 脚本都在 `verify` 里：把这条断言改成“依赖构建的检查不进 verify，但必须出现在 CI 的构建之后”，连同它的测试。
3. 单测放 `scripts/__tests__/`；`scripts/README.md` 的联动表加一行。

**验收**

1. 临时把上限调小到低于实际值，脚本失败并说出是哪个文件。
2. `ci.yml` 与 `build-extension.yml` 里各有一处调用，位置在构建之后。
3. `pnpm run verify` 通过。

### 热点文件

#### RV-CAP-18 `ScreenshotSession` 一个类承担整个截图会话（中）

**问题**

- `entrypoints/content/screenshot/index.ts` 约 93 KB，是代码预算（32 KB）的三倍，登记在 `scripts/size-ledger.json`。一个类有约 77 个字段、82 个方法、25 处 `addEventListener`；最近 200 次提交里它被改了 36 次，是仓库里改动最多的文件。
- 类里已有显式的状态联合（`selecting`、`confirming`、`capturing`、`preview`、`error`、`done`），但各阶段的界面与状态都挂在同一个对象上。

**要求**

1. 先做 RV-CAP-16：工具栏换掉之后这部分代码会变。
2. 按职责拆进同目录的新文件，先拆自带状态、对外接口窄的部分：序号标注、美化面板、文字输入、取景与悬停、待确认态、三个去处（保存、复制、下载）、上次取景框。拆出去的部分拥有自己的字段，通过窄接口向会话要东西；不要把方法改成接收整个会话对象的自由函数。
3. 行为不变：不改 `docs/product/screenshot.md` 的任何约定，不改 DOM、类名和文案。
4. 每拆一块，跑 `entrypoints/content/screenshot/__tests__` 和对应的 E2E（对应关系在 `entrypoints/content/screenshot/AGENTS.md` 的「验证」）。
5. 台账里的文件按行段读，不整份读；变小之后跑 `pnpm run check:size --lower`。

**验收**

1. `index.ts` 回到预算内并从台账里消失；做不到时，本条写明还剩哪几块、为什么，按 §1 第 2 条处理。
2. 每个新文件都在预算内。
3. 全部 `e2e/screenshot-*.spec.ts`、`e2e/page-entry.spec.ts`、`e2e/page-annotation.spec.ts`、`e2e/block-clip.spec.ts` 通过。

#### RV-LIB-20 资料库根组件把数据获取、导出与界面状态揉在一起（低）

**问题**

- `entrypoints/library/App.tsx` 有 678 行、28 个 `useState`、16 个 `useRef`、10 个 `useEffect`。列表查询的竞态处理、分页、导出的状态（四个 `useState`）都写在组件体里，只有 E2E 覆盖。

**要求**

1. 抽成 `entrypoints/library/` 下的 hook：列表与分页、计数与 facets、导出。导出的状态用 reducer，reducer 是纯函数并有单测。
2. 行为不变；不引入状态库、请求库或测试库。需要渲染 hook 的单测用 `react` 的 `act` 加 `createRoot`。

**验收**

1. `App.tsx` 里的 `useState` 少于 15 个；新抽出的纯函数都有单测。
2. 全部 `e2e/library-*.spec.ts` 与 `e2e/reading-highlight.spec.ts` 通过。

### 数据访问路径

#### RV-LIB-21 设置页绕过 service worker 直接写库（低）

**问题**

- `entrypoints/library/settings-view.tsx` 的 `cleanupOrphans` 自己打开 `EntryStore` 调 `deleteOrphanAssets`。孤儿报告走 `ORPHAN_REPORT` 消息，清理却不走，写操作因此有两条路。
- 库名字面量 `'annhub'` 在 worker 之外出现四处（`entrypoints/library/entry-card.tsx`、`settings-view.tsx`、`export-run.ts`、`entrypoints/offscreen/download-run.ts`），而 `EntryStore` 构造函数的默认值就是它。

**要求**

1. 清理改走消息：按 `background-service/AGENTS.md` 的流程新增（类型、handler、只接受扩展页面的发送者校验、测试）。
2. 页面读图片、整库导出、offscreen 打包仍然直连，只读；库名只在 `core/store.ts` 写一次。
3. `docs/product/storage.md` 有对应约定时同步。

**验收**

1. `git grep -n "EntryStore('annhub')"` 无结果。
2. `e2e/settings-drafts.spec.ts` 的孤儿清理用例与 `e2e/library-export.spec.ts` 通过。

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
