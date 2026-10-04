# 存储与本地交付契约

> 层级：core
> 状态：存储设计真源
> 更新：2026-10-04
> 适用端：浏览器扩展、macOS Desktop

本文定义学习核心与截图资产的本地存储、扩展到 Desktop 的逐项交付、Markdown ZIP 导出和后续同步边界。Fragment 字段形状见 [Fragment 数据契约](fragments.md)。

## 1. 决策

学习核心采用本地优先：

1. 扩展使用 IndexedDB，Desktop 使用 SQLite。两端共享领域字段和稳定 ID，不共享数据库物理文件。
2. 记录、截图元数据和图片字节存入各端数据库的不同 object store / table。Fragment 只保存附件 ID；截图集和 Fragment 可引用同一图片。
3. R1 扩展先本地提交，再通过 Desktop 提供的本地服务逐条写入 Fragment 和所引用的图片。没有 Desktop 时采集、查询与导出继续可用。
4. 扩展提供一个面向其他工具的导出命令：下载包含 Markdown 与已保存图片文件的 ZIP。它不是 AnnHub 数据库的无损恢复格式。
5. R1 是单向交付；Desktop 复习结果留在 SQLite。R3 再处理双向增量收敛和冲突。

核心流程只使用扩展与本机 Desktop，不规划远程服务或服务器存储。

## 2. 数据分层

| 层         | 数据                                       | 扩展                         | Desktop                  | R1 交付范围                         |
| ---------- | ------------------------------------------ | ---------------------------- | ------------------------ | ----------------------------------- |
| A 图片资产 | 已处理的截图原图、元数据、可重建缩略图     | IndexedDB `Blob`              | SQLite `BLOB`            | 仅传被 `visual` Fragment 引用的图片 |
| B 学习核心 | Fragment、ReviewLog | IndexedDB object stores       | SQLite tables            | Fragment 的采集字段逐项写入         |
| C 偏好     | UI、快捷键、Provider、队列上限             | chrome.storage / IndexedDB   | UserDefaults             | 默认不传送                         |

“原图”指裁剪、匿名和马赛克完成后实际保存的图片字节，不是处理前可能含敏感信息的屏幕图。缩略图仅作缓存，能从原图重建。浏览器端不以 Base64 `dataUrl` 作为持久格式。

区域/元素截取与处理时序见 [截图采集](screenshot.md)；本文件只定义持久化、引用和交付。

## 3. 核心实体

### 3.1 ReviewLog

```typescript
interface ReviewLog {
  id: string
  target: { type: 'fragment'; fragmentId: string }
  rating: 'again' | 'hard' | 'good' | 'easy'
  reviewedAt: number
  previousIntervalDays: number
  nextIntervalDays: number
  usedHint: boolean
  schedulerVersion: string
}
```

`ReviewLog` 是不可变事实。评分时必须在同一事务内写入日志并更新 Fragment 的派生 `review` 状态。

复习目标只允许 Fragment。R3 回传或内部恢复接收 ReviewLog 时，校验器拒绝其他 target 形状；R1 扩展不向 Desktop 交付复习日志。

### 3.2 OutboxEvent

```typescript
type SyncEventType =
  | 'fragment.created'
  | 'fragment.updated'
  | 'asset.created'
  | 'review.rated'

interface OutboxEvent {
  eventId: string
  deviceId: string
  type: SyncEventType
  payload: unknown
  createdAt: number
  attempts: number
  lastAttemptAt?: number
}
```

`(deviceId, eventId)` 是幂等键。只有服务端或中枢确认后才可裁剪事件；未确认事件不能因队列上限被静默删除。

R1 的 outbox 只负责扩展向 Desktop 交付 Fragment 和所引用图片的待发送状态。普通截图保存在截图集时不排队；转成 `visual` Fragment 的同一事务才追加该资产的交付任务。事件中只放 ID、修订号和必要元数据，不放图片字节；图片从本地 asset store 读取。R3 再扩展为双向事件同步。

### 3.3 图片资产与截图集

```typescript
interface ImageAsset {
  id: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  byteLength: number
  sha256: string
  width: number
  height: number
  createdAt: number
}

interface ScreenshotRecord {
  id: string
  assetId: string
  sourceUrl: string
  sourceTitle?: string
  capturedAt: number
}
```

图片字节不进入 `ImageAsset` 的消息 JSON：扩展的同 ID asset store 保存 `Blob`，Desktop 的同 ID `assets` 表保存 `BLOB`。`visual.detail.attachmentIds` 和 `ScreenshotRecord.assetId` 引用同一个稳定 ID，避免从截图集转为 Fragment 时复制一张图。`sha256` 校验传输与 ZIP 导出的字节；ID 不使用文件名或哈希替代，以便同图不同采集记录保持独立身份。

截图集删除只删除自己的记录；还有 Fragment 引用时保留图片。只有引用数为零、且不存在待交付任务的资产才可清理。Desktop 没收到图片时由本地引用与 `assets` 表派生“附件缺失”，不把缺失状态写成 Fragment 的第二份真源。

## 4. 本地写入纪律

任何学习核心写入都遵循：

```text
validate -> write entity -> append delivery event -> commit
```

实体和交付事件必须处于同一 IndexedDB 事务。否则会出现“本地成功但永远无法交付”或“事件存在但实体写入失败”的分裂状态。截图保存时，截图元数据与 `Blob` 也在同一个 IndexedDB 事务提交；转为 Fragment 时只建立对现有 `assetId` 的引用。

关键事务：

- 创建或更新 Fragment + outbox
- 创建 `visual` Fragment + Fragment 事件 + 所引用资产的交付任务
- 保存截图元数据 + 图片 `Blob`
- 评分：更新 review + 写 ReviewLog + outbox
- 扩展删除 Fragment：同事务移除本地记录和该 ID 的待发送任务，并写仅本地可见的删除标记；不发送删除事件。
- Desktop 删除 Fragment：同事务处理本地复习日志和删除标记，不影响扩展。

## 5. 扩展 IndexedDB

当前数据库采用 `fragment-store`，核心 stores：

```typescript
interface FragmentDB {
  fragments: {
    key: string
    indexes: {
      'by-kind': string
      'by-host': string
      'by-tag': string
      'by-review-date': number
      'by-created': number
      'by-normalized': string
    }
  }
  reviewLogs: {
    key: string
    indexes: {
      'by-target': string
      'by-reviewed': number
    }
  }
  assets: {
    key: string // assetId
    value: { metadata: ImageAsset; bytes: Blob }
  }
  screenshots: {
    key: string // screenshotId
    value: ScreenshotRecord
  }
  outboxEvents: {
    key: string
    indexes: { 'by-created': number }
  }
  localDeletions: { key: string } // 已在扩展本地删除的 Fragment ID
}
```

detail 字段默认不建索引。先按 kind、host、tag 或时间缩小集合，再在内存筛选，避免每增加一种 kind 就扩张数据库 schema。

截图元数据和图片字节放进同一扩展 IndexedDB 的独立 object store，使引用与图片可以一致提交。Highlight 和 Clip 仍是独立实体；ZIP 导出会读取它们的本地存储。

IndexedDB 与 SQLite 共享逻辑契约，不共享物理格式、索引实现或原始数据库文件。扩展运行时按需检查 `navigator.storage.estimate()`；配额不足须报告失败并保留用户表单或可重试截图，不得显示保存成功。图片大小上限和压缩策略需在真实截图样本与性能测试后确定，不依赖一个假定的固定 IndexedDB 配额。

## 6. SQLite

原生端使用与学习核心语义一致的表：

```sql
CREATE TABLE fragments (
  id                 TEXT PRIMARY KEY,
  schema_version     INTEGER NOT NULL,
  capture_revision   INTEGER NOT NULL,
  kind               TEXT NOT NULL,
  content            TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  context_json       TEXT NOT NULL,
  processing_json    TEXT NOT NULL,
  detail_json        TEXT NOT NULL,
  review_json        TEXT NOT NULL,
  tags_json          TEXT NOT NULL,
  source_device_id   TEXT NOT NULL,
  source_payload_hash TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE review_logs (
  id                     TEXT PRIMARY KEY,
  target_fragment_id     TEXT NOT NULL,
  rating                 TEXT NOT NULL,
  reviewed_at            INTEGER NOT NULL,
  previous_interval_days INTEGER NOT NULL,
  next_interval_days     INTEGER NOT NULL,
  used_hint              INTEGER NOT NULL,
  scheduler_version      TEXT NOT NULL
);

CREATE TABLE outbox_events (
  event_id        TEXT PRIMARY KEY,
  device_id       TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  attempts        INTEGER NOT NULL,
  last_attempt_at INTEGER
);

CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  mime_type   TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  bytes       BLOB NOT NULL
);

CREATE TABLE fragment_deletions (
  fragment_id      TEXT PRIMARY KEY,
  deleted_at       INTEGER NOT NULL
);
```

SQLite 使用 WAL 和 busy timeout。图片字节放在独立 `assets` 表，Fragment 表只引用 ID；大图不会在普通列表查询中读取。跨设备不能直接共享同一个正在写入的数据库文件。

## 7. 唯一的用户导出：Markdown ZIP

R1 的扩展只提供一个“导出内容”命令，不要求安装或启动 Desktop。扩展读取已提交的本地记录与图片字节，生成一个 ZIP，供 Obsidian 等工具读取；不导出浏览器管理的 IndexedDB 物理文件，也不提供单独的 JSON / CSV 用户导出。

```text
AnnHub-export.zip
├── README.md                  # 导出时间、范围、数量、缺失图片清单
├── fragments/<id>.md          # 七种文本及 visual Fragment
├── highlights/<id>.md         # 高亮原文、备注与来源
├── clips/<id>.md              # 剪藏与语境
├── screenshots/<id>.md        # 截图说明、来源与相对图片链接
└── assets/<assetId>.<ext>     # 已保存的处理后图片原始字节
```

每份 Markdown 使用稳定 ID 作文件名，YAML frontmatter 保留类型、来源 URL、标题、采集时间、标签和关联 ID；正文以可阅读的章节保存原文、语境与用户加工。`visual` 和截图 Markdown 使用相对路径引用同一份 `assets/` 文件，不复制图片。空类别可省略目录。`README.md` 必须说明这是扩展内容导出，并列出成功数量与缺失资产；有缺失图片时不得显示为完整成功。

示例（`fragments/<id>.md`，YAML 通过序列化器生成，不手工拼接）：

```markdown
---
annhub_id: "frag_123"
kind: visual
source_url: "https://example.com/article"
captured_at: "2026-09-24T08:00:00.000Z"
tags: ["design"]
asset_ids: ["asset_456"]
---
# 关键细节描述

## 页面语境
描述对应的页面背景。

## 核验与应用
用户确认的核验结果和计划使用场景。

![截图](../assets/asset_456.png)
```

`README.md` 写明格式版本、导出时刻、包含与不包含的数据类别。导出开始时固定记录 ID 和采集修订号；读取过程中若记录变化，则重新读取该项或报告其未纳入本次 ZIP。缺失图片不生成失效链接，Markdown 标注“图片缺失”，README 列出资产 ID；用户可下载部分 ZIP，但界面必须显示“部分导出”与数量。

导出范围是扩展中已提交的 Fragment、Highlight、Clip、截图集记录，以及它们引用且实际保存在扩展中的图片。包含图片处理后的原字节，不重新请求网页图片 URL。导出不包含尚未提交的表单、Desktop 独有的 ReviewLog、交付队列、Provider 密钥、配对 token、UI 偏好和可重建缓存。

ZIP 文件名和内部路径只能由受控 ID 生成，不能直接使用网页标题；写入时转义 Markdown / YAML 内容，避免路径穿越和格式破坏。图片按 Blob 分批读取，避免为大型图片集一次性创建 Base64 字符串或把所有文件同时载入内存。导出完成前校验记录数、附件引用和写入字节数。

这个 ZIP 是供其他工具消费的开放阅读格式，不提供反向导入 AnnHub，也不用于恢复复习调度、日志或 Desktop 状态。

## 8. R1 单条写入 Desktop

扩展先在 IndexedDB 提交 Fragment 与交付任务，再调用只监听本机 loopback 的 Desktop 服务。R1 只交付 Fragment 的采集字段和它引用的图片；独立 Highlight、Clip 和未转为 Fragment 的截图留在扩展，可通过第 7 节的 ZIP 导出。

```text
GET    /health
POST   /v1/pair
PUT    /v1/fragments/{id}  # 一条 Fragment 的采集字段，JSON 请求体
PUT    /v1/assets/{id}     # 一张图片的原始字节，带 MIME、大小与 SHA-256
```

`PUT /v1/fragments/{id}` 的 body 为 `{ deviceId, fragment }`；`fragment` 只含 `schemaVersion / id / captureRevision / kind / content / normalizedContent / context / processing / detail / tags / createdAt / updatedAt`，不传 `review`。URL ID 与 body ID 必须相同。Desktop 保存扩展设备 ID、已接收修订号与采集字段哈希：首次写入返回 201；同 ID、修订号和哈希重复返回 200（`applied=false`）；旧修订号返回 200（`applied=false`、`currentRevision`）；同修订号而内容不同返回 409。所有成功响应带 ID、已持久化修订号和哈希。Desktop 本地已删除的 ID 返回 410，不因扩展重试而复活。

图片 `PUT` 使用原始二进制 body，MIME、字节数和 SHA-256 放入受控请求头；同 ID 同哈希可重复确认，同 ID 不同哈希返回 409。Desktop 校验实际 MIME、长度与哈希，并在 SQLite 提交后确认。无效 schema 或图片返回 422，超过双方共享的 `MAX_IMAGE_BYTES` 返回 413；具体上限需依据真实截图与端到端性能测量设置为两端同一常量，超限时扩展保留本地图片并给出可操作提示。

Desktop 只监听 `127.0.0.1`。配对 token 由 Desktop 生成，用户在扩展中输入；轮换 token 后旧客户端须重新配对，本地数据与待发送任务保留。写入接口要求 Bearer token，并对浏览器 Origin 使用固定扩展 ID 白名单，不返回通配 CORS；拒绝未授权或不支持的来源。`/health` 只返回版本与可用状态，不泄露 token 或用户数据。响应 401/403 须停止自动重试并提示重新配对，410 须停止该 ID 的重试并标记 Desktop 已本地删除；网络错误与 5xx 才按退避重试。

R1 的 `FragmentRecord.review` 在 Desktop 首次接收时初始化；后续扩展更新只替换 `content / context / processing / detail / tags` 等采集字段，不能覆盖 Desktop 的 `review` 和 ReviewLog。为保持单向写入可解释，R1 Desktop 的采集字段只读；修正这些字段在扩展完成。双端编辑与冲突解决留在 R3。

交付顺序为 Fragment、再图片。图片失败不回滚 Fragment，Desktop 显示文字内容和附件缺失态；扩展分别保留记录与图片的待发送任务。Desktop 未启动、鉴权失败或超时时，本地采集仍成功，队列不被清空；恢复连接后按 ID 和修订号重试。只有收到对应项目的持久化确认才能删除其待发送任务。网络请求不放在 IndexedDB 事务里，避免事务提前结束。

## 9. R3 双向本地收敛

R3 增加 Desktop 到扩展的复习数据回传、游标与可见冲突报告。接口为 `POST /v1/events`（幂等接收扩展事件）与 `GET /v1/changes`（按游标拉取 Desktop 变更）；拉取在交付之后同批执行，401/403 时双向停止自动重试。采集字段与复习字段分别合并，不能以整条 Fragment 的 `updatedAt` 做覆盖；同一字段域内部的并发更新才进入冲突规则。事件和图片分开传，事件只包含结构化字段与资产引用；任何端都不直接同步正在运行的 SQLite 或浏览器 IndexedDB 文件。Fragment 删除始终只作用于各自本地库，不通过事件传播；接收端以本地删除标记拒绝旧 ID 再写入。

## 10. 删除与资产清理

扩展删除 Fragment 只删除扩展 IndexedDB 中该记录与它的交付任务；已交付 Desktop 的独立副本不受影响。扩展保留仅本地可见的 ID 删除标记，R3 回传时也不重新导入该 ID。高亮、剪藏和图片资产不默认删除。未引用且没有待交付任务的图片可由清理任务回收。

Desktop 删除 Fragment 只处理 SQLite：删除该 Fragment 和对应 ReviewLog。Desktop 写入本地 `fragment_deletions` 标记，后续同 ID 的扩展 PUT 返回 410；用户如需重新采集，应创建新 ID。Desktop 删除不回写扩展。

删除附件时：

- 不删除 Fragment。
- 把附件引用标记为 missing。
- 保留文本摘要、上下文和用户加工。

图片清理按实际引用与待发送任务判断，不以删除某一张截图集卡片作为立即删除 `Blob` / `BLOB` 的理由。清理任务需要可报告孤儿资产和缺失引用。

## 11. 契约验证清单

存储与交付契约的任何改动，最低验证包括：

1. Fragment 使用 `schemaVersion: 4` 的 wire 契约；不为目标态定义旧 JSON exportVersion 的延续版本。
2. 双端用同一组逐项消息、资产字节和拒绝案例的 fixture 验证。
3. IndexedDB 与 SQLite 的表结构与本文一致；图片以 Blob / BLOB 存储。
4. 用户界面只有一个导出入口（Markdown ZIP），没有旧 JSON 导入导出。
5. 本地接口覆盖单条新增、更新、重复请求、断线重试、图片缺失与复习状态保留；删除分别验证扩展本地清理和 Desktop 本地 410 拒绝重放。
