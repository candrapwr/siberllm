// Profile-aware helpers shared between main and renderer.
//
// The server's `host` config field is the bind interface ON the target machine:
//   - Local profile: 127.0.0.1 (only the local machine can reach it)
//   - SSH profile:   0.0.0.0   (must bind all interfaces so the app/user on
//                               another machine can connect to remote:port)
//
// The URL the user actually opens in a browser differs accordingly.

import { LOCAL_PROFILE_ID, LOCAL_PROFILE, type Profile, type SshProfile } from './types'

export type { Profile, SshProfile }

/** The recommended bind host for a fresh server config on this profile. */
export function defaultBindHost(profile: Profile): string {
  return profile.kind === 'ssh' ? '0.0.0.0' : '127.0.0.1'
}

/** True if the profile is anything but the built-in Local profile. */
export function isRemoteProfile(profile: Profile): profile is SshProfile {
  return profile.kind === 'ssh'
}

/**
 * The URL a user (or the app) should hit to reach the server for this profile.
 * - Local: http://127.0.0.1:<port>
 * - SSH:   http://<profile.host>:<port>   (direct connect to the remote box)
 */
export function getAccessUrl(profile: Profile, port: number): string {
  if (profile.kind === 'ssh') {
    return `http://${profile.host}:${port}`
  }
  return `http://127.0.0.1:${port}`
}

export { LOCAL_PROFILE_ID, LOCAL_PROFILE }
