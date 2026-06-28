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
  cancel: (repo: string, file: string) => Promise<void>
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

  cancel: async (repo, file) => {
    try {
      await api.models.cancelDownload(repo, file)
    } catch {
      /* ignore — the progress/error event will update state */
    }
    // optimistically mark as cancelled so the UI updates instantly
    set((s) => {
      const cur = s.downloading[key(repo, file)]
      if (!cur || cur.state === 'downloading') {
        return {
          downloading: {
            ...s.downloading,
            [key(repo, file)]: { ...cur, state: 'cancelled' as const, percent: cur?.percent ?? 0 }
          }
        }
      }
      return {}
    })
    // clear after a short delay
    setTimeout(() => {
      set((s) => {
        const next = { ...s.downloading }
        delete next[key(repo, file)]
        return { downloading: next }
      })
    }, 2000)
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
      // Only mark "done" if the download wasn't cancelled mid-flight.
      // The cancel action sets state='cancelled'; if we overwrite that with
      // 'done' here, the UI would falsely show "100% success".
      const k = key(repo, file)
      const current = get().downloading[k]
      if (current && current.state === 'cancelled') {
        set({ scan })
        return
      }
      set((s) => ({
        scan,
        downloading: {
          ...s.downloading,
          [k]: {
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
api.models.onDownloadError(({ repo, file, cancelled }) => {
  if (cancelled) {
    // cancellation is handled by the `cancel` action; just refresh the list.
    useModelsStore.getState().refresh()
    return
  }
  useModelsStore.setState((s) => ({
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
    }
  }))
  setTimeout(() => {
    useModelsStore.setState((s) => {
      const next = { ...s.downloading }
      delete next[key(repo, file)]
      return { downloading: next }
    })
  }, 4000)
})
