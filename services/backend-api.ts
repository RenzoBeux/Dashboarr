import { useBackendStore } from "@/store/backend-store";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS } from "@/lib/constants";
import { isPrivateHost } from "@/lib/url-validation";

const DEFAULT_TIMEOUT = 10000;

interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  baseUrl?: string;
  sharedSecret?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const state = useBackendStore.getState();
  const baseUrl = options.baseUrl ?? state.url;
  const sharedSecret = options.sharedSecret !== undefined ? options.sharedSecret : state.sharedSecret;

  if (!baseUrl) throw new Error("Backend not paired");

  const headers = new Headers(options.headers);
  if (sharedSecret) headers.set("Authorization", `Bearer ${sharedSecret}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      // Tag the status so callers can tell a real HTTP response (the endpoint
      // answered) apart from a connection-level failure (fetch rejects with no
      // `.status`). `pairClaim` relies on this to decide whether to retry a
      // different scheme. Existing catch sites only read `.message`, so this is
      // backwards-compatible.
      const err = new Error(`Backend ${path} HTTP ${res.status}`) as Error & {
        status?: number;
      };
      err.status = res.status;
      throw err;
    }
    const ct = res.headers.get("content-type");
    if (ct?.includes("application/json")) {
      return (await res.json()) as T;
    }
    return undefined as unknown as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface BackendHealth {
  ok: boolean;
  name: string;
  version: string;
  expoAuth: string;
  // Multi-instance backends: `id` is the per-instance UUID, `kind` is the
  // service kind, `name` is the user-facing label. Older backends omit
  // `kind`/`name` and put the kind in `id`. `useBackendHealth` only reads
  // `ok` today, but the richer fields are available for any future UI that
  // wants to surface backend-side per-instance polling status.
  pollers: {
    id: string;
    kind?: string;
    name?: string;
    intervalMs: number;
    lastRunAt: number | null;
    lastError: string | null;
  }[];
  uptimeMs: number;
}

export function getBackendHealth(): Promise<BackendHealth> {
  // /health is bearer-protected; `request` picks up the stored secret by
  // default, so no explicit auth override is needed here.
  return request<BackendHealth>("/health");
}

interface PairClaimResult {
  deviceId: string;
  sharedSecret: string;
  /**
   * The base URL that actually answered. May differ from the one passed in:
   * for a public host typed as http:// we try https:// first (see
   * `pairingBaseCandidates`). The caller must persist this so later calls use
   * the same origin and don't hit the redirect that breaks pairing (#218).
   */
  baseUrl: string;
}

/**
 * Candidate base URLs to try when claiming, most-correct first.
 *
 * A backend behind Cloudflare/a reverse proxy is usually HTTPS-only. If the
 * user types a bare hostname, `normalizeServiceUrl` defaults it to http://, and
 * the edge answers our POST with a 301/302 to https://. React Native's fetch
 * follows that redirect by downgrading POST→GET and dropping the body (per the
 * WHATWG Fetch spec; only 307/308 preserve the method), so the backend receives
 * `GET /pair/claim` and 404s (#218). 301/302 leave GET/HEAD untouched, so
 * `res.url`/`res.redirected` are unreliable for detecting this in RN — instead
 * we avoid the redirect entirely by trying https:// first for PUBLIC http hosts.
 * Private/LAN hosts (192.168.x, 10.x, *.local, localhost) legitimately run plain
 * http with no TLS, so they are never upgraded.
 */
function pairingBaseCandidates(normalizedUrl: string): string[] {
  try {
    const u = new URL(normalizedUrl);
    if (u.protocol === "http:" && !isPrivateHost(u.hostname)) {
      return [normalizedUrl.replace(/^http:\/\//i, "https://"), normalizedUrl];
    }
  } catch {
    // unparseable — fall through to the single-candidate path
  }
  return [normalizedUrl];
}

export async function pairClaim(
  baseUrl: string,
  token: string,
  expoPushToken: string,
  platform: "ios" | "android",
  appVersion?: string,
): Promise<PairClaimResult> {
  const candidates = pairingBaseCandidates(baseUrl.replace(/\/$/, ""));
  const body = JSON.stringify({ token, expoPushToken, platform, appVersion });
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const data = await request<Omit<PairClaimResult, "baseUrl">>("/pair/claim", {
        baseUrl: candidate,
        sharedSecret: null,
        method: "POST",
        body,
      });
      return { ...data, baseUrl: candidate };
    } catch (err) {
      // A numeric `.status` means the endpoint answered (e.g. 401 invalid token,
      // 400 bad payload) — a real result, not a wrong-scheme guess — so surface
      // it. Only fall through to the next candidate on a connection-level
      // failure (TLS/DNS/refused/timeout), where https simply wasn't reachable.
      if (typeof (err as { status?: number } | null)?.status === "number") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

export function registerDevice(expoPushToken: string, platform: "ios" | "android"): Promise<void> {
  return request<void>("/device/register", {
    method: "POST",
    body: JSON.stringify({ expoPushToken, platform }),
  });
}

export function unregisterDevice(): Promise<void> {
  return request<void>("/device/unregister", { method: "POST" });
}

export function testPush(): Promise<void> {
  return request<void>("/notifications/test", { method: "POST" });
}

/**
 * Fire an Apprise-only test from the backend. Unlike testPush this hits a
 * dedicated endpoint that returns the real success/failure, so the caller can
 * surface why it failed (unreachable server, unknown key, bad tag).
 */
export function testApprise(): Promise<void> {
  return request<void>("/notifications/apprise/test", { method: "POST" });
}

/**
 * Build a config payload from the app stores and push it to the backend.
 * Called on pairing and debounced after any config/notification change.
 *
 * Sends the multi-instance shape (`instances: [{ id, kind, ... }]`). The
 * backend accepts both the new shape and the pre-multi-instance `services`
 * shape — see backend/dashboarr-backend/src/routes/config.ts — so a backend
 * that hasn't been upgraded yet won't reject this payload, it'll just
 * normalize legacy single-instance entries internally.
 */
export function pushConfigSnapshot(): Promise<void> {
  const configState = useConfigStore.getState();

  const instances = SERVICE_IDS.flatMap((kind) => {
    const list = configState.serviceInstances[kind] ?? [];
    return list.map((inst) => {
      const secrets = configState.instanceSecrets[inst.id] ?? {
        apiKey: "",
        username: "",
        password: "",
      };
      return {
        id: inst.id,
        kind,
        enabled: inst.enabled,
        name: inst.name,
        localUrl: inst.localUrl,
        remoteUrl: inst.remoteUrl,
        useRemote: inst.useRemote,
        apiKey: secrets.apiKey || undefined,
        username: secrets.username || undefined,
        password: secrets.password || undefined,
      };
    });
  });

  const {
    enabled,
    torrentCompleted,
    sabnzbdCompleted,
    nzbgetCompleted,
    radarrDownloaded,
    sonarrDownloaded,
    serviceOffline,
    overseerrNewRequest,
    perInstance,
    apprise,
  } = configState.notificationSettings;

  return request<void>("/config", {
    method: "PUT",
    body: JSON.stringify({
      instances,
      notifications: {
        enabled,
        torrentCompleted,
        sabnzbdCompleted,
        nzbgetCompleted,
        radarrDownloaded,
        sonarrDownloaded,
        serviceOffline,
        overseerrNewRequest,
        // v21: per-instance overrides. Sent as `undefined` when no overrides
        // exist so the backend treats it the same as a pre-v21 client.
        perInstance,
        // v34: Apprise sink config. Sent as `undefined` when unset so older
        // backends ignore it.
        apprise,
      },
    }),
  });
}
