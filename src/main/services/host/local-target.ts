// LocalTarget: a HostTarget backed by the local machine via node:child_process
// and node:fs. This reproduces the exact behaviour the services had before the
// HostTarget refactor, so local operations stay 100% identical.

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { open } from 'node:fs/promises'
import {
  promises as fsp,
  createWriteStream as fsCreateWriteStream,
  watchFile,
  unwatchFile,
  statSync,
  type Dirent,
  type WriteStream,
  existsSync as fsExistsSync
} from 'node:fs'
import { homedir } from 'node:os'
import { createConnection } from 'node:net'
import treeKill from 'tree-kill'
import { LOCAL_PROFILE_ID } from '@shared/types'
import type {
  DirEntry,
  ExecOptions,
  ExecResult,
  HostTarget,
  ManagedProcess,
  SpawnHandlers,
  StatInfo,
  TailHandle,
  WritableSink
} from './types'

class LocalProcess implements ManagedProcess {
  readonly pid: number | null
  readonly exited = false
  private readonly child: ChildProcess
  readonly onExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  private _exited = false

  constructor(child: ChildProcess) {
    this.child = child
    this.pid = child.pid ?? null
    this.onExit = new Promise((resolve) => {
      child.once('exit', (code, signal) => {
        this._exited = true
        ;(this as { exited: boolean }).exited = true
        resolve({ code, signal })
      })
    })
  }

  async kill(): Promise<void> {
    if (this._exited || !this.pid) return
    await new Promise<void>((resolve) => {
      treeKill(this.pid!, 'SIGTERM', () => {
        setTimeout(() => {
          if (!this._exited && !this.child.killed) {
            treeKill(this.pid!, 'SIGKILL', () => resolve())
          } else {
            resolve()
          }
        }, 1500)
      })
    })
  }
}

class LocalWriteStream implements WritableSink {
  private readonly stream: WriteStream
  constructor(path: string) {
    this.stream = fsCreateWriteStream(path)
  }
  write(data: Buffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write(data, (err) => (err ? reject(err) : resolve()))
    })
  }
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.end(() => resolve())
      this.stream.on('error', reject)
    })
  }
}

class LocalTarget implements HostTarget {
  readonly kind = 'local' as const
  readonly profileId = LOCAL_PROFILE_ID
  readonly label = 'local'

  private homeCache: string | null = null

  async connect(): Promise<void> {
    /* nothing to do for the local machine */
  }
  async dispose(): Promise<void> {
    /* nothing to do */
  }

  async exec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = execFile(cmd, args, {
            windowsHide: opts.windowsHide ?? true,
            timeout: opts.timeoutMs,
            env: { ...process.env, ...(opts.env ?? {}) },
            cwd: opts.cwd,
            maxBuffer: 64 * 1024 * 1024
          } as Parameters<typeof execFile>[2], (err, stdout, stderr) => {
            if (err) reject(err)
            else resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
          })
          void child
        }
      )
      return { stdout, stderr, code: 0 }
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string }
      // execFile rejects with an object that carries stdout/stderr on success-ish
      // exits (non-zero code) — surface those.
      if (typeof e.code === 'number' || (e.stdout != null && e.stderr != null)) {
        return {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? e.message ?? '',
          code: typeof e.code === 'number' ? e.code : null
        }
      }
      throw err
    }
  }

  async spawn(
    cmd: string,
    args: string[],
    handlers: SpawnHandlers,
    opts: ExecOptions = {}
  ): Promise<ManagedProcess> {
    const child = spawn(cmd, args, {
      windowsHide: opts.windowsHide ?? true,
      env: { ...process.env, ...(opts.env ?? {}) },
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const lineBuf = (
      stream: NodeJS.ReadableStream | null,
      cb: ((line: string) => void) | undefined
    ): void => {
      if (!stream || !cb) return
      let buf = ''
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) cb(line)
      })
    }
    lineBuf(child.stdout, handlers.onStdout)
    lineBuf(child.stderr, handlers.onStderr)

    return new LocalProcess(child)
  }

  async launchDetached(
    cmd: string,
    args: string[],
    logFile: string,
    opts: ExecOptions = {}
  ): Promise<number | null> {
    const env = { ...process.env, ...(opts.env ?? {}) }
    if (process.platform === 'win32') {
      // Windows: Start-Process with redirection. -PassThru returns the process
      // object so we can read its Id. stdout/stderr go to separate files.
      const q = (a: string): string => `'${a.replace(/'/g, "''")}'`
      const argList = '@(' + args.map(q).join(',') + ')'
      const ps = `$p = Start-Process -FilePath ${q(cmd)} -ArgumentList ${argList} -RedirectStandardOutput ${q(
        logFile
      )} -RedirectStandardError ${q(logFile + '.err')} -PassThru -WindowStyle Hidden; Write-Output $p.Id`
      try {
        const r = await this.exec('powershell', ['-NoProfile', '-Command', ps], {
          timeoutMs: 10000
        })
        const pid = Number((r.stdout || '').trim())
        return Number.isFinite(pid) && pid > 0 ? pid : null
      } catch {
        return null
      }
    }
    // POSIX: nohup <cmd> <args> > log 2>&1 & echo PID=$!
    const shQuote = (a: string): string => {
      if (a === '') return "''"
      if (/^[A-Za-z0-9@%+=:,./_-]+$/.test(a)) return a
      return `'${a.replace(/'/g, `'\\''`)}'`
    }
    const cmdLine = [cmd, ...args].map(shQuote).join(' ')
    const wrapped = `nohup sh -c ${shQuote(cmdLine)} > ${shQuote(logFile)} 2>&1 & echo "PID=$!"`
    try {
      const r = await this.exec('sh', ['-c', wrapped], { timeoutMs: 10000, env })
      const m = (r.stdout || '').match(/PID=(\d+)/)
      return m ? Number(m[1]) : null
    } catch {
      return null
    }
  }

  async home(): Promise<string> {
    if (this.homeCache) return this.homeCache
    this.homeCache = homedir()
    return this.homeCache
  }

  async platform(): Promise<{ os: NodeJS.Platform; arch: string }> {
    return { os: process.platform, arch: process.arch }
  }

  async stat(path: string): Promise<StatInfo | null> {
    try {
      const st = await fsp.stat(path)
      return { size: st.size, isFile: st.isFile(), isDir: st.isDirectory() }
    } catch {
      return null
    }
  }

  async exists(path: string): Promise<boolean> {
    return fsExistsSync(path)
  }

  async readdir(path: string): Promise<DirEntry[]> {
    let entries: Dirent[]
    try {
      entries = await fsp.readdir(path, { withFileTypes: true })
    } catch {
      return []
    }
    return entries.map((e) => ({
      name: e.name,
      isFile: e.isFile(),
      isDir: e.isDirectory()
    }))
  }

  async rm(path: string, opts: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
    await fsp.rm(path, { recursive: opts.recursive ?? false, force: opts.force ?? false })
  }

  async mkdir(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    await fsp.mkdir(path, { recursive: opts.recursive ?? false })
  }

  async rename(from: string, to: string): Promise<void> {
    await fsp.rename(from, to)
  }

  async chmod(path: string, mode: number): Promise<void> {
    await fsp.chmod(path, mode)
  }

  async copyFile(src: string, dest: string): Promise<void> {
    await fsp.copyFile(src, dest)
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    // On the local target, an "upload" is just a copy.
    await fsp.copyFile(localPath, remotePath)
  }

  async createWriteStream(path: string): Promise<WritableSink> {
    return new LocalWriteStream(path)
  }

  async httpGetOk(url: string, opts: { timeoutMs?: number } = {}): Promise<boolean> {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      return res.ok
    } catch {
      return false
    }
  }

  async httpGetJson<T = unknown>(url: string, opts: { timeoutMs?: number } = {}): Promise<T | null> {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async portInUse(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // A quick TCP connect attempt: if something is listening, the socket
      // connects immediately; if not, it errors.
      const sock = createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy()
        resolve(true)
      })
      sock.on('error', () => resolve(false))
      // Fallback timeout in case neither fires.
      setTimeout(() => {
        sock.destroy()
        resolve(false)
      }, 1500)
    })
  }

  async killPort(port: number): Promise<boolean> {
    // Find the listening PID via lsof and tree-kill it (covers the process and
    // any workers). Best-effort: lsof may be absent.
    try {
      const r = await this.exec('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
      const pids = r.stdout
        .split('\n')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (pids.length === 0) return false
      for (const pid of pids) {
        await new Promise<void>((resolve) => treeKill(pid, 'SIGTERM', () => resolve()))
      }
      return true
    } catch {
      return false
    }
  }

  async tailFile(
    path: string,
    onLine: (line: string) => void,
    opts: { tailBackLines?: number } = {}
  ): Promise<TailHandle> {
    const back = opts.tailBackLines ?? 500
    let stopped = false
    let size = 0

    // Emit the last N lines of history first.
    try {
      const fh = await open(path, 'r')
      const st = await fh.stat()
      size = st.size
      // Read up to the last ~64KB to find N lines cheaply.
      const readSize = Math.min(size, 64 * 1024)
      const buf = Buffer.alloc(readSize)
      await fh.read(buf, 0, readSize, size - readSize)
      await fh.close()
      const text = buf.toString('utf8')
      const lines = text.split('\n')
      const history = lines.slice(-back).filter((l) => l.length > 0)
      for (const l of history) if (!stopped) onLine(l)
    } catch {
      /* file may not exist yet */
    }

    // Watch for growth and stream new bytes.
    const interval = setInterval(async () => {
      if (stopped) return
      try {
        const st = statSync(path)
        if (st.size <= size) return
        const fh = await open(path, 'r')
        const buf = Buffer.alloc(st.size - size)
        await fh.read(buf, 0, buf.length, size)
        size = st.size
        await fh.close()
        const chunk = buf.toString('utf8')
        for (const line of chunk.split('\n')) {
          if (line && !stopped) onLine(line)
        }
      } catch {
        /* file vanished or transient */
      }
    }, 1000)
    // Also keep watchFile as a fallback signal on platforms where statSync
    // timing is coarse; harmless duplicate work is deduped by size check.
    watchFile(path, { interval: 1000 }, () => {
      /* stat interval above does the actual reading */
    })

    return {
      stop: () => {
        stopped = true
        clearInterval(interval)
        try {
          unwatchFile(path)
        } catch {
          /* ignore */
        }
      }
    }
  }
}

/** Singleton: there is only ever one local machine. */
export const localTarget: HostTarget = new LocalTarget()
