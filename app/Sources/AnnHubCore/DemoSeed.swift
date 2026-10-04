// Demo seeding for desktop screenshots and manual demos. It never runs unless
// `--annhub-demo-seed` is present and skips non-empty stores.
//
// Seeds five varied v4 text fragments (concept/claim/procedure/decision/
// inspiration) plus one visual fragment referencing a seeded asset, and rates
// two of them.

import Foundation

public enum DemoSeed {
    public static let launchArgument = "--annhub-demo-seed"

    /// The 94-byte fixture PNG (fixtures/interop/asset.png).
    public static let pngBytes: [UInt8] = [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x02,
        0x08, 0x02, 0x00, 0x00, 0x00, 0xF0, 0xCA, 0xEA, 0x34, 0x00, 0x00, 0x00,
        0x25, 0x49, 0x44, 0x41, 0x54, 0x78, 0x01, 0x01, 0x1A, 0x00, 0xE5, 0xFF,
        0x00, 0xC8, 0x1E, 0x3C, 0xC8, 0x1E, 0x5A, 0xC8, 0x1E, 0x78, 0xC8, 0x1E,
        0x96, 0x00, 0xC8, 0x46, 0x3C, 0xC8, 0x46, 0x5A, 0xC8, 0x46, 0x78, 0xC8,
        0x46, 0x96, 0x8B, 0xB6, 0x0B, 0x19, 0x8C, 0xA6, 0xE3, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]

    public static let pngSha256 = "fec5a02e9c7775ad5b6f2fe6f51f48f6307c9f1adef942be2cdcc00f6ab1913a"
    public static let demoAssetId = "asset_demo_chart"

    /// Demo rows are stored like deliveries from a device named `demo-seed`; the
    /// Desktop never creates fragments itself (desktop.md §3.3).
    public static let demoDeviceId = "demo-seed"

    private static func createDemoFragment(_ store: FragmentStore, _ input: CreateFragmentInput) throws -> FragmentRecord {
        let record = try createFragment(input)
        try store.upsertFragment(record, deviceId: demoDeviceId, payloadHash: "")
        return record
    }

    public static func seedIfNeeded(_ store: FragmentStore, now: Int? = nil) {
        guard let fragments = try? store.getFragments(), fragments.isEmpty else { return }
        let now = now ?? Int(Date().timeIntervalSince1970 * 1000)

        // Asset first so the visual fragment references a seeded image.
        let asset = ImageAsset(
            id: demoAssetId,
            mimeType: ImageMimeType.png.rawValue,
            byteLength: pngBytes.count,
            sha256: pngSha256,
            width: 4,
            height: 2,
            createdAt: now
        )
        _ = try? store.putAsset(asset, bytes: Data(pngBytes))

        var created: [FragmentRecord] = []

        func add(
            _ kind: String, content: String, excerpt: String, use: String,
            sourceUrl: String, sourceTitle: String?, tags: [String],
            detail: FragmentDetail, locator: FragmentLocator = .none
        ) {
            if let record = try? createDemoFragment(store, CreateFragmentInput(
                kind: kind,
                content: content,
                context: FragmentContextInput(
                    excerpt: excerpt,
                    sourceUrl: sourceUrl,
                    sourceHost: normalizeHost(url: sourceUrl) ?? "",
                    sourceTitle: sourceTitle,
                    locator: locator,
                    capturedAt: now
                ),
                processing: FragmentProcessing(
                    verified: VerifiedResult(confirmedAt: now, source: "source-material"),
                    use: use
                ),
                detail: detail,
                tags: tags,
                now: now
            )) {
                created.append(record)
            }
        }

        add(
            "concept",
            content: " hawkish pivot ",
            excerpt: "Investors rotated out of bonds after the Fed signalled a hawkish pivot on rates.",
            use: "在下周的宏观复盘里解释债券抛售。",
            sourceUrl: "https://www.wsj.com/articles/fed-hawkish-pivot",
            sourceTitle: "WSJ — Fed coverage",
            tags: ["fed", "macro"],
            detail: .concept(ConceptDetail(
                definition: "央行转向更紧缩政策",
                boundaries: ["不等于加息本身"]
            ))
        )
        add(
            "claim",
            content: "紧缩预期压低长久期债券价格",
            excerpt: "紧缩预期压低长久期债券价格：市场对利率路径的重定价快于央行表态。",
            use: "复盘时核对利率期货与债券收益率的同步性。",
            sourceUrl: "https://www.ft.com/markets",
            sourceTitle: "Rates reprice",
            tags: ["macro"],
            detail: .claim(ClaimDetail(stance: "support", evidence: ["利率期货数据"]))
        )
        add(
            "procedure",
            content: "每周宏观复盘三步法",
            excerpt: "每周宏观复盘三步法：先看数据日历，再核对仓位，最后写结论。",
            use: "本周日复盘时完整跑一遍流程。",
            sourceUrl: "annhub://manual/demo-procedure",
            sourceTitle: nil,
            tags: ["method"],
            detail: .procedure(ProcedureDetail(steps: [
                "列出本周数据日历",
                "核对当前仓位与风险敞口",
                "写三条结论并标注置信度",
            ]))
        )
        add(
            "decision",
            content: "降杠杆并保留现金",
            excerpt: "决定：降杠杆并保留现金，等待波动率回落后再回补。",
            use: "下次讨论仓位时引用这个取舍的约束。",
            sourceUrl: "annhub://manual/demo-decision",
            sourceTitle: nil,
            tags: ["risk"],
            detail: .decision(DecisionDetail(
                rationale: "波动率升高且信号冲突，先保住本金",
                alternatives: ["维持原仓位", "加对冲"]
            ))
        )
        add(
            "inspiration",
            content: "把复盘写成给未来自己的信",
            excerpt: "把复盘写成给未来自己的信：假设一年后的自己会追问今天的假设。",
            use: "下次写复盘时用这个视角重写开头。",
            sourceUrl: "annhub://manual/demo-inspiration",
            sourceTitle: nil,
            tags: ["writing"],
            detail: .inspiration(InspirationDetail(form: "idea"))
        )
        add(
            "visual",
            content: "净值曲线在加息后出现三次深回撤",
            excerpt: "净值曲线在加息后出现三次深回撤（见截图）。",
            use: "用于下周风险复盘的图示。",
            sourceUrl: "https://example.com/performance",
            sourceTitle: "Performance review",
            tags: ["chart"],
            detail: .visual(VisualDetail(attachmentIds: [demoAssetId])),
            locator: .image(assetId: demoAssetId, rect: nil)
        )

        // Two rated: one good (in review), one lapse with a hint.
        if created.count > 0 {
            _ = try? store.rateFragment(id: created[0].id, rating: .good, usedHint: false, now: now)
        }
        if created.count > 1 {
            _ = try? store.rateFragment(id: created[1].id, rating: .again, usedHint: true, now: now)
        }
    }
}
