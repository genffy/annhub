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
8. **验收**：验收者在这一组的 worktree 里自己重跑 `npm run verify`，动了扩展代码的再 `npm run build` 并跑这一组列出的 E2E，只写在交付说明里的结果不采信。逐条核对验收项：测试类读断言，确认测的就是那条说的情形；命令类自己跑；执行者做不了的真机项，验收者在真实 Chrome 里补做，记下版本与步骤。不通过就写明哪条、看到的现象和复现命令，执行者在同一个 worktree 里接着改。
9. **通用要求**：不手改 `package-lock.json`，不加依赖与扩展权限；日志、指标与 `chrome.storage` 里不存密钥、页面正文或附件内容，`storage.session` 里也不存页面标题；不跳过、不禁用测试，不放宽任何 `check:*` 断言；行为变了，规格、用户故事与代码在同一组里改。
10. **审查分支**：条目登记在审查分支上，也在这条分支上消除，同一时间只有一条。主工作区（仓库本身的检出，不是另拉的 worktree）检出它，只做登记与合并，合并前不留未提交的改动。每组从审查分支拉一个 worktree，执行与验收都在里面；各组的分支不推到 GitHub：执行、验收与合并都在本机，不为每一组和外部环境往返。main 有了新提交，在主工作区把 main 合并进审查分支并跑 `npm run verify`；不变基，各组的 worktree 是从它拉出的。
11. **合并**：验收通过才合并，执行者不合并自己的分支。合并前在 worktree 里并入审查分支的最新提交、重跑 `npm run verify`，再在主工作区用 `git merge --ff-only` 合并，审查分支上落下的就是跑过检查的那个提交。并入时 review.md 可能冲突（各组删的是相邻的节），保留别组的节；别的文件也冲突，说明两组改的代码相交，回到验收。合并后删掉 worktree 与它的分支。

## 2. 待处理

下面各组互不依赖，改的代码不相交，可以各开一个 worktree 并行；每组删掉自己那一组，最后合并的那一组连同这句一起删。

### 录屏可靠性

两条都在录制链路上，一起改。规格是 [annotate.md §2.1、§2.4、§2.5](product/annotate.md)（开始与停止、失败、验收与测试）与 [metrics.md §9](product/metrics.md)；产品行为不变，只改实现。要跑的 E2E：`popup-entry.spec.ts`、`recording-annotation.spec.ts`、`page-annotation.spec.ts`、`cold-start.spec.ts`。

#### RV-REC-05 offscreen 守卫的判断反了，旧状态照样挡住新录制（高）

**问题**

- `entrypoints/offscreen/main.ts` 的 `beginRecording`：模块状态（`recording`、`unsavedVideo`、`starting`）挡路时向 worker 问 `GET_RECORDING_STATE`。注释说 worker 还持有视频才拒绝，代码却是 `if (!(await workerStillHoldsVideo())) return false`，两头正好相反。
- worker 已经不持有视频（`RECORDING_CLEANUP` 没有送达，文档里留着旧的 `unsavedVideo`）：照样拒绝。这一条要解决的现象原样还在：下一次开始报“录制失败”，重建 offscreen 文档才恢复。
- worker 还持有视频（上一段视频正在落盘）：撤销它的 blob URL、清掉 `unsavedVideo`，放行新录制，违反 annotate.md §2.5 的“下载完成之前不丢弃视频”。上一段落盘时，worker 的 `finishDownload` 把状态改成 idle 并发出 `RECORDING_CLEANUP`，`cleanupVideo` 随之关掉心跳；落盘失败时 `failDownload` 把状态改成下载失败。两处都不看新录制：正在进行的录制在弹窗里看不到、停不了，关掉被录的标签页也不停止。
- 只有 `starting`（上一次开始还在等取流）时同样去问 worker，由它的回答决定放不放行；`starting` 本身就该拒绝，否则两次开始各取一路流。
- worker 不在线时 `workerStillHoldsVideo` 返回 `true`，按现在的判断是清掉状态放行，与注释里的“保持现状”相反。
- `entrypoints/offscreen/__tests__/main.test.ts` 没有一条用例走到这个守卫；带本编号的只有 worker 一侧 `holdsVideo` 字段的用例（`recording.test.ts`）。

**要求**

1. 守卫按这个顺序判断：`starting` 为真，拒绝；recorder 还在录，拒绝；其余情况问 worker——答持有视频或问不到，拒绝，`unsavedVideo` 和它的 blob URL 原样留着；明确答不持有，停掉残留的轨道、撤销旧的 blob URL、清掉模块状态，放行这次开始。
2. 用例写在 `main.test.ts`，名字带本编号与 annotate.md §2.5，覆盖要求 1 的每个分支。
3. 不加关闭 offscreen 文档的代码（RV-BG-11 的约定不变）。

**验收**

1. 单测（`main.test.ts`）：一次录制停止后没有收到 `RECORDING_CLEANUP`，worker 答不持有：下一次开始成功，旧的 blob URL 被撤销一次。
2. 单测：上一段视频还在等待落盘，worker 答持有：开始被拒绝，`URL.revokeObjectURL` 没有被调用；随后的 `RECORDING_CLEANUP` 照常撤销它。
3. 单测：上一次开始还在等取流时再来一次开始：拒绝，不问 worker、不取第二路流。worker 不在线（`sendMessage` 抛错）时：拒绝，模块状态不变。
4. 单测（`recording.test.ts`）：上一段视频等待落盘时从弹窗开始，offscreen 答拒绝：状态回到 idle，上一段视频照常落盘，`recording.downloaded` 记一次。
5. `git grep -n closeDocument` 只出现在测试里。
6. 真机：连续两次从弹窗录制并停止，第二次不需要重建 offscreen 文档，两段视频都落盘、能播放。

#### RV-REC-02 冷启动时先到的事件读到空状态，重启后录屏指标失真（中）

**问题**

- `background-service/services/recording/index.ts` 的 `ready` 初值是已经完成的 `Promise.resolve()`，只有 `initialize()` 才把它换成 `recover()`；而 `initialize()` 排在 `EntryService`、`ScreenshotService` 打开 IndexedDB 之后（`background-service/index.ts` 依次初始化各服务）。
- 顶层注册的监听在冷启动时先于 `initialize()` 到达：`listenForRecording` 里的 `tabs.onRemoved`、`downloads.onChanged`，以及快捷键（`event-handlers/command-handler.ts` 调 `toggleFromCommand`）。它们的 `await this.ready` 立刻通过，读到默认的 idle：快捷键去取一路新流而不是停止，关掉被录的标签页不发 `RECORDING_STOP`（annotate.md §2.1 的停止方式，annotate.md §2.4 的“被录的标签页关闭”）。
- 带本编号的重启用例（`recording.test.ts`）都先 `await initialize()` 再发事件，测不到这个顺序。
- 视频等待落盘时重启：`persistRoute` 写进 session 记录的 `pending` 只有 blob URL 与文件名，`withMic` 写成 `false`；`recover()` 把时长当成 0，停止原因只分 `limit` 与 `user`。落盘后记的 `recording.downloaded`（metrics.md §9，M-31）时长落进 `<1min`，`mic` 为假，`tab_closed` 记成 `user`。

**要求**

1. 恢复不依赖 `initialize()` 何时被调用：第一次读状态的入口（顶层监听、消息处理、`initialize()`）谁先到谁启动 `recover()`，其余的等同一个 promise，恢复只跑一次；也可以让顶层监听先等 `backgroundServiceManager.whenReady()` 再处理。等待期间到达的事件不丢。
2. 待落盘视频的记录带上这段视频的 `durationMs`、`withMic`、`stoppedBy` 与 `limit`，`recover()` 原样读回。它们都不是页面内容，session 记录照旧不存标题、地址与视频字节；断言记录字段集合的用例随之改。
3. 冷启动用例按真实顺序建模：新实例先收到事件，`initialize()` 在一段延迟之后才调用（模拟 IndexedDB 打开得慢）。

**验收**

1. 单测：冷启动时快捷键先于 `initialize()` 到达：发出 `RECORDING_STOP { stoppedBy: 'user' }`，没有调用 `tabCapture.getMediaStreamId`。
2. 单测：冷启动时被录标签页的关闭先于 `initialize()` 到达：发出 `RECORDING_STOP { stoppedBy: 'tab_closed' }`。
3. 单测：冷启动时视频的下载完成事件先于 `initialize()` 到达：照常收尾，发出 `RECORDING_CLEANUP`，状态回到 idle，`recording.downloaded` 记一次。
4. 单测：带麦克风、因关闭标签页停止、录了 4 分钟的视频，在等待落盘时重启：落盘后的 `recording.downloaded` 是 `duration: '3-5min'`、`mic: true`、`stopped_by: 'tab_closed'`。
5. 单测：session 记录的字段断言是要求 2 的集合，并断言里面没有标题、页面地址或视频字节。
6. 真机：带麦克风开始录制，在 `chrome://serviceworker-internals` 对 AnnHub 的 worker 点 Stop，10 秒内（offscreen 的心跳会在 10 秒内把 worker 叫醒）按录制快捷键：录制停止，视频下载、能播放。再录一次，点 Stop 后 10 秒内关掉被录的标签页：视频自动下载。

### 下载同名

替换的提交点是产品可见的行为，写进 [download.md §2.5、§4.1](product/download.md)；其余行为照 download.md §8 与 D-94 不变。要跑的 E2E：`page-download.spec.ts`、`library-download.spec.ts`、`source-page-download.spec.ts`。

#### RV-DL-01 同一来源替换时，失败或取消毁掉旧版本（中）

**问题**

- download.md §2.5、§4.1、§8 要求替换时取消或失败，旧文件一个也不动，旧 Markdown 一个也不删。`background-service/services/download/index.ts` 的 `writeFolderRun` 在媒体写失败（`writeFailed`）之后照样进入 Markdown 阶段，替换时 Markdown 与 README 用 `overwrite`：旧 Markdown 被一份把这个媒体标成缺失的新 Markdown 盖掉。
- `cancel()` 只看 `run.ending`，它到 `finishRun` 才置位。Markdown 已经盖掉旧的、`sweepReplacedFolder` 正在清旧文件时按取消：`cancel()` 删掉本次写下的全部文件，包括刚盖掉旧 Markdown 的那一份；清理不看取消，照样删完旧文件。文件夹里一个完整的版本也不剩。
- `sweepReplacedFolder` 与 `ownership.ts` 的 `occupiedNames` 调 `chrome.downloads.search({})`，没给 `limit` 时浏览器只返回 1000 项：下载历史更长时，被占用的名字查不全，不同来源可能写进同一个文件夹，替换后的旧文件也清不全。
- 带本编号的用例 `a cancel or an interrupted write during the media stage leaves the old files and the old Markdown whole …`（`download.test.ts`）其实是一次落到 ` (2)` 的首次下载再取消：没有替换，也没有被中断的写入，名字里说的两种情形都没测到。
- [roadmap.md §3](product/roadmap.md) 那一行的来源写着“本 PR，无 issue”，合并之后指不到任何 PR。
- `e2e/page-download.spec.ts` 的两处注释与代码不符：`markdownsOf` 的说明说文件夹形态的文件是 `blob:` 下载，3.8 MB 那条用例的注释说这里的写法会失败。实际上 Markdown 由 worker 的 `dataUrlOf` 编成 `data:` URL，这条用例在 `data:` 的写法上通过，是 RV-DL-02 留下的回归用例。

**要求**

1. 提交点：替换的第一个 `overwrite` 落盘之后，取消不起作用：`cancel()` 不删任何文件，这次下载照常写完、清完旧文件、记下归属，按完成或部分结束。提交点之前的取消照旧只删本次新建的文件。提交点写进 download.md §2.5 与 download.md §4.1。
2. 替换时媒体阶段有一个文件没写成：不写 Markdown 与 README，这次下载按失败结束，旧版本原样留着；已经写好的新媒体按 download.md §8 留下，重试成功后清掉。首次下载不受影响。
3. `occupiedNames` 与 `sweepReplacedFolder` 查下载历史时传 `limit: 0`（返回全部）。
4. 改写上面那条用例：先完成一次下载并记下归属，再按同一来源替换，分别测媒体阶段取消、Markdown 落盘之后取消、媒体写入被浏览器中断三种情形。替身的 `downloads.search` 在没给 `limit` 时只返回前 1000 项，与浏览器一致。
5. roadmap.md §3 那一行的来源写成 PR 的链接 `https://github.com/genffy/annhub/pull/179`。
6. `e2e/page-download.spec.ts` 那两处注释照代码写：文件夹形态的 Markdown 是 `data:` URL，3.8 MB 那条是回归用例。

**验收**

1. 单测（替换，媒体阶段取消）：旧文件一个也没有被 `removeFile`，没有任何 `overwrite` 写入；被删的只有本次新建的媒体。
2. 单测（替换，Markdown 落盘之后取消）：`removeFile` 没有落到本次写下的任何文件上，结果是完成；清理之后文件夹里恰好是新 Markdown 引用的文件。
3. 单测（替换，一个媒体的写入被中断）：Markdown 与 README 都没有 `overwrite` 写入，旧文件一个也没有被删，结果是失败、可以重试；重试成功后，旧文件和上次留下的新媒体都被清掉。
4. 单测：下载历史超过 1000 项、第 1001 项占着这个标题的名字：新下载避开它，落到 ` (2)`。
5. E2E（扩充 `page-download.spec.ts`）：同一页面下载两次，第二次在慢媒体还在取回时取消：第一次的 Markdown 与媒体都在，内容不变。再下载一次并完成：文件夹里恰好是新 Markdown 引用的文件。
6. `git grep -n "本 PR" docs/product/` 没有结果；download.md §2.5、§4.1 写明提交点；`e2e/page-download.spec.ts` 的注释与代码一致；`npm run check:docs` 通过。

### 导出 ZIP64

`core/export.ts` 与 `entrypoints/offscreen/download-run.ts` 调用同一个 `buildZip`，两处调用方不用改；规格是 [storage.md §6](product/storage.md) 的 D-95。要跑的 E2E：`library-export.spec.ts`、`library-download.spec.ts`。

#### RV-CORE-10 越过 4 GB 的 ZIP64 归档读不出来（高）

**问题**

- storage.md §6 的 D-95：条目超过 65,535、任一文件超过 4 GB、或某个偏移越过 4 GB 时写 ZIP64。`core/zip.ts` 只有条目数这一种写对了。
- `centralHeader` 的 `0x0001` 扩展字段总是先写两个大小，偏移越界时再写偏移。[PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT) 的 4.5.3 节规定扩展字段只放头里写成 `0xFFFFFFFF` 的那几项，顺序是原大小、压缩后大小、本地头偏移。大小没越界、只有偏移越界的条目（4 GB 之后的每一个文件），读取方把扩展字段的头 8 个字节当成偏移，读到的是文件大小。
- `planZipLayout` 的 `zip64Eocd` 只在有 ZIP64 条目或条目超过 65,535 个时为真。每个文件都不到 4 GB、合起来越过 4 GB 时，中央目录从 4 GB 之后开始，`endOfCentral` 把它的偏移写成 `0xFFFFFFFF`，后面却没有 ZIP64 结束记录与定位记录，读取方找不到中央目录。
- 越界的判断都用 `>`：恰好等于 `0xFFFFFFFF` 的大小或偏移、恰好 65,535 的条目数照原样写进头里，读取方会把这个值当成“去 ZIP64 字段里取”。
- `core/__tests__/zip.test.ts` 里注释为 `the extra keeps APPNOTE's order: sizes first (real values), then the offset` 的那几条断言，断言的正是错误的布局。
- 整库导出与下载的 ZIP 形态都走 `buildZip`：图片合计越过 4 GB 的库得到一份打不开的 ZIP，过程中不报错。导出是用户把数据带走的唯一途径。
- [validation.md §2](product/validation.md) 要求实现决策的改动删掉对应条目，validation.md 里的 D-95 还在。storage.md 的 D-95 写着“导出不再让人先删条目”，是讲变化的写法；它说几个解压工具都能打开 ZIP64 归档，实测只做过条目数越界的那一种。

**要求**

1. 扩展字段按 APPNOTE 4.5.3：中央头与本地头里只放写成 `0xFFFFFFFF` 的字段，顺序固定为原大小、压缩后大小、本地头偏移。扩展字段的长度随之变化，`planZipLayout` 算出的中央目录大小与偏移一起改。
2. 结束记录里任一字段越界（条目数、中央目录大小、中央目录偏移）就写 ZIP64 结束记录与定位记录，不只看条目本身。
3. 越界一律按 `>=` 判断：等于 `0xFFFFFFFF` 或 `0xFFFF` 的值也走 ZIP64。
4. 改写上面那几条断言，按要求 1–3 补布局用例（用假的大小与偏移，不读数据）。
5. 实测：本机造两份归档，用真实工具打开，输出贴进交付说明。一份是两个文件（约 3 GB 与 2 GB，可以用 `mkfile -n` 造），中央目录从 4 GB 之后开始；另一份在它们后面再加一个小文本文件，这个文件的偏移越过 4 GB。工具是 `unzip -t`、`python3 -m zipfile -t`、`bsdtar -tf` 和 macOS“归档实用工具”。
6. 从 validation.md 删掉 D-95；storage.md §6 的 D-95 用现在时写，能打开归档的工具只写实测过的归档与工具。

**验收**

1. 单测（假大小）：只有偏移越界的条目，中央头扩展字段的数据是 8 个字节，内容是真实偏移；大小与偏移都越界的条目，扩展字段依次是两个大小和偏移。
2. 单测（假大小）：两个各不到 4 GB、合起来越过 4 GB 的文件：`zip64Eocd` 为真，ZIP64 结束记录与定位记录在中央目录之后，普通结束记录里的中央目录偏移是 `0xFFFFFFFF`。
3. 单测：大小恰好 `0xFFFFFFFF` 的文件、偏移恰好 `0xFFFFFFFF` 的条目、恰好 65,535 个条目，都走 ZIP64。
4. 单测：没有越界的小归档与现在逐字节相同，现有的字节数断言照样通过。
5. 实测：要求 5 的两份归档，四个工具都能列出或解开全部文件，`unzip -t` 与 `python3 -m zipfile -t` 没有报错；验收者在本机重跑一次。
6. validation.md 里没有 D-95；storage.md §6 的写法与实测范围一致；`npm run check:docs` 通过。

## 3. 已知问题标

三条都在区块胶囊上，一起改：RV-CAP-13、RV-CAP-14 改 `entrypoints/content/index.tsx` 的 `wireBlockEntries`，RV-CAP-15 改 `block-hover.ts` 的 `reveal`。规格是 [capture.md §6.2](product/capture.md) 与 [screenshot.md §1](product/screenshot.md)；描边、剪藏与下载取的东西不变，截图与编辑气泡改成跟描边一致，有选区或正在拖选时胶囊不出现。取目标的规则（D-96）与误点防护（D-97）本组不预设结论，也不等它们。要跑的 E2E：`block-clip.spec.ts`、`page-shapes.spec.ts`、`screenshot-anonymize.spec.ts`、`page-entry.spec.ts`、`selection-clip.spec.ts`。

#### RV-CAP-15 停留计时到期时不复查选区，拖选中也会弹出胶囊（低）

**问题**

- `block-hover.ts` 的指针移动处理看到非折叠的选区就调 `scheduleLeave`，清掉停留计时；但到期执行的 `reveal` 只查截图确认态、入口开关与网站停用，不看选区，也不看主键是否按着。
- 拖选里第一次让选区变长的那次移动，处理时选区还是折叠的，照常武装计时；这时停住 400ms，胶囊和描边就在拖选中出现。之后的移动都会清掉计时，口子只在这一次移动之后。
- 出现之后不动鼠标直接松开：选区菜单约 10ms 后出现，胶囊留到下一次移动后 150ms 才收起，两个深色胶囊同屏。指针移到胶囊上还会让它一直留着，这时点它的“剪藏”，存下的是胶囊的目标（引言段上是整篇文章），不是选区。
- 违反 capture.md §6.2“页面上有选区或正在拖选时不出现”。

**要求**

1. `reveal` 出描边前复查：选区非折叠，或主键按着，就不出现，已有的描边与胶囊收起。
2. 选区塌缩、主键松开之后照常按停留出现；选区菜单收起之后的出现时机按 D-97。
3. 用例名带本编号与 capture.md §6.2。

**验收**

1. 单测：按下主键，移动一次（处理时选区折叠，随后变成非折叠），停 400ms：没有胶囊与描边。
2. 单测：主键按着、选区折叠，停 400ms：没有胶囊；松开后再移动、停 400ms：胶囊照常出现。
3. 单测：已有非折叠选区时，此前武装的停留计时到期，不出胶囊。
4. 真机：慢慢拖选一小段，选区刚变长时停住一秒再松开：只出现选区菜单，没有胶囊。

## 3. 已知问题

没有条目。接受一条已知问题时按 §1 第 2 条写：现象与位置、为什么现在不修、影响与绕行、锁定当前行为的用例、什么情况下重新处理。
