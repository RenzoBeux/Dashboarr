import { STORAGE_KEYS } from "@/lib/constants";
import { listConfigBackups, WEB_SLOT_ID } from "@/services/backend-api";
import type { BackupMeta } from "@/services/backend-api";
import { useBackendStore } from "@/store/backend-store";
import { deleteKey, getString, setString } from "@/store/storage";

/**
 * Keeps the backend store's view of the "web" slot current (Refs #385).
 *
 * Rules, in order of trust:
 * - A successful list is authoritative: the web slot's revision, or null when
 *   there is none.
 * - A backend that answers 404 or 400 does not have the feature; treat as none.
 * - A network error preserves the last known value.
 * - The applied revision comes from the envelope the phone actually restored
 *   (never from a list or the phone clock) and is cleared on unpair.
 */

const THROTTLE_MS = 5 * 60 * 1000;
let lastCheckedAt = 0;
let inflight: Promise<void> | null = null;

export function noteBackupList(backups: BackupMeta[]): void {
  const web = backups.find((b) => b.deviceId === WEB_SLOT_ID);
  useBackendStore.getState().setWebSlot({ webSlotRevision: web ? web.revision : null });
}

function isUnsupported(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 404 || status === 400;
}

export function checkWebSlot(opts: { force?: boolean } = {}): Promise<void> {
  const state = useBackendStore.getState();
  if (!state.hydrated || !state.url || !state.sharedSecret) return Promise.resolve();
  const now = Date.now();
  if (!opts.force && now - lastCheckedAt < THROTTLE_MS) return Promise.resolve();
  if (inflight) return inflight;
  lastCheckedAt = now;
  inflight = listConfigBackups()
    .then(({ backups }) => noteBackupList(backups))
    .catch((err: unknown) => {
      if (isUnsupported(err)) useBackendStore.getState().setWebSlot({ webSlotRevision: null });
      // Anything else (offline, timeout): keep what we knew.
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** For tests and unpair: forget the throttle window. */
export function resetWebSlotWatch(): void {
  lastCheckedAt = 0;
}

export function markWebSlotApplied(revision: number): void {
  setString(STORAGE_KEYS.backendWebSlotAppliedRevision, String(revision));
  useBackendStore.getState().setWebSlot({ webSlotAppliedRevision: revision });
}

export function clearWebSlotApplied(): void {
  deleteKey(STORAGE_KEYS.backendWebSlotAppliedRevision);
  useBackendStore.getState().setWebSlot({ webSlotAppliedRevision: null });
}

/** Restore the persisted applied revision after both stores hydrated. */
export function loadWebSlotStatus(): void {
  const raw = getString(STORAGE_KEYS.backendWebSlotAppliedRevision);
  const n = raw ? Number(raw) : NaN;
  useBackendStore.getState().setWebSlot({ webSlotAppliedRevision: Number.isFinite(n) ? n : null });
}
