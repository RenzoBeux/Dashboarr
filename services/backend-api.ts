import { useBackendStore } from "@/store/backend-store";
import { useConfigStore } from "@/store/config-store";
import { useNotificationStore } from "@/store/notifications-store";
import { SERVICE_IDS } from "@/lib/constants";

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
      throw new Error(`Backend ${path} HTTP ${res.status}`);
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
  pollers: { id: string; intervalMs: number; lastRunAt: number | null; lastError: string | null }[];
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
}

export function pairClaim(
  baseUrl: string,
  token: string,
  expoPushToken: string,
  platform: "ios" | "android",
  appVersion?: string,
): Promise<PairClaimResult> {
  return request<PairClaimResult>("/pair/claim", {
    baseUrl,
    sharedSecret: null,
    method: "POST",
    body: JSON.stringify({ token, expoPushToken, platform, appVersion }),
  });
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
 * Build a config payload from the app stores and push it to the backend.
 * Called on pairing and debounced after any config/notification change.
 */
export function pushConfigSnapshot(): Promise<void> {
  const configState = useConfigStore.getState();
  const notificationState = useNotificationStore.getState();

  const services = SERVICE_IDS.map((id) => {
    const config = configState.services[id];
    const secrets = configState.secrets[id];
    return {
      id,
      enabled: config.enabled,
      name: config.name,
      localUrl: config.localUrl,
      remoteUrl: config.remoteUrl,
      useRemote: config.useRemote,
      apiKey: secrets.apiKey || undefined,
      username: secrets.username || undefined,
      password: secrets.password || undefined,
      wolMac: config.wakeOnLan?.mac || undefined,
    };
  });

  const { enabled, torrentCompleted, radarrDownloaded, sonarrDownloaded, serviceOffline, overseerrNewRequest } =
    notificationState;

  return request<void>("/config", {
    method: "PUT",
    body: JSON.stringify({
      services,
      notifications: {
        enabled,
        torrentCompleted,
        radarrDownloaded,
        sonarrDownloaded,
        serviceOffline,
        overseerrNewRequest,
      },
    }),
  });
}
