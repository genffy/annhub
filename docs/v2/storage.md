# 存储契约

> 层级：core
> 状态：存储设计真源
> 更新：2026-10-10
> 适用端：浏览器扩展

本文定义条目（含剪藏里的高亮）与截图资产的本地存储和 Markdown ZIP 导出。条目字段形状见 [条目契约](entry.md)。

## 1. 决策

1. 扩展用一个 IndexedDB 数据库保存全部条目、图片和属性注册表；`chrome.storage` 只放界面与采集偏好。高亮是剪藏记录的一部分，不单独存放。
2. 条目、图片字节、属性注册表放在不同 object store。`screenshot` 条目只保存 `assetId`。
3. 保存只发生在本地。采集、查询、编辑与导出在断网时照常可用。
4. 扩展提供一个面向其他工具的导出命令：下载包含 Markdown 与已保存图片文件的 ZIP。它不是 AnnHub 数据库的无损恢复格式。

核心流程只在浏览器本地完成，不规划远程服务、服务器存储或跨设备同步。

## 2. 数据分层

| 层           | 数据                                                                                                                   | 存储                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| A 图片资产   | 处理后的截图字节、元数据、可重建缩略图                                                                                 | IndexedDB `Blob`        |
| B 条目与属性 | 条目（含剪藏里的高亮）、属性注册表，以及检索用的派生文档（可由条目重建）                                               | IndexedDB object stores |
| C 偏好       | 界面与快捷键偏好、默认高亮色、区块入口开关与已停用的网站、截图的匿名、下载格式、水印、比例预设与美化默认样式、本地指标 | chrome.storage          |

水印图片（PNG，不超过 512 KB）随偏好保存在 `chrome.storage`，不进入 IndexedDB，也不随导出。“原图”指裁剪、匿名和马赛克完成后实际保存的图片字节，不是处理前可能含敏感信息的屏幕图，也不带水印。缩略图仅作缓存，能从原图重建。浏览器端不以 Base64 `dataUrl` 作为持久格式。

区域/元素截取与处理时序见 [截图采集](screenshot.md)；本文只定义持久化和引用。

## 3. Object stores

```typescript
interface AnnHubDB {
  entries: {
    key: string // id
    value: EntryRecord
    indexes: { 'by-type': string; 'by-host': string; 'by-tag': string; 'by-created': number } // by-tag 对 tags 的每一项建一条索引
  }
  assets: {
    key: string // assetId
    value: { metadata: ImageAsset; bytes: Blob }
  }
  properties: {
    key: string // 小写的属性名
    value: PropertyDefinition
  }
  // 以下两个是派生数据，只服务检索，可由 entries 重建，不是真源
  search: {
    key: string // 条目 id
    value: { id: string; updatedAt: number; version: number; summary: EntryRecord } // 去掉长文本（content、context、note）的条目副本
  }
  searchText: {
    key: string // 条目 id
    value: { id: string; fields: { weight: number; normalized: string }[] } // 归一化后的加权检索字段
  }
}
```

- 索引只建在 `type`、`sourceHost`、`tags` 和创建时间上，`by-tag` 服务标签筛选。
- 其他属性不建索引：先用索引缩小集合，再在内存里按属性筛选，避免用户每新增一个属性就扩张数据库 schema。高亮视图同样在内存里展开：取出 `clip` 摘要里的 `highlights`。
- 两个派生 store 是[检索契约](search.md)允许的索引：`search` 里是每条条目去掉长文本的摘要，列表、筛选、导航上的计数与候选、高亮视图和属性使用数都读它；`searchText` 里是归一化后的检索字段，只有带搜索词的查询才读取。它们与条目在同一事务里写入，从不单独改动。
- 注册表是名称到类型的真源，写入条目前按它校验（[entry.md §5](entry.md)）；条目的 `properties` 只存值。
- 图片元数据与字节放进独立的 `assets`，使条目引用与图片可以一致提交。

扩展运行时按需检查 `navigator.storage.estimate()`；配额不足须报告失败并保留可重试的内容，不得显示保存成功。图片大小上限和压缩策略需在真实截图样本与性能测试后确定（[Q-03](validation.md)），不依赖一个假定的固定 IndexedDB 配额。

## 4. 图片资产

```typescript
interface ImageAsset {
  id: string
  mimeType: 'image/png'
  byteLength: number
  sha256: string
  width: number
  height: number
  createdAt: number
}
```

图片字节不进入 `ImageAsset` 的消息 JSON：`assets` 保存 `Blob`。`screenshot` 条目的 `assetId` 引用这个稳定 ID；`sha256` 校验 ZIP 导出的字节；ID 不使用文件名或哈希替代，以便同图不同采集记录保持独立身份。入库统一使用 PNG（[screenshot.md §4](screenshot.md)）。

## 5. 本地写入纪律

任何写入都遵循：

```text
validate -> write entity -> commit
```

写入前先校验；依赖其他记录的写入必须在同一 IndexedDB 事务里检查并提交。

关键事务：

- 创建或更新条目：条目与它新引入的属性定义在同一事务写入。
- 条目的每一次写入（创建、更新、改高亮、删除）都在同一事务里更新它的两个派生文档；条目数与派生文档的数量对不上，或它们的格式版本不同（升级旧库时也是如此），就由 `entries` 整体重建。重建不改变任何查询的结果；服务进程重启后不为核对而遍历全部条目。
- 创建、修改或删除一条高亮：就是更新所属剪藏这一条记录，在一个事务里完成；合并重叠的高亮同样是一次更新。
- 创建 `screenshot` 条目：条目、图片元数据与 `Blob` 同事务提交，并检查 `assetId` 与图片一致。
- 删除条目：`screenshot` 同事务删除它的图片；`clip` 连同它的高亮一起删除。
- 删除属性定义：同事务检查使用数为 0，否则拒绝（`PROPERTY_IN_USE`）。“删除未使用”在一个事务里删除所有使用数为 0 的自定义属性定义。

## 6. 唯一的用户导出：Markdown ZIP

扩展只提供一个“导出内容”命令。扩展读取已提交的本地记录与图片字节，生成一个 ZIP，供 Obsidian 等工具读取；不导出浏览器管理的 IndexedDB 物理文件，也不提供单独的 JSON / CSV 用户导出。

```text
AnnHub-export.zip
├── README.md                  # 导出时间、范围、数量、缺失图片清单（章节标题与 README 随导出时的界面语言）
├── clips/<id>.md              # 高亮写成 ==…==
├── screenshots/<id>.md        # 含相对图片链接
└── assets/<assetId>.png       # 已保存的处理后图片字节
```

每份 Markdown 以稳定 ID 作文件名。**属性即 frontmatter**：条目的系统字段与属性写成 YAML frontmatter，键名对齐 Obsidian Web Clipper 的默认模板（`title`、`source`、`author`、`published`、`created`、`description`、`tags`），AnnHub 自己的键加 `annhub_` 前缀，避免撞用户库里已有的键。系统字段的映射见 [entry.md §5.5](entry.md)；值按类型写成 YAML：文本为带引号的字符串，列表为序列，数字为数字，复选框为 `true` / `false`，日期与日期时间保持 [entry.md §5.2](entry.md) 的格式。键的顺序：`annhub_id`、`annhub_type`、`title`、`source`、`created`，然后是注册表里的内置属性，最后是自定义属性按名称排序；未设置的属性不写。

正文用可阅读的章节保存内容，章节标题随导出时的界面语言：`clip` 依次是原文（`content` 的 Markdown，高亮写成 `==…==`）、语境（选区剪藏才有）、高亮备注（有备注的高亮：引文加备注）、备注；`screenshot` 是图片（相对路径 `../assets/<assetId>.png`）和备注。高亮的范围按 [entry.md §4](entry.md) 写回源文本；一条高亮跨越段落或其他块时，`==…==` 按块拆开，不让它跨块，也不拆开 Markdown 的语法记号。剪藏里的远程图片按原地址导出，不下载（[capture.md §3.1](capture.md)）。

示例（`clips/<id>.md`，YAML 通过序列化器生成，不手工拼接）：

```markdown
---
annhub_id: 'ent_123'
annhub_type: clip
title: 'Retries and backpressure'
source: 'https://engineering.example.com/retries'
created: 2026-10-07
author:
  - 'Jane Doe'
published: 2026-09-12
tags:
  - reliability
project: '支付重试'
reviewed: false
---

## Exponential backoff with jitter

Instead of retrying immediately, wait `base × 2^n` and add ==a random factor between 0 and 1== so that clients do not retry in lockstep.

## 高亮备注

> a random factor between 0 and 1

可以解释“为什么要抖动”。

## 备注

对照复盘文档里的流量曲线。
```

`screenshots/<id>.md` 的 frontmatter 同上，`annhub_type` 为 `screenshot`，正文是 `![p99 延迟曲线](../assets/asset_456.png)` 和备注。

`README.md` 写明格式版本、导出时刻、包含与不包含的数据类别。导出开始时固定记录 ID 和更新时间；读取过程中若记录变化，则重新读取该项或报告其未纳入本次 ZIP。缺失图片不生成失效链接，Markdown 标注“图片缺失”，README 列出资产 ID；用户可下载部分 ZIP，但界面必须显示“部分导出”与数量。

导出范围是扩展中已提交的全部条目（含剪藏里的高亮），以及它们引用且实际保存在扩展中的图片。包含图片处理后的原字节，不重新请求网页图片 URL。导出不包含尚未提交的编辑、界面偏好和可重建缓存。属性注册表本身不导出：每份 Markdown 已带着它用到的属性。

ZIP 文件名和内部路径只能由受控 ID 生成，不能直接使用网页标题；写入时转义 Markdown / YAML 内容，避免路径穿越和格式破坏。图片按 Blob 分批读取，避免为大型图片集一次性创建 Base64 字符串或把所有文件同时载入内存。导出完成前校验记录数、附件引用和写入字节数。

这个 ZIP 是供其他工具消费的开放阅读格式，不提供反向导入 AnnHub，也不用于恢复扩展的数据库。

## 7. 删除与资产清理

删除条目只删除 IndexedDB 中该条目；`screenshot` 条目同事务删除它的图片，所以正常路径不产生孤儿图片。清理任务只处理异常残留：没有任何条目引用的资产，以及指向缺失图片的条目；它必须能报告这两类的数量与 ID。

图片缺失时不删除条目，保留 `title`、`note`、来源与属性，界面提示“图片缺失”。

## 8. 契约验证清单

存储契约的任何改动，最低验证包括：

1. IndexedDB 的 object store 与索引同本文一致；图片以 Blob 存储。
2. 用户界面只有一个导出入口（Markdown ZIP），没有 JSON 导入导出；frontmatter 的键与值类型符合第 6 节和 [entry.md §5.5](entry.md)；高亮写成 `==…==`，跨块的高亮按块拆开，有备注的高亮列入“高亮备注”章节。
3. 覆盖条目的新增、更新、删除，高亮的新增、合并、改色、改备注与删除，属性定义的新增与“删除未使用”，图片缺失与配额不足；删除 `screenshot` 条目时图片同事务删除，删除 `clip` 时高亮一并删除。
4. 同名属性的类型冲突被拒绝；使用中的属性定义不可删除。
