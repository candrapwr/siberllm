import { useEffect } from 'react'
import type { ReactElement } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useInstallStore } from './store/install'
import logo from './assets/logo.png'
import Setup from './pages/Setup'
import Models from './pages/Models'
import Run from './pages/Run'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import { cn } from './lib/utils'

// Routes always accessible regardless of engine install state.
const OPEN_ROUTES = new Set(['/setup', '/settings'])

const NAV = [
  { to: '/setup', label: 'Setup', icon: '⚙' },
  { to: '/models', label: 'Model', icon: '◇' },
  { to: '/run', label: 'Run', icon: '▶' },
  { to: '/logs', label: 'Logs', icon: '≡' },
  { to: '/settings', label: 'Settings', icon: '✦' }
]

export default function App() {
  const { status, refresh } = useInstallStore()

  useEffect(() => {
    void refresh()
  }, [refresh])

  const installed = status?.installed ?? false

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-16 flex-col items-center gap-2 border-r border-border py-4 lg:w-56 lg:items-stretch lg:px-3">
        <div className="mb-4 flex items-center gap-2 px-2 lg:px-0">
          <img
            src={logo}
            alt="SiberLLM"
            className="h-9 w-9 rounded-lg shadow-sm"
          />
          <span className="hidden text-sm font-semibold lg:inline">SiberLLM</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => {
            // A route is gated (locked) when it needs the engine but the
            // engine is not installed yet. Setup & Settings stay open.
            const locked = !OPEN_ROUTES.has(n.to) && !installed
            return (
              <NavItem key={n.to} item={n} locked={locked} />
            )
          })}
        </nav>

        <div className="hidden border-t border-border px-3 pt-3 text-[11px] text-muted-foreground lg:block">
          {status && (
            <div className="mb-3">
              <p>
                engine:{' '}
                <span className={installed ? 'text-emerald-400' : 'text-amber-400'}>
                  {installed ? 'ready' : 'not installed'}
                </span>
              </p>
              <p>backend: {status.backend ?? 'auto'}</p>
              {status.version && <p>v{status.version}</p>}
            </div>
          )}
          <p className="font-medium text-foreground/80">© datasiberLab</p>
          <p className="text-muted-foreground/70">candrapwr@datasiber.com</p>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/setup" replace />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/settings" element={<Settings />} />
          {/* Engine-required routes are guarded: redirected to /setup
              until llama.cpp is installed. */}
          <Route
            path="/models"
            element={installed ? <Models /> : <GuardRedirect to="/setup" />}
          />
          <Route
            path="/run"
            element={installed ? <Run /> : <GuardRedirect to="/setup" />}
          />
          <Route
            path="/logs"
            element={installed ? <Logs /> : <GuardRedirect to="/setup" />}
          />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function NavItem({
  item,
  locked
}: {
  item: { to: string; label: string; icon: string }
  locked: boolean
}) {
  // Locked items render as a non-navigating element so they can't be clicked,
  // tabbed-to, or otherwise activated. Unlocked items are real NavLinks.
  if (locked) {
    return (
      <span
        aria-disabled
        title="Pasang engine llama.cpp di tab Setup dulu"
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/40"
      >
        <span className="w-4 text-center text-base">{item.icon}</span>
        <span className="hidden lg:inline">{item.label}</span>
        <span className="ml-auto hidden text-xs lg:inline">🔒</span>
      </span>
    )
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )
      }
    >
      <span className="w-4 text-center text-base">{item.icon}</span>
      <span className="hidden lg:inline">{item.label}</span>
    </NavLink>
  )
}

/** Small redirect helper used by the engine-gated routes. */
function GuardRedirect({ to }: { to: string }): ReactElement {
  const location = useLocation()
  return <Navigate to={to} replace state={{ from: location }} />
}
