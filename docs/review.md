# 审查问题

代码审查发现的问题登记在这里，直到修好或被接受为已知问题。修好的条目从本文删除，编号留在锁定它的测试用例名里；所以本文只有还没处理的问题（§2）和已知问题（§3），不随迭代变长。

## 1. 规则

1. **编号** `RV-<区域>-<序号>`，稳定、不复用。区域：`BG` 后台、`CORE` 领域核心、`LIB` 资料库与扩展页、`CAP` 页面采集、`TEST` 测试设施、`REC` 录屏、`DL` 下载、`DOC` 文档与约定。新序号取该区域用过的最大值加一，用过的编号这样列出：`git log -p -G 'RV-[A-Z]+-[0-9]' | grep -ohE 'RV-[A-Z]+-[0-9]+' | sort -u`。
2. **只有两种去向**，都在处理它的 PR 里完成，合并时不留第三种：
   - 修好：删掉条目；产品可见的行为写进归属规格；至少一个测试用例的名字带编号，有归属规格时同时带规格节号，如 `it('… (annotate.md §3.3, RV-REC-02)')`，改动前失败、改动后通过。这个用例只在产品方向改变、规格那一节随之改写时一起改或删。
   - 接受为已知问题：条目移到 §3，补上为什么现在不修、影响与绕行、什么情况下重新处理；产品可见的局限用现在时写进归属规格；加一个锁定当前行为的用例，名字带编号。以后修好时，这个用例改成断言修好的行为，条目删掉。
3. **纯文档的条目**（`DOC`）没有可测的行为：能用 `check:docs` 或 `check:consistency` 的断言兜住的，加断言和它的测试；兜不住的，修好直接删。
4. **门禁**：§2 为空才能发布；§3 的每一条都有锁定当前行为的用例，由产品负责人在发布前确认仍然接受（[roadmap.md §4](product/roadmap.md)）。
5. **不进本文的**：超出字节预算的文件由 `scripts/size-ledger.json` 登记；待确认的产品决策、风险与开放问题进 [validation.md](product/validation.md)，条目里只写它们的编号；候选的新功能是 GitHub issue。
6. **条目写法**：问题（现象、位置、违反的规格）、要求、验收（编号列表，验收者逐条核对）。代码位置写文件与函数名，不写行号。相关的条目编成一组、一个 PR，组内每条一个提交；组间的先后写在 §2 开头，一组处理完时一起改。
7. **PR**：照 `.github/pull_request_template.md` 勾选，另外给出每条验收的证据（命令输出、测试名、截图或真机步骤）、改动前失败的那次输出，以及 `git diff --stat main...HEAD`，越出这一组的文件写明原因。没做的检查写“未做”和原因。
8. **验收**：验收者在 PR 分支上自己重跑 `npm run verify`，动了扩展代码的再 `npm run build` 并跑这一组列出的 E2E，只贴在描述里的结果不采信。逐条核对验收项：测试类读断言，确认测的就是那条说的情形；命令类自己跑；执行者做不了的真机项，验收者在真实 Chrome 里补做，记下版本与步骤。不通过就在 PR 里写明哪条、看到的现象和复现命令。
9. **通用要求**：不手改 `package-lock.json`，不加依赖与扩展权限；日志、指标与 `chrome.storage` 里不存密钥、页面正文或附件内容，`storage.session` 里也不存页面标题；不跳过、不禁用测试，不放宽任何 `check:*` 断言；行为变了，规格、用户故事与代码同一个 PR 改。

## 2. 待处理

录屏可靠性、下载同名、导出 ZIP64 三组可以马上并行；offscreen 归口要等录屏可靠性与下载同名合并，约定文件要等录屏可靠性与 offscreen 归口合并。

### 录屏可靠性

四条都在录制链路上，一个 PR。规格是 [annotate.md §2.1、§2.4、§3.3](product/annotate.md)（开始与停止、失败、停止录制以后）；产品行为不变，只改实现。要跑的 E2E：`popup-entry.spec.ts`、`recording-annotation.spec.ts`、`page-annotation.spec.ts`、`cold-start.spec.ts`。

#### RV-REC-01 弹窗取流改用 `targetTabId`（高）

**问题**

- 工具栏弹窗（`entrypoints/popup/App.tsx`）调用 `chrome.tabCapture.getMediaStreamId({ consumerTabId: active.id })`。设了 `consumerTabId` 的 stream id 只能由那个标签页里同源的 frame 拿去 `getUserMedia`（[tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)）。录制在 offscreen 文档里，拿不到流，弹窗显示“录制失败”；`http:` 页面上这个调用直接报错，因为 consumer 必须是安全来源。
- 快捷键路径（`RecordingService.startFromCommand`）用的是 `targetTabId`，与 Chrome 的 [offscreen 录制指南](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)一致。现有测试都替身掉了真实取流，测不到这个参数。

**要求**

1. 弹窗改为 `getMediaStreamId({ targetTabId: active.id })`，不传 `consumerTabId`。
2. `e2e/popup-entry.spec.ts` 加一条：替身 `chrome.tabCapture.getMediaStreamId`，点“录制此标签页”后断言它收到 `{ targetTabId: <当前标签页 id> }`，且 `START_RECORDING` 带着它返回的 stream id。

**验收**

1. `git grep -n consumerTabId` 没有结果。
2. 上面的用例通过；把参数改回 `consumerTabId` 时它失败（PR 里贴一次失败输出）。
3. 真机：https 与 http 页面各从弹窗开始录制 10 秒再停止：角标显示 REC，弹窗显示“停止录制”，停止后 `AnnHub/recording-*.webm` 下载完成且能播放。

#### RV-REC-02 录制中保活，worker 重启后状态不丢（高）

**问题**

- `RecordingService` 的状态只在内存里。录制中 offscreen 文档不给 worker 发任何消息；Chrome 会在 worker 空闲 30 秒后终止它，只有 offscreen 文档发来的消息才重置这个计时（[service worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)）。
- worker 重启后：弹窗读到 idle，显示“录制此标签页”，角标却还是 REC，没有地方能停；快捷键被当成“开始”，对正在录的标签页再取流会失败，也停不了；停止时读到的 `tabId` 是空的，`RECORDING_LIFECYCLE` 发不出去，页面留在录制态，违反 annotate.md §3.3。
- `RecordingService.initialize()` 排在 `EntryService` 打开 IndexedDB 之后，它注册的 `tabs.onRemoved`、`downloads.onChanged` 不在 worker 脚本的同步顶层。worker 正是被这两个事件唤醒时，事件会丢：关掉被录的标签页不触发停止，视频落盘不触发收尾。
- 下载链路处理同一个问题的办法：`background-service/services/download/recovery.ts` 的 session 记录，加 offscreen 每 10 秒一次心跳。

**要求**

1. 保活：录制中、以及视频等待落盘期间，offscreen 文档每 10 秒给 worker 发一次心跳（例如给 `RECORDING_EVENT` 加 `heartbeat` 事件，先在 `types/messages.ts` 登记），worker 收到即回。
2. 持久化：开始、停止、下载失败时，把路由状态写进 `chrome.storage.session`：`status`、`tabId`、`startedAt`、`withMic`、`micNotice`、`limitNotice`、待下载视频的 blob URL 与文件名。视频落盘或放弃后删除记录。不存标签页标题，恢复时用 `chrome.tabs.get(tabId)` 重新取。
3. 恢复：`initialize()` 读回记录，再用 `chrome.runtime.getContexts` 核对 offscreen 文档还在；不在就清掉记录、回到 idle、清角标。恢复后按状态设置角标。
4. 先恢复再判断：`GET_RECORDING_STATE`、`STOP_RECORDING`、`RETRY_RECORDING_DOWNLOAD`、`DISCARD_RECORDING` 和快捷键开关（`event-handlers/command-handler.ts`）都在恢复完成后才读状态。
5. 顶层监听：被录标签页的 `tabs.onRemoved` 与视频的 `downloads.onChanged` 在 worker 脚本的同步顶层注册（参照 `entrypoints/background/index.ts` 里的 `listenForFrames()`），处理时先等恢复完成。
6. 约定：`background-service/AGENTS.md` 加一条规则：持续超过 30 秒的流程把状态放进 `storage.session` 并在启动时恢复，由 offscreen 心跳保活，配一条中途停掉 worker 的测试。同一文件“服务边界”里讲 `command-handler.ts` 的那条改准：下载命令也只发给顶层框架（四条发给标签页，录制开关留在 worker）；`command-handler.ts` 文件头注释里的 “The first three” 一并改。

**验收**

1. 单测（`recording.test.ts`）：开始录制后，用同一份替身 `storage.session` 新建一个服务实例并 `initialize()`：`GET_RECORDING_STATE` 返回 `recording`，`tabId`、`startedAt` 不变；`STOP_RECORDING` 向 offscreen 发出 `RECORDING_STOP`。
2. 单测：重启时 offscreen 文档已不在，状态回到 idle，角标清空，session 记录删除。
3. 单测：重启后收到 `stopped` 事件，向原 `tabId` 发 `RECORDING_LIFECYCLE { active: false }`，并开始下载视频。
4. 单测（假定时器）：录制中每 10 秒一次心跳；`RECORDING_CLEANUP` 之后心跳停止。
5. 单测：重启后第一次按录制快捷键，执行的是停止而不是开始。
6. 单测断言写入的内容：session 记录只含要求 2 列出的字段，没有标题、页面地址或视频字节。
7. 真机：开始录制后，在 `chrome://serviceworker-internals` 找到 AnnHub 的 worker 点 Stop（或 60 秒以上不碰扩展），再打开弹窗：显示正在录制与已录时长；点“停止录制”后视频下载、能播放，被录页面的光标高亮消失、批注工具栏回来。再录一次，停掉 worker 后直接关掉被录的标签页：视频自动下载。

#### RV-REC-03 快捷键带麦克风、尚未授权时打开设置页（中）

**问题**：`RecordingService.startFromCommand` 在 worker 里用 `chrome.runtime.sendMessage` 发 `OPEN_EXTENSION_PAGE`，可这个消息的处理器就在 worker 自己身上（`service-manager.ts`）；runtime 消息不会送回发送者，设置页打不开，按快捷键什么都不发生。[annotate.md §2.1](product/annotate.md) 要求这时在新标签页打开设置页的“录制”一节，由浏览器询问麦克风。`startFromCommand` 没有单测。

**要求**：直接调用 `utils/extension-pages.ts` 的 `openExtensionPage('settings', { recordTabId })`；为 `startFromCommand` 补单测。

**验收**

1. `git grep -n OPEN_EXTENSION_PAGE background-service` 只剩处理器、文档与测试，没有 worker 给自己发这条消息的调用。
2. 单测：勾着“带麦克风”、麦克风权限不是 granted 时，调用 `openExtensionPage('settings', { recordTabId })`，不取流、不开始录制。
3. 单测：不带麦克风时用 `targetTabId` 取流并开始录制；`chrome://` 页面什么都不做。
4. 真机：在 `chrome://extensions/shortcuts` 给录制绑定快捷键，把扩展的麦克风权限重置为“询问”，勾上“带麦克风”后按快捷键：新标签页打开设置页的录制一节，浏览器弹出麦克风询问。

#### RV-REC-04 录屏改走设置模块（低）

**问题**：`RecordingService` 的 `readMicPreference` 与模块里的 `writeMicPreference` 直接读写 `chrome.storage.local` 的 `annhub.settings`，绕过 `settings-schema.ts` 的校验与串行写入；与弹窗的 `SET_SETTINGS` 同时写时会互相覆盖。`settings-schema.ts` 有 `readSettings()`、`writeSettings()`，`SettingsPatch` 支持 `recording.withMic`。

**要求**：两处改用 `readSettings()` 与 `writeSettings({ recording: { withMic: false } })`，删掉本地的 `SETTINGS_KEY`。

**验收**

1. `git grep -n "annhub.settings" background-service/services` 没有结果。
2. 单测：麦克风不可用时走 `writeSettings`，其他设置键不变；与一次 `SET_SETTINGS` 同时发生时，两边的修改都保留。

### 下载同名

一个 PR。这是行为改动，规格、用户故事与代码同一个 PR 改；规格的取舍见 D-94。要跑的 E2E：`page-download.spec.ts`、`library-download.spec.ts`、`source-page-download.spec.ts`。

#### RV-DL-01 重新下载按标题覆盖，而且先删后写（中）

**问题**

- [download.md §4.1](product/download.md) 规定同一个标题再次下载时覆盖原文件夹，先清除它写过的文件再写入。实现是 `background-service/services/download/index.ts` 的 `clearFolderFiles`：`writeFolderRun` 一开始、还没写任何新文件，就对下载历史里 `AnnHub/<文件夹>/` 下的每一项调用 `chrome.downloads.removeFile`，从磁盘上永久删除。
- 标题不是身份。两篇不同的文章清洗后同名（都叫“Home”，或前 80 个字符相同），就共用一个文件夹，下载第二篇会删掉第一篇。
- 资料库多选的批次文件夹按日期取名（`library-plan.ts` 里的 `batchFolderName`）：同一天下载第二批，第一批整个被删。
- 先删后写：删完之后取消、断网、浏览器拒绝某个文件或后台文档被关闭，旧文件已经没了，新的又不完整。下载常用来留下可能消失的内容（会被删的帖子），这时丢的可能是唯一一份。
- ZIP 形态不先删，但同样按标题覆盖（download.md §4.1 的“重名直接覆盖同名 ZIP”），不同文章同名时后一个顶掉前一个。
- 现有单测里只有 `overwrites a repeat title…` 一条（`download.test.ts`），上面几种情形都没有覆盖。

**要求**

1. 身份与取名按 D-94 的默认；产品负责人在 PR 评审里给了不同结论，就按结论改。取下一个没被占用的名字用 `core/download.ts` 的 `dedupeName`。
2. 归属记录：`chrome.storage.local` 里一个键（如 `annhub.downloadFolders`），只存哈希与时间：`{ <路径的 SHA-256>: { owner: <身份的 SHA-256>, at } }`，最多 500 条，超出删最旧的；不存地址、标题或文件名。路径先转小写、做 Unicode NFC 归一化再取哈希，因为 macOS 与 Windows 的文件名不分大小写；查下载历史时同样不分大小写。一次下载全部落盘之后才写记录。
3. 文件夹形态、ZIP 形态和资料库多选的批次文件夹都按要求 1 取名。
4. 写入：
   - 新名字：每个文件都用 `conflictAction: 'uniquify'`，宁可多出 ` (1)` 也不覆盖磁盘上已有的文件。
   - 替换：媒体用 `uniquify` 写成新文件（Markdown 本来就按落盘后的实际文件名链接，download.md §4.1）；Markdown 和 README 最后写，用 `overwrite`。Markdown 落盘之后，才删除这个文件夹里本次没写到的旧文件。ZIP 替换用 `overwrite`：浏览器在新文件写完时才替换旧的。
   - 删旧文件时先排除本次写过的路径：下载历史里旧的那一项可能与新文件同路径，删它等于删掉新文件。
5. 取消与失败：取消时只删本次新建的文件（download.md §2.5），失败时按 download.md §8 保留已写好的文件；两种情况都不删、不覆盖任何旧文件，旧 Markdown 里的链接都还能打开。重试按同一身份重走一遍，成功后清掉旧文件和上次失败留下的文件。
6. 删掉 `clearFolderFiles`。`chrome.downloads.removeFile` 只出现在三处：没写完的单个文件、取消时删本次的文件（`removeDownload`）、替换成功后删旧文件。
7. 规格与文档，同一个 PR：
   - download.md §2.5、§4.1、§4.4、§8、§9 里讲覆盖的句子改成新行为；download.md §4.2 写明替换后媒体名可能带 ` (1)`；download.md §6.2 加上归属记录；
   - user-stories.md 里 US-CAP-21、US-DATA-07 的验收；
   - permissions.md §1 与隐私政策 `website/public/privacy-policy.html`（中英文两处）写明这份本地记录；
   - roadmap.md：下载那一行写的是商店里的行为，不改（RV-DOC-01 把它并入 roadmap §2）；在 roadmap §3“待发布”加一行写新的同名处理，来源一列填 issue，没有就填本 PR；
   - 合并前把 D-94 的结论写进 download.md §4.1、§4.4，从 validation.md 删掉 D-94。
8. 现有用例 `overwrites a repeat title…` 断言的是要改掉的行为，按验收 2 改写；这是行为变更，不算删测试。

**验收**

1. 单测：不同来源、同一标题先后下载（文件夹形态），落到 `AnnHub/<标题>/` 与 `AnnHub/<标题> (2)/`，`removeFile` 一次也没有被调用。
2. 单测：同一来源再次下载成功，还是同一个文件夹；媒体用 `uniquify`，Markdown 用 `overwrite`；Markdown 落盘后才对旧媒体调用 `removeFile`，对本次写过的路径一次也不调用。
3. 单测：同一来源再次下载，媒体写到一半时取消、或某个文件被浏览器中断：旧文件一个也没有被 `removeFile`，旧 Markdown 没被覆盖；取消时被删的只有本次新建的文件。
4. 单测：同一天两次资料库多选，落到两个批次文件夹，第二个带 ` (2)`，第一批不受影响。资料库单条：同一条再下载替换；标题相同的另一条落到 ` (2)`。
5. 单测：ZIP 形态，不同来源同名得到 `<标题> (2).zip`；同一来源 `overwrite` 原来的 ZIP。
6. 单测：没有归属记录、下载历史里已有文件的文件夹，换名字，不删任何文件；只有大小写不同的两个标题算同一个名字；归属记录里只有哈希与时间，写第 501 条时最旧的一条被删。
7. E2E（扩充 `page-download.spec.ts`，做不到就真机）：同一页面下载两次，第二次在进度过半时取消：第一次的文件夹完整，文件清单与 Markdown 的链接一致。再下载一次并完成：文件夹里恰好是新 Markdown 引用的文件，没有多余的旧媒体。两篇标题相同的不同文章各下载一次：两个文件夹都完整。
8. `git grep -n clearFolderFiles` 没有结果；`git grep -n removeFile background-service/services/download/index.ts` 的每一处都属于要求 6 的三种之一。
9. validation.md 里没有 D-94；要求 7 列出的文档都已改，`npm run check:docs` 通过。

### offscreen 归口与大 Markdown

录屏可靠性与下载同名合并后再开工：两组都改创建 offscreen 文档的那一段，先做必然冲突。一个 PR，先 RV-BG-11 后 RV-DL-02。要跑的 E2E：`recording-annotation.spec.ts`、`page-download.spec.ts`、`library-download.spec.ts`、`source-page-download.spec.ts`。

#### RV-BG-11 offscreen 文档有两处创建，监听不校验发送者（低）

**问题**

- 一个扩展同时只能有一个 offscreen 文档。录屏（`RecordingService`，理由 `USER_MEDIA`）与下载（`background-service/services/download/index.ts`，理由 `BLOBS`、`DOM_PARSER`）各自先 `getContexts` 再 `createDocument`。两边几乎同时开始时都看到“没有”，后一个 `createDocument` 抛错，那次录制或下载失败。先建的一方决定文档声明的理由，另一方的用途没有声明。
- `entrypoints/offscreen/main.ts` 的监听只对 `DOWNLOAD_EXTRACT` 检查发送者（`sender.tab` 与 `sender.id`）；`RECORDING_START`、`RECORDING_STOP`、`RECORDING_CLEANUP`、`DOWNLOAD_RUN`、`DOWNLOAD_FINISH`、`DOWNLOAD_CANCEL` 都不查。内容脚本发的 runtime 消息也会送到 offscreen 文档，所以扩展注入在任何标签页里的内容脚本都能停掉录制或塞进一次下载，与 `background-service/notes/sender-rules.md` 的发送者规则不一致。

**要求**

1. 一个模块（如 `background-service/offscreen-document.ts`）负责创建：同一时刻只有一个创建在进行；理由取并集 `USER_MEDIA`、`BLOBS`、`DOM_PARSER`，说明写全三种用途；遇到“已存在”的报错按成功处理。两个服务都改用它。
2. offscreen 监听开头统一校验：`sender.tab` 存在，或 `sender.id !== chrome.runtime.id`，就忽略、不回应；`DOWNLOAD_EXTRACT` 现有的校验并入这一处。
3. `sender-rules.md` 写明：offscreen 文档只接受扩展后台的消息。
4. 不加关闭 offscreen 文档的代码：现在没有任何地方关闭它，录屏与下载共用时一方关掉会中断另一方。

**验收**

1. 生产代码里 `chrome.offscreen.createDocument` 只有一处：`git grep -n "offscreen.createDocument" -- '*.ts' ':!*__tests__*'`。
2. 单测：录制与下载同时要求文档时，`createDocument` 只调用一次，两边都拿到可用的文档；`createDocument` 报“已存在”时按成功处理。
3. 单测（offscreen 监听）：带 `sender.tab` 的 `RECORDING_STOP`、`DOWNLOAD_RUN`，以及 `sender.id` 不是本扩展的消息，都被忽略：不停止、不开始、不回应。
4. E2E 或真机：录制中开始一次页面下载，两者都完成，视频与文件夹都落盘；先下载、下载中开始录制，也一样。
5. sender-rules.md 已改，`npm run check:docs` 通过。

#### RV-DL-02 文件夹形态的 Markdown 用 `data:` URL（低）

**问题**：service worker 里没有 `URL.createObjectURL`，所以文件夹形态把 Markdown 和 README 编成 `data:` URL 交给 `chrome.downloads.download`（`download/index.ts` 的 `dataUrlOf`）。Chromium 对 URL 的上限是 2 MB，base64 之后，约 1.5 MB 以上的 Markdown 可能写不出来；页面下载的正文不截断（[download.md §4.3](product/download.md)），很长的页面正好会碰到。媒体由 offscreen 文档做成 `blob:` URL，Markdown 没有。

**要求**

1. 先复现：加一份转换后 Markdown 至少 3 MB 的 E2E 夹具（如把长百科夹具的正文重复多次），跑文件夹形态下载。
2. 复现了：Markdown 与 README 交给 offscreen 文档做成 `blob:` URL 再下载，落盘或取消后撤销，与媒体的做法一致；删掉 `dataUrlOf`。
3. 没复现：PR 里贴出 3 MB 夹具下载成功的证据，代码不改，夹具与用例留下当回归。

**验收**

1. E2E：3 MB 以上 Markdown 的文件夹形态下载成功；落盘的 Markdown 完整，最后一节在，字节数与转换结果一致。
2. 按要求 2 改了时：`git grep -n dataUrlOf` 没有结果；单测断言为 Markdown 建的每个 `blob:` URL，在下载结束或取消后都被撤销。

### 产品定位

一个 PR，只改文档，可以马上开工。

#### RV-DOC-02 product.md 没给下载功能定位（中）

**问题**

- [product.md §2.2](product/product.md) 讲了页面批注与录屏服务谁，没讲下载：它服务 product.md §2.1 的哪类人、对应 product.md §3 的哪个 Job，都没有。
- product.md §2.3“明确不做的事”里，“稍后读收件箱与整页阅读器”写着“不抓取整页”，“整页剪藏与模板系统”写着“不保存整页”；下载却能把页面的主体文章取成文件。[download.md §1.2](product/download.md) 解释了两者不冲突（下载不建条目、不进库），product.md 里没有这句，只读产品定位的人会以为下载越了界。
- [docs/product/README.md](product/README.md) 第 1 节“五分钟读懂”的“怎么做”与流程图只有剪藏、截图与高亮。

**要求**

1. 在 product.md §3 加一个 Job（或扩展已有的一条），写明下载服务谁、解决什么：把读到的内容带走，用别的工具打开。product.md §2.3 那两行各补半句边界：下载由用户逐次点击，产物不进资料库，与 download.md §1.2 一致。
2. docs/product/README.md 第 1 节的“怎么做”与流程图写全 product.md 定位过的能力，含页面批注、录屏与下载。
3. 措辞由产品负责人在 PR 评审里确认；这是产品定位，不改任何功能。

**验收**

1. product.md 里有一处写明下载服务的人群与 Job；product.md §2.3 那两行与 download.md §1.2 对着读不矛盾。
2. docs/product/README.md 第 1 节与 product.md 一致；`npm run check:docs` 通过。
3. PR 里有产品负责人对措辞的确认。

## 3. 已知问题

没有条目。接受一条已知问题时按 §1 第 2 条写：现象与位置、为什么现在不修、影响与绕行、锁定当前行为的用例、什么情况下重新处理。
