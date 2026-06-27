import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Field, Input, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.settings.get().then(setSettings)
  }, [])

  const update = (patch: Partial<AppSettings>): void => {
    setSettings((s) => ({ ...s, ...patch }))
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    const next = await api.settings.set(settings)
    setSettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const onMac = api.env.platform === 'darwin'

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">Pengaturan</h2>
        <p className="text-xs text-muted-foreground">Default server & preferensi engine.</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Engine</CardTitle>
              <CardDescription>Backend GPU yang dipakai saat memasang binary.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Backend" hint={onMac ? 'macOS selalu memakai Metal.' : undefined}>
                <Select
                  value={settings.backend}
                  onChange={(e) =>
                    update({ backend: e.target.value as AppSettings['backend'] })
                  }
                >
                  <option value="auto">Auto-detect</option>
                  {onMac ? (
                    <option value="metal">Metal</option>
                  ) : (
                    <>
                      <option value="cpu">CPU</option>
                      <option value="cuda">CUDA (NVIDIA)</option>
                      <option value="vulkan">Vulkan</option>
                      <option value="rocm">ROCm (AMD)</option>
                    </>
                  )}
                </Select>
              </Field>
              {settings.platform && (
                <div className="rounded-md border border-border p-3 text-xs">
                  <span className="text-muted-foreground">Terdeteksi: </span>
                  <Badge tone="info">
                    {settings.platform.os}/{settings.platform.arch} · {settings.platform.backend}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Default Server</CardTitle>
              <CardDescription>Nilai awal saat menjalankan server baru.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Host">
                  <Input
                    value={settings.defaultHost}
                    onChange={(e) => update({ defaultHost: e.target.value })}
                  />
                </Field>
                <Field label="Port">
                  <Input
                    type="number"
                    value={settings.defaultPort}
                    onChange={(e) => update({ defaultPort: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="GPU layers">
                  <Input
                    type="number"
                    value={settings.defaultGpuLayers}
                    onChange={(e) => update({ defaultGpuLayers: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Context size">
                  <Input
                    type="number"
                    value={settings.defaultContextSize}
                    onChange={(e) => update({ defaultContextSize: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label="Argumen tambahan">
                <Input
                  value={settings.extraArgs}
                  onChange={(e) => update({ extraArgs: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lokasi Penyimpanan</CardTitle>
              <CardDescription>
                Buka folder tempat binary engine, model, dan log disimpan.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="outline" size="sm" onClick={() => api.openPath('bin')}>
                Engine 📂
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('models')}>
                Model 📂
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('logs')}>
                Log 📂
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('root')}>
                Root 📂
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Folder Model Tambahan</CardTitle>
              <CardDescription>
                Folder (selain default) yang ikut di-scan untuk file .gguf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {settings.extraModelFolders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada folder tambahan.</p>
              ) : (
                settings.extraModelFolders.map((f) => (
                  <div
                    key={f}
                    className="flex items-center justify-between rounded-md border border-border p-2"
                  >
                    <span className="truncate font-mono text-xs">{f}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        update({
                          extraModelFolders: settings.extraModelFolders.filter((x) => x !== f)
                        })
                      }
                    >
                      Hapus
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tentang</CardTitle>
              <CardDescription>SiberLLM — by datasiberLab.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Dibuat oleh:</span>{' '}
                <span className="font-medium">datasiberLab</span>
              </p>
              <p>
                <span className="text-muted-foreground">Kontak:</span>{' '}
                <a
                  href="mailto:candrapwr@datasiber.com"
                  className="text-primary hover:underline"
                >
                  candrapwr@datasiber.com
                </a>
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                SiberLLM adalah layer UI di atas llama.cpp untuk menjalankan
                model AI secara lokal & privat.
              </p>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={() => save()}>Simpan</Button>
            {saved && <span className="text-sm text-emerald-400">Tersimpan ✓</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
