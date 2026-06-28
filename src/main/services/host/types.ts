// The HostTarget abstraction: a uniform interface over the filesystem and
// process-execution capabilities of a machine — either the local machine
// (LocalTarget) or a remote one reached over SSH (SshTarget).
//
// Every service that today touches `node:fs` / `node:child_process` directly is
// refactored to accept a `HostTarget`. The IPC layer resolves which target to
// use from the active profile id.
//
// Design notes:
// - `exec` runs a command to completion and returns collected stdout/stderr.
// - `spawn` runs a long-lived process whose stdout/stderr are streamed line-by-
//   line to callbacks, and that can be killed via the returned handle. This is
//   the seam the server-manager uses.
// - Filesystem ops mirror a small subset of node:fs/promises + SFTP.
// - `home()` returns the target user's home directory; needed for resolving
//   `~/`-style remote paths.

export type HostKind = 'local' | 'ssh'

export interface ExecResult {
  stdout: string
  stderr: string
  /** Process exit code, or null if the process was killed. */
  code: number | null
}

export interface ExecOptions {
  /** Abort the command if it runs longer than this (ms). */
  timeoutMs?: number
  /** Windows-only hint to hide the console window (ignored by SSH). */
  windowsHide?: boolean
  /** Environment overrides merged on top of the target's default env. */
  env?: NodeJS.ProcessEnv
  /** Working directory for the command. */
  cwd?: string
}

export interface SpawnHandlers {
  onStdout?: (line: string) => void
  onStderr?: (line: string) => void
}

/** Handle to a spawned long-lived process. */
export interface ManagedProcess {
  /** The PID on the target machine (may differ from any local PID). */
  readonly pid: number | null
  /** True once the process has exited. */
  readonly exited: boolean
  /**
   * Stop the process. Escalates SIGTERM → SIGKILL and kills the whole process
   * group on the target. Resolves once the process is gone (or already gone).
   */
  kill: () => Promise<void>
  /** Resolve when the process exits (with code or signal). */
  onExit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

export interface StatInfo {
  size: number
  isFile: boolean
  isDir: boolean
}

export interface DirEntry {
  name: string
  isFile: boolean
  isDir: boolean
}

/** A writable byte/char sink used for downloads. Resolves per write for backpressure. */
export interface WritableSink {
  write: (data: Buffer | string) => Promise<void>
  close: () => Promise<void>
}

export interface HostTarget {
  readonly kind: HostKind
  readonly profileId: string
  /** A short label for logging/diagnostics (e.g. "local" or "user@host"). */
  readonly label: string

  // --- lifecycle (mainly relevant for SSH) ---
  /** Ensure the target is reachable; opens a connection for SSH targets. */
  connect(): Promise<void>
  /** Release any underlying resources (SSH connection). Safe to call repeatedly. */
  dispose(): Promise<void>

  // --- process ---
  exec(cmd: string, args: string[], opts?: ExecOptions): Promise<ExecResult>
  spawn(
    cmd: string,
    args: string[],
    handlers: SpawnHandlers,
    opts?: ExecOptions
  ): Promise<ManagedProcess>
  /**
   * Launch a long-running command DETACHED from the caller, with its stdout &
   * stderr redirected to `logFile`. The process must survive the caller (app)
   * exiting so it can be re-adopted later via a probe. Returns the launched
   * PID when known, or null.
   *
   * - POSIX (Local macOS/linux + SSH): `nohup sh -c '<cmd> <args>' > log 2>&1 &`
   * - Windows (Local): `Start-Process` with output redirection.
   */
  launchDetached(
    cmd: string,
    args: string[],
    logFile: string,
    opts?: ExecOptions
  ): Promise<number | null>

  // --- environment ---
  /** The target user's home directory (resolved & cached on first use). */
  home(): Promise<string>
  /** The target's platform/arch/backend tuple. */
  platform(): Promise<{ os: NodeJS.Platform | 'linux' | 'darwin' | 'win32'; arch: string }>

  // --- filesystem ---
  stat(path: string): Promise<StatInfo | null>
  exists(path: string): Promise<boolean>
  readdir(path: string): Promise<DirEntry[]>
  rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
  rename(from: string, to: string): Promise<void>
  chmod(path: string, mode: number): Promise<void>
  /** Copy a file already on the target to another path on the target. */
  copyFile(src: string, dest: string): Promise<void>
  /**
   * Upload a LOCAL file (a path on the machine running the app) to a path on
   * the target. For LocalTarget this is a plain fs copy; for SshTarget it
   * streams the file over SFTP.
   */
  uploadFile(localPath: string, remotePath: string): Promise<void>
  /** Open a writable sink (for streamed downloads). */
  createWriteStream(path: string): Promise<WritableSink>

  // --- network probes (run ON the target) ---
  /**
   * HTTP GET a URL *from the target machine* and report whether it responded
   * with an ok status. Used for health checks so SSH remotes don't depend on
   * their external port being reachable from the app host (which firewalls
   * often block). For Local this is a direct fetch; for SSH it runs curl on
   * the remote against 127.0.0.1.
   */
  httpGetOk(url: string, opts?: { timeoutMs?: number }): Promise<boolean>
  /**
   * HTTP GET a URL *from the target machine* and return the parsed JSON body,
   * or null on any failure (non-ok status, timeout, invalid JSON). Used to read
   * server introspection endpoints (e.g. /props) for an adopted server.
   */
  httpGetJson<T = unknown>(url: string, opts?: { timeoutMs?: number }): Promise<T | null>
  /**
   * Check whether a TCP port is already listening on the target. Used as a
   * pre-flight before starting a server so the user gets a clear "port in use"
   * message rather than a confusing spawn failure.
   */
  portInUse(port: number): Promise<boolean>
  /**
   * Stop any process listening on a TCP port on the target. Used so we can
   * `stop()` a server we didn't spawn in this process (e.g. one started in a
   * previous app session, or manually). Resolves once the port is free (or
   * after best-effort escalation). Returns true if something was killed.
   */
  killPort(port: number): Promise<boolean>
  /**
   * Tail a file on the target, streaming new lines to `onLine`. Resolves once
   * the tail has begun (with the last `tailBackLines` lines of history first).
   * Returns a stop handle. Used to stream a server's log file when we attach
   * to an already-running process (where we don't own its stdio).
   */
  tailFile(
    path: string,
    onLine: (line: string) => void,
    opts?: { tailBackLines?: number }
  ): Promise<TailHandle>
}

/** Handle returned by tailFile() to stop the stream. */
export interface TailHandle {
  stop(): void
}

/**
 * Resolve a path that may start with `~` against the target's home dir.
 * Paths that don't start with `~` are returned unchanged.
 */
export async function resolveHome(target: HostTarget, p: string): Promise<string> {
  if (p === '~') return target.home()
  if (p.startsWith('~/')) {
    const home = await target.home()
    return `${home}/${p.slice(2)}`
  }
  return p
}
