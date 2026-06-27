// Server lifecycle state for the renderer.

import { create } from 'zustand'
import type { ServerConfig, ServerLogLine, ServerState } from '@shared/types'
import { api } from '../lib/api'
import { DEFAULT_SETTINGS } from '@shared/types'

const MAX_LOG_LINES = 2000

interface ServerStore {
  state: ServerState | null
  logs: ServerLogLine[]
  config: ServerConfig
  setConfig: (patch: Partial<ServerConfig>) => void
  start: () => Promise<void>
  stop: () => Promise<void>
  refresh: () => Promise<void>
  clearLogs: () => void
}

const defaultConfig: ServerConfig = {
  modelPath: '',
  mmprojPath: undefined,
  host: DEFAULT_SETTINGS.defaultHost,
  port: DEFAULT_SETTINGS.defaultPort,
  contextSize: DEFAULT_SETTINGS.defaultContextSize,
  gpuLayers: DEFAULT_SETTINGS.defaultGpuLayers,
  extraArgs: DEFAULT_SETTINGS.extraArgs
}

export const useServerStore = create<ServerStore>((set, get) => ({
  state: null,
  logs: [],
  config: defaultConfig,

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  start: async () => {
    set({ logs: [] })
    await api.server.start(get().config)
  },

  stop: async () => {
    await api.server.stop()
  },

  refresh: async () => {
    const state = await api.server.status()
    set({ state })
  },

  clearLogs: () => set({ logs: [] })
}))

api.server.onLog((line) =>
  useServerStore.setState((s) => {
    const logs = [...s.logs, line]
    if (logs.length > MAX_LOG_LINES) logs.splice(0, logs.length - MAX_LOG_LINES)
    return { logs }
  })
)
api.server.onStatus((state) => useServerStore.setState({ state }))
api.server.onReady(() => useServerStore.getState().refresh())
