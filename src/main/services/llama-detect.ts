// Check whether llama-server is already installed & runnable.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { paths } from './paths'
import { detectPlatform } from './backend-detect'
import type { InstallStatus } from '@shared/types'
import { getSettings, setSettings } from '../store'
import type { GpuBackend } from '@shared/platforms'

const pexecFile = promisify(execFile)

async function readVersion(binaryPath: string): Promise<string | null> {
  try {
    // llama-server supports --version; older builds print help. We tolerate both.
    const { stdout, stderr } = await pexecFile(binaryPath, ['--version'], {
      windowsHide: true,
      timeout: 8000
    })
    const out = (stdout || stderr || '').trim()
    // grab first line that looks like a version
    const m = out.match(/version\s+([0-9][^\s]*)/i) ?? out.match(/\b(b\d+)\b/i)
    return m ? m[1] : out.split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

/**
 * Inspect the install state. Resolves the effective backend:
 * 1. user-overridden backend in settings (if not 'auto')
 * 2. otherwise detected platform (cached in settings)
 */
export async function checkInstall(): Promise<InstallStatus> {
  const binaryPath = paths.serverBinary()
  const exists = existsSync(binaryPath)

  // Resolve effective backend.
  let settings = await getSettings()
  let backend: GpuBackend | null

  if (settings.backend && settings.backend !== 'auto') {
    backend = settings.backend
  } else if (settings.platform) {
    backend = settings.platform.backend
  } else {
    const platform = await detectPlatform()
    settings = await setSettings({ platform })
    backend = platform.backend
  }

  if (!exists) {
    return {
      installed: false,
      version: null,
      backend,
      binaryPath: null,
      releaseTag: null
    }
  }

  const version = await readVersion(binaryPath)
  return {
    installed: true,
    version,
    backend,
    binaryPath,
    releaseTag: null // filled by download service after install
  }
}
