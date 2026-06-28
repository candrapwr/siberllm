// Spawn & supervise the llama-server process on a target machine, exposing
// logs + readiness.
//
// The manager is configured per active profile via configure(target, paths).
// Only one server may run at a time across all profiles (enforced here). When
// the user switches profiles, the caller should stop() the running server
// first; a fresh configure() + start() then targets the new machine.

import { mkdirSync } from 'node:fs'
import { paths as localPaths } from './paths'
import type { HostTarget, ManagedProcess, TailHandle } from './host/types'
import { type AsyncPathResolver } from './host/paths-resolver'
import { localTarget } from './host/local-target'
import { getAccessUrl, LOCAL_PROFILE, defaultBindHost, type Profile } from '@shared/profiles'
import type { ServerConfig, ServerLogLine, ServerState, ServerStatus } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

type LogCb = (line: ServerLogLine) => void
type StatusCb = (state: ServerState) => void

/** Build a partial ServerConfig for an adopted server (best-effort defaults). */
function recoveredConfig(profile: Profile, port: number): ServerConfig {
  return {
    modelPath: '',
    mmprojPath: undefined,
    host: defaultBindHost(profile),
    port,
    contextSize: DEFAULT_SETTINGS.defaultContextSize,
    gpuLayers: DEFAULT_SETTINGS.defaultGpuLayers,
    extraArgs: DEFAULT_SETTINGS.extraArgs
  }
}

class ServerManager {
  private target: HostTarget = localTarget
  private paths: AsyncPathResolver | null = null
  private profile: Profile = LOCAL_PROFILE
  private proc: ManagedProcess | null = null
  /** Non-null when we attached to a server we didn't spawn (reconnect/SSH). */
  private tail: TailHandle | null = null
  private healthTimer: NodeJS.Timeout | null = null
  /** The port of the currently running/attached server, for stop() fallback. */
  private activePort: number | null = null
  private onLog: LogCb = () => {}
  private onStatus: StatusCb = () => {}
  /**
   * Generation token incremented on every detach(). Pending exit callbacks
   * from a previously-spawned process capture the token and no-op if it no
   * longer matches, so an old process exiting doesn't clobber the state of a
   * different profile we've since switched to.
   */
  private generation = 0
  private state: ServerState = {
    status: 'stopped',
    url: null,
    pid: null,
    config: null,
    startedAt: null
  }

  setHandlers(onLog: LogCb, onStatus: StatusCb): void {
    this.onLog = onLog
    this.onStatus = onStatus
  }

  /**
   * Configure the active target + path resolver + profile. Switching targets
   * detaches the manager from the previously active server: it stops tracking
   * the old process/tail and resets state to "unknown", so the next probe()
   * reflects the NEW machine (not a stale leftover from the previous profile).
   *
   * IMPORTANT: detach does NOT kill the old server. If it was a Local server we
   * spawned, the child keeps running on the local machine and will be detected
   * again by a future probe when the user switches back. SSH servers are
   * detached by nature. The user must explicitly `stop()` to kill anything.
   */
  configure(target: HostTarget, paths: AsyncPathResolver, profile: Profile): void {
    // Detach from the previous target without killing it.
    if (
      this.target !== target ||
      this.profile?.id !== profile.id
    ) {
      this.detach()
    }
    this.target = target
    this.paths = paths
    this.profile = profile
  }

  /** Release all handles to the current target; reset state to "unknown". */
  private detach(): void {
    this.clearHealth()
    this.stopTail()
    // Bump generation so health-poll callbacks from the old target know they
    // are stale. (Process exit callbacks keep streaming logs for a still-owned
    // local child — we deliberately keep that child alive across profiles.)
    this.generation++
    // Detached servers (Local + SSH) are NOT killed on profile switch; the user
    // may switch back and re-adopt via probe(). We only stop tracking them.
    this.activePort = null
    this.state = {
      status: 'stopped',
      url: null,
      pid: null,
      config: null,
      startedAt: null
    }
  }

  getState(): ServerState {
    return { ...this.state }
  }

  /**
   * Probe whether a server is already running on the target at the given port
   * (e.g. started in a previous app session, or manually). If alive, adopt it:
   * set status=running, start tailing its log file, and remember the port so
   * stop() can kill it. Returns the resulting state.
   */
  async probeStatus(port: number): Promise<ServerState> {
    if (!this.paths) return this.getState()
    const myGen = this.generation

    const probeUrl = `http://127.0.0.1:${port}/health`
    let alive = false
    try {
      alive = await this.target.httpGetOk(probeUrl, { timeoutMs: 4000 })
    } catch {
      alive = false
    }
    // Profile changed while we were probing — discard this result.
    if (myGen !== this.generation) return this.getState()

    if (!alive) {
      // Nothing running. Ensure we reflect stopped (e.g. after app restart that
      // killed our old process) and stop any stale tail.
      this.stopTail()
      if (this.state.status !== 'stopped') {
        this.setState({
          status: 'stopped',
          url: null,
          pid: null,
          config: null,
          startedAt: null
        })
      }
      return this.getState()
    }

    // A server is alive on the target. Adopt it.
    this.activePort = port
    const accessUrl = getAccessUrl(this.profile, port)

    // Recover which model is running so the UI's model picker reflects it.
    // llama-server's /props returns { model_path, total_slots, ... } — the
    // absolute path of the loaded model (same as the -m arg used to start it).
    let recoveredModel: string | undefined
    try {
      const props = await this.target.httpGetJson<{ model_path?: string }>(
        `http://127.0.0.1:${port}/props`,
        { timeoutMs: 4000 }
      )
      recoveredModel = props?.model_path
    } catch {
      /* best effort */
    }
    if (myGen !== this.generation) return this.getState()

    this.setState({
      status: 'running',
      url: accessUrl,
      pid: null, // unknown for an adopted server
      config: recoveredModel
        ? { ...recoveredConfig(this.profile, port), modelPath: recoveredModel }
        : null,
      startedAt: null
    })
    // Stream its log file so the user sees history + live output.
    await this.startTail()
    return this.getState()
  }

  async start(config: ServerConfig): Promise<void> {
    if (this.state.status === 'running' || this.state.status === 'starting') {
      throw new Error('Server sudah berjalan. Hentikan dulu.')
    }
    if (!this.paths) {
      throw new Error('Server manager is not configured (no path resolver).')
    }

    // Pre-flight: refuse to start if the port is already taken on the target.
    try {
      const taken = await this.target.portInUse(config.port)
      if (taken) {
        throw new Error(
          `Port ${config.port} sudah dipakai di ${this.profile.name}. ` +
            `Hentikan service lain atau ganti port.`
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('sudah dipakai')) throw err
    }

    const logFile = await this.paths.logFile()
    // Ensure the log dir exists so the detached redirect can write to it.
    if (logFile) {
      try {
        await this.paths.ensure()
      } catch {
        /* best effort */
      }
      if (this.target.kind === 'local') {
        // Local Windows uses PowerShell; ensure the dir via node fs.
        const logDir = localPaths.logs()
        mkdirSync(logDir, { recursive: true })
      }
    }

    this.activePort = config.port
    this.setState({
      status: 'starting',
      url: null,
      pid: null,
      config,
      startedAt: Date.now()
    })

    // Both Local and SSH launch the server DETACHED (nohup on POSIX, Start-Process
    // on Windows) with stdio redirected to a log file, then tail that file. This
    // means the server survives the app closing on BOTH targets, and the app can
    // re-adopt it via probe() on the next launch.
    await this.startDetached(config)

    const probeUrl = `http://127.0.0.1:${config.port}/health`
    const accessUrl = getAccessUrl(this.profile, config.port)
    this.startHealthPolling(probeUrl, accessUrl)
  }

  /**
   * Launch the server detached with stdio redirected to its log file, then tail
   * that file for live logs. Works for both Local (POSIX + Windows) and SSH.
   * The server keeps running after the app exits; a later probe() re-adopts it.
   */
  private async startDetached(config: ServerConfig): Promise<void> {
    const binary = await this.paths!.serverBinary()
    const args = this.buildArgs(config)
    const logFile = await this.paths!.logFile()
    const log = logFile || (await this.defaultRemoteLog())
    if (log) {
      await this.target.mkdir(await this.dirname(log), { recursive: true }).catch(() => {})
    }

    try {
      const pid = await this.target.launchDetached(binary, args, log, {
        env: { ...process.env }
      })
      if (pid) this.setState({ ...this.state, pid })
    } catch (err) {
      this.cleanup()
      this.setState({
        status: 'error',
        url: null,
        pid: null,
        config: null,
        startedAt: null
      })
      throw err
    }
    // Begin tailing the log file for live output (history + new lines).
    await this.startTail()
  }

  async stop(): Promise<void> {
    // If we own the spawned process, kill it.
    if (this.proc) {
      const proc = this.proc
      try {
        await proc.kill()
      } catch {
        /* best effort */
      }
    } else if (this.activePort != null) {
      // Adopted/remote server: kill whatever is listening on the port.
      try {
        await this.target.killPort(this.activePort)
      } catch {
        /* best effort */
      }
    }
    this.cleanup()
    this.setState({
      status: 'stopped',
      url: null,
      pid: null,
      config: null,
      startedAt: null
    })
  }

  // ----------------------------- helpers -----------------------------

  private async startTail(): Promise<void> {
    this.stopTail()
    // For the local target we never tail: when we spawn a local server we own
    // its stdio and stream it live, and writing+reading the same log file would
    // loop. Tailing is only for SSH / adopted servers where we have no stdio.
    if (this.target.kind === 'local') return
    const logFile = await this.paths!.logFile()
    const remoteLog = logFile || (await this.defaultRemoteLog())
    if (!remoteLog) return
    try {
      this.tail = await this.target.tailFile(
        remoteLog,
        (line) => this.emitLogFromTail(line),
        { tailBackLines: 500 }
      )
    } catch {
      /* tail optional */
    }
  }

  private stopTail(): void {
    if (this.tail) {
      try {
        this.tail.stop()
      } catch {
        /* ignore */
      }
      this.tail = null
    }
  }

  private async defaultRemoteLog(): Promise<string> {
    // Fallback log location for SSH when the resolver didn't provide one:
    // ~/.siberllm/logs/server.log on the remote.
    const home = await this.target.home().catch(() => '/root')
    return `${home}/.siberllm/logs/server.log`
  }

  private async dirname(p: string): Promise<string> {
    const idx = p.lastIndexOf('/')
    return idx > 0 ? p.slice(0, idx) : '.'
  }

  /**
   * Forward a line read from the log file (via tail) to the renderer. The
   * detached server already writes its own output to the log file, so we must
   * NOT echo it back there (that would loop: tail reads → write → …).
   */
  private emitLogFromTail(line: string): void {
    const entry: ServerLogLine = { ts: Date.now(), stream: 'stderr', line }
    this.onLog(entry)
  }

  private buildArgs(config: ServerConfig): string[] {
    const args = [
      '-m', config.modelPath,
      '--host', config.host,
      '--port', String(config.port),
      '--ctx-size', String(config.contextSize),
      '--n-gpu-layers', String(config.gpuLayers)
    ]
    if (config.mmprojPath) {
      args.push('--mmproj', config.mmprojPath)
    }
    if (config.extraArgs?.trim()) {
      args.push(...this.shellSplit(config.extraArgs.trim()))
    }
    return args
  }

  /** Minimal POSIX-ish splitter for the extra-args string. */
  private shellSplit(input: string): string[] {
    const out: string[] = []
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(input))) {
      out.push(m[1] ?? m[2] ?? m[3] ?? '')
    }
    return out
  }

  /**
   * Poll the server's /health endpoint until it responds ok.
   * @param probeUrl  the URL to probe (always 127.0.0.1:<port>/health, run ON
   *                  the target so firewalls on the external port don't matter)
   * @param accessUrl the URL to surface to the user (127.0.0.1 for Local, the
   *                  remote host for SSH)
   */
  private startHealthPolling(probeUrl: string, accessUrl: string): void {
    const myGen = this.generation
    const tick = async (): Promise<void> => {
      if (myGen !== this.generation) {
        this.clearHealth()
        return
      }
      try {
        const ok = await this.target.httpGetOk(probeUrl, { timeoutMs: 4000 })
        if (myGen !== this.generation) return
        if (ok) {
          this.setState({ ...this.state, status: 'running', url: accessUrl })
          this.clearHealth()
        }
      } catch {
        // not ready yet
      }
    }
    this.healthTimer = setInterval(tick, 1500)
    void tick()
    // safety: stop polling after 60s regardless
    setTimeout(() => {
      if (myGen !== this.generation) return
      if (this.healthTimer && this.state.status === 'starting') {
        this.clearHealth()
        this.setState({ ...this.state, status: 'error' })
      }
    }, 60_000)
  }

  private clearHealth(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private cleanup(): void {
    this.clearHealth()
    this.stopTail()
    this.proc = null
    this.activePort = null
  }

  private setState(next: ServerState): void {
    this.state = next
    this.onStatus(this.state)
  }
}

export const serverManager = new ServerManager()
export type { ServerStatus }
