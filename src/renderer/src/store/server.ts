// Server lifecycle state for the renderer.

import { create } from 'zustand'
import type { ServerConfig, ServerLogLine, ServerState, Profile } from '@shared/types'
import { api } from '../lib/api'
import { DEFAULT_SETTINGS } from '@shared/types'
import { defaultBindHost } from '@shared/profiles'
import { useProfilesStore } from './profiles'

const MAX_LOG_LINES = 2000

/** The active profile id (falls back to 'local' if none selected). */
function activeProfileId(): string {
  return useProfilesStore.getState().selectedId || 'local'
}

interface ServerStore {
  state: ServerState | null
  logs: ServerLogLine[]
  config: ServerConfig
  /** True while we're contacting the target (e.g. SSH connect + probe). */
  loading: boolean
  /** True while a stop is in flight (kill can take a moment over SSH). */
  stopping: boolean
  setConfig: (patch: Partial<ServerConfig>) => void
  /** Adjust the config (bind host, reset model) when the active profile changes. */
  applyProfile: (profile: Profile) => void
  /** Clear all per-target state (called when the active profile changes). */
  reset: () => void
  start: () => Promise<void>
  stop: () => Promise<void>
  refresh: () => Promise<void>
  /** Probe whether a server is already running on the active target; adopt it. */
  probe: () => Promise<void>
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
  loading: false,
  stopping: false,

  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  applyProfile: (profile) =>
    // The bind host is target-dependent (Local=127.0.0.1, SSH=0.0.0.0). Reset
    // the selected model because models live on different machines.
    set((s) => ({
      config: {
        ...s.config,
        host: defaultBindHost(profile),
        modelPath: '',
        mmprojPath: undefined
      }
    })),

  reset: () =>
    // Wipe all per-target state when the active profile changes, so nothing
    // from the previous machine lingers (server status, logs, etc.).
    set({
      state: null,
      logs: [],
      loading: false,
      stopping: false
    }),

  start: async () => {
    set({ logs: [] })
    await api.server.start(activeProfileId(), get().config)
  },

  stop: async () => {
    set({ stopping: true })
    try {
      await api.server.stop()
    } finally {
      set({ stopping: false })
    }
  },

  refresh: async () => {
    const state = await api.server.status()
    set({ state })
  },

  probe: async () => {
    // Probe the active target for an already-running server. Clear stale logs
    // first so we don't mix profiles. Show a loading state until resolved
    // (SSH connect + health check can take a moment).
    set({ loading: true, logs: [] })
    try {
      const port = get().config.port
      const state = await api.server.probe(activeProfileId(), port)
      // If the probe recovered the running model, sync it into the UI config so
      // the model picker shows the active model instead of resetting.
      const recoveredModel = state.config?.modelPath
      if (recoveredModel) {
        set((s) => ({
          state,
          loading: false,
          config: { ...s.config, modelPath: recoveredModel }
        }))
      } else {
        set({ state, loading: false })
      }
    } catch (err) {
      set({ loading: false })
      throw err
    }
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
