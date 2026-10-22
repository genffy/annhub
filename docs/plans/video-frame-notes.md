# 视频截帧路线：#79–#86 实现对照

> 更新时间：2026-10-22
>
> 这是已开 issue 的实现对照，不是产品契约。行为、字段和验收仍以 [v2 文档](../v2/README.md) 为准。本页不表示这些能力已经采纳；按仓库约定，实现某个 issue 的提交必须同时改 `docs/v2/` 里对应的契约。在那之前不要写功能代码。
>
> 约束：本地优先，不要求账号，不要求 AI / OCR / 字幕云接口。截图仍走现有的视口截取或元素栅格化，不下载视频。

证据帖和验收原文在 GitHub issue 里，这里不复制。

## 现有链路

两条采集在页面里汇合，入库和导出在后面分开。

```text
快捷键 / 选区菜单 / 区块胶囊
  -> 截图会话 entrypoints/content/screenshot/index.ts
       区域：CAPTURE_VISIBLE_TAB -> background-service/services/screenshot/index.ts
       元素：entrypoints/content/screenshot/element-capture.ts（跨域图 FETCH_IMAGE）
       标注：screenshot/editor.ts 画进 croppedCanvas；工具栏 screenshot/toolbar.tsx
       确认：confirmSave 发 SAVE_SCREENSHOT（types/messages.ts）
  -> 剪藏 entrypoints/content/clip-flow.ts 发 SAVE_CLIP
       提示气泡只提交标题、标签、备注
  -> 后台
       SAVE_SCREENSHOT：cleanSourceUrl + presetProperties('screenshot') + 图片与条目同一事务
       SAVE_CLIP：同样只附加剪藏预设
       内容脚本的 UPDATE_ENTRY 被 quickEditPatch 限制为 title / tags / note
  -> 资料库 entrypoints/library/App.tsx
       列表筛选走 learning-core/query.ts
       唯一导出是 onExport -> learning-core/export.ts 的 buildExport（每条一个 Markdown）
```

和这批 issue 直接相关的现状：

| 事实                                                                                                                  | 位置                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 截图的 `sourceUrl` 是确认时的 `location.href`，标题来自 `extractPageMeta` 的 `document.title`                         | `screenshot/index.ts` 的 `confirmSave`；`entrypoints/content/page-meta.ts`                                                    |
| 永久链接规则只有 X 帖子、Medium 文章、节标题锚点                                                                      | `page-meta.ts` 的 `resolvePermalink`                                                                                          |
| 令牌参数会被删掉，`v`、`t`、`list`、`p` 不在清单里，会原样留下                                                        | `learning-core/url.ts` 的 `TOKEN_PARAM_NAMES`、`cleanSourceUrl`                                                               |
| 截图预设只有 `title` 和 `tags`。`author` 只预设在剪藏上，所以截图消息里带上的作者会被丢掉                             | `learning-core/properties.ts` 的 `BUILTIN_PROPERTY_DEFINITIONS`；`presetProperties`；`ScreenshotService` 的 `SAVE_SCREENSHOT` |
| `screenshot` 的 `content` 必须是空串，字幕和想法不能塞进正文                                                          | `docs/v2/entry.md` 字段矩阵；`learning-core` 校验                                                                             |
| 导出 frontmatter 已经会写出注册表里的属性；截图正文只有「图片」和「备注」                                             | `learning-core/export.ts` 的 `frontmatterFor`、`screenshotBody`                                                               |
| 文本和列表属性已经可搜索、可按条件筛选；数字、复选框、日期不进全文                                                    | `learning-core/query.ts` 的 `searchableFields`                                                                                |
| 内容脚本不能给刚剪的条目写任意属性                                                                                    | `background-service/services/entries/index.ts` 的 `quickEditPatch`                                                            |
| 标注画进像素，不另存操作记录。复制/下载用 `displayCanvas`（含水印和美化），入库用 `croppedCanvas`（含水印以外的标注） | `screenshot/index.ts` 的 `prepareEditor`；`screenshot.md` §4                                                                  |
| 序号工具不存在。现有工具是矩形、椭圆、箭头、画笔、马赛克、文字                                                        | `screenshot/editor.ts` 的 `DrawTool`；`screenshot/toolbar.tsx`                                                                |
| 身份区检测只覆盖 X 的头像/名字和 `data-ann-identity`，在截取前盖住或预填马赛克                                        | `screenshot/detect.ts`、`screenshot/anonymize.ts`                                                                             |
| 水印是用户自己的署名，默认关，只出现在复制和下载上                                                                    | `screenshot/output.ts` 的 `paintWatermark`                                                                                    |
| 取景框记忆按「来源 + 路径」，不含查询串。YouTube 的 `/watch` 因此共用一把记忆，不能拿它当视频身份                     | `background-service/services/screenshot/frame-memory.ts` 的 `pageOf`                                                          |
| 仓库里没有 OCR、字幕接口或视频站点分支                                                                                | 全库检索无对应实现                                                                                                            |

`SAVE_SCREENSHOT` 今天的数据字段是 `dataUrl`、`width`、`height`、`sourceUrl`、`title`，以及可选的 `author` / `published` / `description`。没有 `videoId`、时间戳、频道、字幕。

## 建议的数据字段

不给条目加顶层字段，也不升 IndexedDB 版本。`store.ts` 启动时会把缺失的内置属性补进注册表。导出、搜索、筛选已经走 `properties`。

建议在实现时新增这些内置属性（名称都不是保留字 `id` / `type` / `source` / `created` / `updated` / `content` / `note`）：

| 属性        | 类型   | 预设       | 谁来填                       | 空着时                     |
| ----------- | ------ | ---------- | ---------------------------- | -------------------------- |
| `video`     | text   | screenshot | 站点规则解析出的视频 id      | 不写。非视频页不出现这个键 |
| `timestamp` | number | screenshot | 播放进度的整秒，`Math.floor` | 读不到、直播、广告中则不写 |
| `channel`   | text   | screenshot | 频道名或 UP 主，单行         | 读不到则不写               |
| `subtitle`  | text   | screenshot | 当时画面上可见的字幕行，#83  | 没有字幕则不写             |
| `idea`      | text   | clip       | 用户在剪藏气泡里选填，#82    | 跳过则不写                 |

`timestamp` 是数字，按现有搜索规则不进全文。可点击的深链放在 `sourceUrl`，导出的 `source` 就是它。排序和「同一视频」用 `video` + `timestamp`。`channel` 用 text 而不是 `author`：`author` 是列表，逗号会被拆开，而且它的预设在剪藏上，不该为了截图改掉剪藏的作者行为。

标题继续用已有的 `title`。视频页在站点规则里去掉站点后缀（` - YouTube`、`_哔哩哔哩_bilibili`），再交给现有的标题截断。不要改 `extractPageMeta` 对其它网站的行为。

深链写进 `sourceUrl`，再经现有的 `cleanSourceUrl`。不要在后台用 `sender.url` 覆盖它：内容脚本里的地址才是这次截取时的页面。

<a id="issue-79"></a>

## 79 YouTube 时间戳深链

Phase 1。在 YouTube 播放页截帧时，条目的来源能跳回那一秒，并带上标题和频道。其它页面保持今天的行为。

### 要改的文件

- `entrypoints/content/page-meta.ts`：追加 YouTube 规则，和现有的 X / Medium 规则放在一起。不要在截图会话里写 hostname 判断。
- `entrypoints/content/screenshot/index.ts`：区域路径在调用 `requestCapture` 之前、元素路径在 `captureElement` 之前各做一次快照，赶在 `prepareEditor` 之前。`confirmSave` 只用这份快照填 `sourceUrl`、`title` 和属性，不再读当时的 `location.href`。
- `types/messages.ts` 的 `SaveScreenshotMessage`：增加可选的 `video`、`timestamp`、`channel`。缺省表示「没有」。
- `background-service/services/screenshot/index.ts`：把这三个值传进 `presetProperties`。未预设或空值仍由 `presetProperties` 丢掉。
- `learning-core/properties.ts`：登记上表里的 `video`、`timestamp`、`channel`。
- 文案不需要新句子，除非保存失败。失败沿用现有错误码，不要因为元数据缺失而失败。
- 测试：`entrypoints/content/__tests__/page-meta.test.ts`、`background-service/services/screenshot/__tests__/screenshot-service.test.ts`、`learning-core/__tests__/domain.test.ts` 与 `export.test.ts`。页面夹具放在现有的 e2e html 旁边，不要依赖真实 YouTube。

纯函数建议放在 `page-meta.ts`，输入是 URL 字符串、秒数、标题、频道，输出是下一条要保存的来源和属性。DOM 读取单独一个函数，单测用 jsdom 夹具。

### 快照时机

用户会在编辑时拖进度，或 YouTube 用 `pushState` 换片。若在点「确认」时才读 `location.href` 和 `video.currentTime`，像素是旧画面，链接会指到新视频。

在真正截像素之前读取一次（区域路径是 `requestCapture` 之前，元素路径是 `captureElement` 之前）：

- 地址：`location.href`
- 进度：主视频元素的 `currentTime`
- 标题、频道：下面的 DOM，读不到就退回 `extractPageMeta`

之后的标注、美化、等待都不更新这份快照。非 YouTube 主机返回空，`confirmSave` 走今天的分支。

### YouTube 规则

主机允许：`youtube.com`、`www.youtube.com`、`m.youtube.com`、`youtu.be`。不包含 `music.youtube.com`，也不处理嵌在别的网站里的 iframe（内容脚本的主机不是 YouTube 时直接返回空）。

视频 id：

- `/watch` 的查询参数 `v`
- `/shorts/<id>`、`/embed/<id>`、`youtu.be/<id>`

进度：`video.html5-main-video` 的 `currentTime`。`#movie_player` 带 `ad-showing`，或 `duration` 不是有限数（直播）时，不写 `timestamp`，也不改 URL 里的 `t`。其余情况写入整数秒。

来源 URL：在当前地址上替换或追加 `t=<秒>`。保留 `v`、`list`、`index` 以及其它非令牌参数。Shorts 和短链同样只改 `t`。不要重写成另一个主机。已有的 `start` 不主动删除，避免把嵌入页的参数改乱；播放页以 `t` 为准。

标题：优先播放页标题节点，否则 `og:title`，再否则去掉 ` - YouTube` 后的 `document.title`。频道：优先频道名节点，否则现有的 author meta。两者都失败时仍保存截图，只是没有 `channel`。

不读播放器的全局 JS 对象，不请求 `timedtext` 或 InnerTube。

### 验收与测试

- 夹具页主机名映射到允许列表，或直接单测纯函数：给定 `https://www.youtube.com/watch?v=abc&list=PLxyz` 和 75.4 秒，得到 `t=75`，`v` 与 `list` 还在，`video` 为 `abc`，`timestamp` 为 `75`。
- `t` 已存在时被替换，不被重复追加。
- 广告标记、无 video 元素、`currentTime` 非数字：保存成功，消息里没有 `timestamp`，URL 的其它部分不变。
- 非 YouTube 夹具：`SAVE_SCREENSHOT` 的 payload 与今天相同，没有空字符串字段。
- `cleanSourceUrl` 回归：`t`、`v`、`list`、`p` 保留，`token` 仍被删除。
- 导出：`frontmatterFor` 含 `source`（带 `t`）、`title`、`channel`、`video`、`timestamp`。未设置的键不出现。
- 资料库「回到来源」已经只打开 `sourceUrl`，不需要新的跳转逻辑。
- E2E 用本地夹具页放一个 `<video class="html5-main-video">`，不访问 youtube.com。

### 风险

- SPA：快照必须绑在截像素之前。编辑期间换片只影响下一次截图。`confirmSave` 若再读地址，像素和链接会分属两段视频。
- `/watch` 的路径相同，取景框记忆会跨视频复用。这是现有行为，本 issue 不要用那份记忆当视频 id。
- 影院模式、全屏、迷你播放器只要主视频元素还在 DOM 里就能读到进度。元素不在时静默降级。
- 年龄限制墙没有视频元素：只保存页面 URL 和标题，不报错。
- `m.youtube.com` 的 DOM 和桌面版不同。选择器失败时仍写 `t` 和 `v`（这两个来自 URL 和 video 元素，不依赖频道节点）。
- 不要把 `si` 当成令牌删掉，除非它被加进 `TOKEN_PARAM_NAMES`。今天的清单没有它。

<a id="issue-80"></a>

## 80 按视频聚合导出 Markdown

Phase 1，依赖 #79 的 `video` 和 `timestamp`。没有这两个属性的旧截图保持「一条一个文件」。

### 要改的文件

- `learning-core/export.ts`：在 `buildExport` 里，对带 `video` 的截图再生成一份聚合稿，图片仍引用已经写入的 `assets/<assetId>.png`，不复制字节。
- `learning-core/__tests__/export.test.ts`：键序、排序、缺图。
- `entrypoints/library/App.tsx` 的 `onExport`：不必新开一条后台消息。全库导出继续在页面里调用 `buildExport`。
- 单视频导出：抽屉里，当打开的截图带 `video` 时，用同一函数只传入该 `video` 的条目。筛选条件用现有的属性条件（`EntryQueryFilters.conditions`），路由已经会把 `prop` / `op` / `val` 写进 hash（`entrypoints/library/route.ts`）。
- 文案进 `utils/ui-text.ts`（中英各一条按钮和空状态）。

聚合文件建议为 `videos/<video>.md`。`<video>` 只允许属性值里安全的文件名字符；其它字符换成 `_`，避免路径穿越。正文按 `timestamp` 升序，缺时间戳的排在后面，再用 `createdAt`。每块是时间戳、指向 `source` 的链接、相对图片、已有备注。frontmatter 写标题、频道、视频页 URL（不带某一帧的 `t`）、`video`。这是派生稿，不是新的条目类型，不要给它编 `annhub_id`。

全库 ZIP 因此多出这些文件，每条截图原来的 `screenshots/<id>.md` 保留。Obsidian 打开聚合稿即可，图片和全库导出共用 `assets/`。

库内「分组查看」的最小做法：截图卡片上若有 `video`，点击把它写成一条属性筛选（等于该 id）。不要新做对象仓库或新视图。现有列表、分页和空状态都能复用。

### 验收与测试

- 同一 `video` 的三条截图，时间戳 40、10、缺省，聚合稿顺序是 10、40、缺省。
- frontmatter 含标题、频道、不带 `t` 的视频 URL。图是相对链接，缺图时沿用现有的「图片缺失」句子，ZIP 仍是 partial。
- 两条不同 `video` 得到两个聚合文件。没有 `video` 的截图不进入任何聚合稿。
- 全库导出的原有 `clips/`、`screenshots/`、`README.md` 断言继续通过。
- 单视频按钮只打包该 id 的稿和它引用的图片。
- 指标沿用 `export.completed`，不要把标题或 URL 写进事件。

### 风险

- 文件名来自视频 id。YouTube id 和 BV 号是安全字符；仍要做白名单，因为属性以后可由人编辑。
- 聚合稿和单条稿会重复同一张图的链接，字节只存一份。
- 用户改了 `title` 之后，聚合稿用该视频下最新一条的标题和频道。需要在测试里写死这条规则。
- 不要按 `sourceHost + pathname` 分组。`/watch` 会把所有 YouTube 视频并成一篇。

<a id="issue-81"></a>

## 81 序号标注

Phase 1，和视频元数据无关。序号画进像素，所以 PNG / JPEG / WebP 会带上它，不需要新的导出字段。

### 要改的文件

- `entrypoints/content/screenshot/editor.ts`：`Annotation` 增加 `{ tool: 'step'; start: Point; n: number; color: string }`。`renderScreenshot` 画一枚圆形徽章和数字，线宽和字号沿用现有的 `scale`（文字工具是 `Math.max(18, 18 * scale)`）。
- `entrypoints/content/screenshot/toolbar.tsx`：工具列表加「序号」。窄视口工具栏已经能横向滚动。
- `entrypoints/content/screenshot/index.ts`：点击放置；命中已有徽章可拖动；删除单枚；「重置」清掉全部 step 并把下一枚设回 1。撤销沿用现有的弹出最后一条标注。
- `utils/ui-text.ts`：工具名、重置、删除。
- 测试：`screenshot/__tests__` 里对徽章像素或绘制调用做单测；`e2e/screenshot-beautify.spec.ts` 已会读标注颜色，补一枚序号在入库图和下载图里都在、入库图不带水印。

下一枚的数字是当前 step 的最大 `n` 加 1，不是剩余个数。删掉 2 之后，1 和 3 保持原数字。重置才回到 1。拖动只改 `start`，不改 `n`。

徽章是标注，画在 `croppedCanvas` 上，因此会入库。美化和水印仍只在 `displayCanvas`。不要把序号做成设置项或付费开关；扩展里没有付费墙。

### 验收与测试

- 三次点击得到 1、2、3，颜色跟当前色板。
- 拖动 2 不改变数字，撤销按操作顺序收回。
- 重置后下一枚是 1，其它工具的矩形还在。
- 确认入库的 PNG、以及 JPEG / WebP 下载，都含徽章。复制的 PNG 也含。
- 页面脚本伪造的点击不能放置序号（会话已有 `isUserInput` 约束，新入口必须走同一判断）。

### 风险

- 今天的标注放下后不能拖。拖动和命中测试是这块唯一的新交互，只对 `step` 开启，避免把矩形和画笔的模型改成可选择对象。
- 徽章靠近边缘时要夹在画布内，否则 `fillText` 会被裁掉，导出像是丢了数字。
- 深色和浅色徽章都要让数字可读：深色底用白字，浅色底用深字。可以复用水印那套明暗判断，但不要调用 `paintWatermark`。

<a id="issue-82"></a>

## 82 剪藏想法字段

Phase 1，和截图路径无关。想法进 frontmatter，不进 `note`。`note` 按条目契约导出在正文「备注」一节，不在 frontmatter。

### 要改的文件

- `learning-core/properties.ts`：内置 `idea`，text，预设 `clip`。
- `entrypoints/content/clip-flow.ts`：快速编辑气泡在标题、标签、备注旁边加一个可空输入。空值不提交。保存本身仍是一次点击，气泡只在用户点「编辑」后出现。
- `background-service/services/entries/index.ts` 的 `quickEditPatch`：允许 `properties.set.idea` 为字符串。仍拒绝 `content`、`context`、`unset`、`newDefinitions` 以及其它属性名。
- `utils/ui-text.ts`：字段标签。占位符写明可以留空。
- 测试：`entrypoints/content/__tests__/clip-flow.test.ts`、`background-service/services/entries/sender.test.ts`（内容脚本不能写别的属性）、`learning-core/__tests__/export.test.ts`。

搜索和筛选不用改：`idea` 是文本属性，`searchableFields` 已经以权重 2 收录，资料库的属性条件可以选择它。属性页会列出新的内置项；实现时要按 `entry.md` §8 补契约，并确认属性页对内置项仍不可删除、不可改类型。

### 验收与测试

- 选区剪藏和区块剪藏都不弹出额外窗口。不点「编辑」时条目没有 `idea`。
- 气泡里写下文字并保存后，frontmatter 有 `idea`。留空则键不存在。
- 超过 1000 字或含换行被现有的 `PROPERTY_VALUE_INVALID` 拒绝，气泡里的字还在。
- 内容脚本对刚剪的条目设置 `idea` 成功；设置 `author` 或其它键仍被拒绝。
- 资料库搜索能命中 `idea` 里的词。

### 风险

- 放宽 `quickEditPatch` 时不要放开整个 `properties.set`。只多一个键。
- 气泡今天在约 3 秒后消失。编辑框打开后的保活逻辑已经存在，新输入框必须算作「气泡仍打开」，避免打到一半被收起。
- 不要在 `SAVE_CLIP` 之前插入必填步骤。那会破坏一次点击保存。

<a id="issue-83"></a>

## 83 截帧字幕行

Phase 2，做在 #79 的快照上。只读当时 DOM 里已经显示的字幕，不打开字幕开关，不请求字幕轨，不做语音识别。

### 要改的文件

- `page-meta.ts` 的 YouTube 快照：若存在 `.ytp-caption-segment`，把可见文本折成一行，截到文本属性上限 1000。没有节点就省略 `subtitle`。
- `types/messages.ts` 与 `SAVE_SCREENSHOT`：可选 `subtitle`。
- `properties.ts`：内置 `subtitle`，text，预设 screenshot。
- `learning-core/export.ts` 的 `screenshotBody`：有字幕时在图片下面加一行，并保留带 `t` 的来源链接。#80 的聚合稿用同一段渲染，避免两套句子。
- B 站选择器留到 #84，本 issue 的测试只覆盖 YouTube 形状的夹具。

### 验收与测试

- 夹具里有两段字幕节点：属性是一行文本，导出在图下能看到，frontmatter 也有 `subtitle`。
- 没有节点：保存成功，无该键，无错误提示。
- 实现里不出现 `timedtext`、字幕 API 或对新主机的 `fetch`。测试可以静态检查快照函数的依赖，至少代码评审要守住这一点。

### 风险

- 字幕往往跨好几秒，读到的是当前句，不是精确 cue。这足够做「画面下的那一行」。
- 自动字幕只在用户已经打开 CC 时出现在 DOM 里。不要为了读到字去点播放器按钮，那是在改页面。
- B 站有时把字幕画在 canvas 上，DOM 为空。按「没有字幕」处理，不要改去请求接口。

<a id="issue-84"></a>

## 84 Bilibili 时间戳深链

Phase 2，复用 #79 的快照和 #80 的 `video` 分组。不登录，不下载媒体，像素仍来自现有截图。

### 要改的文件

- `page-meta.ts` 增加一条 B 站规则，与 YouTube 并列。
- 不改入库、导出和筛选的形状。`video` 存 BV 或 av 号，`channel` 存 UP 主，`timestamp` 仍是整秒。

主机允许：`bilibili.com`、`www.bilibili.com`、`m.bilibili.com`。范围先限定路径 `/video/<BV…>` 和 `/video/av<数字>`。番剧 `/bangumi/`、课堂和直播不写 `t`，按普通页面保存。

URL：保留 `p`（分 P），设置或替换 `t=<秒>`。不要删掉 `p` 只留 BV，否则会跳到第一 P。

进度：播放器容器内的 `<video>`（当前播放器在 `.bpx-player-video-wrap` 一类容器里）。有多个 video 时取该容器内的一个，不要取页面上的广告或预览。标题优先 `h1` 视频标题，UP 主优先名称节点，失败则用现有 meta。不要读 `__INITIAL_STATE__`，那里混有登录用户数据。

### 验收与测试

- `https://www.bilibili.com/video/BV1xx?p=2` 加 12.2 秒 → `t=12`，`p=2` 仍在，`video` 为 `BV1xx`。
- 番剧 URL 不改写，不带空的 `channel`。
- 与 #80 共用聚合：同一 BV 的多帧按时间排进 `videos/<BV>.md`。
- 非 B 站、非 YouTube 的夹具行为不变。

### 风险

- B 站同样是 SPA。快照时机和 #79 相同，编辑中换视频不能改写已经截下的那一帧。
- 移动站 DOM 不同。URL 和 `<video>.currentTime` 是底线，频道读不到就省略。
- `b23.tv` 短链在跳转完成前没有 BV。跳转前截图就按当时地址保存，不主动请求短链。

<a id="issue-85"></a>

## 85 分享前快速打码

Phase 2。把已经有的马赛克和身份检测收成一次点击，而不是新做一套识别。

### 要改的文件

- `screenshot/toolbar.tsx` 与 `screenshot/index.ts`：预览工具栏加「快速打码」。点击后调用 `detect.ts` 的 `detectIdentityRects`，把选区内的身份矩形转成现有的 mosaic 标注（坐标要乘上截取时记下的 `capturedDpr`）。
- 用户仍可再拖马赛克、撤销、删掉某一块。现有的遮罩删除条可以复用。
- 复制仍走现有的复制按钮，输出 PNG。
- 来源水印：若要「带上站点名」，只在这一次的复制/下载上调用 `paintWatermark`，文字用 `sourceHost`，不写入库内 PNG。默认关，和现有的「水印不是资料的一部分」一致。不要改设置里的署名水印。
- 不新增权限，不上传。

侧栏不要用「画面左侧百分之几」去盖。没有稳定选择器时会误伤正文。本阶段只打 `detect.ts` 已经认识的头像和名字（X 与 `data-ann-identity`）。新站点的选择器以后追加在 `identitySelectorsForHost`，不要散落到工具栏。

### 验收与测试

- 夹具里两个 `data-ann-identity` 落在选区内：一键后预览出现马赛克，入库图被盖住，选区外的身份元素不动。
- 撤销能去掉这次加上的马赛克。
- 来源水印关闭时，复制图与今天一致。打开时复制图带主机名，入库图不带。
- 非 https 页面的复制失败提示保持不变。

### 风险

- 区域截取前如果已经做过 DOM 匿名，像素里可能已经没有头像，再打一次码是空操作。按钮仍应可点，结果是「没有新的框」，不要报错。
- 身份矩形是视口 CSS 像素，画布是设备像素。漏掉 `capturedDpr` 会把码打偏。
- 不要在快速打码里重新调用 `captureVisibleTab`。浏览器每秒只允许两次截取。

<a id="issue-86"></a>

## 86 可选本地 OCR

Phase 3，现在不要写代码。

`docs/v2/product.md` §2.3 把「AI 摘要、问答与模型接入」列为不做，并且不预留入口。仓库里也没有 OCR 实现。在这条产品结论改掉之前，加一个识别按钮就和契约冲突。

若以后明确采纳，最小形状是：

- 只在资料库里对一张已经入库的截图、由用户点击触发。默认没有自动任务。
- 结果写入一个可编辑的文本属性，因此现有搜索能覆盖它。识别失败时不改图片、不改其它字段。
- 引擎必须在本机运行。不新增主机权限，不把图片发到网络，不要求账号。
- 不在截图确认的热路径上加载模型。截图失败与导出失败的行为保持独立。

不要以桌面版并不普遍提供的形状检测 API 作为承诺，也不要在本对照里选定某个 wasm 包。那是采纳之后的依赖决策，还要过 `npm audit` 和打包体积。

## 实现顺序

1. #79 快照、YouTube URL、`video` / `timestamp` / `channel`。这是后面几条的字段基础。
2. #81 与 #82 彼此独立，可以接着做。#82 只动剪藏气泡和 `quickEditPatch`。
3. #80 聚合导出与按 `video` 筛选。没有 #79 的属性就不要从 URL 猜测分组。
4. #84 追加 B 站规则。#83 在快照上补字幕，并让导出的图下出现那一行。
5. #85 把现有检测结果变成马赛克标注。
6. #86 停在产品结论改写之后。

每条实现提交都要同时改 `docs/v2/`：属性进 `entry.md` §5.4 和 §8 清单，来源规则进 `capture.md`，截图工具进 `screenshot.md`，聚合文件进 `storage.md` §6，故事进 `user-stories.md`。未拍板的阈值写进 `validation.md`，不要写进本页当作已定规则。

## 测试入口

实现时按目录约定，而不是只跑全量：

- 属性、URL、导出：`npx vitest run learning-core`
- 截图元数据与保存：`npx vitest run background-service/services/screenshot entrypoints/content/__tests__/page-meta.test.ts`
- 序号和打码：`npx vitest run entrypoints/content/screenshot`，再构建后跑 `e2e/screenshot-beautify.spec.ts` 与 `e2e/screenshot-capture.spec.ts`
- 想法气泡：`npx vitest run entrypoints/content/__tests__/clip-flow.test.ts`，加上 entries 的 sender 测试
- 导出与筛选：`e2e/library-export.spec.ts`、`e2e/library-queries.spec.ts`
- 改完契约后的提交前检查：`npm run verify`
