import type { StoredServiceConfig } from "../db/repos/config.js";
import { SERVICE_API_BASE } from "../types.js";
import { activeBaseUrl } from "./http.js";

// Minimal Transmission JSON-RPC client for the completion poller. Mirrors the
// app's services/transmission-api.ts but only fetches what the diff needs.
// Transmission guards /transmission/rpc with a CSRF token returned in the 409
// `X-Transmission-Session-Id` header; we cache it per base+user and refresh on
// 409 (same shape as the qBittorrent cookie cache in services/qbittorrent.ts).
export interface TransmissionTorrent {
  hash: string;
  name: string;
  status: number;
  percentDone: number;
  labels: string[];
}

const sessionIds = new Map<string, string>();

function sessionKey(config: StoredServiceConfig): string {
  return `${activeBaseUrl(config)}|${config.username ?? ""}`;
}

function authHeaders(config: StoredServiceConfig): Record<string, string> {
  if (config.username || config.password) {
    const encoded = Buffer.from(
      `${config.username ?? ""}:${config.password ?? ""}`,
    ).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

async function rpc<T>(
  config: StoredServiceConfig,
  method: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const base = activeBaseUrl(config);
  if (!base) throw new Error("Transmission URL not configured");
  const url = `${base.replace(/\/+$/, "")}${SERVICE_API_BASE.transmission}`;
  const key = sessionKey(config);
  const body = JSON.stringify({ method, arguments: args ?? {} });

  const doFetch = (): Promise<Response> => {
    const sid = sessionIds.get(key);
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(config),
        ...(sid ? { "X-Transmission-Session-Id": sid } : {}),
      },
      body,
    });
  };

  let res = await doFetch();
  if (res.status === 409) {
    const sid = res.headers.get("x-transmission-session-id");
    if (sid) {
      sessionIds.set(key, sid);
      res = await doFetch();
    }
  }
  if (!res.ok) throw new Error(`Transmission ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; arguments?: T };
  if (json.result !== "success") {
    throw new Error(`Transmission ${method}: ${json.result ?? "unknown error"}`);
  }
  return (json.arguments ?? ({} as T)) as T;
}

export async function getTransmissionTorrents(
  config: StoredServiceConfig,
): Promise<TransmissionTorrent[]> {
  const res = await rpc<{
    torrents?: {
      hashString?: string;
      name?: string;
      status?: number;
      percentDone?: number;
      labels?: string[];
    }[];
  }>(config, "torrent-get", {
    fields: ["hashString", "name", "status", "percentDone", "labels"],
  });
  return (res.torrents ?? []).map((t) => ({
    hash: String(t.hashString ?? ""),
    name: String(t.name ?? ""),
    status: typeof t.status === "number" ? t.status : -1,
    percentDone: typeof t.percentDone === "number" ? t.percentDone : 0,
    labels: Array.isArray(t.labels) ? t.labels : [],
  }));
}

export function clearTransmissionSession(config: StoredServiceConfig): void {
  sessionIds.delete(sessionKey(config));
}
