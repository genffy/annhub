# T1 — 服务端个性化记忆模型:设计契约(后端无关)

> 状态:**契约冻结(T1-A)+ 本地事件队列/同步客户端 stub 已落地(T1-B)+ 最小服务端 `/events`+`/recall` 与 HLR 训练已实现(T1-C/T1-D,Python,见 `server/`)**。剩余:T2 上下文难度/LLM 词义 CEFR、跨设备 `accountId` 聚合。分支 `feat/vocab-word-selection-research`。
> 上游背景见 `docs/vocab-word-selection-research.md` §5「服务端长期商业化方案」L3 / T1。
> 本文目标:把"本地 ↔ 服务端"的**数据契约、同步协议、隐私边界、降级策略**定死,使服务端选型(自建 / Serverless / 任意栈)可后置,且本地代码可以先按契约预留。

---

## 0. 为什么 T1 先行

L3(用户个人词汇建模)是护城河:**记忆数据需要时间沉淀,越早收集越早形成壁垒**。
本地 S1 已经在产生这类数据(`WordMemory { seenCount, lastSeenAt, stability }`),但它:

- 只存单设备 `chrome.storage.local`,**不跨设备**;
- stability 增长是**确定性启发式**,不是用真实"回忆成功/失败"历史拟合的模型。

T1 = 把本地事件流(匿名)上报 → 服务端聚合跨设备 → 训练 HLR/FSRS/IRT → 回传"每词召回概率",本地据此选词。**商业化锚点**:跨设备同步、学习报告、记忆曲线、订阅。

设计原则:**后端无关**——只定义 REST + 事件契约 + 数据模型;Cloudflare Workers、Node+PG、还是别的,日后再选,不影响本地。

---

## 1. 本地 ↔ 服务端边界

```
┌─────────────────────────── 浏览器扩展(本地) ───────────────────────────┐
│ content/vocab-label/annotate.ts                                          │
│   标注完成 → reportWordExposures (已存在, S1)                            │
│ background VocabularyService                                             │
│   ├─ WordMemory 本地模型 (S1, 真源/离线可用)                             │
│   ├─ MemoryEvent 事件队列 (T1 新增, 待上报)  ← 本文契约                  │
│   └─ MemorySyncClient (T1 新增, 打到可配置端点) ← 本文契约               │
└──────────────────────────────────┬───────────────────────────────────────┘
                                    │  HTTPS, 批量, 幂等, 可离线累积
                                    ▼
┌─────────────────────────── 服务端(后端无关) ───────────────────────────┐
│  POST /v1/memory/events     接收事件批 (HLR/FSRS 训练输入)               │
│  GET  /v1/memory/recall     回传每词召回概率 / DSR 状态                  │
│  (训练任务: 离线/异步, 周期性用事件历史拟合个性化模型)                    │
└───────────────────────────────────────────────────────────────────────────┘
```

**关键约束(降级安全)**:

- 服务端是**增强**,不是依赖。离线 / 未登录 / 端点未配置 → 完全回退到本地 S1 模型,功能不降级。
- 本地 `WordMemory` 始终是"可立即用"的真源;服务端回传的 recall 作为**更准的覆盖值**,带 TTL,过期或拉取失败即用本地值。
- 选词链路(`getLearningProfile`)对"recall 来自本地还是服务端"无感知——只消费一个 `recall ∈ [0,1]`(经 `recallToStar` 进 star)。

---

## 2. 数据模型

### 2.1 MemoryEvent(上报单元)

对齐 HLR(Settles & Meeder, ACL 2016)与 FSRS 的训练输入字段。每个事件是"用户对某词的一次交互"。

```typescript
interface MemoryEvent {
  /** 客户端生成的幂等 ID(去重用),如 `${ts}_${rand}`。 */
  eventId: string
  /** 归一化词元(lowercased lemma),与本地一致。NOT 原始 surface。 */
  lemma: string
  /** 交互类型。seen=被动曝光;reveal=展开释义;known/unknown/skip/addToVocab=显式反馈。 */
  type: 'seen' | 'reveal' | 'known' | 'unknown' | 'skip' | 'addToVocab'
  /** 事件发生时间(ms epoch, 客户端时钟)。 */
  ts: number
  /**
   * HLR 风格特征(可由服务端从历史重算,但客户端带上可省一次聚合):
   *  - 距上次该词交互的天数(delta),用于召回回归。
   */
  deltaDays?: number
  /** 该词截至此刻的累计曝光次数(history_seen)。 */
  seenCount?: number
  /** 上报时本地估计的召回概率(0..1),用作弱监督/对账。 */
  localRecall?: number
  /** 词出现的领域/主题标签(可选,L2 产物;用于按领域细分能力)。 */
  domain?: string
  /** 设备标识(匿名,见 §4),用于跨设备去重与冲突合并。 */
  deviceId: string
}
```

> 与本地 `WordMemory` 的映射:`seen/reveal/known/unknown/skip/addToVocab` 已是本地 `WordMemoryEventType` 子集(`reset` 不上报,属本地操作)。`deltaDays`/`seenCount`/`localRecall` 由 `word-memory.ts` 现有字段直接派生。

### 2.2 RecallState(回传单元)

服务端模型对某词的输出,本地缓存并优先于本地估计使用。

```typescript
interface RecallState {
  lemma: string
  /** 服务端模型给出的当前召回概率(0..1)。本地用 recallToStar 映射进 star。 */
  recall: number
  /** FSRS DSR 三元组(可选,便于本地在两次同步间自行外推衰减)。 */
  dsr?: { difficulty: number; stability: number; retrievability: number }
  /** 该 recall 的计算时刻(ms);本地按 stability 自行衰减到 now。 */
  computedAt: number
  /** 模型版本,便于灰度/回滚。 */
  modelVersion: string
}
```

### 2.3 本地新增存储键(预留,T1 实现时落地)

| 键                      | 内容                                | 说明                                        |
| ----------------------- | ----------------------------------- | ------------------------------------------- |
| `vocabMemoryEventQueue` | `MemoryEvent[]`                     | 待上报队列,上报成功后裁剪;离线累积          |
| `vocabRecallCache`      | `Record<lemma, RecallState>`        | 服务端回传缓存,带 `computedAt` + 客户端 TTL |
| `vocabSyncIdentity`     | `{ deviceId, accountId? }`          | 匿名设备 ID;登录后关联账号                  |
| `vocabMemorySyncConfig` | `{ enabled, endpoint, lastSyncAt }` | 默认 `enabled=false`;端点可配               |

> `vocabWordMemory`(S1 已有)保持不变,仍是离线真源。

---

## 3. REST 契约(后端无关)

所有请求 `Authorization: Bearer <token>`(匿名 token 或登录 token,见 §4)。JSON。

### 3.1 上报事件 — `POST /v1/memory/events`

```
Request:
{
  "deviceId": "anon-…",
  "events": MemoryEvent[]      // 单批 ≤ 500;客户端按需分批
}

Response 200:
{
  "accepted": 123,             // 去重后入库数
  "duplicates": 4,             // 命中 eventId 幂等去重
  "serverTime": 1733...
}
```

- **幂等**:服务端按 `eventId` 去重,客户端重发安全(网络重试不双计)。
- **顺序无关**:事件带 `ts`,服务端按时间重排训练,客户端可乱序/补传历史。

### 3.2 拉取召回 — `GET /v1/memory/recall?lemmas=a,b,c` 或 `POST`(词多时)

```
Response 200:
{
  "states": RecallState[],
  "modelVersion": "hlr-2026.06",
  "ttlSeconds": 86400          // 客户端缓存有效期建议
}
```

- 本地在 `getLearningProfile` 拉取**当前页候选词**的 recall(而非全量),控流量。
- 未覆盖的词(模型没数据)→ 不返回 → 本地用 S1 估计。

### 3.3 错误与降级

| 情况                         | 客户端行为                                           |
| ---------------------------- | ---------------------------------------------------- |
| 端点未配置 / `enabled=false` | 不发请求,纯本地                                      |
| 网络失败 / 5xx               | 事件**留在队列**下次重试;recall 用本地缓存或本地估计 |
| 401                          | 标记需重新认证,功能回退本地,不阻塞标注               |
| 429                          | 退避重试;不丢事件                                    |

---

## 4. 隐私与匿名化(硬约束)

- **不上报原始句子 / URL / 页面内容**。`MemoryEvent` 只含**词元 + 交互类型 + 时间 + 计数**,无法还原用户读了什么文章。
  - `domain` 字段是粗粒度标签(如 `tech`/`medical`),非具体站点;可由用户关闭。
- **deviceId 匿名**:首次随机生成 UUID,不绑定任何 PII。登录态下与 `accountId` 关联做跨设备合并,登出即解绑。
- **默认关闭**(`vocabMemorySyncConfig.enabled=false`):与 S4 LLM 选词一致,用户显式开启才上报。设置页给出"上报哪些数据"的明确说明。
- **可导出 / 可删除**:提供本地清空队列 + 请求服务端删除该 deviceId 全部数据的入口(GDPR 友好)。
- 复用现有约定:`GET_*_CONFIG` 不回传敏感字段(参照 LLM/Eudic token 的脱敏处理)。

---

## 5. 同步时机与流控

- **上报**:`chrome.alarms` 周期(复用 vocab-sync 思路,或独立 alarm)批量 flush 队列;或队列积累到阈值(如 50 事件)触发。**不在标注热路径同步发网络**(标注仍 fire-and-forget 写本地队列)。
- **拉取 recall**:在 `getLearningProfile` 被调用时,对**本次页面候选词**按需拉取;命中 `vocabRecallCache` 且未过 TTL 则不发请求。
- **合并策略**:服务端 recall 优先;本地按 `RecallState.computedAt` + `dsr.stability` 自行衰减到 `now`,避免两次同步间"卡住不衰减"。
- **冲突**:跨设备同一词以服务端聚合为准(服务端见全量事件);本地仅在离线期临时领先。

---

## 6. 本地代码改造点(T1 实现时,均在 background 侧)

> 本地短期(S1–S4)的数据 schema 已按服务端输入预留,T1 不需重做模型,只加"事件流 + 同步层"。

| 改造        | 锚点                                             | 说明                                                                                                    |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 事件队列    | `VocabularyService` 新增 `vocabMemoryEventQueue` | `recordWordExposures` / `recordLearningEvent` 在写本地 `WordMemory` 的同时,push 一条 `MemoryEvent` 入队 |
| 同步客户端  | 新增 `services/vocabulary/memory-sync.ts`        | `flushEvents()` / `fetchRecall(lemmas)`;后端无关,端点可配                                               |
| recall 合并 | `getLearningProfile`                             | 候选词先查 `vocabRecallCache`(未过 TTL)→ 否则本地 `recallProbability`;两者都经 `recallToStar`           |
| 设置开关    | `VocabConfig` 新增 `memorySyncEnabled` + 端点    | 默认 `false`;设置页加开关与隐私说明                                                                     |
| 身份        | `vocabSyncIdentity`                              | 首次生成匿名 deviceId                                                                                   |

**不改动**:`word-memory.ts`(纯模型,本地/服务端共用同一召回公式语义)、选词链路打分逻辑(仍消费 star)。

---

## 7. 里程碑拆分(T1 落地时)

1. **T1-A(本文)**:契约冻结 ✅
2. **T1-B**:本地事件队列 + 同步客户端 stub(打到可配置端点,默认关闭;无服务端时纯排队)✅
3. **T1-C**:最小服务端——实现 `/events` 幂等入库 + `/recall` 先用 FSRS 默认参数(不训练),跑通端到端。✅(Python,`server/`,见下方实现说明)
4. **T1-D**:服务端按事件历史拟合个性化 HLR,回传训练后的 recall;`modelVersion` 灰度。✅(同上,`POST /v1/memory/train` + CLI)
5. **T2**:上下文难度(CWI/LCP)与 LLM 词义级 CEFR 离线标注(见 research §5 T2)。

### T1-B 实现说明(已落地,纯本地)

> 代码:`types/vocabulary.ts`(`MemoryEvent`/`RecallState`/`VocabSyncIdentity`/`VocabMemorySyncState` + `memorySyncEnabled`/`memorySyncEndpoint` 配置)、`services/vocabulary/memory-sync.ts`(`MemorySyncClient`,后端无关)、`services/vocabulary/index.ts`(队列/身份/flush/recall 合并/独立 alarm)、`message-handles.ts` + `types/messages.ts`(`GET_VOCAB_MEMORY_SYNC_STATE` / `FLUSH_VOCAB_MEMORY_EVENTS` / `CLEAR_VOCAB_MEMORY_QUEUE`)、设置页 `VocabPage.tsx`(开关 + 端点 + 队列状态 + Sync/Clear)。测试:`memory-sync.test.ts`(7)、`vocabulary-learning.test.ts` 新增 10 例;E2E:`e2e/vocab-annotate.spec.ts` 在真实扩展运行时验证开启后匿名 `seen` 事件入队、`deviceId` 为 `anon-` 前缀、事件不含句子/URL/页面内容(隐私契约 §4)。

与 §2.3/§6 的两处对齐(实现时的具体取舍):

1. **存储键拆分**:§2.3 的合并键 `vocabMemorySyncConfig { enabled, endpoint, lastSyncAt }` 落地为——用户配置 `enabled`/`endpoint` 进 `VocabConfig.memorySyncEnabled` / `memorySyncEndpoint`(与 §6 一致,复用既有 config 脱敏/设置页/`SET_VOCAB_CONFIG` 管线),运行态 `pendingCount/lastSyncAt/lastStatus/lastError/deviceId` 进独立键 `vocabMemorySyncState`(镜像既有 `vocabSyncState`)。其余键 `vocabMemoryEventQueue` / `vocabRecallCache` / `vocabSyncIdentity` 如契约 §2.3。
2. **recall 拉取时机(热路径安全)**:§5 的"`getLearningProfile` 按需拉取"实现为——`getLearningProfile` **只同步读** `vocabRecallCache`(`max` 折叠、TTL 24h、有 `dsr.stability` 时按公式衰减到 now),对缺失/过期的本页候选词触发 **fire-and-forget** 后台 `fetchRecall`,**绝不在标注热路径上等待网络**。开关关闭或无端点时该后台拉取整体跳过。

其他实现细节:事件入队仅在 `memorySyncEnabled` 时发生(默认关 = 零数据采集);队列上界 `MAX_QUEUED_MEMORY_EVENTS=5000`(超出丢最旧);flush 按 `MEMORY_EVENT_BATCH_LIMIT=500` 分批、幂等(按 `eventId`)、逐批裁剪并持久化进度、失败保留队列且记 `lastError`(不抛、不阻断);`reset` 事件为本地操作不上报;匿名 `deviceId` 首次 `crypto.randomUUID()` 生成(带降级)。

### T1-C / T1-D 实现说明(已落地,Python `server/`)

> 代码:`server/annhub_memory/`(FastAPI + SQLite + Pydantic),测试:`server/tests/`(68 例,`pytest` 全绿)。详见 `server/README.md`。选型决策(对应 §8 开放问题 1):**Python + FastAPI + SQLite**——零外部服务、单文件可移植、契约无关;`store.py` 是存储抽象,换 Postgres 不影响上层。

与 §2–§5 契约的对齐点:

1. **REST 一一对应**:`POST /v1/memory/events`(幂等、返回 `{accepted, duplicates, serverTime}`)、`POST|GET /v1/memory/recall`(返回 `{states, modelVersion, ttlSeconds}`,未覆盖词省略)、`DELETE /v1/memory/events?deviceId=`(GDPR 擦除,§4)。所有请求 `Authorization: Bearer <deviceId|token>`。
2. **Pydantic schema 即契约镜像**:`schemas.py` 的 `MemoryEvent`/`RecallState` 字段与 `types/vocabulary.ts` 完全一致(camelCase 直传,无别名)。`MemoryEvent` 字段集合被 `tests/test_privacy.py` 结构化断言为**只含** `{eventId, lemma, type, ts, deltaDays, seenCount, localRecall, domain, deviceId}`——句子/URL/页面内容在 schema 层就不存在,即使客户端误传也被 Pydantic 丢弃不入库。
3. **幂等在存储层**:`events` 表主键 = `(device_id, event_id)`,`INSERT OR IGNORE` 去重;同设备重发幂等,跨设备偶发相同 eventId 互不干扰。`accepted/duplicates` 计数由实际插入行数得出。
4. **recall 单一真源 = events 表**:recall 状态**按需从事件计算**(`model.compute_snapshot`),从不落盘,故不可能过期;只有训练后的 HLR 权重持久化(`model_meta` 表)。
5. **两种估计器,同一召回公式**:都产出 stability(半衰期,天),都用 `recall = 2^(-elapsedDays / stability)`(与本地 `word-memory.ts` 同式)——开启同步**不会削弱显式 known**。
   - `DefaultParams`(T1-C):确定性逐事件更新,克隆 `word-memory.ts` 常量(`SEEN_STABILITY_GROWTH=1.6`、`KNOWN_STABILITY=180`、`UNKNOWN_STABILITY=0.5` 等),冷启动 server recall ≈ 本地 recall。`modelVersion = "fsrs-default-v1"`。
   - `TrainedParams`(T1-D):`half-life = 2^(θ·[1, ln(1+seen), correct_frac])`,梯度下降在显式反馈事件上最小化交叉熵(`known/skip`→label 1,`unknown/addToVocab/reveal`→label 0,零间隔的首事件不带遗忘信号被剔除)。训练后 `modelVersion` 翻为 `"hlr-v1"`,recall 改用拟合权重。
6. **冷启动安全**(对应 §8 开放问题 2):显式反馈样本 < `ANNHUB_MIN_EVENTS_TO_TRAIN`(默认 20)时 `train` 返回 `trained:false` 并保留默认模型(零惊喜),recall 继续走 FSRS 默认参数。
7. **顺序无关**(§3.1):`compute_snapshot` 总按 `(ts, event_id)` 重排事件回放,不依赖调用方传入顺序。
8. **身份范围**:recall/训练按请求 `deviceId` 匿名聚合。真正的跨设备 `accountId` 合并是已记录的下一步(§8),不改契约,只改传给 `pick_params` 的 scope key。
9. **触发训练**:`POST /v1/memory/train?deviceId=`(admin,同 bearer 鉴权)或 CLI `python -m annhub_memory.runner train --device …`(周期性拟合由运维侧 cron/调度器编排,服务本身无状态可水平扩展)。

---

## 8. 开放问题(实现前需定)

- ~~服务端选型:Serverless(Cloudflare Workers + D1/KV)vs Node+Postgres vs 蹭欧路同步。~~ **已决策(T1-C):Python + FastAPI + SQLite(`server/`);契约无关。** 横向写扩展时换 `store.py` 为 Postgres 即可。
- 训练频率与冷启动:新用户无历史时,`/recall` 回退 FSRS 默认参数 or 直接不覆盖(用本地)?**已实现:样本不足 `MIN_EVENTS_TO_TRAIN` 时保留默认 FSRS 参数(零惊喜);recall 永远覆盖本地(本地按 TTL + dsr.stability 自衰减)。**
- `domain` 标签来源:复用 S2 的领域信号还是独立分类器?粒度多粗才不泄露隐私?
- 计费边界:免费档(纯本地 S1–S4)vs 订阅档(跨设备 + 训练模型 + 报告)的功能切分。
