/** Sync status for screens: small, so the live gate can show it without loading the sync. */
import { create } from 'zustand'

export interface SyncStatus {
  /** Writes waiting on this device. */
  pending: number
  syncing: boolean
  /** The last sync could not reach the server. */
  offline: boolean
  /**
   * The waiting writes are not safely kept on this device: the queue could not be saved, or the
   * saved queue could not be read. Separate from `offline`, so "saved on this device" is never
   * claimed when it is not true.
   */
  unsaved: boolean
  lastSyncedAt: number | null
  /** The last refusal or error, in words for the person. */
  problem: string | null
}

export const useSyncStatus = create<SyncStatus>(() => ({
  pending: 0,
  syncing: false,
  offline: false,
  unsaved: false,
  lastSyncedAt: null,
  problem: null,
}))
