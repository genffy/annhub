import { defineMessages } from './define'

/** Capture window and its close dialog (extension.md §4, §8). Per-kind forms live in `./detail.ts`. */
export const capture = defineMessages({
  // Steps (processing.md §2)
  'capture.step.interpret': { zh: '理解', en: 'Understand' },
  'capture.step.verify': { zh: '核验', en: 'Verify' },
  'capture.step.apply': { zh: '应用', en: 'Apply' },
  'capture.step.deepOnly': { zh: '（深度模式）', en: ' (deep mode)' },
  'capture.steps.aria': { zh: '步骤', en: 'Steps' },

  // Per-kind prompts (kinds.md §4 采集提问)
  'capture.prompt.excerpt.interpret': { zh: '为什么这段话值得保留？', en: 'Why is this passage worth keeping?' },
  'capture.prompt.excerpt.apply': { zh: '你准备在哪个任务中引用或使用？', en: 'In which task will you cite or use it?' },
  'capture.prompt.excerpt.verifyHint': { zh: '回看原文和语境', en: 'Re-read the original and its context' },
  'capture.prompt.concept.interpret': { zh: '用自己的话解释它', en: 'Explain it in your own words' },
  'capture.prompt.concept.apply': { zh: '它可以解释你当前哪个问题？', en: 'Which of your current questions can it explain?' },
  'capture.prompt.concept.verifyHint': { zh: '对照定义、边界和示例', en: 'Check the definition, boundaries and examples' },
  'capture.prompt.claim.interpret': { zh: '你目前赞同吗？为什么？', en: 'Do you agree for now? Why?' },
  'capture.prompt.claim.apply': { zh: '你会用它支持、质疑或修正什么判断？', en: 'Which judgment will you support, challenge or revise with it?' },
  'capture.prompt.claim.verifyHint': { zh: '检查证据和反例', en: 'Check the evidence and counterexamples' },
  'capture.prompt.procedure.interpret': { zh: '先写出你记得的步骤', en: 'Write down the steps you remember first' },
  'capture.prompt.procedure.apply': { zh: '你准备在哪个任务中执行？', en: 'In which task will you carry it out?' },
  'capture.prompt.procedure.verifyHint': { zh: '对照完整流程与适用条件', en: 'Check the full procedure and its preconditions' },
  'capture.prompt.decision.interpret': { zh: '推断做出该决定的约束', en: 'Infer the constraints behind the decision' },
  'capture.prompt.decision.apply': { zh: '以后用什么信号验证它？', en: 'What signal will verify it later?' },
  'capture.prompt.decision.verifyHint': { zh: '核对背景、备选项和后果', en: 'Check the background, alternatives and consequences' },
  'capture.prompt.question.interpret': { zh: '你当前的假设是什么？', en: 'What is your current hypothesis?' },
  'capture.prompt.question.apply': { zh: '下一步如何验证？', en: 'How will you verify it next?' },
  'capture.prompt.question.verifyHint': { zh: '整理已知证据和未知项', en: 'Sort out the known evidence and the unknowns' },
  'capture.prompt.inspiration.interpret': { zh: '这个想法从何而来？', en: 'Where did this idea come from?' },
  'capture.prompt.inspiration.apply': { zh: '准备在哪篇文章、哪个问题或下次思考中继续？', en: 'In which article, problem or later thinking will you continue it?' },
  'capture.prompt.inspiration.verifyHint': { zh: '区分观察、推测与反例', en: 'Separate observation, speculation and counterexamples' },

  // Window
  'capture.newInspiration': { zh: '新建灵感', en: 'New inspiration' },
  'capture.aria.window': { zh: '{title}，{kind}，当前步骤：{step}', en: '{title}, {kind}, current step: {step}' },
  'capture.closeButton.title': { zh: '关闭 (Esc)', en: 'Close (Esc)' },
  'capture.backToSource': { zh: '回到原文', en: 'Back to source' },
  'capture.backToSource.inPage': { zh: '收起窗口并回到页面中的选区', en: 'Collapse the window and go back to the selection on the page' },
  'capture.backToSource.newTab': { zh: '在新标签页打开来源', en: 'Open the source in a new tab' },
  'capture.mode.toStandard': { zh: '→ 标准模式', en: '→ Standard mode' },
  'capture.mode.toDeep': { zh: '→ 深度模式', en: '→ Deep mode' },
  'capture.mode.hint': { zh: '深度模式是全局偏好，单次可临时切换', en: 'Deep mode is a global preference; you can switch it for this capture only' },
  'capture.label.idea': { zh: '你的想法（必填）', en: 'Your idea (required)' },
  'capture.label.content': { zh: '内容（可修正）', en: 'Content (editable)' },
  'capture.label.context': { zh: '上下文（可编辑，需包含内容）', en: 'Context (editable, must contain the content)' },
  'capture.label.kind': { zh: '类型', en: 'Kind' },
  'capture.restored': { zh: '已恢复上次未提交的草稿（仅本浏览器会话内）', en: 'Restored the unsaved draft from earlier (this browser session only)' },

  // Understand step
  'capture.interpret.placeholder': { zh: '写下当前的解释、判断或问题（可留空）', en: 'Write your current explanation, judgment or question (optional)' },

  // Verify step
  'capture.verify.background': { zh: '触发背景（区分观察与推测）', en: 'Trigger background (separate observation from speculation)' },
  'capture.verify.backgroundPlaceholder': { zh: '什么触发了这个想法？（必填）', en: 'What triggered this idea? (required)' },
  'capture.verify.yourGuessInline': { zh: '你的理解：{guess}', en: 'Your understanding: {guess}' },
  'capture.verify.yourGuess': { zh: '你的理解', en: 'Your understanding' },
  'capture.verify.context': { zh: '来源语境', en: 'Source context' },
  'capture.verify.addSummary': { zh: '＋ 摘要（可选）', en: '+ Summary (optional)' },
  'capture.verify.addNotes': { zh: '＋ 备注（可选）', en: '+ Notes (optional)' },
  'capture.verify.summary': { zh: '摘要（可选）', en: 'Summary (optional)' },
  'capture.verify.summaryPlaceholder': { zh: '核对后的结论；仅确认原文时可留空', en: 'The conclusion after checking; leave empty if you only confirmed the original' },
  'capture.verify.notes': { zh: '备注（可选）', en: 'Notes (optional)' },
  'capture.verify.confirm': { zh: '确认已核对', en: 'Confirm checked' },
  'capture.verify.source': { zh: '核验来源：', en: 'Verified against:' },
  'capture.verify.source.original': { zh: '原文', en: 'Source' },
  'capture.verify.source.manual': { zh: '手工', en: 'Manual' },
  'capture.verified.source-material': { zh: '原文材料', en: 'source material' },
  'capture.verified.llm': { zh: 'LLM', en: 'LLM' },
  'capture.verified.manual': { zh: '手工核对', en: 'manual check' },
  'capture.verified.note': {
    zh: '已确认核对（{source}，{time}）。修改内容、语境、来源、类型或核验来源后需重新确认。',
    en: 'Confirmed ({source}, {time}). Editing the content, context, source, kind or verification source requires confirming again.',
  },

  // Apply step and validation (hard gate)
  'capture.apply.placeholder': { zh: '写下准备如何使用、验证或迁移（必填）', en: 'Write how you plan to use, verify or transfer it (required)' },
  'capture.tags.placeholder': { zh: '标签（逗号分隔，可选）', en: 'Tags (comma separated, optional)' },
  'capture.use.empty': { zh: '应用不能为空', en: '“Apply” cannot be empty' },
  'capture.use.repeatsContent': { zh: '应用不能只复述原文', en: '“Apply” cannot just repeat the original text' },
  'capture.use.repeatsContext': { zh: '应用不能照抄上下文', en: '“Apply” cannot copy the context' },

  // Save and failure (processing.md §6, extension.md §8)
  'capture.duplicate': {
    zh: '已保存过相同内容（同语境，{date}）。仍要保存为新记录吗？',
    en: 'The same content with the same context was already saved ({date}). Save it as a new record anyway?',
  },
  'capture.duplicate.force': { zh: '仍要保存', en: 'Save anyway' },
  'capture.saveFailed': { zh: '保存失败：{error}。输入已保留，窗口不会关闭。', en: 'Save failed: {error}. Your input is kept and the window stays open.' },
  'capture.error.saveFailed': { zh: '保存失败', en: 'Save failed' },
  'capture.error.quota': { zh: '本地存储空间不足', en: 'Not enough local storage' },
  'capture.error.assetMissing': { zh: '关联的图片已不在本地库', en: 'The linked image is no longer in the local library' },
  'capture.copyInput': { zh: '复制我的输入', en: 'Copy my input' },
  'capture.copied': { zh: '已复制到剪贴板。', en: 'Copied to the clipboard.' },
  'capture.copyFailed': { zh: '复制失败，请手动选中文字复制。', en: 'Copy failed — select the text and copy it by hand.' },
  'capture.exportContent': { zh: '导出内容', en: 'Export content' },
  'capture.asHighlight': { zh: '改存为高亮', en: 'Save as highlight' },
  'capture.asClip': { zh: '改存为剪藏', en: 'Save as clip' },

  // Footer
  'capture.alsoHighlight': { zh: '同时高亮原文', en: 'Also highlight the source' },
  'capture.back': { zh: '返回', en: 'Back' },
  'capture.next': { zh: '下一步', en: 'Next' },
  'capture.saving': { zh: '保存中…', en: 'Saving…' },
  'capture.saveToLibrary': { zh: '保存到碎片库', en: 'Save to Fragment library' },

  // Success, fallback and collapsed states (extension PRD §4.7)
  'capture.saved': { zh: '已保存为「{kind}」', en: 'Saved as “{kind}”' },
  'capture.highlightFailed': { zh: '碎片已保存，但创建高亮失败。', en: 'The Fragment was saved, but creating the highlight failed.' },
  'capture.retryHighlight': { zh: '重试高亮', en: 'Retry highlight' },
  'capture.viewInLibrary': { zh: '在碎片库查看', en: 'View in the Fragment library' },
  'capture.keepReading': { zh: '继续阅读', en: 'Keep reading' },
  'capture.exit.highlightDone': { zh: '已改存为高亮，输入已作为备注保留', en: 'Saved as a highlight; your input was kept as the note' },
  'capture.exit.clipDone': { zh: '已改存为剪藏，输入已作为备注保留', en: 'Saved as a clip; your input was kept as the note' },
  'capture.exit.highlightFailed': { zh: '改存为高亮失败，输入仍然保留，可继续编辑或重试。', en: 'Saving as a highlight failed. Your input is kept; keep editing or try again.' },
  'capture.exit.clipFailed': { zh: '改存为剪藏失败，输入仍然保留，可继续编辑或重试。', en: 'Saving as a clip failed. Your input is kept; keep editing or try again.' },
  'capture.collapsed.aria': { zh: '采集窗口已收起', en: 'Capture window collapsed' },
  'capture.collapsed.text': { zh: '已回到原文 · 已填写的内容都保留着', en: 'Back at the source · everything you typed is kept' },
  'capture.collapsed.expand': { zh: '展开', en: 'Expand' },

  // Close dialog (extension.md §4.1)
  'capture.closeDialog.title': { zh: '放弃已填写的内容？', en: 'Discard what you typed?' },
  'capture.closeDialog.hintFallback': {
    zh: '也可以把这段内容改存为高亮或剪藏，已填写的文字会作为备注保留。',
    en: 'You can also save this passage as a highlight or a clip; what you typed is kept as the note.',
  },
  'capture.closeDialog.hintLost': { zh: '已填写的内容关闭后将无法恢复。', en: 'What you typed cannot be recovered once the window is closed.' },
  'capture.closeDialog.continue': { zh: '继续编辑', en: 'Keep editing' },
  'capture.closeDialog.discard': { zh: '放弃', en: 'Discard' },

  // Text handed back to the user: the note of a 改存 and the copied input (labels, one per line)
  'capture.line': { zh: '{label}：{value}', en: '{label}: {value}' },
  'capture.note.guess': { zh: '理解', en: 'Understanding' },
  'capture.note.summary': { zh: '核验摘要', en: 'Verification summary' },
  'capture.note.notes': { zh: '核验备注', en: 'Verification notes' },
  'capture.note.use': { zh: '应用', en: 'Apply' },
  'capture.note.tags': { zh: '标签', en: 'Tags' },
  'capture.copy.kind': { zh: '类型', en: 'Kind' },
  'capture.copy.content': { zh: '内容', en: 'Content' },
  'capture.copy.context': { zh: '上下文', en: 'Context' },
  'capture.copy.source': { zh: '来源', en: 'Source' },
  'capture.copy.sourceWithTitle': { zh: '{title}（{url}）', en: '{title} ({url})' },
})
