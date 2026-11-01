# 截图会话

> 适用范围：`entrypoints/content/screenshot/`；上级约定见 [../AGENTS.md](../AGENTS.md)。美化、水印、序号与线宽的细则见 [notes/editor-tools.md](notes/editor-tools.md)。

- 区域截图从视口 CSS 坐标按 dpr 裁剪，调用 `captureVisibleTab` 前隐藏扩展 UI 等两帧；
- 后台回 `CAPTURE_RATE_LIMITED`（浏览器每秒只给两次截取）时，`requestCapture` 隔 400 ms 再要、最多三次，等待中被取消就不再要。
- 等待放在页面里，因为 worker 的定时器可能晚几秒；
- 元素截图经离屏克隆栅格化，跨域图片由 background 代取内联（`FETCH_IMAGE`）；
- 栅格器按样式拷贝、带不走视频帧与滚动位置：克隆里的 `<video>` 换成当前帧（跨域保护的视频从 `captureVisibleTab` 裁可见部分），滚动容器按滚动窗口重建（`element-capture.ts` 的 `restoreScrollPositions`，foreignObject 不裁嵌套 overflow）。
- 拖拽松开后选区进入待确认态（`Enter` 确认、`Esc` 取消），单击元素路径不变。
- 待确认的选区独占画面（screenshot.md §1.2）：会话根加上 `ann-shot-modal` 接住指针，点在选区里不会穿透到页面，也不会拆掉确认条；
- `trackHover` 只在取景态（`selecting`）工作，待确认时没有悬停描边与边距条，方向键只微调、`↑↓` 不爬层级；
- `enterConfirming` 拆掉比例条并把提示条换成 `shot.hintPending`，`syncHint` 按状态选文案，进出待确认态都要重同步。
- 点选区外是放开选区（`backToPicking`：清掉上次取景框的标签与记忆的提议，提示条、比例条回来，遮罩重新压暗）：拖动则画新选区，单击不截取，只是回到取景并立刻给指针下的元素描边。
- 开始拖拽与确认进入编辑都会清掉悬停 UI，描边不陪选区进预览。
- 提示条与比例条的 `z-index` 高于选区的遮罩（选区的 9999px 阴影会盖住更早的兄弟节点），不被压暗。
- 滚动长图的入口在比例条上，所以只在取景态可用。
- 吸附、八向手柄、方向键微调、`Shift` 临时锁比、层级 `↑↓` 与元素+边距的几何换算都是 `screenshot/selection.ts` 的纯函数，会话只做接线（screenshot.md §1.2、§1.4）。
- 上次取景框归后台：会话经 `screenshot/frame-memory.ts` 的 `REMEMBER_FRAME`、`READ_FRAME` 交给 worker，每个标签页一份，只对来源 + 路径相同的网页有效，导航到别的页面、关闭标签页、重启浏览器即清除（screenshot.md §1.4）。
- 内容脚本不直接读写 `chrome.storage.session`，也不为此放开它的访问级别：`sender.ts` 信任的最近保存记录也在那里。
- 元素锚点带 10% 容差。
- 沿用从不滚动页面（screenshot.md §1.4）：元素找得到且大小在容差内，取元素此刻的位置，否则取记录的页面位置（元素找不到时带“没找到上次的元素”），两者都要求取景框（含边距）完整落在窗口里，不然这次不出现，记忆原样留着。
- X 这类会回收单元格的时间线上，结构路径与页面坐标在别的滚动高度指向另一条帖子（测试：`e2e/virtualfeed.html`）。
- 原样确认的、由记忆给出的元素取景框仍记为元素（`offeredFrame` 与当前选区经 `sameFrame` 比较），微调过的才记为页面位置。
- 恢复经后台往返、晚于会话开场，所以比例条等恢复有了答案才出现（`offerPicking`，不在 `settingsLoaded` 里，截取不等它）；
- 指针已开始悬停或已在拖拽时这次不恢复，不抢用户已经在做的事。
- 区域截取前用透明 sweeper 清扫悬停样式并等 `pageStable`（连续两帧布局不变，最长 500ms），元素 + 边距能放进视口时走区域截取，放不下提示而不是截不全。
- 滚动长图（screenshot.md §1.5）是截图会话里的一个工具（`screenshot/stitcher.ts` 驱动）：页面逐屏滚动、每屏等图，每次截取都隐藏扩展 UI 与录制中的光标高亮；fixed 与当前吸顶的 sticky 元素只在第一屏拍、从第二屏起隐藏、每次截取前重查，收缩成吸顶栏的页头要在它出现的那一刻抓到。数值规则全在 `screenshot/stitch.ts`（分屏数、各屏在成品画布上的落位取整到设备像素，页底、30 屏上限、约 4000 万像素上限（screenshot.md §1.5）与画布 65535 像素边谁先到谁停）。
- 选区内本地标注与马赛克只把处理后的 PNG 交后台入库；
- 确认/复制/下载三个去处互相独立，复制与下载保留会话；
- `http:` 页面复制提示下载（screenshot.md §4）。
- 成功类提示（已复制、已下载等）是工具栏上方的深色气泡，约 3 秒自动消失（`showNotice(message, false)` 走 `showBubble`），错误是工具栏上的红色横幅（notice 行），等下一次操作替换。
- 工具栏下方的状态条（深色浮条，visual.md §2）显示匿名与水印状态、遮挡候选的个数与逐个移除，由 `syncStatus`/`updateToolbar` 重绘。
- JPEG 下载一律先铺白（`matteOnWhite`），透明处不会变黑。
- 入库的 `startedAt` 是点击“保存”的时刻（metrics.md §9），不含此前的编辑时间；
- 失败文案经 `screenshotFailureText`/`screenshotSaveErrorText` 由稳定错误码生成，不显示后台的原始信息。
- 会话期间在 capture 阶段吞掉可信的 `click`/`dblclick`/`auxclick`/`contextmenu`/`submit`（扩展自己的界面内除外，进入预览后恢复）：取消 `pointerdown` 挡不住随后的 `click`，不吞的话单击选取链接会真的跳转（测试：`e2e/page-entry.spec.ts`）。
- 匿名默认值与范围（头像、名字与账号，screenshot.md §3）来自设置（`GET_SETTINGS`）。
- 区块胶囊的截图与会话同时开始、选区菜单交来的取景框可以立刻确认，所以每条截取路径都先等设置到达（`settingsLoaded`），状态在等待之前就置为 `capturing`，防止重复确认截两次。
- `A` 的行为（何时可按、切换什么、两种都关时的表现）见 screenshot.md §3；
- 实现上，用户按过 `A` 之后迟到的设置不覆盖这次选择。
- 身份元素的种类只由 `detect.ts` 的 `identityPartOf` 判定，区域覆盖、克隆匿名与马赛克预填都经 `identityElements` 取元素，不各自筛选。
- `Esc` 先关最里面的一层：文字输入框，其次美化面板，最后才取消会话。

## 验证

- 改截图链路先跑 `entrypoints/content/screenshot/__tests__`；
- 改美化、标注或预览布局后跑 `e2e/screenshot-beautify.spec.ts`（在预览、剪贴板和入库图片的像素上断言）；
- 改水印的排版、解码或 `W` 后跑 `e2e/screenshot-watermark.spec.ts`（同样读像素，再加下载的 data URL；水印图片是测试里现编的 PNG，经 `setSettings` 播种，读不出来的那张是“PNG 签名 + 垃圾”，能通过设置校验却解码失败）；
- 改序号后跑 `e2e/screenshot-steps.spec.ts`（读预览、三种格式的下载、剪贴板与入库图片的像素，并造下载与保存的失败）；
- 改荧光笔、直线或线宽后跑 `e2e/screenshot-strokes.spec.ts`（同样读这些像素，另量 1x 与 2x 的线宽）；
- 改滚动长图后跑 `e2e/screenshot-stitch.spec.ts`（`longpage.html` 夹具，读成品画布的接缝与像素）；
- 改选区确认、吸附、手柄、层级或取景框记忆后跑 `e2e/screenshot-frame.spec.ts`（改源码必须 `rm -rf .output/chrome-mv3 && npm run build` 再测，`.output` 不随源码变化重建）。
