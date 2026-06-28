import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '../store/profiles'
import { cn } from '../lib/utils'

/**
 * Compact profile picker shown in the sidebar header. Lets the user switch
 * the active target machine (Local or an SSH remote) and jump to profile
 * management.
 */
export function ProfileSelector() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profiles, selectedId, load, select } = useProfilesStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void load()
  }, [load])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0]
  if (!selected) return null

  const summary =
    selected.kind === 'local' ? t('profiles.localProfile') : `${selected.username}@${selected.host}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('profiles.switchTitle')}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left transition-colors',
          open ? 'bg-secondary' : 'hover:bg-secondary/60'
        )}
      >
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            selected.kind === 'local' ? 'bg-emerald-400' : 'bg-sky-400'
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{selected.name}</span>
          <span className="hidden truncate text-[10px] text-muted-foreground lg:block">
            {summary}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 w-64 max-w-[80vw] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                void select(p.id)
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors',
                p.id === selectedId
                  ? 'bg-primary/15 text-primary'
                  : 'hover:bg-secondary'
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  p.kind === 'local' ? 'bg-emerald-400' : 'bg-sky-400'
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="hidden truncate text-[10px] text-muted-foreground lg:block">
                  {p.kind === 'local'
                    ? t('profiles.localProfile')
                    : `${p.username}@${p.host}`}
                </span>
              </span>
              {p.id === selectedId && <span className="text-[10px]">✓</span>}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false)
              navigate('/profiles')
            }}
            className="flex w-full items-center gap-2 border-t border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary"
          >
            <span className="w-2" />
            {t('profiles.manage')}
          </button>
        </div>
      )}
    </div>
  )
}
