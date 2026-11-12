import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * scripts/check-docs.mjs keeps the documentation honest: links resolve, § references name a section that exists,
 * and cited identifiers are defined somewhere. Each case below builds a small tree in which everything agrees,
 * breaks exactly one place, and expects the script to name it: an assertion that cannot fail protects nothing.
 *
 * The ids and section references are built through `id()`/`ref()` so that this file itself never cites one: the
 * checker scans every source file, and a literal id here would have to be defined in the real documentation.
 */

const script = resolve(__dirname, '../check-docs.mjs')

const id = (family: string, n: number) => `${family}-${n}`
const ref = (doc: string, section: string) => `${doc} §${section}`

const SPEC = 'spec.md'
const Q1 = id('Q', 1)
const Q2 = id('Q', 2)

const GOOD_FILES: Record<string, string> = {
  'README.md': '# AnnHub\n\n[简体中文](README.zh-CN.md)\n\nSee the [guide](docs/guide.md).\n',
  'README.zh-CN.md': '# AnnHub\n\n[English](README.md)\n\n参见[指南](docs/guide.md)。\n',
  'docs/guide.md': `# Guide\n\n## 1. Basics\n\nThe toolbar follows ${ref(SPEC, '1.1')}, and ${Q2} decides the window size.\n`,
  'AGENTS.md': '# AnnHub\n\nSee [entrypoints/library/AGENTS.md](entrypoints/library/AGENTS.md) for the library.\n',
  'entrypoints/library/AGENTS.md': '# Library\n\nSee [notes/x.md](notes/x.md) for the list rules.\n',
  'entrypoints/library/notes/x.md': '# Lists\n\nA card grid, fifty per page.\n',
  'docs/spec.md': '# Spec\n\n## 1.1 Toolbar\n\nThe toolbar pins the selection.\n',
  'docs/decisions.md': `# Decisions

## ${Q1} Window sizing

The window keeps its size on reopen.

| ID  | Decision                                |
| --- | --------------------------------------- |
| ${Q2} | The window reopens at its previous size |
`,
  'entrypoints/toolbar.ts': `// The toolbar keeps the selection (${ref(SPEC, '1.1')}).\nexport const toolbar = "pins"\n`,
  'e2e/toolbar.spec.ts': `import { test, expect } from '@playwright/test'

test('the window keeps its size (${Q1})', async () => {
  expect('pins').toBe('pins')
})
`,
}

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

/** Runs the script on the good tree with some files replaced (a string) or removed (null). */
function check(overrides: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'))
  directories.push(root)
  for (const [file, content] of Object.entries({ ...GOOD_FILES, ...overrides })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The good file with one edit; fails loudly when the text to replace is gone, so a case cannot pass by editing nothing. */
function edit(file: string, from: string, to: string): string {
  const text = GOOD_FILES[file]!
  if (!text.includes(from)) throw new Error(`${file} no longer contains ${from}`)
  return text.replace(from, to)
}

describe('check-docs', () => {
  it('passes on a tree where every link, section reference and identifier resolves', () => {
    const { status, output } = check()
    expect(status).toBe(0)
    expect(output).toContain('link:')
    expect(output).toContain('section-ref:')
    expect(output).toContain('retired-id:')
    expect(output).toContain('readme-pair:')
    expect(output).toContain('readme-fact:')
  })

  it('names the file and line of a relative link whose target is missing', () => {
    const { status, output } = check({ 'README.md': edit('README.md', 'docs/guide.md', 'docs/missing.md') })
    expect(status).toBe(1)
    expect(output).toContain('README.md:5: [link] missing target docs/missing.md')
  })

  it('names the file and line of a #anchor without a heading', () => {
    const { status, output } = check({ 'README.md': edit('README.md', 'guide.md', 'guide.md#nope') })
    expect(status).toBe(1)
    expect(output).toContain('README.md:5: [link] no heading for #nope in docs/guide.md')
  })

  it('names the document and section of a § reference in Markdown that points nowhere', () => {
    const broken = ref(SPEC, '9.9')
    const { status, output } = check({ 'docs/guide.md': edit('docs/guide.md', ref(SPEC, '1.1'), broken) })
    expect(status).toBe(1)
    expect(output).toContain(`docs/guide.md:5: [section-ref] docs/${broken} does not exist`)
  })

  it('checks § references cited from source files too', () => {
    const broken = ref(SPEC, '9.9')
    const { status, output } = check({
      'entrypoints/toolbar.ts': edit('entrypoints/toolbar.ts', ref(SPEC, '1.1'), broken),
    })
    expect(status).toBe(1)
    expect(output).toContain(`entrypoints/toolbar.ts:1: [section-ref] docs/${broken} does not exist`)
  })

  it('names a Markdown file whose file name carries a date', () => {
    const { status, output } = check({ 'docs/report-2026-10-11.md': '# Report\n' })
    expect(status).toBe(1)
    expect(output).toContain('docs/report-2026-10-11.md: [dated-file] the file name contains a date')
  })

  it('names the document that opens with an update or status line', () => {
    const { status, output } = check({ 'docs/guide.md': GOOD_FILES['docs/guide.md']! + '> 更新：2026-11-01\n' })
    expect(status).toBe(1)
    expect(output).toContain('docs/guide.md:6: [header-meta] the document opens with an update/status line')
  })

  it('names the body line that names a calendar date', () => {
    const { status, output } = check({ 'docs/guide.md': edit('docs/guide.md', 'decides the window size.', 'decided the window size on 2026-10-13.') })
    expect(status).toBe(1)
    expect(output).toContain('docs/guide.md:5: [date-in-prose] the body names a calendar date')
  })

  it('names the line whose wording tells a fix story', () => {
    const { status, output } = check({ 'docs/guide.md': edit('docs/guide.md', 'and ' + Q2 + ' decides the window size.', 'and ' + Q2 + ' decides the window size (旧实现).') })
    expect(status).toBe(1)
    expect(output).toContain('[history-wording] the line uses narrative wording (旧实现)')
  })

  it('names the line that carries a fix-round or defect label', () => {
    const label = ['真机', '走查', ' P2-', '1'].join('')
    const { status, output } = check({
      'docs/guide.md': edit('docs/guide.md', 'decides the window size.', `decides the window size (${label}).`),
    })
    expect(status).toBe(1)
    expect(output).toContain('docs/guide.md:5: [round-label] the line carries a fix-round or defect label')
  })

  it('names the linker of an instruction file nothing links', () => {
    const { status, output } = check({ 'docs/sub/AGENTS.md': '# Sub\n\nLocal rules.\n' })
    expect(status).toBe(1)
    expect(output).toContain('docs/sub/AGENTS.md: [agents-tree] not linked from AGENTS.md')
  })

  it('names the directory AGENTS.md that must link a note', () => {
    const { status, output } = check({ 'entrypoints/library/notes/y.md': '# Another\n\nUnlinked.\n' })
    expect(status).toBe(1)
    expect(output).toContain('entrypoints/library/notes/y.md: [agents-tree] not linked from entrypoints/library/AGENTS.md')
  })

  it('flags a bare @ path in an instruction file', () => {
    const { status, output } = check({
      'entrypoints/library/AGENTS.md': edit(
        'entrypoints/library/AGENTS.md',
        'See [notes/x.md](notes/x.md) for the list rules.',
        'See [notes/x.md](notes/x.md) and @foo/bar.md for the list rules.',
      ),
    })
    expect(status).toBe(1)
    expect(output).toContain('[agents-tree] an @import would inline the file whole')
  })

  it('allows @ paths in backticks and fences', () => {
    const { status } = check({
      'entrypoints/library/AGENTS.md': edit(
        'entrypoints/library/AGENTS.md',
        'See [notes/x.md](notes/x.md) for the list rules.',
        'See [notes/x.md](notes/x.md). Run `@foo/bar` when needed.\n\n~~~\n@fenced/example\n~~~',
      ),
    })
    expect(status).toBe(0)
  })

  it('names the citing place of an identifier whose definition is gone', () => {
    const { status, output } = check({ 'docs/decisions.md': edit('docs/decisions.md', `## ${Q1} Window sizing`, '## Window sizing') })
    expect(status).toBe(1)
    expect(output).toContain(`e2e/toolbar.spec.ts:3: [retired-id] ${Q1} is cited but not defined in any Markdown`)
  })

  it('names a convention-file list item that ends on a fragment mark, and lets a continued item pass (RV-DOC-03)', () => {
    const broken = check({
      'entrypoints/library/notes/x.md': edit('entrypoints/library/notes/x.md', 'A card grid, fifty per page.', 'A card grid, fifty per page；\n- one more line'),
    })
    expect(broken.status).toBe(1)
    expect(broken.output).toMatch(/entrypoints\/library\/notes\/x\.md:\d+: \[list-tail\]/)
    // the mark mid-item is fine: the item keeps going on the next line
    const continued = check({
      'entrypoints/library/notes/x.md': '# Lists\n\n- A card grid, fifty per page；\n  the page keeps counting up.\n',
    })
    expect(continued.status).toBe(0)
  })
})

/** A README as rows, so a case can say exactly which row it changes. */
const rows = (...lines: string[]) => lines.join('\n') + '\n'

/** The text with one piece swapped; fails loudly when the piece is gone, so a case cannot pass by editing nothing. */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`the README no longer contains ${from}`)
  return text.replace(from, to)
}

const EN_README = rows(
  '<!-- Keep README.md and README.zh-CN.md in sync. -->',
  '',
  '# AnnHub',
  '',
  '**English** | [简体中文](README.zh-CN.md)',
  '',
  '> Keep it local.',
  '',
  '![The library](website/og/en.png)',
  '',
  'Try it on [the site](https://example.com/en#library).',
  '',
  '## Install',
  '',
  '1. Add it to Chrome.',
  '2. Open the library.',
  '',
  '```bash',
  'pnpm run build   # build the extension',
  '```',
)

const ZH_README = rows(
  '<!-- 两份保持同步。 -->',
  '',
  '# AnnHub',
  '',
  '[English](README.md) | **简体中文**',
  '',
  '> 留在本地。',
  '',
  '![资料库](website/og/zh-CN.png)',
  '',
  '在[官网](https://example.com/zh-CN#library)试一试。',
  '',
  '## 安装',
  '',
  '1. 添加到 Chrome。',
  '2. 打开资料库。',
  '',
  '```bash',
  'pnpm run build   # 构建扩展',
  '```',
)

describe('the READMEs, English by default and Chinese beside it', () => {
  const images = { 'website/og/en.png': 'png', 'website/og/zh-CN.png': 'png' }
  const pair = (en = EN_README, zh = ZH_README) => check({ ...images, 'README.md': en, 'README.zh-CN.md': zh })

  it('pass when the blocks, links and commands match, whatever the sentences, comments and language directories say', () => {
    const { status, output } = pair()
    expect(output).toContain('readme-pair: ')
    expect(status).toBe(0)
  })

  it('name the README whose translation is missing', () => {
    const { status, output } = check({ ...images, 'README.zh-CN.md': null })
    expect(status).toBe(1)
    expect(output).toContain('README.zh-CN.md: [readme-pair] is missing')
  })

  it('name the README whose first lines do not link to its translation', () => {
    const { status, output } = pair(swap(EN_README, '**English** | [简体中文](README.zh-CN.md)', '**English**'))
    expect(status).toBe(1)
    expect(output).toContain('README.md:1: [readme-pair] the first lines do not link to README.zh-CN.md')
  })

  it('name the block where the translation has fewer list items', () => {
    const { status, output } = pair(EN_README, swap(ZH_README, '2. 打开资料库。\n', ''))
    expect(status).toBe(1)
    expect(output).toContain('README.zh-CN.md:15: [readme-pair] block 7 is list:1, but README.md:15 has list:2 at the same place')
  })

  it('name the block that only one of them has', () => {
    const { status, output } = pair(swap(EN_README, '## Install\n', '## Install\n\nA note.\n'))
    expect(status).toBe(1)
    expect(output).toContain('README.zh-CN.md:15: [readme-pair] block 7 is list:2, but README.md:15 has p at the same place')
  })

  it('name a link that one of them points elsewhere', () => {
    const { status, output } = pair(EN_README, swap(ZH_README, '(https://example.com/zh-CN#library)', '(https://example.com/zh-CN/docs)'))
    expect(status).toBe(1)
    expect(output).toContain('README.md:11: [readme-pair] links to https://example.com/{locale}#library 1 time(s), but README.zh-CN.md 0')
    expect(output).toContain('README.zh-CN.md:11: [readme-pair] links to https://example.com/{locale}/docs 1 time(s), but README.md 0')
  })

  it('name a code block whose command differs, and let only its comments differ', () => {
    const { status, output } = pair(EN_README, swap(ZH_README, 'pnpm run build', 'pnpm run test'))
    expect(status).toBe(1)
    expect(output).toContain('README.zh-CN.md:19: [readme-pair] the code block differs from the one at README.md:18 (only comments after "#" may differ)')
  })
})

describe('what the READMEs state about the repository', () => {
  const repository = {
    'package.json': '{ "scripts": { "build": "wxt build" } }\n',
    'wxt.config.ts': "export default { manifest: { minimum_chrome_version: '116', commands: { shot: { suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' } } } } }\n",
  }
  const EN = rows(
    '# AnnHub',
    '',
    '[简体中文](README.zh-CN.md)',
    '',
    'Needs Chrome 116 or later. Press `Ctrl+Shift+S` (`Command+Shift+S` on macOS), or run `pnpm run build`.',
    '',
    '```text',
    'annhub/',
    '├── docs/             # Docs',
    '├── e2e/              # Tests',
    '└── entrypoints/      # Entry points',
    '    └── library/      # The library',
    '```',
  )
  const ZH = rows(
    '# AnnHub',
    '',
    '[English](README.md)',
    '',
    '需要 Chrome 116 或更高版本。按 `Ctrl+Shift+S`（macOS 上是 `Command+Shift+S`），或运行 `pnpm run build`。',
    '',
    '```text',
    'annhub/',
    '├── docs/             # 文档',
    '├── e2e/              # 测试',
    '└── entrypoints/      # 入口',
    '    └── library/      # 资料库',
    '```',
  )
  const held = (en = EN, zh = ZH) => check({ ...repository, 'README.md': en, 'README.zh-CN.md': zh })

  it('pass when the commands, paths, shortcuts and Chrome version are the repository’s', () => {
    const { status, output } = held()
    expect(output).toContain('readme-fact: 2 README file(s)')
    expect(status).toBe(0)
  })

  it('name a pnpm script that package.json does not have', () => {
    const { status, output } = held(swap(EN, 'pnpm run build', 'pnpm run ship'))
    expect(status).toBe(1)
    expect(output).toContain('README.md:5: [readme-fact] `pnpm run ship` is not a script in package.json')
  })

  it('name a path in the project structure that does not exist, and the directory it should name', () => {
    const { status, output } = held(swap(EN, '├── docs/ ', '├── doc/  '))
    expect(status).toBe(1)
    expect(output).toContain('README.md:9: [readme-fact] the project structure names doc, which does not exist')
    expect(output).toContain('README.md:7: [readme-fact] the project structure does not list docs/, a directory of the repository')
  })

  it('name a directory of the repository that the project structure leaves out', () => {
    const { status, output } = held(swap(EN, '├── e2e/              # Tests\n', ''), swap(ZH, '├── e2e/              # 测试\n', ''))
    expect(status).toBe(1)
    expect(output).toContain('README.md:7: [readme-fact] the project structure does not list e2e/, a directory of the repository')
    expect(output).toContain('README.zh-CN.md:7: [readme-fact] the project structure does not list e2e/, a directory of the repository')
  })

  it('name a shortcut the manifest does not suggest, and one it suggests that the README leaves out', () => {
    const { status, output } = held(swap(EN, '`Ctrl+Shift+S`', '`Ctrl+Shift+X`'))
    expect(status).toBe(1)
    expect(output).toContain('README.md:5: [readme-fact] the shortcut Ctrl+Shift+X is not a suggested_key in wxt.config.ts')
    expect(output).toContain('README.md: [readme-fact] does not state the shortcut `Ctrl+Shift+S` that wxt.config.ts suggests')
  })

  it('name a README that states another minimum Chrome version than the manifest', () => {
    const { status, output } = held(EN, swap(ZH, 'Chrome 116', 'Chrome 114'))
    expect(status).toBe(1)
    expect(output).toContain('README.zh-CN.md:5: [readme-fact] says Chrome 114, but wxt.config.ts sets minimum_chrome_version to 116')
  })
})
