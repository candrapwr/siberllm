// Check whether llama-server is already installed & runnable on a target.

import type { HostTarget } from './host/types'
import { type AsyncPathResolver } from './host/paths-resolver'
import { detectPlatform } from './backend-detect'
import type { InstallStatus } from '@shared/types'
import { getSettings, setSettings } from '../store'
import { localTarget } from './host/local-target'
import type { GpuBackend } from '@shared/platforms'

async function readVersion(target: HostTarget, binaryPath: string): Promise<string | null> {
  try {
    // llama-server supports --version; older builds print help. We tolerate both.
    const { stdout, stderr } = await target.exec(binaryPath, ['--version'], {
      windowsHide: true,
      timeoutMs: 8000
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
 * Inspect the install state on a target. Resolves the effective backend:
 * 1. user-overridden backend in settings (if not 'auto')
 * 2. otherwise detected platform (cached in settings)
 *
 * The settings cache is shared across targets today; for SSH targets the
 * detected platform describes the REMOTE machine. This is acceptable for the
 * current single-active-profile model.
 */
export async function checkInstall(
  target: HostTarget = localTarget,
  paths: AsyncPathResolver
): Promise<InstallStatus> {
  const binaryPath = await paths.serverBinary()
  const exists = await target.exists(binaryPath)

  // Resolve effective backend.
  let settings = await getSettings()
  let backend: GpuBackend | null

  if (settings.backend && settings.backend !== 'auto') {
    backend = settings.backend
  } else if (settings.platform) {
    backend = settings.platform.backend
  } else {
    const platform = await detectPlatform(target)
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

  const version = await readVersion(target, binaryPath)
  return {
    installed: true,
    version,
    backend,
    binaryPath,
    releaseTag: null // filled by download service after install
  }
}
