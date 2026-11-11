#!/usr/bin/env node
// Checks that the pnpm lockfiles name no download address outside the public registry.
//
// pnpm records a registry package by its integrity hash alone, so a machine that installs from a
// mirror (to install faster) leaves no trace in `pnpm-lock.yaml`. An address is written only for a
// package pnpm cannot find again by name and version: a mirror that serves tarballs from a path of
// its own, a `lockfileIncludeTarballUrl` setting, or a dependency given as a URL. CI would then
// depend on that host being up, and the address does not belong in the repository.
//
//   pnpm run check:lockfiles          report; exit 1 when an address outside the registry is found
//   pnpm run check:lockfiles --fix    rewrite the host of known mirrors to registry.npmjs.org
//   node scripts/check-lockfiles.mjs --root <dir>   check another tree (the tests do)
//
// Only the host changes (the tarball path is the same on every mirror of the npm registry), so
// `integrity` and the dependency tree are untouched. Every `pnpm-lock.yaml` of the repository is
// read: a new package directory needs no entry here. No dependencies.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1] ?? '.')

const LOCKFILE = 'pnpm-lock.yaml'
const PUBLIC_REGISTRY = 'registry.npmjs.org'
/** Mirrors of the npm registry that serve the same tarball paths. */
const KNOWN_MIRRORS = ['registry.npmmirror.com', 'registry.npm.taobao.org', 'r.cnpmjs.org', 'registry.cnpmjs.org', 'registry.yarnpkg.com']
const NOT_SOURCE = new Set(['node_modules', '.git', '.next', '.output', '.wxt', '.build', 'build', 'coverage'])

const fix = process.argv.includes('--fix')

/** The lockfiles that belong to the repository: tracked ones and new ones not yet added. A tree without git (the tests') is walked instead. */
function listLockfiles() {
  if (existsSync(join(root, '.git'))) {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', LOCKFILE, `*/${LOCKFILE}`], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(file => file && existsSync(join(root, file)))
  }
  const found = []
  const walk = directory => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!NOT_SOURCE.has(entry.name)) walk(relative)
      } else if (entry.name === LOCKFILE) found.push(relative)
    }
  }
  walk('')
  return found
}

/** Every download address in a lockfile: `tarball: https://host/…` inside a `resolution`. */
const TARBALL = /\btarball:\s*['"]?https?:\/\/([^/'"\s,}]+)\//g

const hostsIn = text => {
  const hosts = new Map()
  for (const match of text.matchAll(TARBALL)) hosts.set(match[1], (hosts.get(match[1]) ?? 0) + 1)
  return hosts
}

const lockfiles = listLockfiles()
let failed = false

if (lockfiles.length === 0) {
  console.error(`No ${LOCKFILE} found: every package directory commits its lockfile.`)
  failed = true
}

for (const relative of lockfiles) {
  const file = join(root, relative)
  let text = readFileSync(file, 'utf8')

  const foreign = [...hostsIn(text)].filter(([host]) => host !== PUBLIC_REGISTRY)
  if (foreign.length === 0) {
    console.log(`${relative}: no download address outside ${PUBLIC_REGISTRY}`)
    continue
  }

  if (fix) {
    for (const [host, count] of foreign) {
      if (!KNOWN_MIRRORS.includes(host)) continue
      text = text.replaceAll(`https://${host}/`, `https://${PUBLIC_REGISTRY}/`).replaceAll(`http://${host}/`, `https://${PUBLIC_REGISTRY}/`)
      console.log(`${relative}: ${count} addresses moved from ${host} to ${PUBLIC_REGISTRY}`)
    }
    writeFileSync(file, text)
  }

  // After a fix only hosts this script does not know remain, and those need a human.
  for (const [host, count] of hostsIn(text)) {
    if (host === PUBLIC_REGISTRY) continue
    failed = true
    const known = KNOWN_MIRRORS.includes(host)
    console.error(`${relative}: ${count} package addresses point at ${host}${known ? ' (a mirror: run `pnpm run check:lockfiles --fix`)' : ' (unknown host: decide by hand)'}`)
  }
}

if (failed) {
  console.error('\nA lockfile must not depend on a mirror. Registries are configured per machine (`pnpm config get registry`), not in the repository.')
  process.exit(1)
}
