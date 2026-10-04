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
                    Label("已用提示", systemImage: "lightbulb")
                        .font(.caption).foregroundStyle(.orange)
                }
                Spacer()
                Button("跳过") { model.skipCard(reason: "手动跳过") }
                Button("结束") { dismiss() }
            }

            // 题面（按 kind 的默认题型，desktop.md §5.2）
            VStack(alignment: .leading, spacing: 10) {
                Text(spec.question).font(.title2.bold())
                Text("主题：\(String(fragment.content.prefix(40)))")
                    .font(.footnote).foregroundStyle(.secondary)
                if fragment.kind == "visual" {
                    Text("先回忆，再揭示查看文字描述与截图。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else if fragment.kind == "media-clip" {
                    Text("先回忆要点与时间定位，再揭示核对转写。")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text("先自己作答，再点「揭示」")
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
                    Text("图片已遮挡")
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
                            Text("揭示").bold()
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

    /// "提示 0/4" before the first rung, then "再给一级提示", then "提示 4/4".
    private var hintButtonTitle: String {
        switch hintLevel {
        case 0: return "提示 0/\(REVIEW_HINT_LEVELS)"
        case REVIEW_HINT_LEVELS: return "提示 \(REVIEW_HINT_LEVELS)/\(REVIEW_HINT_LEVELS)"
        default: return "再给一级提示"
        }
    }

    /// The rungs opened so far, each under its kinds.md label; the content comes from
    /// AnnHubCore (`reviewHints`) and never runs ahead of its label.
    private func hintList(_ fragment: FragmentRecord) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(reviewHints(upTo: hintLevel, for: fragment), id: \.level) { hint in
                VStack(alignment: .leading, spacing: 3) {
                    Text("提示 \(hint.level)/\(REVIEW_HINT_LEVELS) · \(hint.title)")
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
                            Label("附件缺失，待重试", systemImage: "exclamationmark.triangle")
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
                Text("你的理解：\(guess)")
            }
            Text(verificationLine(fragment)).foregroundStyle(.secondary)
            Text("你的应用：\(fragment.processing.use)")
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
                    Label("附件缺失，待重试", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            if let url = URL(string: fragment.context.sourceUrl) {
                Link("回到来源：\(fragment.context.sourceHost)", destination: url)
                    .font(.callout)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.annBrand.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .contain)
    }

    private func verificationLine(_ fragment: FragmentRecord) -> String {
        guard let verified = fragment.processing.verified else { return "核验：未确认" }
        var line = "核验：已确认，来源：\(verifiedSourceLabel(verified.source))"
        if let summary = verified.summary, !summary.isEmpty {
            line += "；摘要：\(summary)"
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
                        Text("\(previewInterval(fragment.review, rating: rating, now: nowMs())) 天")
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
                Text("这一轮完成了").font(.title2.bold())
                Text("已评分 \(wrap.rated) 条 / 其中 \(wrap.usedHint) 条用过提示 / \(wrap.again) 条「再来一次」")
                if wrap.skipped > 0 {
                    Text("跳过 \(wrap.skipped) 条（碎片已删除或手动跳过）")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Text(upcomingLine(wrap)).foregroundStyle(.secondary)
            } else {
                Text("今天没有到期复习").font(.title3)
            }
            if plan.limitReached {
                Text("建议量 \(plan.ratedToday) / \(plan.dailyLimit)；还有 \(plan.due.count) 条到期，保留原到期时间，明天继续")
                    .font(.callout).foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button("回到今日") {
                    model.wrapUp = nil
                    dismiss()
                }
                if plan.limitReached {
                    Button("再来一轮（超出建议量）") { startRound(overflow: true) }
                } else if !plan.suggested.isEmpty {
                    Button("继续下一会话（还有 \(plan.due.count) 条到期）") { startRound(overflow: false) }
                        .buttonStyle(.borderedProminent)
                }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func upcomingLine(_ wrap: SessionWrapUp) -> String {
        guard !wrap.upcoming.isEmpty else { return "下一批到期：暂无" }
        let now = nowMs()
        let parts = wrap.upcoming.map { "\(relativeDayLabel(dayStart: $0.dayStart, now: now)) \($0.count) 条" }
        return "下一批到期：" + parts.joined(separator: " / ")
    }

    private func startRound(overflow: Bool) {
        _ = model.startReviewSession(overflow: overflow)
    }

    private func label(_ r: ReviewRating) -> String {
        switch r {
        case .again: return "再来一次";
        case .hard: return "较难";
        case .good: return "良好";
        case .easy: return "容易"
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
