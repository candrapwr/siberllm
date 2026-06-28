// Lightweight, reversible obfuscation for secrets that must be persisted in
// config.json. This is NOT cryptography — it only prevents the secret from
// sitting in plaintext on disk. A determined attacker with read access to the
// file (or to this source) can trivially reverse it.
//
// We derive a key from the app's userData path so the obfuscated blob is not
// portable to another machine/install (a small additional deterrence). For
// real secret storage, the roadmap calls for OS keychain via `keytar`.

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// We can't always reach electron `app` (e.g. during tests / future CLI), so the
// key seed is passed in by the caller. store.ts seeds it from the userData path.
let KEY_SEED = 'siberllm-default-seed'

export function setCryptoSeed(seed: string): void {
  KEY_SEED = seed
}

function key(): Buffer {
  // 32 bytes for aes-256
  return createHash('sha256').update(KEY_SEED).digest()
}

const ALGO = 'aes-256-cbc'

/** Obfuscate a plaintext secret into a portable string. Empty input → empty output. */
export function obfuscatePassword(plain: string): string {
  if (!plain) return ''
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGO, key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  // Format: v1.<iv>.<enc>  (base64url-ish using standard base64)
  return `v1.${iv.toString('base64')}.${enc.toString('base64')}`
}

/** Reverse obfuscate. Returns '' for empty/unreadable input (never throws). */
export function deobfuscatePassword(enc: string): string {
  if (!enc) return ''
  try {
    const parts = enc.split('.')
    if (parts.length !== 3 || parts[0] !== 'v1') return ''
    const iv = Buffer.from(parts[1], 'base64')
    const data = Buffer.from(parts[2], 'base64')
    const decipher = createDecipheriv(ALGO, key(), iv)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
