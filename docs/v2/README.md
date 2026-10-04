# AnnHub v2 文档

> 状态：产品目标与跨端契约。工程约定从 [AGENTS.md](../../AGENTS.md) 进入。
> 更新：2026-10-04

AnnHub 把网页材料和用户原创的短篇灵感，连同来源与触发背景保存为可复习的 Fragment。扩展负责采集和本地查询；macOS Desktop 通过本机接口接收 Fragment，负责复习与整理。扩展断开 Desktop 仍可工作，并能把已提交内容与图片导出为 Markdown ZIP。产品不承诺从该 ZIP 恢复 AnnHub 数据库。

## 1. 五分钟读懂

| 问题 | 回答 |
| ---- | ---- |
| 为谁 | 每周读大量网页资料、并要产出设计文档、方案或分析的工程师、产品/设计和研究者（[product.md §2](product.md)） |
| 解决什么 | 收藏之后用不上：缺语境、没加工、没提取、没应用（[learning-model.md §1](learning-model.md)） |
| 怎么做 | 采集时当场完成一次“理解、核验、应用”，之后按类型回忆 |
| 在哪做 | 浏览器扩展负责采集与加工；Mac Desktop 负责复习与整理 |
| 赢的标志 | 每周成功提取的碎片数（Weekly Retrieved Fragments，[M-18](metrics.md)） |
| 不做什么 | 团队协作、手机端、通用笔记、稍后读收件箱、输出工坊与知识关系（[product.md §2.3](product.md)） |
| 底线 | 本地优先；AI 可选；没有 Desktop 也能采集和导出；失败不丢用户输入 |

```text
采集与语境 -> 主动加工 -> 间隔复习
   L1          L2          L3
```

| 层 | 用户动作 | 主要界面 | 规则文档 | 关键指标 |
| -- | -------- | -------- | -------- | -------- |
| L1 采集 | 选中内容，选择保存层级 | 扩展：选区菜单、采集窗口、截图 | [capture](capture.md)、[screenshot](screenshot.md) | M-02、M-03、M-04 |
| L2 加工 | 理解、核验确认、应用 | 扩展：采集窗口 | [processing](processing.md)、[kinds](kinds.md) | M-05 |
| L3 复习 | 先回忆，再揭示，自评 | Desktop：今日、复习会话 | [review](review.md)、[kinds](kinds.md) | M-07、M-08、M-18 |

一条完整的走查见 [examples.md §3](examples.md)。

## 2. 阅读路径

| 你是 | 按顺序读 |
| ---- | -------- |
| 第一次了解产品（15 分钟） | 本页 → [product](product.md) → [examples §3](examples.md) → [roadmap §2](roadmap.md) |
| 做界面与文案 | [kinds](kinds.md) → [extension](extension.md) → [desktop](desktop.md) → [visual](visual.md) → [examples](examples.md) → [设计稿](../design/v2/README.md) |
| 做实现 | [fragments](fragments.md) → [storage](storage.md) → [capture](capture.md) / [screenshot](screenshot.md) → [processing](processing.md) → [review](review.md) → [search](search.md) → [ai](ai.md) |
| 做验收与增长 | [user-stories](user-stories.md) → [metrics](metrics.md) → [validation](validation.md) → [website](website.md) |

## 3. 文档地图与唯一真源

每个问题只有一个归属文件；其他文档用摘要和链接，不复制规则。

### 第一层：讲清楚

| 需要回答的问题 | 唯一真源 |
| -------------- | -------- |
| 为谁解决什么问题，核心赌注是什么，什么不做 | [product.md](product.md) |
| 参照产品、行业信号的可核对事实 | [market.md](market.md) |
| L1–L3 如何组成学习闭环，方法论的证据基础 | [learning-model.md](learning-model.md) |
| 一个具体用户怎样走完全程，验收场景 | [examples.md](examples.md) |
| 阶段顺序、范围、发布门禁与交付状态 | [roadmap.md](roadmap.md) |

### 第二层：定规格

| 需要回答的问题 | 唯一真源 |
| -------------- | -------- |
| 每种 kind 的采集提问、复习题面和示例 | [kinds.md](kinds.md) |
| Fragment 字段、校验与来源 | [fragments.md](fragments.md) |
| 网页、手工灵感和截图怎样采集 | [capture.md](capture.md) |
| 区域/元素截图、匿名、美化合成与视觉 Fragment | [screenshot.md](screenshot.md) |
| 理解、核验确认、应用怎样完成 | [processing.md](processing.md) |
| 评分、调度、每日队列与会话 | [review.md](review.md) |
| IndexedDB / SQLite、图片、逐项交付和 ZIP | [storage.md](storage.md) |
| 搜索、筛选、排序与分页 | [search.md](search.md) |
| 模型外发、来源与失败降级 | [ai.md](ai.md) |
| 扩展和 Desktop 各自的页面体验 | [extension.md](extension.md) / [desktop.md](desktop.md) |
| 两端共用的品牌色与亮暗外观 | [visual.md](visual.md) |

### 第三层：验证与对外

| 需要回答的问题 | 唯一真源 |
| -------------- | -------- |
| 哪些判断没有证据、怎样验证、哪些决定待确认、风险有哪些 | [validation.md](validation.md) |
| 可测试的用户故事与验收 | [user-stories.md](user-stories.md) |
| 指标口径、事件字典与体验护栏 | [metrics.md](metrics.md) |
| 对外页面的信息与功能时态 | [website.md](website.md) |

## 4. 术语表

界面统一使用“理解、核验、应用”。数据字段名保持 `guess / verified / use`，两者对应如下。

| 术语 | 含义 | 数据字段或归属 |
| ---- | ---- | -------------- |
| Fragment（碎片） | 值得内化的最小知识单位 + 完整语境 + 用户加工产物；唯一进入复习的对象。界面中文称“碎片”，英文称 “Fragment”（[D-11](validation.md)） | [fragments.md](fragments.md) |
| kind（类型） | 碎片的判别字段，共九种 | [kinds.md](kinds.md) |
| Highlight（高亮） | 页面上的视觉标记与备注；不进入复习 | [capture.md §2](capture.md) |
| Clip（剪藏） | 保存一段内容及语境供查阅；不进入复习 | [capture.md §2](capture.md) |
| 截图集 | 处理后的本地图片及其来源；转成 `visual` 才进入学习 | [screenshot.md](screenshot.md) |
| 语境 / 来源 / 定位 | 能重新理解内容的最小上下文 / 页面地址与标题 / 回到原位置的线索 | `context.excerpt` / `sourceUrl` / `locator` |
| 理解 | 核验前写下的当前解释、判断或问题 | `processing.guess` |
| 核验确认 | 用户回看来源后点击“确认已核对”；记录时间与来源，不代表内容被证实 | `processing.verified` |
| 应用 | 准备如何使用、验证或迁移；必填，不能只复制原文 | `processing.use` |
| 提取 | 先回忆、后揭示答案的复习方式 | [review.md](review.md) |
| 到期 / 会话 / 提示梯度 | 下次复习时间已到 / 一次持久化的复习队列 / 由粗到细的四级提示 | [review.md](review.md) |
| Desktop / 配对 / 交付 | 本机学习中枢 / 扩展与 Desktop 的授权连接 / 扩展逐条把碎片和图片写入 Desktop | [storage.md §8](storage.md) |
| 导出内容 | 扩展生成的 Markdown + 原图 ZIP，供其他工具阅读，不可恢复学习状态 | [storage.md §7](storage.md) |
| Provider | 用户选择的模型服务（用户自带云端密钥，或设备端模型）；默认关闭 | [ai.md §8](ai.md) |

## 5. 状态与待办入口

| 想知道 | 去哪里 |
| ------ | ------ |
| 哪个版本做到哪里、有哪些未决验收项 | [roadmap.md](roadmap.md)（交付状态唯一入口） |
| 哪些假设尚未验证、哪些决策等待确认 | [validation.md](validation.md) |
| 某条需求的验收标准 | [user-stories.md](user-stories.md) |
| 某个指标怎么算、记录什么事件 | [metrics.md](metrics.md) |

规格文档写目标契约，不写“已实现”标记；目标描述不代表功能已上线。代码模块、消息与测试布局以源码和测试为准，工程约定按目录读取各级 `AGENTS.md`。

## 6. 维护方式

- 字段、算法、交付协议、页面流程各在上表的真源修改，其他文档只给摘要和链接。
- 新想法、阈值和方案先进入 [validation.md](validation.md)，经证据和产品负责人的确认后才迁入真源；规则见 [AGENTS.md](AGENTS.md)。
- 新增 kind 只在 [kinds.md](kinds.md) 增加一张卡片，再补数据校验、故事和 fixture，清单见 [kinds.md §5](kinds.md)。
- [设计稿](../design/v2/README.md)只做视觉与交互表达：文案和规则先改本目录，再同步设计稿；设计稿里没有文档依据的方案，先登记到 [validation.md](validation.md)。
- 只用相对链接；移动文件时同步修复仓库内引用。修改日期写实际日期。
