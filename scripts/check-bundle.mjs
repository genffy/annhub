#!/usr/bin/env node
// Byte budgets for the built bundles, run with `pnpm run check:bundle` (RV-TEST-10).
//
// check:size watches the sources, but nothing watched the artifacts: content.js grew to 540 KB
// through many small steps (RV-CAP-16). This check reads .output/chrome-mv3 after a build — it
// needs one, so it is not part of verify; CI runs it right after its build steps
// (check-consistency enforces that). The ceilings are the post-RV-CAP-16/17 sizes plus a tenth.
//
//   --root <dir>   check another tree (the tests do)

import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1] ?? '.')

const OUTPUT = '.output/chrome-mv3'

/** One byte ceiling per shipped script; a bundle without a ceiling is the miss to fix. */
export const BUNDLE_BUDGETS = {
  'content-scripts/content.js': 301068,
  'background.js': 130576,
}

export function bundleBudgetProblems(outputDirectory, budgets = BUNDLE_BUDGETS, sizeOf = path => statSync(path).size) {
  if (!existsSync(outputDirectory)) {
    return [`no build at ${OUTPUT}: run pnpm run build first`]
  }
  const problems = []
  for (const [file, ceiling] of Object.entries(budgets)) {
    const path = join(outputDirectory, file)
    if (!existsSync(path)) {
      problems.push(`${file}: missing from the build`)
      continue
    }
    const size = sizeOf(path)
    if (size > ceiling) problems.push(`${file}: ${size} bytes over the ${ceiling}-byte ceiling`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = bundleBudgetProblems(join(root, OUTPUT))
  for (const file of Object.keys(BUNDLE_BUDGETS)) {
    const path = join(root, OUTPUT, file)
    if (existsSync(path)) console.log(`${String(statSync(path).size).padStart(8)} / ${BUNDLE_BUDGETS[file]}  ${file}`)
  }
  if (problems.length > 0) {
    console.error(`\n${problems.join('\n')}`)
    console.error(`\n${problems.length} bundle(s) over budget or missing; a bundle that grew needs a deliberate ceiling change, not a silent one.`)
    process.exit(1)
  }
  console.log('\nBundles within their byte ceilings.')
}
