# 检索与筛选契约

> 层级：core
> 状态：目标契约
> 更新：2026-10-07

本文定义扩展对 Fragment 的基础搜索、筛选和排序。匹配规则只在共享领域层实现一次，各页面不各自复制。

## 1. 搜索范围

默认搜索 Fragment 的 `content`、`context.excerpt`、`context.sourceTitle`、`context.sourceHost`、`context.sourceUrl`、`processing.guess`、`processing.verified.summary`、`processing.use` 和 `tags`。不搜索图片字节、整页正文或密钥。Highlight、Clip 与截图集是独立视图；其搜索口径单独标识，不混入 Fragment 结果数。

## 2. 匹配

查询和候选字段都使用共享 `normalizeContent`。输入按 Unicode 空白拆成非空词；每个词必须在上述任一字段中以归一化子串形式命中，词可以落在不同字段。中文与其他无空格语言直接按子串匹配；基础搜索不依赖分词、词干化或在线模型。空查询只执行筛选。

同维度多选取 OR，跨维度取 AND，搜索条件再与筛选结果取 AND。`kind / sourceHost / tags / capturedAt` 为基础维度。时间范围采用 `[start, end)` 的 UTC epoch 毫秒；用户选择日历日期时，页面先按其本地时区换算边界。

## 3. 排序与分页

有搜索词时，每个词取其命中字段的最高权重并求和：`content=5`、理解/核验/应用=4、tags=3、sourceTitle=2、excerpt/sourceHost/sourceUrl=1。分数降序后按 `createdAt` 降序、`id` 升序。无搜索词时按 `createdAt` 降序、`id` 升序。每页默认 50 条，翻页使用稳定排序键，不因同一时间戳而重复或漏项。

扩展可以维护 IndexedDB 搜索索引，但候选结果必须经过上述共享规则复核。索引缺失时回退到本地扫描，不改变结果语义。1 万条 Fragment 的常用查询以首屏 50 条、冷启动后第二次查询为基准，目标 200ms 内返回；搜索不得阻塞页面交互。
