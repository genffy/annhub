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
    scripts: { typecheck: 'next typegen && tsc --noEmit' },
    dependencies: { 'next': '^16.3.8', 'react': '^19.3.0', 'next-intl': '^4.14.9' },
    devDependencies: { 'eslint-config-next': '^16.3.8', '@types/node': '^24.19.1', 'wrangler': '4.150.0', 'tailwindcss': '^3.4.19' },
  }),
  'website/postcss.config.js': 'module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } }\n',
  'website/.gitignore': '/next-env.d.ts\n',
  'website/README.md': 'Built with Next.js 16, React 19 and next-intl 4.\n',
  'website/public/privacy-policy.html': '<html></html>\n',
  'website/lib/site.ts':
    "export const SITE_ORIGIN = 'https://annhub.org'\nexport const MIN_CHROME_VERSION = 114\nexport const ANALYTICS_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN ?? ''\n",
  'wxt.config.ts': "export default defineConfig({ manifest: { minimum_chrome_version: '114' } })\n",
  'website/next.config.js': "module.exports = { output: 'export' }\n",
  'website/wrangler.json': json({
    name: 'annhub-website',
    assets: { directory: './out', html_handling: 'none', not_found_handling: '404-page' },
    routes: [
      { pattern: 'annhub.org', custom_domain: true },
      { pattern: 'www.annhub.org', custom_domain: true },
    ],
  }),
  'cloudflare/production.json': json({ NEXT_PUBLIC_CF_BEACON_TOKEN: '' }),
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
  website:
    steps:
      - run: npm run typecheck
      - run: npm run build -- --production
        env:
          BUILD_PRODUCTION: github.event_name == 'push' && github.ref == 'refs/heads/main'
      - uses: actions/upload-artifact@pinned
        with:
          name: website-static-\${{ github.sha }}
          path: website/out/
          retention-days: 1
  deploy-website:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'
    needs: [ci-pass, website]
    runs-on: ubuntu-24.04
    concurrency:
      cancel-in-progress: false
    steps:
      - uses: actions/download-artifact@pinned
        with:
          name: website-static-\${{ github.sha }}
          path: website/out/
      - run: node scripts/check-website-export.mjs
      - run: node scripts/cloudflare-rules.mjs --apply
      - run: node scripts/smoke-website.mjs
      - run: node -p 'require("./website/package.json").devDependencies.wrangler'
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
    it('catches a new Node.js version that @types/node and the README have not followed', () => {
      expectFailure({ '.node-version': '26\n' }, '@types/node ^24.0.3 is not Node.js 26', 'README.md: says Node.js 24.x, but .node-version is 26')
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

  describe('Cloudflare static deployment', () => {
    it('generates ignored Next.js declarations before type checking a clean checkout', () => {
      expectFailure({ 'website/next-env.d.ts': '/// <reference types="next" />\n' }, 'must not be tracked')
      expectFailure({ 'website/.gitignore': '' }, 'must ignore /next-env.d.ts')
      expectFailure(
        { 'website/package.json': manifestWith('website/package.json', m => (m.scripts.typecheck = 'tsc --noEmit')) },
        'generate Next.js declarations before running tsc',
      )
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', 'run: npm run typecheck', 'run: npx tsc --noEmit') }, 'must use npm run typecheck')
    })
    it('requires static export and the publish directory', () => {
      expectFailure({ 'website/next.config.js': 'module.exports = {}' }, 'must export static files')
      expectFailure({ 'website/wrangler.json': null }, 'is required for the static website')
      expectFailure({ 'website/wrangler.json': manifestWith('website/wrangler.json', m => (m.assets.directory = './.next')) }, 'assets.directory must be ./out')
    })

    it('rejects request-time code and SPA fallbacks', () => {
      expectFailure({ 'website/proxy.ts': 'export default () => {}' }, 'cannot depend on a Next.js proxy')
      expectFailure({ 'website/wrangler.json': manifestWith('website/wrangler.json', m => (m.main = 'worker.js')) }, 'without a Worker script')
      expectFailure({ 'website/wrangler.json': manifestWith('website/wrangler.json', m => (m.assets.run_worker_first = true)) }, 'without a Worker script')
      expectFailure({ 'website/wrangler.json': manifestWith('website/wrangler.json', m => (m.assets.not_found_handling = 'single-page-application')) }, 'real 404 responses')
    })

    it('rejects a retained legacy deployment and mismatched domains', () => {
      expectFailure({ 'netlify.toml': '[build]\n' }, 'must not retain the Netlify runtime')
      expectFailure({ 'website/wrangler.json': manifestWith('website/wrangler.json', m => (m.routes[0].pattern = 'wrong.example')) }, 'custom domains must match SITE_ORIGIN')
    })

    it('pins the CLI used by local previews and production', () => {
      expectFailure({ 'website/package.json': manifestWith('website/package.json', m => (m.devDependencies.wrangler = '^4.150.0')) }, 'pin wrangler to an exact version')
    })

    it('catches missing and renamed production build variables', () => {
      expectFailure({ 'cloudflare/production.json': null }, 'is required for production build variables')
      expectFailure({ 'cloudflare/production.json': json({}) }, 'reads NEXT_PUBLIC_CF_BEACON_TOKEN, which cloudflare/production.json does not declare')
      expectFailure(
        { 'website/lib/site.ts': edit('website/lib/site.ts', 'NEXT_PUBLIC_CF_BEACON_TOKEN', 'NEXT_PUBLIC_ANALYTICS_TOKEN') },
        'reads NEXT_PUBLIC_ANALYTICS_TOKEN',
        'sets NEXT_PUBLIC_CF_BEACON_TOKEN, but the website does not read',
      )
      expectFailure({ 'cloudflare/production.json': json({ NEXT_PUBLIC_CF_BEACON_TOKEN: '', API_SECRET: 'private' }) }, 'only public string build variables')
    })

    it('keeps deployment behind CI and the production opt-in', () => {
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', 'needs: [ci-pass, website]', 'needs: [website]') }, 'must wait for ci-pass')
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', " && vars.CLOUDFLARE_DEPLOY_ENABLED == 'true'", '') }, 'deploy only enabled production pushes')
    })

    it('reuses the exact commit artifact without another build', () => {
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', 'retention-days: 1', 'retention-days: 30') }, 'one-day retention')
      expectFailure({ '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', 'website-static-${{ github.sha }}', 'website-static-latest') }, 'same commit')
      expectFailure(
        { '.github/workflows/ci.yml': edit('.github/workflows/ci.yml', '      - run: node scripts/smoke-website.mjs', '      - run: npm run build') },
        'must reuse the verified artifact',
        'must run node scripts/smoke-website.mjs',
      )
    })
  })

  describe('minimum Chrome version', () => {
    it('catches a new minimum in the manifest that the website has not followed', () => {
      expectFailure(
        { 'wxt.config.ts': edit('wxt.config.ts', "minimum_chrome_version: '114'", "minimum_chrome_version: '120'") },
        'MIN_CHROME_VERSION is 114, but wxt.config.ts sets minimum_chrome_version to 120',
      )
    })

    it('catches a website that no longer states the minimum', () => {
      expectFailure({ 'website/lib/site.ts': edit('website/lib/site.ts', 'export const MIN_CHROME_VERSION = 114\n', '') }, 'MIN_CHROME_VERSION is missing')
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
          - language: actions
`,
        '.github/rulesets/main.json': json({
          rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci-pass' }, { context: 'Analyze (actions)' }] } }],
        }),
      })
      expect(status, output).toBe(0)
    })
  })
})
