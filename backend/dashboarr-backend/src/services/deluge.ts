import type { StoredServiceConfig } from "../db/repos/config.js";
import { SERVICE_API_BASE } from "../types.js";
import { activeBaseUrl } from "./http.js";

// Minimal Deluge Web JSON-RPC client for the completion poller. Mirrors the
// app's services/deluge-api.ts but only fetches what the diff needs.
//
// Two Deluge facts drive the shape of this file:
//   1. Every RPC answers HTTP 200; failures live in the `error` object, and
//      code 1 = session expired, code 2 = "Unknown method".
//   2. deluge-web is a PROXY to a separate deluged daemon. Until it has
//      connected, every core.* call answers code 2 — so a fresh session must
//      run web.connected → web.get_hosts → web.connect before listing anything.
//      A daemon that goes away AFTER a successful connect reports differently
//      again (code 3, AttributeError on NoneType), because the remote-method
//      table is never cleared — see isRecoverable().
//
// Session state (the _session_id cookie + whether the daemon is attached) is
// cached per base+password, the same way services/qbittorrent.ts caches its
// cookie.
export interface DelugeTorrent {
  hash: string;
  name: string;
  state: string;
  // 0-100, the scale Deluge reports.
  progress: number;
  label: string;
}

interface SessionState {
  cookie: string;
  daemonReady: boolean;
}

const sessions = new Map<string, SessionState>();

const LIST_FIELDS = ["name", "state", "progress", "label"];

function sessionKey(config: StoredServiceConfig): string {
  return `${activeBaseUrl(config)}|${config.password ?? ""}`;
}

function endpoint(config: StoredServiceConfig): string {
  const base = activeBaseUrl(config);
  if (!base) throw new Error("Deluge URL not configured");
  return `${base.replace(/\/+$/, "")}${SERVICE_API_BASE.deluge}`;
}

let nextId = 1;

interface RpcEnvelope<T> {
  result?: T | null;
  error?: { message?: string; code?: number } | null;
}

class DelugeRpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(`Deluge RPC ${code}: ${message}`);
    this.name = "DelugeRpcError";
  }
}

async function post<T>(
  url: string,
  cookie: string | undefined,
  method: string,
  params: unknown[],
): Promise<RpcEnvelope<T>> {
  const headers: Record<string, string> = {
    // Bare value: Deluge <= 2.0.5 string-compares this header and rejects a
    // "; charset=utf-8" suffix outright.
    "Content-Type": "application/json",
  };
  if (cookie) headers.Cookie = `_session_id=${cookie}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    // `id` is mandatory — Deluge reads method/params/id with plain indexing.
    body: JSON.stringify({ method, params, id: nextId++ }),
  });
  if (!res.ok) throw new Error(`Deluge ${method} HTTP ${res.status}`);
  return (await res.json()) as RpcEnvelope<T>;
}

/** Log in and capture the _session_id cookie. Returns null on a bad password. */
async function login(config: StoredServiceConfig): Promise<string | null> {
  const url = endpoint(config);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "auth.login",
      params: [config.password ?? ""],
      id: nextId++,
    }),
  });
  if (!res.ok) return null;
  // Node's fetch exposes Set-Cookie, so unlike the app there is no native
  // cookie jar to fall back on — a missing header is a hard failure.
  const setCookie = res.headers.get("set-cookie");
  const match = setCookie?.match(/_session_id=([^;]+)/);
  const json = (await res.json()) as RpcEnvelope<boolean>;
  // auth.login answers `false` with error:null for a wrong password.
  if (json.error || json.result !== true || !match?.[1]) return null;
  return match[1];
}

/** Attach deluge-web to a daemon. Without this every core.* call is code 2. */
async function connectDaemon(url: string, cookie: string): Promise<boolean> {
  const connected = await post<boolean>(url, cookie, "web.connected", []);
  if (connected.result === true) return true;

  const hosts = await post<unknown[]>(url, cookie, "web.get_hosts", []);
  const list = hosts.result;
  if (!Array.isArray(list) || list.length === 0) return false;
  const hostId = Array.isArray(list[0]) ? String(list[0][0] ?? "") : "";
  if (!hostId) return false;

  // web.connect's failure path only logs and returns null, so a success-shaped
  // response proves nothing — only a non-empty method array does.
  const methods = await post<unknown>(url, cookie, "web.connect", [hostId]);
  return Array.isArray(methods.result) && methods.result.length > 0;
}

async function ensureSession(config: StoredServiceConfig): Promise<SessionState> {
  const key = sessionKey(config);
  const cached = sessions.get(key);
  if (cached?.daemonReady) return cached;

  const url = endpoint(config);
  const cookie = cached?.cookie ?? (await login(config));
  if (!cookie) throw new Error("Deluge authentication failed");
  const daemonReady = await connectDaemon(url, cookie);
  if (!daemonReady) {
    throw new Error("Deluge Web UI is not connected to the deluged daemon");
  }
  const state = { cookie, daemonReady };
  sessions.set(key, state);
  return state;
}

function isRecoverable(error: { message?: string; code?: number }): boolean {
  const code = error.code ?? 0;
  if (code === 1 || code === 2) return true;
  return code === 3 && (error.message ?? "").includes("AttributeError: 'NoneType'");
}

export async function getDelugeTorrents(
  config: StoredServiceConfig,
): Promise<DelugeTorrent[]> {
  const url = endpoint(config);
  let state = await ensureSession(config);

  const call = async (cookie: string) =>
    post<Record<string, Record<string, unknown>>>(
      url,
      cookie,
      "core.get_torrents_status",
      // Never send an empty key list: Deluge reads that as "every field" and
      // returns files, peers and pieces for every torrent.
      [{}, LIST_FIELDS],
    );

  let res = await call(state.cookie);
  if (res.error) {
    // 1 = session expired. 2 = daemon never attached (deluge-web's remote
    // method table is still empty). 3 with an AttributeError on NoneType = the
    // daemon went away AFTER a successful connect — the method table is never
    // cleared, so the call reaches a null daemon proxy instead of answering
    // "Unknown method". All three are recoverable by redoing the handshake.
    if (isRecoverable(res.error)) {
      sessions.delete(sessionKey(config));
      state = await ensureSession(config);
      res = await call(state.cookie);
    }
    if (res.error) {
      throw new DelugeRpcError(res.error.code ?? 0, res.error.message ?? "unknown error");
    }
  }

  const dict = res.result;
  if (!dict || typeof dict !== "object") return [];
  const out: DelugeTorrent[] = [];
  for (const [hash, raw] of Object.entries(dict)) {
    // A desynced deluge-web returns entries with null hash AND name — skip
    // them rather than push a nameless notification.
    const name = typeof raw?.name === "string" ? raw.name : "";
    if (!hash || !name) continue;
    out.push({
      hash,
      name,
      state: typeof raw.state === "string" ? raw.state : "",
      progress: typeof raw.progress === "number" ? raw.progress : 0,
      label: typeof raw.label === "string" ? raw.label : "",
    });
  }
  return out;
}

export function clearDelugeSession(config: StoredServiceConfig): void {
  sessions.delete(sessionKey(config));
}
