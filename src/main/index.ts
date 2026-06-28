// SiberLLM — Electron main process entry.

import { app, BrowserWindow, shell, session, ipcMain } from 'electron'
import { join } from 'node:path'
import { paths } from './services/paths'
import { registerInstallIpc } from './ipc/install.ipc'
import { registerModelsIpc } from './ipc/models.ipc'
import { registerServerIpc } from './ipc/server.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerShellIpc } from './ipc/shell.ipc'
import { registerProfilesIpc } from './ipc/profiles.ipc'
import { disposeAllSshTargets } from './ipc/host-resolver'

let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Apply a Content-Security-Policy. In dev we must allow Vite's inline
 * react-refresh scripts and the dev-server origin; in production we lock
 * down to 'self' + localhost connections only.
 */
function configureCsp(): void {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  const devSrc = process.env['ELECTRON_RENDERER_URL'] ?? ''
  const devHost = (() => {
    try {
      return new URL(devSrc).host // e.g. localhost:5173
    } catch {
      return ''
    }
  })()

  const csp = isDev
    ? [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' ${devSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src 'self' http://127.0.0.1:* http://localhost:* ${devSrc} ws://${devHost}`,
        `font-src 'self' ${devSrc}`
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        'connect-src \'self\' http://127.0.0.1:* http://localhost:*'
      ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

async function createWindow(): Promise<BrowserWindow> {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'SiberLLM',
    backgroundColor: '#0b0f17',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.on('did-finish-load', () =>
    console.log('[siberllm] renderer loaded')
  )
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[siberllm] renderer failed to load', code, desc, url)
  )

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser, never in-app.
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite serves renderer from dev server or loads the built file.
  if (process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerIpc(): void {
  // Synchronous version read for the renderer (used by preload at load time).
  ipcMain.on('app:version', (event: Electron.IpcMainEvent) => {
    event.returnValue = app.getVersion()
  })
  registerSettingsIpc()
  registerShellIpc()
  registerInstallIpc(getMainWindow)
  registerModelsIpc(getMainWindow)
  registerServerIpc(getMainWindow)
  registerProfilesIpc()
}

app.whenReady().then(async () => {
  await paths.ensure()
  configureCsp()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Close any cached SSH connections before the app exits.
app.on('before-quit', () => {
  void disposeAllSshTargets()
})
