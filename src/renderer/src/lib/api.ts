// Typed accessor for the preload-exposed API.
// Falls back to a stub during SSR or if the preload bridge hasn't loaded yet,
// so renderer modules can be imported without throwing at eval time.

import type { SiberLLMApi } from '../../../preload'

declare global {
  interface Window {
    siberllm: SiberLLMApi
  }
}

const noop = (): never => {
  throw new Error('SiberLLM bridge belum siap (window.siberllm undefined).')
}
const noopSub = (): (() => void) => (): void => {}

const stub: SiberLLMApi = {
  install: {
    check: noop,
    start: noop,
    onProgress: noopSub as never,
    onDone: noopSub as never,
    onError: noopSub as never
  },
  models: {
    scan: noop,
    catalog: noop,
    delete: noop,
    addFolder: noop,
    pickFolder: noop,
    importFiles: noop,
    searchHf: noop,
    listRepoFiles: noop,
    download: noop,
    onDownloadProgress: noopSub as never,
    onDownloadDone: noopSub as never,
    onDownloadError: noopSub as never
  },
  server: {
    start: noop,
    stop: noop,
    status: noop,
    onLog: noopSub as never,
    onStatus: noopSub as never,
    onReady: noopSub as never,
    onError: noopSub as never
  },
  settings: { get: noop, set: noop },
  openExternal: noop,
  openPath: noop,
  env: { platform: 'linux' }
}

// window may be undefined in non-browser environments.
const g = globalThis as { window?: Window }
export const api: SiberLLMApi = (g.window && g.window.siberllm) || stub
