import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { getSecret, setSecret, deleteSecret, deleteKey } from "@/store/storage";
import { STORAGE_KEYS } from "@/lib/constants";

/**
 * Paired-backend state. URL + shared secret live in SecureStore so they don't
 * leak into AsyncStorage backups. Health state is in-memory only and updated
 * by `useBackendHealth`.
 */

const SECRET_KEYS = {
  url: "backend.url",
  sharedSecret: "backend.sharedSecret",
  deviceId: "backend.deviceId",
  ignoreCertErrors: "backend.ignoreCertErrors",
  // Config backup (Refs #385). The derived AES key + its salt, never the
  // passphrase. Same exposure class as the instance secrets and the bearer
  // that already sit ungated in SecureStore; the blob it opens holds nothing
  // those don't. Written WHEN_UNLOCKED_THIS_DEVICE_ONLY so it never rides
  // along in an iCloud Keychain / device backup.
  backupEnabled: "backend.backupEnabled",
  backupSalt: "backend.backupSalt",
  backupKey: "backend.backupKey",
  backupKeyIterations: "backend.backupKeyIterations",
} as const;

interface BackendState {
  hydrated: boolean;
  url: string | null;
  sharedSecret: string | null;
  deviceId: string | null;
  /**
   * Opt the backend's hostname into the native TLS-bypass allowlist
   * (lib/insecure-tls.ts). Needed when the backend sits behind a reverse proxy
   * serving a self-signed cert or one from a private/internal CA: the phone's
   * browser may trust that CA while app traffic does not, so the handshake
   * fails before any HTTP request is sent (issue #357).
   *
   * Stored in SecureStore next to the other backend keys rather than in the
   * config store, which is hydrated by a separate, unordered `hydrate()` call.
   */
  ignoreCertErrors: boolean;
  /**
   * Backend URL the user is about to pair with, before `pair()` persists it.
   * In-memory only. `syncInsecureHosts` reads it so the TLS bypass is already
   * in place for the `POST /pair/claim` that establishes the pairing — without
   * it the very request that needs the bypass is the one request that can't
   * have it. Also seeded by `unpair()` so the allowlist survives a
   * rotate-secret → rescan round trip.
   */
  draftUrl: string | null;
  isHealthy: boolean;
  lastHealthAt: number | null;
  consecutiveFailures: number;
  /** Continuous encrypted config backup to the backend is on (Refs #385). */
  backupEnabled: boolean;
  backupSaltHex: string | null;
  backupKeyHex: string | null;
  /** PBKDF2 rounds the cached key was derived with; stamped into every envelope so it decrypts. */
  backupKeyIterations: number | null;
  /** Server timestamp of the last successful upload; null when never. */
  lastBackupAt: number | null;
  lastBackupError: string | null;
  backupInFlight: boolean;
  /**
   * The backend's "web" slot (edited in its web UI, Refs #385): the revision
   * last seen in a successful list (null = none, or backend too old), and the
   * revision this phone last applied. Pending = seen > applied. Both reset on
   * unpair; see services/web-slot-watch.ts for the update rules.
   */
  webSlotRevision: number | null;
  webSlotAppliedRevision: number | null;
}

interface BackendActions {
  hydrate: () => Promise<void>;
  pair: (input: { url: string; sharedSecret: string; deviceId: string }) => Promise<void>;
  unpair: () => Promise<void>;
  setHealth: (ok: boolean) => void;
  setIgnoreCertErrors: (value: boolean) => Promise<void>;
  setDraftUrl: (url: string | null) => void;
  enableBackup: (key: { saltHex: string; keyHex: string; iterations: number }) => Promise<void>;
  disableBackup: () => Promise<void>;
  setBackupStatus: (patch: {
    lastBackupAt?: number | null;
    lastBackupError?: string | null;
    backupInFlight?: boolean;
  }) => void;
  setWebSlot: (patch: { webSlotRevision?: number | null; webSlotAppliedRevision?: number | null }) => void;
}

export const useBackendStore = create<BackendState & BackendActions>((set, get) => ({
  hydrated: false,
  url: null,
  sharedSecret: null,
  deviceId: null,
  ignoreCertErrors: false,
  draftUrl: null,
  isHealthy: false,
  lastHealthAt: null,
  consecutiveFailures: 0,
  backupEnabled: false,
  backupSaltHex: null,
  backupKeyHex: null,
  backupKeyIterations: null,
  lastBackupAt: null,
  lastBackupError: null,
  backupInFlight: false,
  webSlotRevision: null,
  webSlotAppliedRevision: null,

  hydrate: async () => {
    const [url, sharedSecret, deviceId, ignoreCertErrors, backupEnabled, backupSalt, backupKey, backupIter] =
      await Promise.all([
        getSecret(SECRET_KEYS.url),
        getSecret(SECRET_KEYS.sharedSecret),
        getSecret(SECRET_KEYS.deviceId),
        getSecret(SECRET_KEYS.ignoreCertErrors),
        getSecret(SECRET_KEYS.backupEnabled),
        getSecret(SECRET_KEYS.backupSalt),
        getSecret(SECRET_KEYS.backupKey),
        getSecret(SECRET_KEYS.backupKeyIterations),
      ]);
    const iterations = backupIter ? Number(backupIter) : NaN;
    // Optimistically assume a previously-paired backend is still reachable.
    // `setHealth` will flip to unhealthy after 2 consecutive /health failures.
    // Without this, `isBackendActive` returns false until the first health
    // poll succeeds, and local + server notifications can double-fire during
    // that startup window.
    const hasPairing = !!url && !!sharedSecret;
    set({
      url: url ?? null,
      sharedSecret: sharedSecret ?? null,
      deviceId: deviceId ?? null,
      ignoreCertErrors: ignoreCertErrors === "true",
      // All three must be present; a partial write (killed mid-enable) reads
      // as "off" rather than as a key that can never be used.
      backupEnabled:
        backupEnabled === "true" && !!backupSalt && !!backupKey && Number.isFinite(iterations),
      backupSaltHex: backupSalt ?? null,
      backupKeyHex: backupKey ?? null,
      backupKeyIterations: Number.isFinite(iterations) ? iterations : null,
      hydrated: true,
      isHealthy: hasPairing,
    });
  },

  pair: async ({ url, sharedSecret, deviceId }) => {
    const prev = get();
    const samePairing = prev.url === url && prev.sharedSecret === sharedSecret && prev.deviceId === deviceId;
    await Promise.all([
      setSecret(SECRET_KEYS.url, url),
      setSecret(SECRET_KEYS.sharedSecret, sharedSecret),
      setSecret(SECRET_KEYS.deviceId, deviceId),
    ]);
    // A different pairing is a different backend identity: the backup key
    // was chosen for the old backend's slot and must not follow us (a file
    // import calls pair() without unpair(), see importConfigFromPayload).
    // Same for the web-slot revisions. Enabling backup again is explicit.
    if (!samePairing) {
      await Promise.all([
        deleteSecret(SECRET_KEYS.backupEnabled),
        deleteSecret(SECRET_KEYS.backupSalt),
        deleteSecret(SECRET_KEYS.backupKey),
        deleteSecret(SECRET_KEYS.backupKeyIterations),
      ]);
      deleteKey(STORAGE_KEYS.backendWebSlotAppliedRevision);
    }
    // `url` now carries the host, so the draft has done its job.
    set({
      url,
      sharedSecret,
      deviceId,
      draftUrl: null,
      isHealthy: true,
      lastHealthAt: Date.now(),
      consecutiveFailures: 0,
      ...(samePairing
        ? {}
        : {
            backupEnabled: false,
            backupSaltHex: null,
            backupKeyHex: null,
            backupKeyIterations: null,
            lastBackupAt: null,
            lastBackupError: null,
            backupInFlight: false,
            webSlotRevision: null,
            webSlotAppliedRevision: null,
          }),
    });
  },

  unpair: async () => {
    // `ignoreCertErrors` is deliberately NOT deleted: a private CA is a
    // property of the user's network, not of the pairing, so unpair → rescan
    // (and Rotate secret, which goes through here) must not silently drop the
    // TLS bypass and reintroduce #357 on the re-pair.
    const previousUrl = get().url;
    await Promise.all([
      deleteSecret(SECRET_KEYS.url),
      deleteSecret(SECRET_KEYS.sharedSecret),
      deleteSecret(SECRET_KEYS.deviceId),
      // The backup key is bound to this pairing's slot; the slot itself
      // stays on the backend (as "unpaired") for a later restore.
      deleteSecret(SECRET_KEYS.backupEnabled),
      deleteSecret(SECRET_KEYS.backupSalt),
      deleteSecret(SECRET_KEYS.backupKey),
      deleteSecret(SECRET_KEYS.backupKeyIterations),
    ]);
    // Web-slot revisions belong to the pairing being dropped.
    deleteKey(STORAGE_KEYS.backendWebSlotAppliedRevision);
    set({
      url: null,
      sharedSecret: null,
      deviceId: null,
      // Keeps the old host allowlisted for the re-pair the user is about to do.
      draftUrl: previousUrl,
      isHealthy: false,
      lastHealthAt: null,
      consecutiveFailures: 0,
      backupEnabled: false,
      backupSaltHex: null,
      backupKeyHex: null,
      backupKeyIterations: null,
      lastBackupAt: null,
      lastBackupError: null,
      backupInFlight: false,
      webSlotRevision: null,
      webSlotAppliedRevision: null,
    });
  },

  setHealth: (ok) => {
    const state = get();
    if (ok) {
      set({ isHealthy: true, lastHealthAt: Date.now(), consecutiveFailures: 0 });
      return;
    }
    const failures = state.consecutiveFailures + 1;
    set({
      consecutiveFailures: failures,
      // Flip to unhealthy only after 2 consecutive failures to avoid flapping
      isHealthy: failures >= 2 ? false : state.isHealthy,
      lastHealthAt: Date.now(),
    });
  },

  setIgnoreCertErrors: async (value) => {
    await setSecret(SECRET_KEYS.ignoreCertErrors, String(value));
    // The store subscription in app/_layout.tsx re-pushes the native allowlist.
    set({ ignoreCertErrors: value });
  },

  setDraftUrl: (url) => set({ draftUrl: url }),

  enableBackup: async ({ saltHex, keyHex, iterations }) => {
    const opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    // Key material first, flag last, so a crash in between reads as "off".
    await setSecret(SECRET_KEYS.backupSalt, saltHex, opts);
    await setSecret(SECRET_KEYS.backupKey, keyHex, opts);
    await setSecret(SECRET_KEYS.backupKeyIterations, String(iterations), opts);
    await setSecret(SECRET_KEYS.backupEnabled, "true", opts);
    set({
      backupEnabled: true,
      backupSaltHex: saltHex,
      backupKeyHex: keyHex,
      backupKeyIterations: iterations,
      lastBackupError: null,
    });
  },

  disableBackup: async () => {
    await Promise.all([
      deleteSecret(SECRET_KEYS.backupEnabled),
      deleteSecret(SECRET_KEYS.backupSalt),
      deleteSecret(SECRET_KEYS.backupKey),
      deleteSecret(SECRET_KEYS.backupKeyIterations),
    ]);
    set({
      backupEnabled: false,
      backupSaltHex: null,
      backupKeyHex: null,
      backupKeyIterations: null,
      lastBackupAt: null,
      lastBackupError: null,
      backupInFlight: false,
    });
  },

  setBackupStatus: (patch) => set(patch),

  setWebSlot: (patch) => set(patch),
}));

/** An edit made on the backend's web UI that this phone has not applied yet. */
export function isWebSlotPending(state: Pick<BackendState, "webSlotRevision" | "webSlotAppliedRevision">): boolean {
  return state.webSlotRevision !== null && state.webSlotRevision > (state.webSlotAppliedRevision ?? -1);
}

/**
 * Returns true when the app should defer notifications to the backend
 * (paired + confirmed healthy).
 */
export function isBackendActive(state: BackendState): boolean {
  return state.hydrated && !!state.sharedSecret && !!state.url && state.isHealthy;
}
