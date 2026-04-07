# 生词标注实现基线（已对齐代码）

更新时间：2026-04-07

本文档从“实施计划”切换为“当前实现基线 + review 结论”，仅描述仓库内已落地能力与已知风险。

## 1) 现状总览

- 生词标注主链路已打通：`options` 配置 -> `background` 同步词库/调 LLM -> `content` 宿主 DOM 标注 -> `words` 快照展示。
- 历史翻译链路已移除（`types/translate.ts`、旧 translation config/message 分支、对应 UI）。
- Vocabulary 服务已接入服务初始化体系，`wxt.config.ts` 已启用 `alarms` 权限，定时同步可用。
- 全量单测通过：`npm test` 结果 `146 passed (146)`。

## 2) 模块与职责

### Background

- `background-service/services/vocabulary/index.ts`
  - 配置读写：`getVocabConfig/setVocabConfig`、`getLlmConfig/setLlmConfig`
  - 欧路同步：`syncFromEudic`（写入 `vocabSnapshot` 与 `vocabSyncState`）
  - 定时任务：`chrome.alarms`，任务名 `vocab-sync`
  - 释义解析：`resolveGloss`（`exp -> cache -> llm`）
- `background-service/services/vocabulary/message-handles.ts`
  - 对外消息：`GET/SET_VOCAB_CONFIG`、`GET/SET_LLM_CONFIG`、`GET_VOCAB_SNAPSHOT`、`REFRESH_VOCAB`、`CONTEXT_GLOSS`
- `background-service/services/llm/*`
  - `ILlmClient` 接口
  - `OpenAICompatibleLlmService`：自动拼接 endpoint（已带 `/vN` 不补 `/v1`）
  - `createLlmClient` 工厂（当前仅 `openai-compatible`）
- `background-service/service-context.ts` + `service-manager.ts`
  - 已改为注册服务集合判定 ready，已移除 `translation` 槽位
  - `initOrder` 当前为 `config -> highlight -> vocabulary`

### Content

- `entrypoints/content/index.tsx`
  - Shadow UI 挂载后动态加载 `vocab-label`
- `entrypoints/content/vocab-label/index.ts`
  - 运行前检查：开关、域名白名单、英文页检测
  - 无快照时 fallback 空快照，支持 LLM-only 模式
  - 启动 `MutationObserver + debounce(1000ms)` 增量标注
- `entrypoints/content/vocab-label/annotate.ts`
  - TreeWalker 扫描文本节点
  - 两阶段标注：先收集与释义，再逆序 DOM 包裹，避免 offset 漂移
  - 规则：常见词跳过、熟练度阈值过滤、`maxAnnotations` 限流
  - 标记属性：`data-ann-vocab="1"`，支持 `cleanupAnnotations()`

### Options / Words

- `entrypoints/options/pages/VocabPage.tsx`
  - 配置项：开关、阈值、最大标注数、欧路 token、category ids、同步周期、域名白名单、LLM 参数
  - API key 安全策略：`GET_LLM_CONFIG` 不回传明文；保存时空 key 不覆盖已有值
- `entrypoints/words/App.tsx`
  - 仅读取 `chrome.storage.local` 中 `vocabSnapshot/vocabSyncState`，不再直连欧路 API

## 3) 数据契约（chrome.storage.local）

- `vocabConfig`
  - `enabled`
  - `eudicToken`
  - `eudicCategoryIds`
  - `masteryThreshold`
  - `syncPeriodMinutes`
  - `maxAnnotationsPerPage`
  - `domainWhitelist: { enabled, domains }`
- `llmConfig`
  - `provider: 'openai-compatible'`
  - `baseUrl`
  - `apiKey`
  - `model`
  - `maxTokens?`
  - `systemPrompt?`
- `vocabSnapshot`
  - `version`
  - `updatedAt`
  - `entries: Record<wordNorm, { proficiency, exp?, star? }>`
- `vocabSyncState`
  - `lastSyncAt`
  - `lastSyncStatus: 'ok' | 'error'`
  - `lastError?`
- `glossCache`
  - `Record<wordNorm:sentenceHash, { gloss, updatedAt }>`，TTL 7 天

## 4) 消息协议（已实现）

- `GET_VOCAB_CONFIG` / `SET_VOCAB_CONFIG`
- `GET_LLM_CONFIG` / `SET_LLM_CONFIG`
- `GET_VOCAB_SNAPSHOT`
- `REFRESH_VOCAB`
- `CONTEXT_GLOSS`

`types/messages.ts` 已移除旧 note/translation 消息。

## 5) 本轮 review 结论

### 已验证通过

- LLM endpoint 拼接逻辑与测试一致（`/vN` 与 `/v1` 两种路径都覆盖）。
- LLM 配置 merge 策略可避免空字符串覆盖 env 默认值。
- 标注引擎“同节点多词拆分”问题已通过逆序应用修复，并有回归测试。
- 无快照场景可运行 LLM-only 标注模式。
- 测试结果已复跑：`146/146` 全通过。

### 本轮新增修复（2026-04-07）

1. **已修复：`restartServices` 真重启语义**
   - 文件：`background-service/service-manager.ts`
   - 调整为 restart 前先执行各 service 的 `cleanup()`，再以 `forceReinitialize=true` 重新初始化（不再因 `isInitialized()` 跳过）。

2. **已修复：Vocabulary alarm listener 生命周期**
   - 文件：`background-service/services/vocabulary/index.ts`
   - 增加 `alarmListener` 引用管理：重复初始化前先移除旧 listener，`cleanup()` 中显式 `removeListener`。

## 6) 测试基线

- 当前测试文件：
  - `types/__tests__/vocabulary.test.ts`
  - `background-service/services/llm/__tests__/openai-compatible.test.ts`
  - `background-service/services/llm/__tests__/factory.test.ts`
  - `background-service/services/vocabulary/__tests__/vocabulary-config.test.ts`
  - `entrypoints/content/vocab-label/__tests__/annotate.test.ts`
- 本地复跑结果：`10 files, 146 tests, 146 passed`

## 7) 后续建议（可选，不阻塞当前版本）

- 为 `VocabPage` 增加 Eudic 分类拉取与选择组件，替代手工输入 category ids。
