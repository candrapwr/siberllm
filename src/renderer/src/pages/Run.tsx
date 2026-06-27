import { useEffect } from 'react'
import { useServerStore } from '../store/server'
import { useModelsStore } from '../store/models'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Field, Input, Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import type { ServerStatus } from '@shared/types'

const STATUS_TONE: Record<ServerStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  stopped: 'default',
  starting: 'warning',
  running: 'success',
  error: 'danger'
}

export default function Run() {
  const { state, config, setConfig, start, stop, refresh } = useServerStore()
  const scan = useModelsStore((s) => s.scan)
  const refreshModels = useModelsStore((s) => s.refresh)

  useEffect(() => {
    void refresh()
    void refreshModels()
  }, [refresh, refreshModels])

  const status = state?.status ?? 'stopped'
  const running = status === 'running'
  const busy = status === 'starting'

  const models = scan?.models ?? []
  const mmproj = scan?.mmproj ?? []
  const selectedModel = models.find((m) => m.path === config.modelPath)
  const suggestMmproj = selectedModel?.name ?? ''
  const autoMmproj =
    mmproj.find((m) =>
      suggestMmproj.toLowerCase().includes(m.name.toLowerCase().split('-')[0] ?? '')
    ) ?? undefined

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Jalankan Server</h2>
            <p className="text-xs text-muted-foreground">
              Start <code>llama-server</code> sebagai API OpenAI-compatible.
            </p>
          </div>
          <Badge tone={STATUS_TONE[status]}>{status}</Badge>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---- config form ---- */}
          <Card>
            <CardHeader>
              <CardTitle>Konfigurasi</CardTitle>
              <CardDescription>Pilih model dan parameter server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Model (.gguf)">
                <Select
                  value={config.modelPath}
                  onChange={(e) => {
                    const path = e.target.value
                    setConfig({ modelPath: path, mmprojPath: undefined })
                  }}
                >
                  <option value="">— pilih model —</option>
                  {models.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="mmproj (untuk model multimodal)"
                hint={
                  autoMmproj
                    ? `Saran otomatis: ${autoMmproj.name}`
                    : 'Kosongkan jika model text-only.'
                }
              >
                <Select
                  value={config.mmprojPath ?? ''}
                  onChange={(e) => setConfig({ mmprojPath: e.target.value || undefined })}
                >
                  <option value="">— tidak ada —</option>
                  {mmproj.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Host">
                  <Input
                    value={config.host}
                    onChange={(e) => setConfig({ host: e.target.value })}
                  />
                </Field>
                <Field label="Port">
                  <Input
                    type="number"
                    value={config.port}
                    onChange={(e) => setConfig({ port: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="GPU layers" hint="-1 = semua ke GPU">
                  <Input
                    type="number"
                    value={config.gpuLayers}
                    onChange={(e) => setConfig({ gpuLayers: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Context size">
                  <Input
                    type="number"
                    value={config.contextSize}
                    onChange={(e) => setConfig({ contextSize: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <Field label="Argumen tambahan" hint="cth: --jinja --flash-attn">
                <Input
                  value={config.extraArgs}
                  onChange={(e) => setConfig({ extraArgs: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          {/* ---- run panel ---- */}
          <Card>
            <CardHeader>
              <CardTitle>Server</CardTitle>
              <CardDescription>Status & akses endpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {!running && (
                  <Button onClick={() => start()} disabled={busy || !config.modelPath}>
                    {busy ? 'Memulai…' : 'Start'}
                  </Button>
                )}
                {(running || busy) && (
                  <Button variant="destructive" onClick={() => stop()} disabled={false}>
                    Stop
                  </Button>
                )}
                <Button variant="outline" onClick={() => refresh()} disabled={busy}>
                  Refresh
                </Button>
              </div>

              {busy && (
                <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <Spinner size={16} />
                    <p className="text-sm font-medium text-amber-400">
                      Memulai server…
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Memuat model ke memori & menunggu server siap. Untuk model
                    besar proses ini bisa beberapa puluh detik. Lihat progres di tab Logs.
                  </p>
                </div>
              )}

              {running && state?.url && (
                <div className="space-y-3 rounded-md border border-border bg-background/40 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Server siap di</p>
                    <p className="font-mono text-sm text-emerald-400">{state.url}</p>
                  </div>
                  <div className="grid gap-2">
                    <Button size="sm" onClick={() => api.openExternal(`${state.url}/`)}>
                      Buka Web UI ↗
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        api.openExternal(`${state.url}/v1/chat/completions`)
                      }
                    >
                      Buka endpoint OpenAI ↗
                    </Button>
                  </div>
                  <div className="rounded-md bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                    <p>curl {state.url}/v1/chat/completions \</p>
                    <p className="pl-4">-H "Content-Type: application/json" \</p>
                    <p className="pl-4">
                      -d '&#123;"model":"...","messages":[&#123;"role":"user","content":"Halo"&#125;]&#125;'
                    </p>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Server gagal. Lihat tab Logs untuk detail.
                </div>
              )}

              {!config.modelPath && !running && (
                <p className="text-xs text-muted-foreground">
                  Pilih model dulu sebelum menjalankan server.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
