import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstallStore } from '../store/install'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { formatBytes, formatSpeed } from '../lib/format'
import { api } from '../lib/api'
import type { GpuBackend } from '@shared/platforms'

const STAGE_LABEL: Record<string, string> = {
  idle: 'Menunggu',
  detecting: 'Mendeteksi sistem…',
  'fetching-release': 'Mengambil info rilis…',
  downloading: 'Mengunduh binary',
  extracting: 'Mengekstrak',
  finalizing: 'Menyiapkan',
  done: 'Selesai',
  error: 'Gagal'
}

export default function Setup() {
  const navigate = useNavigate()
  const { status, loading, progress, error, refresh, start } = useInstallStore()
  const [backend, setBackend] = useState<'auto' | GpuBackend>('auto')

  useEffect(() => {
    void refresh()
  }, [refresh])

  // redirect to models once installed.
  useEffect(() => {
    if (status?.installed && !loading) navigate('/models', { replace: true })
  }, [status, loading, navigate])

  const installed = status?.installed
  const percent = progress?.percent ?? 0
  const stage = progress?.stage ?? 'idle'

  // Still checking whether the engine is installed (first launch / refresh).
  if (!status) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Spinner size={32} />
        <p className="text-sm text-muted-foreground">Memeriksa engine…</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-primary to-sky-300 bg-clip-text text-3xl font-bold text-transparent">
            SiberLLM
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Layer untuk menjalankan llama.cpp sebagai server API OpenAI-compatible.
          </p>
        </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Engine llama.cpp</span>
            {installed ? (
              <Badge tone="success">Terpasang</Badge>
            ) : (
              <Badge tone="warning">Belum terpasang</Badge>
            )}
          </CardTitle>
          <CardDescription>
            SiberLLM akan mengunduh binary <code>llama-server</code> dari rilis resmi
            ggml-org/llama.cpp sesuai platform Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
              <Row label="Status">
                {installed ? `v${status.version ?? '?'}` : 'Belum terpasang'}
              </Row>
              <Row label="Backend">
                <Badge tone="info">{status.backend ?? 'auto'}</Badge>
              </Row>
              <Row label="Path">{status.binaryPath ?? '—'}</Row>
            </div>
          )}

          {!installed && (
            <div className="space-y-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted-foreground">Backend GPU</span>
                <Select
                  value={backend}
                  disabled={loading}
                  onChange={(e) => setBackend(e.target.value as 'auto' | GpuBackend)}
                >
                  <option value="auto">Auto-detect (rekomendasi)</option>
                  {api.env.platform === 'darwin' ? (
                    <option value="metal">Metal</option>
                  ) : (
                    <>
                      <option value="cpu">CPU</option>
                      <option value="cuda">CUDA (NVIDIA)</option>
                      <option value="vulkan">Vulkan</option>
                    </>
                  )}
                </Select>
              </label>
            </div>
          )}

          {loading && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{STAGE_LABEL[stage] ?? stage}</span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(percent)}%
                </span>
              </div>
              <Progress value={percent} />
              <p className="text-xs text-muted-foreground">{progress.message}</p>
              {progress.stage === 'downloading' && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {formatBytes(progress.bytesLoaded ?? 0)} /{' '}
                    {formatBytes(progress.bytesTotal ?? 0)}
                  </span>
                  <span className="tabular-nums">
                    {formatSpeed(progress.bytesPerSec ?? 0)}
                  </span>
                </div>
              )}
              {progress.assetName && (
                <p className="truncate font-mono text-[11px] text-muted-foreground/70">
                  {progress.assetName}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            {!installed && (
              <Button onClick={() => start(backend)} disabled={loading}>
                {loading ? 'Memproses…' : 'Pasang llama.cpp'}
              </Button>
            )}
            <Button variant="outline" onClick={() => refresh()} disabled={loading}>
              Periksa ulang
            </Button>
            {installed && (
              <>
                <Button variant="outline" onClick={() => api.openPath('bin')}>
                  Buka folder 📂
                </Button>
                <Button onClick={() => navigate('/models')}>Lanjut →</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{children}</span>
    </div>
  )
}
