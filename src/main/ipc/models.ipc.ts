// IPC handlers for model management.

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

export function registerModelsIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.MODELS_SCAN, async () => scanLocalModels())

  ipcMain.handle(IPC.MODELS_CATALOG, async (): Promise<CatalogModel[]> => MODEL_CATALOG)

  ipcMain.handle(IPC.MODELS_DELETE, async (_evt, path: string) => {
    await deleteLocalModel(path)
    return scanLocalModels()
  })

  ipcMain.handle(IPC.MODELS_ADD_FOLDER, async (_evt, folder: string) => {
    await addModelFolder(folder)
    return scanLocalModels()
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
  ipcMain.handle(IPC.MODELS_IMPORT_FILES, async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Pilih file model (.gguf)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Model GGUF', extensions: ['gguf'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { imported: 0, scan: await scanLocalModels() }
    }
    await importModelFiles(result.filePaths)
    return { imported: result.filePaths.length, scan: await scanLocalModels() }
  })

  ipcMain.handle(IPC.MODELS_SEARCH_HF, async (_evt, query: string, limit?: number) =>
    searchHuggingFace(query, limit)
  )

  ipcMain.handle(IPC.MODELS_DOWNLOAD_START, async (_evt, repo: string, file: string) => {
    const win = getMainWindow()
    try {
      await downloadHfFile(repo, file, (p) => {
        win?.webContents.send(IPC.MODELS_DOWNLOAD_PROGRESS, p)
      })
      win?.webContents.send(IPC.MODELS_DOWNLOAD_DONE, { repo, file })
      return await scanLocalModels()
    } catch (err) {
      // Cancellation is a deliberate user action — emit a distinct event so
      // the UI can show "cancelled" rather than a generic error. Both cancel
      // and normal errors are swallowed here (reported via event, not thrown)
      // so the main-process console doesn't fill with noisy stack traces.
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
      // Resolve normally — the UI updates its state from the error event.
      return await scanLocalModels()
    }
  })

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
