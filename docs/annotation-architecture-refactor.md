# 页面标注与内容定位架构

更新时间：2026-10-07

本文记录 AnnHub 页面高亮、内容来源识别、文本 Range 定位和 DOM marker 生命周期的共享架构。

> D-18 起，高亮与剪藏并入统一的条目（[条目契约](./v2/entry.md)）。下文的 `HighlightRecord` 是迁移前的存储形态，恢复链路与 marker 约束不变。

## 1. 目标

页面侧能力需要共同解决：

- 找到用户真正关注的内容容器。
- 从信息流条目提取永久链接。
- 生成可恢复的 selector 和文本上下文。
- 在复杂 DOM 中安全包裹和移除 marker。
- 在 SPA 延迟渲染后恢复高亮。
- 避免扫描扩展自身 UI、控件和已有 marker。

这些能力集中在 `entrypoints/content/annotation-core/`，业务模块只保留自己的交互、存储和展示决策。

## 2. 模块

```text
entrypoints/content/
├── annotation-core/
│   ├── types.ts
│   ├── platform-rules.ts
│   ├── dom-policy.ts
│   ├── text-range.ts
│   └── markers.ts
├── highlight/
├── capture/
└── screenshot/
```

### `platform-rules.ts`

负责：

- 站点匹配
- 内容项永久链接提取
- 已知 source URL 对应容器定位

新增站点通过追加 rule 完成，不修改高亮和采集核心流程。

### `dom-policy.ts`

负责统一跳过：

- script、style、控件、可编辑区和隐藏内容
- 扩展自身 UI
- 已有高亮 marker

用户的选区只受这些规则约束；普通链接内的文字可以高亮，但都不得进入扩展 UI 或嵌套 marker。

### `text-range.ts`

稳定接口：

```typescript
collectTextNodes(root)
createRangeFromTextIndex(nodes, start, length)
findTextRangeInElement(element, text, context)
```

Range 查找按 selector 容器、来源容器、正文 root、document body 逐级回退。匹配时使用统一空白归一化，DOM offset 始终对应原始文本节点。

### `markers.ts`

负责：

```typescript
wrapRange(range, config)
unwrapMarker(element)
cleanupMarkers(selector)
```

`Range.surroundContents` 失败时使用 extract/insert fallback。unwrap 后调用 `normalize()` 合并相邻文本节点，避免长期操作把页面切成大量碎片节点。

## 3. 高亮链路

```text
Selection Range
  -> content source / permalink
  -> stable selector + text context
  -> HighlightRecord
  -> marker wrap
  -> IndexedDB
```

恢复链路：

```text
current URL
  -> exact URL + metadata.sourceUrl query
  -> source container or selector
  -> text-range fallback
  -> marker wrap
```

SPA 页面按立即、1 秒、2 秒、3 秒重试未恢复记录。每轮只重试失败项。

## 4. 剪藏链路

剪藏复用平台规则和 Range 上下文：

```text
Selection Range
  -> source URL
  -> containing sentence / paragraph
  -> locator
  -> 条目（clip）
```

剪藏与高亮是同一种条目的两个类型，共用来源、语境与定位的提取，不共用 marker：高亮需要页面标记与恢复，剪藏没有。

## 5. Selector 规则

优先级：

1. 稳定 `data-*` 属性
2. 非动态 ID
3. 稳定 class 组合
4. DOM 结构路径

动态 ID 包括框架生成 ID、长随机十六进制、会话级自增 ID 和明显随机字符串。包含特殊字符的 class 在生成 selector 前必须转义或跳过。

## 6. Marker 约束

- 不允许 marker 嵌套 marker。
- 业务 marker 使用独立 data attribute。
- tooltip、菜单和扩展 UI 不得被序列化进宿主正文。
- 删除高亮必须恢复原文本结构。
- MutationObserver 忽略扩展自己产生的 marker 变化。
- marker 清理必须幂等，多次执行结果一致。

## 7. 性能

- 文本搜索先限制在最小可信容器内。
- 复用一次扫描得到的 text node 列表。
- SPA 变化只重新处理最近内容块，不整页重复扫描。
- 不把长上下文写入 DOM attribute。

## 8. 测试

最低覆盖：

- 平台规则：host、永久链接、嵌套内容、generic fallback
- DOM policy：隐藏区、控件、可编辑区、扩展 UI、已有 marker
- text range：跨 text node、空白归一化、上下文消歧、fallback
- markers：wrap、fallback、unwrap、cleanup、重复调用
- highlight：动态 ID、selector、跨页恢复和重试
- E2E：列表页采集、详情页恢复、SPA 延迟内容和删除清理

## 9. 变更纪律

1. 页面规则变更必须同步单元测试和相关 E2E。
2. data attribute 和消息字段变更同步所有调用方与测试，不保留旧名。
3. 共享能力进入 annotation-core，业务条件留在业务模块。
4. 不因重构改变高亮条目的存储语义。
5. 修改本文涉及的接口时同步更新 `AGENTS.md`。
