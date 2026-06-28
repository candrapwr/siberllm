import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModelsStore } from '../store/models'
import { useInstallStore } from '../store/install'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { Input } from '../components/ui/Input'
import { Spinner } from '../components/ui/Spinner'
import { formatBytes, formatSpeed } from '../lib/format'
import type { CatalogModel } from '@shared/constants'

type Tab = 'local' | 'download'

export default function Models() {
  const { t } = useTranslation()
  const installed = useInstallStore((s) => s.status?.installed)
  const { scan, refresh, remove } = useModelsStore()
  const [tab, setTab] = useState<Tab>('local')
  const [importing, setImporting] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleImportFiles = async (): Promise<void> => {
    setImporting(true)
    try {
      const res = await api.models.importFiles()
      if (res.imported > 0) await refresh()
    } finally {
      setImporting(false)
    }
  }

  const handleAddFolder = async (): Promise<void> => {
    setAddingFolder(true)
    try {
      // Two steps: (1) pick a folder via native dialog, (2) register it so
      // the scanner includes it. Picking alone does nothing — it must be added.
      const folder = await api.models.pickFolder()
      if (folder) {
        await api.models.addFolder(folder)
        await refresh()
      }
    } finally {
      setAddingFolder(false)
    }
  }

  if (installed === false) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {t('models.installPrompt')}{' '}
        <a href="#/setup" className="text-primary underline">Setup</a>.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">{t('models.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('models.desc')}</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-1">
          <TabBtn active={tab === 'local'} onClick={() => setTab('local')}>
            {t('models.tabLocal')}
          </TabBtn>
          <TabBtn active={tab === 'download'} onClick={() => setTab('download')}>
            {t('models.tabDownload')}
          </TabBtn>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'local' ? (
          <LocalModels
            models={scan?.models ?? []}
            mmproj={scan?.mmproj ?? []}
            onRefresh={() => refresh()}
            onRemove={(p) => remove(p)}
            onImportFiles={handleImportFiles}
            onAddFolder={handleAddFolder}
            importing={importing}
            addingFolder={addingFolder}
          />
        ) : (
          <DownloadModels />
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function LocalModels({
  models,
  mmproj,
  onRefresh,
  onRemove,
  onImportFiles,
  onAddFolder,
  importing,
  addingFolder
}: {
  models: import('@shared/types').LocalModel[]
  mmproj: import('@shared/types').LocalModel[]
  onRefresh: () => void
  onRemove: (path: string) => void
  onImportFiles: () => Promise<void>
  onAddFolder: () => Promise<void>
  importing: boolean
  addingFolder: boolean
}) {
  const { t } = useTranslation()
  const total = models.length + mmproj.length
  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('models.detected', { count: total })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onImportFiles()}
            disabled={importing || addingFolder}
          >
            {importing ? <Spinner size={14} label={t('models.copying')} /> : t('models.importFile')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAddFolder()}
            disabled={importing || addingFolder}
          >
            {addingFolder ? <Spinner size={14} label={t('models.picking')} /> : t('models.addFolder')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={importing || addingFolder}>
            {t('models.refresh')}
          </Button>
        </div>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t('models.sectionModel', { count: models.length })}
          </h3>
        </div>
        {models.length === 0 ? (
          <EmptyHint text={t('models.emptyLocal')} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {models.map((m) => (
              <LocalModelCard key={m.path} model={m} onRemove={() => onRemove(m.path)} />
            ))}
          </div>
        )}
      </section>

      {mmproj.length > 0 && (
        <section>
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
            {t('models.sectionMmproj', { count: mmproj.length })}
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {mmproj.map((m) => (
              <LocalModelCard key={m.path} model={m} onRemove={() => onRemove(m.path)} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function LocalModelCard({
  model,
  onRemove
}: {
  model: import('@shared/types').LocalModel
  onRemove: () => void
}) {
  const { t } = useTranslation()
  // derive a friendly label from the filename
  const label = model.name
    .replace(/\.gguf$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b(q[0-9](_k_[a-z]+)?)\b/gi, '($1)')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm capitalize">{label}</CardTitle>
          {model.isMmproj ? (
            <Badge tone="info">{t('models.mmproj')}</Badge>
          ) : (
            <Badge tone="default">{t('models.local')}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge tone="default">{formatBytes(model.sizeBytes)}</Badge>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground/70">
          {model.name}
        </p>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={onRemove}>
          {t('models.remove')}
        </Button>
      </CardContent>
    </Card>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function DownloadModels() {
  const { t } = useTranslation()
  const { catalog, loadCatalog, search, searchResults, searching, downloading, download, error } =
    useModelsStore()
  const [query, setQuery] = useState('')
  // expanded repo -> list of gguf files (loaded on demand when clicking "Lihat file")
  const [repoFiles, setRepoFiles] = useState<Record<string, import('@shared/types').RepoFile[]>>({})
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null)
  // anchor for auto-scrolling to the search results area
  const resultsRef = useRef<HTMLDivElement>(null)

  const scrollToResults = (): void => {
    // delay a tick so the skeleton is rendered before we scroll
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleSearch = (): void => {
    void search(query)
    scrollToResults()
  }

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  const handleListFiles = async (repo: string): Promise<void> => {
    // toggle: if already shown, hide; otherwise load files
    if (repoFiles[repo]) {
      setRepoFiles((m) => {
        const next = { ...m }
        delete next[repo]
        return next
      })
      return
    }
    setLoadingRepo(repo)
    try {
      const files = await api.models.listRepoFiles(repo)
      setRepoFiles((m) => ({ ...m, [repo]: files }))
    } catch {
      setRepoFiles((m) => ({ ...m, [repo]: [] }))
    } finally {
      setLoadingRepo(null)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('models.catalogTitle')}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {catalog.map((m) => (
            <CatalogCard
              key={m.id}
              model={m}
              progress={downloading[`${m.repo}/${m.file}`]}
              onDownload={() => download(m.repo, m.file)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t('models.searchTitle')}</h3>
        <div className="flex gap-2">
          <Input
            placeholder={t('models.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            disabled={searching}
          />
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? <Spinner size={14} label={t('models.searching')} /> : t('models.search')}
          </Button>
        </div>
        <div ref={resultsRef} />
        {searching && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-secondary/40" />
            ))}
          </div>
        )}
        {!searching && searchResults.length > 0 && (
          <div className="mt-4 space-y-4">
            {searchResults.map((r) => {
              const files = repoFiles[r.id]
              const isOpen = files !== undefined
              return (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">{r.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('models.downloads', { count: r.downloads })} ·{' '}
                        {t('models.likes', { count: r.likes })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={loadingRepo === r.id}
                      onClick={() => handleListFiles(r.id)}
                    >
                      {loadingRepo === r.id ? (
                        <Spinner size={14} label={t('models.loadingFiles')} />
                      ) : isOpen ? (
                        t('models.hideFiles')
                      ) : (
                        t('models.viewFiles')
                      )}
                    </Button>
                  </div>
                  {loadingRepo === r.id && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Spinner size={14} />
                        <span>{t('models.searchingFiles')}</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="h-28 animate-pulse rounded-lg border border-border bg-secondary/40"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {isOpen && loadingRepo !== r.id && (
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {files.length === 0 ? (
                        <p className="col-span-full text-xs text-muted-foreground">
                          {t('models.noFiles')}
                        </p>
                      ) : (
                        files.map((f) => {
                          const progress = downloading[`${r.id}/${f.name}`]
                          return (
                            <RepoFileCard
                              key={f.name}
                              repo={r.id}
                              file={f}
                              progress={progress}
                              onDownload={() => download(r.id, f.name)}
                            />
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </section>
    </div>
  )
}

function RepoFileCard({
  repo,
  file,
  progress,
  onDownload
}: {
  repo: string
  file: import('@shared/types').RepoFile
  progress?: import('@shared/types').ModelDownloadProgress
  onDownload: () => void
}) {
  const { t } = useTranslation()
  const state = progress?.state ?? 'idle'
  const isDownloading = state === 'downloading'
  const isDone = state === 'done'
  const isError = state === 'error'
  const label = file.name
    .replace(/\.gguf$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b(q[0-9](_k_[a-z]+)?)\b/gi, '($1)')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm capitalize">{label}</CardTitle>
          {file.isMmproj ? (
            <Badge tone="info">{t('models.mmproj')}</Badge>
          ) : file.multimodal ? (
            <Badge tone="info">{t('models.multimodal')}</Badge>
          ) : (
            <Badge tone="default">{t('models.text')}</Badge>
          )}
        </div>
        <CardDescription className="font-mono text-[11px]">{repo}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {file.sizeBytes > 0 ? (
            <Badge tone="default">{formatBytes(file.sizeBytes)}</Badge>
          ) : (
            <Badge tone="default">{t('models.sizeUnknown')}</Badge>
          )}
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground/70">{file.name}</p>

        {/* progress / status indicator */}
        {isDownloading && progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-primary">{t('models.downloading2')}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(progress.percent)}%
              </span>
            </div>
            <Progress value={progress.percent} />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {formatBytes(progress.bytesLoaded)} / {formatBytes(progress.bytesTotal)}
              </span>
              <span className="tabular-nums">{formatSpeed(progress.bytesPerSec)}</span>
            </div>
          </div>
        )}
        {isDone && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span>✓</span>
            <span>{t('models.download')} — 100%</span>
          </div>
        )}
        {isError && (
          <div className="text-xs text-destructive">{t('models.download')} — error</div>
        )}

        <Button size="sm" onClick={onDownload} disabled={isDownloading}>
          {isDownloading ? (
            <Spinner size={14} label={t('models.downloading2')} />
          ) : isDone ? (
            '✓'
          ) : (
            t('models.download')
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

function CatalogCard({
  model,
  progress,
  onDownload
}: {
  model: CatalogModel
  progress?: import('@shared/types').ModelDownloadProgress
  onDownload: () => void
}) {
  const { t } = useTranslation()
  const state = progress?.state ?? 'idle'
  const isDownloading = state === 'downloading'
  const isDone = state === 'done'
  const isError = state === 'error'
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{model.name}</CardTitle>
          {model.multimodal && <Badge tone="info">{t('models.multimodal')}</Badge>}
        </div>
        <CardDescription>{model.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {model.tags.map((tg) => (
            <Badge key={tg} tone="default">
              {tg}
            </Badge>
          ))}
          <Badge tone="default">{model.sizeLabel}</Badge>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground/70">
          {model.repo}/{model.file}
          {model.mmprojFile ? ` + ${model.mmprojFile}` : ''}
        </p>

        {isDownloading && progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-primary">{t('models.downloading2')}</span>
              <span className="tabular-nums text-muted-foreground">
                {Math.round(progress.percent)}%
              </span>
            </div>
            <Progress value={progress.percent} />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="tabular-nums">
                {formatBytes(progress.bytesLoaded)} / {formatBytes(progress.bytesTotal)}
              </span>
              <span className="tabular-nums">{formatSpeed(progress.bytesPerSec)}</span>
            </div>
          </div>
        )}
        {isDone && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span>✓</span>
            <span>{t('models.download')} — 100%</span>
          </div>
        )}
        {isError && (
          <div className="text-xs text-destructive">{t('models.download')} — error</div>
        )}

        <Button size="sm" onClick={onDownload} disabled={isDownloading}>
          {isDownloading ? (
            <Spinner size={14} label={t('models.catalogDownloading')} />
          ) : isDone ? (
            '✓'
          ) : (
            t('models.download')
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
