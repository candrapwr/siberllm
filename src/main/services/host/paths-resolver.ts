// Per-target path resolution. The legacy `paths` object (paths.ts) handles the
// local machine. For SSH targets, the relevant dirs come from the profile
// config (remoteBinDir / remoteModelsDir), and the binary name is the same.
//
// We expose a single async-friendly AsyncPathResolver interface so services
// don't branch on target kind when they just need "where is the binary / where
// do models live". Local methods resolve immediately (wrapped in Promises);
// SSH methods resolve `~`-paths against the remote home dir over SSH.

import { join, dirname } from 'node:path'
import { paths as localPaths } from '../paths'
import type { HostTarget } from './types'
import { resolveHome } from './types'
import type { SshProfile } from '@shared/types'

export interface AsyncPathResolver {
  bin(): Promise<string>
  models(): Promise<string>
  /** The logs directory (local only; '' for SSH targets). */
  logs(): Promise<string>
  /** The server log file path (local only; '' for SSH targets). */
  logFile(): Promise<string>
  downloadCache(): Promise<string>
  serverBinary(): Promise<string>
  ensure(): Promise<void>
}

export const ROOT_NAME = 'siberllm'

// ----------------------------- local -----------------------------

function localAsync(): AsyncPathResolver {
  return {
    bin: async () => localPaths.bin(),
    models: async () => localPaths.models(),
    logs: async () => localPaths.logs(),
    logFile: async () => localPaths.logFile(),
    downloadCache: async () => localPaths.downloadCache(),
    serverBinary: async () => localPaths.serverBinary(),
    ensure: async () => localPaths.ensure()
  }
}

// ----------------------------- ssh -----------------------------

class SshPathResolver implements AsyncPathResolver {
  private readonly profile: SshProfile
  private readonly target: HostTarget
  private binResolved: string | null = null
  private modelsResolved: string | null = null
  private cacheResolved: string | null = null

  constructor(target: HostTarget, profile: SshProfile) {
    this.target = target
    this.profile = profile
  }

  private async ensureResolved(): Promise<void> {
    if (this.binResolved && this.modelsResolved && this.cacheResolved) return
    this.binResolved = await resolveHome(this.target, this.profile.remoteBinDir)
    this.modelsResolved = await resolveHome(this.target, this.profile.remoteModelsDir)
    // Cache dir is a sibling of bin/ (e.g. ~/.siberllm/downloads). It MUST be
    // separate from bin/ because the install flow does `rm -rf bin/` to clear
    // stale binaries — if the archive lived there it would be wiped before
    // extraction.
    const binParent = dirname(this.binResolved)
    this.cacheResolved = join(binParent, 'downloads')
  }

  async bin(): Promise<string> {
    await this.ensureResolved()
    return this.binResolved!
  }
  async models(): Promise<string> {
    await this.ensureResolved()
    return this.modelsResolved!
  }
  // Remote logs live under <siberllm-root>/logs/server.log. The detached server
  // redirects its output there, and the app tails it for live logs + history.
  async logs(): Promise<string> {
    await this.ensureResolved()
    const root = dirname(this.binResolved!)
    return join(root, 'logs')
  }
  async logFile(): Promise<string> {
    const logsDir = await this.logs()
    return join(logsDir, 'server.log')
  }
  async downloadCache(): Promise<string> {
    await this.ensureResolved()
    return this.cacheResolved!
  }
  async serverBinary(): Promise<string> {
    const bin = await this.bin()
    // Remote is assumed POSIX (Linux/macOS); no .exe suffix.
    return join(bin, 'llama-server')
  }
  async ensure(): Promise<void> {
    await this.target.mkdir(await this.bin(), { recursive: true })
    await this.target.mkdir(await this.models(), { recursive: true })
    await this.target.mkdir(await this.downloadCache(), { recursive: true })
    await this.target.mkdir(await this.logs(), { recursive: true })
  }
}

export function resolvePaths(target: HostTarget, profile?: SshProfile): AsyncPathResolver {
  if (target.kind === 'local') return localAsync()
  if (!profile) throw new Error('SSH target requires a profile for path resolution.')
  return new SshPathResolver(target, profile)
}
