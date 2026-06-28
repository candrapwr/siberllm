// English translation.

import type { id } from './id'

// Typed against the Indonesian source so missing keys are caught at compile time.
export const en: typeof id = {
  // ---- sidebar / nav ----
  app: {
    name: 'SiberLLM',
    engine: 'engine',
    ready: 'ready',
    notInstalled: 'not installed',
    backend: 'backend'
  },
  nav: {
    setup: 'Setup',
    models: 'Model',
    run: 'Run',
    logs: 'Logs',
    settings: 'Settings',
    lockedHint: 'Install the llama.cpp engine in the Setup tab first'
  },

  // ---- setup ----
  setup: {
    tagline: 'A layer to run llama.cpp as an OpenAI-compatible API server.',
    checkingEngine: 'Checking engine…',
    title: 'llama.cpp engine',
    installed: 'Installed',
    notInstalled: 'Not installed',
    desc: 'SiberLLM will download the llama-server binary from the official ggml-org/llama.cpp releases for your platform.',
    status: 'Status',
    backend: 'Backend',
    path: 'Path',
    notInstalledStatus: 'Not installed',
    gpuBackend: 'GPU backend',
    autoDetect: 'Auto-detect (recommended)',
    metal: 'Metal',
    cpu: 'CPU',
    cuda: 'CUDA (NVIDIA)',
    vulkan: 'Vulkan',
    rocm: 'ROCm (AMD)',
    stages: {
      idle: 'Idle',
      detecting: 'Detecting system…',
      'fetching-release': 'Fetching release info…',
      downloading: 'Downloading binary',
      extracting: 'Extracting',
      finalizing: 'Finalizing',
      done: 'Done',
      error: 'Failed'
    },
    installBtn: 'Install llama.cpp',
    processing: 'Processing…',
    recheck: 'Recheck',
    next: 'Next →',
    openFolder: 'Open folder 📂'
  },

  // ---- models ----
  models: {
    title: 'Model',
    desc: 'Manage local .gguf files or download from HuggingFace.',
    tabLocal: 'Local',
    tabDownload: 'Download',
    detected: '{{count}} .gguf file(s) detected',
    importFile: '+ Import file',
    addFolder: '+ Add folder',
    refresh: 'Refresh',
    copying: 'Copying…',
    picking: 'Picking…',
    sectionModel: 'Model ({{count}})',
    sectionMmproj: 'Projector / mmproj ({{count}})',
    emptyLocal: 'No models yet. Use Import file / Add folder above, or switch to the Download tab.',
    remove: 'Delete',
    local: 'local',
    installPrompt: 'Install the llama.cpp engine first on the Setup page.',
    catalogTitle: 'Popular catalog',
    searchTitle: 'Search HuggingFace',
    searchPlaceholder: 'e.g. qwen2.5 gguf, llama 3.2 vision…',
    search: 'Search',
    searching: 'Searching…',
    searchingFiles: 'Fetching file list & sizes from HuggingFace…',
    downloads: '{{count}} downloads',
    likes: '{{count}} likes',
    viewFiles: 'View files',
    hideFiles: 'Hide',
    loadingFiles: 'Loading…',
    noFiles: 'No .gguf files in this repo (or failed to load).',
    download: 'Download',
    downloading2: 'Downloading…',
    sizeUnknown: 'size ?',
    text: 'text',
    multimodal: 'multimodal',
    mmproj: 'mmproj',
    catalogDownloading: 'Downloading…'
  },

  // ---- run ----
  run: {
    title: 'Run Server',
    desc: 'Start llama-server as an OpenAI-compatible API.',
    config: 'Configuration',
    configDesc: 'Pick a model and server parameters.',
    selectModel: '— select a model —',
    model: 'Model (.gguf)',
    mmproj: 'mmproj (for multimodal models)',
    mmprojHintAuto: 'Auto-suggest: {{name}}',
    mmprojHintNone: 'Leave empty for text-only models.',
    noMmproj: '— none —',
    host: 'Host',
    port: 'Port',
    gpuLayers: 'GPU layers',
    gpuLayersHint: '-1 = offload all to GPU',
    contextSize: 'Context size',
    extraArgs: 'Extra arguments',
    extraArgsHint: 'e.g. --jinja --flash-attn',
    server: 'Server',
    serverDesc: 'Status & endpoint access.',
    start: 'Start',
    starting: 'Starting…',
    stop: 'Stop',
    startingMsg: 'Starting server…',
    startingDesc: 'Loading the model into memory & waiting for the server to be ready. For large models this can take tens of seconds. See progress in the Logs tab.',
    serverReady: 'Server ready at',
    openWebUi: 'Open Web UI ↗',
    openEndpoint: 'Open OpenAI endpoint ↗',
    serverError: 'Server failed. Check the Logs tab for details.',
    selectModelFirst: 'Select a model before starting the server.'
  },

  // ---- logs ----
  logs: {
    title: 'Server Log',
    desc: 'Real-time output from llama-server.',
    clear: 'Clear',
    empty: 'No output yet. Start the server in the Run tab.',
    stopped: 'stopped'
  },

  // ---- settings ----
  settings: {
    title: 'Settings',
    desc: 'Server defaults & engine preferences.',
    engine: 'Engine',
    engineDesc: 'GPU backend used when installing the binary.',
    backend: 'Backend',
    backendHint: 'macOS always uses Metal.',
    detected: 'Detected:',
    defaultServer: 'Default Server',
    defaultServerDesc: 'Initial values when starting a new server.',
    storageLocation: 'Storage Location',
    storageDesc: 'Open the folders where the engine, models, and logs are stored.',
    engineFolder: 'Engine 📂',
    modelFolder: 'Model 📂',
    logFolder: 'Log 📂',
    rootFolder: 'Root 📂',
    extraModelFolders: 'Extra Model Folders',
    extraFoldersDesc: 'Folders (besides the default) scanned for .gguf files.',
    noExtraFolders: 'No extra folders yet.',
    removeFolder: 'Remove',
    about: 'About',
    aboutDesc: 'SiberLLM — by datasiberLab.',
    madeBy: 'Made by:',
    contact: 'Contact:',
    aboutText: 'SiberLLM is a UI layer on top of llama.cpp to run AI models locally & privately.',
    save: 'Save',
    saved: 'Saved ✓'
  },

  // ---- language switcher ----
  lang: {
    label: 'Language',
    id: 'Indonesia',
    en: 'English'
  }
}

export default en
