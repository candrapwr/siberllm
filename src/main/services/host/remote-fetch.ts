// Remote download helper: ask the target machine to fetch a file itself (via
// curl or wget) rather than streaming bytes through the app.
//
// Used by SSH profiles so the app only orchestrates + reports progress, while
// the heavy data path is remote ──→ CDN directly.
//
// For the local target this is intentionally not used (the local machine can
// just fetch directly via the existing fetch()-based downloader); callers
// branch on target.kind.

import type { HostTarget } from './types'

export type FetchTool = 'curl' | 'wget'

export class RemoteFetchError extends Error {}

const TOOL_CACHE = new WeakMap<HostTarget, FetchTool | null>()

/** Detect whether the target has curl or wget. Prefers curl. Throws if neither. */
export async function detectFetchTool(target: HostTarget): Promise<FetchTool> {
  const cached = TOOL_CACHE.get(target)
  if (cached) return cached
  // curl is preferred: progress output is consistent and widely available.
  const curl = await target.exec('command', ['-v', 'curl'])
  if (curl.code === 0 || curl.stdout.trim()) {
    TOOL_CACHE.set(target, 'curl')
    return 'curl'
  }
  const wget = await target.exec('command', ['-v', 'wget'])
  if (wget.code === 0 || wget.stdout.trim()) {
    TOOL_CACHE.set(target, 'wget')
    return 'wget'
  }
  throw new RemoteFetchError(
    'Remote machine has neither curl nor wget. Install one (e.g. `apt-get install -y curl`) before downloading.'
  )
}

/**
 * Fetch a URL to a destination path ON THE TARGET, reporting byte progress.
 * Returns the destination path. Resolves the download via a long-lived exec so
 * the caller can cancel it by killing the returned handle (not exposed here —
 * cancellation is handled by the ssh channel being destroyed upstream).
 *
 * `onProgress` is called with bytesLoaded / bytesTotal; bytesTotal is 0 if the
 * server did not advertise content-length.
 */
export async function remoteFetchToFile(
  target: HostTarget,
  url: string,
  destPath: string,
  onProgress: (p: { bytesLoaded: number; bytesTotal: number }) => void,
  opts: { signal?: AbortSignal } = {}
): Promise<void> {
  const tool = await detectFetchTool(target)

  // Fetch total size first via HEAD so we can compute a percentage even though
  // curl/wget progress bars are byte-based and somewhat noisy to parse.
  let bytesTotal = 0
  try {
    const headArgs =
      tool === 'curl'
        ? ['-sIL', url]
        : ['--spider', '-S', url]
    const head = await target.exec(tool, headArgs, { timeoutMs: 15000 })
    const m = head.stdout.match(/content-length:\s*(\d+)/i)
    if (m) bytesTotal = Number(m[1])
  } catch {
    /* best effort — proceed without total */
  }

  // Build the fetch command.
  const args =
    tool === 'curl'
      ? // -L follow redirects, -# progress bar (carriage-return separated),
        // -S show errors, -o output file, --fail error on HTTP 4xx/5xx.
        ['-L', '-#', '-S', '--fail', '-o', destPath, url]
      : // wget follows redirects by default; --progress=bar prints \r-separated
        // updates; -O output file.
        [`--progress=bar:noscroll`, '-O', destPath, url]

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let stream: unknown = null

    const onAbort = (): void => {
      if (settled) return
      settled = true
      try {
        // Destroying the channel aborts the remote curl/wget (SIGTERM via HUP).
        ;(stream as { destroy?: () => void } | null)?.destroy?.()
      } catch {
        /* ignore */
      }
      reject(new RemoteFetchError('Download cancelled.'))
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort()
        return
      }
      opts.signal.addEventListener('abort', onAbort, { once: true })
    }

    target
      .spawn(tool, args, {
        // curl/wget write progress to stderr.
        onStderr: (line) => {
          if (settled) return
          const loaded = parseBytesFromProgressLine(line, tool)
          if (loaded != null) {
            onProgress({ bytesLoaded: loaded, bytesTotal })
          }
        }
      })
      .then((proc) => {
        stream = proc
        proc.onExit.then(({ code }) => {
          if (settled) return
          settled = true
          if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
          if (code === 0) resolve()
          else if (opts.signal?.aborted) reject(new RemoteFetchError('Download cancelled.'))
          else reject(new RemoteFetchError(`${tool} exited with code ${code}.`))
        })
      })
      .catch((err) => {
        if (settled) return
        settled = true
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort)
        reject(err instanceof Error ? err : new RemoteFetchError(String(err)))
      })
  })
}

/**
 * Parse the number of bytes already downloaded from a curl/wget progress line.
 * curl `-#` prints lines like: `###....##   12.3%` (percent, not bytes).
 * curl default progress prints: `  1 50.0M  10.0M ...` (bytes per segment).
 * wget `bar` prints: `1.2MB/s` style lines with `[ <=>     ]` blocks.
 *
 * We extract a byte count when we can; otherwise fall back to parsing a
 * percentage (when bytesTotal is known). Returns null if nothing parseable.
 */
function parseBytesFromProgressLine(line: string, tool: FetchTool): number | null {
  const t = line.trim()
  if (!t) return null

  // curl `-#` style: ends with a percentage like "  12.3%"
  const pct = t.match(/([0-9]+(?:\.[0-9]+)?)\s*%$/)
  if (pct) {
    // Caller handles converting %→bytes when it knows total; we can't here, so
    // we don't return a byte count from percentage lines directly.
    return null
  }

  if (tool === 'curl') {
    // Default curl progress meter columns: " <d> <total> <received> <speed> ..."
    // The received-so-far is typically the 3rd whitespace-delimited token with
    // a size suffix (e.g. "10.0M"). Grab the first token that looks like bytes.
    const m = t.match(/([0-9]+(?:\.[0-9]+)?[KMGT]?i?B?)\s+([0-9]+(?:\.[0-9]+)?[KMGT]?i?B?)/)
    if (m) {
      const received = parseSizeToken(m[2])
      if (received != null) return received
    }
  }
  return null
}

/** Parse a size token like "10.0M", "512K", "1.5GiB" into a byte count. */
function parseSizeToken(tok: string): number | null {
  const m = tok.match(/^([0-9]+(?:\.[0-9]+)?)\s*([KMGT]?i?B?)$/i)
  if (!m) return null
  const num = Number(m[1])
  const unit = m[2].toUpperCase()
  const mult =
    unit.startsWith('K') ? 1024 :
    unit.startsWith('M') ? 1024 ** 2 :
    unit.startsWith('G') ? 1024 ** 3 :
    unit.startsWith('T') ? 1024 ** 4 :
    1
  return Math.round(num * mult)
}
