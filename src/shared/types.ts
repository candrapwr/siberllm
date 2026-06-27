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

export type ModelDownloadState = 'idle' | 'downloading' | 'done' | 'error'

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  backend: 'auto',
  platform: null,
  defaultHost: '127.0.0.1',
  defaultPort: 8080,
  defaultContextSize: 8192,
  defaultGpuLayers: -1,
  extraArgs: '--jinja',
  extraModelFolders: []
}
