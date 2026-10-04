// The kind-specific block of a fragment's detail (desktop.md §4.3, kinds.md §4): the one
// extra area each kind adds — a method's steps and failure modes, a claim's stance and
// evidence, a question's status and hypothesis, a decision's rationale and alternatives,
// an inspiration's form and trigger, a media clip's range and transcript. Empty fields
// are left out; the view renders whatever comes back.

import Foundation

public struct KindDetailField: Equatable, Sendable {
    public var label: String
    public var lines: [String]
    /// Steps read as 1. 2. 3.
    public var numbered: Bool

    public init(label: String, lines: [String], numbered: Bool = false) {
        self.label = label
        self.lines = lines
        self.numbered = numbered
    }
}

public func kindDetailFields(_ fragment: FragmentRecord) -> [KindDetailField] {
    var fields: [KindDetailField] = []

    func text(_ label: String, _ value: String?) {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return }
        fields.append(KindDetailField(label: label, lines: [value]))
    }
    func list(_ label: String, _ values: [String]?, numbered: Bool = false) {
        let lines = (values ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !lines.isEmpty else { return }
        fields.append(KindDetailField(label: label, lines: lines, numbered: numbered))
    }

    switch fragment.kind {
    case "excerpt":
        text("备注", fragment.excerptDetail?.note)
    case "concept":
        let detail = fragment.conceptDetail
        text("定义", detail?.definition)
        list("适用边界", detail?.boundaries)
        list("示例", detail?.examples)
        list("反例", detail?.counterExamples)
    case "claim":
        let detail = fragment.claimDetail
        if let stance = detail?.stance, let label = stanceDisplayName(stance) { text("立场", label) }
        list("证据", detail?.evidence)
        list("前提", detail?.assumptions)
    case "procedure":
        let detail = fragment.procedureDetail
        list("步骤", detail?.steps, numbered: true)
        list("前置条件", detail?.prerequisites)
        list("失败条件", detail?.failureModes)
    case "decision":
        let detail = fragment.decisionDetail
        text("理由", detail?.rationale)
        list("备选方案", detail?.alternatives)
        list("后果", detail?.consequences)
    case "question":
        let detail = fragment.questionDetail
        if let status = detail?.status { text("状态", questionStatusLabel(status)) }
        text("当前假设", detail?.hypothesis)
        list("证据", detail?.evidence)
        text("下一步验证", detail?.nextStep)
        text("答案", detail?.answer)
    case "inspiration":
        if let form = fragment.inspirationDetail?.form {
            text("形式", form == "reflection" ? "随感" : "想法")
        }
        text("触发背景", triggerBackground(fragment))
    case "media-clip":
        if let clip = fragment.mediaClipDetail { text("时间区间", "\(mmss(clip.startMs)) – \(mmss(clip.endMs))") }
        text("转写节选", fragment.context.excerpt)
    default:
        break
    }
    return fields
}

func stanceDisplayName(_ stance: String) -> String? {
    switch stance {
    case "support": return "支持"
    case "oppose": return "反对"
    case "uncertain": return "不确定"
    default: return nil
    }
}
