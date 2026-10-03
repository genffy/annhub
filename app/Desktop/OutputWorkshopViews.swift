// 输出工坊 (R2.1, desktop.md §6): three creation entries — (a) 主入口 from a
// real task text with reverse recommendation, (b) 碎片库 multi-select (sheet
// lives in LibraryView), (c) 今日页 suggestion (TodayView). Editor: left
// targets (collapsible), middle plain-text editor with debounced draft
// autosave, right inspector with presence clues + user confirmations +
// completeness badge + optional LLM feedback. After submit: the three clearly
// labeled feedback layers and the one-click question-Fragment bridge.

import SwiftUI
import AnnHubCore

// ── 输出工坊 main page ────────────────────────────────────────────────────

struct OutputWorkshopView: View {
    @EnvironmentObject var model: DesktopModel
    @State private var taskText = ""
    @State private var recommendations: [TaskRecommendation] = []
    @State private var checked: Set<String> = []
    @State private var createSheet = false
    @State private var editorTaskId: String?

    var body: some View {
        VStack(spacing: 0) {
            creationEntry
            Divider()
            historyList
        }
        .sheet(isPresented: $createSheet) {
            TaskCreationSheet(title: "从碎片库创建输出任务", defaultFragmentIds: [], allowRecommendation: false)
                .frame(minWidth: 520, minHeight: 420)
                .environmentObject(model)
        }
        .sheet(item: Binding(
            get: { editorTaskId.flatMap { id in model.writingTasks.first { $0.id == id } } },
            set: { editorTaskId = $0?.id }
        )) { task in
            WritingEditorSheet(taskId: task.id)
                .frame(minWidth: 980, minHeight: 620)
                .environmentObject(model)
        }
    }

    // 主入口 (desktop.md §6.1 entry 3): the user's real task text is the query.
    private var creationEntry: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("从当前真实任务开始").font(.headline)
                    Text("输入你正在写的任务，系统推荐合适的碎片（到期、从未应用、已确认关系优先）。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                Button("从碎片库多选创建") { createSheet = true }
            }
            HStack(spacing: 8) {
                TextField("例如：写一段关于利率传导机制的简报", text: $taskText)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(generateRecommendations)
                Button("推荐碎片", action: generateRecommendations)
                    .buttonStyle(.borderedProminent)
                    .disabled(taskText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if !recommendations.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("推荐结果（勾选后创建）").font(.subheadline.bold()).foregroundStyle(.secondary)
                    ScrollView {
                        VStack(spacing: 6) {
                            ForEach(recommendations) { item in
                                HStack(alignment: .top) {
                                    Toggle("", isOn: Binding(
                                        get: { checked.contains(item.fragment.id) },
                                        set: { on in
                                            if on { checked.insert(item.fragment.id) } else { checked.remove(item.fragment.id) }
                                        }
                                    ))
                                    .labelsHidden()
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.fragment.content).font(.callout)
                                        Text(item.reason).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(item.fragment.kind)
                                        .font(.caption2)
                                        .padding(.horizontal, 6).padding(.vertical, 2)
                                        .background(Color.accentColor.opacity(0.15), in: Capsule())
                                }
                                .padding(8)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                    .frame(maxHeight: 220)
                    HStack {
                        Text("已选 \(checked.count) 个碎片").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Picker("任务类型", selection: $selectedCreationType) {
                            ForEach(writingTaskTypes, id: \.self) { type in
                                Text(TASK_TEMPLATES[type]?.label ?? type).tag(type)
                            }
                        }
                        .frame(width: 120)
                        Button("创建输出任务") {
                            createFromRecommendations()
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(checked.isEmpty)
                    }
                }
            } else if model.fragments.isEmpty {
                Text("还没有碎片可用；先在扩展里采集，或从碎片库开始。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(12)
    }

    @State private var selectedCreationType = "article"

    private func generateRecommendations() {
        recommendations = model.recommendForTask(taskText)
        checked = Set(recommendations.prefix(3).map(\.fragment.id))
    }

    private func createFromRecommendations() {
        let ids = Array(checked)
        guard let task = model.createWritingTask(
            type: selectedCreationType, topic: taskText, fragmentIds: ids
        ) else { return }
        recommendations = []
        checked = []
        editorTaskId = task.id
    }

    // 历史任务 (desktop.md §6): status badges completed/pending/partial.
    private var historyList: some View {
        List {
            Section("任务历史") {
                if model.writingTasks.isEmpty {
                    Text("还没有输出任务。从上方真实任务或碎片库创建。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    ForEach(model.writingTasks) { task in
                        Button {
                            openTask(task)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(task.prompt).lineLimit(1)
                                    HStack(spacing: 6) {
                                        Text(TASK_TEMPLATES[task.taskType]?.label ?? task.taskType)
                                            .font(.caption)
                                        Text("目标 \(task.fragmentIds.count) · 版本 \(task.submissions.count)")
                                            .font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                statusBadge(task)
                                Image(systemName: "chevron.right")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.inset)
    }

    @ViewBuilder
    private func statusBadge(_ task: WritingTaskRecord) -> some View {
        let status = taskStatus(task)
        let (label, color): (String, Color) = {
            guard status.completed else { return ("进行中", .secondary) }
            switch status.completeness {
            case .complete: return ("反馈完整", .green)
            case .partial: return ("反馈待补", .orange)
            case .pending: return ("待反馈", .orange)
            }
        }()
        Text(label)
            .font(.caption)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color == .secondary ? .secondary : color)
    }

    private func openTask(_ task: WritingTaskRecord) {
        // Drafting tasks open the editor; submitted tasks open directly into
        // the layered feedback view (same sheet switches internally).
        editorTaskId = task.id
    }
}

// ── creation sheet (library multi-select entry) ──────────────────────────

struct TaskCreationSheet: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss
    let title: String
    let defaultFragmentIds: [String]
    let allowRecommendation: Bool

    @State private var taskType = "article"
    @State private var topic = ""
    @State private var search = ""
    @State private var selected: Set<String> = []

    private var results: [FragmentRecord] {
        let query = FragmentQuery(search: search.isEmpty ? nil : search, limit: 50)
        return runFragmentQuery(model.fragments, query: query).items
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            HStack(spacing: 10) {
                Picker("类型", selection: $taskType) {
                    ForEach(writingTaskTypes, id: \.self) { type in
                        Text(TASK_TEMPLATES[type]?.label ?? type).tag(type)
                    }
                }
                .frame(width: 120)
                TextField("主题（可留空）", text: $topic)
                    .textFieldStyle(.roundedBorder)
            }
            if let template = TASK_TEMPLATES[taskType] {
                Text("模板：\(template.prompt) · 约束：\(template.constraints.joined(separator: "；")) · 适合：\(template.fits)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            TextField("搜索碎片", text: $search).textFieldStyle(.roundedBorder)
            List(results) { fragment in
                HStack {
                    Toggle("", isOn: Binding(
                        get: { selected.contains(fragment.id) },
                        set: { on in
                            if on { selected.insert(fragment.id) } else { selected.remove(fragment.id) }
                        }
                    ))
                    .labelsHidden()
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fragment.content).lineLimit(1)
                        Text("\(fragment.kind) · \(fragment.context.sourceHost)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if defaultFragmentIds.contains(fragment.id) {
                        Image(systemName: "checkmark.circle").foregroundStyle(.green)
                    }
                }
            }
            .listStyle(.plain)
            .frame(minHeight: 220)
            HStack {
                Text("已选 \(selected.count)").font(.caption)
                Spacer()
                Button("取消") { dismiss() }
                Button("创建") { create() }
                    .buttonStyle(.borderedProminent)
                    .disabled(selected.isEmpty)
            }
        }
        .padding(16)
        .onAppear { selected = Set(defaultFragmentIds.filter(existing)) }
    }

    private func existing(_ id: String) -> Bool {
        model.fragments.contains { $0.id == id }
    }

    private func create() {
        let ids = selected.filter(existing)
        guard let task = model.createWritingTask(type: taskType, topic: topic, fragmentIds: Array(ids)) else {
            return
        }
        dismiss()
        // The workshop list shows the new task; opening the editor happens
        // from its history row (keeps the sheet flow simple).
        _ = task
    }
}

// ── editor + feedback (three-pane, desktop.md §6.3/§6.4) ─────────────────

/// Tri-state correctness (output.md §5): 未定(nil) / 正确(true) / 有偏差(false).
/// Unknown is never coerced to false — the user can always return to 未定.
enum CorrectChoice: String, CaseIterable, Hashable {
    case undecided, correct, biased

    var label: String {
        switch self {
        case .undecided: return "未定"
        case .correct: return "正确"
        case .biased: return "有偏差"
        }
    }

    var boolValue: Bool? {
        switch self {
        case .undecided: return nil
        case .correct: return true
        case .biased: return false
        }
    }

    static func from(_ value: Bool?) -> CorrectChoice {
        switch value {
        case .none: return .undecided
        case .some(true): return .correct
        case .some(false): return .biased
        }
    }
}

/// One target slot of a writing task: deleted fragments stay visible as nil
/// (storage.md §10) so their 待确认 state remains intact.
struct TargetSlot: Identifiable {
    let id: String
    let fragment: FragmentRecord?
}

struct WritingEditorSheet: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss
    let taskId: String

    @State private var draft = ""
    @State private var targetsCollapsed = false
    @State private var usedStates: [String: Bool] = [:]
    @State private var correctStates: [String: CorrectChoice] = [:]
    @State private var feedbackTexts: [String: String] = [:]
    @State private var confirmSubmit = false
    @State private var llmStatus: String?
    @State private var requestingLlm = false
    @State private var createdQuestions: Set<String> = []
    @State private var loaded = false
    /// ai.md §5: LLM 反馈 first opens the pre-send preview; only 确认发送
    /// performs the HTTP call.
    @State private var llmPreviewSheet = false

    private var task: WritingTaskRecord? {
        model.writingTasks.first { $0.id == taskId }
    }

    private var submitted: Bool {
        (task?.submissions.isEmpty == false)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if submitted, let task {
                FeedbackLayersView(
                    task: task,
                    usedStates: $usedStates,
                    correctStates: $correctStates,
                    feedbackTexts: $feedbackTexts,
                    createdQuestions: $createdQuestions,
                    llmStatus: $llmStatus,
                    requestingLlm: $requestingLlm,
                    onConfirm: confirmPending,
                    onLlmFeedback: { llmPreviewSheet = true },
                    onCreateQuestion: createQuestion
                )
            } else {
                editorPanes
            }
        }
        .frame(minWidth: 980, minHeight: 620)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            draft = task?.draftContent ?? ""
            loadExistingConfirmations()
        }
        .onDisappear {
            // output.md §4: flush the pending debounce synchronously on
            // dismiss — typed text must not wait for (or lose to) the timer.
            model.flushDraftOnDismiss(taskId: taskId, content: draft)
        }
        .confirmationDialog(
            "提交后追加不可变版本，草稿将清空。确认提交？",
            isPresented: $confirmSubmit,
            titleVisibility: .visible
        ) {
            Button("提交正文") { submit() }
            Button("取消", role: .cancel) {}
        }
        .sheet(isPresented: $llmPreviewSheet) {
            LlmFeedbackPreviewSheet(
                preview: model.llmFeedbackPreview(taskId: taskId),
                onConfirm: {
                    llmPreviewSheet = false
                    requestLlm()
                }
            )
            .frame(minWidth: 560, minHeight: 440)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(task?.prompt ?? "").font(.headline).lineLimit(1)
                if let task {
                    Text("约束：\(task.constraints.joined(separator: "；"))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let completeness = task.map(AnnHubCore.feedbackCompleteness), submitted {
                Text(completenessLabel(completeness))
                    .font(.caption)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.accentColor.opacity(0.15), in: Capsule())
            }
            if submitted {
                Button("关闭") { dismiss() }
            } else {
                Button("提交…") { confirmSubmit = true }
                    .buttonStyle(.borderedProminent)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                Button("关闭") { dismiss() }
            }
        }
        .padding(12)
    }

    private func completenessLabel(_ completeness: FeedbackCompleteness) -> String {
        switch completeness {
        case .complete: return "反馈完整"
        case .partial: return "反馈待补"
        case .pending: return "待反馈"
        }
    }

    // 左：目标碎片（可折叠，已删除占位）；中：编辑器；右：inspector (desktop.md §6.3)。
    private var editorPanes: some View {
        HStack(alignment: .top, spacing: 0) {
            // 左侧：目标碎片，可折叠
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("目标碎片").font(.subheadline.bold())
                    Spacer()
                    Button(targetsCollapsed ? "展开" : "折叠") { targetsCollapsed.toggle() }
                        .controlSize(.small)
                }
                .padding(8)
                if !targetsCollapsed {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(targetSlots) { slot in
                                if let fragment = slot.fragment {
                                    targetCard(fragment)
                                } else {
                                    deletedTargetCard(slot.id)
                                }
                            }
                        }
                        .padding(.horizontal, 8)
                    }
                }
            }
            .frame(width: 280)
            Divider()

            // 中间：纯文本编辑器，草稿防抖自动保存
            VStack(spacing: 0) {
                TextEditor(text: $draft)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .padding(12)
                    .onChange(of: draft) { _, newValue in
                        model.autosaveDraft(taskId: taskId, content: newValue)
                    }
                HStack {
                    Text("\(draftWordCount) 字").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text("草稿自动保存")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
            }
            Divider()

            // 右侧：inspector — 实时命中提示 + 逐碎片确认行
            InspectorPane(
                slots: targetSlots,
                draft: draft,
                usedStates: $usedStates,
                correctStates: $correctStates,
                feedbackTexts: $feedbackTexts,
                onConfirm: confirmPending
            )
            .frame(width: 320)
        }
    }

    /// Task-order target slots; deleted fragments stay as nil placeholders
    /// (storage.md §10).
    private var targetSlots: [TargetSlot] {
        guard let task else { return [] }
        return zip(task.fragmentIds, model.taskFragmentSlots(task)).map {
            TargetSlot(id: $0, fragment: $1)
        }
    }

    private var draftWordCount: Int {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? 0 : trimmed.split(whereSeparator: { $0.isWhitespace }).count
    }

    @ViewBuilder
    private func targetCard(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(fragment.content).font(.callout)
            HStack(spacing: 6) {
                Text(fragment.kind).font(.caption2)
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Color.accentColor.opacity(0.15), in: Capsule())
                // 实时提示只说「可能已使用」，不宣称正确 (desktop.md §6.3)。
                if presenceClue(fragmentContent: fragment.content, in: draft) {
                    Text("可能已使用").font(.caption2).foregroundStyle(.green)
                }
            }
        }
        .padding(8)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
    }

    /// storage.md §10: locally deleted targets stay visible as 已删除碎片.
    private func deletedTargetCard(_ fragmentId: String) -> some View {
        HStack {
            Label("已删除碎片", systemImage: "trash")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(String(fragmentId.suffix(8)))
                .font(.caption2).foregroundStyle(.tertiary)
                .lineLimit(1)
        }
        .padding(8)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
    }

    // ── actions ──────────────────────────────────────────────────────────

    private func loadExistingConfirmations() {
        guard let last = task?.submissions.last else { return }
        for assessment in last.assessments {
            usedStates[assessment.fragmentId] = assessment.used
            correctStates[assessment.fragmentId] = CorrectChoice.from(assessment.correct)
            if let feedback = assessment.feedback { feedbackTexts[assessment.fragmentId] = feedback }
        }
    }

    private func pendingConfirmations() -> [AssessmentConfirmation] {
        usedStates.keys.map { id in
            AssessmentConfirmation(
                fragmentId: id,
                used: usedStates[id],
                correct: correctStates[id]?.boolValue,
                feedback: feedbackTexts[id]
            )
        }
    }

    private func confirmPending() {
        model.confirmFragmentUse(taskId: taskId, confirmations: pendingConfirmations())
    }

    private func submit() {
        // 提交 → 追加不可变版本 + 本地线索层 + writing.submitted 行。
        _ = model.submitTask(taskId: taskId, content: draft)
    }

    private func requestLlm() {
        requestingLlm = true
        Task {
            let status = await model.requestLlmFeedback(taskId: taskId)
            await MainActor.run {
                llmStatus = status
                requestingLlm = false
            }
        }
    }

    private func createQuestion(fragment: FragmentRecord, feedback: String) {
        guard let task else { return }
        if model.createQuestionFromFeedback(task: task, fragment: fragment, feedback: feedback) != nil {
            createdQuestions.insert(fragment.id)
        }
    }
}

// ── inspector (right pane) ───────────────────────────────────────────────

private struct InspectorPane: View {
    let slots: [TargetSlot]
    let draft: String
    @Binding var usedStates: [String: Bool]
    @Binding var correctStates: [String: CorrectChoice]
    @Binding var feedbackTexts: [String: String]
    let onConfirm: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("使用提示与反馈").font(.subheadline.bold())
                Text("文本命中只是线索，不等于正确使用；准确性未定就保持未定。")
                    .font(.caption2).foregroundStyle(.secondary)
                ForEach(slots) { slot in
                    VStack(alignment: .leading, spacing: 6) {
                        if let fragment = slot.fragment {
                            Text(fragment.content).font(.callout).lineLimit(2)
                            if presenceClue(fragmentContent: fragment.content, in: draft) {
                                Label("可能已使用", systemImage: "text.magnifyingglass")
                                    .font(.caption).foregroundStyle(.green)
                            } else {
                                Label("未检测到文本命中", systemImage: "circle.dashed")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } else {
                            Label("已删除碎片 · 确认状态保留", systemImage: "trash")
                                .font(.callout).foregroundStyle(.secondary)
                        }
                        Toggle("已使用", isOn: boolBinding($usedStates, slot.id))
                            .controlSize(.small)
                        // 三态：未定 / 正确 / 有偏差，可随时回到未定 (output.md §5)。
                        Picker("准确性", selection: choiceBinding(slot.id)) {
                            ForEach(CorrectChoice.allCases, id: \.self) { choice in
                                Text(choice.label).tag(choice)
                            }
                        }
                        .pickerStyle(.segmented)
                        .controlSize(.small)
                        TextField("反馈（可留空）", text: textBinding($feedbackTexts, slot.id))
                            .textFieldStyle(.roundedBorder)
                            .controlSize(.small)
                    }
                    .padding(8)
                    .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                }
                Button("保存确认") { onConfirm() }
                    .buttonStyle(.bordered)
                    .disabled(slots.isEmpty)
            }
            .padding(12)
        }
    }

    private func boolBinding(_ dict: Binding<[String: Bool]>, _ key: String) -> Binding<Bool> {
        Binding(
            get: { dict.wrappedValue[key] ?? false },
            set: { dict.wrappedValue[key] = $0 }
        )
    }

    private func choiceBinding(_ key: String) -> Binding<CorrectChoice> {
        Binding(
            get: { correctStates[key] ?? .undecided },
            set: { correctStates[key] = $0 }
        )
    }

    private func textBinding(_ dict: Binding<[String: String]>, _ key: String) -> Binding<String> {
        Binding(
            get: { dict.wrappedValue[key] ?? "" },
            set: { dict.wrappedValue[key] = $0 }
        )
    }
}

// ── LLM pre-send preview (ai.md §5) ──────────────────────────────────────

/// Clicking 「LLM 反馈」 first shows EXACTLY what will be sent; only
/// 确认发送 performs the HTTP call.
private struct LlmFeedbackPreviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    let preview: LlmFeedbackPreview?
    let onConfirm: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("发送前预览：将外发的内容").font(.headline)
            Text("仅发送以下内容；不发送复习记录、无关碎片或附件。")
                .font(.footnote).foregroundStyle(.secondary)
            Divider()
            if let preview {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        previewSection("任务提示", text: preview.taskPrompt)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("目标碎片（\(preview.targets.count) 条，仅内容与类型）")
                                .font(.subheadline.bold())
                            ForEach(preview.targets, id: \.fragmentId) { target in
                                HStack(alignment: .top) {
                                    Text(target.content).font(.callout)
                                    Spacer()
                                    Text(target.kind)
                                        .font(.caption2)
                                        .padding(.horizontal, 5).padding(.vertical, 1)
                                        .background(Color.accentColor.opacity(0.15), in: Capsule())
                                }
                                .padding(6)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
                            }
                        }
                        previewSection("本次正文", text: preview.submissionContent)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Text("没有可分析的提交版本。")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("确认发送") {
                    dismiss()
                    onConfirm()
                }
                .buttonStyle(.borderedProminent)
                .disabled(preview == nil)
            }
        }
        .padding(16)
    }

    @ViewBuilder
    private func previewSection(_ title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.bold())
            Text(text)
                .font(.callout)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 6))
        }
    }
}

// ── feedback view: three clearly labeled layers (desktop.md §6.4) ───────

private struct FeedbackLayersView: View {
    @EnvironmentObject var model: DesktopModel
    let task: WritingTaskRecord
    @Binding var usedStates: [String: Bool]
    @Binding var correctStates: [String: CorrectChoice]
    @Binding var feedbackTexts: [String: String]
    @Binding var createdQuestions: Set<String>
    @Binding var llmStatus: String?
    @Binding var requestingLlm: Bool
    let onConfirm: () -> Void
    let onLlmFeedback: () -> Void
    let onCreateQuestion: (FragmentRecord, String) -> Void

    private var lastSubmission: OutputSubmission? { task.submissions.last }
    /// Task-order slots; deleted fragments stay visible (storage.md §10).
    private var targetSlots: [TargetSlot] {
        zip(task.fragmentIds, model.taskFragmentSlots(task)).map {
            TargetSlot(id: $0, fragment: $1)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // 提交正文（不可变版本）
                VStack(alignment: .leading, spacing: 6) {
                    Text("已提交正文（\(task.submissions.count) 个版本，不可变）")
                        .font(.subheadline.bold())
                    Text(lastSubmission?.content ?? "")
                        .padding(10)
                        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
                    HStack {
                        Button("保存确认结果") { onConfirm() }
                        if model.llmSettings.isConfigured {
                            Button("LLM 反馈…") { onLlmFeedback() }
                                .disabled(requestingLlm)
                            if requestingLlm { ProgressView().controlSize(.small) }
                        }
                        if let status = llmStatus {
                            Text(status).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }

                // 任务级模型建议（overallFeedback / suggestedRevision，仅建议，
                // 从不自动确认任何内容 — ai.md 输出反馈 v2）
                if let last = lastSubmission,
                   last.overallFeedback != nil || last.suggestedRevision != nil {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("模型建议").font(.subheadline.bold())
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color.purple.opacity(0.12), in: Capsule())
                        if let overall = last.overallFeedback, !overall.isEmpty {
                            LabeledContent("整体反馈") {
                                Text(overall)
                            }
                            .font(.callout)
                        }
                        if let revision = last.suggestedRevision, !revision.isEmpty {
                            LabeledContent("修改建议") {
                                Text(revision)
                            }
                            .font(.callout)
                        }
                        Text("仅为模型建议，不会自动确认任何使用或正确性。")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                    .padding(12)
                    .background(Color.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                }

                ForEach(targetSlots) { slot in
                    if let fragment = slot.fragment {
                        fragmentCard(fragment)
                    } else {
                        deletedFragmentCard(slot.id)
                    }
                }
            }
            .padding(16)
        }
    }

    /// storage.md §10: deleted target fragments still appear, 已删除碎片,
    /// with their 待确认 state intact.
    private func deletedFragmentCard(_ fragmentId: String) -> some View {
        let manual = lastSubmission?.assessments.first {
            $0.fragmentId == fragmentId && $0.source == "manual"
        }
        return VStack(alignment: .leading, spacing: 8) {
            Label("已删除碎片", systemImage: "trash")
                .font(.callout.bold())
                .foregroundStyle(.secondary)
            Text(String(fragmentId.suffix(12)))
                .font(.caption2).foregroundStyle(.tertiary)
            VStack(alignment: .leading, spacing: 6) {
                Text("用户确认").font(.caption.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.green.opacity(0.12), in: Capsule())
                if let manual, manual.confirmedByUser == true {
                    HStack(spacing: 10) {
                        Text(manual.used == true ? "已使用" : manual.used == false ? "未使用" : "使用状态未填")
                        Text(manual.correct == true ? "准确" : manual.correct == false ? "不准确" : "准确性未知")
                        if let feedback = manual.feedback, !feedback.isEmpty {
                            Text("“\(feedback)”").foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption)
                } else {
                    Text("待确认").font(.caption).foregroundStyle(.orange)
                }
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func fragmentCard(_ fragment: FragmentRecord) -> some View {
        let local = lastSubmission?.assessments.first {
            $0.fragmentId == fragment.id && $0.source == "local"
        }
        let manual = lastSubmission?.assessments.first {
            $0.fragmentId == fragment.id && $0.source == "manual"
        }
        let llm = lastSubmission?.assessments.first {
            $0.fragmentId == fragment.id && $0.source == "llm"
        }

        VStack(alignment: .leading, spacing: 8) {
            Text(fragment.content).font(.callout.bold())

            // 第一层：本地线索
            HStack(spacing: 6) {
                Text("本地线索").font(.caption.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.blue.opacity(0.12), in: Capsule())
                if local?.presence == true {
                    Text("可能已使用（文本命中）").font(.caption).foregroundStyle(.secondary)
                } else {
                    Text("未检测到文本命中（不等于未使用）").font(.caption).foregroundStyle(.secondary)
                }
            }

            // 第二层：用户确认
            VStack(alignment: .leading, spacing: 6) {
                Text("用户确认").font(.caption.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.green.opacity(0.12), in: Capsule())
                if let manual, manual.confirmedByUser == true {
                    HStack(spacing: 10) {
                        Text(manual.used == true ? "已使用" : manual.used == false ? "未使用" : "使用状态未填")
                        Text(manual.correct == true ? "正确" : manual.correct == false ? "有偏差" : "准确性未定")
                        if let feedback = manual.feedback, !feedback.isEmpty {
                            Text("“\(feedback)”").foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption)
                } else {
                    Text("待确认").font(.caption).foregroundStyle(.orange)
                }
                Toggle("已使用", isOn: boolBinding($usedStates, fragment.id))
                    .controlSize(.small)
                // 三态：未定 / 正确 / 有偏差，可随时回到未定 (output.md §5)。
                Picker("准确性", selection: choiceBinding(fragment.id)) {
                    ForEach(CorrectChoice.allCases, id: \.self) { choice in
                        Text(choice.label).tag(choice)
                    }
                }
                .pickerStyle(.segmented)
                .controlSize(.small)
                TextField("补充反馈（用于确认或生成问题碎片）", text: textBinding($feedbackTexts, fragment.id))
                    .textFieldStyle(.roundedBorder)
                    .controlSize(.small)
            }

            // 第三层：模型建议（可选）
            VStack(alignment: .leading, spacing: 4) {
                Text("模型建议").font(.caption.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.purple.opacity(0.12), in: Capsule())
                if let llm {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("used: \(llm.used.map { $0 ? "是" : "否" } ?? "未知") · correct: \(llm.correct.map { $0 ? "是" : "否" } ?? "未知")")
                        if let suggestion = llm.suggestion, !suggestion.isEmpty {
                            Text(suggestion).foregroundStyle(.secondary)
                        }
                        Text("模型 \(llm.modelId ?? "?") · prompt \(llm.promptVersion ?? "?") · 待你确认")
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                    .font(.caption)
                } else {
                    Text(model.llmSettings.isConfigured ? "尚未请求或无建议" : "未启用（保持待确认）")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // 从反馈创建 question Fragment (R2.1)
            if createdQuestions.contains(fragment.id) {
                Label("已创建问题碎片", systemImage: "checkmark.circle")
                    .font(.caption).foregroundStyle(.green)
            } else {
                Button("从反馈创建问题碎片") {
                    let feedback = feedbackTexts[fragment.id]
                        ?? manual?.feedback
                        ?? local.map { _ in "" }
                        ?? ""
                    onCreateQuestion(fragment, feedback.isEmpty ? "使用反馈待补充" : feedback)
                }
                .controlSize(.small)
            }
        }
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))
    }

    private func boolBinding(_ dict: Binding<[String: Bool]>, _ key: String) -> Binding<Bool> {
        Binding(
            get: { dict.wrappedValue[key] ?? false },
            set: { dict.wrappedValue[key] = $0 }
        )
    }

    private func choiceBinding(_ key: String) -> Binding<CorrectChoice> {
        Binding(
            get: { correctStates[key] ?? .undecided },
            set: { correctStates[key] = $0 }
        )
    }

    private func textBinding(_ dict: Binding<[String: String]>, _ key: String) -> Binding<String> {
        Binding(
            get: { dict.wrappedValue[key] ?? "" },
            set: { dict.wrappedValue[key] = $0 }
        )
    }
}
