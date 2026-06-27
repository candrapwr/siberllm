// Persistent settings store backed by electron-store.
// electron-store v10 ships ESM + types, so we wrap it for safe dynamic import.

import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

let storePromise: Promise<{
  get: () => AppSettings
  set: (patch: Partial<AppSettings>) => void
}> | null = null

async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      // electron-store is ESM-only and must be lazy-imported inside main.
      const Store = (await import('electron-store')).default
      const store = new Store<AppSettings>({
        name: 'config',
        defaults: { ...DEFAULT_SETTINGS }
      })
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
