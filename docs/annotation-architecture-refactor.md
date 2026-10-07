# 页面内容识别与标注架构

更新时间：2026-10-08

本文记录 AnnHub 页面侧共享的内容识别能力：找到用户关注的内容容器、提取永久链接、跳过扩展自己的界面，以及迁移前的页面高亮实现。

> D-18 起，高亮与剪藏并入统一的条目（[条目契约](./v2/entry.md)）；**D-19 起，页面不再留高亮标记，也没有回访恢复和连续高亮模式**：高亮是资料库里剪藏的标注（[D-19](./v2/validation.md)）。下文标“迁移前”的各节描述的是仍在代码里的旧实现，R1 随 `highlight/` 与 marker 一起删除；`platform-rules` 与 `dom-policy` 继续服务选区剪藏与区块剪藏。

## 1. 目标

R1 之后，页面侧能力需要解决：

- 找到用户真正关注的内容容器：选区所在的段落，或区块剪藏要保存的整块（一条推文、一篇 `article`、带标题的一节）。
- 从信息流条目提取永久链接，作为条目的 `sourceUrl`。
- 避免扫描扩展自身 UI、控件和不可见内容。
- 把选区或区块转换成 Markdown（[capture.md §3.1](./v2/capture.md)）。

迁移前还要解决（R1 删除）：生成可恢复的 selector 和文本上下文；在复杂 DOM 中安全包裹和移除 marker；在 SPA 延迟渲染后恢复高亮。

这些能力集中在 `entrypoints/content/annotation-core/`，业务模块只保留自己的交互、存储和展示决策。

## 2. 模块

```text
entrypoints/content/
├── annotation-core/
│   ├── types.ts
│   ├── platform-rules.ts      # 保留
│   ├── dom-policy.ts          # 保留
│   ├── text-range.ts          # 迁移前，R1 删除
│   └── markers.ts             # 迁移前，R1 删除
├── highlight/                 # 迁移前，R1 删除
├── capture/                   # 迁移前，按 D-18 删除
└── screenshot/
```

### `platform-rules.ts`

负责：

- 站点匹配
- 内容项永久链接提取
- 已知 source URL 对应容器定位
- 区块剪藏的容器识别规则（平台规则：推文、帖子、评论；识别范围见 [D-20](./v2/validation.md)）

新增站点通过追加 rule 完成，不修改采集核心流程。

### `dom-policy.ts`

负责统一跳过：

- script、style、控件、可编辑区和隐藏内容
- 扩展自身 UI

用户的选区只受这些规则约束；普通链接内的文字可以剪藏，但都不得进入扩展 UI。区块剪藏的入口与描边是扩展自己的浮层，不改动宿主页面的 DOM。

### Markdown 转换

选区与区块的 Markdown 转换规则见 [capture.md §3.1](./v2/capture.md)，只在共享层实现一次；转换时同样遵守 `dom-policy` 的跳过规则。

### `text-range.ts`、`markers.ts`（迁移前，R1 删除）

迁移前用于定位选区和包裹 marker：

```typescript
collectTextNodes(root)
createRangeFromTextIndex(nodes, start, length)
findTextRangeInElement(element, text, context)
wrapRange(range, config)
unwrapMarker(element)
cleanupMarkers(selector)
```

R1 之后页面里没有 marker，也没有按文本回退定位的需求，这两个模块随高亮一起删除。

## 3. 迁移前的高亮链路（R1 删除）

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

剪藏复用平台规则与 DOM policy：

```text
Selection Range 或 区块容器
  -> source URL（区块用自己的永久链接）
  -> Markdown 转换
  -> containing sentence / paragraph（仅选区剪藏）
  -> 条目（clip）
```

没有定位符：条目不再保存 selector 与文本偏移，“回到来源”只打开 `sourceUrl`。

## 5. Selector 规则（迁移前，R1 删除）

优先级：

1. 稳定 `data-*` 属性
2. 非动态 ID
3. 稳定 class 组合
4. DOM 结构路径

动态 ID 包括框架生成 ID、长随机十六进制、会话级自增 ID 和明显随机字符串。包含特殊字符的 class 在生成 selector 前必须转义或跳过。

## 6. Marker 约束（迁移前，R1 删除）

- 不允许 marker 嵌套 marker。
- 业务 marker 使用独立 data attribute。
- tooltip、菜单和扩展 UI 不得被序列化进宿主正文。
- 删除高亮必须恢复原文本结构。
- MutationObserver 忽略扩展自己产生的 marker 变化。
- marker 清理必须幂等，多次执行结果一致。

## 7. 性能

- 区块识别在指针停留之后才运行，只检查指针下的祖先链，不整页扫描；滚动、拖选与输入时不运行。
- 复用一次扫描得到的 text node 列表。
- 不把长上下文写入 DOM attribute。

## 8. 测试

最低覆盖：

- 平台规则：host、永久链接、嵌套内容、generic fallback、区块容器识别
- DOM policy：隐藏区、控件、可编辑区、扩展 UI
- Markdown 转换：标题、列表、引用、代码、链接（相对地址与危险协议）、图片、原始 HTML、超长截断
- E2E：列表页采集、详情页采集、SPA 页面的区块剪藏；页面上没有任何残留标记

迁移前的 text range、markers 与 highlight 测试随这些模块一起删除。

## 9. 变更纪律

1. 页面规则变更必须同步单元测试和相关 E2E。
2. data attribute 和消息字段变更同步所有调用方与测试，不保留旧名。
3. 共享能力进入 annotation-core，业务条件留在业务模块。
4. 修改本文涉及的接口时同步更新 `AGENTS.md`。
