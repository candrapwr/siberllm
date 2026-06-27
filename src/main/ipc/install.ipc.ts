// IPC handlers for llama.cpp install lifecycle.

import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { checkInstall } from '../services/llama-detect'
import { installLlamaCpp } from '../services/llama-download'
import { detectPlatform } from '../services/backend-detect'
import { normalizePlatform, type GpuBackend } from '@shared/platforms'
import { setSettings } from '../store'

export function registerInstallIpc(getMainWindow: () => BrowserWindow | null): void {
  // Status check (used by Setup page on load).
  ipcMain.handle(IPC.INSTALL_CHECK, async () => {
    return checkInstall()
  })

  // Begin install. Optionally accepts an explicit backend override.
  ipcMain.handle(
    IPC.INSTALL_START,
    async (_evt, backendOverride?: GpuBackend | 'auto') => {
      const win = getMainWindow()

      // Resolve the platform to install for.
      let platform
      if (backendOverride && backendOverride !== 'auto') {
        platform = normalizePlatform(
          process.platform,
          process.arch,
          backendOverride as GpuBackend
        )
        await setSettings({ backend: backendOverride, platform })
      } else {
        platform = await detectPlatform()
        await setSettings({ backend: 'auto', platform })
      }

      try {
        await installLlamaCpp({
          platform,
          onProgress: (p) => {
            win?.webContents.send(IPC.INSTALL_PROGRESS, p)
            if (p.stage === 'done') {
              win?.webContents.send(IPC.INSTALL_DONE, p)
            }
          }
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        win?.webContents.send(IPC.INSTALL_ERROR, { message })
        throw err
      }
    }
  )
}
