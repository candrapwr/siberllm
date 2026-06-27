// Platform & GPU backend detection + llama.cpp release asset name mapping.
//
// Release asset naming (verified against ggml-org/llama.cpp release b9827+):
//   llama-<tag>-bin-macos-<arch>.tar.gz            (macOS, Metal, .tar.gz)
//   llama-<tag>-bin-win-cpu-x64.zip                (Windows CPU, .zip)
//   llama-<tag>-bin-win-cuda-12.4-x64.zip          (Windows CUDA)
//   llama-<tag>-bin-win-vulkan-x64.zip             (Windows Vulkan)
//   llama-<tag>-bin-ubuntu-x64.tar.gz              (Linux CPU — note: no "cpu" in name)
//   llama-<tag>-bin-ubuntu-vulkan-x64.tar.gz       (Linux Vulkan)
//   llama-<tag>-bin-ubuntu-rocm-7.2-x64.tar.gz     (Linux ROCm)
//   (No Linux CUDA prebuilt exists; we fall back to Vulkan.)

export type GpuBackend = 'metal' | 'cuda' | 'vulkan' | 'rocm' | 'cpu'
export type ArchiveType = 'zip' | 'tar.gz'

export interface PlatformInfo {
  os: 'macos' | 'windows' | 'linux'
  arch: 'arm64' | 'x64'
  backend: GpuBackend
}

export interface AssetSpec {
  /** Substring used to match the asset name (e.g. `bin-macos-arm64`). */
  keyword: string
  archiveType: ArchiveType
  gpu: boolean
  /** Tried if the primary asset isn't found. */
  fallback?: { keyword: string; archiveType: ArchiveType }
}

export function normalizePlatform(
  platform: NodeJS.Platform,
  arch: string,
  backend: GpuBackend
): PlatformInfo {
  const os =
    platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'
  const a = arch === 'arm64' ? 'arm64' : 'x64'
  return { os, arch: a, backend }
}

/** Map a platform+backend to the asset keyword + archive type. */
export function assetSpecFor(info: PlatformInfo): AssetSpec {
  const { os, arch, backend } = info

  if (os === 'macos') {
    return { keyword: `bin-macos-${arch}`, archiveType: 'tar.gz', gpu: true }
  }

  if (os === 'windows') {
    switch (backend) {
      case 'cuda':
        return { keyword: 'bin-win-cuda-12.4-x64', archiveType: 'zip', gpu: true }
      case 'vulkan':
        return { keyword: 'bin-win-vulkan-x64', archiveType: 'zip', gpu: true }
      case 'rocm':
        return { keyword: 'bin-win-hip-radeon-x64', archiveType: 'zip', gpu: true }
      case 'cpu':
      default:
        return { keyword: 'bin-win-cpu-x64', archiveType: 'zip', gpu: false }
    }
  }

  // Linux (keyword is "ubuntu", archives are .tar.gz)
  switch (backend) {
    case 'cuda':
      // No official Linux CUDA prebuilt — Vulkan works on NVIDIA, else CPU.
      return {
        keyword: 'bin-ubuntu-vulkan-x64',
        archiveType: 'tar.gz',
        gpu: true,
        fallback: { keyword: 'bin-ubuntu-x64', archiveType: 'tar.gz' }
      }
    case 'vulkan':
      return { keyword: 'bin-ubuntu-vulkan-x64', archiveType: 'tar.gz', gpu: true }
    case 'rocm':
      // match the rocm tag regardless of version (currently 7.2)
      return { keyword: 'bin-ubuntu-rocm', archiveType: 'tar.gz', gpu: true }
    case 'cpu':
    default:
      // Linux CPU asset has no "cpu" token: bin-ubuntu-x64 / bin-ubuntu-arm64
      return { keyword: `bin-ubuntu-${arch}`, archiveType: 'tar.gz', gpu: false }
  }
}

/** Find the matching asset name from a list of release asset names.
 *  Companion assets (cudart-*) are excluded so CUDA doesn't match the cudart zip. */
export function pickAsset(
  assetNames: string[],
  keyword: string,
  archiveType: ArchiveType
): string | null {
  const ext = archiveType === 'zip' ? '.zip' : '.tar.gz'
  return (
    assetNames.find(
      (n) =>
        n.endsWith(ext) &&
        n.includes(keyword) &&
        !n.startsWith('cudart-') // exclude the companion cudart package
    ) ?? null
  )
}

/** Some Windows CUDA builds ship a separate cudart companion zip. */
export function companionKeywordFor(info: PlatformInfo): string | null {
  if (info.os === 'windows' && info.backend === 'cuda') {
    return 'cudart-llama-bin-win-cuda-12.4-x64'
  }
  return null
}
