import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixtureDir = __dirname // e2e/ — test HTML fixtures live here
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
  // The server only exposes explicit fixture media from e2e/.
  const fixturePath = resolveUnder(fixtureDir, url)
  if (!fixturePath || !Object.prototype.hasOwnProperty.call(contentTypes, path.extname(fixturePath))) {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  const ext = path.extname(fixturePath)
  fs.readFile(fixturePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' })
    res.end(data)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[E2E] Test fixture server running on http://localhost:${PORT}`)
})
