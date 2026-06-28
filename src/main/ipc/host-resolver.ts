// Resolve a (HostTarget, AsyncPathResolver) pair for a given profile id.
//
// The local profile maps to the singleton localTarget + the local path tree.
// An SSH profile maps to a cached SshTarget (one per profile id) + an SSH path
// resolver. SSH connections are expensive to open, so they are cached for the
// lifetime of the profile and disposed when the profile is removed/edited or
// the app quits.

import { LOCAL_PROFILE_ID, type Profile, type SshProfile } from '@shared/types'
import { localTarget } from '../services/host/local-target'
import { SshTarget } from '../services/host/ssh-target'
import { resolvePaths, type AsyncPathResolver } from '../services/host/paths-resolver'
import type { HostTarget } from '../services/host/types'
import { getProfile } from '../store'
import { LOCAL_PROFILE } from '@shared/profiles'

const sshTargets = new Map<string, SshTarget>()

/** Get-or-create the cached SshTarget for a profile id. */
function getSshTarget(profile: SshProfile): SshTarget {
  let t = sshTargets.get(profile.id)
  if (!t) {
    t = new SshTarget(profile)
    sshTargets.set(profile.id, t)
  }
  return t
}

/** Drop a cached SSH target (used when a profile is edited/removed). */
export async function invalidateSshTarget(profileId: string): Promise<void> {
  if (profileId === LOCAL_PROFILE_ID) return
  const t = sshTargets.get(profileId)
  if (t) {
    sshTargets.delete(profileId)
    try {
      await t.dispose()
    } catch {
      /* ignore */
    }
  }
}

/** Dispose all cached SSH targets (called on app quit). */
export async function disposeAllSshTargets(): Promise<void> {
  const all = Array.from(sshTargets.values())
  sshTargets.clear()
  await Promise.all(all.map((t) => t.dispose().catch(() => {})))
}

export interface ResolvedHost {
  target: HostTarget
  paths: AsyncPathResolver
  profile: Profile
}

/**
 * Resolve the host + paths + profile for a profile id. Defaults to local when
 * the id is missing, unknown, or the Local profile.
 */
export async function resolveHost(profileId?: string): Promise<ResolvedHost> {
  if (!profileId || profileId === LOCAL_PROFILE_ID) {
    return { target: localTarget, paths: resolvePaths(localTarget), profile: LOCAL_PROFILE }
  }
  const profile = await getProfile(profileId)
  if (!profile) {
    // Unknown id — fall back to local rather than throwing, so the UI keeps
    // working after a stale selection.
    return { target: localTarget, paths: resolvePaths(localTarget), profile: LOCAL_PROFILE }
  }
  if (profile.kind !== 'ssh') {
    return { target: localTarget, paths: resolvePaths(localTarget), profile: LOCAL_PROFILE }
  }
  const target = getSshTarget(profile)
  const paths = resolvePaths(target, profile)
  return { target, paths, profile }
}

/**
 * Probe an SSH profile: open a fresh (uncached) connection, run a trivial
 * command, and report success/failure. Always disposes the probe connection.
 */
export async function testSshProfile(profileId: string): Promise<{ ok: boolean; message: string }> {
  if (profileId === LOCAL_PROFILE_ID) {
    return { ok: true, message: 'Local profile is always reachable.' }
  }
  const profile = await getProfile(profileId)
  if (!profile || profile.kind !== 'ssh') {
    return { ok: false, message: 'Profile not found.' }
  }
  const probe = new SshTarget(profile)
  try {
    await probe.connect()
    const r = await probe.exec('echo', ['siberllm-ok'])
    if (r.code === 0 && r.stdout.includes('siberllm-ok')) {
      return { ok: true, message: `Connected to ${profile.username}@${profile.host}.` }
    }
    return { ok: false, message: `Unexpected response (exit ${r.code}).` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    await probe.dispose()
  }
}
