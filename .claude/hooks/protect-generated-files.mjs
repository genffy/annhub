#!/usr/bin/env node
// PreToolUse hook: stop edits to files that are generated or have a single owner.
// Claude Code passes the tool call as JSON on stdin; exit code 2 blocks the call and
// sends stderr back to the model so it can pick the right route instead.
//
// A hook is deterministic, unlike a line in AGENTS.md — keep the list short and each
// reason actionable.

import { readFileSync } from 'node:fs'

const rules = [
  {
    test: p => /(^|\/)pnpm-lock\.yaml$/.test(p),
    why: 'The lockfile is owned by pnpm. Change package.json and run `pnpm install` (the pnpm version is the one package.json pins in packageManager).',
  },
  {
    test: p => /(^|\/)scripts\/size-ledger\.json$/.test(p),
    why: 'The size ledger only goes down. Split the file, then run pnpm run check:size --lower; do not edit the numbers by hand.',
  },
  {
    test: p => /(^|\/)(\.output|\.wxt|\.next|node_modules)\//.test(p),
    why: 'Build output and installed dependencies are not source.',
  },
  {
    test: p => /(^|\/)\.env(\.(?!publish$)[^/]+)?$/.test(p),
    why: 'Environment files hold secrets and are not edited by the agent.',
  },
  { test: p => /(^|\/)\.git\//.test(p), why: 'Do not edit git internals.' },
]

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // Not a tool call we understand: never block on a parsing problem.
}

const filePath = String(input?.tool_input?.file_path ?? input?.tool_input?.notebook_path ?? '').replaceAll('\\', '/')
if (!filePath) process.exit(0)

const hit = rules.find(rule => rule.test(filePath))
if (hit) {
  console.error(`Blocked: ${filePath}\n${hit.why}`)
  process.exit(2)
}
