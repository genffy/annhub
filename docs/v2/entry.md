# 条目数据契约

> 层级：vision
> 状态：目标契约
> 更新：2026-10-07

本文定义条目（Entry）的共享字段、三种类型的差异、属性系统与校验规则。持久化与导出见 [存储契约](storage.md)，采集流程见 [采集规则](capture.md)，检索见 [检索契约](search.md)。

## 1. 定义

**条目 = 一次采集的结果：被采集的内容（文字或图片）+ 来源与定位 + 用户自己的备注和属性。**

剪藏、高亮、截图保存为同一种记录，用 `type` 区分类别。类别只决定三件事：哪些系统字段必填、自动附加哪些属性、定位符做什么用。新增类别不新增顶层实体（[D-18](validation.md)）。

## 2. 类型

```typescript
type EntryType = 'clip' | 'highlight' | 'screenshot'
```

| type         | 保存什么               | 页面上的痕迹       | 定位符的用途   |
| ------------ | ---------------------- | ------------------ | -------------- |
| `clip`       | 选中的文字及其语境     | 无                 | 回到来源       |
| `highlight`  | 选中的文字、语境和颜色 | 视觉标记，回访恢复 | 回访时恢复标记 |
| `screenshot` | 处理后的图片           | 无                 | 无（`none`）   |

`type` 在创建时确定，之后不可修改。三种类型的采集入口见 [capture.md §2](capture.md)。

## 3. 共享记录

```typescript
interface EntryRecord {
  id: string
  type: EntryType

  content: string
  context?: string
  assetId?: string
  note?: string

  sourceUrl: string
  sourceHost: string
  pageUrl?: string
  locator: EntryLocator

  properties: Record<string, PropertyValue>
  createdAt: number
  updatedAt: number
}
```

| 字段         | 含义                                                                            | clip            | highlight       | screenshot |
| ------------ | ------------------------------------------------------------------------------- | --------------- | --------------- | ---------- |
| `id`         | 稳定、不含语义，创建后不变                                                      | ✓               | ✓               | ✓          |
| `content`    | 被采集的页面原文                                                                | 必填            | 必填            | 空串       |
| `context`    | 选区所在的句或段（包含选区），用于重新理解与搜索                                | 可选            | 可选            | 不使用     |
| `assetId`    | 处理后图片的资产 ID，字节另存                                                   | 不使用          | 不使用          | 必填       |
| `note`       | 用户自己写的话，与页面原文分开显示                                              | 可选            | 可选            | 可选       |
| `sourceUrl`  | 来源页面的绝对 http(s) 链接；信息流页面优先取内容项永久链接                     | ✓               | ✓               | ✓          |
| `sourceHost` | 来源主机：小写并去掉 `www.`                                                     | ✓               | ✓               | ✓          |
| `pageUrl`    | 采集时所在的页面；与 `sourceUrl` 相同则省略。回访该页面时，用它恢复页面上的高亮 | 可选            | 可选            | 可选       |
| `locator`    | 回到原位置的线索，见第 4 节                                                     | `dom` 或 `none` | `dom` 或 `none` | `none`     |
| `properties` | 扁平的带类型键值，见第 5 节                                                     | ✓               | ✓               | ✓          |

没有 `kind`、加工产物、修订号或归档状态：采集一步完成，条目之后只有编辑和删除。

## 4. 定位符

```typescript
type EntryLocator = { type: 'dom'; selector: string; textOffset?: number; before?: string; after?: string } | { type: 'none' }
```

- `selector` 指向包含选区的最小可信容器；`textOffset` 是选区在该容器文本中的起点；`before` / `after` 是选区前后各至多 40 个字符，供 selector 失效后按文本回退定位。
- 定位符只用来回到原位置，不是真源：页面变化后定位失败时，`content` 与 `context` 仍须足以读懂这条条目；高亮在定位为 `none` 时仍可阅读，只是无法恢复页面标记。
- selector 的优先级和失败处理见 [capture.md §5](capture.md)。

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
4. **使用数** = 带有该属性值的条目数。使用数为 0 才可以删除定义；已被使用的属性不可改类型，v1 也不提供重命名。
5. 内置属性（5.4）不可删除、不可改类型。`tags` 永远存在，类型是列表。
6. 每条条目至多 50 个属性。
7. 空值等于未设置：不写入存储，也不导出；复选框只有被切换过才写入。
8. 值只放短小的原子信息：不支持嵌套，值里不渲染 Markdown；较长的文字写进 `note`。

### 5.4 内置属性与类型预设

**类型预设**：每种条目类型有一组采集时自动附加的属性。附加时的取值顺序是：从页面提取 → 定义里的默认值 → 不设置。用户在属性页给自定义属性勾选预设（[extension.md §2.4](extension.md)）；`title` 与 `tags` 对三种类型固定附加，不可取消。

| 名称          | 类型   | 取值来源                                                    | 预设                |
| ------------- | ------ | ----------------------------------------------------------- | ------------------- |
| `title`       | `text` | 页面标题，为空时取 `sourceHost`；用户可改，不可清空         | 三种类型（固定）    |
| `tags`        | `list` | 用户输入；不区分大小写去重，每项 1 到 32 个字符，至多 20 项 | 三种类型（固定）    |
| `author`      | `list` | 页面 meta；取不到则不设置                                   | `clip`、`highlight` |
| `published`   | `date` | 页面 meta；取不到则不设置                                   | `clip`、`highlight` |
| `description` | `text` | 页面 meta；取不到则不设置                                   | `clip`、`highlight` |
| `color`       | `text` | 调色板中的颜色 ID；非法值回落到默认色                       | `highlight`         |

### 5.5 系统字段与导出映射

系统字段不是属性，用户不能当作属性编辑；属性面板把其中几项只读显示，导出时映射为 frontmatter 键（完整规则见 [storage.md §6](storage.md)）。

| 系统字段                           | 属性面板       | 导出的 frontmatter 键                |
| ---------------------------------- | -------------- | ------------------------------------ |
| `id`                               | 不显示         | `annhub_id`                          |
| `type`                             | 只读 `type`    | `annhub_type`                        |
| `sourceUrl`                        | 只读 `source`  | `source`                             |
| `createdAt`                        | 只读 `created` | `created`（`YYYY-MM-DD`，本地时区）  |
| `updatedAt`                        | 只读 `updated` | 不导出                               |
| `content`、`context`、`note`、图片 | 不显示         | 写入 Markdown 正文，不进 frontmatter |

### 5.6 不做

模板语言（变量、过滤器、逻辑）、按 URL 或 schema.org 自动选择预设（见 [Q-10](validation.md)）、模型提示变量、属性重命名、改已使用属性的类型、批量编辑、嵌套属性、属性里的 Markdown。

## 6. 校验

校验顺序：

```text
type 已注册
  -> 基础字段范围
  -> 类型必填项
  -> 来源与定位符
  -> properties（名称、类型、值、上限）
```

通用规则：

- `content`：`clip`、`highlight` 去首尾空白后非空，至多 10,000 个字符；`screenshot` 必须是空串。
- `context`：至多 2,000 个字符；存在时必须包含归一化后的 `content`，所以选区本身过长时不保存 `context`。归一化只在共享领域层实现一次：NFKC、转小写、统一引号与连字符、折叠空白、去掉首尾标点与空白。
- `note`：纯文本，至多 2,000 个字符。
- `assetId`：`screenshot` 必填，且指向本地资产库中已有的图片；其他类型必须缺省。
- `sourceUrl`、`pageUrl`：绝对 http(s) 链接。条目都来自网页，没有本地来源。
- `locator`：`dom` 的 `selector` 非空，`textOffset` 为非负整数。
- 时间字段：有限的 epoch 毫秒值。
- `properties`：名称、类型与值按第 5 节校验。

校验失败拒绝落库并返回稳定错误码，界面不展示原始异常对象：

| 错误码                    | 触发                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `ENTRY_TYPE_UNKNOWN`      | `type` 不在三种之内                                                |
| `ENTRY_CONTENT_INVALID`   | `content` 为空或过长，或 `screenshot` 的 `content` 非空            |
| `ENTRY_SOURCE_INVALID`    | `sourceUrl` 或 `pageUrl` 不是绝对 http(s) 链接                     |
| `ENTRY_ASSET_MISSING`     | `screenshot` 没有 `assetId` 或图片不存在，或其他类型带了 `assetId` |
| `ENTRY_LOCATOR_INVALID`   | 定位符形状或 selector 不合法                                       |
| `PROPERTY_NAME_INVALID`   | 名称为空、过长、含换行，或是保留名                                 |
| `PROPERTY_TYPE_MISMATCH`  | 与注册表里的类型不一致                                             |
| `PROPERTY_VALUE_INVALID`  | 值不符合类型或超过上限                                             |
| `PROPERTY_LIMIT_EXCEEDED` | 条目的属性数超过上限                                               |
| `PROPERTY_IN_USE`         | 删除或改动了仍被使用的属性定义                                     |

## 7. 与其他数据的关系

- 图片字节与 `ImageAsset` 元数据在资产库，见 [storage.md §4](storage.md)；`screenshot` 条目只保存 `assetId`，删除条目时在同一事务里删除它的图片。
- 条目之间没有链接、层级或引用关系。

## 8. 扩展纪律

新增条目类型或内置属性时，同时提交：本文的类型表、字段矩阵与预设；[capture.md](capture.md) 的流程；[storage.md](storage.md) 的导出映射；[user-stories.md](user-stories.md) 的故事与验收；fixture、单元测试和至少一条端到端采集测试。仅把字符串加入 `EntryType` 不算完成。
