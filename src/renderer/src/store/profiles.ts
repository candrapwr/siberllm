// Global UI state for target-machine profiles (Local + SSH remotes).

import { create } from 'zustand'
import { LOCAL_PROFILE_ID, type Profile, type ProfileTestResult, type SshProfileInput } from '@shared/types'
import { api } from '../lib/api'
import { useInstallStore } from './install'
import { useModelsStore } from './models'
import { useServerStore } from './server'

interface ProfilesStore {
  profiles: Profile[]
  selectedId: string
  loading: boolean
  /** Map of profileId -> last test result (transient). */
  testResults: Record<string, ProfileTestResult>
  testingId: string | null
  error: string | null

  load: () => Promise<void>
  select: (id: string) => Promise<void>
  create: (input: SshProfileInput) => Promise<boolean>
  update: (id: string, patch: Partial<SshProfileInput>) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  test: (id: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesStore>((set, get) => ({
  profiles: [],
  selectedId: LOCAL_PROFILE_ID,
  loading: false,
  testResults: {},
  testingId: null,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const { profiles, selectedId } = await api.profiles.list()
      set({ profiles, selectedId, loading: false })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  },

  select: async (id) => {
    const prev = get().selectedId
    // Optimistic update.
    set({ selectedId: id })
    try {
      await api.profiles.select(id)
    } catch (err) {
      // Rollback on failure.
      set({ selectedId: prev, error: err instanceof Error ? err.message : String(err) })
    }
  },

  create: async (input) => {
    set({ error: null })
    try {
      const profiles = await api.profiles.create(input)
      set({ profiles })
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  update: async (id, patch) => {
    set({ error: null })
    try {
      const profiles = await api.profiles.update(id, patch)
      set({ profiles })
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      const profiles = await api.profiles.remove(id)
      set({ profiles })
      // If we removed the selected profile, the main process falls back to
      // Local; sync that here.
      if (id === get().selectedId) {
        set({ selectedId: LOCAL_PROFILE_ID })
      }
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  test: async (id) => {
    set({ testingId: id, error: null })
    try {
      const result = await api.profiles.test(id)
      const testResults = { ...get().testResults, [id]: result }
      set({ testResults, testingId: null })
    } catch (err) {
      const testResults = {
        ...get().testResults,
        [id]: { ok: false, message: err instanceof Error ? err.message : String(err) } satisfies ProfileTestResult
      }
      set({ testResults, testingId: null })
    }
  }
}))

// When the active profile changes, wipe all per-target UI state so nothing from
// the previous machine lingers. This runs synchronously via Zustand subscribe
// (outside React's render cycle), so the reset happens before any page re-fetch.
// Each page then re-probes / re-scans for the new profile in its own effect.
useProfilesStore.subscribe((state, prev) => {
  if (state.selectedId !== prev.selectedId) {
    useInstallStore.getState().reset()
    useModelsStore.getState().reset()
    useServerStore.getState().reset()
  }
})
