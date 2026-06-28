// IPC handlers for target-machine profiles (Local + SSH remotes).

import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/ipc-channels'
import type { Profile, ProfileTestResult, SshProfile, SshProfileInput } from '@shared/types'
import {
  addProfile,
  deleteProfile,
  getProfiles,
  getSelectedProfileId,
  setSelectedProfileId,
  updateProfile
} from '../store'
import { obfuscatePassword } from '../services/crypto'
import { invalidateSshTarget, testSshProfile } from './host-resolver'

function toSshProfile(input: SshProfileInput, id: string): SshProfile {
  return {
    id,
    name: input.name.trim() || `${input.username}@${input.host}`,
    kind: 'ssh',
    host: input.host.trim(),
    port: input.port,
    username: input.username.trim(),
    authMethod: 'password',
    passwordEnc: obfuscatePassword(input.password ?? ''),
    remoteModelsDir: input.remoteModelsDir.trim(),
    remoteBinDir: input.remoteBinDir.trim()
  }
}

export function registerProfilesIpc(): void {
  ipcMain.handle(IPC.PROFILES_LIST, async (): Promise<{ profiles: Profile[]; selectedId: string }> => {
    const [profiles, selectedId] = await Promise.all([getProfiles(), getSelectedProfileId()])
    return { profiles, selectedId }
  })

  ipcMain.handle(IPC.PROFILES_CREATE, async (_evt, input: SshProfileInput): Promise<Profile[]> => {
    if (!input?.host?.trim() || !input?.username?.trim()) {
      throw new Error('Host and username are required.')
    }
    const profile = toSshProfile(input, randomUUID())
    return addProfile(profile)
  })

  ipcMain.handle(
    IPC.PROFILES_UPDATE,
    async (
      _evt,
      id: string,
      patch: Partial<SshProfileInput>
    ): Promise<Profile[]> => {
      // Renderer sends plaintext password (if changed) in `password` field.
      const storePatch: Partial<SshProfile> = {}
      if (patch.name != null) storePatch.name = patch.name.trim()
      if (patch.host != null) storePatch.host = patch.host.trim()
      if (patch.port != null) storePatch.port = patch.port
      if (patch.username != null) storePatch.username = patch.username.trim()
      if (patch.remoteModelsDir != null) storePatch.remoteModelsDir = patch.remoteModelsDir.trim()
      if (patch.remoteBinDir != null) storePatch.remoteBinDir = patch.remoteBinDir.trim()
      // Plaintext password arrives in `password`; the store obfuscates it. We
      // forward it via the `passwordEnc` field which store.updateProfile knows
      // to obfuscate.
      if (patch.password != null) storePatch.passwordEnc = patch.password
      const updated = await updateProfile(id, storePatch)
      // Connection details may have changed; drop the cached SSH target so the
      // next operation reconnects with fresh credentials/host.
      await invalidateSshTarget(id)
      return updated
    }
  )

  ipcMain.handle(IPC.PROFILES_DELETE, async (_evt, id: string): Promise<Profile[]> => {
    const deleted = await deleteProfile(id)
    await invalidateSshTarget(id)
    return deleted
  })

  ipcMain.handle(IPC.PROFILES_SELECT, async (_evt, id: string): Promise<string> => {
    const profiles = await getProfiles()
    if (!profiles.some((p) => p.id === id)) {
      throw new Error(`Profile not found: ${id}`)
    }
    return setSelectedProfileId(id)
  })

  ipcMain.handle(
    IPC.PROFILES_TEST,
    async (_evt, id: string): Promise<ProfileTestResult> => testSshProfile(id)
  )
}
