// Detect the best available GPU backend for a target machine.
//
// All probes run ON the target (via HostTarget.exec / .exists), so this works
// identically for the local machine and for an SSH remote.

import { normalizePlatform, type GpuBackend, type PlatformInfo } from '@shared/platforms'
import type { HostTarget } from './host/types'
import { localTarget } from './host/local-target'

/** Map a HostTarget platform tuple to the node-style platform id. */
function nodeOsFrom(o: NodeJS.Platform | 'linux' | 'darwin' | 'win32'): NodeJS.Platform {
  if (o === 'darwin') return 'darwin'
  if (o === 'win32') return 'win32'
  return 'linux'
}

async function commandExists(target: HostTarget, cmd: string): Promise<boolean> {
  try {
    const plat = await target.platform()
    if (plat.os === 'win32') {
      const r = await target.exec('where', [cmd], { windowsHide: true })
      return r.code === 0 || r.stdout.trim().length > 0
    }
    const r = await target.exec('which', [cmd])
    return r.code === 0 || r.stdout.trim().length > 0
  } catch {
    return false
  }
}

async function hasNvidia(target: HostTarget): Promise<boolean> {
  if (await commandExists(target, 'nvidia-smi')) return true
  const plat = await target.platform()
  if (plat.os === 'linux' && (await target.exists('/dev/nvidia0'))) return true
  return false
}

async function hasAmd(target: HostTarget): Promise<boolean> {
  const plat = await target.platform()
  if (plat.os === 'linux') {
    return (await target.exists('/dev/kfd')) || (await target.exists('/dev/dri/renderD128'))
  }
  // windows: amd-adl detection is brittle; we treat as vulkan candidate
  return false
}

/** Detect the recommended backend. macOS always uses Metal. */
export async function detectBackend(target: HostTarget = localTarget): Promise<GpuBackend> {
  const plat = await target.platform()
  if (plat.os === 'darwin') return 'metal'

  if (await hasNvidia(target)) return 'cuda'
  if (await hasAmd(target)) return 'vulkan' // safer than rocm for prebuilt availability

  // fall back: try vulkan via generic GPU, else cpu
  return 'cpu'
}

/** Build the full PlatformInfo using detected backend. */
export async function detectPlatform(target: HostTarget = localTarget): Promise<PlatformInfo> {
  const plat = await target.platform()
  const backend = await detectBackend(target)
  return normalizePlatform(nodeOsFrom(plat.os), plat.arch as 'arm64' | 'x64', backend)
}
