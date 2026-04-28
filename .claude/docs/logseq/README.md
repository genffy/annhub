# Logseq 本地同步模块说明

更新时间：2026-04-28

本文档描述 AnnHub 与 Logseq 本地 HTTP Server 的同步实现基线、数据格式、消息协议和排障要点。

## 1. 目标与范围

Logseq 同步模块用于将 AnnHub 采集的高亮和 Clip 数据同步到用户本机 Logseq 图谱中。

核心目标：

1. 使用 Logseq 本地 HTTP Server API，不依赖远端服务。
2. 将数据写入 Logseq Journal 页面，复用 Logseq 原生日记系统。
3. 使用标签组织内容，便于在 Logseq 内按来源和主题筛选。
4. 通过 `annhubId` 属性去重，避免重复同步。

主链路：

```text
AnnHub 保存 Highlight / Clip
  -> Background 检查 Logseq 配置
  -> LogseqSyncService 格式化内容
  -> LogseqClient 调用本地 HTTP API
  -> 写入对应 Journal 页面
```

## 2. Logseq HTTP API

默认服务地址：

```text
http://127.0.0.1:12315/api
```

请求约定：

- 方法：`POST /api`
- 认证：`Authorization: Bearer {token}`
- Body：`{ "method": "...", "args": [...] }`

当前使用的 API 方法：

- `logseq.App.getCurrentGraph`：测试连接
- `logseq.App.getUserConfigs`：获取用户配置，主要用于读取日期格式
- `logseq.Editor.getPage`：检查页面是否存在
- `logseq.Editor.createPage`：创建页面，支持 `{ journal: true }`
- `logseq.Editor.appendBlockInPage`：向页面追加 block
- `logseq.Editor.insertBlock`：插入子 block
- `logseq.Editor.getPageBlocksTree`：获取 block 树，用于去重

## 3. 模块职责

### Background

- `background-service/services/logseq/index.ts`
  - `LogseqService`，实现 `IService`
  - 初始化 Logseq 同步服务
  - 非关键服务，初始化失败不阻塞其他服务
- `background-service/services/logseq/logseq-client.ts`
  - 封装 Logseq HTTP API 调用
  - 统一处理 auth header、错误响应和 result 解析
  - 处理 Journal 日期格式
- `background-service/services/logseq/logseq-formatter.ts`
  - 将 `HighlightRecord` / `ClipRecord` 转为 Logseq Journal block 数据
  - 构建标签、源页面引用和子 block
- `background-service/services/logseq/logseq-sync.ts`
  - 同步编排：读取配置、确保页面、去重、追加 block、批量同步
- `background-service/services/logseq/message-handles.ts`
  - 处理 Logseq 相关消息

### Options

- `entrypoints/options/pages/LogseqPage.tsx`
  - 配置 Server URL、Authorization Token、同步开关、自定义标签、域名标签
  - 提供连接测试和手动同步入口

### Types

- `types/logseq.ts`
  - `LogseqConfig`
  - `LogseqSyncResult`
  - Logseq block/page/config 类型
- `types/messages.ts`
  - Logseq 消息类型

## 4. 数据格式

当前采用 Journal 模式：所有同步内容写入对应日期的日记页面。

### 高亮 Block

```text
[[Feb 18th, 2026]]

- #annhub #example_com [[Article Title]] [source](https://example.com/article)
    annhubId:: hl_abc123def
  - > 被高亮的文本内容
  - 用户备注内容
```

### Clip Block

```text
[[Feb 18th, 2026]]

- #annhub #github_com [[Repository README]] [source](https://github.com/user/repo)
    annhubId:: clip_xyz789ghi
  - > 采集的文本内容
  - 用户备注内容
```

设计要点：

- Journal 页面名称由 Logseq 用户日期格式决定，不直接使用 ISO 日期。
- `#annhub` 是统一标识。
- 自定义标签来自用户配置，例如 `#reading`、`#research`。
- 域名标签可自动生成，例如 `#example_com`。
- `[[Page Title]]` 创建源页面引用。
- Markdown 链接保留源 URL。
- `annhubId` 作为去重属性。

## 5. 核心数据模型

### `LogseqConfig`

```typescript
interface LogseqConfig {
  enabled: boolean
  serverUrl: string
  authToken: string
  autoSync: boolean
  syncMode: 'journal'
  customTags: string
  autoTagDomain: boolean
}
```

配置持久化 key：

```text
annhub-logseq-config
```

### `LogseqSyncResult`

```typescript
interface LogseqSyncResult {
  success: boolean
  pageCreated: boolean
  blockAppended: boolean
  skippedDuplicate: boolean
  error?: string
}
```

## 6. 消息协议

| 消息类型 | 方向 | 说明 |
| --- | --- | --- |
| `LOGSEQ_TEST_CONNECTION` | UI -> background | 测试 Logseq 服务器连通性 |
| `LOGSEQ_GET_CONFIG` | UI -> background | 获取 Logseq 配置 |
| `LOGSEQ_SET_CONFIG` | UI -> background | 更新 Logseq 配置 |
| `LOGSEQ_SYNC_HIGHLIGHT` | UI -> background | 同步单条高亮 |
| `LOGSEQ_SYNC_CLIP` | UI -> background | 同步单条 Clip |
| `LOGSEQ_SYNC_ALL` | UI -> background | 批量同步 active 高亮 |

## 7. 同步策略

### 自动同步

`SAVE_HIGHLIGHT` / `SAVE_CLIP` 保存成功后，后台检查：

```text
config.enabled && config.autoSync
```

若开启，则 fire-and-forget 调用 `syncHighlight()` 或 `syncClip()`，不阻塞主保存流程。

### 手动同步

Options 页提供 `Sync All Highlights`，触发 `LOGSEQ_SYNC_ALL`，遍历 IndexedDB 中所有 active 高亮逐条同步。

### 去重

同步前通过 `getPageBlocksTree` 获取目标 Journal 页面的 block 树，递归检查属性：

```typescript
block.properties?.annhubId
block.properties?.['annhub-id']
```

保留 `annhub-id` 是为了兼容历史数据；新写入统一使用 `annhubId`。

## 8. 关键实现说明

### `LogseqClient`

- `testConnection()`：调用 `logseq.App.getCurrentGraph`
- `getUserConfigs()`：读取 `preferredDateFormat`
- `formatJournalPageName()`：将 ISO 日期格式化为 Logseq Journal 页面名称
- `createJournalPage()`：通过 `createPage` + `{ journal: true }` 创建 Journal 页面
- `appendBlockInPage()`：通过 `options.properties` 传递属性
- `call()`：检测 HTTP 错误、空 result、`{ error: "..." }` 响应

### `LogseqFormatter`

- `formatHighlight()` / `formatClip()` 输出 Journal 页面、主 block、属性和子 block
- `buildTagsString()` 组合 `#annhub`、自定义标签和域名标签
- `getJournalPageName()` 基于记录时间生成 ISO 日期，再交给 client 格式化为用户日期格式

### `LogseqSyncService`

- `getDateFormat()` 从 Logseq 读取日期格式并缓存
- `ensureJournalPage()` 确保目标 Journal 页面存在
- `syncHighlight()` / `syncClip()` 完成单条同步
- `syncAll()` 批量同步所有 active 高亮
- `isDuplicate()` 递归检查 block 树

## 9. Journal 日期格式

Logseq Journal 页面名称依赖用户设置的 `preferredDateFormat`。默认格式通常是：

```text
MMM do, yyyy
```

示例：

```typescript
const configs = await client.getUserConfigs()
const pageName = LogseqClient.formatJournalPageName('2026-02-18', configs.preferredDateFormat)
// pageName = "Feb 18th, 2026"
const page = await client.getPage(pageName)
```

不要直接用 ISO 日期查询 Journal 页面：

```typescript
await client.getPage('2026-02-18')
```

这通常会返回 `null`。

## 10. 属性传递约定

Logseq HTTP API 要求 block 属性通过 `options.properties` 传递：

```typescript
await client.appendBlockInPage(pageUuid, '#annhub [[Title]] [source](url)', {
  properties: { annhubId: 'hl_xxx' },
})
```

不要将属性仅拼进 content 字符串中。

属性命名统一使用 camelCase：

| 用途 | 当前格式 | 历史兼容 |
| --- | --- | --- |
| AnnHub 记录 ID | `annhubId` | `annhub-id` |

## 11. 使用流程

1. 在 Logseq 中启用 HTTP APIs Server。
2. 生成 Authorization token。
3. 打开 AnnHub Options -> Settings -> Logseq Sync。
4. 填入 Server URL 和 Authorization Token。
5. 配置自定义标签与域名标签。
6. 点击 `Test Connection` 验证。
7. 开启自动同步，或使用 `Sync All Highlights` 手动同步。

## 12. 常见问题排查

### 连接测试失败

检查项：

1. Logseq 是否正在运行。
2. HTTP APIs Server 是否已启用。
3. Server URL 是否为正确端口。
4. Authorization Token 是否正确。
5. 本机是否能访问 `http://127.0.0.1:12315/api`。

### `getPage` / `appendBlockInPage` 返回 null

常见原因是 Journal 页面名称使用了错误日期格式。代码已通过 `getUserConfigs()` 读取 Logseq 用户日期格式，并在写入前转换页面名称。

### API 返回 `MethodNotExist`

Logseq HTTP Server 会按内部方法映射查找 API。某些版本可能缺少特定方法。`LogseqClient.call()` 已检测 `{ error: "..." }` 响应并抛出异常。

### 高亮未同步

检查项：

1. 扩展控制台是否有 Logseq 相关错误。
2. `Auto-sync on capture` 是否启用。
3. Logseq 配置是否已保存。
4. 目标 Journal 页面是否已有相同 `annhubId`，重复记录会被跳过。

## 13. 测试基线

相关测试：

- `background-service/services/logseq/__tests__/logseq-client.test.ts`
- `background-service/services/logseq/__tests__/logseq-formatter.test.ts`
- `background-service/services/logseq/__tests__/logseq-sync.test.ts`

验证命令：

```bash
npm test
npm run build
```
