// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * scripts/check-lockfiles.mjs keeps download addresses out of the pnpm lockfiles. Each case builds a
 * small tree, puts one address where it does not belong, and expects the script to name the file.
 */

const script = resolve(__dirname, '../check-lockfiles.mjs')

const lockfile = (resolution: string) => `lockfileVersion: '9.0'

packages:

  left-pad@1.3.0:
    resolution: ${resolution}
`

const CLEAN = lockfile('{integrity: sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bzwv0vtuiPI8Ghr/PsK1Am3grLGoeN5Jg==}')
const onHost = (host: string) =>
  lockfile(`{integrity: sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bzwv0vtuiPI8Ghr/PsK1Am3grLGoeN5Jg==, tarball: https://${host}/left-pad/-/left-pad-1.3.0.tgz}`)

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

function check(files: Record<string, string>, ...flags: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'check-lockfiles-'))
  directories.push(root)
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [script, '--root', root, ...flags], { encoding: 'utf8' })
  return { root, status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('check-lockfiles', () => {
  it('accepts lockfiles that record integrity hashes only, in every package directory', () => {
    const { status, output } = check({ 'pnpm-lock.yaml': CLEAN, 'website/pnpm-lock.yaml': CLEAN })
    expect(status, output).toBe(0)
    expect(output).toContain('pnpm-lock.yaml: no download address outside registry.npmjs.org')
    expect(output).toContain('website/pnpm-lock.yaml: no download address outside registry.npmjs.org')
  })

  it('accepts this repository', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0)
  })

  it('accepts an address on the public registry', () => {
    expect(check({ 'pnpm-lock.yaml': onHost('registry.npmjs.org') }).status).toBe(0)
  })

  it('names the lockfile that carries a mirror address, and how to fix it', () => {
    const { status, output } = check({ 'pnpm-lock.yaml': CLEAN, 'website/pnpm-lock.yaml': onHost('registry.npmmirror.com') })
    expect(status).toBe(1)
    expect(output).toContain('website/pnpm-lock.yaml: 1 package addresses point at registry.npmmirror.com (a mirror: run `pnpm run check:lockfiles --fix`)')
  })

  it('moves a known mirror to the public registry with --fix, leaving the integrity hash alone', () => {
    const { root, status, output } = check({ 'pnpm-lock.yaml': onHost('registry.npmmirror.com') }, '--fix')
    expect(status, output).toBe(0)
    expect(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(onHost('registry.npmjs.org'))
  })

  it('leaves an unknown host for a human, even with --fix', () => {
    const { root, status, output } = check({ 'pnpm-lock.yaml': onHost('packages.example.test') }, '--fix')
    expect(status).toBe(1)
    expect(output).toContain('pnpm-lock.yaml: 1 package addresses point at packages.example.test (unknown host: decide by hand)')
    expect(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')).toBe(onHost('packages.example.test'))
  })

  it('fails a tree that has no lockfile at all', () => {
    const { status, output } = check({ 'package.json': '{}\n' })
    expect(status).toBe(1)
    expect(output).toContain('No pnpm-lock.yaml found')
  })
})
