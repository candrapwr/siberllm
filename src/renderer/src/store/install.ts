// Global UI state for the install/setup flow.

import { create } from 'zustand'
import type { InstallProgress, InstallStatus } from '@shared/types'
import { api } from '../lib/api'
import { useProfilesStore } from './profiles'

interface InstallStore {
  status: InstallStatus | null
  loading: boolean
  progress: InstallProgress | null
  error: string | null
  refresh: () => Promise<void>
  start: (backend?: 'auto' | 'metal' | 'cuda' | 'vulkan' | 'rocm' | 'cpu') => Promise<void>
  /** Clear all per-target state (called when the active profile changes). */
  reset: () => void
}

/** The active profile id (falls back to 'local' if none selected). */
function activeProfileId(): string {
  return useProfilesStore.getState().selectedId || 'local'
}

export const useInstallStore = create<InstallStore>((set) => ({
  status: null,
  loading: false,
  progress: null,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const status = await api.install.check(activeProfileId())
      set({ status, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  start: async (backend) => {
    set({ loading: true, error: null, progress: null })
    try {
      await api.install.start(backend, activeProfileId())
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  reset: () =>
    // Wipe install state from the previous profile so the new profile's status
    // is fetched fresh.
    set({ status: null, loading: false, progress: null, error: null })
}))

// Subscribe once to progress/done/error events at module load.
api.install.onProgress((p) =>
  useInstallStore.setState({ progress: p, loading: p.stage !== 'done' && p.stage !== 'error' })
)
api.install.onDone(async (p) => {
  useInstallStore.setState({ progress: p, loading: false })
  await useInstallStore.getState().refresh()
})
api.install.onError((p) =>
  useInstallStore.setState({ error: p.message, loading: false })
)
