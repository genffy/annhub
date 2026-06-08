# 单词选词精度 — 业界方案调研与可落地路线

> 状态:调研 + 设计稿(尚未编码)。分支 `feat/vocab-word-selection-research`。
> 目标问题:**标不出用户真正不认识的词** —— 简单常见词被无谓标注、特定行业术语/专有名词被误当生词、缺乏对用户个人词汇水平的建模。
> 本文档 = 代码现状锚点 + 联网调研(多源对抗验证)+ 本地短期/服务端长期分阶段方案。

---

## 0. 结论速览(TL;DR)

业界把"标注真正不认识的词"拆成**四个互补层次**,且天然对应本地短期 / 服务端长期两条路:

| 层次                        | 解决的痛点              | 本地短期可做                                               | 服务端长期                                  |
| --------------------------- | ----------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| **L1 难度/词频分级**        | 简单常见词被标          | 已有(OpenSubtitles band),建议升级到 wordfreq/SUBTLEX 全量  | 同 + 多语料融合                             |
| **L2 领域/术语识别**        | 行业术语被误当生词      | 领域语料 vs 通用语料对比(Weirdness/TF-IDF 思路)            | PyATE 级术语抽取服务                        |
| **L3 用户个人词汇建模**     | 没有"你"这个变量        | **★ 第一步**:把 star 5 级枚举升级为"接触次数+衰减"概率模型 | HLR / FSRS / IRT 跨设备记忆模型             |
| **L4 上下文相关难度 + LLM** | 同词不同句难度不同、WSD | glossBatch 接入 + prompt 注入 CEFR/已知词/主题             | CWI/LCP 连续难度回归 + LLM 词义级 CEFR 标注 |

**短期主线(本次优先):L3 用户个人词汇建模** —— 这是当前架构里"最缺、杠杆最高、纯本地可做"的一层。配合 L2 领域过滤补刀,即可显著减少"误标 + 漏标"。
**长期主线:L3(数据沉淀) + L4(上下文模型/LLM)并重,分阶段迁移到服务端。**

> **本地短期实现进度(分支 `feat/vocab-word-selection-research`)**:
>
> - ✅ **S1 / L3** 个人词汇记忆模型(`word-memory.ts`,召回概率衰减)
> - ✅ **S2 / L2** 领域术语过滤(`domain-filter.ts`,本地 Weirdness,修复长尾漏标 B1)
> - ✅ **S3 / L1** 书面/学术高频 baseline(`written-frequency-data.ts`,修复字幕语料口语偏差 B10)
> - ✅ **S4 / L4** LLM 参与选词(`selectAndGloss`,默认关闭,可选开)
>   四层治本逻辑均已落地;服务端长期方案(T1/T2/T3)见 §5,尚未开工。

---

## 1. 代码现状锚点(瓶颈定位)

选词决策**不只在** `frequency-filter.ts`;真正的漏斗在 `entrypoints/content/vocab-label/annotate.ts` 的 `collectMatches → calculateCandidateScore`。`frequency-filter.ts` 只是其中一个闸门。

```
正则 \b[a-zA-Z]{2,}\b
  → normalizeWord (len<3 跳过)
  → pickLemma(word, w => snapshot.entries[w] || band(w)!==null)   // annotation-core/lemmatize.ts
  → effectiveStar = pendingStarOverlay[lemma] ?? snapshot.star ?? 1
  → effectiveStar >= skipStarThreshold(balanced=3/review-light=4/aggressive=5) ? 跳过
  → 无 Eudic 词条时:isLikelyProperNounCandidate() 启发式 + shouldFilterByLevel()
  → calculateCandidateScore() 打分 → 排序取前 budget(<=maxAnnotationsPerPage=200)
  → resolvePendingGlosses(每词一次 CONTEXT_GLOSS,最多 12/batch)→ wrap
```

| #       | 瓶颈                        | 代码锚点                                                          | 后果                                                                                                                                         |
| ------- | --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1**  | 长尾词一刀切跳过            | `frequency-filter.ts` `band===null → return true`                 | 50k 表外的**真正学术/专业生词**(`perfunctory`/`epistemic`)被**静默丢弃**——核心漏标来源（✅ S2 已修复:改由 domain-filter 区分术语 vs 真生词） |
| **B2**  | CEFR→band 是线性平移表      | `frequency-filter.ts` `CEFR_KNOWN_BAND_THRESHOLD`(A1=1…C2=6)      | 假设词汇按频率单调展开;无领域/主题维度                                                                                                       |
| **B3**  | 词形还原仅后缀规则+命中过滤 | `annotation-core/lemmatize.ts` `pickLemma`/`lemmaCandidates`      | 不规则词仅 ~100 条;`-ing/-ed` 歧义靠"在表里"裁决,可能误判 lemma → band 错                                                                    |
| **B4**  | 专名启发式纯规则            | `annotate.ts` `isLikelyProperNounCandidate`                       | 句首大写词依赖频率表存在性,假阳性吞掉真生词                                                                                                  |
| **B5**  | 候选打分维度极少            | `annotate.ts` `calculateCandidateScore`(仅 Eudic 条目/level/star) | 无难度梯度、上下文显著性、TF-IDF、首现、最近接触次数                                                                                         |
| **B6**  | 已知词非概率化              | `VocabSnapshot.entries[w].star`(1..5 枚举)                        | 无"接触→熟练"衰减,全靠用户右键 known                                                                                                         |
| **B7**  | LLM 不参与选词              | `vocabulary/index.ts` `resolveGloss` 仅翻译                       | 最廉价智力没用在"该不该标"                                                                                                                   |
| **B8**  | LLM 上下文极窄              | prompt 仅注入单句,不带 CEFR/已知词/主题                           | 无法 WSD/领域识别/个性化                                                                                                                     |
| **B9**  | 无领域识别                  | 全工程无 topic/domain 模块                                        | 同阈值打天下;字幕语料偏口语,科技/学术词全被当长尾                                                                                            |
| **B10** | 频率源是字幕语料            | `scripts/data/opensubtitles-en-50k.txt`                           | `furthermore`/`paradigm` 偏生词,`gonna`/`dude` 却 band 1（✅ S3 已修复:书面高频 baseline 前置判定）                                          |
| **B11** | `glossBatch` 已实现但未启用 | `OpenAICompatibleLlmService.glossBatch` vs `annotate.ts` 仍逐词   | 接入即降延迟/成本,且天然适合"批量挑词"                                                                                                       |

**现有个性化数据资产(L3 的地基,已存在):**

- `VocabSnapshot.entries[word].star`(1=新词…5=已掌握,从 Eudic 同步)。
- `VocabLearningPendingEvent` 队列(`known/skip/addToVocab/...` 本地事件,flush 到 Eudic)。
- `VocabularyService.getLearningProfile()` 合并 snapshot star + pending → `pendingStarOverlay`。
- `VocabConfig.cefrLevel`(单值 A1..C2,默认 B1)。

缺的是:**接触次数 / 最近接触时间 / 衰减 / 概率化召回**——即把"状态枚举"升级为"记忆模型"。

---

## 2. 业界调研结论(多源对抗验证,24/25 条 3-0 通过)

### L1 难度/词频分级数据源

- **SUBTLEX-US**(Ghent 大学,Brysbaert & New):8,388 部影视字幕、5100 万词、74,286 词形。字幕频率在词汇判断准确率/反应时上解释的方差**高于** Kučera-Francis 与 CELEX —— 即字幕类频率更能预测加工难度。免费下载。
- **wordfreq**(Python 库):聚合 8 大语料(OpenSubtitles 2018、SUBTLEX、Google Books Ngrams、Wikipedia、NewsCrawl、OSCAR、Twitter、Reddit),提供 **Zipf 刻度** = log10(每十亿词出现次数),0–8 的现成数值难度信号。⚠️ 已停止活跃维护,数据停在 ~2018 快照。
- **NGSL**(New General Service List)v1.2:2,809 词,基于剑桥语料 2.73 亿词子集,各表最低 92% 文本覆盖。可作 CEFR 风格轻量 baseline。
- **English Vocabulary Profile (EVP)** / englishprofile.org:词义级 CEFR 权威映射(供 L4 LLM 对齐用)。

> 对 AnnHub 的意义:现有 OpenSubtitles band 思路被业界印证,但**字幕语料偏口语是已知缺陷(B10)**。升级方向:换 wordfreq 的多语料 Zipf,或叠加 NGSL/COCA 互补。

### L2 领域/术语识别

- **PyATE**(MIT 开源):实现 C-Value / Basic / Combo Basic / **Weirdness** / **Term Extractor** 五种术语抽取算法(基于 spaCy POS)。
  - **Weirdness 系数** = (领域词频/领域总词) / (参考词频/参考总词) —— 即"**领域特异度 vs 通用频率**",正是把术语/行话从常见词里分离的方法论,**直接对应"行业术语被误标为生词"的痛点**。
- **textacy**:另一套可用的 keyterm/术语抽取实现(TextRank/SGRank 等)。
- ⚠️ 修正:网传"PyATE 最初为某 Chrome 扩展做术语高亮"——经验证**为假(1-2 否决)**,不要据此引用为先例。

### L3 用户个人词汇建模

- **Migaku**:维护每用户 known-words 列表,据此给内容算"理解度(comprehension)分数",指导下一步读什么。内置 SRS 闪卡。
- **Readlang**:核心是 click-to-save(用户点生词→闪卡);**词频排序是补充层**,用于"挑对你最有用的词"。(注:Readlang"频率选词"证据评级 medium,勿夸大为唯一管线。)
- **Half-Life Regression (HLR)**(Duolingo,Settles & Meeder, ACL 2016):回归估计每个词在**个体长期记忆中的"半衰期"**。特征含 `delta`(距上次曝光)、`history_seen`/`history_correct`(累计曝光/正确)、`lexeme_id`(带形态的词标识)。**结合近因 + 重复历史 + 词级难度预测召回概率。**
- **FSRS**(Free Spaced Repetition Scheduler,MIT 开源,Anki 23.10+ 内置):ML 拟合每用户复习历史 → 个性化 **DSR(难度/稳定性/可提取性)** 模型,给出每词随时间衰减的知识状态。
- ⚠️ LingQ / Language Reactor / lextutor 的官方算法细节为不可靠来源,本轮**未取得一手证据**;只证实了 Readlang 与 Migaku 的机制。

> 对 AnnHub 的意义:这是**当前最缺、杠杆最高**的一层。把 `star` 升级为 HLR/FSRS 风格的"接触历史 → 召回概率",就能回答"用户**现在**还认不认识这个词"。

### L4 上下文相关难度 + LLM 角色

- 难度应建模为**连续回归**而非二分类:
  - **CWI**(Complex Word Identification,共享任务):自动识别文中对读者困难的词——正是"标哪些词"的核心问题。**CWI 2018** 同时给二分类与概率(0–1)两种框架。
  - **CompLex**:首个英文连续(分级)词难度语料,用 **5 点 Likert** 取代二分,9,476 句多领域。
  - **SemEval-2021 Task 1 (LCP)**:在给定句子中为目标词赋 **0–1 复杂度分**——句子上下文相关难度,**非固定词表**。同词不同句难度不同,有可训练模板。
- LLM 的角色(服务端长期):
  - **CEFR-Annotated WordNet**(LREC 2026):用 LLM 度量 WordNet 词义定义与 EVP 的语义相似度,**给每个词义自动赋 CEFR 等级**;训练出的上下文难度分类器 Macro-F1≈0.81(⚠️ 单一论文自报、无独立复现,作者自称"间接证据")。
  - **EvalYaks**(arXiv 2408.12226):LoRA 微调 Mistral Instruct 7B,基于 EVP(至 B2),能识别词的 CEFR 等级并生成对应等级词汇。
  - 结论:LLM 能做**词义消歧式、上下文相关**的难度评估,但成本/延迟使其**更适合服务端**,而非纯浏览器端实时全文标注。

---

## 3. 信号融合模型(核心设计)

不要让任何单一信号一票决定。把选词决策改为**多信号融合的"陌生度分数"**,在 `calculateCandidateScore` 处汇合(B5 锚点):

```
annotateScore(word, ctx) =
    w_freq   * freqDifficulty(word)        # L1 通用频率难度(Zipf 越低越难)
  + w_domain * domainTermPenalty(word,ctx) # L2 高领域特异度 → 判为术语,降分(不标)
  - w_known  * userRecall(word)            # L3 用户召回概率越高 → 越不标
  + w_ctx    * contextDifficulty(word,ctx) # L4 上下文难度(短期=规则/启发式,长期=LCP/LLM)
```

- 高于阈值才标;阈值由 `VocabConfig` 的 aggressiveness(balanced/review-light/aggressive)调。
- 关键反转:**L1 长尾词(band===null)不再默认丢弃(B1)**,而是交给 L2 判断"是术语还是真生词"——这是修复核心漏标的关键。
- 冲突仲裁(openQuestion):领域术语 vs 真生词的边界,短期用阈值+用户反馈校正,长期用 LLM/LCP 裁决。

---

## 4. 本地短期方案(纯浏览器内,无服务端)

> 优先级遵循你的选择:**L3 用户个人词汇建模 = 第一步**;L2 领域过滤紧随补刀;L1/L4 增强。

### 阶段 S1 ★ 用户个人词汇建模(第一步,最高杠杆)— ✅ 已实现

> 实现于 `feat/vocab-word-selection-research`。代码:`annotation-core/word-memory.ts`(纯模型)、`VocabularyService`(持久化 `vocabWordMemory`)、`annotate.ts#reportWordExposures`(曝光上报)。测试:`word-memory.test.ts`(16)、`vocabulary-learning.test.ts` 新增 4 例。

**目标**:把"标过/见过的词逐渐不再标",回答"用户现在还认不认识"。
**已落地做法**(纯本地,复用现有资产):

1. 数据模型:`WordMemory { seenCount, lastSeenAt, stability, star? }`,存储键 `vocabWordMemory`,与 Eudic snapshot 解耦。
2. 衰减:`recall = 2^(-elapsedDays / stability)`。被动曝光按间隔效应增长 stability;`known`→长期(≥180d)、`skip`→永久、`unknown`/`addToVocab`→收缩到短期。
3. 接入:`getLearningProfile()` 用 `max(欧路 star, recallToStar(recall))` 合并,显式已知不被削弱、被动反复出现的词爬向已知;`effectiveStar` 链路无需改写(继续吃 star)。
4. 上报:每次标注完成后 `reportWordExposures` 发 `RECORD_VOCAB_EXPOSURES`(fire-and-forget)累计 `seen`。

**后续可演进**:当前 stability 增长是确定性启发式;数据格式已按 FSRS DSR 思路预留,长期可在服务端用真实复习历史拟合(见 T1)。

**工程成本**:中(已完成)。**精度收益**:高(直接消除"反复标已熟词")。

### 阶段 S2 领域术语过滤(修复 B1+B9,补刀误标)— ✅ 已实现

> 实现于 `feat/vocab-word-selection-research`。代码:`annotation-core/domain-filter.ts`(纯检测)、`annotate.ts`(`buildDomainStats` + `shouldFilterByCandidate` 接入)。测试:`domain-filter.test.ts`(9)、`annotate.test.ts` 新增 S2 用例。

**目标**:行业术语/专有名词不再被当生词;真正生词不再被一刀切丢弃。
**已落地做法**(本地化 Weirdness 思路,无需 Python/PyATE):

1. 每趟标注先用 `buildDomainStats` 扫一遍可见文本节点,建立**页面内 lemma 词频统计**(per-page TF)。
2. 对**不在通用词频表的长尾词**(band===null)调用 `isLikelyDomainTerm`:
   - 页面内重复出现 ≥ 阈值(默认 3)→ 判为**领域术语/主题词**(跳过);
   - ACRONYM / CamelCase → 判为专名/产品名(跳过);
   - 否则(只出现一两次的稀有词)→ **判为真生词,保留标注**——直接修复 B1 核心漏标。
3. 在表内的词仍走原 `shouldFilterByLevel` 频率难度门(逻辑不变)。

**与旧逻辑的关键反转**:`band===null → return true`(一刀切丢弃)被替换为"领域术语 vs 真生词"的判别。`mitochondria` 在生物文里重复 → 跳过;`perfunctory` 偶现一次 → 标注。
**后续可演进**:阈值化的页面 TF 是 Weirdness 的近似;长期可叠加内置领域关键词词典做主题判定、或服务端 PyATE 级术语抽取(见 T2)。

**工程成本**:中(已完成)。**精度收益**:高(同时治"误标术语"和"漏标真生词")。

### 阶段 S3 词频数据升级(修复 B10)— ✅ 已实现(书面高频 baseline 路线)

> 实现于 `feat/vocab-word-selection-research`。代码:`written-frequency-data.ts`(内置书面/学术高频词 baseline)、`frequency-filter.ts`(`shouldFilterByLevel` 前置判定)、`annotate.ts`(候选门 + 专名门 + lemma 词典纳入)。测试:`written-frequency-data.test.ts`(5)、`frequency-filter.test.ts` 新增 2 例、`annotate.test.ts` S3 例。

**问题(B10)**:OpenSubtitles 是口语/对话语料,系统性低估**书面/学术高频词**——`furthermore`(band 4)、`whereas`(band 4)、`paradigm`(band 6)、`methodology`(band 6)被当生词标注,而口语高频 `gonna`/`dude`/`yeah` 却是 band 1。

**已落地做法(纯本地、零联网)**:沙箱环境无法跑 Python/下载 wordfreq,改用**内置高精度书面高频词表**(NGSL + AWL sublist 1–2 + 学术连接词/话语标记,~200 词):

1. `written-frequency-data.ts#isWrittenHighFrequencyWord`:lookup-only 词集,命中即视为"已知书面词"。
2. `shouldFilterByLevel` 在查 band **之前**先判:命中书面高频表 → 直接跳过(不标),不受其被字幕语料抬高的 band 影响。
3. `annotate.ts` 三处纳入:候选难度门(`shouldFilterByCandidate`)、句首专名门(书面高频词不再被误判专名)、lemma 词典(屈折形态能归一到书面词)。
4. **刻意排除真·难词**(`epistemic`/`perfunctory`/`ubiquitous`)——它们仍应被标注,保证不误伤真生词。

**为何不换 wordfreq**:wordfreq 已停止维护(数据停在 ~2018),且需 Python 运行时;内置精炼词表针对性修正口语偏差、零依赖、可控。后续若要全面升级仍可走"重跑 build 脚本换多语料 Zipf"的原方案。
**工程成本**:低(已完成)。**收益**:中(消除书面高频词的口语偏差误标)。

### 阶段 S4 LLM 参与选词(B7/B8)— ✅ 已实现(默认关闭)

> 实现于 `feat/vocab-word-selection-research`。代码:`llm/types.ts`(`selectAndGloss` 接口 + `LlmWordVerdict`)、`openai-compatible.ts`(`selectAndGloss` 实现)、`VocabularyService.selectAndGloss`、`annotate.ts#applyLlmWordSelection`、`VocabConfig.llmWordSelectionEnabled` + 设置页开关。测试:`openai-compatible.test.ts` 新增 3 例、`annotate.test.ts` S4 例、`vocabulary-learning.test.ts` 2 例。

**目标**:让 LLM 参与"该不该标"(WSD + 个性化),而非只翻译。
**已落地做法**:

1. 新接口 `selectAndGloss(candidates, cefrLevel)`:一次往返**同时**判定每个候选对该用户是否"真正陌生(unfamiliar)"**并**给释义。prompt 注入用户 CEFR + 每词所在句子。
2. `annotate.ts`:本地难度门(L1/L2/L3)先选出候选;若 `llmWordSelectionEnabled` 开启,无 Eudic 词条的候选经 `SELECT_AND_GLOSS` 交 LLM 精选——不陌生的丢弃,陌生的复用 LLM 释义(省去单独 `CONTEXT_GLOSS`)。
3. 缓存/Eudic 命中走本地不调 LLM;LLM 不可用或解析失败 → 保留本地选择(不致整页空白)。
4. **默认关闭**,设置页 "LLM word selection (experimental)" 开关开启;成本由用户自带端点承担,作为高精度可选档。

**未接入项**:`glossBatch`(B11)仍未在主链路使用——`selectAndGloss` 已覆盖"批量挑词+释义",`glossBatch` 留作纯批量翻译的备用接口。
**工程成本**:低-中(已完成)。**收益**:高(精度天花板),但有 token 成本/延迟。

**本地短期落地顺序**:S1 → S2 → S3 → S4。**已全部完成(S1、S2、S3、S4)。**

---

## 5. 服务端长期商业化方案(两者并重,分阶段)

> 你的选择:个性化模型 与 上下文难度模型 **并重,分阶段迁移**。

### 阶段 T1 数据沉淀 + 个性化记忆模型(对应 L3,先行)

- 把本地 `WordMemory` 的曝光/反馈事件(匿名化)上报服务端,跨设备聚合。
- 服务端训练 **HLR / FSRS / IRT(Item Response Theory)** 个性化记忆模型,回传每词召回概率。
- 商业化锚点:跨设备同步、学习报告、记忆曲线——天然订阅价值。
- **为什么先行**:数据需要时间沉淀;越早收集越早形成壁垒(护城河)。

> **详细设计契约见 §7「T1 服务端契约」(后端无关,接口先行,尚未实现服务端)。**

### 阶段 T2 上下文难度模型 + LLM 选词(对应 L4,后随)

- 服务端跑 **CWI/LCP 连续难度回归**(CompLex/SemEval 模板),给"同词不同句"的 0–1 难度。
- **LLM 词义级 CEFR 标注**:用 LLM + EVP 对齐离线给 WordNet/词库打 CEFR 标签,产出可本地缓存的"词义→CEFR"表(把 LLM 成本从在线推到离线)。
- 在线只在高价值场景调用 LLM(WSD 歧义、专业文本),其余走缓存表/小模型,控成本。
- 候选轻量服务端模型:LoRA 微调小模型(EvalYaks 思路)或蒸馏的 LCP 回归器。

### 阶段 T3 融合与个性化阈值

- 服务端把 L1(频率)+L2(领域)+L3(个性化记忆)+L4(上下文难度)融合成统一打分 API。
- 本地内容脚本退化为"取分 + 渲染",重逻辑上移;离线时回退本地启发式(S1-S3)。

**迁移原则**:本地短期方案的数据 schema(`WordMemory`、weirdness 特征)从一开始就按服务端模型的输入格式预留,避免长期重做。

> **T1 详细设计契约**(后端无关,接口/数据模型/隐私/降级)见 `docs/vocab-server-memory-model-design.md`。状态:契约冻结(T1-A),服务端未实现。

---

## 6. 精度/成本权衡一览

| 方案                        | 精度  | 工程成本 | 运行成本        | 隐私         | 落地阶段 |
| --------------------------- | ----- | -------- | --------------- | ------------ | -------- |
| 词频 band 门控(现状)        | 低-中 | 已有     | 0               | 纯本地       | —        |
| wordfreq/NGSL 升级(S3)      | 中    | 低       | 0               | 纯本地       | 短期     |
| 用户记忆模型启发式(S1)      | 中-高 | 中       | 0               | 纯本地       | 短期★    |
| 本地 Weirdness 领域过滤(S2) | 中-高 | 中       | 0               | 纯本地       | 短期     |
| LLM 批量选词(S4)            | 高    | 低-中    | token(用户自付) | 句子出端点   | 短期可选 |
| 服务端 HLR/FSRS(T1)         | 高    | 高       | 服务器          | 需上报(匿名) | 长期     |
| 服务端 LCP/LLM 离线标注(T2) | 最高  | 高       | 服务器+离线 LLM | 内容/词上报  | 长期     |

---

## 7. 未决问题(需实证)

1. 纯浏览器端实时跑 LCP/CWI 连续难度模型的体积/延迟可行性(ms/MB 级轻量模型适配 MV3 content script)?
2. L1+L2+L3 三层信号的权重与冲突仲裁缺乏公开工程基准,需 A/B 调参。
3. COCA / Google Ngram / SUBTLEX 在"区分领域术语 vs 真生词"上的相对精度无一手量化对比。
4. 沉浸式翻译 / Language Reactor / LingQ / Toucan 的内部选词算法缺一手证据,仅证实 Readlang/Migaku。

---

## 8. 数据源 / 库 / 论文清单(可直接取用)

**词频/难度数据**

- SUBTLEX-US — https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus(免费)
- wordfreq(Zipf 刻度,8 语料聚合)— https://pypi.org/project/wordfreq/(MIT,⚠️ 停止维护)
- NGSL v1.2 — https://www.newgeneralservicelist.com/
- English Vocabulary Profile(词义级 CEFR)— https://www.englishprofile.org/

**领域/术语抽取**

- PyATE(C-Value/Weirdness/Term Extractor,MIT)— https://github.com/kevinlu1248/pyate
- textacy(keyterm 抽取)— https://textacy.readthedocs.io/
- Terminology extraction 概览 — https://en.wikipedia.org/wiki/Terminology_extraction

**用户记忆/SRS 建模**

- HLR(Duolingo, ACL 2016)— https://research.duolingo.com/papers/settles.acl16.pdf
- FSRS(MIT,Anki 内置)— https://github.com/open-spaced-repetition/fsrs4anki
- awesome-fsrs — https://github.com/open-spaced-repetition/awesome-fsrs
- Deep Knowledge Tracing(Stanford)— https://web.stanford.edu/~cpiech/bio/papers/deepKnowledgeTracing.pdf

**上下文难度 / CWI / LCP**

- SemEval-2021 Task 1 (LCP) — https://aclanthology.org/2021.semeval-1.1/
- CWI 2018 — https://aclanthology.org/W18-0507/
- CompLex 语料 — https://aclanthology.org/2020.readi-1.9/

**LLM 选词/分级**

- CEFR-Annotated WordNet(LREC 2026)— https://arxiv.org/abs/2510.18466
- EvalYaks(LoRA Mistral 7B,CEFR)— https://arxiv.org/abs/2408.12226

**产品参考**

- Migaku — https://migaku.com/
- Readlang — https://www.readlang.com/about

> 调研方法:deep-research 多 agent 联网搜索 6 维度 → 25 源 → 77 条主张 → 25 条 3-票对抗验证 → 24 确认/1 否决。被否决主张:"PyATE 最初为 Chrome 扩展高亮术语"(1-2,勿引用)。产品类来源为厂商自述、Macro-F1≈0.81 无独立复现 —— 引用时按本文档 ⚠️ 标注处理。
