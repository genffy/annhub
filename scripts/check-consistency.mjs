#!/usr/bin/env node
// Checks that settings which have to agree across files still agree.
//
// Environment, dependency, build and deploy settings live in several files at once: the Node.js
// version in `.node-version`, the CI setup and the README; the Next.js major in
// `website/package.json` and the docs; the package directories in Dependabot and the audit
// workflow. Changing one place and missing the others is a recurring failure that neither the type
// checker nor the unit tests see, so every coupling that can be read mechanically is an assertion
// here. The rule is AGENTS.md「联动一致性」; this script is how it is enforced.
//
//   npm run check:consistency
//   node scripts/check-consistency.mjs --root <dir>   check another tree (the tests do)
//
// A failure means a related place was missed: update it. Do not delete the assertion, loosen its
// pattern or add an exception to get green. A new coupling gets a new assertion.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const rootFlag = process.argv.indexOf('--root')
const root = rootFlag === -1 ? resolve(dirname(fileURLToPath(import.meta.url)), '..') : resolve(process.argv[rootFlag + 1] ?? '.')

const problems = []
const fail = (where, message) => {
  problems.push(`${where}: ${message}`)
}

const exists = relative => existsSync(join(root, relative))
const read = relative => (exists(relative) ? readFileSync(join(root, relative), 'utf8') : null)

function readJson(relative) {
  const text = read(relative)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    fail(relative, 'is not valid JSON')
    return null
  }
}

const NOT_SOURCE = new Set(['node_modules', '.git', '.next', '.output', '.wxt', '.build', 'build', 'coverage'])

/**
 * The files that belong to the repository: tracked ones and new ones not yet added, so a change is checked before it is
 * committed. A tree without git (the tests') is walked instead.
 */
function listFiles() {
  if (exists('.git')) {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(file => file && exists(file))
  }
  const files = []
  const walk = directory => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name
      if (!entry.isDirectory()) files.push(relative)
      else if (!NOT_SOURCE.has(entry.name)) walk(relative)
    }
  }
  walk('')
  return files
}

const files = listFiles()
const isWorkflow = file => /^\.github\/(workflows\/[^/]+\.ya?ml|actions\/.+\/action\.ya?ml)$/.test(file)

const manifests = files
  .filter(file => file === 'package.json' || file.endsWith('/package.json'))
  .map(file => ({ file, directory: file === 'package.json' ? '' : file.slice(0, -'/package.json'.length), json: readJson(file) ?? {} }))
const dependenciesOf = ({ json }) => ({ ...json.dependencies, ...json.devDependencies })
const nextApps = manifests.filter(manifest => dependenciesOf(manifest).next !== undefined)

/** `/` for the repository root, `/website` for a subdirectory: how Dependabot writes them. */
const normalizeDirectory = directory => {
  const clean = directory.replace(/^\.?\/*|\/+$/g, '')
  return clean === '' ? '/' : `/${clean}`
}

/** The first number in a version or range: `^16.3.8`, `>=24.0.0`, `v24` and `24` are majors 16, 24, 24 and 24. */
const majorOf = value => {
  const match = /\d+/.exec(String(value ?? ''))
  return match ? Number(match[0]) : null
}

/** Whether an `engines.node` range allows a Node.js major; null when the range is not a form this repository uses. */
function allows(range, major) {
  const text = String(range).trim()
  const atLeast = /^>=\s*v?(\d+)(\.\d+)*$/.exec(text)
  if (atLeast) return major >= Number(atLeast[1])
  const pinned = /^[\^~]?\s*v?(\d+)(\.(\d+|x|\*))*$/.exec(text)
  if (pinned) return major === Number(pinned[1])
  return null
}

// --- Node.js: `.node-version` is the one source. -------------------------------------------------

const nodeMajor = majorOf(read('.node-version'))

function checkNode() {
  if (nodeMajor === null) return fail('.node-version', 'is missing or has no version; it is the single source of the Node.js version')

  for (const manifest of manifests) {
    const { file, json } = manifest
    const range = json.engines?.node
    if (range !== undefined) {
      const ok = allows(range, nodeMajor)
      if (ok === null) fail(file, `engines.node "${range}" is not a form this check reads; use ">=N" or "^N"`)
      else if (!ok) fail(file, `engines.node "${range}" does not allow Node.js ${nodeMajor}, the version in .node-version`)
    }
    const types = dependenciesOf(manifest)['@types/node']
    if (types !== undefined && majorOf(types) !== nodeMajor)
      fail(file, `@types/node ${types} is not Node.js ${nodeMajor}: the type definitions follow the runtime in .node-version`)
  }

  for (const file of files.filter(isWorkflow)) {
    read(file)
      .split('\n')
      .forEach((line, index) => {
        if (/^\s*(-\s+)?node-version:\s*\S/.test(line))
          fail(`${file}:${index + 1}`, 'sets a literal node-version; use `node-version-file: .node-version` so the version has one source')
      })
  }

  const stated = /Node\.js (\d+)\.x/.exec(read('README.md') ?? '')
  if (stated && Number(stated[1]) !== nodeMajor) fail('README.md', `says Node.js ${stated[1]}.x, but .node-version is ${nodeMajor}`)
}

// --- Next.js: the framework, its ESLint config and the docs move together. -----------------------

function checkNext() {
  for (const manifest of nextApps) {
    const { file, directory } = manifest
    const dependencies = dependenciesOf(manifest)
    const config = dependencies['eslint-config-next']
    if (config !== undefined && majorOf(config) !== majorOf(dependencies.next)) fail(file, `eslint-config-next ${config} is not the same major as next ${dependencies.next}`)

    const readmeFile = directory ? `${directory}/README.md` : 'README.md'
    const readme = read(readmeFile)
    if (readme === null) continue
    for (const [label, name] of [
      ['Next.js', 'next'],
      ['React', 'react'],
      ['next-intl', 'next-intl'],
    ]) {
      const stated = new RegExp(`${label.replace('.', '\\.')} (\\d+)`).exec(readme)
      const declared = majorOf(dependencies[name])
      if (stated && declared !== null && Number(stated[1]) !== declared) fail(readmeFile, `says ${label} ${stated[1]}, but ${file} depends on ${name} ${dependencies[name]}`)
    }
  }
}

// --- Tailwind CSS: the major decides how PostCSS has to be set up. -------------------------------

const POSTCSS_CONFIGS = ['postcss.config.js', 'postcss.config.cjs', 'postcss.config.mjs', 'postcss.config.ts']

function checkTailwind() {
  for (const manifest of manifests) {
    const { file, directory } = manifest
    const dependencies = dependenciesOf(manifest)
    const major = majorOf(dependencies.tailwindcss)
    if (major === null) continue

    const configFile = POSTCSS_CONFIGS.map(name => (directory ? `${directory}/${name}` : name)).find(exists)
    // A mention in a comment is not a plugin.
    const config = configFile
      ? read(configFile)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
      : ''
    if (major >= 4) {
      const integration = ['@tailwindcss/postcss', '@tailwindcss/vite', '@tailwindcss/cli'].some(name => dependencies[name] !== undefined)
      if (!integration)
        fail(file, `tailwindcss ${dependencies.tailwindcss} needs @tailwindcss/postcss (or @tailwindcss/vite): since Tailwind CSS 4 the PostCSS plugin is a separate package`)
      if (/(?<![@\w/-])tailwindcss(?![\w/-])/.test(config))
        fail(configFile, `uses tailwindcss itself as a PostCSS plugin, which Tailwind CSS ${major} no longer allows; use @tailwindcss/postcss`)
    } else if (config.includes('@tailwindcss/postcss')) {
      fail(configFile, `uses @tailwindcss/postcss, which is the plugin for Tailwind CSS 4, but ${file} has tailwindcss ${dependencies.tailwindcss}`)
    }
  }
}

// --- Static website: build output, edge routing and the artifact deployed by CI agree. -----------

function checkCloudflare() {
  if (nextApps.length === 0) return
  const app = nextApps[0]
  const prefix = `${app.directory}/`
  if (files.includes(`${prefix}next-env.d.ts`)) fail(`${prefix}next-env.d.ts`, 'is generated by Next.js and must not be tracked')
  if (!(read(`${prefix}.gitignore`) ?? '').split(/\r?\n/).includes('/next-env.d.ts')) fail(`${prefix}.gitignore`, 'must ignore /next-env.d.ts')
  if (app.json.scripts?.typecheck !== 'next typegen && tsc --noEmit') fail(app.file, 'typecheck must generate Next.js declarations before running tsc')
  const configFile = `${prefix}wrangler.json`
  const config = readJson(configFile)
  if (!config) return fail(configFile, 'is required for the static website')
  if (exists('netlify.toml') || dependenciesOf(app)['@netlify/plugin-nextjs']) fail(configFile, 'the static website must not retain the Netlify runtime or deployment config')
  if (!/output:\s*['"]export['"]/.test(read(`${prefix}next.config.js`) ?? '')) fail(`${prefix}next.config.js`, 'must export static files with output: export')
  if (exists(`${prefix}proxy.ts`) || exists(`${prefix}middleware.ts`)) fail(prefix, 'a static export cannot depend on a Next.js proxy or middleware')
  if (config.main !== undefined || config.assets?.run_worker_first) fail(configFile, 'must serve assets without a Worker script or run_worker_first')
  if (config.assets?.directory !== './out') fail(configFile, 'assets.directory must be ./out, the Next.js export directory')
  if (config.assets?.html_handling !== 'none' || config.assets?.not_found_handling !== '404-page') fail(configFile, 'must retain explicit HTML aliases and real 404 responses')
  const cli = dependenciesOf(app).wrangler
  if (!/^\d+\.\d+\.\d+$/.test(cli ?? '')) fail(app.file, 'pin wrangler to an exact version; the deployment job reads this same value')
  const origin = /export const SITE_ORIGIN = ['"]([^'"]+)['"]/.exec(read(`${prefix}lib/site.ts`) ?? '')?.[1]
  if (!origin) fail(`${prefix}lib/site.ts`, 'must declare the canonical production origin')
  else {
    const hostname = new URL(origin).hostname
    const actual = (config.routes ?? [])
      .filter(route => route.custom_domain === true)
      .map(route => route.pattern)
      .sort()
    if (JSON.stringify(actual) !== JSON.stringify([hostname, `www.${hostname}`].sort())) fail(configFile, 'custom domains must match SITE_ORIGIN and its www alias')
  }

  // The build wrapper reads this file only for production. The public values are not Worker runtime variables.
  const productionFile = 'cloudflare/production.json'
  const production = readJson(productionFile)
  if (!production) fail(productionFile, 'is required for production build variables')
  const reads = new Map()
  for (const file of files.filter(file => file.startsWith(prefix) && /\.[cm]?[jt]sx?$/.test(file))) {
    for (const [, name] of read(file).matchAll(/process\.env\.(NEXT_PUBLIC_\w+)/g)) if (!reads.has(name)) reads.set(name, file)
  }
  for (const [name, file] of reads) {
    if (!(name in (production ?? {}))) fail(file, `reads ${name}, which ${productionFile} does not declare`)
  }
  for (const [name, value] of Object.entries(production ?? {})) {
    if (!name.startsWith('NEXT_PUBLIC_') || typeof value !== 'string') fail(productionFile, 'may contain only public string build variables')
    else if (!reads.has(name)) fail(productionFile, `sets ${name}, but the website does not read process.env.${name}`)
  }

  const ciFile = '.github/workflows/ci.yml'
  let ci
  try {
    ci = parseYaml(read(ciFile) ?? '')
  } catch {
    return fail(ciFile, 'cannot parse the website deployment workflow')
  }
  const website = ci?.jobs?.website
  if (!website?.steps?.some(step => step.run === 'npm run typecheck')) fail(ciFile, 'website must use npm run typecheck for clean-checkout declarations')
  const deploy = ci?.jobs?.['deploy-website']
  const upload = website?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))
  const download = deploy?.steps?.find(step => step.uses?.startsWith('actions/download-artifact@'))
  if (!upload || upload.with?.path !== `${prefix}out/` || upload.with?.['retention-days'] !== 1) fail(ciFile, 'upload the website/out/ artifact with one-day retention')
  if (!upload?.with?.name?.includes('github.sha') || download?.with?.name !== upload?.with?.name || download?.with?.path !== `${prefix}out/`)
    fail(ciFile, 'download the artifact for the same commit into website/out/')
  const productionBuild = website?.steps?.find(step => step.run?.includes('npm run build -- --production'))
  if (!productionBuild?.env?.BUILD_PRODUCTION?.includes("github.ref == 'refs/heads/main'") || !productionBuild.env.BUILD_PRODUCTION.includes("github.event_name == 'push'"))
    fail(ciFile, 'production build settings must be limited to pushes on main')
  const condition = deploy?.if ?? ''
  if (!["github.event_name == 'push'", "github.ref == 'refs/heads/main'", "vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'"].every(part => condition.includes(part)))
    fail(ciFile, 'deploy only enabled production pushes on main')
  if (!Array.isArray(deploy?.needs) || !['ci-pass', 'website'].every(job => deploy.needs.includes(job)))
    fail(ciFile, 'website deployment must wait for ci-pass and the website artifact')
  if (deploy?.['runs-on'] !== 'ubuntu-24.04' || deploy?.concurrency?.['cancel-in-progress'] !== false)
    fail(ciFile, 'deploy on the standard Linux runner and serialize production deployments')
  const commands = (deploy?.steps ?? []).map(step => step.run ?? '').join('\n')
  if (/\bnpm run (build|website:build|verify)\b/.test(commands)) fail(ciFile, 'deployment must reuse the verified artifact, not rebuild it')
  for (const command of ['node scripts/check-website-export.mjs', 'node scripts/cloudflare-rules.mjs --apply', 'node scripts/smoke-website.mjs']) {
    if (!commands.includes(command)) fail(ciFile, `deployment must run ${command}`)
  }
  if (!commands.includes('devDependencies.wrangler')) fail(ciFile, 'deployment must read the pinned Wrangler version from website/package.json')
}

// --- Minimum Chrome version: the extension's manifest is the one source. -------------------------

const minimumChrome = /minimum_chrome_version:\s*['"](\d+)['"]/.exec(read('wxt.config.ts') ?? '')?.[1]

function checkMinimumChrome() {
  if (nextApps.length === 0 || !exists('wxt.config.ts')) return
  // The website's SoftwareApplication markup names the oldest Chrome the extension installs in (docs/product/seo-geo.md §5.2).
  const file = `${nextApps[0].directory}/lib/site.ts`
  const stated = /export const MIN_CHROME_VERSION = (\d+)\b/.exec(read(file) ?? '')?.[1]
  if (stated !== minimumChrome)
    fail(
      file,
      `MIN_CHROME_VERSION is ${stated ?? 'missing'}, but wxt.config.ts sets minimum_chrome_version to ${minimumChrome ?? 'nothing'}; the website states what the extension requires`,
    )
}

// --- Package directories: every one needs updates and an audit. ----------------------------------

/** The directories of the `npm` entries in a Dependabot config. */
function dependabotNpmDirectories(text) {
  const directories = []
  for (const entry of text.split(/^ {2}- package-ecosystem:/m).slice(1)) {
    if (!/^\s*['"]?npm['"]?\s*$/.test(entry.split('\n')[0])) continue
    const single = /^\s*directory:\s*['"]?([^\s'"#]+)/m.exec(entry)
    if (single) directories.push(single[1])
    const list = /^\s*directories:\s*\n((?:\s+-\s+[^\n]+\n?)+)/m.exec(entry)
    if (list) for (const item of list[1].matchAll(/-\s+['"]?([^\s'"#]+)/g)) directories.push(item[1])
  }
  return directories.map(normalizeDirectory)
}

function checkPackageDirectories() {
  const expected = manifests.map(({ directory }) => normalizeDirectory(directory))
  const compare = (where, actual) => {
    for (const directory of expected) if (!actual.includes(directory)) fail(where, `does not cover the package directory ${directory}`)
    for (const directory of actual) if (!expected.includes(directory)) fail(where, `lists ${directory}, which has no package.json`)
  }

  const dependabot = read('.github/dependabot.yml')
  if (dependabot !== null) compare('.github/dependabot.yml', dependabotNpmDirectories(dependabot))

  const audit = read('.github/workflows/scheduled-audit.yml')
  if (audit !== null) {
    const matrix = /directory:\s*\[([^\]]*)\]/.exec(audit)
    if (!matrix) fail('.github/workflows/scheduled-audit.yml', 'has no `directory: [...]` matrix; npm audit has to run in every package directory')
    else
      compare(
        '.github/workflows/scheduled-audit.yml',
        matrix[1].split(',').map(item => normalizeDirectory(item.trim().replace(/^['"]|['"]$/g, ''))),
      )
  }
}

// --- The merge gate: local verify, CI and the required checks run the same things. ---------------

/** The names the jobs of a workflow report as status checks; a matrix on `language` is expanded. */
function jobNames(text) {
  const lines = text.split('\n')
  const start = lines.indexOf('jobs:')
  if (start === -1) return []
  const languages = [...text.matchAll(/^\s*-\s+language:\s*(\S+)/gm)].map(match => match[1])
  const names = []
  const add = name => names.push(...(name.includes('${{ matrix.language }}') ? languages.map(language => name.replace('${{ matrix.language }}', language)) : [name]))
  let id = null
  let named = false
  for (const line of lines.slice(start + 1)) {
    const job = /^ {2}([\w-]+):\s*$/.exec(line)
    if (job) {
      if (id !== null && !named) add(id)
      id = job[1]
      named = false
      continue
    }
    const name = id !== null && /^ {4}name:\s*(.+?)\s*$/.exec(line)
    if (name) {
      add(name[1].replace(/^['"]|['"]$/g, ''))
      named = true
    }
  }
  if (id !== null && !named) add(id)
  return names
}

/** Whether a workflow narrows its `pull_request` trigger with paths or branches. */
function filtersPullRequests(text) {
  const trigger = /^ {2}pull_request:[^\n]*\n((?: {4}[^\n]*\n|[ \t]*\n)*)/m.exec(text)
  return trigger !== null && /^ {4}(paths|paths-ignore|branches|branches-ignore):/m.test(trigger[1])
}

function checkGate() {
  const scripts = readJson('package.json')?.scripts ?? {}
  if (scripts.verify !== undefined) {
    const commands = scripts.verify.split('&&').map(command => command.trim())
    for (const name of Object.keys(scripts).filter(name => name.startsWith('check:'))) {
      if (!commands.includes(`npm run ${name}`)) fail('package.json', `the script ${name} is not part of verify`)
    }
    const ci = read('.github/workflows/ci.yml')
    if (ci !== null) {
      for (const command of commands)
        if (!ci.includes(command)) fail('.github/workflows/ci.yml', `does not run \`${command}\`, which \`npm run verify\` runs; CI runs the same commands`)
    }
  }

  const ruleset = readJson('.github/rulesets/main.json')
  if (ruleset !== null) {
    const workflows = files.filter(file => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)).map(file => ({ file, text: read(file) }))
    const reported = new Set(workflows.flatMap(({ text }) => jobNames(text)))
    const required = (ruleset.rules ?? [])
      .filter(rule => rule.type === 'required_status_checks')
      .flatMap(rule => rule.parameters?.required_status_checks ?? [])
      .map(({ context }) => context)
    for (const context of required) {
      if (!reported.has(context))
        fail('.github/rulesets/main.json', `requires the status check "${context}", but no workflow job reports it; a renamed job would block every pull request`)
    }
    // A workflow that a path or branch filter skips never reports its checks: they stay pending and block the merge.
    for (const { file, text } of workflows) {
      const blocking = jobNames(text).filter(name => required.includes(name))
      if (blocking.length > 0 && filtersPullRequests(text)) {
        fail(
          file,
          `filters pull_request by paths or branches but reports the required check ${blocking.map(name => `"${name}"`).join(', ')}: when the filter skips it the check stays pending and blocks the pull request`,
        )
      }
    }
  }
}

checkNode()
checkNext()
checkTailwind()
checkCloudflare()
checkMinimumChrome()
checkPackageDirectories()
checkGate()

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(
    `\n${problems.length} inconsistent setting(s). Related places must change together (AGENTS.md「联动一致性」): update the one that was missed, and do not weaken this check.`,
  )
  process.exit(1)
}

const apps = nextApps.map(({ directory, json }) => `Next.js ${majorOf(dependenciesOf({ json }).next)} in ${normalizeDirectory(directory)}`)
console.log(
  `Settings agree: Node.js ${nodeMajor}; ${apps.join(', ') || 'no Next.js app'}; minimum Chrome ${minimumChrome ?? 'unset'}; package directories ${manifests.map(({ directory }) => normalizeDirectory(directory)).join(', ')}.`,
)
