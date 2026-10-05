import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * The `ignore` command in netlify.toml decides whether a production build is skipped, and exit code 0 means skip.
 * Netlify reports every such skip as "Canceled build due to no content change", so a wrong "no change" shows up
 * as a deploy that never happens: after #64 was merged the production build was cancelled although the website had
 * changed. These cases run the real command from the real netlify.toml in a throwaway git repository.
 */

const root = resolve(__dirname, '../..')

/** The `[build]` ignore command, unescaped from its TOML basic string. */
function ignoreCommand(): string {
  const toml = readFileSync(join(root, 'netlify.toml'), 'utf8')
  const build = /^\[build\]\n([\s\S]*?)(?=^\[)/m.exec(toml)?.[1]
  const line = build && /^\s*ignore\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(build)
  if (!line) throw new Error('netlify.toml has no [build] ignore command')
  return JSON.parse(`"${line[1]}"`)
}

/** What the command was before: it trusted CACHED_COMMIT_REF without looking at what that commit is. */
const PREVIOUS = `test -n "$CACHED_COMMIT_REF" && git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- ':/website' ':/netlify.toml'`

const identity = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
let repo = ''
const shas: Record<'base' | 'docs' | 'prHead' | 'merged' | 'docsAfter' | 'configAfter', string> = {} as never

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: { ...process.env, ...identity } }).trim()
}

function commit(files: Record<string, string>, message: string): string {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true })
    writeFileSync(join(repo, file), content)
  }
  git('add', '-A')
  git('commit', '-q', '-m', message)
  return git('rev-parse', 'HEAD')
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'netlify-ignore-'))
  git('init', '-q', '-b', 'main')
  shas.base = commit({ 'website/app/page.tsx': 'a', 'docs/notes.md': 'a', 'netlify.toml': 'a' }, 'base')
  shas.docs = commit({ 'docs/notes.md': 'b' }, 'docs only')
  // A pull request changes the website. Merging it by rebase writes the same change as a new commit on main:
  // same content as the head of the pull request, but the head is not part of main's history.
  git('switch', '-q', '-c', 'pr')
  shas.prHead = commit({ 'website/app/page.tsx': 'b' }, 'website change on the pull request branch')
  git('switch', '-q', 'main')
  shas.merged = commit({ 'website/app/page.tsx': 'b' }, 'website change, rebased onto main')
  shas.docsAfter = commit({ 'docs/notes.md': 'c' }, 'docs only, after the merge')
  shas.configAfter = commit({ 'netlify.toml': 'b' }, 'netlify.toml only')
})

afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

/** Whether Netlify would skip the build: the command runs inside the base directory with these two variables. */
function skips(command: string, cached: string, commitRef: string): boolean {
  const result = spawnSync('bash', ['-c', command], {
    cwd: join(repo, 'website'),
    env: { ...process.env, CACHED_COMMIT_REF: cached, COMMIT_REF: commitRef },
    encoding: 'utf8',
  })
  return result.status === 0
}

describe('netlify.toml ignore command', () => {
  const skipsNow = (cached: string, commitRef: string) => skips(ignoreCommand(), cached, commitRef)

  it('skips when the last built commit is an ancestor and nothing watched has changed since', () => {
    expect(skipsNow(shas.merged, shas.docsAfter)).toBe(true)
  })

  it('builds when the website changed since the last build', () => {
    expect(skipsNow(shas.docs, shas.merged)).toBe(false)
    expect(skipsNow(shas.base, shas.docsAfter)).toBe(false)
  })

  it('builds when only netlify.toml changed', () => {
    expect(skipsNow(shas.docsAfter, shas.configAfter)).toBe(false)
  })

  it('builds without a cache: CACHED_COMMIT_REF is empty, or equal to COMMIT_REF as Netlify documents it', () => {
    expect(skipsNow('', shas.merged)).toBe(false)
    expect(skipsNow(shas.merged, shas.merged)).toBe(false)
  })

  it('builds when the last built commit is the head of a pull request that was merged by rebase', () => {
    expect(skipsNow(shas.prHead, shas.merged)).toBe(false)
  })

  it('builds when git does not know the cached commit', () => {
    expect(skipsNow('deadbeef00000000000000000000000000000000', shas.merged)).toBe(false)
  })

  it('shows why these cases matter: the previous command skipped both of the wrong ones', () => {
    expect(skips(PREVIOUS, shas.merged, shas.merged)).toBe(true)
    expect(skips(PREVIOUS, shas.prHead, shas.merged)).toBe(true)
  })
})
