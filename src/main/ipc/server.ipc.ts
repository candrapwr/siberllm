// IPC handlers for the llama-server lifecycle.

import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { serverManager } from '../services/server-manager'
import type { ServerConfig, ServerLogLine, ServerState } from '@shared/types'
import { resolveHost } from './host-resolver'

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

  ipcMain.handle(IPC.SERVER_START, async (_evt, profileId: string, config: ServerConfig) => {
    const { target, paths, profile } = await resolveHost(profileId)
    serverManager.configure(target, paths, profile)
    await serverManager.start(config)
    return serverManager.getState()
  })

  ipcMain.handle(IPC.SERVER_STOP, async () => {
    await serverManager.stop()
    return serverManager.getState()
  })

  ipcMain.handle(IPC.SERVER_STATUS, async () => serverManager.getState())

  // Probe whether a server is already running on the target at a port; if so,
  // adopt it (status=running, tail its log). Used on app load / profile switch.
  ipcMain.handle(
    IPC.SERVER_PROBE,
    async (_evt, profileId: string, port: number) => {
      const { target, paths, profile } = await resolveHost(profileId)
      serverManager.configure(target, paths, profile)
      return serverManager.probeStatus(port)
    }
  )
}
