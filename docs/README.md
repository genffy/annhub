# AnnHub Docs

更新时间：2026-05-20

本文档目录收纳 AnnHub 的模块说明、架构计划和实现约定。

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [生词标注模块说明](./label/README.md) | 生词标注的当前实现基线、策略、数据契约和测试覆盖。 |
| [Logseq 本地同步模块说明](./logseq/README.md) | Logseq 本地 HTTP Server 同步实现、数据格式、消息协议和排障要点。 |
| [标注架构重构计划](./annotation-architecture-refactor.md) | 高亮标注与生词标注共享 annotation core 的分阶段重构方案。 |

## 维护约定

1. 模块说明文档使用中文标题，文件名使用小写目录 + `README.md`。
2. 架构计划和跨模块设计使用小写短横线文件名。
3. 每篇文档顶部保留 `更新时间：YYYY-MM-DD`。
4. 图片资源放在对应模块目录的 `assets/` 下，并使用相对路径引用。
