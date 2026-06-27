import { useEffect, useState } from 'react'
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
        Pasang dulu engine llama.cpp di halaman <a href="#/setup" className="text-primary underline">Setup</a>.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Model</h2>
          <p className="text-xs text-muted-foreground">
            Kelola file .gguf lokal atau unduh dari HuggingFace.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-1">
          <TabBtn active={tab === 'local'} onClick={() => setTab('local')}>
            Lokal
          </TabBtn>
          <TabBtn active={tab === 'download'} onClick={() => setTab('download')}>
            Unduh
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
  const total = models.length + mmproj.length
  return (
    <div className="space-y-6">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {total} file .gguf terdeteksi
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onImportFiles()}
            disabled={importing || addingFolder}
          >
            {importing ? <Spinner size={14} label="Menyalin…" /> : '+ Import file'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAddFolder()}
            disabled={importing || addingFolder}
          >
            {addingFolder ? <Spinner size={14} label="Memilih…" /> : '+ Tambah folder'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={importing || addingFolder}>
            Refresh
          </Button>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Model ({models.length})
          </h3>
        </div>
        {models.length === 0 ? (
          <EmptyHint text="Belum ada model. Klik tombol Import file / Tambah folder di atas, atau pindah ke tab Unduh." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {models.map((m) => (
              <Card key={m.path}>
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(m.sizeBytes)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onRemove(m.path)}
                  >
                    Hapus
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {mmproj.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Projector / mmproj ({mmproj.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {mmproj.map((m) => (
              <Card key={m.path}>
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(m.sizeBytes)}</p>
                  </div>
                  <Badge tone="info">mmproj</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
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
  const { catalog, loadCatalog, search, searchResults, searching, downloading, download, error } =
    useModelsStore()
  const [query, setQuery] = useState('')

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Katalog populer</h3>
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
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Cari di HuggingFace</h3>
        <div className="flex gap-2">
          <Input
            placeholder="cth: qwen2.5 gguf, llama 3.2 vision…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search(query)
            }}
          />
          <Button onClick={() => search(query)} disabled={searching}>
            Cari
          </Button>
        </div>
        {searchResults.length > 0 && (
          <div className="mt-3 grid gap-2">
            {searchResults.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-mono text-sm">{r.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.downloads.toLocaleString()} unduhan
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => search(r.id)}>
                    Lihat file
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </section>
    </div>
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
  const isDownloading = progress?.state === 'downloading'
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{model.name}</CardTitle>
          {model.multimodal && <Badge tone="info">multimodal</Badge>}
        </div>
        <CardDescription>{model.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {model.tags.map((t) => (
            <Badge key={t} tone="default">
              {t}
            </Badge>
          ))}
          <Badge tone="default">{model.sizeLabel}</Badge>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground/70">
          {model.repo}/{model.file}
          {model.mmprojFile ? ` + ${model.mmprojFile}` : ''}
        </p>
        {isDownloading && progress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatBytes(progress.bytesLoaded)} / {formatBytes(progress.bytesTotal)}
              </span>
              <span className="tabular-nums">{formatSpeed(progress.bytesPerSec)}</span>
            </div>
            <Progress value={progress.percent} />
          </div>
        )}
        <Button size="sm" onClick={onDownload} disabled={isDownloading}>
          {isDownloading ? 'Mengunduh…' : 'Unduh'}
        </Button>
      </CardContent>
    </Card>
  )
}
