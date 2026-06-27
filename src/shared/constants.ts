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

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: 'qwen2.5-7b-instruct-q5',
    name: 'Qwen2.5 7B Instruct (Q5_K_M)',
    repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    file: 'qwen2.5-7b-instruct-q5_k_m.gguf',
    multimodal: false,
    sizeLabel: '~5.5 GB',
    description: 'Strong general-purpose small model, great instruction following.',
    tags: ['text', 'chat', 'multilingual']
  },
  {
    id: 'qwen2.5-3b-instruct-q5',
    name: 'Qwen2.5 3B Instruct (Q5_K_M)',
    repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    file: 'qwen2.5-3b-instruct-q5_k_m.gguf',
    multimodal: false,
    sizeLabel: '~2.5 GB',
    description: 'Compact and fast; runs well on CPU.',
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
    id: 'gemma-2-9b-it-q5',
    name: 'Gemma 2 9B IT (Q5_K_M)',
    repo: 'unsloth/gemma-2-9b-it-GGUF',
    file: 'gemma-2-9b-it-Q5_K_M.gguf',
    multimodal: false,
    sizeLabel: '~7 GB',
    description: 'Google Gemma 2, high quality reasoning.',
    tags: ['text', 'chat', 'reasoning']
  },
  {
    id: 'llama-3.2-11b-vision-instruct-q5',
    name: 'Llama 3.2 11B Vision Instruct (Q5_K_M)',
    repo: 'unsloth/Llama-3.2-11B-Vision-Instruct-GGUF',
    file: 'Llama-3.2-11B-Vision-Instruct-Q5_K_M.gguf',
    mmprojFile: 'mmproj-llama-3.2-11b-vision-instruct-f16.gguf',
    multimodal: true,
    sizeLabel: '~9 GB',
    description: 'Multimodal: text + image understanding.',
    tags: ['multimodal', 'vision', 'chat']
  },
  {
    id: 'moondream2',
    name: 'Moondream2 (vision)',
    repo: 'vicentealejandroalmendros/moondream2-gguf',
    file: 'moondream2-text-model-f16.gguf',
    mmprojFile: 'mmproj-moondream2-f16.gguf',
    multimodal: true,
    sizeLabel: '~3.7 GB',
    description: 'Tiny multimodal vision model — great for edge devices.',
    tags: ['multimodal', 'vision', 'lightweight']
  },
  {
    id: 'minicpm-v-2.6-q5',
    name: 'MiniCPM-V 2.6 (Q5_K_M)',
    repo: 'openbmb/MiniCPM-V-2_6-gguf',
    file: 'MiniCPM-V-2_6-Q5_K_M.gguf',
    mmprojFile: 'mmproj-model-f16.gguf',
    multimodal: true,
    sizeLabel: '~5.4 GB',
    description: 'Strong open multimodal model with OCR capability.',
    tags: ['multimodal', 'vision', 'ocr']
  }
]
