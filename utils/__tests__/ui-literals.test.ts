import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

/**
 * Everything the user reads goes through `utils/ui-text.ts`, which has a Chinese and an English version of
 * each line (extension.md §2.7, §8.11). A literal in a component or an overlay is a line with only one
 * language: it shows up as Chinese in an English browser, or as English in a Chinese one. The AST finds them
 * — text between JSX tags, user-facing attributes written as plain strings, and Chinese in any string.
 */

const root = resolve(__dirname, '../..')

/** Words that are the same in every language: the product's name, file formats, option letters. */
const SAME_EVERYWHERE = new Set(['AnnHub', 'PNG', 'JPEG', 'WebP', 'A', 'B'])
const USER_FACING_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description'])
const CJK = /[㐀-鿿]/

function sourceFiles(dir: string, extensions: RegExp): string[] {
  return readdirSync(dir).flatMap(name => {
    if (['node_modules', '.output', '.wxt', '__tests__', 'dist'].includes(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path, extensions)
    return extensions.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })
}

export function literalOffences(source: string, fileName = 'file.tsx'): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const offences: string[] = []
  const at = (node: ts.Node): string => `line ${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim()
      if (text && /\p{L}/u.test(text) && !SAME_EVERYWHERE.has(text)) offences.push(`${at(node)}: text between tags "${text}"`)
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && USER_FACING_ATTRIBUTES.has(node.name.getText(file))) {
      const text = node.initializer.text
      if (/\p{L}/u.test(text) && !SAME_EVERYWHERE.has(text)) offences.push(`${at(node)}: ${node.name.getText(file)}="${text}"`)
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) && CJK.test(node.text)) {
      offences.push(`${at(node)}: Chinese in a string "${node.text.slice(0, 24)}"`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return offences
}

describe('the detector', () => {
  it('flags text between tags, plain-string attributes and Chinese strings', () => {
    expect(literalOffences('const a = <p>Save changes</p>')).toHaveLength(1)
    expect(literalOffences('const a = <button aria-label="Close" />')).toHaveLength(1)
    expect(literalOffences("const a = '保存'", 'a.ts')).toHaveLength(1)
    expect(literalOffences('const a = <p title={`你好`}>{x}</p>')).toHaveLength(1)
  })

  it('lets through localized text, symbols, brand and format names, and code in attributes', () => {
    expect(literalOffences("const a = <p aria-label={uiText('x')}>{uiText('y')}</p>")).toHaveLength(0)
    expect(literalOffences('const a = <button>✕</button>')).toHaveLength(0)
    expect(literalOffences('const a = <div className="nav-item" data-testid="list-count">AnnHub</div>')).toHaveLength(0)
    expect(literalOffences('const a = <option value="png">PNG</option>')).toHaveLength(0)
    expect(literalOffences("const a: Array<string> = []; if (b > c && d < e) f('plain English in code')", 'a.ts')).toHaveLength(0)
  })
})

describe('what the user can read is localized (extension.md §2.7)', () => {
  const files = [...sourceFiles(join(root, 'entrypoints'), /\.(ts|tsx)$/), ...sourceFiles(join(root, 'utils'), /\.(ts|tsx)$/)].filter(
    path => relative(root, path) !== join('utils', 'ui-text.ts'),
  )

  it('scans the screens and overlays', () => {
    expect(files.some(path => path.endsWith(join('library', 'App.tsx')))).toBe(true)
    expect(files.some(path => path.endsWith(join('content', 'clip-flow.ts')))).toBe(true)
  })

  for (const path of files) {
    it(`${relative(root, path)} holds no literal that only one language can read`, () => {
      expect(literalOffences(readFileSync(path, 'utf8'), path)).toEqual([])
    })
  }
})
