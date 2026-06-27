# Development

Technical docs for contributors working on SiberLLM.

---

## Stack

| Part | Technology |
|---|---|
| Desktop shell | Electron 33 + electron-vite |
| Packaging | Electron Forge (`.dmg`, Squirrel `.exe`, `.deb`/`.rpm`, zip) |
| Renderer UI | React 19 + Vite |
| Styling | Tailwind CSS (dark theme, shadcn-style components) |
| State | Zustand + typed IPC bridge |
| Persistence | electron-store |
| Language | TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`) |

---

## Prerequisites

- Node.js 20+ (developed on Node 24)
- npm 10+

---

## Getting started

```bash
npm install
npm run dev        # electron-vite dev (hot-reload renderer)
```

This launches the Electron app with the renderer served from the Vite dev server.

### Other scripts

```bash
npm run typecheck  # typecheck main + renderer (strict)
npm run build      # build main + preload + renderer into dist/
npm run package    # package the app (no installers) → out/
npm run make       # produce all platform installers (.dmg/.exe/.deb/.rpm) → out/make
npm run make:dmg   # build only the macOS .dmg
npm run publish    # build + publish a draft release to GitHub (needs GITHUB_TOKEN)
```

### Building a release

Use the helper script for version-bump + publish in one go:

```bash
# Build artifacts locally (no publish)
./scripts/release.sh

# Bump version, tag, and publish a draft GitHub release
./scripts/release.sh 0.2.0
# with an explicit token:
GITHUB_TOKEN=ghp_xxx ./scripts/release.sh 0.2.0
```

The script:
1. Pre-flight checks (clean tree, on `main`, token present).
2. Bumps `package.json` version, commits, and tags `v<version>`.
3. Runs `electron-forge publish` → uploads artifacts to a **draft** GitHub release
   at `github.com/datasiberLab/siberllm` with auto-generated release notes.
4. You review & publish the draft manually on GitHub.

Required for publish: a GitHub classic PAT with `repo` scope, exported as
`GITHUB_TOKEN` (or `GH_TOKEN`). `gh auth login` also works.

---

## Architecture

Three Electron layers plus a shared module:

```
src/
├─ shared/          # Shared by main + preload + renderer (+ future CLI)
│  ├─ types.ts          # Config, Model, InstallState, ServerState types
│  ├─ platforms.ts      # Platform/backend detection + release-asset mapping
│  ├─ constants.ts      # API endpoints, curated model catalog
│  └─ ipc-channels.ts   # Centralised IPC channel name registry
│
├─ main/            # Electron main process (core logic, no UI)
│  ├─ index.ts          # Entry: creates window, registers IPC
│  ├─ store.ts          # electron-store settings wrapper
│  ├─ ipc/              # Handlers grouped by domain:
│  │  ├─ install.ipc.ts     #   detect / download / install engine
│  │  ├─ models.ipc.ts      #   scan / download / delete models
│  │  ├─ server.ipc.ts      #   start / stop / status server
│  │  └─ settings.ipc.ts    #   get / set settings + openExternal
│  └─ services/
│     ├─ paths.ts           # App data directories
│     ├─ backend-detect.ts  # Auto-detect GPU backend (Metal/CUDA/Vulkan/CPU)
│     ├─ llama-detect.ts    # Check binary installed + read --version
│     ├─ llama-download.ts  # Download + unzip prebuilt (progress via callback)
│     ├─ model-manager.ts   # Scan local .gguf + download from HuggingFace
│     └─ server-manager.ts  # Spawn & supervise llama-server
│
├─ preload/index.ts  # contextBridge → exposes typed window.siberllm
│
└─ renderer/         # React UI
   └─ src/
      ├─ App.tsx, main.tsx     # Layout + HashRouter
      ├─ lib/                  # api.ts (typed wrapper), format.ts, utils.ts
      ├─ store/                # Zustand stores: install, models, server
      ├─ components/ui/        # Button, Card, Input, Progress, Badge
      └─ pages/                # Setup, Models, Run, Logs, Settings
```

### Data flow

```
Renderer (React)  ──window.siberllm.*──▶  Preload (contextBridge)
                                              │  ipcRenderer.invoke / on
                                              ▼
                                         Main process
                                              │  services/*
                                              ▼
                                   llama-server / filesystem / network
```

- The renderer never touches Node directly. Every capability is exposed through
  the preload bridge as a typed method on `window.siberllm`.
- Long-running operations (download, server logs) push progress back to the
  renderer via `webContents.send`, received through `onX` subscriptions.

---

## App data directories

Resolved under Electron's `userData` path:

```
<userData>/siberllm/
├─ bin/         # llama-server + shared libraries
├─ models/      # *.gguf + mmproj files
├─ logs/        # server.log
└─ config.json  # settings (via electron-store)
```

See `src/main/services/paths.ts`. The `paths.root()` helper guards for `app`
being undefined so the same services can be reused by a future CLI.

---

## How the engine install works

1. `backend-detect.ts` picks a backend:
   - macOS → **Metal** (macOS releases are Metal-enabled by default).
   - Windows/Linux → `nvidia-smi` ⇒ **CUDA**; AMD GPU ⇒ **Vulkan**; else **CPU**.
2. `llama-download.ts` fetches the latest release from
   `https://api.github.com/repos/ggml-org/llama.cpp/releases/latest` and matches
   the right asset by keyword (see mapping below).
3. Downloads to a temp file with byte-level progress, extracts via system
   `unzip` (unix) or PowerShell `Expand-Archive` (Windows), `chmod +x` on unix,
   and persists the detected platform to settings.
4. Optional companion asset (e.g. `cudart-...` for Windows CUDA) is downloaded
   and extracted into the same `bin/` folder.

### Release asset name mapping

Centralised in `src/shared/platforms.ts` so it's easy to update if llama.cpp
changes its naming convention:

| Platform / Backend | Asset keyword |
|---|---|
| macOS arm64 | `bin-macos-arm64` |
| macOS x64 | `bin-macos-x64` |
| Windows CPU | `bin-win-cpu-x64` |
| Windows CUDA 12.4 | `bin-win-cuda-12.4-x64` (+ `cudart-llama-bin-win-cuda-12.4-x64`) |
| Windows Vulkan | `bin-win-vulkan-x64` |
| Linux CPU | `bin-linux-cpu-x64` |
| Linux CUDA | `bin-linux-cuda-12.4-x64` |

---

## How the server manager works

`server-manager.ts` spawns `llama-server` with args built from the user's config:

```
-m <model.gguf>
--mmproj <mmproj.gguf>      # only for multimodal
--host <host> --port <port>
--ctx-size <n>
--n-gpu-layers <n>          # -1 = offload all layers to GPU
<extraArgs>                 # e.g. --jinja --flash-attn
```

- stdout/stderr are line-buffered and forwarded to the renderer via the
  `server:log` IPC channel, and also appended to `logs/server.log`.
- Readiness is detected by polling `GET /health` every 800ms (timeout 60s).
- `stop()` uses `tree-kill` (SIGTERM, escalating to SIGKILL) to cleanly tear down
  the process and any children.

---

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, preload runs in sandboxed bridge.
- CSP restricts the renderer to `'self'` and connections only to `127.0.0.1`/`localhost`.
- Downloads are limited to a host whitelist (`github.com`, `huggingface.co`,
  their CDN hosts) — see `src/shared/constants.ts`.
- `openExternal` only accepts `http:` / `https:` URLs.

---

## TypeScript

Two tsconfig projects, both strict:

- `tsconfig.node.json` — main, preload, shared.
- `tsconfig.web.json` — renderer, shared.

Path alias `@shared/*` is configured in both (and in `electron.vite.config.ts`
via Vite `resolve.alias`). Renderer also has `@/*` → `src/renderer/src/*`.

---

## Roadmap

- [ ] **CLI** (`src/cli/`) reusing `src/main/services/*` via Commander — run models
      without the GUI. The services are already written platform-agnostically;
      only `paths.ts` depends on Electron's `app.getPath` (and guards for its
      absence).
- [ ] Multi-server: run several models in parallel on different ports.
- [ ] Engine auto-update when a new llama.cpp release is available.
- [ ] Configuration export/import.

---

## License

MIT.
