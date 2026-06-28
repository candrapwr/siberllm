// IPC handlers for llama.cpp install lifecycle.

import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { checkInstall } from '../services/llama-detect'
import { installLlamaCpp } from '../services/llama-download'
import { detectPlatform } from '../services/backend-detect'
import { normalizePlatform, type GpuBackend } from '@shared/platforms'
import { setSettings } from '../store'
import { resolveHost } from './host-resolver'

export function registerInstallIpc(getMainWindow: () => BrowserWindow | null): void {
  // Status check (used by Setup page on load). First arg is the profile id.
  ipcMain.handle(IPC.INSTALL_CHECK, async (_evt, profileId?: string) => {
    const { target, paths } = await resolveHost(profileId)
    return checkInstall(target, paths)
  })

  // Begin install. Accepts an explicit backend override and a profile id.
  ipcMain.handle(
    IPC.INSTALL_START,
    async (_evt, backendOverride?: GpuBackend | 'auto', profileId?: string) => {
      const win = getMainWindow()
      const { target, paths } = await resolveHost(profileId)

      // Resolve the platform to install for (detected ON the target).
      let platform
      if (backendOverride && backendOverride !== 'auto') {
        const tp = await target.platform()
        platform = normalizePlatform(
          tp.os === 'darwin' ? 'darwin' : tp.os === 'win32' ? 'win32' : 'linux',
          tp.arch as 'arm64' | 'x64',
          backendOverride as GpuBackend
        )
        await setSettings({ backend: backendOverride, platform })
      } else {
        platform = await detectPlatform(target)
        await setSettings({ backend: 'auto', platform })
      }

      try {
        await installLlamaCpp({
          target,
          paths,
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
