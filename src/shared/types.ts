// Shared types used across main process, preload, and renderer.

import type { GpuBackend, PlatformInfo } from './platforms'

// ----------------------------- install -----------------------------

export interface InstallStatus {
  installed: boolean
  version: string | null // llama-server --version output
  backend: GpuBackend | null
  binaryPath: string | null
  releaseTag: string | null
}

export type InstallStage =
  | 'idle'
  | 'detecting'
  | 'fetching-release'
  | 'downloading'
  | 'extracting'
  | 'finalizing'
  | 'done'
  | 'error'

export interface InstallProgress {
  stage: InstallStage
  percent: number // 0..100 (overall)
  bytesLoaded?: number
  bytesTotal?: number
  bytesPerSec?: number
  message: string
  assetName?: string
}

// ----------------------------- models -----------------------------

export interface LocalModel {
  /** Absolute path to the .gguf file. */
  path: string
  name: string
  sizeBytes: number
  /** True if filename looks like a multimodal projector (mmproj). */
  isMmproj: boolean
}

export interface ScanResult {
  models: LocalModel[]
  mmproj: LocalModel[]
}

export type ModelDownloadState = 'idle' | 'downloading' | 'done' | 'error' | 'cancelled'

export interface ModelDownloadProgress {
  repo: string
  file: string
  percent: number
  bytesLoaded: number
  bytesTotal: number
  bytesPerSec: number
  state: ModelDownloadState
  message?: string
}

export interface RepoFile {
  name: string
  sizeBytes: number
  isMmproj: boolean
  multimodal: boolean
}

// ----------------------------- server -----------------------------

export interface ServerConfig {
  modelPath: string
  mmprojPath?: string
  host: string
  port: number
  contextSize: number
  gpuLayers: number
  extraArgs: string
}

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface ServerState {
  status: ServerStatus
  url: string | null
  pid: number | null
  config: ServerConfig | null
  startedAt: number | null
}

export interface ServerLogLine {
  ts: number
  stream: 'stdout' | 'stderr'
  line: string
}

// ----------------------------- profiles -----------------------------
//
// A "profile" is the target machine where the engine runs and where models
// live. The Local profile (id: LOCAL_PROFILE_ID) always exists and cannot be
// removed. SSH profiles point at a remote machine reached over SSH.
//
// NOTE on password storage: passwords are obfuscated (NOT securely encrypted)
// so they are not stored as plaintext in config.json. Real secret storage
// (OS keychain) is on the roadmap. Treat the obfuscation as a mild deterrent
// only.

export const LOCAL_PROFILE_ID = 'local'

/** Discriminated union: kind is the discriminator. */
export type Profile = LocalProfile | SshProfile

export interface LocalProfile {
  id: typeof LOCAL_PROFILE_ID
  name: string
  kind: 'local'
}

export type SshAuthMethod = 'password'

export interface SshProfile {
  id: string
  name: string
  kind: 'ssh'
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  /** Obfuscated password (use obfuscatePassword/deobfuscatePassword). Empty if unset. */
  passwordEnc: string
  /** Absolute dir on the remote where .gguf models live. */
  remoteModelsDir: string
  /** Absolute dir on the remote where the llama.cpp binary lives. */
  remoteBinDir: string
}

/** Input shape for creating a new SSH profile (no id / no obfuscated pw yet). */
export interface SshProfileInput {
  name: string
  host: string
  port: number
  username: string
  password: string // plaintext, obfuscated before persistence
  remoteModelsDir: string
  remoteBinDir: string
}

/** Payload returned by a connection test. */
export interface ProfileTestResult {
  ok: boolean
  message: string
}

// ----------------------------- settings -----------------------------

export interface AppSettings {
  backend: GpuBackend | 'auto'
  platform: PlatformInfo | null
  defaultHost: string
  defaultPort: number
  defaultContextSize: number
  defaultGpuLayers: number
  extraArgs: string
  extraModelFolders: string[]
  /** All profiles (Local is always present at index 0). */
  profiles: Profile[]
  /** Currently active profile id. Defaults to LOCAL_PROFILE_ID. */
  selectedProfileId: string
}

/** The Local profile, always present and non-deletable. */
export const LOCAL_PROFILE: LocalProfile = {
  id: LOCAL_PROFILE_ID,
  name: 'Local',
  kind: 'local'
}

export const DEFAULT_SETTINGS: AppSettings = {
  backend: 'auto',
  platform: null,
  defaultHost: '127.0.0.1',
  defaultPort: 8080,
  defaultContextSize: 8192,
  defaultGpuLayers: -1,
  extraArgs: '--jinja',
  extraModelFolders: [],
  profiles: [LOCAL_PROFILE],
  selectedProfileId: LOCAL_PROFILE_ID
}
