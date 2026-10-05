// 复习会话 (desktop.md §5): the card, its hint ladder, the reveal, the rating and the
// wrap-up. The rules (queue, intervals, hint content) live in AnnHubCore.

import AnnHubCore
import SwiftUI

// ── 复习会话 (desktop.md §5) ────────────────────────────────────────────

struct ReviewSessionView: View {
    @EnvironmentObject var model: DesktopModel
    @Environment(\.dismiss) private var dismiss

    // The card's hint level and reveal state live in the model (ReviewCardState).
    private var hintLevel: Int { model.card.hintLevel }
    private var revealed: Bool { model.card.revealed }
    private var usedHint: Bool { model.card.usedHint }

    private var fragment: FragmentRecord? { model.currentFragment }
    private var spec: ReviewQuestionSpec {
        fragment.map { reviewQuestion(for: $0.kind) } ?? ReviewQuestionSpec(kind: "", question: "", hints: [])
    }

    var body: some View {
        VStack(spacing: 16) {
            if let fragment {
                cardView(fragment)
            } else {
                completionView
            }
        }
        .padding(24)
        .frame(minWidth: 640, minHeight: 500)
        .onAppear {
            if model.session == nil {
                // A fresh sheet never shows a previous round's wrap-up.
                model.wrapUp = nil
                _ = model.startReviewSession()
            }
            model.syncCardToSession()
        }
    }

    // MARK: card

    private func cardView(_ fragment: FragmentRecord) -> some View {
        let session = model.session
        let total = session?.fragmentIds.count ?? 0
        let index = (session?.cursor ?? 0) + 1
        return VStack(spacing: 14) {
            HStack {
                Text("\(kindLabel(fragment.kind)) \(index)/\(total)").foregroundStyle(.secondary)
                if usedHint {
                    Label(t(.hintUsed), systemImage: "lightbulb")
                        .font(.caption).foregroundStyle(.orange)
                }
                Spacer()
                Button(t(.skip)) { model.skipCard(reason: t(.skipManual)) }
                Button(t(.end)) { dismiss() }
            }

            // 题面（按 kind 的默认题型，desktop.md §5.2）
            VStack(alignment: .leading, spacing: 10) {
                Text(spec.question).font(.title2.bold())
                Text(t(.topicLine, ["topic": String(fragment.content.prefix(40))]))
                    .font(.footnote).foregroundStyle(.secondary)
                if fragment.kind == "visual" {
                    Text(t(.promptVisual))
                        .font(.footnote).foregroundStyle(.secondary)
                } else if fragment.kind == "media-clip" {
                    Text(t(.promptMedia))
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text(t(.promptDefault))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 10))

            // R4 视觉遮挡：揭示前只给像素化图片（roadmap R4.1）。
            if fragment.kind == "visual", !revealed, let assetId = fragment.attachmentIds.first,
                let image = model.assetImage(assetId: assetId), let occluded = occludedImage(image)
            {
                VStack(spacing: 4) {
                    Image(nsImage: occluded)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text(t(.imageHidden))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // 提示梯度（desktop.md §5.3）：由粗到细四级，逐级打开，按钮显示已用级数；
            // 使用任何一级都写入 usedHint (review.md §4)。评分 1..4 仍只在揭示后可用。
            if !revealed {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Button(hintButtonTitle) { model.openNextHint() }
                            .disabled(hintLevel >= REVIEW_HINT_LEVELS)
                            .buttonStyle(.bordered)
                        Spacer()
                        Button {
                            model.revealCard()
                        } label: {
                            Text(t(.reveal)).bold()
                        }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                    }
                    if hintLevel > 0 { hintList(fragment) }
                }
            } else {
                referenceView(fragment)
                ratingButtons(fragment)
            }
            Spacer()
        }
    }

    /// "Hint 0/4" before the first rung, then "One more hint", then "Hint 4/4".
    private var hintButtonTitle: String {
        switch hintLevel {
        case 0, REVIEW_HINT_LEVELS: return t(.hintProgress, ["level": hintLevel, "max": REVIEW_HINT_LEVELS])
        default: return t(.nextHint)
        }
    }

    /// The rungs opened so far, each under its kinds.md label; the content comes from
    /// AnnHubCore (`reviewHints`) and never runs ahead of its label.
    private func hintList(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(reviewHints(upTo: hintLevel, for: fragment), id: \.level) { hint in
                VStack(alignment: .leading, spacing: 3) {
                    Text(t(.hintHeading, ["level": hint.level, "max": REVIEW_HINT_LEVELS, "title": hint.title]))
                        .font(.caption.bold()).foregroundStyle(.secondary)
                    Text(hint.text).font(.callout).textSelection(.enabled)
                    if let assetId = hint.assetId {
                        if let image = model.assetImage(assetId: assetId) {
                            Image(nsImage: image)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 160)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        } else {
                            Label(t(.attachmentMissing), systemImage: "exclamationmark.triangle")
                                .font(.caption).foregroundStyle(.orange)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 8))
    }

    /// 揭示后的参考信息 (desktop.md §5.1 ③)：内容、你的理解（深度模式才有）、核验确认、
    /// 你的应用，以及该 kind 的字段（方法的步骤、论点的证据……——回忆要对照的东西），
    /// 并保留「回到来源」；visual 揭示原图。
    private func referenceView(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(fragment.content).font(.headline)
            if let guess = fragment.processing.guess, !guess.isEmpty {
                Text(t(.yourUnderstanding, ["content": guess]))
            }
            Text(verificationLine(fragment)).foregroundStyle(.secondary)
            Text(t(.yourUse, ["use": fragment.processing.use]))
            ForEach(kindDetailFields(fragment), id: \.label) { field in
                VStack(alignment: .leading, spacing: 2) {
                    Text(field.label).font(.caption).foregroundStyle(.secondary)
                    ForEach(Array(field.lines.enumerated()), id: \.offset) { index, line in
                        Text(field.numbered ? "\(index + 1). \(line)" : (field.lines.count > 1 ? "· \(line)" : line))
                            .font(.callout)
                    }
                }
            }
            // Inspirations and clips already show their context as a field above.
            if fragment.kind != "inspiration" && fragment.kind != "media-clip" {
                Text(fragment.context.excerpt)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if fragment.kind == "visual", let assetId = fragment.attachmentIds.first {
                if let image = model.assetImage(assetId: assetId) {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                } else {
                    Label(t(.attachmentMissing), systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            if let url = URL(string: fragment.context.sourceUrl) {
                Link(t(.backToSource, ["host": fragment.context.sourceHost]), destination: url)
                    .font(.callout)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.annBrand.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .contain)
    }

    private func verificationLine(_ fragment: FragmentRecord) -> String {
        guard let verified = fragment.processing.verified else { return t(.verificationNotConfirmed) }
        var line = t(.verificationLine, ["source": verifiedSourceLabel(verified.source)])
        if let summary = verified.summary, !summary.isEmpty {
            line += t(.verificationLineSummary, ["summary": summary])
        }
        return line
    }

    /// 评分按钮只能在揭示后出现，展示预计下次间隔；1-4 快捷键 (desktop.md §5/§9)。
    private func ratingButtons(_ fragment: FragmentRecord) -> some View {
        HStack(spacing: 12) {
            ForEach(Array(ReviewRating.allCases.enumerated()), id: \.element) { idx, rating in
                Button {
                    model.rateCard(rating)
                } label: {
                    VStack {
                        Text("\(idx + 1) \(label(rating))")
                        Text(
                            t(.intervalDays, ["count": previewInterval(fragment.review, rating: rating, now: nowMs())])
                        )
                        .font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(tint(rating))
                .keyboardShortcut(KeyEquivalent(Character("\(idx + 1)")), modifiers: [])
            }
        }
    }

    // MARK: wrap-up (desktop.md §5.5)

    /// States facts only — no streaks, badges or celebration. When the day's
    /// suggested amount is used up it says so and offers 再来一轮 beyond it.
    private var completionView: some View {
        let plan = model.dailyPlan
        return VStack(spacing: 14) {
            Spacer()
            if let wrap = model.wrapUp {
                Text(t(.wrapTitle)).font(.title2.bold())
                Text(t(.wrapRated, ["rated": wrap.rated, "hint": wrap.usedHint, "again": wrap.again]))
                if wrap.skipped > 0 {
                    Text(t(.wrapSkipped, ["count": wrap.skipped]))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text(upcomingLine(wrap)).foregroundStyle(.secondary)
            } else {
                Text(t(.noDueToday)).font(.title3)
            }
            if plan.limitReached {
                Text(t(.limitReached, ["rated": plan.ratedToday, "limit": plan.dailyLimit, "due": plan.due.count]))
                    .font(.callout).foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button(t(.backToToday)) {
                    model.wrapUp = nil
                    dismiss()
                }
                if plan.limitReached {
                    Button(t(.extraRound)) { startRound(overflow: true) }
                } else if !plan.suggested.isEmpty {
                    Button(t(.continueNext, ["due": plan.due.count])) { startRound(overflow: false) }
                        .buttonStyle(.borderedProminent)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func upcomingLine(_ wrap: SessionWrapUp) -> String {
        guard !wrap.upcoming.isEmpty else { return t(.upcomingNone) }
        let now = nowMs()
        let parts = wrap.upcoming.map {
            t(.upcomingPart, ["day": relativeDayLabel(dayStart: $0.dayStart, now: now), "count": $0.count])
        }
        return t(.upcomingLine, ["parts": parts.joined(separator: " / ")])
    }

    private func startRound(overflow: Bool) {
        _ = model.startReviewSession(overflow: overflow)
    }

    private func label(_ r: ReviewRating) -> String {
        switch r {
        case .again: return t(.ratingAgain)
        case .hard: return t(.ratingHard)
        case .good: return t(.ratingGood)
        case .easy: return t(.ratingEasy)
        }
    }

    private func tint(_ r: ReviewRating) -> Color {
        switch r {
        case .again: return .red;
        case .hard: return .orange;
        case .good: return .blue;
        case .easy: return .green
        }
    }
}
