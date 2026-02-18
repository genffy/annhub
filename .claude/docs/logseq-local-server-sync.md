# 分支说明

## cursor/logseq-local-server-sync-6eeb

**目标**：通过 Logseq 本地 HTTP Server API，将 AnnHub 采集的高亮和 Clip 数据同步到 Logseq 软件中。

---

### 一、Logseq HTTP API

- 地址：`http://127.0.0.1:12315/api`（默认端口 12315）
- 认证：`Authorization: Bearer {token}`
- 请求格式：`POST /api`，body 为 `{ "method": "...", "args": [...] }`
- 使用的 API 方法：
  - `logseq.App.getCurrentGraph` — 测试连接
  - `logseq.Editor.getPage` — 检查页面是否存在
  - `logseq.Editor.createPage` — 创建页面（带属性）
  - `logseq.Editor.appendBlockInPage` — 向页面追加 block
  - `logseq.Editor.insertBlock` — 在 block 下插入子 block
  - `logseq.Editor.getPageBlocksTree` — 获取页面 block 树（用于去重）

---

### 二、Logseq 数据格式设计

每个被标注的网页在 Logseq 中对应一个页面，使用命名空间组织：

**页面命名**：`{prefix}/{sanitized page title}`，默认前缀为 `AnnHub`

**页面属性**：
```
url:: https://example.com/article
domain:: example.com
```

**高亮 Block**：
```
- > 被高亮的文本内容
  annhub-id:: hl_abc123def
  source-url:: https://example.com/article
  date:: [[2024-01-15]]
  color:: #ffeb3b
  - 💭 用户备注内容
```

**Clip Block**：
```
- > 采集的文本内容
  annhub-id:: clip_xyz789ghi
  source-url:: https://example.com/article
  date:: [[2024-01-15]]
  mode:: Mode A
  - 💭 用户备注内容
```

**设计要点**：
- `>` blockquote 让标注文本在 Logseq 中视觉醒目
- `annhub-id` 属性用于去重，防止重复同步同一条记录
- `date:: [[YYYY-MM-DD]]` 自动在 Logseq 日记页产生反向链接
- 用户备注作为子 block，带 `💭` 前缀
- 页面标题中 `/\#[]{}|^` 等特殊字符会被替换为空格，截断至 120 字符

---

### 三、新增目录结构

```
background-service/services/logseq/
├── index.ts              # LogseqService（实现 IService 接口）
├── logseq-client.ts      # Logseq HTTP API 客户端
├── logseq-formatter.ts   # HighlightRecord/ClipRecord → Logseq block 格式转换
├── logseq-sync.ts        # 同步编排：配置管理、去重检查、页面创建、block 追加
└── message-handles.ts    # 消息处理器

types/
└── logseq.ts             # LogseqConfig, LogseqSyncResult 等类型

entrypoints/options/pages/
└── LogseqPage.tsx         # Logseq 配置 UI 页面
```

---

### 四、核心数据模型

```typescript
interface LogseqConfig {
    enabled: boolean       // 是否启用同步
    serverUrl: string      // 默认 http://127.0.0.1:12315
    authToken: string      // Logseq API token
    autoSync: boolean      // 保存时自动同步
    pagePrefix: string     // 页面前缀，默认 "AnnHub"
}

interface LogseqSyncResult {
    success: boolean
    pageCreated: boolean      // 是否新建了页面
    blockAppended: boolean    // 是否追加了 block
    skippedDuplicate: boolean // 是否因去重跳过
    error?: string
}
```

配置持久化 key：`annhub-logseq-config`（chrome.storage.local）

---

### 五、消息协议

| 消息类型 | 方向 | 说明 |
|---------|------|------|
| `LOGSEQ_TEST_CONNECTION` | UI → background | 测试 Logseq 服务器连通性 |
| `LOGSEQ_GET_CONFIG` | UI → background | 获取 Logseq 配置 |
| `LOGSEQ_SET_CONFIG` | UI → background | 更新 Logseq 配置（partial merge） |
| `LOGSEQ_SYNC_HIGHLIGHT` | UI → background | 同步单条高亮到 Logseq |
| `LOGSEQ_SYNC_CLIP` | UI → background | 同步单条 Clip 到 Logseq |
| `LOGSEQ_SYNC_ALL` | UI → background | 批量同步所有 active 高亮 |

---

### 六、同步策略

- **自动同步**：`SAVE_HIGHLIGHT` / `SAVE_CLIP` 处理器在保存成功后，检查 `isAutoSyncEnabled()`，为 true 则 fire-and-forget 调用 `syncHighlight()` / `syncClip()`，不阻塞主流程
- **手动同步**：Options 页面提供 "Sync All Highlights" 按钮，触发 `LOGSEQ_SYNC_ALL`，遍历 IndexedDB 中所有 active 高亮逐条同步
- **去重**：同步前通过 `getPageBlocksTree` 获取目标页面的 block 树，递归检查 `annhub-id` 属性，已存在则跳过

---

### 七、修改文件清单

| 文件 | 变更 |
|------|------|
| `types/messages.ts` | 新增 6 个 Logseq 消息类型，加入 UIToBackgroundMessage 联合类型 |
| `background-service/service-context.ts` | `SupportedServices` 增加 `'logseq'`，初始状态加 `logseq: false` |
| `background-service/index.ts` | 注册 `LogseqService`，导出 `LogseqService` |
| `background-service/services/highlight/message-handles.ts` | `SAVE_HIGHLIGHT` 成功后调用自动同步 |
| `background-service/services/clip.ts` | `SAVE_CLIP` 成功后调用自动同步 |
| `entrypoints/options/App.tsx` | 新增 `/logseq` 路由和侧栏菜单项 |
| `entrypoints/options/App.css` | 新增 `.logseq-format-preview` 样式 |
| `entrypoints/options/types/index.ts` | `MenuSection` 增加 `'logseq'` |

---

### 八、关键类说明

**LogseqClient** (`logseq-client.ts`)
- 封装所有 HTTP 调用，统一处理 auth header 和错误
- `ensurePage()` 检查页面是否存在，不存在则创建
- `testConnection()` 调用 `logseq.App.getCurrentGraph` 验证连通性

**LogseqFormatter** (`logseq-formatter.ts`)
- `formatHighlight()` / `formatClip()` 返回 `{ content, properties, childContent }`
- `highlightPageName()` / `clipPageName()` 生成目标页面名称
- `sanitizePageTitle()` 清理特殊字符、截断长度

**LogseqSyncService** (`logseq-sync.ts`)
- 单例模式，初始化时从 chrome.storage.local 加载配置
- `syncHighlight()` / `syncClip()` 完整同步流程：确保页面存在 → 去重检查 → 追加 block → 追加子 block（备注）
- `syncAll()` 批量同步所有 active 高亮
- `isDuplicate()` 递归搜索 block 树的 `annhub-id` 属性

**LogseqService** (`index.ts`)
- 实现 `IService` 接口，`name = 'logseq'`
- 初始化失败不阻塞其他服务（非关键服务）
