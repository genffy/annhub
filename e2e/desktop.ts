import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Helpers that run the REAL macOS Desktop app as a child process, isolated from the user's own
 * data (own data directory, own preferences suite, a free loopback port) and drive it the way a
 * harness can: launch arguments, a ready file, and SIGUSR1 for a state snapshot. See
 * app/Sources/AnnHubCore/LaunchConfig.swift for the arguments.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, '..')

/** The built bundle: ANNHUB_DESKTOP_APP, else the usual output of the Xcode build. */
export function desktopApp(): string | undefined {
  const candidates = [
    process.env.ANNHUB_DESKTOP_APP,
    path.join(repoRoot, 'app/.build/xcode/Build/Products/Debug/AnnHubDesktop.app'),
    path.join(repoRoot, 'app/build/Build/Products/Debug/AnnHubDesktop.app'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find(app => fs.existsSync(path.join(app, 'Contents/MacOS/AnnHubDesktop')))
}

export const desktopAvailable = (): boolean => process.platform === 'darwin' && desktopApp() !== undefined

/**
 * The extension ids the built app was configured with: the `AnnHubExtensionIds` entry of its
 * Info.plist, which the build fills from ANNHUB_EXTENSION_IDS (default: the published extension).
 * Read from the app rather than written here, so the suite follows whatever the build says.
 */
export function builtInExtensionIds(): string[] {
  const app = desktopApp()
  if (!app) return []
  const raw = execFileSync('/usr/bin/plutil', ['-extract', 'AnnHubExtensionIds', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')], { encoding: 'utf8' })
  return raw.split(/[\s,]+/).filter(Boolean)
}

export const DESKTOP_SKIP_REASON = 'needs the built macOS Desktop: cd app && xcodegen generate && xcodebuild -scheme AnnHubDesktop build (or set ANNHUB_DESKTOP_APP)'

/** What the Desktop reports about itself on SIGUSR1 (app/Desktop/Diagnostics.swift). */
export interface DesktopState {
  section: 'today' | 'library' | 'system'
  fragmentCount: number
  deliveredFragmentCount: number
  dueCount: number
  resumeCursor?: number
  resumeTotal?: number
  hub: string
  language: 'zh' | 'en'
  paletteVisible: boolean
  reviewSheetPresented: boolean
  recentDeliveryStatuses: number[]
  hasConnected: boolean
  activationPolicy: 'regular' | 'accessory' | 'prohibited' | 'unknown'
  visibleWindowCount: number
  mainWindowVisible: boolean
}

export interface StartOptions {
  /** Reuse a directory (and with it the store and the pairing code) across restarts. */
  dir?: string
  /** A fixed port, to come back on the address the extension already knows. 0 = any free port. */
  port?: number
  /** Open the main window like a normal launch (default: menu bar only). */
  window?: boolean
  /**
   * The interface language (default zh). The Desktop follows the system language (D-15); the suite
   * pins one through the override the app provides for tests, so what it types into the palette
   * does not depend on the language of the Mac it runs on.
   */
  language?: 'zh' | 'en'
  /**
   * Extension ids the hub serves besides the ones its build was configured with, passed in the
   * ANNHUB_EXTENSION_IDS environment variable. The unpacked build under test has an id of its own,
   * and the Desktop refuses any browser origin that is not configured (storage.md §8).
   */
  extensionIds?: string[]
}

export class RunningDesktop {
  readonly dir: string
  readonly dataDir: string
  readonly diagnosticsDir: string
  readonly port: number
  readonly pairToken: string
  readonly pid: number
  private readonly child: ChildProcess
  private readonly captured: { text: string }
  private exited: Promise<void>

  private constructor(child: ChildProcess, dir: string, info: { port: number; pairToken: string; pid: number }, captured: { text: string }) {
    this.child = child
    this.captured = captured
    this.dir = dir
    this.dataDir = path.join(dir, 'data')
    this.diagnosticsDir = path.join(dir, 'diag')
    this.port = info.port
    this.pairToken = info.pairToken
    this.pid = info.pid
    this.exited = new Promise(resolve => child.once('exit', () => resolve()))
  }

  static async start(options: StartOptions = {}): Promise<RunningDesktop> {
    const app = desktopApp()
    if (!app) throw new Error(DESKTOP_SKIP_REASON)
    const dir = options.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'annhub-e2e-'))
    const readyFile = path.join(dir, 'ready.json')
    fs.rmSync(readyFile, { force: true })

    const args = [
      `--annhub-data-dir=${path.join(dir, 'data')}`,
      `--annhub-defaults-suite=annhub.e2e.${path.basename(dir)}`,
      `--annhub-port=${options.port ?? 0}`,
      `--annhub-ready-file=${readyFile}`,
      `--annhub-diagnostics=${path.join(dir, 'diag')}`,
      '--annhub-no-notifications',
      ...(options.window ? [] : ['--annhub-no-window']),
    ]
    const child = spawn(path.join(app, 'Contents/MacOS/AnnHubDesktop'), args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Always set, so a value exported in the developer's shell for building cannot leak into a run.
      env: { ...process.env, ANNHUB_UI_LANGUAGE: options.language ?? 'zh', ANNHUB_EXTENSION_IDS: (options.extensionIds ?? []).join(',') },
    })
    const captured = { text: '' }
    child.stdout?.on('data', chunk => (captured.text += String(chunk)))
    child.stderr?.on('data', chunk => (captured.text += String(chunk)))
    const died = new Promise<never>((_, reject) => child.once('exit', code => reject(new Error(`Desktop exited early (${code}):\n${captured.text}`))))

    const ready = (async () => {
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        try {
          const info = JSON.parse(fs.readFileSync(readyFile, 'utf8')) as { port: number; pairToken: string; pid: number }
          if (info.pid === child.pid) return info
        } catch {
          // not written yet
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`Desktop did not become ready:\n${captured.text}`)
    })()
    try {
      const info = await Promise.race([ready, died])
      return new RunningDesktop(child, dir, info, captured)
    } catch (error) {
      child.kill('SIGKILL')
      throw error
    }
  }

  get endpoint(): string {
    return `http://127.0.0.1:${this.port}`
  }

  get log(): string {
    return this.captured.text
  }

  /**
   * A fresh snapshot of the running app (SIGUSR1 → diag/state.json). With `keys`, the app first plays
   * them into its own event queue — `cmd+k`, `escape`, `down`, `return`, `cmd+,`, `type:text` — and
   * reports the state after they have taken effect. No system permission is involved.
   */
  async state(keys: string[] = []): Promise<DesktopState> {
    const file = path.join(this.diagnosticsDir, 'state.json')
    fs.rmSync(file, { force: true })
    if (keys.length > 0) fs.writeFileSync(path.join(this.diagnosticsDir, 'keys.txt'), keys.join('\n') + '\n')
    process.kill(this.pid, 'SIGUSR1')
    const deadline = Date.now() + 5_000 + keys.length * 600
    while (Date.now() < deadline) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as DesktopState
      } catch {
        await new Promise(resolve => setTimeout(resolve, 40))
      }
    }
    throw new Error(`Desktop produced no state snapshot:\n${this.captured.text}`)
  }

  /** Presses keys in the app's window and returns the state afterwards. */
  async press(...keys: string[]): Promise<DesktopState> {
    return this.state(keys)
  }

  /** Polls `state()` until `done` holds (the model refreshes shortly after the hub writes). */
  async waitForState(done: (state: DesktopState) => boolean, timeout = 10_000): Promise<DesktopState> {
    const deadline = Date.now() + timeout
    let last = await this.state()
    while (!done(last) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
      last = await this.state()
    }
    return last
  }

  /** The database file the app is using. */
  get databasePath(): string {
    return path.join(this.dataDir, 'desktop-fragment-store.sqlite')
  }

  /** Read-only query against the app's own SQLite file, as JSON rows. */
  sql<T = Record<string, unknown>>(query: string): T[] {
    const out = execFileSync('sqlite3', ['-cmd', '.timeout 5000', '-readonly', '-json', this.databasePath, query], { encoding: 'utf8' }).trim()
    return out ? (JSON.parse(out) as T[]) : []
  }

  /**
   * Writes to the app's database from outside while it runs. Stands in for something the user does
   * inside the app (a rating, a delete) that a headless harness cannot click.
   */
  sqlWrite(statements: string): void {
    execFileSync('sqlite3', ['-cmd', '.timeout 5000', this.databasePath, statements], { encoding: 'utf8' })
  }

  /** Quits the app (SIGTERM, like Cmd+Q without the menu) and waits until the port is free. */
  async stop(): Promise<void> {
    if (this.child.exitCode === null && !this.child.killed) this.child.kill('SIGTERM')
    await Promise.race([this.exited, new Promise(resolve => setTimeout(resolve, 5_000))])
    if (this.child.exitCode === null) this.child.kill('SIGKILL')
  }
}
