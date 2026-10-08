# 条目数据契约

> 层级：vision
> 状态：目标契约
> 更新：2026-10-08

本文定义条目（Entry）的共享字段、两种类型的差异、剪藏里的高亮、属性系统与校验规则。持久化与导出见 [存储契约](storage.md)，采集流程见 [采集规则](capture.md)，检索见 [检索契约](search.md)。

## 1. 定义

**条目 = 一次采集的结果：被采集的内容（Markdown 文字或图片）+ 来源 + 用户自己的备注和属性。**

剪藏与截图保存为同一种记录，用 `type` 区分类别。类别只决定两件事：哪些系统字段必填、自动附加哪些属性。**高亮不是条目类型**：它是用户在资料库里读一条剪藏时划出的标注，保存在这条剪藏里。三种动作——剪藏、高亮、截图——两种条目，一个库；新增类别不新增顶层实体。

## 2. 类型

```typescript
type EntryType = 'clip' | 'screenshot'
```

| type         | 保存什么                                    | 页面上的痕迹 | 之后能做什么             |
| ------------ | ------------------------------------------- | ------------ | ------------------------ |
| `clip`       | 指认的页面内容（选区或区块），Markdown 文字 | 无           | 阅读、高亮、加备注和属性 |
| `screenshot` | 处理后的图片                                | 无           | 查看、下载、加备注和属性 |

`type` 在创建时确定，之后不可修改。两种类型的采集入口见 [capture.md §2](capture.md)。

## 3. 共享记录

```typescript
interface EntryRecord {
  id: string
  type: EntryType

  content: string
  context?: string
  assetId?: string
  note?: string
  highlights?: Highlight[]

  sourceUrl: string
  sourceHost: string

  properties: Record<string, PropertyValue>
  createdAt: number
  updatedAt: number
}
```

| 字段         | 含义                                                                                                     | clip   | screenshot |
| ------------ | -------------------------------------------------------------------------------------------------------- | ------ | ---------- |
| `id`         | 稳定、不含语义，创建后不变                                                                               | ✓      | ✓          |
| `content`    | 被采集的页面内容，Markdown 源文本，不含原始 HTML                                                         | 必填   | 空串       |
| `context`    | 选区剪藏时，选区所在的句或段（包含选区），纯文本，用于重新理解与搜索；区块剪藏不保存                     | 可选   | 不使用     |
| `assetId`    | 处理后图片的资产 ID，字节另存                                                                            | 不使用 | 必填       |
| `note`       | 用户自己写的话，与页面原文分开显示                                                                       | 可选   | 可选       |
| `highlights` | 用户在资料库里划出的高亮，见第 4 节                                                                      | 可选   | 不使用     |
| `sourceUrl`  | 来源页面的绝对 http(s) 链接；信息流页面和区块剪藏优先取内容自己的永久链接（[capture.md §5](capture.md)） | ✓      | ✓          |
| `sourceHost` | 来源主机：小写并去掉 `www.`                                                                              | ✓      | ✓          |
| `properties` | 扁平的带类型键值，见第 5 节                                                                              | ✓      | ✓          |

采集一步完成，不在网页上留标记，也不保存页面内的定位信息：“回到来源”只打开 `sourceUrl`。条目之后只有阅读、高亮、编辑和删除。

## 4. 高亮

高亮是剪藏里的标注，不是独立记录：它随剪藏读写，没有自己的标签和属性；检索、筛选和导出都经由所属剪藏（[search.md](search.md)、[storage.md §6](storage.md)）。

```typescript
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple'

interface Highlight {
  id: string
  start: number
  end: number
  quote: string
  color: HighlightColor
  note?: string
  createdAt: number
}
```

1. **范围**：`start`、`end` 是 `content`（Markdown 源文本）里的字符偏移（UTF-16 码元），满足 `0 ≤ start < end ≤ content.length`。用户在渲染后的文字上选取；把选区换算成源文本偏移、以及导出时写回 `==…==`，都由同一个共享模块实现，界面和导出不各自换算。
2. **引文**：`quote` 是被选中的渲染文字，纯文本，去首尾空白后非空，至多 2,000 个字符；列表、搜索和导出里的引文都用它，不重新渲染。
3. **颜色**：五色之一，默认取设置里的默认高亮颜色，之后可改。颜色只是用户的选择，不承担含义；界面标出高亮时不只靠底色。
4. **备注**：纯文本，至多 1,000 个字符，可空。
5. **数量**：每条剪藏至多 200 条高亮。
6. **不重叠**：新选区与已有高亮相交时合并为一条：范围取并集，`id`、颜色沿用最早的那条，两条备注依次用空行连接；合并后的备注超过上限时不合并，并提示先处理备注。
7. **正文锁定**：剪藏有高亮时，`content` 只读，因为范围依赖它；删除全部高亮后恢复可编辑。上限与锁定规则是初始规则，阶段 V 校准。
8. **页面不显示高亮**：高亮只出现在资料库的阅读视图与高亮视图里，不写进网页。

## 5. 属性

属性借鉴 Obsidian Web Clipper 的 Properties 设计（事实与来源见 [market.md §4.2](market.md)）：一条属性是名称、类型和值，名称与类型全局绑定，落盘为 YAML frontmatter。

### 5.1 模型

```typescript
type PropertyType = 'text' | 'list' | 'number' | 'checkbox' | 'date' | 'datetime'
type PropertyValue = string | string[] | number | boolean

interface PropertyDefinition {
  name: string
  type: PropertyType
  defaultValue?: PropertyValue
  builtin: boolean
  presets: EntryType[]
}
```

`PropertyDefinition` 组成属性注册表，是名称到类型的唯一真源；条目的 `properties` 只存值。

### 5.2 类型与存储值

| 类型       | 界面（中文 / English） | 存储值                                    | 格式与上限                         |
| ---------- | ---------------------- | ----------------------------------------- | ---------------------------------- |
| `text`     | 文本 / Text            | 单行字符串                                | 至多 1,000 个字符                  |
| `list`     | 列表 / List            | 字符串数组，去重                          | 至多 50 项，每项 1 到 100 个字符   |
| `number`   | 数字 / Number          | 有限数字                                  | 整数或小数，不接受表达式           |
| `checkbox` | 复选框 / Checkbox      | 布尔                                      | `true` 或 `false`                  |
| `date`     | 日期 / Date            | `YYYY-MM-DD`                              | 必须是真实存在的日期               |
| `datetime` | 日期时间 / Date & time | `YYYY-MM-DDTHH:mm:ss`，本地时区、不带偏移 | 与 Obsidian 的“日期和时间”格式一致 |

### 5.3 注册表规则

1. **名称全局绑定类型**：同一个名称在所有条目里是同一种类型。在条目上添加注册表里没有的名称时，必须同时选择类型，并在同一事务里写入注册表。
2. 名称 1 到 64 个字符，不含换行；条目内唯一；比较不区分大小写，保存时保留最先创建的写法。
3. 保留名不可用作属性名：`id`、`type`、`source`、`created`、`updated`、`content`、`note`，以及以 `annhub_` 开头的名称。
4. **使用数** = 带有该属性值的条目数。使用数为 0 才可以删除定义；已被使用的属性不可改类型，也不提供重命名。
5. 内置属性（5.4）不可删除、不可改类型。`tags` 永远存在，类型是列表。
6. 每条条目至多 50 个属性。
7. 空值等于未设置：不写入存储，也不导出；复选框只有被切换过才写入。
8. 值只放短小的原子信息：不支持嵌套，值里不渲染 Markdown；较长的文字写进 `note`。

### 5.4 内置属性与类型预设

**类型预设**：每种条目类型有一组采集时自动附加的属性。附加时的取值顺序是：从页面提取 → 定义里的默认值 → 不设置。用户在属性页给自定义属性勾选预设（[extension.md §2.4](extension.md)）；`title` 与 `tags` 对两种类型固定附加，不可取消。

| 名称          | 类型   | 取值来源                                                    | 预设             |
| ------------- | ------ | ----------------------------------------------------------- | ---------------- |
| `title`       | `text` | 页面标题，为空时取 `sourceHost`；用户可改，不可清空         | 两种类型（固定） |
| `tags`        | `list` | 用户输入；不区分大小写去重，每项 1 到 32 个字符，至多 20 项 | 两种类型（固定） |
| `author`      | `list` | 页面 meta；取不到则不设置                                   | `clip`           |
| `published`   | `date` | 页面 meta；取不到则不设置                                   | `clip`           |
| `description` | `text` | 页面 meta；取不到则不设置                                   | `clip`           |

### 5.5 系统字段与导出映射

系统字段不是属性，用户不能当作属性编辑；属性面板把其中几项只读显示，导出时映射为 frontmatter 键（完整规则见 [storage.md §6](storage.md)）。

| 系统字段                                         | 属性面板       | 导出的 frontmatter 键                                    |
| ------------------------------------------------ | -------------- | -------------------------------------------------------- |
| `id`                                             | 不显示         | `annhub_id`                                              |
| `type`                                           | 只读 `type`    | `annhub_type`                                            |
| `sourceUrl`                                      | 只读 `source`  | `source`                                                 |
| `createdAt`                                      | 只读 `created` | `created`（`YYYY-MM-DD`，本地时区）                      |
| `updatedAt`                                      | 只读 `updated` | 不导出                                                   |
| `content`、`context`、`note`、`highlights`、图片 | 不显示         | 写入 Markdown 正文（高亮写成 `==…==`），不进 frontmatter |

### 5.6 不做

模板语言（变量、过滤器、逻辑）、按 URL 或 schema.org 自动选择预设（见 [Q-10](validation.md)）、模型提示变量、属性重命名、改已使用属性的类型、批量编辑、嵌套属性、属性里的 Markdown，以及给单条高亮加标签或属性。

## 6. 校验

校验顺序：

```text
type 已注册
  -> 基础字段范围
  -> 类型必填项
  -> 来源
  -> highlights（范围、引文、颜色、备注、数量）
  -> properties（名称、类型、值、上限）
```

通用规则：

- `content`：`clip` 去首尾空白后非空，至多 100,000 个字符的 Markdown，不含原始 HTML；`screenshot` 必须是空串。
- `context`：仅 `clip` 可有，纯文本，至多 2,000 个字符；存在时必须包含 `content` 的纯文本（归一化后比较），所以选区本身过长时不保存 `context`。归一化只在共享领域层实现一次：NFKC、转小写、统一引号与连字符、折叠空白、去掉首尾标点与空白。
- `note`：纯文本，至多 2,000 个字符。
- `assetId`：`screenshot` 必填，且指向本地资产库中已有的图片；`clip` 必须缺省。
- `sourceUrl`：绝对 http(s) 链接。条目都来自网页，没有本地来源。
- `highlights`：仅 `clip` 可有；每条按第 4 节校验，范围互不重叠，`id` 在条目内唯一。
- 时间字段：有限的 epoch 毫秒值。
- `properties`：名称、类型与值按第 5 节校验。

校验失败拒绝落库并返回稳定错误码，界面不展示原始异常对象：

| 错误码                     | 触发                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `ENTRY_TYPE_UNKNOWN`       | `type` 不在两种之内                                                                               |
| `ENTRY_CONTENT_INVALID`    | `content` 为空或过长，或 `screenshot` 的 `content` 非空                                           |
| `ENTRY_CONTENT_LOCKED`     | 有高亮的剪藏被修改了 `content`                                                                    |
| `ENTRY_SOURCE_INVALID`     | `sourceUrl` 不是绝对 http(s) 链接                                                                 |
| `ENTRY_ASSET_MISSING`      | `screenshot` 没有 `assetId` 或图片不存在，或 `clip` 带了 `assetId`                                |
| `HIGHLIGHT_INVALID`        | 范围越界、为空或与其他高亮重叠；引文为空或过长；颜色不在五色之内；备注过长；`screenshot` 带了高亮 |
| `HIGHLIGHT_LIMIT_EXCEEDED` | 一条剪藏的高亮数超过上限                                                                          |
| `PROPERTY_NAME_INVALID`    | 名称为空、过长、含换行，或是保留名                                                                |
| `PROPERTY_TYPE_MISMATCH`   | 与注册表里的类型不一致                                                                            |
| `PROPERTY_VALUE_INVALID`   | 值不符合类型或超过上限                                                                            |
| `PROPERTY_LIMIT_EXCEEDED`  | 条目的属性数超过上限                                                                              |
| `PROPERTY_IN_USE`          | 删除或改动了仍被使用的属性定义                                                                    |

## 7. 与其他数据的关系

- 图片字节与 `ImageAsset` 元数据在资产库，见 [storage.md §4](storage.md)；`screenshot` 条目只保存 `assetId`，删除条目时在同一事务里删除它的图片。
- 条目之间没有链接、层级或引用关系；高亮不是独立记录，删除剪藏时一并删除。

## 8. 扩展纪律

新增条目类型或内置属性时，同时提交：本文的类型表、字段矩阵与预设；[capture.md](capture.md) 的流程；[storage.md](storage.md) 的导出映射；[user-stories.md](user-stories.md) 的故事与验收；fixture、单元测试和至少一条端到端采集测试。仅把字符串加入 `EntryType` 不算完成。高亮字段变化时，同步导出映射（`==…==` 与“高亮备注”章节）和范围换算的 fixture。
