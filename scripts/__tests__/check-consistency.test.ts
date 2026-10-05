import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * scripts/check-consistency.mjs is how AGENTS.md「联动一致性」 is enforced. Each case builds a small
 * repository in which everything agrees, breaks exactly one place, and expects the script to name it:
 * an assertion that cannot fail would protect nothing.
 */

const script = resolve(__dirname, '../check-consistency.mjs')
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const GOOD_FILES: Record<string, string> = {
  '.node-version': '24\n',
  'README.md': 'Requires Node.js 24.x or later.\n',
  'package.json': json({
    scripts: { 'check:consistency': 'node scripts/check-consistency.mjs', 'verify': 'npm run format:check && npm test && npm run check:consistency' },
    devDependencies: { '@types/node': '^24.0.3', 'tailwindcss': '^3.4.19' },
    engines: { node: '>=24.0.0' },
  }),
  'postcss.config.cjs': 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n',
  'website/package.json': json({
    dependencies: { 'next': '^16.3.8', 'react': '^19.3.0', 'next-intl': '^4.14.9' },
    devDependencies: { 'eslint-config-next': '^16.3.8', '@types/node': '^24.19.1', '@netlify/plugin-nextjs': '^5.16.1', 'tailwindcss': '^3.4.19' },
  }),
  'website/postcss.config.js': 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n',
  'website/README.md': 'Built with Next.js 16, React 19 and next-intl 4.\n',
  'website/public/privacy-policy.html': '<html></html>\n',
  'netlify.toml': `[build]
  base = "website"
  command = "npm run build"
  publish = ".next"
  ignore = "test -n \\"$CACHED_COMMIT_REF\\" && git diff --quiet \\"$CACHED_COMMIT_REF\\" \\"$COMMIT_REF\\" -- ':/website' ':/netlify.toml'"

[build.environment]
  NODE_VERSION = "24"

[[redirects]]
  from = "/privacy-policy"
  to = "/privacy-policy.html"
  status = 200

[[plugins]]
  package = "@netlify/plugin-nextjs"
`,
  '.github/dependabot.yml': `version: 2
updates:
  - package-ecosystem: npm
    directory: /
  - package-ecosystem: npm
    directory: /website
  - package-ecosystem: github-actions
    directories:
      - /
`,
  '.github/workflows/ci.yml': `name: CI
jobs:
  extension:
    name: Extension
    steps:
      - run: npm run format:check
      - run: npm test
      - run: npm run check:consistency
  ci-pass:
    name: ci-pass
    steps:
      - run: echo done
`,
  '.github/workflows/scheduled-audit.yml': `jobs:
  npm-audit:
    strategy:
      matrix:
        directory: [., website]
`,
  '.github/rulesets/main.json': json({ rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-pass' }] } }] }),
}

const directories: string[] = []
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

/** Runs the script on the good tree with some files replaced (a string) or removed (null). */
function check(overrides: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-consistency-'))
  directories.push(root)
  for (const [file, content] of Object.entries({ ...GOOD_FILES, ...overrides })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The good file with one edit; fails loudly when the text to replace is gone, so a case cannot pass by editing nothing. */
function edit(file: string, from: string | RegExp, to: string): string {
  const text = GOOD_FILES[file]!
  const next = text.replace(from, to)
  if (next === text) throw new Error(`test setup: ${String(from)} not found in ${file}`)
  return next
}

/** The good package.json after a change to its parsed content. */
function manifestWith(file: string, change: (manifest: any) => void): string {
  const manifest = JSON.parse(GOOD_FILES[file]!)
  change(manifest)
  return json(manifest)
}

function expectFailure(overrides: Record<string, string | null>, ...messages: string[]) {
  const { status, output } = check(overrides)
  expect(status, output).toBe(1)
  for (const message of messages) expect(output).toContain(message)
}

describe('check-consistency', () => {
  it('accepts a tree where everything agrees', () => {
    const { status, output } = check()
    expect(status, output).toBe(0)
    expect(output).toContain('Node.js 24')
  })

  it('accepts this repository', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0)
  })

  describe('Node.js', () => {
    it('catches a new Node.js version that netlify.toml, @types/node and the README have not followed', () => {
      expectFailure(
        { '.node-version': '26\n' },
        'NODE_VERSION "24" does not match .node-version (26)',
        '@types/node ^24.0.3 is not Node.js 26',
        'README.md: says Node.js 24.x, but .node-version is 26',
      )
    })

    it('catches engines.node that excludes the version in .node-version', () => {
      expectFailure({ 'package.json': edit('package.json', '>=24.0.0', '>=26.0.0') }, 'engines.node ">=26.0.0" does not allow Node.js 24')
    })

    it('catches a workflow that hard-codes a Node.js version', () => {
      expectFailure(
        {
          '.github/workflows/ci.yml': edit(
            '.github/workflows/ci.yml',
            '    steps:\n      - run: npm run format:check',
            '    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm run format:check',
          ),
        },
        'node-version-file: .node-version',
      )
    })

    it('catches a missing .node-version', () => {
      expectFailure({ '.node-version': null }, '.node-version: is missing')
    })
  })

  describe('Next.js', () => {
    it('catches a Next.js major that its ESLint config and the docs have not followed', () => {
      expectFailure(
        { 'website/package.json': edit('website/package.json', '"next": "^16.3.8"', '"next": "^17.0.0"') },
        'eslint-config-next ^16.3.8 is not the same major as next ^17.0.0',
        'says Next.js 16, but website/package.json depends on next ^17.0.0',
      )
    })
  })

  describe('Tailwind CSS', () => {
    const v4Config = "module.exports = { plugins: { '@tailwindcss/postcss': {} } }\n"

    it('catches a Tailwind CSS 4 bump that the PostCSS setup has not followed', () => {
      expectFailure(
        { 'website/package.json': manifestWith('website/package.json', manifest => (manifest.devDependencies.tailwindcss = '^4.3.3')) },
        'website/package.json: tailwindcss ^4.3.3 needs @tailwindcss/postcss',
        'website/postcss.config.js: uses tailwindcss itself as a PostCSS plugin',
      )
    })

    it('accepts Tailwind CSS 4 with its own PostCSS plugin, and ignores a mention in a comment', () => {
      const { status, output } = check({
        'website/package.json': manifestWith('website/package.json', manifest => {
          manifest.devDependencies.tailwindcss = '^4.3.3'
          manifest.devDependencies['@tailwindcss/postcss'] = '^4.3.3'
        }),
        'website/postcss.config.js': `// was: plugins: { tailwindcss: {} }\n/* tailwindcss: {} */\n${v4Config}`,
      })
      expect(status, output).toBe(0)
    })

    it('catches the Tailwind CSS 4 plugin next to Tailwind CSS 3', () => {
      expectFailure({ 'website/postcss.config.js': v4Config }, 'website/postcss.config.js: uses @tailwindcss/postcss, which is the plugin for Tailwind CSS 4')
    })
  })

  describe('netlify.toml', () => {
    it('catches a base that is not the Next.js app (Netlify installs the legacy v4 runtime then)', () => {
      expectFailure(
        { 'netlify.toml': edit('netlify.toml', 'base = "website"', 'base = "/"') },
        '[build] base is "/", but the Next.js app is in /website',
        'the legacy v4 for Next.js before 13.5',
      )
    })

    it('catches a Next.js app that is deployed without the runtime declared', () => {
      expectFailure(
        { 'netlify.toml': edit('netlify.toml', '\n[[plugins]]\n  package = "@netlify/plugin-nextjs"\n', '') },
        '[[plugins]] does not declare @netlify/plugin-nextjs',
        'deploys only the .next directory',
      )
    })

    it('catches a runtime that is declared but not installed in the app (Netlify then picks its own, v4)', () => {
      expectFailure(
        { 'website/package.json': manifestWith('website/package.json', manifest => delete manifest.devDependencies['@netlify/plugin-nextjs']) },
        '[[plugins]] declares @netlify/plugin-nextjs, but website/package.json does not depend on it',
      )
    })

    it('catches the legacy runtime major for a current Next.js', () => {
      expectFailure(
        { 'website/package.json': manifestWith('website/package.json', manifest => (manifest.devDependencies['@netlify/plugin-nextjs'] = '^4.41.6')) },
        '@netlify/plugin-nextjs ^4.41.6 is the legacy runtime for Next.js before 13.5',
      )
    })

    it('catches a publish directory that is not .next, or is left to the dashboard', () => {
      expectFailure({ 'netlify.toml': edit('netlify.toml', 'publish = ".next"', 'publish = "website/.next"') }, '[build] publish is "website/.next"')
      expectFailure({ 'netlify.toml': edit('netlify.toml', '  publish = ".next"\n', '') }, '[build] publish is not set')
    })

    it('catches a command that changes into the base it already runs in', () => {
      expectFailure({ 'netlify.toml': edit('netlify.toml', 'command = "npm run build"', 'command = "cd website && npm run build"') }, 'command changes into "website"')
    })

    it('catches an ignore command that names the base without :/ (it would skip every build)', () => {
      expectFailure({ 'netlify.toml': edit('netlify.toml', "':/website'", 'website') }, 'must name the base as ":/website"')
    })

    it('catches an ignore command that does not watch netlify.toml', () => {
      expectFailure({ 'netlify.toml': edit('netlify.toml', " ':/netlify.toml'", '') }, 'must cover netlify.toml too')
    })

    it('catches a NODE_VERSION that is missing or differs from .node-version', () => {
      expectFailure({ 'netlify.toml': edit('netlify.toml', 'NODE_VERSION = "24"', 'NODE_VERSION = "22"') }, 'NODE_VERSION "22" does not match .node-version (24)')
      expectFailure({ 'netlify.toml': edit('netlify.toml', '[build.environment]\n  NODE_VERSION = "24"\n', '') }, 'NODE_VERSION is not set')
    })

    it('catches a redirect to a static page that does not exist', () => {
      expectFailure({ 'website/public/privacy-policy.html': null }, 'the redirect /privacy-policy -> /privacy-policy.html has no file at website/public/privacy-policy.html')
    })

    it('says so when it meets TOML it cannot read, instead of passing', () => {
      expectFailure({ 'netlify.toml': `${GOOD_FILES['netlify.toml']}\n[[headers]]\n  values = {\n    X = "1" }\n` }, 'span several lines')
      expectFailure({ 'netlify.toml': `${GOOD_FILES['netlify.toml']}\nodd line\n` }, 'cannot read this line')
    })
  })

  describe('package directories', () => {
    const extra = { 'packages/tool/package.json': json({ name: 'tool' }) }

    it('catches a package directory that Dependabot and the weekly audit do not cover', () => {
      expectFailure(
        extra,
        '.github/dependabot.yml: does not cover the package directory /packages/tool',
        'scheduled-audit.yml: does not cover the package directory /packages/tool',
      )
    })

    it('catches a Dependabot entry for a directory that has no package.json', () => {
      expectFailure(
        { '.github/dependabot.yml': `${GOOD_FILES['.github/dependabot.yml']}  - package-ecosystem: npm\n    directory: /gone\n` },
        'lists /gone, which has no package.json',
      )
    })

    it('catches an audit workflow whose matrix cannot be read', () => {
      expectFailure({ '.github/workflows/scheduled-audit.yml': 'jobs: {}\n' }, 'has no `directory: [...]` matrix')
    })
  })

  describe('the merge gate', () => {
    it('catches a verify command that CI does not run', () => {
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', '      - run: npm run check:consistency\n', '') }, 'does not run `npm run check:consistency`')
    })

    it('catches a check: script that verify does not run', () => {
      expectFailure({ 'package.json': edit('package.json', ' && npm run check:consistency', '') }, 'the script check:consistency is not part of verify')
    })

    it('catches a required status check that no workflow job reports', () => {
      expectFailure(
        { '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', 'name: ci-pass', 'name: all-green') },
        'requires the status check "ci-pass", but no workflow job reports it',
      )
    })

    it('catches a required check from a workflow that a path filter can skip (it would stay pending)', () => {
      const lint = (trigger: string) => `on:\n  pull_request:${trigger}\njobs:\n  lint:\n    name: lint-check\n    steps:\n      - run: echo ok\n`
      const requireLint = json({
        rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-pass' }, { context: 'lint-check' }] } }],
      })
      expectFailure(
        { '.github/workflows/lint.yml': lint("\n    paths:\n      - '.github/**'"), '.github/rulesets/main.json': requireLint },
        'filters pull_request by paths or branches but reports the required check "lint-check"',
      )
      // Without the filter, or when the filtered workflow reports nothing that is required, it is fine.
      expect(check({ '.github/workflows/lint.yml': lint(''), '.github/rulesets/main.json': requireLint }).status).toBe(0)
      expect(check({ '.github/workflows/lint.yml': lint("\n    paths:\n      - '.github/**'") }).status).toBe(0)
    })

    it('expands a matrix name such as "Analyze (${{ matrix.language }})"', () => {
      const { status, output } = check({
        '.github/workflows/codeql.yml': `jobs:
  analyze:
    name: Analyze (\${{ matrix.language }})
    strategy:
      matrix:
        include:
          - language: swift
`,
        '.github/rulesets/main.json': json({
          rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-pass' }, { context: 'Analyze (swift)' }] } }],
        }),
      })
      expect(status, output).toBe(0)
    })
  })
})
