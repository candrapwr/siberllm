// IPC handlers for shell actions (open URL, open folder in file manager).

import { ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/ipc-channels'
import { paths } from '../services/paths'

export function registerShellIpc(): void {
  ipcMain.handle(IPC.OPEN_EXTERNAL, async (_evt, url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        await shell.openExternal(u.toString())
        return true
      }
    } catch {
      /* invalid url */
    }
    return false
  })

  // Resolve well-known folders and reveal them in the OS file manager.
  ipcMain.handle(IPC.OPEN_PATH, async (_evt, which: 'bin' | 'models' | 'logs' | 'root') => {
    const dir =
      which === 'bin'
        ? paths.bin()
        : which === 'models'
          ? paths.models()
          : which === 'logs'
            ? paths.logs()
            : paths.root()
    // ensure the folder exists so Finder/Explorer doesn't error
    await paths.ensure()
    if (!existsSync(dir)) return false
    await shell.openPath(dir)
    return true
  })
}
