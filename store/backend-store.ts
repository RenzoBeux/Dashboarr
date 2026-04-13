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
} as const;

interface BackendState {
  hydrated: boolean;
  url: string | null;
  sharedSecret: string | null;
  deviceId: string | null;
  isHealthy: boolean;
  lastHealthAt: number | null;
  consecutiveFailures: number;
}

interface BackendActions {
  hydrate: () => Promise<void>;
  pair: (input: { url: string; sharedSecret: string; deviceId: string }) => Promise<void>;
  unpair: () => Promise<void>;
  setHealth: (ok: boolean) => void;
}

export const useBackendStore = create<BackendState & BackendActions>((set, get) => ({
  hydrated: false,
  url: null,
  sharedSecret: null,
  deviceId: null,
  isHealthy: false,
  lastHealthAt: null,
  consecutiveFailures: 0,

  hydrate: async () => {
    const [url, sharedSecret, deviceId] = await Promise.all([
      getSecret(SECRET_KEYS.url),
      getSecret(SECRET_KEYS.sharedSecret),
      getSecret(SECRET_KEYS.deviceId),
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
    set({ url, sharedSecret, deviceId, isHealthy: true, lastHealthAt: Date.now(), consecutiveFailures: 0 });
  },

  unpair: async () => {
    await Promise.all([
      deleteSecret(SECRET_KEYS.url),
      deleteSecret(SECRET_KEYS.sharedSecret),
      deleteSecret(SECRET_KEYS.deviceId),
    ]);
    set({
      url: null,
      sharedSecret: null,
      deviceId: null,
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
}));

/**
 * Returns true when the app should defer notifications to the backend
 * (paired + confirmed healthy).
 */
export function isBackendActive(state: BackendState): boolean {
  return state.hydrated && !!state.sharedSecret && !!state.url && state.isHealthy;
}
