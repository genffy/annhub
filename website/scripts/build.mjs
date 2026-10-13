import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { prepareStatic } from '../../scripts/website-static.mjs'
import { checkWebsiteExport } from '../../scripts/check-website-export.mjs'

const site = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--production')) throw new Error('Usage: npm run build [-- --production]')
const production = args.includes('--production')
const env = { ...process.env }
if (production) {
  const values = JSON.parse(readFileSync(new URL('../../cloudflare/production.json', import.meta.url), 'utf8'))
  for (const [name, value] of Object.entries(values)) {
    if (!/^NEXT_PUBLIC_[A-Z0-9_]+$/.test(name) || typeof value !== 'string') throw new Error('Production build settings must contain public string values only')
    env[name] = value
  }
}

execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { cwd: site, stdio: 'inherit', env })
prepareStatic({ production, analytics: Boolean(env.NEXT_PUBLIC_CF_BEACON_TOKEN), revision: process.env.GITHUB_SHA ?? 'local' })
checkWebsiteExport()
