#!/usr/bin/env node
// Checks that the npm lockfiles download packages from the public registry only.
//
// A developer who points npm at a mirror (to install faster) gets the mirror's address written
// into `resolved` for every package that install touches. The integrity hash stays correct, but
// the address does not belong in the repository: CI would then depend on that mirror being up.
//
//   npm run check:lockfiles            report; exit 1 when a mirror address is found
//   npm run check:lockfiles -- --fix   rewrite the host of known mirrors to registry.npmjs.org
//
// Only the host changes (the tarball path is the same on every mirror of the npm registry), so
// `integrity` and the dependency tree are untouched. No dependencies.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const LOCKFILES = ['package-lock.json', 'website/package-lock.json']
const PUBLIC_REGISTRY = 'registry.npmjs.org'
/** Mirrors of the npm registry that serve the same tarball paths. */
const KNOWN_MIRRORS = ['registry.npmmirror.com', 'registry.npm.taobao.org', 'r.cnpmjs.org', 'registry.cnpmjs.org', 'registry.yarnpkg.com']

const fix = process.argv.includes('--fix')

/** Every registry tarball address in a lockfile: `"resolved": "https://host/…/name-1.0.0.tgz"`. */
const TARBALL = /"resolved": "https?:\/\/([^/"]+)\/[^"]*\.tgz"/g

let failed = false

for (const relative of LOCKFILES) {
  const file = join(root, relative)
  let text = readFileSync(file, 'utf8')

  const hosts = new Map()
  for (const match of text.matchAll(TARBALL)) hosts.set(match[1], (hosts.get(match[1]) ?? 0) + 1)
  const foreign = [...hosts].filter(([host]) => host !== PUBLIC_REGISTRY)
  if (foreign.length === 0) {
    console.log(`${relative}: all ${hosts.get(PUBLIC_REGISTRY) ?? 0} package addresses are on ${PUBLIC_REGISTRY}`)
    continue
  }

  if (fix) {
    for (const [host, count] of foreign) {
      if (!KNOWN_MIRRORS.includes(host)) continue
      text = text
        .replaceAll(`"resolved": "https://${host}/`, `"resolved": "https://${PUBLIC_REGISTRY}/`)
        .replaceAll(`"resolved": "http://${host}/`, `"resolved": "https://${PUBLIC_REGISTRY}/`)
      console.log(`${relative}: ${count} addresses moved from ${host} to ${PUBLIC_REGISTRY}`)
    }
    writeFileSync(file, text)
  }

  // After a fix only hosts this script does not know remain, and those need a human.
  const remaining = new Map()
  for (const match of text.matchAll(TARBALL)) if (match[1] !== PUBLIC_REGISTRY) remaining.set(match[1], (remaining.get(match[1]) ?? 0) + 1)
  for (const [host, count] of remaining) {
    failed = true
    const known = KNOWN_MIRRORS.includes(host)
    console.error(`${relative}: ${count} package addresses point at ${host}${known ? ' (a mirror: run `npm run check:lockfiles -- --fix`)' : ' (unknown host: decide by hand)'}`)
  }
}

if (failed) {
  console.error('\nA lockfile must not depend on a mirror. Registries are configured per machine (`npm config get registry`), not in the repository.')
  process.exit(1)
}
