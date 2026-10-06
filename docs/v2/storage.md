# 存储契约

> 层级：core
> 状态：存储设计真源
> 更新：2026-10-07
> 适用端：浏览器扩展

本文定义学习核心与截图资产的本地存储和 Markdown ZIP 导出。Fragment 字段形状见 [Fragment 数据契约](fragments.md)。

## 1. 决策

学习核心采用本地优先：

1. 扩展使用 IndexedDB 保存学习核心与截图资产。
2. 记录、截图元数据和图片字节存入不同的 object store。Fragment 只保存附件 ID；截图集和 Fragment 可引用同一图片。
3. 保存只发生在本地。采集、查询、编辑与导出在断网时照常可用。
4. 扩展提供一个面向其他工具的导出命令：下载包含 Markdown 与已保存图片文件的 ZIP。它不是 AnnHub 数据库的无损恢复格式。

核心流程只在浏览器本地完成，不规划远程服务、服务器存储或跨设备同步。

## 2. 数据分层

| 层         | 数据                                   | 存储                       |
| ---------- | -------------------------------------- | -------------------------- |
| A 图片资产 | 已处理的截图原图、元数据、可重建缩略图 | IndexedDB `Blob`           |
| B 学习核心 | Fragment                               | IndexedDB object stores    |
| C 偏好     | UI、快捷键、Provider、采集模式         | chrome.storage / IndexedDB |

“原图”指裁剪、匿名和马赛克完成后实际保存的图片字节，不是处理前可能含敏感信息的屏幕图。缩略图仅作缓存，能从原图重建。浏览器端不以 Base64 `dataUrl` 作为持久格式。

区域/元素截取与处理时序见 [截图采集](screenshot.md)；本文件只定义持久化和引用。

## 3. 图片资产与截图集

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

图片字节不进入 `ImageAsset` 的消息 JSON：扩展的同 ID asset store 保存 `Blob`。`visual.detail.attachmentIds` 和 `ScreenshotRecord.assetId` 引用同一个稳定 ID，避免从截图集转为 Fragment 时复制一张图。`sha256` 校验 ZIP 导出的字节；ID 不使用文件名或哈希替代，以便同图不同采集记录保持独立身份。

截图集删除只删除自己的记录；还有 Fragment 引用时保留图片。只有引用数为零的资产才可清理。附件缺失由本地引用与 asset store 派生，不把缺失状态写成 Fragment 的第二份真源。

## 4. 本地写入纪律

任何学习核心写入都遵循：

```text
validate -> write entity -> commit
```

写入前先校验；依赖其他记录的写入必须在同一 IndexedDB 事务里检查并提交。截图保存时，截图元数据与 `Blob` 在同一个事务提交；转为 Fragment 时只建立对现有 `assetId` 的引用。

关键事务：

- 创建或更新 Fragment。
- 创建 `visual` Fragment：在同一事务检查它引用的资产都已存在。
- 保存截图元数据 + 图片 `Blob`。
- 删除 Fragment：只移除该记录。
- 删除截图记录：同事务检查图片是否仍被引用，没有引用才删除 `Blob`。

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
      'by-created': number
      'by-normalized': string
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
}
```

detail 字段默认不建索引。先按 kind、host、tag 或时间缩小集合，再在内存筛选，避免每增加一种 kind 就扩张数据库 schema。

截图元数据和图片字节放进同一扩展 IndexedDB 的独立 object store，使引用与图片可以一致提交。Highlight 和 Clip 仍是独立实体；ZIP 导出会读取它们的本地存储。

扩展运行时按需检查 `navigator.storage.estimate()`；配额不足须报告失败并保留用户表单或可重试截图，不得显示保存成功。图片大小上限和压缩策略需在真实截图样本与性能测试后确定，不依赖一个假定的固定 IndexedDB 配额。

## 6. 唯一的用户导出：Markdown ZIP

扩展只提供一个“导出内容”命令。扩展读取已提交的本地记录与图片字节，生成一个 ZIP，供 Obsidian 等工具读取；不导出浏览器管理的 IndexedDB 物理文件，也不提供单独的 JSON / CSV 用户导出。

```text
AnnHub-export.zip
├── README.md                  # 导出时间、范围、数量、缺失图片清单（章节标题与 README 随导出时的界面语言，D-15）
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
annhub_id: 'frag_123'
kind: visual
source_url: 'https://example.com/article'
captured_at: '2026-09-24T08:00:00.000Z'
tags: ['design']
asset_ids: ['asset_456']
---

# 关键细节描述

## 页面语境

描述对应的页面背景。

## 核验与应用

用户确认的核验结果和计划使用场景。

![截图](../assets/asset_456.png)
```

`README.md` 写明格式版本、导出时刻、包含与不包含的数据类别。导出开始时固定记录 ID 和采集修订号；读取过程中若记录变化，则重新读取该项或报告其未纳入本次 ZIP。缺失图片不生成失效链接，Markdown 标注“图片缺失”，README 列出资产 ID；用户可下载部分 ZIP，但界面必须显示“部分导出”与数量。

导出范围是扩展中已提交的 Fragment、Highlight、Clip、截图集记录，以及它们引用且实际保存在扩展中的图片。包含图片处理后的原字节，不重新请求网页图片 URL。导出不包含尚未提交的表单、Provider 密钥、UI 偏好和可重建缓存。

ZIP 文件名和内部路径只能由受控 ID 生成，不能直接使用网页标题；写入时转义 Markdown / YAML 内容，避免路径穿越和格式破坏。图片按 Blob 分批读取，避免为大型图片集一次性创建 Base64 字符串或把所有文件同时载入内存。导出完成前校验记录数、附件引用和写入字节数。

这个 ZIP 是供其他工具消费的开放阅读格式，不提供反向导入 AnnHub，也不用于恢复扩展的数据库。

## 7. 删除与资产清理

扩展删除 Fragment 只删除 IndexedDB 中该记录。高亮、剪藏和图片资产不默认删除。没有任何引用的图片可由清理任务回收。

删除附件时：

- 不删除 Fragment。
- 把附件引用标记为 missing。
- 保留文本摘要、上下文和用户加工。

图片清理按实际引用判断，不以删除某一张截图集卡片作为立即删除 `Blob` 的理由。清理任务需要可报告孤儿资产和缺失引用。

## 8. 契约验证清单

存储契约的任何改动，最低验证包括：

1. Fragment 使用 `schemaVersion: 4` 的契约；不为目标态定义旧 JSON exportVersion 的延续版本。
2. IndexedDB 的 object store 与本文一致；图片以 Blob 存储。
3. 用户界面只有一个导出入口（Markdown ZIP），没有旧 JSON 导入导出。
4. 覆盖单条新增、更新、重复保存、图片缺失与删除；删除截图时不误删仍被引用的图片。
