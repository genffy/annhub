# Learning Core 约定

> 适用于当前 `learning-core/` 实现；不是未来 monorepo 的目标划分。全局规则见根目录 `AGENTS.md`。
> 更新：2026-10-09。

## 边界与实现点

`learning-core/` 是纯 TypeScript 领域核心，不依赖 `chrome.*`、DOM 或 React（单测跑 jsdom/fake-indexeddb）。扩展门面复用同一逻辑契约，不在调用方复制规则。

| 规则               | 文件                                                                    | 契约真源                        |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------- |
| 条目/高亮/属性类型 | `types.ts`                                                              | [entry.md](../docs/v2/entry.md) |
| 归一化             | `normalize.ts`（NFKC→小写→引号连字符→空白→首尾标点，顺序不可换）        | entry.md §6                     |
| 来源 URL 清理      | `url.ts`（令牌名清单在 `TOKEN_PARAM_NAMES`，query 与 hash 都清）        | capture.md §5                   |
| 属性注册表规则     | `properties.ts`（保留名、内置定义、类型校验、tags 上限、类型预设）      | entry.md §5                     |
| 校验管线与错误码   | `validate.ts`（12 个稳定错误码；`context` 包含性按 content 纯文本比较） | entry.md §6                     |
| IndexedDB 存取     | `store.ts`（`annhub` 库；先校验后写入，依赖同事务提交；配额与孤儿报告） | storage.md §3-§7                |
| 检索               | `query.ts`（词命中、权重、属性运算符、keyset 分页、高亮视图）           | search.md                       |
| Markdown 工具      | `markdown.ts`（纯文本化、块切分、`==…==` 写回不跨块不破记号）           | storage.md §6                   |
| ZIP 导出           | `export.ts` + `zip.ts`（store-only ZIP、frontmatter 键序、README）      | storage.md §6                   |
| 本地指标           | `metrics.ts`（事件字典、分桶、按天累计、chrome.storage 注入）           | metrics.md §9                   |
| ID 与摘要          | `assets.ts`（`ent_`/`asset_` ID、SHA-256、单图上限初始值）              | storage.md §4（Q-03 校准上限）  |

## 数据不变量

- 写入前先 `validateEntry`；条目与它新引入的属性定义、截图条目与图片资产、删除截图条目与图片，都在同一 IndexedDB 事务里提交。
- 有高亮的剪藏 `content` 只读（`ENTRY_CONTENT_LOCKED`）；高亮重叠合并走 `mergeHighlight`，范围是 `content` 的 UTF-16 偏移。
- `properties` 只存值；名称与类型的唯一真源是注册表（内置五项在 `BUILTIN_PROPERTY_DEFINITIONS`，顺序决定导出键序）。
- 图片入库统一 PNG，字节是 Blob；dataUrl 只作消息传输格式，绝不持久化。

## 验证

- 类型、校验、存储、检索、导出、指标的改动：`npx vitest run learning-core`（含 fake-indexeddb 事务测试）。
- 契约变化时同步 `docs/v2/` 对应真源与测试断言；新增条目类型或内置属性按 [entry.md §8](../docs/v2/entry.md) 清单补齐。

## 已知问题

> 2026-10-09 对照 `docs/v2` 复核的结果，基线提交 `cfe7c2c`。「实测」是已复现的（直接运行本目录模块，事务类用 fake-indexeddb，导出类用 js-yaml 解析），「读码」是读代码得出的，先写测试确认。
> 优先级：P0 主流程不可用或数据写错；P1 与契约不符但有绕行；P2 清理与质量。完成标准与处理顺序见 [roadmap.md 第 3、5 节](../docs/v2/roadmap.md)，需要拍板的点见 [validation.md 第 5 节](../docs/v2/validation.md)（每条有默认，不阻塞）。
> 每条先写能复现的失败测试，再修；不要放宽断言、跳过或隔离测试来求绿（根 `AGENTS.md`）。修完在本节删除该条，历史看 git。

- **RV-CORE-01 · 写入的事务边界**（P0）。契约：storage.md §5（依赖其他记录的写入在同一事务里检查并提交；删除属性定义同事务检查使用数为 0）。
  - 现象（实测）：`saveEntry`、`updateEntry` 在事务外读注册表并校验，再另开事务写入；`propertyUsageCount`、`deletePropertyDefinition`、`deleteUnusedPropertyDefinitions` 的“检查使用数”与“删除定义”分属两个事务。`Promise.all([deleteUnusedPropertyDefinitions(), saveEntry(带自定义属性)])` 重复 200 次，200 次都是保存成功而定义已被删除：条目带着一个没有定义的属性（导出会丢掉它，搜索与筛选看不见它，属性面板无法判断它的类型）。
  - 要求：每个写入在**一个** `readwrite` 事务里完成“读注册表 → 校验 → 写”，涉及的 store 一次声明；校验保持同步纯函数，数据在事务内读取；IndexedDB 事务不能跨越非 IndexedDB 的异步等待，所以 `sha256` 等先算好再开事务。删除属性定义（含“删除未使用”）在同一事务里扫描使用数并删除。高亮的读-改-写同理（RV-BG-03）。
  - 测试：并发测试，反复 N 次——条目带的属性要么仍有定义，要么保存被拒绝；并发下 `PROPERTY_IN_USE` 仍成立。

- **RV-CORE-02 · 属性注册表的规则**（P1）。契约：entry.md §5.3、§5.4；storage.md §8 第 4 条。
  - `newDefinitions` 不经 `validatePropertyDefinition`，也不检查与既有定义的类型冲突（实测）：把一个已被使用的 text 属性重新定义为 number，`saveEntry` 与 `updateEntry` 都接受，注册表变成 number，已有条目仍存着字符串。事务内处理：同名（不区分大小写）既有定义的类型不同 → `PROPERTY_TYPE_MISMATCH`；类型相同 → 忽略，保留最先创建的写法。
  - 条目 `properties` 的键允许与注册表写法大小写不同（校验按小写匹配），但 `propertyUsageCount`、查询取值、导出都按精确大小写（实测：存了 `Project`、注册表是 `project`，使用数为 0，定义被删，条目仍带着 `Project`）。保存时把键规范成注册表里的写法（entry.md §5.3 第 2 条），`propertyUsageCount` 用 `propertyStorageKey` 比较。
  - `upsertPropertyDefinition` 接受调用方传来的 `builtin: true`（实测）：自定义属性因此不可删，且错误码用了不贴切的 `PROPERTY_IN_USE`。`builtin` 只由 `BUILTIN_PROPERTY_DEFINITIONS` 决定，调用方传入的值忽略；删除内置属性的拒绝消息要说明是内置。
  - 内置属性 `author`、`published`、`description` 的 `presets`、`defaultValue` 应当可改（extension.md §2.4：只有 `title`、`tags` 固定），现在 `upsertPropertyDefinition` 对内置属性一律 `return`，静默忽略（实测：属性页的勾选点了又弹回）。允许更新这两项，名称与类型不可改。
  - 测试：每条一个单测；类型冲突在 `saveEntry` 与 `updateEntry` 两条路径上都被拒绝。

- **RV-CORE-03 · 校验缺口**（P1）。契约：entry.md §5.2、§5.4、§6；D-26。
  - `datetime` 只验形状：`2026-10-09T25:61:61`、`2026-02-31T10:00:00` 通过（实测）。按 D-26 的默认：日期真实存在，时 0–23，分与秒 0–59。
  - `text` 允许换行（实测），规格是单行字符串：拒绝 `\n`、`\r`（采集端先折叠，RV-CAP-06）。
  - `title` 缺失或为空串被接受（实测），规格是固定附加、不可清空：拒绝（`PROPERTY_VALUE_INVALID`）；采集端保证有值（页面标题为空时取 `sourceHost`，已实现）。
  - `saveEntry` 对不可解析的 `sourceUrl`（`''`、`not a url`）直接 `new URL(...)`，抛出裸 `TypeError`（实测），应返回 `ENTRY_SOURCE_INVALID`：先 `isHttpUrl`，`sourceHost` 复用 `normalizeHost`。
  - 测试：每条一个单测，断言错误码。

- **RV-CORE-04 · 搜索用的纯文本化吃掉了字符**（P0）。契约：search.md §1、§2（content 按 Markdown 渲染后的纯文本）；US-LIB-01。
  - 现象（实测）：`markdownToPlainText` 里的 `.replace(/(\*\*\*|___|\*\*|__|\*|_|`)/g, '')`删除所有`_`、`*`、反引号，包括词内的：`max_retry_count`变成`maxretrycount`，搜 `max_retry_count`、`user_id`、`MAX_RETRIES`、`2*3` 都是 0 命中（`**init**` 只是碰巧因为归一化去掉了首尾标点才命中）。
  - 要求：纯文本化保留字面字符，只去掉真正的语法标记；与阅读视图使用同一套行内语法理解（共享解析，或至少共享同一份规则，RK-13），不各写一套正则。RV-CAP-02 引入转义后，纯文本化要还原 `\*` 等转义。查询词与候选字段继续走同一个归一化。
  - 测试：`user_id`、`__init__`、`a*b*c`、`snake_case_name`、`C++`、`#hashtag`、带括号的链接、行内代码、围栏代码——断言搜这些词**能命中**，且语法标记本身（`**`、`](`）搜不到。

- **RV-CORE-05 · 高亮视图的时间筛选用错了时间**（P1）。契约：search.md §5（时间按高亮自己的创建时间）；D-24。
  - 现象（实测）：`queryHighlights` 把 `createdFrom`、`createdTo` 交给 `matchesFilters(clip)`，按**剪藏**的创建时间过滤（代码注释写着 time-of-clip）。高亮创建于剪藏之后第 10 天，筛选“第 5–15 天”得 0 行，筛选“剪藏当天附近”反而得 1 行。
  - 要求：时间按每条高亮自己的 `createdAt` 逐条过滤；来源、标签、属性仍按所属剪藏；颜色按高亮。组序按 D-24 的默认（取该剪藏全部高亮里最新的一条）。
  - 测试：补 `__tests__/query.test.ts` 的高亮视图用例：时间、颜色、组序各一条。

- **RV-CORE-06 · 导出格式**（P0/P1）。契约：storage.md §6、entry.md §5.5；US-DATA-03；D-23。
  - frontmatter 的自定义属性名原样写成 YAML 键（`export.ts` 的 `frontmatterFor`，实测，js-yaml 解析）：`Project: Alpha`、`a: b`、`- x`、`*x`、`& x`、`@x`、反引号开头、`%x`、`> x` 使整份 frontmatter 解析失败；`#todo` 被当成注释，值静默丢失；`[x]`、`{y}`、`! bang`、`1e3` 的键被改写。键按需加引号（单引号，`'` 加倍）。建议用成熟的 YAML 序列化库（新增依赖前按根 `AGENTS.md` 评估并跑 `npm audit --omit=dev`），或实现一个“键与标量一律安全加引号”的最小序列化，并配 round-trip 测试。
  - 值（实测）：以 `:` 结尾的列表项（`ratio:`）被解析成映射；日期样式的标签 `2026-10-09` 被解析成日期；`0x1F` 成了数字；多行文本值在单引号标量里被折叠换行。字符串标量一律加引号（或由库决定）；配合 RV-CORE-03 禁止 `text` 换行。
  - 高亮 `==…==` 写回（`markdown.ts` 的 `writeHighlightMarks`，实测）：(a) 会把 `==` 写进围栏代码块内部，污染代码；(b) 范围跨过粗体、链接、图片边界时记号不成对，Obsidian 里留下裸的 `==`（`Hello **brave ==new** wor==ld`、`See [==the docs](url) now==`）；(c) 范围跨表格单元格；(d) `blockSegments` 只认 0–3 个前导空格，4 空格缩进的嵌套列表项不被当作独立的块，一个高亮会跨越列表项。要求：在行内语法边界处断开并重开（与块边界同理）；围栏内的高亮不写 `==`（“高亮备注”章节仍列出）；与 RV-CAP-02 的列表缩进约定一致。
  - “高亮备注”章节（读码）：`> ${quote}` 只给首行加引用前缀，多行引文的后续行落在引用外——每行加前缀。
  - README（读码）：缺“包含与不包含的数据类别”（storage.md §6）；`Format version: 1` 和数量行里的 `clips / screenshots` 是英文常量——随界面语言。
  - 导出前校验（读码）：记录数、附件引用、写入字节数、资产 `sha256` 与 `ImageAsset.sha256` 一致（storage.md §4、§6）；目前 `readAsset` 不校验摘要。
  - 章节标题是否含“原文”按 D-23 的默认（不含）。自定义键的排序用 `localeCompare`，随运行环境语言变化——改成确定性的码点序。
  - 测试：`__tests__/export.test.ts` 用 YAML 库解析导出结果，对一组棘手的键与值做 round-trip（键、值、类型都逐项相等）；`__tests__/markdown.test.ts` 补围栏、行内边界、嵌套列表、表格的 `==` 用例。

- **RV-CORE-07 · 本地指标类**（P1）。契约：metrics.md §9。
  - `LocalMetrics.record` 并发丢计数（RV-BG-06）：类内串行化。事件字典与属性校验放在这里，运行时拒绝违例，而不是只靠 `MetricEventProps` 的类型。

- **RV-CORE-08 · 重复与无人使用的代码**（P2）。
  - `validate.ts` 的 `mergeHighlight` 只被测试引用；线上的合并逻辑在 `background-service/services/entries` 的 `ADD_HIGHLIGHT` 里另写了一份，行为还不同：前者遇到跨多条高亮的新选区抛错，后者折叠；合并后的 `quote` 取两条里“较长的一个”，不是并集范围的文字——`Exponential`（0–11）与 `ential backoff`（5–19）合并后范围是 0–19，`quote` 却是 `ential backoff`（实测）。合并只保留 store 里单事务的一份（RV-BG-03），`quote` 按并集范围重新生成（用 RV-CORE-04 统一后的纯文本化）。
  - `export.ts` 的 `entrySummary` 无人使用。
