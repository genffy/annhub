// The kind-specific block of a fragment's detail (desktop.md §4.3, kinds.md §4): the one
// extra area each kind adds — a method's steps and failure modes, a claim's stance and
// evidence, a question's status and hypothesis, a decision's rationale and alternatives,
// an inspiration's form and trigger, a media clip's range and transcript. Empty fields
// are left out; the view renders whatever comes back. The labels are the capture form's
// own field names, in the interface language.

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

public func kindDetailFields(_ fragment: FragmentRecord, lang: UILanguage = .current) -> [KindDetailField] {
    var fields: [KindDetailField] = []

    func text(_ label: UIText, _ value: String?) {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return }
        fields.append(KindDetailField(label: t(label, lang: lang), lines: [value]))
    }
    func list(_ label: UIText, _ values: [String]?, numbered: Bool = false) {
        let lines = (values ?? []).filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !lines.isEmpty else { return }
        fields.append(KindDetailField(label: t(label, lang: lang), lines: lines, numbered: numbered))
    }

    switch fragment.kind {
    case "excerpt":
        text(.fieldNote, fragment.excerptDetail?.note)
    case "concept":
        let detail = fragment.conceptDetail
        text(.fieldDefinition, detail?.definition)
        list(.fieldBoundaries, detail?.boundaries)
        list(.fieldExamples, detail?.examples)
        list(.fieldCounterExamples, detail?.counterExamples)
    case "claim":
        let detail = fragment.claimDetail
        if let stance = detail?.stance, let label = stanceDisplayName(stance, lang: lang) {
            fields.append(KindDetailField(label: t(.fieldStance, lang: lang), lines: [label]))
        }
        list(.fieldEvidence, detail?.evidence)
        list(.fieldAssumptions, detail?.assumptions)
    case "procedure":
        let detail = fragment.procedureDetail
        list(.fieldSteps, detail?.steps, numbered: true)
        list(.fieldPrerequisites, detail?.prerequisites)
        list(.fieldFailureModes, detail?.failureModes)
    case "decision":
        let detail = fragment.decisionDetail
        text(.fieldRationale, detail?.rationale)
        list(.fieldAlternatives, detail?.alternatives)
        list(.fieldConsequences, detail?.consequences)
    case "question":
        let detail = fragment.questionDetail
        if let status = detail?.status {
            fields.append(
                KindDetailField(label: t(.fieldStatus, lang: lang), lines: [questionStatusLabel(status, lang: lang)]))
        }
        text(.fieldHypothesis, detail?.hypothesis)
        list(.fieldEvidence, detail?.evidence)
        text(.fieldNextStep, detail?.nextStep)
        text(.fieldAnswer, detail?.answer)
    case "inspiration":
        if let form = fragment.inspirationDetail?.form {
            fields.append(
                KindDetailField(
                    label: t(.fieldForm, lang: lang),
                    lines: [t(form == "reflection" ? .formReflection : .formIdea, lang: lang)]
                ))
        }
        text(.fieldTrigger, triggerBackground(fragment, lang: lang))
    case "media-clip":
        if let clip = fragment.mediaClipDetail {
            fields.append(
                KindDetailField(
                    label: t(.detailTimeRange, lang: lang), lines: ["\(mmss(clip.startMs)) – \(mmss(clip.endMs))"]))
        }
        text(.fieldTranscript, fragment.context.excerpt)
    default:
        break
    }
    return fields
}

/// The claim's stance as the capture form names it; an unknown value has no label.
func stanceDisplayName(_ stance: String, lang: UILanguage = .current) -> String? {
    switch stance {
    case "support": return t(.stanceSupport, lang: lang)
    case "oppose": return t(.stanceOppose, lang: lang)
    case "uncertain": return t(.stanceUncertain, lang: lang)
    default: return nil
    }
}

func questionStatusLabel(_ status: String, lang: UILanguage = .current) -> String {
    switch status {
    case "open": return t(.questionOpen, lang: lang)
    case "testing": return t(.questionTesting, lang: lang)
    case "answered": return t(.questionAnswered, lang: lang)
    default: return status
    }
}
