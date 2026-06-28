// Scan model files on a target and download models from HuggingFace.
//
// Local operations (scan/delete/import) run on the target via HostTarget.
// Network downloads still originate from the main process (host-agnostic
// fetch) and the bytes are streamed to the target via createWriteStream /
// copyFile.

import { join, basename as pathBasename, extname } from 'node:path'
import {
  HUGGINGFACE_API,
  HUGGINGFACE_RESOLVE,
  assertApiHost,
  assertDownloadHost
} from '@shared/constants'
import { getSettings, setSettings } from '../store'
import type { HostTarget } from './host/types'
import { type AsyncPathResolver } from './host/paths-resolver'
import { localTarget } from './host/local-target'
import { remoteFetchToFile } from './host/remote-fetch'
import type {
  LocalModel,
  ScanResult,
  ModelDownloadProgress,
  RepoFile
} from '@shared/types'

const MMPROJ_HINT = /mmproj/i

/** Custom error thrown when a download is cancelled by the user. */
export class DownloadCancelledError extends Error {
  constructor(message = 'Download dibatalkan.') {
    super(message)
    this.name = 'DownloadCancelledError'
  }
}

/** Active AbortControllers keyed by `${repo}/${file}` so downloads can be cancelled. */
const activeDownloads = new Map<string, AbortController>()

export function downloadKey(repo: string, file: string): string {
  return `${repo}/${file}`
}

/** Cancel an in-flight download. Returns true if a download was found & aborted. */
export async function cancelDownload(repo: string, file: string): Promise<boolean> {
  const k = downloadKey(repo, file)
  const ctrl = activeDownloads.get(k)
  if (!ctrl) return false
  ctrl.abort()
  activeDownloads.delete(k)
  // remove the partial file so it doesn't linger as corrupt.
  try {
    // We don't know the target here without more plumbing; this is best-effort
    // for the common local case. A target-aware cancel is added with the
    // full download call site (which holds the target + tmp path).
  } catch {
    /* ignore */
  }
  return true
}

function isGguf(name: string): boolean {
  return extname(name).toLowerCase() === '.gguf'
}

async function* walk(target: HostTarget, dir: string): AsyncGenerator<string> {
  let entries
  try {
    entries = await target.readdir(dir)
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDir) {
      yield* walk(target, full)
    } else if (e.isFile) {
      yield full
    }
  }
}

async function statModel(target: HostTarget, file: string): Promise<LocalModel> {
  const st = await target.stat(file)
  return {
    path: file,
    name: pathBasename(file),
    sizeBytes: st?.size ?? 0,
    isMmproj: MMPROJ_HINT.test(pathBasename(file))
  }
}

/** Scan the built-in models dir plus any user-added folders on the target. */
export async function scanLocalModels(
  target: HostTarget = localTarget,
  paths: AsyncPathResolver
): Promise<ScanResult> {
  const settings = await getSettings()
  const dirs = [await paths.models(), ...settings.extraModelFolders]

  const seen = new Set<string>()
  const all: LocalModel[] = []
  for (const dir of dirs) {
    for await (const file of walk(target, dir)) {
      if (!isGguf(file)) continue
      if (seen.has(file)) continue
      seen.add(file)
      all.push(await statModel(target, file))
    }
  }

  // newest first, human-sort by name
  all.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  return {
    models: all.filter((m) => !m.isMmproj),
    mmproj: all.filter((m) => m.isMmproj)
  }
}

export async function deleteLocalModel(target: HostTarget, path: string): Promise<void> {
  await target.rm(path, { force: true })
}

/** Copy one or more external .gguf files into the built-in models folder on the target. */
export async function importModelFiles(
  target: HostTarget,
  paths: AsyncPathResolver,
  files: string[]
): Promise<void> {
  await paths.ensure()
  const destDir = await paths.models()
  for (const src of files) {
    if (!isGguf(src)) continue
    const name = pathBasename(src)
    const dest = join(destDir, name)
    // skip if source already lives inside our models dir (no-op copy)
    if (src === dest) continue
    // `uploadFile` does the right thing per target kind: fs copy locally,
    // SFTP streaming for SSH remotes.
    await target.uploadFile(src, dest)
  }
}

export async function addModelFolder(folder: string): Promise<void> {
  const settings = await getSettings()
  if (!settings.extraModelFolders.includes(folder)) {
    const next = [...settings.extraModelFolders, folder]
    await setSettings({ extraModelFolders: next })
  }
}

/** Search HuggingFace for GGUF repos by keyword. */
export async function searchHuggingFace(query: string, limit = 20): Promise<
  Array<{ id: string; downloads: number; likes: number }>
> {
  const url = new URL(`${HUGGINGFACE_API}/models`)
  url.searchParams.set('search', query)
  url.searchParams.set('filter', 'gguf')
  url.searchParams.set('full', 'false')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('sort', 'downloads')
  url.searchParams.set('direction', '-1')

  assertApiHost(url.toString())
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HuggingFace search failed: ${res.status}`)
  const json = (await res.json()) as Array<{
    id: string
    downloads?: number
    likes?: number
  }>
  return json.map((m) => ({
    id: m.id,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0
  }))
}

export async function listRepoFiles(repo: string): Promise<RepoFile[]> {
  const url = `${HUGGINGFACE_API}/models/${repo}`
  assertApiHost(url)
  const res = await fetch(url, {
    headers: { Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Gagal mengambil file repo ${repo}: ${res.status}`)
  const json = (await res.json()) as { siblings?: Array<{ rfilename: string }> }
  const ggufFiles = (json.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((f) => isGguf(f))

  // Fetch each file's size via HEAD in parallel (bounded concurrency).
  const concurrency = 6
  const out: RepoFile[] = []
  for (let i = 0; i < ggufFiles.length; i += concurrency) {
    const batch = ggufFiles.slice(i, i + concurrency)
    const metas = await Promise.all(
      batch.map(async (name) => {
        const fileUrl = `${HUGGINGFACE_RESOLVE}/${repo}/resolve/main/${name}`
        try {
          const h = await fetch(fileUrl, { method: 'HEAD', redirect: 'follow' })
          const size = Number(h.headers.get('content-length') || 0)
          return { name, sizeBytes: size, isMmproj: MMPROJ_HINT.test(name), multimodal: detectMultimodal(name, repo) }
        } catch {
          return { name, sizeBytes: 0, isMmproj: MMPROJ_HINT.test(name), multimodal: detectMultimodal(name, repo) }
        }
      })
    )
    out.push(...metas)
  }
  // model files first, mmproj last
  return out.sort((a, b) => Number(a.isMmproj) - Number(b.isMmproj))
}

/** Heuristic: does this file/repo look like a multimodal (vision) model? */
function detectMultimodal(file: string, repo: string): boolean {
  const s = `${repo}/${file}`.toLowerCase()
  return (
    /vision|vl|llava|moondream|minicpm-v|qwen2.?vl|gemma3|pixtral|phi-3.?vision|vila|cogvlm|internvl|chameleon/.test(
      s
    )
  )
}

/** Download a single file from a HF repo with progress + cancellation. */
export async function downloadHfFile(
  target: HostTarget,
  paths: AsyncPathResolver,
  repo: string,
  file: string,
  onProgress: (p: ModelDownloadProgress) => void
): Promise<string> {
  const url = `${HUGGINGFACE_RESOLVE}/${repo}/resolve/main/${file}`
  assertDownloadHost(url)

  await paths.ensure()
  const dest = join(await paths.models(), file)
  const tmp = `${dest}.part`

  const k = downloadKey(repo, file)
  const controller = new AbortController()
  activeDownloads.set(k, controller)

  // ---- SSH target: let the remote machine fetch directly (single hop) ----
  if (target.kind === 'ssh') {
    const start = Date.now()
    let lastEmit = 0
    try {
      await remoteFetchToFile(
        target,
        url,
        tmp,
        ({ bytesLoaded, bytesTotal }) => {
          const now = Date.now()
          if (now - lastEmit > 100) {
            lastEmit = now
            const elapsed = (now - start) / 1000
            onProgress({
              repo,
              file,
              percent: bytesTotal > 0 ? (bytesLoaded / bytesTotal) * 100 : 0,
              bytesLoaded,
              bytesTotal,
              bytesPerSec: elapsed > 0 ? bytesLoaded / elapsed : 0,
              state: 'downloading'
            })
          }
        },
        { signal: controller.signal }
      )
      await target.rename(tmp, dest)
      activeDownloads.delete(k)
      onProgress({
        repo,
        file,
        percent: 100,
        bytesLoaded: 0,
        bytesTotal: 0,
        bytesPerSec: 0,
        state: 'done'
      })
      return dest
    } catch (err) {
      await target.rm(tmp, { force: true }).catch(() => {})
      activeDownloads.delete(k)
      if (controller.signal.aborted) throw new DownloadCancelledError()
      throw err
    }
  }

  // ---- Local target: fetch in-process and stream to disk ----
  let res: Response
  try {
    res = await fetch(url, { redirect: 'follow', signal: controller.signal })
  } catch (err) {
    activeDownloads.delete(k)
    if (controller.signal.aborted) {
      throw new DownloadCancelledError()
    }
    throw err
  }
  if (!res.ok || !res.body) {
    activeDownloads.delete(k)
    throw new Error(`Download gagal (${res.status}) untuk ${repo}/${file}`)
  }
  const total = Number(res.headers.get('content-length') || 0)
  let loaded = 0
  let lastEmit = 0
  const start = Date.now()

  // Manual reader (not 'data'+pipeline on the same stream — that races and
  // can truncate the file, producing corrupt downloads).
  const reader = (res.body as unknown as ReadableStream<Uint8Array>).getReader()
  const out = await target.createWriteStream(tmp)
  try {
    while (true) {
      // Check cancellation between reads so the loop exits promptly on cancel.
      if (controller.signal.aborted) {
        throw new DownloadCancelledError()
      }
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        await out.write(Buffer.from(value))
        loaded += value.byteLength
        const now = Date.now()
        if (now - lastEmit > 100) {
          lastEmit = now
          const elapsed = (now - start) / 1000
          onProgress({
            repo,
            file,
            percent: total > 0 ? (loaded / total) * 100 : 0,
            bytesLoaded: loaded,
            bytesTotal: total,
            bytesPerSec: elapsed > 0 ? loaded / elapsed : 0,
            state: 'downloading'
          })
        }
      }
    }
    await out.close()
  } catch (err) {
    // Ensure the stream & file handle are closed on any failure.
    try {
      await out.close()
    } catch {
      /* ignore */
    }
    try {
      await reader.cancel('cleanup')
    } catch {
      /* ignore */
    }
    // On cancellation (or any error) remove the partial file.
    await target.rm(tmp, { force: true }).catch(() => {})
    activeDownloads.delete(k)
    throw err
  }

  // Size integrity check — guard against truncated downloads.
  if (total > 0 && loaded !== total) {
    activeDownloads.delete(k)
    throw new Error(
      `Download ${repo}/${file} tidak lengkap: ${loaded}/${total} byte. Coba lagi.`
    )
  }

  await target.rename(tmp, dest)
  activeDownloads.delete(k)

  onProgress({
    repo,
    file,
    percent: 100,
    bytesLoaded: loaded,
    bytesTotal: total || loaded,
    bytesPerSec: 0,
    state: 'done'
  })
  return dest
}
