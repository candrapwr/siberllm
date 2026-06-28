import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card'
import { Field, Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { LOCAL_PROFILE_ID, type SshProfile, type SshProfileInput } from '@shared/types'
import { useProfilesStore } from '../store/profiles'

const DEFAULT_SSH_INPUT: SshProfileInput = {
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  remoteModelsDir: '~/.siberllm/models',
  remoteBinDir: '~/.siberllm/bin'
}

export default function Profiles() {
  const { t } = useTranslation()
  const { profiles, selectedId, testResults, testingId, error, load, select, create, update, remove, test } =
    useProfilesStore()
  const [editing, setEditing] = useState<{ id: string; input: SshProfileInput } | null>(null)
  const [creating, setCreating] = useState<SshProfileInput | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const startCreate = (): void => setCreating({ ...DEFAULT_SSH_INPUT })
  const startEdit = (p: SshProfile): void =>
    setEditing({
      id: p.id,
      input: {
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        password: '', // leave blank = unchanged
        remoteModelsDir: p.remoteModelsDir,
        remoteBinDir: p.remoteBinDir
      }
    })

  const submitCreate = async (): Promise<void> => {
    if (!creating) return
    setSaving(true)
    const ok = await create(creating)
    setSaving(false)
    if (ok) setCreating(null)
  }

  const submitEdit = async (): Promise<void> => {
    if (!editing) return
    setSaving(true)
    // Omit password from patch if left blank (means "keep current").
    const patch: Partial<SshProfileInput> = { ...editing.input }
    if (!patch.password) delete patch.password
    const ok = await update(editing.id, patch)
    setSaving(false)
    if (ok) setEditing(null)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">{t('profiles.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('profiles.desc')}</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('profiles.listTitle')}</CardTitle>
              <CardDescription>{t('profiles.listDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {profiles.map((p) => {
                const isSelected = p.id === selectedId
                const isLocal = p.id === LOCAL_PROFILE_ID
                const ssh = p.kind === 'ssh' ? (p as SshProfile) : null
                const tr = testResults[p.id]
                return (
                  <div
                    key={p.id}
                    className={`flex items-start justify-between rounded-md border p-3 ${
                      isSelected ? 'border-primary/60 bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {isLocal ? (
                          <Badge tone="success">{t('profiles.localProfile')}</Badge>
                        ) : (
                          <Badge tone="info">SSH</Badge>
                        )}
                        {isSelected && <Badge tone="success">{t('profiles.active')}</Badge>}
                      </div>
                      {ssh && (
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {ssh.username}@{ssh.host}:{ssh.port}
                        </p>
                      )}
                      {tr && (
                        <p
                          className={`mt-1 text-xs ${tr.ok ? 'text-emerald-400' : 'text-amber-400'}`}
                        >
                          {tr.ok ? '✓ ' : '✗ '}
                          {tr.message}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!isSelected && (
                        <Button size="sm" variant="ghost" onClick={() => select(p.id)}>
                          {t('profiles.use')}
                        </Button>
                      )}
                      {ssh && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={testingId === p.id}
                            onClick={() => test(p.id)}
                          >
                            {testingId === p.id ? t('profiles.testing') : t('profiles.test')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => startEdit(ssh)}>
                            {t('profiles.edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => remove(p.id)}
                          >
                            {t('profiles.delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {creating || editing ? (
            <Card>
              <CardHeader>
                <CardTitle>{creating ? t('profiles.addSsh') : t('profiles.editSsh')}</CardTitle>
                <CardDescription>{t('profiles.securityNote')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProfileForm
                  value={creating ?? editing!.input}
                  onChange={(patch) => {
                    if (creating) setCreating({ ...creating, ...patch })
                    else setEditing({ id: editing!.id, input: { ...editing!.input, ...patch } })
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button disabled={saving} onClick={() => (creating ? submitCreate() : submitEdit())}>
                    {saving ? t('profiles.saving') : t('profiles.save')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCreating(null)
                      setEditing(null)
                    }}
                  >
                    {t('profiles.cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button onClick={startCreate}>{t('profiles.addSsh')}</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProfileForm({
  value,
  onChange
}: {
  value: SshProfileInput
  onChange: (patch: Partial<SshProfileInput>) => void
}): ReactElement {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Field label={t('profiles.name')}>
        <Input
          value={value.name}
          placeholder="my-server"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label={t('profiles.host')}>
            <Input
              value={value.host}
              placeholder="192.168.1.10"
              onChange={(e) => onChange({ host: e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('profiles.port')}>
          <Input
            type="number"
            value={value.port}
            onChange={(e) => onChange({ port: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label={t('profiles.username')}>
        <Input
          value={value.username}
          placeholder="root"
          onChange={(e) => onChange({ username: e.target.value })}
        />
      </Field>
      <Field label={t('profiles.password')} hint={t('profiles.passwordHint')}>
        <Input
          type="password"
          value={value.password}
          placeholder={t('profiles.passwordPlaceholder')}
          onChange={(e) => onChange({ password: e.target.value })}
        />
      </Field>
      <Field label={t('profiles.remoteModelsDir')}>
        <Input
          value={value.remoteModelsDir}
          onChange={(e) => onChange({ remoteModelsDir: e.target.value })}
        />
      </Field>
      <Field label={t('profiles.remoteBinDir')}>
        <Input
          value={value.remoteBinDir}
          onChange={(e) => onChange({ remoteBinDir: e.target.value })}
        />
      </Field>
    </div>
  )
}
