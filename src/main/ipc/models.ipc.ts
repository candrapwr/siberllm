// IPC handlers for model management. The first argument of every model op is
// the active profile id, so operations target the right machine.

import { ipcMain, BrowserWindow, dialog } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { MODEL_CATALOG, type CatalogModel } from '@shared/constants'
import {
  scanLocalModels,
  deleteLocalModel,
  addModelFolder,
  importModelFiles,
  searchHuggingFace,
  listRepoFiles,
  downloadHfFile,
  cancelDownload,
  DownloadCancelledError
} from '../services/model-manager'
import { resolveHost } from './host-resolver'

export function registerModelsIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.MODELS_SCAN, async (_evt, profileId?: string) => {
    const { target, paths } = await resolveHost(profileId)
    return scanLocalModels(target, paths)
  })

  ipcMain.handle(IPC.MODELS_CATALOG, async (): Promise<CatalogModel[]> => MODEL_CATALOG)

  ipcMain.handle(IPC.MODELS_DELETE, async (_evt, profileId: string, path: string) => {
    const { target, paths } = await resolveHost(profileId)
    await deleteLocalModel(target, path)
    return scanLocalModels(target, paths)
  })

  ipcMain.handle(IPC.MODELS_ADD_FOLDER, async (_evt, profileId: string, folder: string) => {
    await addModelFolder(folder)
    const { target, paths } = await resolveHost(profileId)
    return scanLocalModels(target, paths)
  })

  // Native folder picker: returns the chosen folder or null if cancelled.
  ipcMain.handle(IPC.MODELS_PICK_FOLDER, async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Pilih folder model',
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Native file picker + import: copy chosen .gguf files into the models dir.
  ipcMain.handle(IPC.MODELS_IMPORT_FILES, async (_evt, profileId?: string) => {
    const win = getMainWindow()
    const { target, paths } = await resolveHost(profileId)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Pilih file model (.gguf)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Model GGUF', extensions: ['gguf'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, scan: await scanLocalModels(target, paths) }
    }
    await importModelFiles(target, paths, result.filePaths)
    return { imported: result.filePaths.length, scan: await scanLocalModels(target, paths) }
  })

  ipcMain.handle(IPC.MODELS_SEARCH_HF, async (_evt, query: string, limit?: number) =>
    searchHuggingFace(query, limit)
  )

  ipcMain.handle(
    IPC.MODELS_DOWNLOAD_START,
    async (_evt, profileId: string, repo: string, file: string) => {
      const win = getMainWindow()
      const { target, paths } = await resolveHost(profileId)
      try {
        await downloadHfFile(target, paths, repo, file, (p) => {
          win?.webContents.send(IPC.MODELS_DOWNLOAD_PROGRESS, p)
        })
        win?.webContents.send(IPC.MODELS_DOWNLOAD_DONE, { repo, file })
        return await scanLocalModels(target, paths)
      } catch (err) {
        // Cancellation is a deliberate user action — emit a distinct event so
        // the UI can show "cancelled" rather than a generic error.
        const cancelled =
          err instanceof DownloadCancelledError ||
          (err instanceof Error && err.name === 'AbortError')
        const message = cancelled
          ? 'Download dibatalkan.'
          : err instanceof Error
            ? err.message
            : String(err)
        win?.webContents.send(IPC.MODELS_DOWNLOAD_ERROR, {
          repo,
          file,
          message,
          cancelled
        })
        return await scanLocalModels(target, paths)
      }
    }
  )

  // Cancel an in-flight model download.
  ipcMain.handle(
    IPC.MODELS_CANCEL_DOWNLOAD,
    async (_evt, repo: string, file: string) => cancelDownload(repo, file)
  )

  // Helper: list gguf files for a repo (used by the custom-HF-repo flow).
  ipcMain.handle(IPC.MODELS_LIST_REPO, async (_evt, repo: string) =>
    listRepoFiles(repo)
  )
}
