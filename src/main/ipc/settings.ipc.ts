// IPC handlers for settings.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getSettings, setSettings } from '../store'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, async () => getSettings())
  ipcMain.handle(IPC.SETTINGS_SET, async (_evt, patch) => setSettings(patch))
}
