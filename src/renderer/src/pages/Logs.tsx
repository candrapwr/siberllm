import { useEffect, useRef } from 'react'
import { useServerStore } from '../store/server'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { formatTime } from '../lib/format'

export default function Logs() {
  const { logs, state, clearLogs } = useServerStore()
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [logs])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Log Server</h2>
          <p className="text-xs text-muted-foreground">Output real-time dari llama-server.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={state?.status === 'running' ? 'success' : 'default'}>
            {state?.status ?? 'stopped'}
          </Badge>
          <Button size="sm" variant="outline" onClick={clearLogs}>
            Bersihkan
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-[#0a0e16] p-4 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-muted-foreground/60">
            Belum ada output. Jalankan server di tab Run.
          </p>
        ) : (
          logs.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground/50">{formatTime(l.ts)}</span>
              <span
                className={
                  l.stream === 'stderr' ? 'text-amber-400/90' : 'text-emerald-300/90'
                }
              >
                {l.line}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
