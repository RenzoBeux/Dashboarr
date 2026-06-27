import { buildUrl, HttpError } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import type {
  TorrentGlobalStats,
  TorrentStatus,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// Transmission speaks JSON-RPC over a single POST /transmission/rpc endpoint and
// guards it with a CSRF token: the first request answers 409 with the
// `X-Transmission-Session-Id` header, which every following request must echo.
// We cache the token in-memory per instance and refresh-on-409 — the same shape
// as qBittorrent's cookie session (services/qbittorrent-api.ts) but cheaper, so
// no SecureStore persistence is needed (re-fetching the token costs one request
// and carries no credentials, unlike a qBittorrent login that can trip its
// brute-force lockout). HTTP Basic auth (optional) is checked BEFORE the CSRF
// layer, so a wrong password surfaces as 401 and never reaches the 409 path.

// --- field name constants (the wire format is a well-known mix: torrent-get and
// session-stats VALUES are camelCase; session-get/torrent-add/torrent-remove
// ARGUMENTS are hyphenated). Centralized so a casing fix is one edit.
const LIST_FIELDS = [
  "hashString",
  "name",
  "totalSize",
  "percentDone",
  "rateDownload",
  "rateUpload",
  "eta",
  "uploadRatio",
  "status",
  "downloadDir",
  "addedDate",
  "doneDate",
  "leftUntilDone",
  "downloadedEver",
  "uploadedEver",
  "error",
  "errorString",
  "labels",
] as const;

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "files",
  "fileStats",
  "trackers",
  "trackerStats",
  "seedRatioLimit",
  "seedRatioMode",
  "seedIdleLimit",
  "seedIdleMode",
] as const;

// Transmission torrent `status` enum (rpc-spec §3.2).
const STATUS_STOPPED = 0;
const STATUS_CHECK_WAIT = 1;
const STATUS_CHECK = 2;
const STATUS_DOWNLOAD_WAIT = 3;
const STATUS_DOWNLOAD = 4;
const STATUS_SEED_WAIT = 5;
const STATUS_SEED = 6;

// `error` enum (libtransmission tr_stat.error): 0 ok, 1 tracker warning,
// 2 tracker error, 3 local error. Only a LOCAL error is a genuine failure we
// paint red — tracker warnings/errors are routine and would false-positive
// (mirrors the rtorrent #20 lesson). errorString is always surfaced regardless.
const ERROR_LOCAL = 3;

// Speed-limit fields are kB/s where kB = 1000 bytes (rpc-spec: "number of bytes
// in a KB (1000 for kB; 1024 for KiB)"). The adapter surface is bytes/s.
const BYTES_PER_KB = 1000;

interface RawTorrent {
  hashString: string;
  name: string;
  totalSize: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  eta: number;
  uploadRatio: number;
  status: number;
  downloadDir: string;
  addedDate: number;
  doneDate: number;
  leftUntilDone: number;
  downloadedEver: number;
  uploadedEver: number;
  error: number;
  errorString: string;
  labels?: string[];
  files?: { name: string; length: number; bytesCompleted: number }[];
  fileStats?: { bytesCompleted: number; wanted: boolean; priority: number }[];
  trackers?: { announce: string; tier?: number; sitename?: string }[];
  trackerStats?: {
    announce: string;
    host?: string;
    sitename?: string;
    seederCount?: number;
    leecherCount?: number;
    lastAnnounceResult?: string;
  }[];
  seedRatioLimit?: number;
  seedRatioMode?: number;
  seedIdleLimit?: number;
  seedIdleMode?: number;
}

export interface TransmissionFile {
  name: string;
  length: number;
  bytesCompleted: number;
}

export interface TransmissionTracker {
  announce: string;
  host?: string;
  seederCount?: number;
  leecherCount?: number;
  lastAnnounceResult?: string;
}

// tr_ratiolimit / tr_inactivelimit: 0 = use global, 1 = single (override),
// 2 = unlimited.
export const SEED_MODE_GLOBAL = 0;
export const SEED_MODE_SINGLE = 1;
export const SEED_MODE_UNLIMITED = 2;

export interface TransmissionTorrentDetail {
  torrent: UnifiedTorrent;
  files: TransmissionFile[];
  trackers: TransmissionTracker[];
  seedRatioLimit: number;
  seedRatioMode: number;
  seedIdleLimit: number;
  seedIdleMode: number;
}

export interface TransmissionSession {
  speedLimitDown: number; // kB/s
  speedLimitDownEnabled: boolean;
  speedLimitUp: number; // kB/s
  speedLimitUpEnabled: boolean;
  altSpeedDown: number; // kB/s
  altSpeedUp: number; // kB/s
  altSpeedEnabled: boolean; // "turtle" mode
}

export interface TransmissionSessionUpdate {
  speedLimitDown?: number;
  speedLimitDownEnabled?: boolean;
  speedLimitUp?: number;
  speedLimitUpEnabled?: boolean;
  altSpeedDown?: number;
  altSpeedUp?: number;
  altSpeedEnabled?: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const bool = (v: unknown): boolean => v === true;

// One session-id token per instance UUID, so two configured Transmission
// servers keep separate CSRF state.
const sessionIds = new Map<string, string>();

const REQUEST_TIMEOUT = 15000;

function resolveInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("transmission");
  if (!id) throw new Error("No Transmission instance configured");
  return id;
}

/**
 * POST a single JSON-RPC method and return its `arguments` payload. Handles the
 * X-Transmission-Session-Id 409 challenge (capture + retry once) and optional
 * HTTP Basic auth. In demo mode the request is routed to the demo router, which
 * dispatches off the method name in the body (same as nzbget/rtorrent).
 */
async function transmissionRpc<T>(
  method: string,
  args?: Record<string, unknown>,
  instanceId?: string,
): Promise<T> {
  const id = resolveInstanceId(instanceId);
  const store = useConfigStore.getState();
  const requestBody = JSON.stringify({ method, arguments: args ?? {} });

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoResponse("transmission", "", undefined, requestBody) ??
      undefined) as T;
  }

  const inst = store.getInstance("transmission", id);
  if (!inst?.enabled) throw new Error("Transmission is not enabled");
  const baseUrl = store.getActiveUrl("transmission", id);
  if (!baseUrl) throw new Error("No URL configured for Transmission");
  const apiBase = SERVICE_DEFAULTS.transmission.apiBasePath;
  const url = buildUrl(baseUrl, apiBase, "");
  const secrets = store.instanceSecrets[id] ?? {};

  const doFetch = (signal: AbortSignal): Promise<Response> => {
    const headers = new Headers();
    // Custom headers first so service auth + the CSRF token win on collision.
    const customHeaders = store.getMergedHeaders("transmission", id);
    for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);
    headers.set("Content-Type", "application/json");
    if (secrets.username || secrets.password) {
      const encoded = btoa(`${secrets.username ?? ""}:${secrets.password ?? ""}`);
      headers.set("Authorization", `Basic ${encoded}`);
    }
    const sid = sessionIds.get(id);
    if (sid) headers.set("X-Transmission-Session-Id", sid);
    return fetch(url, { method: "POST", headers, body: requestBody, signal });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    let response = await doFetch(controller.signal);
    // CSRF challenge: capture the fresh token and replay once.
    if (response.status === 409) {
      const sid = response.headers.get("x-transmission-session-id");
      if (sid) {
        sessionIds.set(id, sid);
        response = await doFetch(controller.signal);
      }
    }
    if (!response.ok) {
      const clone = response.clone();
      const errorBody = await response
        .json()
        .catch(() => clone.text().catch(() => undefined));
      throw new HttpError(response.status, response.statusText, url, errorBody);
    }
    const json = (await response.json()) as { result?: string; arguments?: T };
    if (json.result !== "success") {
      throw new Error(`Transmission: ${json.result ?? "unknown error"}`);
    }
    return (json.arguments ?? ({} as T)) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapStatus(raw: RawTorrent): TorrentStatus {
  if (raw.error === ERROR_LOCAL) return "errored";
  switch (raw.status) {
    case STATUS_STOPPED:
      return "paused";
    case STATUS_CHECK:
      return "checking";
    case STATUS_CHECK_WAIT:
    case STATUS_DOWNLOAD_WAIT:
    case STATUS_SEED_WAIT:
      return "queued";
    case STATUS_DOWNLOAD:
      // Transmission keeps status 4 even with no peers; split on rate so the
      // badge distinguishes active downloads from stalled ones (rtorrent parity).
      return raw.rateDownload > 0 ? "downloading" : "stalled";
    case STATUS_SEED:
      return "seeding";
    default:
      return "other";
  }
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function rawToUnified(raw: RawTorrent): UnifiedTorrent {
  const status = mapStatus(raw);
  const labels = Array.isArray(raw.labels) ? raw.labels : [];
  const errorMessage = raw.errorString?.trim() ? raw.errorString : undefined;
  return {
    hash: str(raw.hashString),
    name: str(raw.name),
    sizeBytes: num(raw.totalSize),
    progress: Math.min(1, Math.max(0, num(raw.percentDone))),
    dlSpeed: num(raw.rateDownload),
    upSpeed: num(raw.rateUpload),
    // Transmission eta is seconds, or -1/-2 for unknown — the shared row treats
    // eta <= 0 as "no ETA", so negatives pass through unchanged.
    eta: num(raw.eta),
    ratio: raw.uploadRatio >= 0 ? num(raw.uploadRatio) : 0,
    status,
    statusLabel: status === "errored" && errorMessage ? errorMessage : capitalize(status),
    label: labels[0] ?? "",
    tags: labels.join(", "),
    addedOn: num(raw.addedDate),
    completedOn: raw.doneDate > 0 ? num(raw.doneDate) : undefined,
    savePath: str(raw.downloadDir),
    amountLeft: num(raw.leftUntilDone),
    downloaded: num(raw.downloadedEver),
    uploaded: num(raw.uploadedEver),
    errorMessage,
  };
}

// --- List ---
export async function getTransmissionTorrents(
  instanceId?: string,
  ids?: string[],
): Promise<UnifiedTorrent[]> {
  const args: Record<string, unknown> = { fields: LIST_FIELDS };
  if (ids) args.ids = ids;
  const res = await transmissionRpc<{ torrents?: RawTorrent[] }>(
    "torrent-get",
    args,
    instanceId,
  );
  if (!Array.isArray(res.torrents)) return [];
  return res.torrents.map(rawToUnified);
}

// --- Detail (files + trackers + per-torrent seed limits) ---
export async function getTransmissionTorrent(
  hash: string,
  instanceId?: string,
): Promise<TransmissionTorrentDetail | null> {
  const res = await transmissionRpc<{ torrents?: RawTorrent[] }>(
    "torrent-get",
    { fields: DETAIL_FIELDS, ids: [hash] },
    instanceId,
  );
  const raw = res.torrents?.[0];
  if (!raw) return null;

  const fileStats = raw.fileStats ?? [];
  const files: TransmissionFile[] = (raw.files ?? []).map((f, i) => ({
    name: f.name,
    length: num(f.length),
    bytesCompleted: num(fileStats[i]?.bytesCompleted ?? f.bytesCompleted),
  }));

  // Prefer trackerStats (richer: host + peer counts) and fall back to trackers.
  const trackers: TransmissionTracker[] = raw.trackerStats?.length
    ? raw.trackerStats.map((t) => ({
        announce: str(t.announce),
        host: t.host ?? t.sitename,
        seederCount: t.seederCount,
        leecherCount: t.leecherCount,
        lastAnnounceResult: t.lastAnnounceResult,
      }))
    : (raw.trackers ?? []).map((t) => ({ announce: str(t.announce), host: t.sitename }));

  return {
    torrent: rawToUnified(raw),
    files,
    trackers,
    seedRatioLimit: num(raw.seedRatioLimit),
    seedRatioMode: num(raw.seedRatioMode),
    seedIdleLimit: num(raw.seedIdleLimit),
    seedIdleMode: num(raw.seedIdleMode),
  };
}

// --- Global stats (current speeds + lifetime totals + effective limits) ---
export async function getTransmissionGlobalStats(
  instanceId?: string,
): Promise<TorrentGlobalStats> {
  const [stats, session] = await Promise.all([
    transmissionRpc<{
      downloadSpeed?: number;
      uploadSpeed?: number;
      "cumulative-stats"?: { downloadedBytes?: number; uploadedBytes?: number };
    }>("session-stats", undefined, instanceId),
    getTransmissionSession(instanceId),
  ]);

  // The effective limit is the alt limit while turtle mode is on, otherwise the
  // standard limit when its enable flag is set (0 = unlimited).
  const dlLimitKb = session.altSpeedEnabled
    ? session.altSpeedDown
    : session.speedLimitDownEnabled
      ? session.speedLimitDown
      : 0;
  const upLimitKb = session.altSpeedEnabled
    ? session.altSpeedUp
    : session.speedLimitUpEnabled
      ? session.speedLimitUp
      : 0;

  const cumulative = stats["cumulative-stats"] ?? {};
  return {
    dlSpeed: num(stats.downloadSpeed),
    upSpeed: num(stats.uploadSpeed),
    dlTotalLifetime: num(cumulative.downloadedBytes),
    upTotalLifetime: num(cumulative.uploadedBytes),
    dlLimit: dlLimitKb * BYTES_PER_KB,
    upLimit: upLimitKb * BYTES_PER_KB,
  };
}

// --- Session (speed limits + turtle mode), used by the speed-limits sheet ---
export async function getTransmissionSession(
  instanceId?: string,
): Promise<TransmissionSession> {
  const s = await transmissionRpc<Record<string, unknown>>(
    "session-get",
    undefined,
    instanceId,
  );
  return {
    speedLimitDown: num(s["speed-limit-down"]),
    speedLimitDownEnabled: bool(s["speed-limit-down-enabled"]),
    speedLimitUp: num(s["speed-limit-up"]),
    speedLimitUpEnabled: bool(s["speed-limit-up-enabled"]),
    altSpeedDown: num(s["alt-speed-down"]),
    altSpeedUp: num(s["alt-speed-up"]),
    altSpeedEnabled: bool(s["alt-speed-enabled"]),
  };
}

export async function setTransmissionSession(
  update: TransmissionSessionUpdate,
  instanceId?: string,
): Promise<void> {
  const args: Record<string, unknown> = {};
  if (update.speedLimitDown !== undefined)
    args["speed-limit-down"] = Math.max(0, Math.round(update.speedLimitDown));
  if (update.speedLimitDownEnabled !== undefined)
    args["speed-limit-down-enabled"] = update.speedLimitDownEnabled;
  if (update.speedLimitUp !== undefined)
    args["speed-limit-up"] = Math.max(0, Math.round(update.speedLimitUp));
  if (update.speedLimitUpEnabled !== undefined)
    args["speed-limit-up-enabled"] = update.speedLimitUpEnabled;
  if (update.altSpeedDown !== undefined)
    args["alt-speed-down"] = Math.max(0, Math.round(update.altSpeedDown));
  if (update.altSpeedUp !== undefined)
    args["alt-speed-up"] = Math.max(0, Math.round(update.altSpeedUp));
  if (update.altSpeedEnabled !== undefined)
    args["alt-speed-enabled"] = update.altSpeedEnabled;
  if (Object.keys(args).length === 0) return;
  await transmissionRpc("session-set", args, instanceId);
}

// --- Actions ---
export async function startTransmissionTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await transmissionRpc("torrent-start", { ids: hashes }, instanceId);
}

export async function stopTransmissionTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await transmissionRpc("torrent-stop", { ids: hashes }, instanceId);
}

export async function reannounceTransmissionTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await transmissionRpc("torrent-reannounce", { ids: hashes }, instanceId);
}

export async function removeTransmissionTorrents(
  hashes: string[],
  deleteData = false,
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await transmissionRpc(
    "torrent-remove",
    { ids: hashes, "delete-local-data": deleteData },
    instanceId,
  );
}

// --- Add ---
export async function addTransmissionTorrent(
  uriOrMagnet: string,
  opts: { label?: string; savePath?: string } = {},
  instanceId?: string,
): Promise<void> {
  const args: Record<string, unknown> = { filename: uriOrMagnet, paused: false };
  if (opts.savePath) args["download-dir"] = opts.savePath;
  if (opts.label) args.labels = [opts.label];
  await transmissionRpc("torrent-add", args, instanceId);
}

// --- Per-torrent share/seed limits ---
export async function setTransmissionShareLimits(
  hashes: string[],
  opts: {
    ratioMode: number;
    ratioLimit?: number;
    idleMode: number;
    idleLimit?: number;
  },
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  const args: Record<string, unknown> = {
    ids: hashes,
    seedRatioMode: opts.ratioMode,
    seedIdleMode: opts.idleMode,
  };
  if (opts.ratioLimit !== undefined) args.seedRatioLimit = opts.ratioLimit;
  if (opts.idleLimit !== undefined) args.seedIdleLimit = Math.round(opts.idleLimit);
  await transmissionRpc("torrent-set", args, instanceId);
}
