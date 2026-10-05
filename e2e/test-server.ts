import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixtureDir = __dirname // e2e/ — test HTML fixtures live here
const projectRoot = path.join(__dirname, '..') // fallback for assets (images, etc.)
const PORT = 8173

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
}

/** Maps a request path to a file under `root`; undefined when the path would leave it (`/../…`, encoded or not). */
function resolveUnder(root: string, requestPath: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestPath)
  } catch {
    return undefined
  }
  if (decoded.includes('\0')) return undefined
  const resolved = path.resolve(root, '.' + path.posix.normalize('/' + decoded))
  if (!resolved.startsWith(root + path.sep)) return undefined
  return resolved
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname
  const url = requestPath === '/' ? '/test.html' : requestPath
  // Try e2e/ first (fixtures), fall back to project root (assets); never anything outside them
  const fixturePath = resolveUnder(fixtureDir, url)
  const assetPath = resolveUnder(projectRoot, url)
  const filePath = fixturePath && fs.existsSync(fixturePath) ? fixturePath : assetPath
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  const ext = path.extname(filePath)
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`[E2E] Test fixture server running on http://localhost:${PORT}`)
})
