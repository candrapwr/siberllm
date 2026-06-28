// Models scan + download state.

import { create } from 'zustand'
import type { ModelDownloadProgress, ScanResult } from '@shared/types'
import type { CatalogModel } from '@shared/constants'
import { api } from '../lib/api'

interface DownloadingMap {
  [key: string]: ModelDownloadProgress // key = `${repo}/${file}`
}

interface ModelsStore {
  scan: ScanResult | null
  catalog: CatalogModel[]
  searching: boolean
  searchResults: Array<{ id: string; downloads: number; likes: number }>
  downloading: DownloadingMap
  error: string | null
  refresh: () => Promise<void>
  loadCatalog: () => Promise<void>
  search: (q: string) => Promise<void>
  download: (repo: string, file: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

const key = (repo: string, file: string) => `${repo}/${file}`

export const useModelsStore = create<ModelsStore>((set, get) => ({
  scan: null,
  catalog: [],
  searching: false,
  searchResults: [],
  downloading: {},
  error: null,

  refresh: async () => {
    const scan = await api.models.scan()
    set({ scan })
  },

  loadCatalog: async () => {
    if (get().catalog.length) return
    const catalog = await api.models.catalog()
    set({ catalog })
  },

  search: async (q) => {
    set({ searching: true, error: null })
    try {
      const res = await api.models.searchHf(q, 25)
      set({ searchResults: res, searching: false })
    } catch (err) {
      set({
        searching: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  },

  download: async (repo, file) => {
    set({ error: null })
    // mark as downloading immediately so the UI shows a spinner before the
    // first progress event arrives.
    set((s) => ({
      downloading: {
        ...s.downloading,
        [key(repo, file)]: {
          repo,
          file,
          percent: 0,
          bytesLoaded: 0,
          bytesTotal: 0,
          bytesPerSec: 0,
          state: 'downloading'
        }
      }
    }))
    try {
      const scan = await api.models.download(repo, file)
      // keep the "done" state visible briefly so the user sees 100%, then clear.
      set((s) => ({
        scan,
        downloading: {
          ...s.downloading,
          [key(repo, file)]: {
            repo,
            file,
            percent: 100,
            bytesLoaded: 0,
            bytesTotal: 0,
            bytesPerSec: 0,
            state: 'done'
          }
        }
      }))
      setTimeout(() => {
        set((s) => {
          const next = { ...s.downloading }
          delete next[key(repo, file)]
          return { downloading: next }
        })
      }, 2500)
    } catch (err) {
      set((s) => ({
        downloading: {
          ...s.downloading,
          [key(repo, file)]: {
            repo,
            file,
            percent: 0,
            bytesLoaded: 0,
            bytesTotal: 0,
            bytesPerSec: 0,
            state: 'error'
          }
        },
        error: err instanceof Error ? err.message : String(err)
      }))
    }
  },

  remove: async (path) => {
    const scan = await api.models.delete(path)
    set({ scan })
  }
}))

api.models.onDownloadProgress((p) =>
  useModelsStore.setState((s) => ({
    downloading: { ...s.downloading, [key(p.repo, p.file)]: p }
  }))
)
api.models.onDownloadDone(() => useModelsStore.getState().refresh())
