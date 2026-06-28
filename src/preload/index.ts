// Preload: expose a typed, minimal SiberLLM API to the renderer via contextBridge.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  AppSettings,
  InstallStatus,
  InstallProgress,
  ModelDownloadProgress,
  Profile,
  ProfileTestResult,
  ScanResult,
  ServerConfig,
  ServerLogLine,
  ServerState,
  SshProfileInput
} from '@shared/types'
import type { CatalogModel } from '@shared/constants'
import type { GpuBackend } from '@shared/platforms'

const api = {
  // ---------- install ----------
  install: {
    check: (profileId?: string): Promise<InstallStatus> =>
      ipcRenderer.invoke(IPC.INSTALL_CHECK, profileId),
    start: (backend: GpuBackend | 'auto' | undefined, profileId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.INSTALL_START, backend, profileId),
    onProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IPC.INSTALL_PROGRESS, cb),
    onDone: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IPC.INSTALL_DONE, cb),
    onError: (cb: (p: { message: string }) => void): (() => void) =>
      subscribe(IPC.INSTALL_ERROR, cb)
  },

  // ---------- models ----------
  models: {
    scan: (profileId?: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_SCAN, profileId),
    catalog: (): Promise<CatalogModel[]> => ipcRenderer.invoke(IPC.MODELS_CATALOG),
    delete: (profileId: string, path: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_DELETE, profileId, path),
    addFolder: (profileId: string, folder: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_ADD_FOLDER, profileId, folder),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.MODELS_PICK_FOLDER),
    importFiles: (profileId?: string): Promise<{ imported: number; scan: ScanResult }> =>
      ipcRenderer.invoke(IPC.MODELS_IMPORT_FILES, profileId),
    searchHf: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC.MODELS_SEARCH_HF, query, limit),
    listRepoFiles: (repo: string): Promise<import('@shared/types').RepoFile[]> =>
      ipcRenderer.invoke(IPC.MODELS_LIST_REPO, repo),
    download: (profileId: string, repo: string, file: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_DOWNLOAD_START, profileId, repo, file),
    cancelDownload: (repo: string, file: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.MODELS_CANCEL_DOWNLOAD, repo, file),
    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void): (() => void) =>
      subscribe(IPC.MODELS_DOWNLOAD_PROGRESS, cb),
    onDownloadDone: (cb: (p: { repo: string; file: string }) => void): (() => void) =>
      subscribe(IPC.MODELS_DOWNLOAD_DONE, cb),
    onDownloadError: (
      cb: (p: { repo: string; file: string; message: string; cancelled?: boolean }) => void
    ): (() => void) => subscribe(IPC.MODELS_DOWNLOAD_ERROR, cb)
  },

  // ---------- server ----------
  server: {
    start: (profileId: string, config: ServerConfig): Promise<ServerState> =>
      ipcRenderer.invoke(IPC.SERVER_START, profileId, config),
    stop: (): Promise<ServerState> => ipcRenderer.invoke(IPC.SERVER_STOP),
    status: (): Promise<ServerState> => ipcRenderer.invoke(IPC.SERVER_STATUS),
    probe: (profileId: string, port: number): Promise<ServerState> =>
      ipcRenderer.invoke(IPC.SERVER_PROBE, profileId, port),
    onLog: (cb: (line: ServerLogLine) => void): (() => void) =>
      subscribe(IPC.SERVER_LOG, cb),
    onStatus: (cb: (state: ServerState) => void): (() => void) =>
      subscribe(IPC.SERVER_STATUS, cb),
    onReady: (cb: (p: { url: string }) => void): (() => void) =>
      subscribe(IPC.SERVER_READY, cb),
    onError: (cb: (p: { message: string }) => void): (() => void) =>
      subscribe(IPC.SERVER_ERROR, cb)
  },

  // ---------- settings ----------
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, patch)
  },

  // ---------- profiles (target machines: local + SSH remotes) ----------
  profiles: {
    list: (): Promise<{ profiles: Profile[]; selectedId: string }> =>
      ipcRenderer.invoke(IPC.PROFILES_LIST),
    create: (input: SshProfileInput): Promise<Profile[]> =>
      ipcRenderer.invoke(IPC.PROFILES_CREATE, input),
    update: (id: string, patch: Partial<SshProfileInput>): Promise<Profile[]> =>
      ipcRenderer.invoke(IPC.PROFILES_UPDATE, id, patch),
    remove: (id: string): Promise<Profile[]> =>
      ipcRenderer.invoke(IPC.PROFILES_DELETE, id),
    select: (id: string): Promise<string> =>
      ipcRenderer.invoke(IPC.PROFILES_SELECT, id),
    test: (id: string): Promise<ProfileTestResult> =>
      ipcRenderer.invoke(IPC.PROFILES_TEST, id)
  },

  // ---------- shell ----------
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openPath: (which: 'bin' | 'models' | 'logs' | 'root'): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_PATH, which),

  // ---------- env (read-only facts the renderer may need) ----------
  env: {
    platform: process.platform,
    appVersion: ipcRenderer.sendSync('app:version') as string
  }
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('siberllm', api)

// type export for the renderer (consumed via lib/api.ts)
export type SiberLLMApi = typeof api
