import type { DetailOf, FragmentKind, FragmentRecord, VerifiedResult } from '../types'
import { createFragment } from '../factory'

export const NOW = 1_768_000_000_000 // fixed for determinism

export const EXCERPT =
  'Investors rotated out of bonds after the Fed signalled a hawkish pivot on rates, and strategists expect the shift to persist.'

export const VERIFIED: VerifiedResult = {
  confirmedAt: NOW - 1000,
  source: 'source-material',
}

/** A minimal valid concept fragment built through the shared factory. */
export function makeFragment(overrides: Partial<FragmentRecord<'concept'>> & { id?: string } = {}): FragmentRecord<'concept'> {
  const base = createFragment<'concept'>({
    kind: 'concept',
    content: 'hawkish pivot',
    context: {
      excerpt: EXCERPT,
      sourceUrl: 'https://www.wsj.com/articles/fed-hawkish-pivot',
      sourceHost: 'wsj.com',
      sourceTitle: 'WSJ — Fed coverage',
      locator: { type: 'none' },
    },
    processing: {
      guess: 'something about tight money',
      verified: { ...VERIFIED },
      use: '在下周的宏观复盘里用它解释债券抛售。',
    },
    detail: { definition: '央行转向更紧缩货币政策的立场转变', boundaries: ['不等于加息本身', '只描述立场方向'] },
    tags: ['fed', 'macro'],
    now: NOW,
  })
  return { ...base, ...overrides } as FragmentRecord<'concept'>
}

export const KIND_SAMPLES: Record<Exclude<FragmentKind, 'media-clip'>, { content: string; detail: DetailOf<Exclude<FragmentKind, 'media-clip'>>; excerpt: string }> = {
  excerpt: {
    content: 'The lesson of the hawkish pivot is that guidance matters more than moves.',
    detail: { note: '引用时注意 2026 年语境' },
    excerpt:
      'The lesson of the hawkish pivot is that guidance matters more than moves, wrote the columnist in the year-end review.',
  },
  concept: {
    content: 'hawkish pivot',
    detail: { definition: '转向更紧缩政策' },
    excerpt: EXCERPT,
  },
  claim: {
    content: 'Rate-cut hopes are dead for this year',
    detail: { stance: 'support', evidence: ['期货市场定价', '联储会议纪要'] },
    excerpt: ' strategists claim Rate-cut hopes are dead for this year after the latest CPI print.',
  },
  procedure: {
    content: 'Pre-mortem review checklist',
    detail: { steps: ['列出失败模式', '逐项指定 owner', '两周后回看'], prerequisites: ['团队已定目标'] },
    excerpt: 'We adopted a Pre-mortem review checklist in our planning doc this quarter.',
  },
  decision: {
    content: 'Ship the sync engine without CRDTs',
    detail: { rationale: '单机中枢 + 事件回放已满足需求', alternatives: ['CRDT 全双工同步'], consequences: ['R3 需补冲突报告'] },
    excerpt: 'The team decided to Ship the sync engine without CRDTs for the first release.',
  },
  question: {
    content: 'Does spaced repetition transfer to productive use?',
    detail: { status: 'open', hypothesis: '需要真实使用数据配合', nextStep: '在内测中观察完成率' },
    excerpt: 'An open question remains: Does spaced repetition transfer to productive use?',
  },
  inspiration: {
    content: '把核验步骤做成“回到原文”的一键跳转',
    detail: { form: 'idea' },
    excerpt: '把核验步骤做成“回到原文”的一键跳转 —— 读到间隔重复文献时想到的。',
  },
  visual: {
    content: '净值曲线在加息后出现三次深回撤',
    detail: { attachmentIds: ['asset_fix1'] },
    excerpt: '净值曲线在加息后出现三次深回撤（见截图）。',
  },
}

/** Builds any enabled kind around a shared verified/use baseline. */
export function makeFragmentOf<K extends Exclude<FragmentKind, 'media-clip'>>(kind: K, overrides: { sourceUrl?: string; sourceHost?: string } = {}): FragmentRecord<K> {
  const sample = KIND_SAMPLES[kind]
  const sourceUrl = overrides.sourceUrl ?? 'https://example.com/articles/sample'
  const sourceHost = overrides.sourceHost ?? 'example.com'
  return createFragment<K>({
    kind,
    content: sample.content,
    context: {
      excerpt: sample.excerpt,
      sourceUrl,
      sourceHost,
      sourceTitle: 'Sample Page',
      locator: kind === 'visual' ? { type: 'image', assetId: 'asset_fix1' } : { type: 'none' },
    },
    processing: {
      verified: { ...VERIFIED },
      use: '用在下周的复盘文章里。',
    },
    detail: sample.detail as DetailOf<K>,
    tags: [kind],
    now: NOW,
  })
}
