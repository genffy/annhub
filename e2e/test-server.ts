import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fixtureDir = __dirname              // e2e/ — test HTML fixtures live here
const projectRoot = path.join(__dirname, '..')  // fallback for assets (images, etc.)
const PORT = 8173

const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
}

const server = http.createServer((req, res) => {
    const url = req.url === '/' ? '/test.html' : req.url!
    // Try e2e/ first (fixtures), fall back to project root (assets)
    const fixturePath = path.join(fixtureDir, url)
    const filePath = fs.existsSync(fixturePath) ? fixturePath : path.join(projectRoot, url)
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
