import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Field, Input, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

export default function Settings() {
  const { t } = useTranslation()
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
        <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.desc')}</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.engine')}</CardTitle>
              <CardDescription>{t('settings.engineDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t('settings.backend')} hint={onMac ? t('settings.backendHint') : undefined}>
                <Select
                  value={settings.backend}
                  onChange={(e) =>
                    update({ backend: e.target.value as AppSettings['backend'] })
                  }
                >
                  <option value="auto">{t('setup.autoDetect')}</option>
                  {onMac ? (
                    <option value="metal">{t('setup.metal')}</option>
                  ) : (
                    <>
                      <option value="cpu">{t('setup.cpu')}</option>
                      <option value="cuda">{t('setup.cuda')}</option>
                      <option value="vulkan">{t('setup.vulkan')}</option>
                      <option value="rocm">ROCm (AMD)</option>
                    </>
                  )}
                </Select>
              </Field>
              {settings.platform && (
                <div className="rounded-md border border-border p-3 text-xs">
                  <span className="text-muted-foreground">{t('settings.detected')} </span>
                  <Badge tone="info">
                    {settings.platform.os}/{settings.platform.arch} · {settings.platform.backend}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.defaultServer')}</CardTitle>
              <CardDescription>{t('settings.defaultServerDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('run.host')}>
                  <Input
                    value={settings.defaultHost}
                    onChange={(e) => update({ defaultHost: e.target.value })}
                  />
                </Field>
                <Field label={t('run.port')}>
                  <Input
                    type="number"
                    value={settings.defaultPort}
                    onChange={(e) => update({ defaultPort: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('run.gpuLayers')}>
                  <Input
                    type="number"
                    value={settings.defaultGpuLayers}
                    onChange={(e) => update({ defaultGpuLayers: Number(e.target.value) })}
                  />
                </Field>
                <Field label={t('run.contextSize')}>
                  <Input
                    type="number"
                    value={settings.defaultContextSize}
                    onChange={(e) => update({ defaultContextSize: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label={t('run.extraArgs')}>
                <Input
                  value={settings.extraArgs}
                  onChange={(e) => update({ extraArgs: e.target.value })}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.storageLocation')}</CardTitle>
              <CardDescription>{t('settings.storageDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="outline" size="sm" onClick={() => api.openPath('bin')}>
                {t('settings.engineFolder')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('models')}>
                {t('settings.modelFolder')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('logs')}>
                {t('settings.logFolder')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => api.openPath('root')}>
                {t('settings.rootFolder')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.extraModelFolders')}</CardTitle>
              <CardDescription>{t('settings.extraFoldersDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {settings.extraModelFolders.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('settings.noExtraFolders')}</p>
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
                      {t('settings.removeFolder')}
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.about')}</CardTitle>
              <CardDescription>{t('settings.aboutDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">{t('settings.madeBy')}</span>{' '}
                <span className="font-medium">datasiberLab</span>
              </p>
              <p>
                <span className="text-muted-foreground">{t('settings.contact')}</span>{' '}
                <a
                  href="mailto:candrapwr@datasiber.com"
                  className="text-primary hover:underline"
                >
                  candrapwr@datasiber.com
                </a>
              </p>
              <p className="pt-1 text-xs text-muted-foreground">{t('settings.aboutText')}</p>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button onClick={() => save()}>{t('settings.save')}</Button>
            {saved && <span className="text-sm text-emerald-400">{t('settings.saved')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
