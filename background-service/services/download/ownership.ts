/**
 * Which product path belongs to which source (download.md §4.1, D-94). The
 * extension remembers, for every product path it wrote completely, the
 * SHA-256 of the source's identity and the time — never the address, the
 * title or file names. A folder on disk with no record of ours is somebody
 * else's and is taken into account when the next name is picked, never
 * deleted: two different articles that sanitize to the same title must not
 * erase each other.
 */
import { DOWNLOAD_LIMITS } from '../../../core/download'

const KEY = 'annhub.downloadFolders'
const MAX_RECORDS = 500

interface ProductRecord {
  /** SHA-256 of the identity string. */
  owner: string
  at: number
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Paths match case-insensitively: macOS and Windows file names are not case-sensitive (download.md §4.1). */
export function normalizePath(path: string): string {
  return path.normalize('NFC').toLowerCase()
}

async function readRecords(): Promise<Record<string, ProductRecord>> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as Record<string, ProductRecord> | undefined
  return stored && typeof stored === 'object' ? stored : {}
}

async function writeRecords(records: Record<string, ProductRecord>): Promise<void> {
  const entries = Object.entries(records)
  if (entries.length > MAX_RECORDS) {
    entries.sort((a, b) => a[1].at - b[1].at)
    records = Object.fromEntries(entries.slice(entries.length - MAX_RECORDS))
  }
  await chrome.storage.local.set({ [KEY]: records })
}

/** Called once a run's files have all landed — a failed or cancelled run records nothing. */
export async function rememberProduct(path: string, identity: string, at: number): Promise<void> {
  const records = await readRecords()
  records[await sha256(normalizePath(path))] = { owner: await sha256(identity), at }
  await writeRecords(records)
}

/** The names the browser's download history shows under `AnnHub/`: folder names for the folder form, archive bases for the ZIP form. */
export async function occupiedNames(kind: 'folder' | 'zip'): Promise<Set<string>> {
  const taken = new Set<string>()
  try {
    const items = await chrome.downloads.search({})
    for (const item of items) {
      const name = (item.filename ?? '').replace(/\\/g, '/')
      const at = name.toLowerCase().lastIndexOf('/annhub/')
      if (at === -1) continue
      const rest = name.slice(at + '/AnnHub/'.length)
      if (kind === 'zip') {
        if (!rest.toLowerCase().endsWith('.zip')) continue
        taken.add(rest.slice(0, -'.zip'.length))
        continue
      }
      if (!rest.includes('/')) continue
      taken.add(rest.slice(0, rest.indexOf('/')))
    }
  } catch {
    /* a closed history only risks a fresh name over an occupied one's ` (1)` */
  }
  return taken
}

export interface ResolvedName {
  /** The folder name (without `AnnHub/`) the run writes into. */
  name: string
  /** True when a path of this very identity is being replaced; its old files are swept after the new Markdown lands. */
  replacing: boolean
}

/**
 * Picks the next product name for an identity: a recorded path of this very
 * identity is replaced; recorded paths of other identities and history names
 * without a record are taken. Candidates run `标题`, `标题 (2)`, `标题 (3)` …,
 * the same suffixing `dedupeName` applies (download.md §4.1, §4.4).
 */
export async function resolveName(desired: string, identity: string, kind: 'folder' | 'zip', occupied: ReadonlySet<string>): Promise<ResolvedName> {
  const records = await readRecords()
  const identityHash = await sha256(identity)
  const takenNormalized = new Set([...occupied].map(value => normalizePath(value)))
  const productPath = (name: string): string => (kind === 'zip' ? `AnnHub/${name}.zip` : `AnnHub/${name}`)
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : ` (${n})`
    const base = [...desired].slice(0, Math.max(1, DOWNLOAD_LIMITS.nameMaxChars - suffix.length)).join('')
    const name = `${base}${suffix}`
    const record = records[await sha256(normalizePath(productPath(name)))]
    if (record) {
      if (record.owner === identityHash) return { name, replacing: true }
      continue // another identity's recorded product
    }
    if (!takenNormalized.has(normalizePath(name))) return { name, replacing: false }
  }
}
