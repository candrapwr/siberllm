// Resolve app data directories under Electron's userData path.
// Centralised so every service agrees on where binaries / models / logs live.

import { app } from 'electron'
import { join } from 'node:path'

const ROOT_NAME = 'siberllm'

function root(): string {
  // app may be undefined when imported by the future CLI; guard for that.
  const base = app?.getPath?.('userData') ?? process.cwd()
  return join(base, ROOT_NAME)
}

export const paths = {
  root,
  bin: () => join(root(), 'bin'),
  models: () => join(root(), 'models'),
  logs: () => join(root(), 'logs'),
  configFile: () => join(root(), 'config.json'),
  logFile: () => join(root(), 'logs', 'server.log'),
  downloadCache: () => join(root(), 'downloads'),

  /** The llama-server executable path for the current OS. */
  serverBinary: () => {
    const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    return join(paths.bin(), exe)
  },

  /** Ensure all data directories exist. */
  ensure: async (): Promise<void> => {
    const fs = await import('node:fs/promises')
    for (const p of [paths.bin(), paths.models(), paths.logs(), paths.downloadCache()]) {
      await fs.mkdir(p, { recursive: true })
    }
  }
}
