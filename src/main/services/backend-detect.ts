// Detect the best available GPU backend for the host machine.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { normalizePlatform, type GpuBackend, type PlatformInfo } from '@shared/platforms'

const pexecFile = promisify(execFile)

async function commandExists(cmd: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      await pexecFile('where', [cmd], { windowsHide: true })
    } else {
      await pexecFile('which', [cmd])
    }
    return true
  } catch {
    return false
  }
}

async function hasNvidia(): Promise<boolean> {
  // nvidia-smi presence is a reliable CUDA-available signal on win/linux.
  if (await commandExists('nvidia-smi')) return true
  if (process.platform === 'linux' && existsSync('/dev/nvidia0')) return true
  return false
}

async function hasAmd(): Promise<boolean> {
  if (process.platform === 'linux') {
    return existsSync('/dev/kfd') || existsSync('/dev/dri/renderD128')
  }
  // windows: amd-adl detection is brittle; we treat as vulkan candidate
  return false
}

/** Detect the recommended backend. macOS always uses Metal. */
export async function detectBackend(): Promise<GpuBackend> {
  if (process.platform === 'darwin') return 'metal'

  if (await hasNvidia()) return 'cuda'
  if (await hasAmd()) return 'vulkan' // safer than rocm for prebuilt availability

  // fall back: try vulkan via generic GPU, else cpu
  return 'cpu'
}

/** Build the full PlatformInfo using detected backend. */
export async function detectPlatform(): Promise<PlatformInfo> {
  const backend = await detectBackend()
  return normalizePlatform(process.platform, process.arch, backend)
}
