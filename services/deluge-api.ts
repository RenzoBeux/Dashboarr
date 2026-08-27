import { Platform } from "react-native";
import { buildUrl, HttpError } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import type {
  TorrentGlobalStats,
  TorrentStatus,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// Deluge's Web UI speaks JSON-RPC v1 over a single POST /json endpoint. Three
// things make it unlike every other client in this app, and all three are load-
// bearing here (verified against deluge-torrent/deluge across the 2.x tags):
//
//  1. EVERYTHING IS HTTP 200. Auth failures, unknown methods and daemon
//     exceptions all come back 200 with `{result: null, error: {message, code}}`.
//     Status codes tell you nothing; the error object does. Codes: 1 = not
//     authenticated, 2 = unknown method, 3 = local exception, 4 = daemon
//     exception, 5 = malformed request (bad JSON / bad Content-Type).
//
//  2. deluge-web IS A PROXY, NOT THE ENGINE. Until it has connected to a
//     `deluged` daemon its remote-method table is EMPTY, so every `core.*` and
//     `label.*` call answers "Unknown method" (code 2) — not an auth error, not
//     a connection error. Clients that don't know this misread it as "wrong
//     Deluge version". Hence ensureDaemon() below, and the code-2 retry.
//
//  3. Content-Type must be EXACTLY "application/json". Deluge <= 2.0.5 compares
//     the raw header with `!=`, so the `; charset=utf-8` most HTTP stacks append
//     is rejected outright. We set the bare value and never touch it again.
//
// Auth is a single WebUI PASSWORD (no username, no API key) exchanged for a
// `_session_id` cookie — the qBittorrent model, not Transmission's CSRF header,
// so the React Native cookie handling below mirrors services/qbittorrent-api.ts.

// iOS's NSURLSession strips Set-Cookie from response.headers and Android's
// OkHttp CookieJar usually consumes it before fetch sees it. When we can't read
// the value the platform jar still has it and re-attaches it, so we record a
// sentinel to remember "this instance is authenticated". Same trick as
// services/qbittorrent-api.ts.
const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

interface SessionEntry {
  cookie: string | null;
  // Whether deluge-web is known to be attached to a deluged daemon. Reset on
  // any code-2, because deluge-web can lose the daemon at any time.
  daemonReady: boolean;
  loginPromise: Promise<boolean> | null;
  daemonPromise: Promise<boolean> | null;
}

// One entry per Deluge instance UUID so two configured servers keep separate
// session + daemon state. Deliberately in-memory only (unlike qBittorrent's
// SecureStore-backed cookie): a Deluge re-login is one cheap request, there is
// no brute-force lockout to avoid, and the server-side session expires after a
// sliding hour anyway — so persisting it would buy nothing and leave a stale
// secret at rest.
const sessions = new Map<string, SessionEntry>();

const REQUEST_TIMEOUT = 15000;

// Monotonic JSON-RPC id. `id` is MANDATORY — Deluge reads method/params/id with
// plain [] indexing and a KeyError on any of them fails the request with code 5.
let nextRequestId = 1;

// --- Status keys. NEVER send an empty key list: Deluge reads that as "all
// keys" and returns files, peers, pieces and trackers for EVERY torrent, which
// is megabytes of JSON on a real library (the oldest known Deluge client bug).
// `save_path` rather than `download_location`: on 2.x it is a documented alias
// for the same value, and it is the only one of the two that exists as a status
// key on 1.3.
const LIST_FIELDS = [
  "name",
  "state",
  "progress",
  "total_size",
  "total_wanted",
  "total_done",
  "total_remaining",
  "download_payload_rate",
  "upload_payload_rate",
  "eta",
  "ratio",
  "all_time_download",
  "total_uploaded",
  "time_added",
  "completed_time",
  "save_path",
  "message",
  "label",
] as const;

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  "files",
  "file_progress",
  "trackers",
  "tracker_host",
  "tracker_status",
  "num_seeds",
  "total_seeds",
  "num_peers",
  "total_peers",
  "stop_at_ratio",
  "stop_ratio",
  "remove_at_ratio",
] as const;

// Deluge's complete state vocabulary (deluge/common.py TORRENT_STATE). There is
// no "Stalled" — a stalled torrent is state Downloading with a zero rate, which
// is exactly how Deluge's own sidebar models its "Active" filter.
type DelugeState =
  | "Allocating"
  | "Checking"
  | "Downloading"
  | "Seeding"
  | "Paused"
  | "Error"
  | "Queued"
  | "Moving";

// Deluge's `ratio` and `seeds_peers_ratio` return -1.0 to mean "infinite"
// (nothing downloaded yet). Rendering that raw shows "-1.00" on every freshly
// added torrent.
const RATIO_INFINITE = -1;

// Speed limits are FLOATS IN KiB/s and the unlimited sentinel is any NEGATIVE
// value — 0 is a real limit that throttles to a standstill.
const BYTES_PER_KIB = 1024;

interface RawTorrent {
  name?: string;
  state?: string;
  progress?: number;
  total_size?: number;
  total_wanted?: number;
  total_done?: number;
  total_remaining?: number;
  download_payload_rate?: number;
  upload_payload_rate?: number;
  eta?: number;
  ratio?: number;
  all_time_download?: number;
  total_uploaded?: number;
  time_added?: number;
  completed_time?: number;
  save_path?: string;
  message?: string;
  label?: string;
  files?: { index?: number; path?: string; size?: number }[];
  file_progress?: number[];
  trackers?: { url?: string; tier?: number }[];
  tracker_host?: string;
  tracker_status?: string;
  num_seeds?: number;
  total_seeds?: number;
  num_peers?: number;
  total_peers?: number;
  stop_at_ratio?: boolean;
  stop_ratio?: number;
  remove_at_ratio?: boolean;
}

export interface DelugeFile {
  path: string;
  size: number;
  // 0..1 — Deluge's file_progress is already a fraction, unlike `progress`.
  progress: number;
}

export interface DelugeTracker {
  url: string;
  tier?: number;
}

export interface DelugeTorrentDetail {
  torrent: UnifiedTorrent;
  files: DelugeFile[];
  trackers: DelugeTracker[];
  trackerHost: string;
  trackerStatus: string;
  seeds: string;
  peers: string;
  // Per-torrent share limits. Deluge has no "inherit global" sentinel: these are
  // copied from the global defaults when the torrent is added and are plain
  // per-torrent values afterwards.
  stopAtRatio: boolean;
  stopRatio: number;
  removeAtRatio: boolean;
}

// Global speed limits, in KiB/s as Deluge stores them. Negative = unlimited.
export interface DelugeSpeedLimits {
  maxDownload: number;
  maxUpload: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Deluge JSON-RPC error object — always exactly {message, code}. */
export class DelugeRpcError extends Error {
  constructor(
    public code: number,
    public rawMessage: string,
  ) {
    super(humanizeRpcError(code, rawMessage));
    this.name = "DelugeRpcError";
  }
}

// A code-4 (daemon-side) error message is a stringified Twisted Failure that
// embeds the real exception class and text plus a Python traceback:
//   "Failure: [Failure instance: Traceback: <class 'deluge.error.AddTorrentError'>:
//    Torrent already in session (abc…).\n<string>:6:<module>\n]"
// Every failing core.* call takes this path, so it is the normal error shape
// rather than an edge case. Pull the real class + message back out so users see
// "AddTorrentError: Torrent already in session" instead of a traceback.
const FAILURE_BLOB = /<class '([^']+)'>:\s*([^\n\]]+)/;

function humanizeRpcError(code: number, message: string): string {
  const match = FAILURE_BLOB.exec(message);
  if (match) {
    const cls = match[1].split(".").pop() ?? match[1];
    return `Deluge: ${cls}: ${match[2].trim()}`;
  }
  if (code === 1) return "Deluge: not authenticated";
  if (code === 2) {
    return "Deluge: the Web UI is not connected to the deluged daemon";
  }
  return `Deluge: ${message}`;
}

// Both of these mean "deluge-web has no working daemon connection, redo the
// handshake". Code 2 is the fresh-start case (the remote method table is still
// empty). The AttributeError is the after-a-disconnect case: the method table
// is never cleared, so the call reaches a null daemon proxy instead.
function needsDaemonReconnect(code: number, message: string): boolean {
  if (code === 2) return true;
  return code === 3 && message.includes("AttributeError: 'NoneType'");
}

function entryFor(instanceId: string): SessionEntry {
  let entry = sessions.get(instanceId);
  if (!entry) {
    entry = { cookie: null, daemonReady: false, loginPromise: null, daemonPromise: null };
    sessions.set(instanceId, entry);
  }
  return entry;
}

function resolveInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("deluge");
  if (!id) throw new Error("No Deluge instance configured");
  return id;
}

/**
 * Drop the cached session + daemon state for an instance (or all of them).
 * Called when the user saves new credentials so the next request re-logs in.
 */
export function delugeClearSession(instanceId?: string): void {
  if (instanceId) sessions.delete(instanceId);
  else sessions.clear();
}

interface RpcEnvelope<T> {
  result?: T | null;
  error?: { message?: string; code?: number } | null;
}

/** Resolve the /json endpoint and headers for one instance. */
function requestTarget(
  instanceId: string,
  attachCookie: boolean,
): { url: string; headers: Headers } {
  const store = useConfigStore.getState();
  const inst = store.getInstance("deluge", instanceId);
  if (!inst?.enabled) throw new Error("Deluge is not enabled");
  const baseUrl = store.getActiveUrl("deluge", instanceId);
  if (!baseUrl) throw new Error("No URL configured for Deluge");
  const url = buildUrl(baseUrl, SERVICE_DEFAULTS.deluge.apiBasePath, "");

  const headers = new Headers();
  // Custom headers first so a reverse proxy lets the call through, but never a
  // user-supplied Cookie — that would clobber the session id we manage.
  for (const [k, v] of Object.entries(store.getMergedHeaders("deluge", instanceId))) {
    if (k.toLowerCase() === "cookie") continue;
    headers.set(k, v);
  }
  // Bare value, no charset: Deluge <= 2.0.5 string-compares this header.
  headers.set("Content-Type", "application/json");
  if (attachCookie) {
    const cookie = entryFor(instanceId).cookie;
    if (cookie && cookie !== NATIVE_JAR_SENTINEL) {
      headers.set("Cookie", `_session_id=${cookie}`);
    }
  }
  return { url, headers };
}

async function postJsonRaw(
  url: string,
  headers: Headers,
  body: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { method: "POST", headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** One raw POST /json. No session/daemon handling — that lives in delugeRpc. */
async function postJson(
  instanceId: string,
  body: string,
): Promise<RpcEnvelope<unknown>> {
  const { url, headers } = requestTarget(instanceId, true);
  const response = await postJsonRaw(url, headers, body);
  if (!response.ok) {
    // 2.x answers every RPC-level failure with 200; a non-2xx here means the
    // HTTP layer itself (reverse proxy, wrong path) or a Deluge 1.3 daemon
    // exception, which is a bare 500 with an empty body.
    const clone = response.clone();
    const errorBody = await response
      .json()
      .catch(() => clone.text().catch(() => undefined));
    throw new HttpError(response.status, response.statusText, url, errorBody);
  }
  return (await response.json()) as RpcEnvelope<unknown>;
}

/**
 * Exchange the configured password for a `_session_id` cookie.
 * `auth.login` returns a bare boolean — the session id only ever travels in the
 * Set-Cookie header, never in the body.
 */
async function login(instanceId: string): Promise<boolean> {
  const store = useConfigStore.getState();
  const password = store.instanceSecrets[instanceId]?.password ?? "";
  const entry = entryFor(instanceId);
  // Send the login itself without a stale cookie attached.
  entry.cookie = null;

  const { url, headers } = requestTarget(instanceId, false);
  const response = await postJsonRaw(
    url,
    headers,
    JSON.stringify({ method: "auth.login", params: [password], id: nextRequestId++ }),
  );
  if (!response.ok) return false;

  // Read the cookie where the platform lets us; otherwise trust the native jar
  // to re-attach it and just record that we authenticated.
  if (Platform.OS !== "ios") {
    const setCookie = response.headers.get("set-cookie");
    const match = setCookie?.match(/_session_id=([^;]+)/);
    if (match?.[1]) entry.cookie = match[1];
  }

  const json = (await response.json()) as RpcEnvelope<boolean>;
  if (json.error || json.result !== true) {
    entry.cookie = null;
    return false;
  }

  if (!entry.cookie) entry.cookie = NATIVE_JAR_SENTINEL;
  return true;
}

/** Log in if we have no session, deduplicating concurrent attempts. */
async function ensureSession(instanceId: string): Promise<void> {
  const entry = entryFor(instanceId);
  if (entry.cookie) return;
  if (entry.loginPromise) {
    if (!(await entry.loginPromise)) throw new Error("Deluge authentication failed");
    return;
  }
  const p = login(instanceId);
  entry.loginPromise = p;
  try {
    if (!(await p)) throw new Error("Deluge authentication failed");
  } finally {
    entry.loginPromise = null;
  }
}

/**
 * Attach deluge-web to a deluged daemon if it isn't already. Without this every
 * `core.*` call answers "Unknown method" — see the module header. Deluge-web
 * auto-connects on startup only when its `default_daemon` config key is set,
 * which is why the failure is intermittent across installs.
 */
async function connectDaemon(instanceId: string): Promise<boolean> {
  const connected = await rawCall<boolean>(instanceId, "web.connected", []);
  if (connected === true) return true;

  // [host_id, hostname, port, username] tuples on 2.x.
  const hosts = await rawCall<unknown[]>(instanceId, "web.get_hosts", []);
  if (!Array.isArray(hosts) || hosts.length === 0) return false;
  const hostId = Array.isArray(hosts[0]) ? String(hosts[0][0] ?? "") : "";
  if (!hostId) return false;

  // web.connect returns the daemon's full method list on success. Its failure
  // path only LOGS and returns null, so a bad host id looks like a success —
  // the non-empty-array check is the only reliable signal.
  const methods = await rawCall<unknown>(instanceId, "web.connect", [hostId]);
  return Array.isArray(methods) && methods.length > 0;
}

async function ensureDaemon(instanceId: string): Promise<void> {
  const entry = entryFor(instanceId);
  if (entry.daemonReady) return;
  if (entry.daemonPromise) {
    if (!(await entry.daemonPromise)) {
      throw new Error(
        "Deluge's Web UI is not connected to the deluged daemon — connect it in the Deluge Web UI",
      );
    }
    return;
  }
  const p = connectDaemon(instanceId);
  entry.daemonPromise = p;
  try {
    const ok = await p;
    entry.daemonReady = ok;
    if (!ok) {
      throw new Error(
        "Deluge's Web UI is not connected to the deluged daemon — connect it in the Deluge Web UI",
      );
    }
  } finally {
    entry.daemonPromise = null;
  }
}

/** POST one method with the current session, without any retry logic. */
async function rawCall<T>(
  instanceId: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const json = await postJson(
    instanceId,
    JSON.stringify({ method, params, id: nextRequestId++ }),
  );
  if (json.error) {
    throw new DelugeRpcError(json.error.code ?? 0, json.error.message ?? "unknown error");
  }
  return (json.result ?? null) as T;
}

// `core.*` and `label.*` are proxied to the daemon; `web.*`, `auth.*` and
// `system.*` are handled by deluge-web itself and need no daemon.
function isDaemonMethod(method: string): boolean {
  return (
    method.startsWith("core.") ||
    method.startsWith("label.") ||
    method.startsWith("daemon.")
  );
}

/**
 * Call one Deluge JSON-RPC method, establishing the session and the daemon
 * connection as needed and recovering from both losing them.
 *
 * In demo mode the request is routed to the demo router, which dispatches off
 * the method name in the body (same as nzbget/rtorrent/transmission).
 */
async function delugeRpc<T>(
  method: string,
  params: unknown[] = [],
  instanceId?: string,
): Promise<T> {
  const id = resolveInstanceId(instanceId);
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    const body = JSON.stringify({ method, params, id: 1 });
    return (getDemoResponse("deluge", "", undefined, body) ?? undefined) as T;
  }

  const needsDaemon = isDaemonMethod(method);

  // The session/daemon setup has to live INSIDE the retried unit, not before
  // it: ensureDaemon issues real authenticated RPCs (web.connected,
  // web.get_hosts, web.connect), so an expired session surfaces as a code 1
  // thrown from the handshake just as easily as from the payload call. With the
  // setup hoisted out, that code 1 skipped the re-login below and — because
  // nothing cleared the stale cookie — every later call repeated it, wedging
  // the instance until the app restarted.
  // At most one recovery of EACH kind, never the same kind twice. Both can
  // legitimately fire in one call — a deluged restart that outlasts the web
  // session leaves the daemon detached AND the cookie expired — but each flag
  // only ever flips false → true, so this is bounded at two retries and cannot
  // loop.
  const attempt = async (triedAuth: boolean, triedDaemon: boolean): Promise<T> => {
    try {
      await ensureSession(id);
      if (needsDaemon) await ensureDaemon(id);
      return await rawCall<T>(id, method, params);
    } catch (err) {
      if (!(err instanceof DelugeRpcError)) throw err;

      // Session expired (or the server restarted and forgot it): re-login.
      // Dropping the whole entry also clears daemonReady, so the retry redoes
      // the handshake with the new cookie.
      if (err.code === 1 && !triedAuth) {
        sessions.delete(id);
        return attempt(true, triedDaemon);
      }

      // Daemon went away mid-session: redo the handshake.
      if (
        needsDaemon &&
        !triedDaemon &&
        needsDaemonReconnect(err.code, err.rawMessage)
      ) {
        entryFor(id).daemonReady = false;
        return attempt(triedAuth, true);
      }

      throw err;
    }
  };

  return attempt(false, false);
}

function mapStatus(state: string, downRate: number): TorrentStatus {
  switch (state as DelugeState) {
    case "Error":
      return "errored";
    case "Paused":
      return "paused";
    case "Queued":
      return "queued";
    case "Checking":
    case "Allocating":
      return "checking";
    case "Seeding":
      return "seeding";
    case "Downloading":
      // Deluge has no Stalled state, so split on the rate the way its own
      // "Active" sidebar filter does (rtorrent/Transmission parity).
      return downRate > 0 ? "downloading" : "stalled";
    case "Moving":
      return "other";
    default:
      return "other";
  }
}

function rawToUnified(hash: string, raw: RawTorrent): UnifiedTorrent {
  const state = str(raw.state);
  const downRate = num(raw.download_payload_rate);
  const status = mapStatus(state, downRate);

  // Deluge forces progress to 100.0 whenever the state is Error, so an errored
  // torrent reports itself complete. Recompute from the byte counters there, or
  // a half-downloaded failure lands in the "Done" filter at a full bar.
  const wanted = num(raw.total_wanted) || num(raw.total_size);
  const progress =
    status === "errored"
      ? wanted > 0
        ? num(raw.total_done) / wanted
        : 0
      : num(raw.progress) / 100;

  // `message` is the literal string "OK" when healthy, so only surface it as an
  // error when the torrent is actually in the Error state.
  const message = str(raw.message).trim();
  const errorMessage =
    status === "errored" && message && message !== "OK" ? message : undefined;

  const ratio = num(raw.ratio);

  return {
    hash,
    name: str(raw.name),
    sizeBytes: num(raw.total_size),
    progress: Math.min(1, Math.max(0, progress)),
    dlSpeed: downRate,
    upSpeed: num(raw.upload_payload_rate),
    // Seconds. Deluge uses 0 for "unknown" and clamps anything over a year to
    // -1; the shared row treats eta <= 0 as "no ETA", so both pass through.
    eta: num(raw.eta),
    ratio: ratio === RATIO_INFINITE ? 0 : ratio,
    status,
    statusLabel: errorMessage ?? (state || "Unknown"),
    label: str(raw.label),
    // Deluge labels are single-valued, so there is no separate tag list.
    tags: "",
    addedOn: num(raw.time_added),
    completedOn: num(raw.completed_time) > 0 ? num(raw.completed_time) : undefined,
    savePath: str(raw.save_path),
    amountLeft: num(raw.total_remaining),
    downloaded: num(raw.all_time_download),
    uploaded: num(raw.total_uploaded),
    errorMessage,
  };
}

// core.get_torrents_status answers with a dict keyed by info hash, not an array.
function mapTorrentDict(dict: Record<string, RawTorrent> | null): UnifiedTorrent[] {
  if (!dict || typeof dict !== "object") return [];
  const out: UnifiedTorrent[] = [];
  for (const [hash, raw] of Object.entries(dict)) {
    // When deluge-web's cached state desyncs from the daemon (typically after
    // deluged restarts under it) entries come back with a null hash AND name.
    // Skip them rather than render blank rows — Sonarr hit this repeatedly.
    if (!hash || !raw || !str(raw.name)) continue;
    out.push(rawToUnified(hash, raw));
  }
  return out;
}

// --- List ---
export async function getDelugeTorrents(
  instanceId?: string,
): Promise<UnifiedTorrent[]> {
  const res = await delugeRpc<Record<string, RawTorrent> | null>(
    "core.get_torrents_status",
    [{}, LIST_FIELDS],
    instanceId,
  );
  return mapTorrentDict(res);
}

// --- Detail (files + trackers + per-torrent share limits) ---
export async function getDelugeTorrent(
  hash: string,
  instanceId?: string,
): Promise<DelugeTorrentDetail | null> {
  // Deluge normalizes every info hash to lowercase hex, and every id we send
  // back has to match that casing.
  const id = hash.toLowerCase();
  // Singular get_torrent_status returns the status dict directly (no hash-keyed
  // wrapper) and takes the id as a plain argument, so there is no filter-field
  // guesswork the way there would be with get_torrents_status.
  const raw = await delugeRpc<RawTorrent | null>(
    "core.get_torrent_status",
    [id, DETAIL_FIELDS],
    instanceId,
  );
  if (!raw || !str(raw.name)) return null;

  const progressList = Array.isArray(raw.file_progress) ? raw.file_progress : [];
  const files: DelugeFile[] = (raw.files ?? []).map((f, i) => ({
    path: str(f.path),
    size: num(f.size),
    // file_progress is already 0..1, unlike the torrent-level `progress`.
    progress: Math.min(1, Math.max(0, num(progressList[i]))),
  }));

  const trackers: DelugeTracker[] = (raw.trackers ?? [])
    .filter((t) => str(t.url).length > 0)
    .map((t) => ({ url: str(t.url), tier: t.tier }));

  const pair = (connected: unknown, total: unknown) =>
    `${num(connected)} / ${num(total)}`;

  return {
    torrent: rawToUnified(id, raw),
    files,
    trackers,
    trackerHost: str(raw.tracker_host),
    trackerStatus: str(raw.tracker_status),
    seeds: pair(raw.num_seeds, raw.total_seeds),
    peers: pair(raw.num_peers, raw.total_peers),
    stopAtRatio: raw.stop_at_ratio === true,
    stopRatio: num(raw.stop_ratio),
    removeAtRatio: raw.remove_at_ratio === true,
  };
}

// --- Global stats ---
export async function getDelugeGlobalStats(
  instanceId?: string,
): Promise<TorrentGlobalStats> {
  // Two calls: live rates come from the session status, the configured ceilings
  // from the core config. Deluge has no batch RPC, so they run in parallel.
  //
  // The legacy libtorrent key names are deliberate: Deluge 2.x translates them
  // to the new `net.*` names via its own back-compat map, while 1.3 only knows
  // the old ones — so the old names are the portable choice. Unknown keys are
  // silently dropped rather than raising, which would read as a zero.
  const [status, limits] = await Promise.all([
    delugeRpc<Record<string, number> | null>(
      "core.get_session_status",
      [
        [
          "payload_download_rate",
          "payload_upload_rate",
          "total_payload_download",
          "total_payload_upload",
        ],
      ],
      instanceId,
    ),
    getDelugeSpeedLimits(instanceId),
  ]);

  const s = status ?? {};
  return {
    dlSpeed: num(s.payload_download_rate),
    upSpeed: num(s.payload_upload_rate),
    // Session totals — Deluge keeps no counter that survives a deluged restart.
    dlTotalLifetime: num(s.total_payload_download),
    upTotalLifetime: num(s.total_payload_upload),
    dlLimit: kibLimitToBytes(limits.maxDownload),
    upLimit: kibLimitToBytes(limits.maxUpload),
  };
}

// The adapter surface is bytes/s with 0 meaning unlimited; Deluge's is KiB/s
// with any NEGATIVE value meaning unlimited (0 is a real limit that stops
// transfer dead).
function kibLimitToBytes(kib: number): number {
  return kib < 0 ? 0 : kib * BYTES_PER_KIB;
}

// --- Global speed limits (the speed-limits sheet) ---
export async function getDelugeSpeedLimits(
  instanceId?: string,
): Promise<DelugeSpeedLimits> {
  const res = await delugeRpc<Record<string, number> | null>(
    "core.get_config_values",
    [["max_download_speed", "max_upload_speed"]],
    instanceId,
  );
  const c = res ?? {};
  return {
    maxDownload: typeof c.max_download_speed === "number" ? c.max_download_speed : -1,
    maxUpload: typeof c.max_upload_speed === "number" ? c.max_upload_speed : -1,
  };
}

export async function setDelugeSpeedLimits(
  update: Partial<DelugeSpeedLimits>,
  instanceId?: string,
): Promise<void> {
  const config: Record<string, number> = {};
  if (update.maxDownload !== undefined) config.max_download_speed = update.maxDownload;
  if (update.maxUpload !== undefined) config.max_upload_speed = update.maxUpload;
  if (Object.keys(config).length === 0) return;
  await delugeRpc("core.set_config", [config], instanceId);
}

// --- Actions ---
// Deluge 2.x's pause_torrent/resume_torrent take a SINGLE id; the plural forms
// take a list and are what multi-select needs. Passing the list explicitly
// matters: calling pause_torrents with NO argument pauses the entire session.
const lower = (hashes: string[]): string[] => hashes.map((h) => h.toLowerCase());

export async function pauseDelugeTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await delugeRpc("core.pause_torrents", [lower(hashes)], instanceId);
}

export async function resumeDelugeTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await delugeRpc("core.resume_torrents", [lower(hashes)], instanceId);
}

export async function reannounceDelugeTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  await delugeRpc("core.force_reannounce", [lower(hashes)], instanceId);
}

export async function removeDelugeTorrents(
  hashes: string[],
  deleteData = false,
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  // core.remove_torrents collects per-id failures instead of raising: an EMPTY
  // list means everything succeeded, a non-empty one is a partial failure of
  // [torrent_id, error_message] pairs. (The singular remove_torrent is the
  // opposite — it returns true and raises on a bad id.)
  const failures = await delugeRpc<unknown>(
    "core.remove_torrents",
    [lower(hashes), deleteData],
    instanceId,
  );
  if (Array.isArray(failures) && failures.length > 0) {
    const reason = failures
      .map((f) => (Array.isArray(f) ? str(f[1]) : ""))
      .filter(Boolean)
      .join("; ");
    throw new Error(
      reason
        ? `Deluge could not remove ${failures.length} torrent(s): ${reason}`
        : `Deluge could not remove ${failures.length} torrent(s)`,
    );
  }
}

// --- Add ---
export async function addDelugeTorrent(
  uriOrMagnet: string,
  opts: { label?: string; savePath?: string } = {},
  instanceId?: string,
): Promise<void> {
  const uri = uriOrMagnet.trim();
  if (!uri) return;

  // The options dict key is `download_location`; `save_path` is a read-only
  // status alias and is silently ignored here.
  const options: Record<string, unknown> = { add_paused: false };
  if (opts.savePath) options.download_location = opts.savePath;

  // Magnets go to add_torrent_magnet; an http(s) .torrent link goes to
  // add_torrent_url, which makes the daemon fetch the file itself.
  const isMagnet = /^magnet:/i.test(uri);
  const hash = await delugeRpc<string | null>(
    isMagnet ? "core.add_torrent_magnet" : "core.add_torrent_url",
    [uri, options],
    instanceId,
  );

  // A null id means the add failed — most often because the torrent is already
  // in the session. (2.x usually raises AddTorrentError instead, which surfaces
  // through delugeRpc; the null is the older/quieter path.)
  if (!hash || typeof hash !== "string") {
    throw new Error("Deluge did not add the torrent — it may already be in the session");
  }

  if (opts.label) await applyLabel(hash, opts.label, instanceId);
}

/**
 * Best-effort label assignment after an add. Deluge's Label plugin is optional,
 * so this must never fail an otherwise-successful add: with the plugin disabled
 * `label.*` doesn't exist and answers "Unknown method".
 *
 * Two ordering rules from the plugin's own guards: the torrent must already
 * exist (so this runs after the add returns its id), and `label.add` lowercases
 * the id while `label.set_torrent` does not — so "Radarr" added then set
 * verbatim fails with "Unknown Label". We lowercase both.
 */
async function applyLabel(
  hash: string,
  label: string,
  instanceId?: string,
): Promise<void> {
  const id = label.trim().toLowerCase();
  if (!id) return;
  try {
    // Creating a label that already exists raises; that's the expected path.
    await delugeRpc("label.add", [id], instanceId).catch(() => undefined);
    await delugeRpc("label.set_torrent", [hash.toLowerCase(), id], instanceId);
  } catch {
    // Plugin disabled or the label was rejected — the torrent is still added.
  }
}

// --- Per-torrent share limits ---
export async function setDelugeShareLimits(
  hashes: string[],
  opts: { stopAtRatio: boolean; stopRatio?: number; removeAtRatio: boolean },
  instanceId?: string,
): Promise<void> {
  if (hashes.length === 0) return;
  const options: Record<string, unknown> = {
    stop_at_ratio: opts.stopAtRatio,
    remove_at_ratio: opts.removeAtRatio,
  };
  if (opts.stopRatio !== undefined) options.stop_ratio = opts.stopRatio;
  // set_torrent_options silently drops keys it doesn't recognise and returns
  // null either way, so there is no success signal beyond re-reading the state.
  await delugeRpc("core.set_torrent_options", [lower(hashes), options], instanceId);
}
