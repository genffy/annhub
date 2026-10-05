#!/usr/bin/env node
// Checks that settings which have to agree across files still agree.
//
// Environment, dependency, build and deploy settings live in several files at once: the Node.js
// version in `.node-version`, `netlify.toml` and the README; the Next.js major in
// `website/package.json` and the docs; the package directories in Dependabot and the audit
// workflow. Changing one place and missing the others is a recurring failure that neither the type
// checker nor the unit tests see, so every coupling that can be read mechanically is an assertion
// here. The rule is AGENTS.md「联动一致性」; this script is how it is enforced.
//
//   npm run check:consistency
//   node scripts/check-consistency.mjs --root <dir>   check another tree (the tests do)
//
// A failure means a related place was missed: update it. Do not delete the assertion, loosen its
// pattern or add an exception to get green. A new coupling gets a new assertion. No dependencies.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The files that belong to the repository. A tree without git (the tests') is walked instead. */
function listFiles() {
  if (exists('.git')) {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
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
const NEXT_RUNTIME = '@netlify/plugin-nextjs'

/** `/` for the repository root, `/website` for a subdirectory: how Dependabot and Netlify write them. */
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

/** The subset of TOML that netlify.toml uses: tables, arrays of tables and scalar values. */
function parseToml(text) {
  const tables = {}
  const arrays = {}
  let current = {}
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const at = `netlify.toml:${index + 1}`
    const arrayHeader = /^\[\[([^\]]+)\]\]$/.exec(line)
    if (arrayHeader) {
      current = {}
      ;(arrays[arrayHeader[1].trim()] ??= []).push(current)
      return
    }
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      current = tables[header[1].trim()] ??= {}
      return
    }
    const pair = /^([A-Za-z0-9_-]+|"[^"]*")\s*=\s*(.*)$/.exec(line)
    if (!pair) throw new Error(`${at}: cannot read this line; the check understands tables, arrays of tables and scalar values. Extend parseToml before using more of TOML`)
    current[pair[1].replace(/^"|"$/g, '')] = parseValue(pair[2].trim(), at)
  })
  return { tables, arrays }
}

/** Whether a bracketed value ends on the line it starts on; brackets inside strings do not count. */
function closesOnThisLine(value) {
  let depth = 0
  let quote = null
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (quote) {
      if (quote === '"' && char === '\\') index++
      else if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '#') {
      break
    } else if (char === '[' || char === '{') {
      depth++
    } else if (char === ']' || char === '}') {
      depth--
    }
  }
  return depth === 0 && quote === null
}

function parseValue(value, at) {
  if (value.startsWith('"""') || value.startsWith("'''")) throw new Error(`${at}: multi-line strings are not supported by this check`)
  if (value.startsWith('"')) {
    const escapes = { n: '\n', t: '\t' }
    let text = ''
    for (let index = 1; index < value.length; index++) {
      const char = value[index]
      if (char === '"') return text
      if (char === '\\') {
        index++
        text += escapes[value[index]] ?? value[index]
      } else {
        text += char
      }
    }
    throw new Error(`${at}: unterminated string`)
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1)
    if (end === -1) throw new Error(`${at}: unterminated string`)
    return value.slice(1, end)
  }
  if (value.startsWith('[') || value.startsWith('{')) {
    // Kept raw, nothing here reads them; but one that goes on over the next lines would be mistaken for more keys.
    if (!closesOnThisLine(value)) throw new Error(`${at}: arrays and inline tables that span several lines are not supported by this check`)
    return value
  }
  const scalar = value.replace(/\s+#.*$/, '')
  if (scalar === 'true' || scalar === 'false') return scalar === 'true'
  return /^-?\d+$/.test(scalar) ? Number(scalar) : scalar
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

// --- Netlify: the site config has to describe the app that is really there. ----------------------

function checkNetlify() {
  const text = read('netlify.toml')
  if (text === null) return
  let parsed
  try {
    parsed = parseToml(text)
  } catch (error) {
    return fail('netlify.toml', error.message)
  }
  const { tables, arrays } = parsed
  const build = tables.build ?? {}
  const base = String(build.base ?? '').replace(/^\/+|\/+$/g, '')
  const app = nextApps.find(({ directory }) => directory === base)

  if (nextApps.length > 0 && !app) {
    const where = nextApps.map(({ directory }) => normalizeDirectory(directory)).join(', ')
    fail(
      'netlify.toml',
      `[build] base is "${base || '/'}", but the Next.js app is in ${where}. Netlify installs dependencies, and looks for the Next.js runtime plugin, in the base directory; anywhere else it installs a copy of its own choosing, the legacy v4 for Next.js before 13.5`,
    )
  }

  if (app) {
    // Netlify only loads a runtime automatically when it is installed in the site settings. Declared here and installed in the
    // app, the lockfile decides the version; declared only, Netlify installs its own pinned copy (v4); not declared, there is none.
    const declared = (arrays.plugins ?? []).some(plugin => plugin.package === NEXT_RUNTIME)
    const installed = dependenciesOf(app)[NEXT_RUNTIME]
    if (!declared) {
      fail(
        'netlify.toml',
        `[[plugins]] does not declare ${NEXT_RUNTIME}. Netlify only loads the Next.js runtime by itself for sites that have it in their settings; without it the build has no runtime and deploys only the .next directory`,
      )
    } else if (installed === undefined) {
      fail(
        'netlify.toml',
        `[[plugins]] declares ${NEXT_RUNTIME}, but ${app.file} does not depend on it, so Netlify installs a copy of its own choosing: the legacy v4 for Next.js before 13.5. Install it in the app so the lockfile decides the version`,
      )
    } else if (majorOf(installed) < 5) {
      fail(app.file, `${NEXT_RUNTIME} ${installed} is the legacy runtime for Next.js before 13.5; the app is on Next.js ${majorOf(dependenciesOf(app).next)}`)
    }
  }

  if (app) {
    if (build.publish !== '.next') {
      fail(
        'netlify.toml',
        `[build] publish is ${build.publish === undefined ? 'not set' : `"${build.publish}"`}; set it to ".next" (relative to base). That also overrides an older value in the Netlify dashboard`,
      )
    }
    if (base && String(build.command ?? '').includes(`cd ${base}`)) fail('netlify.toml', `[build] command changes into "${base}", but base already is "${base}"`)
  }

  const ignore = String(build.ignore ?? '')
  if (ignore === '') {
    fail('netlify.toml', '[build] ignore is not set; without it every push to the production branch builds, and a change outside the base directory (this file) is never seen')
  } else {
    if (base && !ignore.includes(`:/${base}`))
      fail(
        'netlify.toml',
        `[build] ignore must name the base as ":/${base}": it runs inside the base directory, so a plain "${base}" points at "${base}/${base}", never differs and skips every build`,
      )
    if (!ignore.includes('netlify.toml')) fail('netlify.toml', '[build] ignore must cover netlify.toml too, or a change to this file alone is never deployed')
  }

  const nodeVersion = tables['build.environment']?.NODE_VERSION
  if (nodeMajor !== null) {
    if (nodeVersion === undefined) fail('netlify.toml', '[build.environment] NODE_VERSION is not set; Netlify only reads .node-version inside the base directory')
    else if (majorOf(nodeVersion) !== nodeMajor) fail('netlify.toml', `NODE_VERSION "${nodeVersion}" does not match .node-version (${nodeMajor})`)
  }

  // Static files are served from the app's public/ directory, wherever base points.
  const siteDirectory = (app ?? nextApps[0])?.directory ?? base
  for (const redirect of arrays.redirects ?? []) {
    const target = redirect.to
    if (typeof target !== 'string' || !target.startsWith('/') || !target.endsWith('.html')) continue
    const file = `${siteDirectory ? `${siteDirectory}/` : ''}public${target}`
    if (!exists(file)) fail('netlify.toml', `the redirect ${redirect.from} -> ${target} has no file at ${file}`)
  }
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
checkNetlify()
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
  `Settings agree: Node.js ${nodeMajor}; ${apps.join(', ') || 'no Next.js app'}; package directories ${manifests.map(({ directory }) => normalizeDirectory(directory)).join(', ')}.`,
)
