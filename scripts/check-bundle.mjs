#!/usr/bin/env node
// Byte budgets for the built bundles, run with `pnpm run check:bundle` (RV-TEST-10).
//
// check:size watches the sources, but nothing watched the artifacts: content.js grew to 540 KB
// through many small steps (RV-CAP-16). This check reads .output/chrome-mv3 after a build — it
// needs one, so it is not part of verify; CI runs it right after its build steps
// (check-consistency enforces that). The ceilings are the post-RV-LIB-22 sizes plus a tenth
// (RV-TEST-14).
//
// A page's ceiling covers its first screen: the files its HTML names in <script src> and
// <link rel="modulepreload">. Chunks a page pulls in later with import() (offscreen loads the
// article recognition that way) stay out of the ceiling. Every script and stylesheet the manifest
// ships and every built page must have a ceiling here: a new entry without one is the miss this
// check exists to catch, so it fails naming the file instead of passing silently.
//
//   --root <dir>   check another tree (the tests do)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1] ?? '.')

const OUTPUT = '.output/chrome-mv3'

/** One byte ceiling per shipped file; a page's ceiling covers the JS its first screen loads. */
export const BUNDLE_BUDGETS = {
  'content-scripts/content.js': 310950,
  'content-scripts/content.css': 27594,
  'background.js': 130744,
  'popup.html': 275682,
  'library.html': 539172,
  'options.html': 856,
  'offscreen.html': 65744,
  'sample.html': 0,
  'sample.en.html': 0,
}

/** The files a page loads on first screen: its <script src> and <link rel="modulepreload"> targets. HTML tag and attribute names are case-insensitive, so every pattern here is too. */
export function pageFirstScreenFiles(html) {
  const files = []
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const text = tag[0]
    if (/^<script/i.test(text)) {
      const src = /\bsrc="([^"]+)"/i.exec(text)
      if (src) files.push(src[1])
    } else if (/\brel="modulepreload"/i.test(text)) {
      const href = /\bhref="([^"]+)"/i.exec(text)
      if (href) files.push(href[1])
    }
  }
  return files
}

/** Every .html file under the output directory, as output-relative paths. */
function builtPages(outputDirectory) {
  const pages = []
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.html')) pages.push(relative(outputDirectory, path))
    }
  }
  walk(outputDirectory)
  return pages.sort()
}

/** The scripts and stylesheets the manifest ships: every content script and the service worker. */
function shippedFromManifest(manifest) {
  return [...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]), manifest.background?.service_worker].filter(Boolean)
}

export function bundleBudgetProblems(outputDirectory, budgets = BUNDLE_BUDGETS, sizeOf = path => statSync(path).size) {
  if (!existsSync(outputDirectory)) {
    return [`no build at ${OUTPUT}: run pnpm run build first`]
  }
  const problems = []
  const sizeAt = file => {
    const path = join(outputDirectory, file)
    if (!existsSync(path)) return null
    return sizeOf(path)
  }

  for (const [file, ceiling] of Object.entries(budgets)) {
    if (file.endsWith('.html')) {
      const htmlPath = join(outputDirectory, file)
      if (!existsSync(htmlPath)) {
        problems.push(`${file}: missing from the build`)
        continue
      }
      const loaded = pageFirstScreenFiles(readFileSync(htmlPath, 'utf8')).map(src => src.replace(/^\//, ''))
      let total = 0
      let missing = false
      for (const loadedFile of loaded) {
        const size = sizeAt(loadedFile)
        if (size === null) {
          problems.push(`${loadedFile}: named by ${file}'s first screen but missing from the build`)
          missing = true
          continue
        }
        total += size
      }
      // a static page loads nothing and budgets at 0: a script added to it later fails here
      if (!missing && total > ceiling) {
        problems.push(`${file}: first screen loads ${total} bytes over the ${ceiling}-byte ceiling (${loaded.join(', ')})`)
      }
      continue
    }
    const size = sizeAt(file)
    if (size === null) {
      problems.push(`${file}: missing from the build`)
      continue
    }
    if (size > ceiling) problems.push(`${file}: ${size} bytes over the ${ceiling}-byte ceiling`)
  }

  const manifestPath = join(outputDirectory, 'manifest.json')
  if (!existsSync(manifestPath)) {
    problems.push('manifest.json: missing from the build')
  } else {
    try {
      for (const file of shippedFromManifest(JSON.parse(readFileSync(manifestPath, 'utf8')))) {
        if (!(file in budgets)) problems.push(`${file}: the manifest ships it without a ceiling — add it to BUNDLE_BUDGETS`)
      }
    } catch {
      problems.push('manifest.json: cannot be parsed')
    }
  }
  for (const page of builtPages(outputDirectory)) {
    if (!(page in budgets)) problems.push(`${page}: a built page without a ceiling — add it to BUNDLE_BUDGETS`)
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDirectory = join(root, OUTPUT)
  const problems = bundleBudgetProblems(outputDirectory)
  for (const [file, ceiling] of Object.entries(BUNDLE_BUDGETS)) {
    const path = join(outputDirectory, file)
    if (!existsSync(path)) continue
    const size = file.endsWith('.html')
      ? pageFirstScreenFiles(readFileSync(path, 'utf8')).reduce((total, src) => total + statSync(join(outputDirectory, src.replace(/^\//, ''))).size, 0)
      : statSync(path).size
    console.log(`${String(size).padStart(8)} / ${ceiling}  ${file}`)
  }
  if (problems.length > 0) {
    console.error(`\n${problems.join('\n')}`)
    console.error(`\n${problems.length} bundle(s) over budget, missing or without a ceiling; a bundle that grew needs a deliberate ceiling change, not a silent one.`)
    process.exit(1)
  }
  console.log('\nBundles within their byte ceilings.')
}
