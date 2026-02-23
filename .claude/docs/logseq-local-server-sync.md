# 分支说明

## cursor/logseq-local-server-sync

**目标**：通过 Logseq 本地 HTTP Server API，将 AnnHub 采集的高亮和 Clip 数据同步到 Logseq 软件中。

---

### 一、Logseq HTTP API

文档： [Local Http server](https://docs.logseq.com/#/page/local%20http%20server)
- 地址：`http://127.0.0.1:12315/api`（默认端口 12315）
- 认证：`Authorization: Bearer {token}`
- 请求格式：`POST /api`，body 为 `{ "method": "...", "args": [...] }`
- 使用的 API 方法：
  - `logseq.App.getCurrentGraph` — 测试连接
  - `logseq.App.getUserConfigs` — 获取用户配置（日期格式等）
  - `logseq.Editor.getPage` — 检查页面是否存在
  - `logseq.Editor.createPage` — 创建页面（支持 `{journal: true}` 选项）
  - `logseq.Editor.appendBlockInPage` — 向页面追加 block（支持通过 options.properties 传递属性）
  - `logseq.Editor.insertBlock` — 在 block 下插入子 block
  - `logseq.Editor.getPageBlocksTree` — 获取页面 block 树（用于去重）

---

### 二、Logseq 数据格式设计（Journal 模式）

#### 设计理念
- **数据存储到 Journal 页面**：所有高亮和 Clip 都添加到对应日期的日记页面（如 `[[2025-01-15]]`）
- **使用 #标签分类**：通过标签系统组织内容，而不是页面命名空间
- **保留源页面链接**：使用 Logseq 的 `[[Page Title]]` 语法链接到源文章页面

#### Journal Block 格式

**高亮 Block**：
```
[[Feb 18th, 2026]]

- #annhub #example_com [[Article Title]] [🔗](https://example.com/article)
    annhubId:: hl_abc123def
  - > 被高亮的文本内容
  - 💭 用户备注内容
```

**Clip Block**：
```
[[Feb 18th, 2026]]

- #annhub #github_com [[Repository README]] [🔗](https://github.com/user/repo)
    annhubId:: clip_xyz789ghi
  - > 采集的文本内容
  - 💭 用户备注内容
```

#### 设计要点

1. **Journal 页面**：数据直接添加到日记页面，利用 Logseq 原生日记系统
2. **Journal 页面名称**：通过 `getUserConfigs` API 获取用户的 `preferredDateFormat`（默认 `"MMM do, yyyy"`），将 ISO 日期转换为对应格式（如 `"Feb 18th, 2026"`）
3. **标签系统**：
   - `#annhub`：所有同步内容的统一标识
   - 自定义标签：用户可配置如 `#reading`、`#research` 等
   - 域名标签：可选自动添加 `#example_com` 等，便于按来源筛选
4. **源页面链接**：`[[Page Title]]` 创建对源文章的引用，`[🔗](url)` 为可点击的源链接
5. **属性精简**：仅保留 `annhubId` 用于去重，`sourceUrl` 和 `color` 已嵌入链接/移除
6. **日期隐含**：由于直接在日记页面，不需要额外的 `date::` 属性

---

### 三、目录结构

```
background-service/services/logseq/
├── index.ts              # LogseqService（实现 IService 接口）
├── logseq-client.ts      # Logseq HTTP API 客户端
├── logseq-formatter.ts   # HighlightRecord/ClipRecord → Journal block 格式转换
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
    syncMode: 'journal'    // 固定为 journal 模式
    customTags: string     // 自定义标签，逗号分隔 "#reading, #research"
    autoTagDomain: boolean // 是否自动添加域名标签
}

interface LogseqSyncResult {
    success: boolean
    pageCreated: boolean      // 是否新建了页面（journal 页面）
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
- **去重**：同步前通过 `getPageBlocksTree` 获取目标 journal 页面的 block 树，递归检查 `annhub-id` 属性，已存在则跳过

---

### 七、修改文件清单

| 文件 | 变更 |
|------|------|
| `types/logseq.ts` | 新增 `syncMode`、`customTags`、`autoTagDomain` 字段；移除 `pagePrefix` |
| `types/messages.ts` | 新增 6 个 Logseq 消息类型，加入 UIToBackgroundMessage 联合类型 |
| `background-service/service-context.ts` | `SupportedServices` 增加 `'logseq'`，初始状态加 `logseq: false` |
| `background-service/index.ts` | 注册 `LogseqService`，导出 `LogseqService` |
| `background-service/services/logseq/logseq-formatter.ts` | 重写为 journal 模式，支持标签系统 |
| `background-service/services/logseq/logseq-sync.ts` | 更新为 journal 页面同步逻辑 |
| `background-service/services/highlight/message-handles.ts` | `SAVE_HIGHLIGHT` 成功后调用自动同步 |
| `background-service/services/clip.ts` | `SAVE_CLIP` 成功后调用自动同步 |
| `entrypoints/options/App.tsx` | 新增 `/logseq` 路由和侧栏菜单项 |
| `entrypoints/options/pages/LogseqPage.tsx` | 更新 UI，新增标签配置选项 |
| `entrypoints/options/App.css` | 新增 `.logseq-format-preview` 样式 |
| `entrypoints/options/types/index.ts` | `MenuSection` 增加 `'logseq'` |

---

### 八、关键类说明

**LogseqClient** ([`logseq-client.ts`](background-service/services/logseq/logseq-client.ts))
- 封装所有 HTTP 调用，统一处理 auth header 和错误
- `getUserConfigs()` 获取用户配置，包含 `preferredDateFormat`（用于 journal 页面名称格式化）
- `formatJournalPageName()` 将 ISO 日期字符串转换为 Logseq 的 journal 页面名称（如 `"2026-02-18"` → `"Feb 18th, 2026"`）
- `createJournalPage()` 通过 `createPage` + `{journal: true}` 创建 journal 页面
- `appendBlockInPage()` 支持 `options.properties` 参数传递 block 属性
- `testConnection()` 调用 `logseq.App.getCurrentGraph` 验证连通性

**LogseqFormatter** ([`logseq-formatter.ts`](background-service/services/logseq/logseq-formatter.ts))
- `formatHighlight()` / `formatClip()` 返回 `{ journalPage, content, properties, children }`
- 内容格式：`#annhub #domain_tag [[Page Title]] [🔗](sourceUrl)`
- 仅保留 `annhubId` 属性用于去重
- `buildTagsString()` 构建标签字符串（`#annhub` + 自定义标签 + 域名标签）
- `getJournalPageName()` 根据时间戳生成 ISO 日期格式（如 `"2025-01-15"`）

**LogseqSyncService** ([`logseq-sync.ts`](background-service/services/logseq/logseq-sync.ts))
- 单例模式，初始化时从 chrome.storage.local 加载配置
- `getDateFormat()` 从 Logseq 获取日期格式并缓存
- `ensureJournalPage()` 将 ISO 日期格式化为 Logseq 页面名称，获取/创建页面并返回 UUID
- `syncHighlight()` / `syncClip()` 完整同步流程：格式化日期 → 确保 journal 页面存在 → 去重检查 → 追加 block → 追加子 block
- `syncAll()` 批量同步所有 active 高亮
- `isDuplicate()` 递归搜索 block 树的 `annhubId` 属性

**LogseqService** ([`index.ts`](background-service/services/logseq/index.ts))
- 实现 `IService` 接口，`name = 'logseq'`
- 初始化失败不阻塞其他服务（非关键服务）

---

### 九、与旧版本的主要变化

| 方面 | 旧版本 | 新版本（Journal 模式） |
|------|--------|----------------------|
| 数据存储 | 每个源文章创建一个页面 `AnnHub/Title` | 添加到日记页面 `[[YYYY-MM-DD]]` |
| 组织方式 | 页面命名空间 | #标签系统 |
| 分类方式 | 页面属性 `url::`, `domain::` | 标签 `#reading`, `#example_com` |
| 链接方式 | `date:: [[YYYY-MM-DD]]` 反向链接 | 直接在日记页面，`[[Page Title]]` 引用源 |
| 配置选项 | `pagePrefix` 页面前缀 | `customTags`, `autoTagDomain` 标签配置 |

---

### 十、使用示例

#### 基本使用流程

1. **启用 Logseq HTTP Server**
   - 在 Logseq 中：Settings → Features → HTTP APIs Server
   - 开启服务，生成 Authorization token
   - 记下默认端口（通常 12315）

2. **配置 AnnHub**
   - 打开 AnnHub Options 页面 → Logseq
   - 填入 Server URL 和 Authorization Token
   - 配置自定义标签（如 `#reading, #research`）
   - 选择是否自动添加域名标签
   - 点击 "Test Connection" 验证

3. **同步数据**
   - 自动同步：勾选 "Auto-sync on capture"，保存高亮/Clip 时自动同步
   - 手动同步：点击 "Sync All Highlights" 批量同步现有数据

#### 在 Logseq 中查看

- 打开日记页面（如 `[[2025-01-15]]`）
- 所有当天采集的内容会按时间顺序显示
- 点击 `#annhub` 标签可查看所有同步内容
- 点击 `#reading` 等自定义标签可按主题筛选
- 点击 `[[Page Title]]` 可跳转到源文章页面

---

### 十一、Logseq 文档参考

- **官方文档**: https://docs.logseq.com/
- **Journal 页面**: Logseq 原生日记系统，按日期组织内容
- **Block 属性**: 使用 `key:: value` 语法存储元数据
- **标签系统**: 使用 `#tag` 语法进行内容分类和链接
- **页面引用**: 使用 `[[Page Name]]` 语法创建页面链接

---

### 十二、重要注意事项

#### 属性命名规范

Logseq HTTP API 使用 **camelCase** 格式的属性名称，而非连字符格式：

| 用途 | 正确格式 | 错误格式 |
|------|---------|---------|
| 高亮 ID | `annhubId` | ~~`annhub-id`~~ |

> ⚠️ 当前仅保留 `annhubId` 属性用于去重检测。`sourceUrl` 已嵌入 markdown 链接 `[🔗](url)` 中，`color` 和 `mode` 属性已移除。

#### 属性传递方式

Logseq HTTP API 要求属性通过 `options.properties` 参数传递，而不是嵌入到 content 字符串中。

**正确方式**：
```typescript
await client.appendBlockInPage(pageUuid, '#annhub [[Title]] [🔗](url)', {
    properties: { annhubId: 'hl_xxx' }
})
```

#### Journal 页面名称格式

Logseq 的 journal 页面名称取决于用户的日期格式设置（默认 `"MMM do, yyyy"`），**不是** ISO 日期字符串。

```typescript
// 正确：先获取日期格式，格式化后查找
const configs = await client.getUserConfigs()
const pageName = LogseqClient.formatJournalPageName('2026-02-18', configs.preferredDateFormat)
// pageName = "Feb 18th, 2026"
const page = await client.getPage(pageName)

// 错误：直接传入 ISO 日期
const page = await client.getPage('2026-02-18')  // 返回 null！
```

#### Journal 页面创建

**正确方式**：使用 `createPage` 配合 `{journal: true}` 选项（跨版本兼容）
```typescript
await client.createPage('2026-02-18', {}, { journal: true, redirect: false })
```

#### 去重兼容性

为兼容历史数据，去重检测同时检查 `annhubId` 和 `annhub-id` 两种属性格式：
```typescript
if (block.properties?.['annhub-id'] === id || block.properties?.['annhubId'] === id) {
    return true
}
```

---

### 十三、常见问题排查

#### 同步失败：`getPage` / `appendBlockInPage` 返回 null

**症状**：日志显示 API 返回 HTTP 200，但 result 为 null

**原因**：Logseq 的 journal 页面名称使用用户配置的日期格式（默认 `"MMM do, yyyy"` → `"Feb 18th, 2026"`），而非 ISO 日期 `"2026-02-18"`。

**解决方案**：代码已自动通过 `getUserConfigs()` 获取日期格式并格式化页面名称，同时使用页面 UUID 调用 `appendBlockInPage`。

#### API 返回 `{error: "MethodNotExist: ..."}`

**症状**：API 调用返回 HTTP 200，但 body 为 `{error: "MethodNotExist: xxx"}`

**原因**：Logseq HTTP Server 将方法名转为 snake_case 后查找。某些版本可能缺少特定方法。

**解决方案**：`logseq-client.ts` 的 `call()` 方法已增加对 `{error: "..."}` 响应的检测，会正确抛出异常。

#### 连接测试失败

**排查步骤**：
1. 确认 Logseq 正在运行
2. 检查 Settings → Features → HTTP APIs Server 是否已启用
3. 确认 Server URL 和 Authorization Token 配置正确
4. 尝试在浏览器中访问 `http://127.0.0.1:12315/api` 测试连通性

#### 高亮未同步到 Logseq

**排查步骤**：
1. 检查扩展控制台日志，查看具体错误信息
2. 确认 "Auto-sync on capture" 选项已启用
3. 检查是否存在重复高亮（相同 `annhubId` 已存在则跳过）
