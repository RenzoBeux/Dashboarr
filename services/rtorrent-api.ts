import { serviceRequest } from "@/lib/http-client";
import {
  buildMethodCall,
  buildSystemMulticall,
  parseMethodResponse,
  type XmlRpcParam,
} from "@/lib/xmlrpc";
import type {
  TorrentGlobalStats,
  TorrentStatus,
  UnifiedTorrent,
} from "@/lib/torrent-adapter";

// d.multicall2 field getters, in the exact column order the row mapper below
// destructures. Each trailing "=" means "call this getter and return its value"
// (the multicall column syntax). Keep this in sync with the demo fixtures in
// lib/demo-data.ts (DEMO_RTORRENT_ROWS).
const D_FIELDS = [
  "d.hash=",
  "d.name=",
  "d.size_bytes=",
  "d.bytes_done=",
  "d.completed_bytes=",
  "d.left_bytes=",
  "d.down.rate=",
  "d.up.rate=",
  "d.state=",
  "d.is_active=",
  "d.complete=",
  "d.hashing=",
  "d.is_hash_checking=",
  "d.ratio=",
  "d.message=",
  "d.custom1=",
  "d.directory=",
  "d.base_path=",
  "d.timestamp.started=",
] as const;

const str = (v: string): XmlRpcParam => ({ t: "string", v });

// POST a single XML-RPC method. serviceRequest returns response.text() for the
// text/xml response, which we hand to the parser. In demo mode the demo router
// returns canned XML, so the same parse path runs.
async function rpc(
  method: string,
  params: XmlRpcParam[],
  instanceId?: string,
): Promise<unknown> {
  const text = await serviceRequest<string>("rtorrent", "", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: buildMethodCall(method, params),
    instanceId,
  });
  return parseMethodResponse(text);
}

async function rpcMulticall(
  calls: { method: string; params: XmlRpcParam[] }[],
  instanceId?: string,
): Promise<unknown> {
  const text = await serviceRequest<string>("rtorrent", "", {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: buildSystemMulticall(calls),
    instanceId,
  });
  return parseMethodResponse(text);
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

// rtorrent exposes no single status field and no "is errored" boolean — only
// d.message, which carries BOTH genuine failures AND routine, benign tracker
// chatter ("Tried all trackers.", "Timeout was reached"). So derive the real
// transfer state from the flags FIRST (first match wins — a hash check suspends
// transfer, so it outranks downloading/seeding) and only fall back to "errored"
// for a torrent that is genuinely stuck: started, active, incomplete, making no
// progress, AND carrying a message. A seeding/downloading/checking/paused
// torrent keeps its real state even with a message (the message is still
// surfaced via errorMessage), so normal tracker notes no longer paint healthy
// torrents red. See #20 review.
export function deriveStatus(row: {
  message: string;
  hashing: number;
  isHashChecking: number;
  state: number;
  isActive: number;
  complete: number;
  downRate: number;
}): TorrentStatus {
  if (row.hashing !== 0 || row.isHashChecking !== 0) return "checking";
  if (row.state === 0) return "paused"; // stopped (closed)
  if (row.isActive === 0) return "paused"; // started but paused
  if (row.complete === 1) return "seeding";
  if (row.downRate > 0) return "downloading";
  // Started, active, incomplete, no download progress. rtorrent's only failure
  // signal is a message, so a message here means a real stall/error; an empty
  // message is just a stalled (no-peers) torrent.
  return row.message.trim().length > 0 ? "errored" : "stalled";
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function rowToUnified(r: unknown[]): UnifiedTorrent {
  const hash = text(r[0]).toUpperCase();
  const name = text(r[1]);
  const sizeBytes = num(r[2]);
  const bytesDone = num(r[3]);
  const completedBytes = num(r[4]);
  const leftBytes = num(r[5]);
  const downRate = num(r[6]);
  const upRate = num(r[7]);
  const state = num(r[8]);
  const isActive = num(r[9]);
  const complete = num(r[10]);
  const hashing = num(r[11]);
  const isHashChecking = num(r[12]);
  const ratio = num(r[13]) / 1000; // d.ratio is per-mille
  const message = text(r[14]);
  const label = text(r[15]);
  const directory = text(r[16]);
  const basePath = text(r[17]);
  const started = num(r[18]);

  const status = deriveStatus({
    message,
    hashing,
    isHashChecking,
    state,
    isActive,
    complete,
    downRate,
  });
  const downloaded = completedBytes || bytesDone;

  return {
    hash,
    name,
    sizeBytes,
    progress: sizeBytes > 0 ? Math.min(1, bytesDone / sizeBytes) : 0,
    dlSpeed: downRate,
    upSpeed: upRate,
    // No ETA field in rtorrent — derive from remaining / current rate.
    eta: downRate > 0 && leftBytes > 0 ? Math.round(leftBytes / downRate) : -1,
    ratio,
    status,
    statusLabel: status === "errored" ? message : capitalize(status),
    label,
    tags: "",
    addedOn: started,
    completedOn: undefined,
    savePath: basePath || directory,
    amountLeft: leftBytes,
    downloaded,
    // rtorrent exposes no cheap per-torrent upload total; approximate from ratio.
    uploaded: Math.round(downloaded * ratio),
    errorMessage: message || undefined,
  };
}

// --- List ---
export async function getRtorrentTorrents(
  instanceId?: string,
): Promise<UnifiedTorrent[]> {
  const args: XmlRpcParam[] = [
    str(""), // target (REQUIRED empty placeholder)
    str("main"), // view
    ...D_FIELDS.map((f) => str(f)),
  ];
  const rows = (await rpc("d.multicall2", args, instanceId)) as unknown[];
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => rowToUnified(r as unknown[]));
}

// --- Global stats ---
export async function getRtorrentGlobalStats(
  instanceId?: string,
): Promise<TorrentGlobalStats> {
  // Batch the six scalar getters in one round-trip. Each global getter takes a
  // single empty-target arg.
  const res = (await rpcMulticall(
    [
      { method: "throttle.global_down.rate", params: [str("")] },
      { method: "throttle.global_up.rate", params: [str("")] },
      { method: "throttle.global_down.total", params: [str("")] },
      { method: "throttle.global_up.total", params: [str("")] },
      { method: "throttle.global_down.max_rate", params: [str("")] },
      { method: "throttle.global_up.max_rate", params: [str("")] },
    ],
    instanceId,
  )) as unknown[];
  // Each system.multicall entry is a single-element array [value] (or, on a
  // faulting sub-call, a {faultCode,faultString} struct — tolerated as 0).
  const at = (i: number): number => {
    const e = Array.isArray(res) ? res[i] : undefined;
    const v = Array.isArray(e) ? e[0] : e;
    return num(v);
  };
  return {
    dlSpeed: at(0),
    upSpeed: at(1),
    dlTotalLifetime: at(2),
    upTotalLifetime: at(3),
    dlLimit: at(4), // max_rate getters return bytes/s
    upLimit: at(5),
  };
}

// --- Actions (batched via system.multicall) ---
export async function startTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  // start = d.open + d.start + d.resume per hash.
  const calls = hashes.flatMap((h) => [
    { method: "d.open", params: [str(h)] },
    { method: "d.start", params: [str(h)] },
    { method: "d.resume", params: [str(h)] },
  ]);
  if (calls.length) await rpcMulticall(calls, instanceId);
}

export async function stopTorrents(
  hashes: string[],
  instanceId?: string,
): Promise<void> {
  // stop = d.stop + d.close per hash.
  const calls = hashes.flatMap((h) => [
    { method: "d.stop", params: [str(h)] },
    { method: "d.close", params: [str(h)] },
  ]);
  if (calls.length) await rpcMulticall(calls, instanceId);
}

export async function eraseTorrents(
  hashes: string[],
  deleteData = false,
  instanceId?: string,
): Promise<void> {
  const calls = hashes.flatMap((h) => {
    if (!deleteData) return [{ method: "d.erase", params: [str(h)] }];
    // WITH data: set the erasedata marker (custom5), unlink the .torrent, then
    // erase. Files are only removed if ruTorrent's erasedata plugin is wired
    // into rtorrent's event hooks — without it this is an erase-only.
    return [
      { method: "d.custom5.set", params: [str(h), str("1")] },
      { method: "d.delete_tied", params: [str(h)] },
      { method: "d.erase", params: [str(h)] },
    ];
  });
  if (calls.length) await rpcMulticall(calls, instanceId);
}

// --- Add ---
// savePath/label are interpolated into rtorrent COMMAND strings
// (d.directory.set="…" / d.custom1.set=…) that rtorrent's own parser evaluates
// AFTER XML decoding — a layer escapeXml (XML-only) does not protect. rtorrent
// offers no escape there, so strip the characters that would break out of the
// argument: a double-quote closes the quoted literal early and a control char
// (newline, CR, NUL, …) ends/splits the command. Paths/labels containing these
// are exceedingly rare; stripping is safer than silently corrupting the add.
export function sanitizeCommandArg(s: string): string {
  // Path/label chars (spaces, hyphens, slashes, …) are preserved; only the
  // double-quote and ASCII control chars are dropped.
  let out = "";
  for (const ch of s) {
    if (ch === '"' || ch.charCodeAt(0) < 0x20) continue;
    out += ch;
  }
  return out;
}

export async function addRtorrentTorrent(
  uriOrMagnet: string,
  opts: { label?: string; savePath?: string } = {},
  instanceId?: string,
): Promise<void> {
  // load.start("", "<uri>", ["d.directory.set=...", "d.custom1.set=LABEL"]).
  // The EMPTY first target arg is REQUIRED — passing the magnet as the first
  // arg makes rtorrent treat it as the target and fail ("Could not find
  // info-hash").
  const params: XmlRpcParam[] = [str(""), str(uriOrMagnet)];
  const savePath = opts.savePath ? sanitizeCommandArg(opts.savePath) : "";
  const label = opts.label ? sanitizeCommandArg(opts.label) : "";
  if (savePath) params.push(str(`d.directory.set="${savePath}"`));
  if (label) params.push(str(`d.custom1.set=${label}`));
  await rpc("load.start", params, instanceId);
}

// --- Global speed limits (KiB/s setters; 0 = unlimited) ---
export async function setRtorrentGlobalLimits(
  limits: { dlKib?: number; upKib?: number },
  instanceId?: string,
): Promise<void> {
  const calls: { method: string; params: XmlRpcParam[] }[] = [];
  if (limits.dlKib !== undefined) {
    calls.push({
      method: "throttle.global_down.max_rate.set_kb",
      params: [str(""), { t: "i8", v: Math.max(0, Math.round(limits.dlKib)) }],
    });
  }
  if (limits.upKib !== undefined) {
    calls.push({
      method: "throttle.global_up.max_rate.set_kb",
      params: [str(""), { t: "i8", v: Math.max(0, Math.round(limits.upKib)) }],
    });
  }
  if (calls.length) await rpcMulticall(calls, instanceId);
}
