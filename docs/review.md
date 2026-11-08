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

## 3. 已知问题

没有条目。接受一条已知问题时按 §1 第 2 条写：现象与位置、为什么现在不修、影响与绕行、锁定当前行为的用例、什么情况下重新处理。
