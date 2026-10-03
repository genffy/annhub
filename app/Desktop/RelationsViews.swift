// 关系 (R2.2, desktop.md §7): three sections — 待确认建议 (rule-based
// suggestions with accept/modify/reject; rejection writes a suppression and
// the card disappears), 当前 Fragment 局部关系 (pick a fragment → its confirmed
// relations), 按主题筛选的关系列表 (tag filter). 建立关系 from a fragment detail
// lives in EstablishRelationSheet.

import SwiftUI
import AnnHubCore

// ── page ─────────────────────────────────────────────────────────────────

struct RelationsView: View {
    @EnvironmentObject var model: DesktopModel

    @State private var selectedFragmentId: String = ""
    @State private var tagFilter: String = ""
    @State private var modifying: RelationSuggestion?

    var body: some View {
        List {
            suggestionSection
            fragmentSection
            tagSection
        }
        .onAppear { model.reload() }
        .sheet(item: $modifying) { suggestion in
            ModifySuggestionSheet(suggestion: suggestion)
                .frame(minWidth: 480, minHeight: 320)
                .environmentObject(model)
        }
    }

    // ── 待确认建议 (desktop.md §7.3) ─────────────────────────────────────

    @ViewBuilder
    private var suggestionSection: some View {
        Section("待确认建议（\(model.relationSuggestions.count)）") {
            if model.relationSuggestions.isEmpty {
                Text("暂无待确认建议。建议基于共享标签、同来源与同类型生成。")
                    .font(.footnote).foregroundStyle(.secondary)
            } else {
                ForEach(model.relationSuggestions) { suggestion in
                    SuggestionCard(suggestion: suggestion) { modify in
                        modifying = modify
                    }
                }
            }
        }
    }

    // ── 当前 Fragment 局部关系 (desktop.md §7.1) ─────────────────────────

    private var fragmentSection: some View {
        Section("当前 Fragment 的局部关系") {
            Picker("选择碎片", selection: $selectedFragmentId) {
                Text("请选择").tag("")
                ForEach(model.fragments) { fragment in
                    Text(fragment.content.prefix(30)).tag(fragment.id)
                }
            }
            if let fragment = model.fragments.first(where: { $0.id == selectedFragmentId }) {
                FragmentRelationsRows(fragmentId: fragment.id)
            }
        }
    }

    // ── 按主题筛选的关系列表 (desktop.md §7.1) ───────────────────────────

    private var tagSection: some View {
        Section("按主题筛选的关系列表") {
            TagFilterPicker(tagFilter: $tagFilter)
            TagFilteredRelationRows(tagFilter: tagFilter)
        }
    }
}

/// Confirmed relations of one fragment (either direction), with delete.
private struct FragmentRelationsRows: View {
    @EnvironmentObject var model: DesktopModel
    let fragmentId: String

    var body: some View {
        let relations = model.confirmedRelations(fragmentId)
        if relations.isEmpty {
            Text("该碎片暂无已确认关系。可从碎片详情「建立关系」。")
                .font(.footnote).foregroundStyle(.secondary)
        } else {
            ForEach(relations) { relation in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.relationEndpointSummary(relation, of: fragmentId))
                            .font(.callout)
                        HStack(spacing: 6) {
                            Text(relation.type)
                                .font(.caption)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.15), in: Capsule())
                            if let note = relation.note, !note.isEmpty {
                                Text(note).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Spacer()
                    Button("删除关系") { model.removeRelation(relation.id) }
                        .controlSize(.small)
                }
            }
        }
    }
}

/// Tag chips filtering the confirmed-relation list.
private struct TagFilterPicker: View {
    @EnvironmentObject var model: DesktopModel
    @Binding var tagFilter: String

    private var tags: [String] { collectTags(model.fragments) }

    var body: some View {
        if tags.isEmpty {
            Text("暂无标签可用。").font(.footnote).foregroundStyle(.secondary)
        } else {
            HStack(spacing: 8) {
                FilterChip(label: "全部", isOn: tagFilter.isEmpty) {
                    tagFilter = ""
                }
                ForEach(tags.prefix(12), id: \.self) { tag in
                    FilterChip(label: "#\(tag)", isOn: tagFilter == tag) {
                        tagFilter = tagFilter == tag ? "" : tag
                    }
                }
                Spacer()
            }
        }
    }
}

/// Confirmed relations filtered by tag (either endpoint carries the tag).
private struct TagFilteredRelationRows: View {
    @EnvironmentObject var model: DesktopModel
    let tagFilter: String

    private var filtered: [FragmentRelation] {
        let confirmed = model.relations.filter { $0.status == "confirmed" }
        guard !tagFilter.isEmpty else { return confirmed }
        func fragmentHasTag(_ id: String) -> Bool {
            model.fragments.first { $0.id == id }?.tags.contains(tagFilter) ?? false
        }
        return confirmed.filter { fragmentHasTag($0.fromFragmentId) || fragmentHasTag($0.toFragmentId) }
    }

    var body: some View {
        if filtered.isEmpty {
            Text("该主题下暂无已确认关系。").font(.footnote).foregroundStyle(.secondary)
        } else {
            ForEach(filtered) { relation in
                RelationListRow(relation: relation)
            }
            Text("共 \(filtered.count) 条已确认关系（suggested 不参与）。")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// 「A 摘要 → B 摘要」 + type + note row.
private struct RelationListRow: View {
    @EnvironmentObject var model: DesktopModel
    let relation: FragmentRelation

    var body: some View {
        let fromSummary = model.fragments
            .first { $0.id == relation.fromFragmentId }
            .map { String($0.content.prefix(24)) } ?? relation.fromFragmentId
        let toSummary = model.fragments
            .first { $0.id == relation.toFragmentId }
            .map { String($0.content.prefix(24)) } ?? relation.toFragmentId
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(fromSummary) → \(toSummary)")
                    .font(.callout)
                HStack(spacing: 6) {
                    Text(relation.type)
                        .font(.caption)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.15), in: Capsule())
                    if let note = relation.note, !note.isEmpty {
                        Text(note).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
        }
    }
}

// ── suggestion card (desktop.md §7.3: both endpoints, type, reason, ops) ──

private struct SuggestionCard: View {
    @EnvironmentObject var model: DesktopModel
    let suggestion: RelationSuggestion
    let onModify: (RelationSuggestion) -> Void

    var body: some View {
        let from = model.fragments.first { $0.id == suggestion.fromFragmentId }
        let to = model.fragments.first { $0.id == suggestion.toFragmentId }
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: suggestion.suggestedType == "similarity" ? "arrow.left.arrow.right" : "arrow.right")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text(from?.content ?? suggestion.fromFragmentId).font(.callout).lineLimit(2)
                    Text("→ \(to?.content ?? suggestion.toFragmentId)")
                        .font(.callout).lineLimit(2)
                }
                Spacer()
                VStack(alignment: .trailing) {
                    Text(suggestion.suggestedType)
                        .font(.caption)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.15), in: Capsule())
                    Text("置信度 \(String(format: "%.2f", suggestion.confidence))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Text("为什么建议：\(suggestion.reason)")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Button("接受") { model.acceptSuggestion(suggestion) }
                Button("修改…") { onModify(suggestion) }
                Button("拒绝", role: .destructive) { model.rejectSuggestion(suggestion) }
                Spacer()
            }
            .controlSize(.small)
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))
    }
}

// ── 修改建议：换类型 + 可选说明后再接受 ──────────────────────────────────

private struct ModifySuggestionSheet: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss
    let suggestion: RelationSuggestion

    @State private var type = ""
    @State private var note = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("修改关系类型").font(.headline)
            Text(suggestion.reason).font(.caption).foregroundStyle(.secondary)
            Picker("类型", selection: $type) {
                ForEach(relationTypes, id: \.self) { value in
                    Text("\(value)\(directionHint(value))").tag(value)
                }
            }
            .onAppear { if type.isEmpty { type = suggestion.suggestedType } }
            TextField("关系说明（可选）", text: $note)
                .textFieldStyle(.roundedBorder)
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("确认接受") {
                    model.acceptSuggestion(suggestion, type: type, note: note.isEmpty ? nil : note)
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(16)
    }
}

/// Direction hints for the six relation types (storage.md §3.3).
func directionHint(_ type: String) -> String {
    switch type {
    case "reference": return "（A 引用 B）"
    case "prerequisite": return "（A 是 B 的前置）"
    case "similarity": return "（无方向）"
    case "contrast": return "（无方向）"
    case "evidence": return "（A 支持 B）"
    case "evolution": return "（A 演化为 B）"
    default: return ""
    }
}

// ── 建立关系 from fragment detail (desktop.md §7.2) ─────────────────────

struct EstablishRelationSheet: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss
    let source: FragmentRecord

    @State private var search = ""
    @State private var targetId: String = ""
    @State private var type = "reference"
    @State private var note = ""

    private var results: [FragmentRecord] {
        let query = FragmentQuery(search: search.isEmpty ? nil : search, limit: 30)
        return runFragmentQuery(
            model.fragments.filter { $0.id != source.id },
            query: query
        ).items
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("建立关系").font(.headline)
            Text("当前碎片：\(source.content)").font(.callout).foregroundStyle(.secondary)
            TextField("搜索另一个碎片", text: $search)
                .textFieldStyle(.roundedBorder)
            ScrollView {
                VStack(spacing: 4) {
                    ForEach(results) { fragment in
                        Button {
                            targetId = fragment.id
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(fragment.content).lineLimit(1)
                                    Text("\(fragment.kind) · \(fragment.context.sourceHost)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if targetId == fragment.id {
                                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                }
                            }
                            .padding(6)
                            .background(
                                targetId == fragment.id
                                    ? Color.accentColor.opacity(0.15)
                                    : Color.clear,
                                in: RoundedRectangle(cornerRadius: 6)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(minHeight: 180)
            Picker("关系类型", selection: $type) {
                ForEach(relationTypes, id: \.self) { value in
                    Text("\(value)\(directionHint(value))").tag(value)
                }
            }
            TextField("关系说明（可选）", text: $note)
                .textFieldStyle(.roundedBorder)
            HStack {
                if targetId.isEmpty {
                    Text("请先选择另一个碎片").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button("取消") { dismiss() }
                Button("保存为已确认") {
                    model.establishRelation(
                        from: source.id, to: targetId, type: type,
                        note: note.isEmpty ? nil : note
                    )
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(targetId.isEmpty)
            }
        }
        .padding(16)
    }
}
