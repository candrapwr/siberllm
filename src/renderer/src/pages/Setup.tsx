import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInstallStore } from '../store/install'
import { useProfilesStore } from '../store/profiles'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { formatBytes, formatSpeed } from '../lib/format'
import { api } from '../lib/api'
import type { GpuBackend } from '@shared/platforms'

export default function Setup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status, loading, progress, error, refresh, start } = useInstallStore()
  const selectedId = useProfilesStore((s) => s.selectedId)
  const [backend, setBackend] = useState<'auto' | GpuBackend>('auto')

  // Re-check install status whenever the active profile changes.
  useEffect(() => {
    void refresh()
  }, [refresh, selectedId])

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
        <p className="text-sm text-muted-foreground">{t('setup.checkingEngine')}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <h1 className="bg-gradient-to-r from-primary to-slate-300 bg-clip-text text-3xl font-bold text-transparent">
            SiberLLM
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('setup.tagline')}</p>
        </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('setup.title')}</span>
            {installed ? (
              <Badge tone="success">{t('setup.installed')}</Badge>
            ) : (
              <Badge tone="warning">{t('setup.notInstalled')}</Badge>
            )}
          </CardTitle>
          <CardDescription>{t('setup.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="rounded-md border border-border bg-background/40 p-3 text-sm">
              <Row label={t('setup.status')}>
                {installed ? `v${status.version ?? '?'}` : t('setup.notInstalledStatus')}
              </Row>
              <Row label={t('setup.backend')}>
                <Badge tone="info">{status.backend ?? 'auto'}</Badge>
              </Row>
              <Row label={t('setup.path')}>{status.binaryPath ?? '—'}</Row>
            </div>
          )}

          {!installed && (
            <div className="space-y-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t('setup.gpuBackend')}
                </span>
                <Select
                  value={backend}
                  disabled={loading}
                  onChange={(e) => setBackend(e.target.value as 'auto' | GpuBackend)}
                >
                  <option value="auto">{t('setup.autoDetect')}</option>
                  {api.env.platform === 'darwin' ? (
                    <option value="metal">{t('setup.metal')}</option>
                  ) : (
                    <>
                      <option value="cpu">{t('setup.cpu')}</option>
                      <option value="cuda">{t('setup.cuda')}</option>
                      <option value="vulkan">{t('setup.vulkan')}</option>
                    </>
                  )}
                </Select>
              </label>
            </div>
          )}

          {loading && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t(`setup.stages.${stage}`)}</span>
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
                {loading ? t('setup.processing') : t('setup.installBtn')}
              </Button>
            )}
            <Button variant="outline" onClick={() => refresh()} disabled={loading}>
              {t('setup.recheck')}
            </Button>
            {installed && (
              <>
                <Button variant="outline" onClick={() => api.openPath('bin')}>
                  {t('setup.openFolder')}
                </Button>
                <Button onClick={() => navigate('/models')}>{t('setup.next')}</Button>
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
