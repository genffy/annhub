import { describe, expect, it } from 'vitest'
import { copyableInput, fallbackNote, hasTypedInput, type RecoverableInput } from '../capture-recovery'
import { splitExcerpt } from '../capture-context'
import { detailEntries, EMPTY_DETAIL } from '../detail-form'

const base: RecoverableInput = {
  kindLabel: '概念',
  content: 'Backpressure',
  excerpt: 'Consumers signal demand so Backpressure slows the producer.',
  sourceUrl: 'https://engineering.example.com/streams',
  sourceTitle: 'Backpressure in Streams',
  guess: '',
  summary: '',
  notes: '',
  use: '',
  tags: '',
  details: [],
}

describe('capture recovery text (extension.md §4.1 / §9)', () => {
  it('keeps every typed processing field in the note attached to 改存', () => {
    const note = fallbackNote({ ...base, guess: '下游把压力传回上游', use: '检查事件管道为何耗尽内存', tags: 'streams', details: [['定义', '需求信号']] })
    expect(note).toBe(['理解：下游把压力传回上游', '应用：检查事件管道为何耗尽内存', '定义：需求信号', '标签：streams'].join('\n'))
  })

  it('writes no empty labels when nothing was typed', () => {
    expect(fallbackNote(base)).toBe('')
    expect(hasTypedInput(base)).toBe(false)
  })

  it('copyable input carries the content, context and source besides the typed text', () => {
    const text = copyableInput({ ...base, use: '写进复盘文档' })
    expect(text).toContain('类型：概念')
    expect(text).toContain('内容：Backpressure')
    expect(text).toContain('上下文：Consumers signal demand')
    expect(text).toContain('来源：Backpressure in Streams（https://engineering.example.com/streams）')
    expect(text).toContain('应用：写进复盘文档')
  })

  it('detects typed input from any field, including kind details', () => {
    expect(hasTypedInput({ ...base, notes: '备注' })).toBe(true)
    expect(hasTypedInput({ ...base, details: [['步骤', '第一步']] })).toBe(true)
  })

  it('lists only deliberately typed per-kind detail values', () => {
    expect(detailEntries('question', EMPTY_DETAIL)).toEqual([])
    expect(detailEntries('inspiration', EMPTY_DETAIL)).toEqual([])
    expect(detailEntries('question', { ...EMPTY_DETAIL, status: 'answered', answer: '部分迁移', hypothesis: '先小范围' })).toEqual([
      ['状态', '已回答'],
      ['当前假设', '先小范围'],
      ['结论', '部分迁移'],
    ])
    expect(detailEntries('claim', { ...EMPTY_DETAIL, stance: 'uncertain', evidence: 'a\nb' })).toEqual([
      ['立场', '存疑'],
      ['证据', 'a；b'],
    ])
  })
})

describe('splitExcerpt (verification context card)', () => {
  it('splits around the selection case-insensitively so the selection can be marked', () => {
    expect(splitExcerpt('Consumers signal demand so Backpressure slows the producer.', 'backpressure')).toEqual({
      before: 'Consumers signal demand so ',
      match: 'Backpressure',
      after: ' slows the producer.',
    })
  })

  it('returns null when the content no longer appears or is empty', () => {
    expect(splitExcerpt('some other sentence', 'Backpressure')).toBeNull()
    expect(splitExcerpt('anything', '   ')).toBeNull()
  })

  it('treats regex characters in the selection literally', () => {
    expect(splitExcerpt('a (b+c)* d', '(b+c)*')?.match).toBe('(b+c)*')
  })
})
