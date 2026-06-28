// Persistent settings store backed by electron-store.
// electron-store v10 ships ESM + types, so we wrap it for safe dynamic import.

import { app } from 'electron'
import {
  DEFAULT_SETTINGS,
  LOCAL_PROFILE,
  LOCAL_PROFILE_ID,
  type AppSettings,
  type Profile,
  type SshProfile
} from '@shared/types'
import { obfuscatePassword, setCryptoSeed } from './services/crypto'

let storePromise: Promise<{
  get: () => AppSettings
  set: (patch: Partial<AppSettings>) => void
}> | null = null

async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      // Seed the obfuscation key from the userData path so secrets are not
      // portable across machines. Done before any profile write.
      try {
        setCryptoSeed(`siberllm:${app?.getPath?.('userData') ?? 'unknown'}`)
      } catch {
        /* app may be unavailable in non-electron contexts */
      }
      // electron-store is ESM-only and must be lazy-imported inside main.
      const Store = (await import('electron-store')).default
      const store = new Store<AppSettings>({
        name: 'config',
        defaults: { ...DEFAULT_SETTINGS }
      })
      // Ensure the Local profile always exists and is at index 0 (migration
      // safety for installs created before the profiles feature existed).
      const cur = store.store
      if (!Array.isArray(cur.profiles) || cur.profiles.length === 0) {
        store.set({ profiles: [LOCAL_PROFILE] })
      } else if (cur.profiles[0]?.id !== LOCAL_PROFILE_ID) {
        const rest = cur.profiles.filter((p) => p.id !== LOCAL_PROFILE_ID)
        store.set({ profiles: [LOCAL_PROFILE, ...rest] })
      }
      if (!cur.selectedProfileId) {
        store.set({ selectedProfileId: LOCAL_PROFILE_ID })
      }
      return {
        get: () => store.store,
        set: (patch: Partial<AppSettings>) => {
          store.set(patch)
        }
      }
    })()
  }
  return storePromise
}

export async function getSettings(): Promise<AppSettings> {
  const s = await getStore()
  return s.get()
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const s = await getStore()
  s.set(patch)
  return s.get()
}

// --------------------------- profile helpers ---------------------------

export async function getProfiles(): Promise<Profile[]> {
  const s = await getStore()
  return s.get().profiles
}

export async function getProfile(id: string): Promise<Profile | null> {
  const profiles = await getProfiles()
  return profiles.find((p) => p.id === id) ?? null
}

export async function getSelectedProfileId(): Promise<string> {
  const s = await getStore()
  return s.get().selectedProfileId ?? LOCAL_PROFILE_ID
}

export async function setSelectedProfileId(id: string): Promise<string> {
  const s = await getStore()
  s.set({ selectedProfileId: id })
  return id
}

/** Replace the entire profiles array. Local profile is always re-prepended. */
export async function setProfiles(next: Profile[]): Promise<Profile[]> {
  const s = await getStore()
  const withLocal = [LOCAL_PROFILE, ...next.filter((p) => p.id !== LOCAL_PROFILE_ID)]
  s.set({ profiles: withLocal })
  return withLocal
}

/** Add an SSH profile. Returns the updated list. */
export async function addProfile(profile: SshProfile): Promise<Profile[]> {
  const current = await getProfiles()
  if (current.some((p) => p.id === profile.id)) {
    throw new Error(`Profile id already exists: ${profile.id}`)
  }
  return setProfiles([...current, profile])
}

/** Update an SSH profile by id. Local profile cannot be updated via this. */
export async function updateProfile(id: string, patch: Partial<SshProfile>): Promise<Profile[]> {
  if (id === LOCAL_PROFILE_ID) {
    throw new Error('The Local profile cannot be edited.')
  }
  const current = await getProfiles()
  let touched = false
  const next = current.map((p) => {
    if (p.id === id && p.kind === 'ssh') {
      touched = true
      // Obfuscate a freshly-supplied plaintext password, if any.
      const merged: SshProfile = { ...(p as SshProfile), ...patch }
      if (patch.passwordEnc != null) {
        // Renderer sends plaintext in `passwordEnc` field for updates; obfuscate.
        merged.passwordEnc = obfuscatePassword(patch.passwordEnc)
      }
      return merged
    }
    return p
  })
  if (!touched) throw new Error(`SSH profile not found: ${id}`)
  return setProfiles(next)
}

/** Delete an SSH profile. Local profile cannot be deleted. */
export async function deleteProfile(id: string): Promise<Profile[]> {
  if (id === LOCAL_PROFILE_ID) {
    throw new Error('The Local profile cannot be deleted.')
  }
  const current = await getProfiles()
  const next = current.filter((p) => p.id !== id)
  // If the deleted profile was selected, fall back to Local.
  const s = await getStore()
  if (s.get().selectedProfileId === id) {
    s.set({ selectedProfileId: LOCAL_PROFILE_ID })
  }
  return setProfiles(next)
}
