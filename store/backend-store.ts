import { create } from "zustand";
import { getSecret, setSecret, deleteSecret } from "@/store/storage";

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
}

interface BackendActions {
  hydrate: () => Promise<void>;
  pair: (input: { url: string; sharedSecret: string; deviceId: string }) => Promise<void>;
  unpair: () => Promise<void>;
  setHealth: (ok: boolean) => void;
  setIgnoreCertErrors: (value: boolean) => Promise<void>;
  setDraftUrl: (url: string | null) => void;
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

  hydrate: async () => {
    const [url, sharedSecret, deviceId, ignoreCertErrors] = await Promise.all([
      getSecret(SECRET_KEYS.url),
      getSecret(SECRET_KEYS.sharedSecret),
      getSecret(SECRET_KEYS.deviceId),
      getSecret(SECRET_KEYS.ignoreCertErrors),
    ]);
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
      hydrated: true,
      isHealthy: hasPairing,
    });
  },

  pair: async ({ url, sharedSecret, deviceId }) => {
    await Promise.all([
      setSecret(SECRET_KEYS.url, url),
      setSecret(SECRET_KEYS.sharedSecret, sharedSecret),
      setSecret(SECRET_KEYS.deviceId, deviceId),
    ]);
    // `url` now carries the host, so the draft has done its job.
    set({
      url,
      sharedSecret,
      deviceId,
      draftUrl: null,
      isHealthy: true,
      lastHealthAt: Date.now(),
      consecutiveFailures: 0,
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
    ]);
    set({
      url: null,
      sharedSecret: null,
      deviceId: null,
      // Keeps the old host allowlisted for the re-pair the user is about to do.
      draftUrl: previousUrl,
      isHealthy: false,
      lastHealthAt: null,
      consecutiveFailures: 0,
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
}));

/**
 * Returns true when the app should defer notifications to the backend
 * (paired + confirmed healthy).
 */
export function isBackendActive(state: BackendState): boolean {
  return state.hydrated && !!state.sharedSecret && !!state.url && state.isHealthy;
}
