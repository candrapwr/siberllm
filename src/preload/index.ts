// Preload: expose a typed, minimal SiberLLM API to the renderer via contextBridge.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  AppSettings,
  InstallStatus,
  InstallProgress,
  ModelDownloadProgress,
  ScanResult,
  ServerConfig,
  ServerLogLine,
  ServerState
} from '@shared/types'
import type { CatalogModel } from '@shared/constants'
import type { GpuBackend } from '@shared/platforms'

const api = {
  // ---------- install ----------
  install: {
    check: (): Promise<InstallStatus> => ipcRenderer.invoke(IPC.INSTALL_CHECK),
    start: (backend?: GpuBackend | 'auto'): Promise<void> =>
      ipcRenderer.invoke(IPC.INSTALL_START, backend),
    onProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IPC.INSTALL_PROGRESS, cb),
    onDone: (cb: (p: InstallProgress) => void): (() => void) =>
      subscribe(IPC.INSTALL_DONE, cb),
    onError: (cb: (p: { message: string }) => void): (() => void) =>
      subscribe(IPC.INSTALL_ERROR, cb)
  },

  // ---------- models ----------
  models: {
    scan: (): Promise<ScanResult> => ipcRenderer.invoke(IPC.MODELS_SCAN),
    catalog: (): Promise<CatalogModel[]> => ipcRenderer.invoke(IPC.MODELS_CATALOG),
    delete: (path: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_DELETE, path),
    addFolder: (folder: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_ADD_FOLDER, folder),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.MODELS_PICK_FOLDER),
    importFiles: (): Promise<{ imported: number; scan: ScanResult }> =>
      ipcRenderer.invoke(IPC.MODELS_IMPORT_FILES),
    searchHf: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC.MODELS_SEARCH_HF, query, limit),
    listRepoFiles: (repo: string): Promise<import('@shared/types').RepoFile[]> =>
      ipcRenderer.invoke(IPC.MODELS_LIST_REPO, repo),
    download: (repo: string, file: string): Promise<ScanResult> =>
      ipcRenderer.invoke(IPC.MODELS_DOWNLOAD_START, repo, file),
    onDownloadProgress: (cb: (p: ModelDownloadProgress) => void): (() => void) =>
      subscribe(IPC.MODELS_DOWNLOAD_PROGRESS, cb),
    onDownloadDone: (cb: (p: { repo: string; file: string }) => void): (() => void) =>
      subscribe(IPC.MODELS_DOWNLOAD_DONE, cb),
    onDownloadError: (
      cb: (p: { repo: string; file: string; message: string }) => void
    ): (() => void) => subscribe(IPC.MODELS_DOWNLOAD_ERROR, cb)
  },

  // ---------- server ----------
  server: {
    start: (config: ServerConfig): Promise<ServerState> =>
      ipcRenderer.invoke(IPC.SERVER_START, config),
    stop: (): Promise<ServerState> => ipcRenderer.invoke(IPC.SERVER_STOP),
    status: (): Promise<ServerState> => ipcRenderer.invoke(IPC.SERVER_STATUS),
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
