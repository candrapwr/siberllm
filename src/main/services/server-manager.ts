// Spawn & supervise the llama-server process, exposing logs + readiness.

import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import treeKill from 'tree-kill'
import { paths } from './paths'
import type { ServerConfig, ServerLogLine, ServerState, ServerStatus } from '@shared/types'

type LogCb = (line: ServerLogLine) => void
type StatusCb = (state: ServerState) => void

class ServerManager {
  private proc: ChildProcess | null = null
  private logStream: WriteStream | null = null
  private healthTimer: NodeJS.Timeout | null = null
  private onLog: LogCb = () => {}
  private onStatus: StatusCb = () => {}
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

  getState(): ServerState {
    return { ...this.state }
  }

  async start(config: ServerConfig): Promise<void> {
    if (this.proc) {
      throw new Error('Server sudah berjalan. Hentikan dulu.')
    }

    await paths.ensure()
    const logFile = paths.logFile()
    mkdirSync(paths.logs(), { recursive: true })
    this.logStream = createWriteStream(logFile, { flags: 'a' })

    const binary = paths.serverBinary()
    const args = this.buildArgs(config)

    this.setState({
      status: 'starting',
      url: null,
      pid: null,
      config,
      startedAt: Date.now()
    })

    const child = spawn(binary, args, {
      windowsHide: true,
      env: { ...process.env }
    })
    this.proc = child

    const handleStream = (stream: NodeJS.ReadableStream, kind: 'stdout' | 'stderr'): void => {
      let buf = ''
      stream.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const entry: ServerLogLine = { ts: Date.now(), stream: kind, line }
          this.onLog(entry)
          this.logStream?.write(`[${entry.ts}] ${line}\n`)
        }
      })
    }
    if (child.stdout) handleStream(child.stdout, 'stdout')
    if (child.stderr) handleStream(child.stderr, 'stderr')

    child.on('exit', (code, signal) => {
      this.logStream?.write(
        `\n[llama-server exited code=${code} signal=${signal}]\n`
      )
      this.cleanup()
      this.setState({
        status: 'stopped',
        url: null,
        pid: null,
        config: null,
        startedAt: null
      })
    })
    child.on('error', (err) => {
      this.logStream?.write(`\n[spawn error] ${err.message}\n`)
      this.cleanup()
      this.setState({
        status: 'error',
        url: null,
        pid: null,
        config: null,
        startedAt: null
      })
      this.onStatus(this.state)
    })

    if (child.pid) {
      this.setState({ ...this.state, status: 'starting', pid: child.pid })
    }

    // Poll /health to detect readiness.
    const url = `http://${config.host}:${config.port}`
    this.startHealthPolling(url)
  }

  async stop(): Promise<void> {
    if (!this.proc || !this.proc.pid) {
      this.cleanup()
      return
    }
    const pid = this.proc.pid
    await new Promise<void>((resolve) => {
      treeKill(pid, 'SIGTERM', () => {
        // give it a moment then escalate
        setTimeout(() => {
          if (this.proc && this.proc.pid === pid && !this.proc.killed) {
            treeKill(pid, 'SIGKILL', () => resolve())
          } else {
            resolve()
          }
        }, 1500)
      })
    })
    this.cleanup()
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

  private startHealthPolling(url: string): void {
    const urlHealth = `${url}/health`
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(urlHealth)
        if (res.ok) {
          this.setState({ ...this.state, status: 'running', url })
          this.clearHealth()
        }
      } catch {
        // not ready yet
      }
    }
    this.healthTimer = setInterval(tick, 800)
    void tick()
    // safety: stop polling after 60s regardless
    setTimeout(() => {
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
    this.logStream?.end()
    this.logStream = null
    this.proc = null
  }

  private setState(next: ServerState): void {
    this.state = next
    this.onStatus(this.state)
  }
}

export const serverManager = new ServerManager()
export type { ServerStatus }
