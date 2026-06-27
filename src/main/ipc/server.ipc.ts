// IPC handlers for the llama-server lifecycle.

import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { serverManager } from '../services/server-manager'
import type { ServerConfig, ServerLogLine, ServerState } from '@shared/types'

export function registerServerIpc(getMainWindow: () => BrowserWindow | null): void {
  const win = () => getMainWindow()

  // Wire manager events -> renderer.
  serverManager.setHandlers(
    (line: ServerLogLine) => win()?.webContents.send(IPC.SERVER_LOG, line),
    (state: ServerState) => {
      win()?.webContents.send(IPC.SERVER_STATUS, state)
      if (state.status === 'running' && state.url) {
        win()?.webContents.send(IPC.SERVER_READY, { url: state.url })
      } else if (state.status === 'error') {
        win()?.webContents.send(IPC.SERVER_ERROR, { message: 'Server error' })
      }
    }
  )

  ipcMain.handle(IPC.SERVER_START, async (_evt, config: ServerConfig) => {
    await serverManager.start(config)
    return serverManager.getState()
  })

  ipcMain.handle(IPC.SERVER_STOP, async () => {
    await serverManager.stop()
    return serverManager.getState()
  })

  ipcMain.handle(IPC.SERVER_STATUS, async () => serverManager.getState())
}
