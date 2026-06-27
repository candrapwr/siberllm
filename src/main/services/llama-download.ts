// Download & install the llama-server prebuilt binary from ggml-org/llama.cpp releases.
// Emits progress through a callback so the IPC layer can forward to the renderer.

import { createWriteStream, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  GITHUB_API,
  LLAMA_CPP_REPO,
  assertApiHost,
  assertDownloadHost
} from '@shared/constants'
import {
  assetSpecFor,
  companionKeywordFor,
  pickAsset,
  type PlatformInfo,
  type ArchiveType
} from '@shared/platforms'
import { paths } from './paths'
import type { InstallProgress } from '@shared/types'
import { setSettings } from '../store'

export interface GitHubAsset {
  name: string
  /** Public download URL (the `browser_download_url` field from the API).
   *  Note: the `url` field points to an api.github.com resource that needs
   *  auth headers — we must NOT use that one for downloads. */
  browser_download_url: string
  size: number
}
interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}

type ProgressCb = (p: InstallProgress) => void

async function fetchLatestRelease(): Promise<GitHubRelease> {
  const url = `${GITHUB_API}/repos/${LLAMA_CPP_REPO}/releases/latest`
  assertApiHost(url)
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub releases request failed: ${res.status}`)
  return (await res.json()) as GitHubRelease
}

/** Download a single asset with byte-level progress + size verification. */
async function downloadAsset(
  asset: GitHubAsset,
  destFile: string,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  // browser_download_url is github.com/.../releases/download/...; GitHub
  // 302-redirects to objects.githubusercontent.com. Validate the original host
  // here; redirect:'follow' lets fetch move to the CDN (also whitelisted).
  assertDownloadHost(asset.browser_download_url)

  const res = await fetch(asset.browser_download_url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed for ${asset.name}: ${res.status}`)
  }

  const total =
    Number(res.headers.get('content-length') || 0) || asset.size || 0

  // Read the web stream manually with a Reader — avoids the stream race that
  // happens when a 'data' listener and pipeline() both consume the same stream.
  const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader()
  const out = createWriteStream(destFile)
  let loaded = 0
  let lastEmit = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      // writeAsync via a promise wrapper to get backpressure + error surfacing
      await new Promise<void>((resolve, reject) => {
        out.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()))
      })
      loaded += value.byteLength
      const now = Date.now()
      if (now - lastEmit > 100 || loaded === total) {
        lastEmit = now
        onProgress(loaded, total)
      }
    }
  }

  // flush & close
  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve())
    out.on('error', reject)
  })

  // Size integrity check — guard against truncated downloads.
  if (total > 0 && loaded !== total) {
    throw new Error(
      `Download ${asset.name} tidak lengkap: ${loaded}/${total} byte ` +
        `(${Math.round((loaded / total) * 100)}%). Coba lagi.`
    )
  }
  onProgress(loaded, total)
}

/** Extract an archive (.zip or .tar.gz) into a destination dir.
 *  Captures stderr so failures include the underlying tool's message. */
async function extractArchive(
  archivePath: string,
  destDir: string,
  archiveType: ArchiveType
): Promise<void> {
  await fsp.mkdir(destDir, { recursive: true })

  const run = (cmd: string, args: string[]): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      p.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      // also drain stdout so the pipe can't fill up & hang
      p.stdout?.on('data', () => {})
      p.on('error', reject)
      p.on('exit', (code) => {
        if (code === 0) resolve()
        else {
          const detail = stderr.trim()
          reject(
            new Error(
              `${cmd} exited ${code}${detail ? `: ${detail}` : ''}`
            )
          )
        }
      })
    })

  if (archiveType === 'tar.gz') {
    // tar is available on macOS/Linux (bsdtar/gnu tar). Windows 10+ bundles it too.
    await run('tar', ['-xzf', archivePath, '-C', destDir])
    return
  }

  // .zip
  if (process.platform !== 'win32') {
    await run('unzip', ['-o', archivePath, '-d', destDir])
    return
  }
  // Windows: PowerShell Expand-Archive.
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`
  ])
}

async function chmodPlusx(file: string): Promise<void> {
  if (process.platform === 'win32') return
  try {
    await fsp.chmod(file, 0o755)
  } catch {
    /* ignore */
  }
}

/** Make all binaries in bin/ executable (unix). */
async function makeBinExecutable(dir: string): Promise<void> {
  if (process.platform === 'win32') return
  let entries: string[] = []
  try {
    entries = await fsp.readdir(dir)
  } catch {
    return
  }
  await Promise.all(
    entries
      .filter((n) => !n.endsWith('.dylib') && !n.endsWith('.so') && !n.includes('.'))
      .map((n) => chmodPlusx(join(dir, n)).catch(() => {}))
  )
}

/**
 * Some archives (macOS/Linux tarballs) wrap their contents in a single
 * top-level folder like `llama-b9827/`. If extraction produced exactly one
 * sub-directory and no loose files, move its contents up one level so
 * `llama-server` lands directly in bin/.
 */
async function flattenIfSingleSubdir(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  const files = entries.filter((e) => e.isFile())
  const dirs = entries.filter((e) => e.isDirectory())

  // Only flatten when there are no loose files and exactly one sub-folder.
  if (files.length > 0 || dirs.length !== 1) return

  const sub = join(dir, dirs[0].name)
  let subEntries: import('node:fs').Dirent[]
  try {
    subEntries = await fsp.readdir(sub, { withFileTypes: true })
  } catch {
    return
  }

  // Move every entry from the sub-folder up into dir/.
  for (const e of subEntries) {
    const from = join(sub, e.name)
    const to = join(dir, e.name)
    await fsp.rename(from, to).catch(() => {})
  }
  // Remove the now-empty wrapper folder.
  await fsp.rm(sub, { recursive: true, force: true }).catch(() => {})
}

export interface InstallOptions {
  platform: PlatformInfo
  onProgress?: ProgressCb
}

/**
 * Orchestrates the full install flow:
 *   detect -> fetch release -> download (main + companion) -> extract -> finalize.
 */
export async function installLlamaCpp({ platform, onProgress }: InstallOptions): Promise<void> {
  const emit = (p: InstallProgress) => onProgress?.(p)

  emit({ stage: 'fetching-release', percent: 1, message: 'Memeriksa rilis terbaru llama.cpp…' })
  const release = await fetchLatestRelease()
  const assetNames = release.assets.map((a) => a.name)

  const spec = assetSpecFor(platform)
  let mainAssetName = pickAsset(assetNames, spec.keyword, spec.archiveType)
  let archiveType = spec.archiveType
  if (!mainAssetName && spec.fallback) {
    // try fallback keyword / archive type
    mainAssetName = pickAsset(assetNames, spec.fallback.keyword, spec.fallback.archiveType)
    archiveType = spec.fallback.archiveType
  }
  if (!mainAssetName) {
    throw new Error(
      `Tidak menemukan binary untuk "${spec.keyword}" di release ${release.tag_name}. ` +
        `Asset tersedia: ${assetNames.join(', ')}`
    )
  }
  const mainAsset = release.assets.find((a) => a.name === mainAssetName)!

  // Optional companion (e.g. cudart for win-cuda) — always a zip.
  const companionKeyword = companionKeywordFor(platform)
  const companionAsset = companionKeyword
    ? release.assets.find((a) => a.name.includes(companionKeyword) && a.name.endsWith('.zip'))
    : undefined

  await paths.ensure()
  const cacheDir = paths.downloadCache()
  const mainZip = join(cacheDir, mainAsset.name)

  // ---- download main asset (0% -> 70%) ----
  emit({
    stage: 'downloading',
    percent: 2,
    message: `Mengunduh ${mainAsset.name}…`,
    assetName: mainAsset.name
  })
  const dlStart = Date.now()
  await downloadAsset(mainAsset, mainZip, (loaded, total) => {
    const ratio = total > 0 ? loaded / total : 0
    const elapsed = (Date.now() - dlStart) / 1000
    const bps = elapsed > 0 ? loaded / elapsed : 0
    emit({
      stage: 'downloading',
      percent: 2 + ratio * 68,
      bytesLoaded: loaded,
      bytesTotal: total,
      bytesPerSec: bps,
      message: `Mengunduh ${mainAsset.name}…`,
      assetName: mainAsset.name
    })
  })

  // ---- optional companion download (70% -> 85%) ----
  let companionZip: string | null = null
  if (companionAsset) {
    companionZip = join(cacheDir, companionAsset.name)
    emit({
      stage: 'downloading',
      percent: 70,
      message: `Mengunduh companion ${companionAsset.name}…`,
      assetName: companionAsset.name
    })
    const cStart = Date.now()
    await downloadAsset(companionAsset, companionZip, (loaded, total) => {
      const ratio = total > 0 ? loaded / total : 0
      const elapsed = (Date.now() - cStart) / 1000
      const bps = elapsed > 0 ? loaded / elapsed : 0
      emit({
        stage: 'downloading',
        percent: 70 + ratio * 15,
        bytesLoaded: loaded,
        bytesTotal: total,
        bytesPerSec: bps,
        message: `Mengunduh companion ${companionAsset.name}…`,
        assetName: companionAsset.name
      })
    })
  }

  // ---- extract (85% -> 97%) ----
  emit({ stage: 'extracting', percent: 85, message: 'Mengekstrak binary…' })
  const binDir = paths.bin()
  // Clear previous binaries to avoid stale leftovers / overwrite warnings.
  try {
    await fsp.rm(binDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  await fsp.mkdir(binDir, { recursive: true })
  await extractArchive(mainZip, binDir, archiveType)
  if (companionZip) {
    await extractArchive(companionZip, binDir, 'zip')
  }

  // The macOS/Linux tarball wraps everything in a single top-level folder
  // (e.g. llama-b9827/). If that's the case, flatten it so binaries sit
  // directly in bin/ where paths.serverBinary() expects them.
  await flattenIfSingleSubdir(binDir)
  emit({ stage: 'extracting', percent: 97, message: 'Ekstraksi selesai.' })

  // ---- finalize ----
  emit({ stage: 'finalizing', percent: 98, message: 'Menjadikan executable…' })
  await makeBinExecutable(binDir)

  // Persist platform so we don't re-detect every launch.
  await setSettings({ platform })

  // cleanup zips
  await Promise.all([
    fsp.rm(mainZip, { force: true }),
    companionZip ? fsp.rm(companionZip, { force: true }) : Promise.resolve()
  ])

  emit({
    stage: 'done',
    percent: 100,
    message: `llama.cpp ${release.tag_name} siap digunakan.`
  })
}

/** Helper for callers that just need the latest tag without installing. */
export async function getLatestReleaseTag(): Promise<string> {
  return (await fetchLatestRelease()).tag_name
}
