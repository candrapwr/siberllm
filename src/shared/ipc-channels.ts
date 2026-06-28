// IPC channel name registry. Centralised so main, preload, and renderer never drift.

export const IPC = {
  // ---- llama.cpp binary install lifecycle ----
  INSTALL_CHECK: 'install:check',
  INSTALL_START: 'install:start',
  INSTALL_PROGRESS: 'install:progress',
  INSTALL_DONE: 'install:done',
  INSTALL_ERROR: 'install:error',

  // ---- models ----
  MODELS_SCAN: 'models:scan',
  MODELS_DOWNLOAD_START: 'models:download:start',
  MODELS_DOWNLOAD_PROGRESS: 'models:download:progress',
  MODELS_DOWNLOAD_DONE: 'models:download:done',
  MODELS_DOWNLOAD_ERROR: 'models:download:error',
  MODELS_CANCEL_DOWNLOAD: 'models:download:cancel',
  MODELS_DELETE: 'models:delete',
  MODELS_ADD_FOLDER: 'models:addFolder',
  MODELS_IMPORT_FILES: 'models:importFiles',
  MODELS_PICK_FOLDER: 'models:pickFolder',
  MODELS_CATALOG: 'models:catalog',
  MODELS_SEARCH_HF: 'models:searchHf',
  MODELS_LIST_REPO: 'models:listRepo',

  // ---- server (llama-server) lifecycle ----
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_STATUS: 'server:status',
  SERVER_PROBE: 'server:probe',
  SERVER_LOG: 'server:log',
  SERVER_READY: 'server:ready',
  SERVER_ERROR: 'server:error',

  // ---- settings ----
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // ---- profiles (target machines: local or SSH remote) ----
  PROFILES_LIST: 'profiles:list',
  PROFILES_CREATE: 'profiles:create',
  PROFILES_UPDATE: 'profiles:update',
  PROFILES_DELETE: 'profiles:delete',
  PROFILES_SELECT: 'profiles:select',
  PROFILES_TEST: 'profiles:test',

  // ---- shell ----
  OPEN_EXTERNAL: 'shell:openExternal',
  OPEN_PATH: 'shell:openPath'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
