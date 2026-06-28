// App-wide constants: API endpoints, repo identifiers, curated model catalog.

export const LLAMA_CPP_REPO = 'ggml-org/llama.cpp'
export const GITHUB_API = 'https://api.github.com'

export const HUGGINGFACE_API = 'https://huggingface.co/api'
export const HUGGINGFACE_RESOLVE = 'https://huggingface.co'

// Hosts allowed for JSON metadata API calls (read-only lookups).
export const ALLOWED_API_HOSTS = new Set([
  'api.github.com',
  'huggingface.co'
])

// Hosts allowed for actual file downloads (binaries & model weights).
// GitHub release assets redirect github.com -> release-assets.githubusercontent.com.
export const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'cdn-lfs-eu-1.huggingface.co'
])

/** Guard an API metadata URL. Throws if host isn't whitelisted. */
export function assertApiHost(url: string): void {
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  if (!ALLOWED_API_HOSTS.has(host)) {
    throw new Error(`Refusing API call to untrusted host: ${host}`)
  }
}

/** Guard a file-download URL. Throws if host isn't whitelisted. */
export function assertDownloadHost(url: string): void {
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  if (!ALLOWED_DOWNLOAD_HOSTS.has(host)) {
    throw new Error(`Refusing download from untrusted host: ${host}`)
  }
}

// Default llama-server run params.
export const DEFAULT_RUN = {
  host: '127.0.0.1',
  port: 8080,
  contextSize: 8192,
  gpuLayers: -1, // -1 = offload everything to GPU when supported
  extraArgs: '--jinja'
} as const

// A small curated catalog of popular GGUF models on HuggingFace.
// `mmprojFile` is set for multimodal models; the app pairs them automatically.
export interface CatalogModel {
  id: string
  name: string
  repo: string
  file: string
  mmprojFile?: string
  multimodal: boolean
  sizeLabel: string
  description: string
  tags: string[]
}

// Curated catalog of popular GGUF models on HuggingFace.
// IMPORTANT: each `file`/`mmprojFile` was verified to resolve (HTTP 302) and is
// a single-file download (no multi-part splits) so users get a working model.
// Re-verify with: curl -s -o /dev/null -w "%{http_code}" \
//   "https://huggingface.co/<repo>/resolve/main/<file>"
export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: 'qwen2.5-3b-instruct-q5',
    name: 'Qwen2.5 3B Instruct (Q5_K_M)',
    repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    file: 'qwen2.5-3b-instruct-q5_k_m.gguf',
    multimodal: false,
    sizeLabel: '~2.5 GB',
    description: 'Compact & fast; runs well even on CPU. Great starter model.',
    tags: ['text', 'chat', 'multilingual', 'lightweight']
  },
  {
    id: 'qwen2.5-1.5b-instruct-q5',
    name: 'Qwen2.5 1.5B Instruct (Q5_K_M)',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    file: 'qwen2.5-1.5b-instruct-q5_k_m.gguf',
    multimodal: false,
    sizeLabel: '~1.2 GB',
    description: 'Very small model — runs on almost any machine.',
    tags: ['text', 'chat', 'lightweight']
  },
  {
    id: 'phi-3.5-mini-instruct-q5',
    name: 'Phi-3.5 mini Instruct (Q5_K_M)',
    repo: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    file: 'Phi-3.5-mini-instruct-Q5_K_M.gguf',
    multimodal: false,
    sizeLabel: '~2.5 GB',
    description: 'Microsoft Phi-3.5 — strong reasoning for its size.',
    tags: ['text', 'chat', 'reasoning']
  },
  {
    id: 'llama-3.2-1b-instruct-q8',
    name: 'Llama 3.2 1B Instruct (Q8_0)',
    repo: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    file: 'Llama-3.2-1B-Instruct-Q8_0.gguf',
    multimodal: false,
    sizeLabel: '~1.3 GB',
    description: 'Meta Llama 3.2 — tiny, fast, good for edge devices.',
    tags: ['text', 'chat', 'lightweight']
  },
  {
    id: 'llama-3.2-3b-instruct-q5',
    name: 'Llama 3.2 3B Instruct (Q5_K_M)',
    repo: 'unsloth/Llama-3.2-3B-Instruct-GGUF',
    file: 'Llama-3.2-3B-Instruct-Q5_K_M.gguf',
    multimodal: false,
    sizeLabel: '~2.5 GB',
    description: 'Meta Llama 3.2 — balanced chat model.',
    tags: ['text', 'chat']
  },
  {
    id: 'qwen2-vl-2b-instruct-q5',
    name: 'Qwen2-VL 2B Instruct (Q5_K_M)',
    repo: 'bartowski/Qwen2-VL-2B-Instruct-GGUF',
    file: 'Qwen2-VL-2B-Instruct-Q5_K_M.gguf',
    mmprojFile: 'mmproj-Qwen2-VL-2B-Instruct-f16.gguf',
    multimodal: true,
    sizeLabel: '~2.5 GB',
    description: 'Small multimodal vision model — understands text + images.',
    tags: ['multimodal', 'vision', 'lightweight']
  }
]
