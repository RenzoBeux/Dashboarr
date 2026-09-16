import { AppState } from "react-native";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/ciphers/utils.js";
import { NATIVE_VERSION } from "@/lib/app-version";
import { encryptJsonStringWithKey } from "@/lib/config-crypto";
import { STORAGE_KEYS } from "@/lib/constants";
import { putConfigBackup } from "@/services/backend-api";
import { useBackendStore } from "@/store/backend-store";
import { buildExportPayload, useConfigStore } from "@/store/config-store";
import type { ExportPayload } from "@/store/config-store";
import { deleteKey, getString, setString } from "@/store/storage";

/**
 * Continuous encrypted config backup to the paired backend (Refs #385).
 *
 * Uploads the same envelope the file export produces, encrypted with the key
 * derived once when the user turned the feature on (store/backend-store.ts),
 * so an upload costs one AES pass, not a PBKDF2 run. The backend keeps one
 * slot per device and never sees the passphrase.
 *
 * Skips: demo mode (the store holds fake instances that would overwrite the
 * real backup), stores not hydrated, feature off, and unchanged payloads
 * (hash of everything but `exportedAt`).
 */

const DEBOUNCE_MS = 15_000;

export interface BackupPlaintext {
  json: string;
  hash: string;
  configVersion: number;
  exportedAt: number;
}

/**
 * The payload to encrypt. `backend` is stripped on purpose: a phone restoring
 * this must keep its own pairing, and the uploader's bearer must never travel
 * to another device even inside ciphertext.
 */
export function buildBackupPlaintext(): BackupPlaintext {
  const payload: ExportPayload = buildExportPayload();
  delete payload.backend;
  const { exportedAt, ...stable } = payload;
  const hash = bytesToHex(sha256(utf8ToBytes(JSON.stringify(stable))));
  return {
    json: JSON.stringify(payload),
    hash,
    configVersion: payload.version,
    exportedAt: Date.parse(exportedAt) || Date.now(),
  };
}

export type UploadOutcome = "uploaded" | "skipped";

function describeUploadError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 413) return "Backup is larger than the backend accepts (4 MB)";
  if (status === 404) return "This backend does not support config backups yet (update it to 1.6 or newer)";
  return err instanceof Error ? err.message : String(err);
}

let inflight: Promise<UploadOutcome> | null = null;
let rerunForced = false;
let rerunRequested = false;

async function runUpload(force: boolean): Promise<UploadOutcome> {
  const backend = useBackendStore.getState();
  const config = useConfigStore.getState();
  if (!backend.hydrated || !config.hydrated) return "skipped";
  if (
    !backend.backupEnabled ||
    !backend.backupSaltHex ||
    !backend.backupKeyHex ||
    !backend.backupKeyIterations
  ) {
    return "skipped";
  }
  if (!backend.sharedSecret || !backend.url) return "skipped";
  if (config.demoMode) return "skipped";

  const plain = buildBackupPlaintext();
  if (!force && getString(STORAGE_KEYS.backendBackupLastHash) === plain.hash) return "skipped";

  backend.setBackupStatus({ backupInFlight: true });
  try {
    const envelope = encryptJsonStringWithKey(plain.json, {
      saltHex: backend.backupSaltHex,
      keyHex: backend.backupKeyHex,
      iterations: backend.backupKeyIterations,
    });
    const result = await putConfigBackup({
      envelope,
      configVersion: plain.configVersion,
      exportedAt: plain.exportedAt,
      appVersion: NATIVE_VERSION,
    });
    setString(STORAGE_KEYS.backendBackupLastHash, plain.hash);
    setString(STORAGE_KEYS.backendBackupLastAt, String(result.updatedAt));
    useBackendStore.getState().setBackupStatus({
      lastBackupAt: result.updatedAt,
      lastBackupError: null,
      backupInFlight: false,
    });
    return "uploaded";
  } catch (err) {
    // A failed upload must not leave a matching hash behind, or the next
    // change-free tick would skip the retry forever.
    deleteKey(STORAGE_KEYS.backendBackupLastHash);
    useBackendStore.getState().setBackupStatus({
      lastBackupError: describeUploadError(err),
      backupInFlight: false,
    });
    throw new Error(describeUploadError(err));
  }
}

/**
 * Encrypt and upload the current config. Overlapping calls coalesce: while
 * one upload is in flight, later calls wait for it and then run once more
 * (forced if any of them was), so the last state always lands.
 */
export function uploadConfigBackup(opts: { force?: boolean } = {}): Promise<UploadOutcome> {
  const force = opts.force ?? false;
  if (inflight) {
    rerunRequested = true;
    rerunForced = rerunForced || force;
    return inflight;
  }
  inflight = (async () => {
    try {
      let outcome = await runUpload(force);
      while (rerunRequested) {
        const again = rerunForced;
        rerunRequested = false;
        rerunForced = false;
        outcome = await runUpload(again);
      }
      return outcome;
    } finally {
      inflight = null;
      rerunRequested = false;
      rerunForced = false;
    }
  })();
  return inflight;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingWhileBackground = false;

/**
 * Debounced upload for the ConfigSyncBridge. Fires only while the app is
 * active; a change made in the background is flushed on the next resume via
 * `flushPendingConfigBackup`.
 */
export function scheduleConfigBackup(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (AppState.currentState !== "active") {
      pendingWhileBackground = true;
      return;
    }
    void uploadConfigBackup().catch((err) => {
      console.warn("[backend-backup] upload failed", err);
    });
  }, DEBOUNCE_MS);
}

export function flushPendingConfigBackup(): void {
  if (!pendingWhileBackground) return;
  pendingWhileBackground = false;
  void uploadConfigBackup().catch((err) => {
    console.warn("[backend-backup] upload failed", err);
  });
}

export function cancelScheduledConfigBackup(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingWhileBackground = false;
}

/** Restore the persisted "last backup" timestamp into the store after hydration. */
export function loadBackupStatus(): void {
  const raw = getString(STORAGE_KEYS.backendBackupLastAt);
  const at = raw ? Number(raw) : NaN;
  if (Number.isFinite(at)) useBackendStore.getState().setBackupStatus({ lastBackupAt: at });
}
