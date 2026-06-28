// SshTarget: a HostTarget backed by a remote machine reached over SSH (ssh2).
//
// Connection model:
//   - One ssh2.Client per SshTarget, lazily opened on first use and reused
//     across operations. Connect attempts are serialized so concurrent callers
//     share a single connect() handshake.
//   - If the underlying socket closes (idle timeout, network blip), the next
//     operation reconnects transparently.
//
// Process model:
//   - exec(): run-to-completion, collect stdout/stderr + exit code.
//   - spawn(): long-lived process. We launch it through `sh -c` so we can read
//     its PID, and keep the ssh channel open to stream stdout/stderr line by
//     line. Killing sends a signal to the remote PID via a second exec.

import { Client, type ClientChannel, type SFTPWrapper } from 'ssh2'
import type { SshProfile } from '@shared/types'
import { deobfuscatePassword } from '../crypto'
import { shellQuote, shellQuoteAll } from './shell-quote'
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

class SshProcess implements ManagedProcess {
  readonly pid: number | null = null
  readonly exited = false
  private readonly channel: ClientChannel
  private readonly target: SshTarget
  readonly onExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  private _exited = false

  constructor(target: SshTarget, channel: ClientChannel, pid: number | null) {
    this.target = target
    this.channel = channel
    ;(this as { pid: number | null }).pid = pid
    this.onExit = new Promise((resolve) => {
      channel.once('exit', (code: number | null, signal: string | null) => {
        this._exited = true
        ;(this as { exited: boolean }).exited = true
        resolve({ code, signal: (signal as NodeJS.Signals | null) ?? null })
      })
      channel.once('close', () => {
        if (!this._exited) {
          this._exited = true
          ;(this as { exited: boolean }).exited = true
          resolve({ code: null, signal: null })
        }
      })
    })
  }

  async kill(): Promise<void> {
    if (this._exited) return
    const pid = this.pid
    if (pid) {
      // Kill the whole process group: our launcher ran the server under its own
      // shell session, so killing by negative PID (-pid) reaches children too.
      try {
        await this.target.exec('kill', ['-TERM', `-${pid}`], { timeoutMs: 5000 })
      } catch {
        /* best effort */
      }
      // Escalate to SIGKILL after a short grace period if still alive.
      setTimeout(async () => {
        if (this._exited) return
        try {
          await this.target.exec('kill', ['-KILL', `-${pid}`], { timeoutMs: 5000 })
        } catch {
          /* best effort */
        }
      }, 1500)
    }
    // Close the ssh channel to stop streaming.
    try {
      this.channel.end()
    } catch {
      /* ignore */
    }
    // Give the exit/close handler a moment to fire.
    await Promise.race([
      this.onExit,
      new Promise<void>((resolve) => setTimeout(resolve, 2000))
    ])
  }
}

class SshWriteStream implements WritableSink {
  private readonly stream: NodeJS.WritableStream
  private readonly onDone: () => void
  constructor(stream: NodeJS.WritableStream, onDone: () => void) {
    this.stream = stream
    this.onDone = onDone
  }
  write(data: Buffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write(Buffer.isBuffer(data) ? data : Buffer.from(data), (err?: Error | null) =>
        err ? reject(err) : resolve()
      )
    })
  }
  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.stream.once('close', () => resolve())
      try {
        this.stream.end()
      } catch {
        resolve()
      }
      // Safety: resolve after a short delay even if 'close' never fires.
      setTimeout(() => resolve(), 3000)
    }).then(() => this.onDone())
  }
}

export class SshTarget implements HostTarget {
  readonly kind = 'ssh' as const
  readonly profileId: string
  readonly label: string
  protected readonly profile: SshProfile

  private client: Client | null = null
  private connecting: Promise<Client> | null = null
  private disposed = false

  // Cached facts resolved once over SSH.
  private homeCache: string | null = null
  private platformCache: { os: 'linux' | 'darwin' | 'win32'; arch: string } | null = null

  constructor(profile: SshProfile) {
    this.profile = profile
    this.profileId = profile.id
    this.label = `${profile.username}@${profile.host}`
  }

  /** The configured SSH profile. */
  getProfile(): SshProfile {
    return this.profile
  }

  // ----------------------------- lifecycle -----------------------------

  async connect(): Promise<void> {
    await this.ensureConnected()
  }

  private ensureConnected(): Promise<Client> {
    if (this.disposed) throw new Error(`SSH target "${this.label}" has been disposed.`)
    if (this.client && this.clientIsAlive()) return Promise.resolve(this.client)
    if (this.connecting) return this.connecting
    this.connecting = this.openConnection()
    return this.connecting
  }

  private clientIsAlive(): boolean {
    // ssh2 Client has no synchronous "is connected" flag; track via listener.
    // We treat the client as dead once 'close'/'error' fired (handled below).
    return this.client !== null
  }

  private openConnection(): Promise<Client> {
    return new Promise<Client>((resolve, reject) => {
      const client = new Client()
      const password = deobfuscatePassword(this.profile.passwordEnc)
      let settled = false

      const onError = (err: Error): void => {
        if (settled) return
        settled = true
        this.client = null
        this.connecting = null
        reject(err)
      }

      client.once('ready', () => {
        if (settled) return
        settled = true
        this.connecting = null
        // Auto-reconnect on unexpected close.
        client.once('close', () => {
          this.client = null
        })
        client.once('error', () => {
          this.client = null
        })
        resolve(client)
      })
      client.once('error', onError)

      client.connect({
        host: this.profile.host,
        port: this.profile.port,
        username: this.profile.username,
        password,
        readyTimeout: 15000,
        // Disable remote host verification prompts (no known_hosts UI in a
        // desktop app). Users adding a profile accept the host on first connect.
        algorithms: undefined,
        keepaliveInterval: 15000
      })
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const c = this.client
    this.client = null
    this.connecting = null
    if (c) {
      await new Promise<void>((resolve) => {
        c.once('close', () => resolve())
        try {
          c.end()
        } catch {
          resolve()
        }
        setTimeout(() => resolve(), 2000)
      })
    }
  }

  /** Open an SFTP subsystem session. */
  private async sftp(): Promise<SFTPWrapper> {
    const client = await this.ensureConnected()
    return new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
    })
  }

  // ----------------------------- process -----------------------------

  async exec(cmd: string, args: string[], opts: ExecOptions = {}): Promise<ExecResult> {
    const client = await this.ensureConnected()
    const command = `${shellQuote(cmd)} ${shellQuoteAll(args)}`

    return new Promise<ExecResult>((resolve, reject) => {
      let settled = false
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            if (settled) return
            settled = true
            try {
              stream?.destroy()
            } catch {
              /* ignore */
            }
            reject(new Error(`SSH exec timed out after ${opts.timeoutMs}ms: ${command}`))
          }, opts.timeoutMs)
        : null

      let stream: ClientChannel | null = null
      client.exec(command, (err, s) => {
        if (err) {
          if (timer) clearTimeout(timer)
          settled = true
          reject(err)
          return
        }
        stream = s
        let stdout = ''
        let stderr = ''
        s.on('data', (d: Buffer) => {
          stdout += d.toString()
        })
        s.stderr.on('data', (d: Buffer) => {
          stderr += d.toString()
        })
        s.on('exit', (code: number | null) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          resolve({ stdout, stderr, code })
        })
        s.on('error', (e: Error) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          reject(e)
        })
      })
    })
  }

  async spawn(
    cmd: string,
    args: string[],
    handlers: SpawnHandlers,
    _opts?: ExecOptions
  ): Promise<ManagedProcess> {
    const client = await this.ensureConnected()
    const command = `${shellQuote(cmd)} ${shellQuoteAll(args)}`

    // Run under a dedicated shell so we can capture the server's PID and kill
    // its process group later. We print "SIBERLLM_PID:<pid>" once on stderr so
    // the client can parse it out before forwarding real logs.
    const wrapped = `sh -c ${shellQuote(
      `echo "SIBERLLM_PID:$$" >&2; exec ${command}`
    )}`

    return new Promise<ManagedProcess>((resolve, reject) => {
      client.exec(wrapped, (err, stream) => {
        if (err) {
          reject(err)
          return
        }

        let pid: number | null = null
        let stderrBuf = ''

        const flushStderrLine = (): void => {
          if (stderrBuf === '') return
          const lines = stderrBuf.split('\n')
          stderrBuf = lines.pop() ?? ''
          for (const line of lines) {
            const m = line.match(/^SIBERLLM_PID:(\d+)$/)
            if (m) {
              pid = Number(m[1])
              continue // don't forward the marker line
            }
            handlers.onStderr?.(line)
          }
        }

        stream.on('data', (d: Buffer) => {
          const text = d.toString()
          let buf = ''
          buf += text
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) handlers.onStdout?.(line)
          // Stash a trailing partial for stdout? We only line-buffer; keep simple
          // by re-emitting via a closure-less approach: ignore trailing partial
          // (llama-server emits complete lines).
          void buf
        })
        stream.stderr.on('data', (d: Buffer) => {
          stderrBuf += d.toString()
          flushStderrLine()
        })

        // Resolve once we've seen the PID marker (or immediately if the process
        // exits before printing one).
        const proc = new SshProcess(this, stream, pid)
        let resolved = false
        const tryResolve = (): void => {
          if (resolved) return
          resolved = true
          resolve(proc)
        }
        stream.once('exit', () => {
          flushStderrLine()
          // Final flush of partial stdout/stderr is best-effort; ignore.
          tryResolve()
        })
        // Give the marker a moment to arrive, then resolve with whatever PID we
        // have (may be null if the process failed to start).
        setTimeout(tryResolve, 800)
      })
    })
  }

  async launchDetached(
    cmd: string,
    args: string[],
    logFile: string,
    _opts?: ExecOptions
  ): Promise<number | null> {
    // nohup + setsid: detach from the ssh session so the server survives an
    // app quit / ssh disconnect. Redirect both streams to the log file.
    const cmdLine = `${shellQuote(cmd)} ${shellQuoteAll(args)}`
    const wrapped = `nohup sh -c ${shellQuote(cmdLine)} > ${shellQuote(logFile)} 2>&1 & echo "PID=$!"`
    try {
      const r = await this.exec('sh', ['-c', wrapped], { timeoutMs: 10000 })
      const m = (r.stdout || '').match(/PID=(\d+)/)
      return m ? Number(m[1]) : null
    } catch {
      return null
    }
  }

  // ----------------------------- environment -----------------------------

  async home(): Promise<string> {
    if (this.homeCache) return this.homeCache
    // Resolve the remote user's home directory. We must NOT pass '$HOME' as a
    // quoted arg (the quote would suppress shell expansion and yield the
    // literal string "$HOME", creating a folder literally called "$HOME").
    // Instead let `sh` parse and expand $HOME itself; if that's unset, fall
    // back to `getent passwd` for the login user.
    let home = ''
    try {
      const r = await this.exec('sh', ['-c', 'printf %s "$HOME"'])
      home = (r.stdout || '').trim()
    } catch {
      /* fall through to getent */
    }
    if (!home) {
      try {
        const r = await this.exec('getent', ['passwd', this.profile.username])
        // passwd entry: name:passwd:uid:gid:gecos:home:shell
        home = (r.stdout || '').split(':')[5]?.trim() ?? ''
      } catch {
        /* keep empty */
      }
    }
    this.homeCache = home || '/root'
    return this.homeCache
  }

  async platform(): Promise<{ os: 'linux' | 'darwin' | 'win32'; arch: string }> {
    if (this.platformCache) return this.platformCache
    const uname = await this.exec('uname', ['-s'])
    const arch = await this.exec('uname', ['-m'])
    const osName = (uname.stdout || '').trim().toLowerCase()
    const archName = (arch.stdout || '').trim()
    const os: 'linux' | 'darwin' | 'win32' =
      osName === 'darwin' ? 'darwin' : osName === 'linux' ? 'linux' : 'linux'
    this.platformCache = { os, arch: archName || 'x64' }
    return this.platformCache
  }

  // ----------------------------- filesystem -----------------------------

  async stat(path: string): Promise<StatInfo | null> {
    const sftp = await this.sftp()
    try {
      return await new Promise<StatInfo | null>((resolve) => {
        sftp.stat(path, (err, stats) => {
          if (err) {
            resolve(null)
            return
          }
          resolve({
            size: (stats as { size: number }).size,
            isFile: !stats.isDirectory(),
            isDir: stats.isDirectory()
          })
        })
      })
    } finally {
      // sftp session is cheap to reopen; release it after each op.
    }
  }

  async exists(path: string): Promise<boolean> {
    // Use a remote test rather than SFTP stat — cheaper and works regardless of
    // permissions quirks.
    const r = await this.exec('test', ['-e', path])
    return r.code === 0
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const sftp = await this.sftp()
    return new Promise<DirEntry[]>((resolve, reject) => {
      sftp.readdir(path, (err, list) => {
        if (err) {
          // Missing dir → empty (matches local behaviour).
          if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err.message.includes('No such')) {
            resolve([])
            return
          }
          reject(err)
          return
        }
        resolve(
          list.map((e) => ({
            name: e.filename,
            isFile: e.attrs.isFile(),
            isDir: e.attrs.isDirectory()
          }))
        )
      })
    })
  }

  async rm(path: string, opts: { recursive?: boolean; force?: boolean } = {}): Promise<void> {
    const args: string[] = []
    if (opts.recursive) args.push('-r')
    if (opts.force) args.push('-f')
    args.push('--', path)
    const r = await this.exec('rm', args)
    // With -f, a missing file is not an error; without it, ENOENT surfaces as
    // non-zero. Treat as best-effort (matches local fsp.rm with force).
    if (r.code !== 0 && !opts.force) {
      throw new Error(`rm failed: ${r.stderr.trim() || `exit ${r.code}`}`)
    }
  }

  async mkdir(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const args = ['-p']
    args.push(path)
    if (!opts.recursive) args.splice(0, 1) // plain mkdir without -p
    const r = await this.exec('mkdir', args)
    if (r.code !== 0) {
      // -p makes existing-dir a success; only real failures should throw.
      if (!(opts.recursive && /exists/i.test(r.stderr))) {
        throw new Error(`mkdir failed: ${r.stderr.trim() || `exit ${r.code}`}`)
      }
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const r = await this.exec('mv', ['--', from, to])
    if (r.code !== 0) {
      throw new Error(`mv failed: ${r.stderr.trim() || `exit ${r.code}`}`)
    }
  }

  async chmod(path: string, mode: number): Promise<void> {
    const r = await this.exec('chmod', [mode.toString(8), path])
    if (r.code !== 0) {
      throw new Error(`chmod failed: ${r.stderr.trim() || `exit ${r.code}`}`)
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    // Remote-to-remote copy via cp.
    const r = await this.exec('cp', ['--', src, dest])
    if (r.code !== 0) {
      throw new Error(`cp failed: ${r.stderr.trim() || `exit ${r.code}`}`)
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    // Stream a LOCAL file to the remote machine over SFTP.
    const { createReadStream } = await import('node:fs')
    const sftp = await this.sftp()
    return new Promise<void>((resolve, reject) => {
      const localStream = createReadStream(localPath)
      const remoteStream = sftp.createWriteStream(remotePath, { flags: 'w' })
      let settled = false
      const finish = (err?: Error): void => {
        if (settled) return
        settled = true
        if (err) reject(err)
        else resolve()
      }
      localStream.on('error', finish)
      remoteStream.on('error', finish)
      remoteStream.on('close', () => finish())
      localStream.pipe(remoteStream)
    })
  }

  async createWriteStream(path: string): Promise<WritableSink> {
    const sftp = await this.sftp()
    return new Promise<WritableSink>((resolve, reject) => {
      const stream = sftp.createWriteStream(path, { flags: 'w' })
      stream.once('error', reject)
      stream.once('open', () => {
        // Release the error-only listener; SshWriteStream handles close.
        resolve(new SshWriteStream(stream as unknown as NodeJS.WritableStream, () => {}))
      })
    })
  }

  // ----------------------------- network probes -----------------------------

  async httpGetOk(url: string, opts: { timeoutMs?: number } = {}): Promise<boolean> {
    const timeout = Math.round((opts.timeoutMs ?? 5000) / 1000)
    // curl on the remote, hitting the server's loopback. -s silent, -S show
    // errors, -f fail on HTTP >=400, --max-time bounds the wait.
    try {
      const r = await this.exec('curl', [
        '-sSf',
        '--max-time',
        String(timeout),
        url
      ])
      return r.code === 0
    } catch {
      return false
    }
  }

  async httpGetJson<T = unknown>(url: string, opts: { timeoutMs?: number } = {}): Promise<T | null> {
    const timeout = Math.round((opts.timeoutMs ?? 5000) / 1000)
    try {
      const r = await this.exec('curl', ['-sSf', '--max-time', String(timeout), url])
      if (r.code !== 0) return null
      return JSON.parse(r.stdout) as T
    } catch {
      return null
    }
  }

  async portInUse(port: number): Promise<boolean> {
    // `ss` is present on virtually all modern Linux (iproute2); `lsof` is the
    // fallback on systems without it. We check both to be robust.
    const check = async (cmd: string, args: string[]): Promise<boolean> => {
      try {
        const r = await this.exec(cmd, args, { timeoutMs: 5000 })
        return r.code === 0 && r.stdout.trim().length > 0
      } catch {
        return false
      }
    }
    // ss: list TCP listening sockets matching the port. -tlnH = tcp, listening,
    // no header, one-line-per-socket; the '( == :8080 )' filter matches IPv4/6.
    const ss = await check('ss', ['-tlnH', `( sport = :${port} )`])
    if (ss) return true
    // lsof fallback.
    const lsof = await check('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'])
    return lsof
  }

  async killPort(port: number): Promise<boolean> {
    // Resolve the listening PID(s) then SIGTERM them. Prefer fuser (simplest),
    // then ss, then lsof. We don't try to kill a whole process group here
    // (unlike our own spawn) because we don't know the remote process tree —
    // killing the listening PIDs is the reliable signal.
    const pids: number[] = []
    const collect = async (cmd: string, args: string[]): Promise<void> => {
      try {
        const r = await this.exec(cmd, args, { timeoutMs: 5000 })
        if (r.code === 0) {
          for (const tok of r.stdout.split(/\s+/)) {
            const n = Number(tok.trim())
            if (Number.isFinite(n) && n > 0 && !pids.includes(n)) pids.push(n)
          }
        }
      } catch {
        /* try next tool */
      }
    }
    // fuser prints pids on stdout separated by spaces.
    await collect('fuser', [`${port}/tcp`])
    // ss -tlnp prints lines like "...users:(("proc",pid=1234,fd=5))"
    if (pids.length === 0) {
      try {
        const r = await this.exec('ss', ['-tlnp'], { timeoutMs: 5000 })
        for (const line of r.stdout.split('\n')) {
          if (line.includes(`:${port} `) || line.match(new RegExp(`:${port}\\b`))) {
            const m = line.match(/pid=(\d+)/g) ?? []
            for (const mm of m) {
              const n = Number(mm.replace('pid=', ''))
              if (Number.isFinite(n) && n > 0 && !pids.includes(n)) pids.push(n)
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (pids.length === 0) {
      await collect('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    }
    if (pids.length === 0) return false

    for (const pid of pids) {
      try {
        await this.exec('kill', ['-TERM', String(pid)], { timeoutMs: 5000 })
      } catch {
        /* best effort */
      }
    }
    // Escalate to SIGKILL for any survivors.
    await new Promise((r) => setTimeout(r, 1500))
    for (const pid of pids) {
      try {
        await this.exec('kill', ['-KILL', String(pid)], { timeoutMs: 5000 })
      } catch {
        /* best effort */
      }
    }
    return true
  }

  async tailFile(
    path: string,
    onLine: (line: string) => void,
    opts: { tailBackLines?: number } = {}
  ): Promise<TailHandle> {
    const back = opts.tailBackLines ?? 500
    // `tail -n <back> -f` emits the last N lines then streams new ones. The
    // ssh exec channel stays open; we read it line-by-line.
    const client = await this.ensureConnected()
    let stopped = false
    const stopFns: Array<() => void> = []

    await new Promise<void>((resolve, reject) => {
      client.exec(`tail -n ${back} -f ${shellQuote(path)}`, (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        let buf = ''
        const flush = (): void => {
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const l of lines) if (l && !stopped) onLine(l)
        }
        stream.on('data', (d: Buffer) => {
          buf += d.toString()
          flush()
        })
        stream.stderr.on('data', (d: Buffer) => {
          buf += d.toString()
          flush()
        })
        stream.on('error', (e: Error) => {
          if (!stopped) reject(e)
        })
        stopFns.push(() => {
          stopped = true
          try {
            stream.destroy()
          } catch {
            /* ignore */
          }
        })
        // Tail has begun once we get the first data (or immediately).
        resolve()
      })
    }).catch(() => {
      // If exec fails, the tail never starts; return a no-op handle.
    })

    return {
      stop: () => {
        for (const fn of stopFns) fn()
      }
    }
  }
}
