import { XMLParser } from "fast-xml-parser";
import { useConfigStore } from "@/store/config-store";
import { getDemoResponse } from "@/lib/demo-data";
import type { RTTorrent, RTTorrentFile, RTTorrentTracker, RTTransferInfo } from "@/lib/types";

// --- XML-RPC builder ---

type XmlRpcParam = string | number;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlRpcString(v: string): string {
  return `<value><string>${escapeXml(v)}</string></value>`;
}

function xmlRpcParam(v: XmlRpcParam): string {
  if (typeof v === "number") return `<value><i8>${Math.trunc(v)}</i8></value>`;
  return xmlRpcString(v);
}

function buildXmlRpcCall(methodName: string, params: XmlRpcParam[]): string {
  const paramsXml = params.map((p) => `<param>${xmlRpcParam(p)}</param>`).join("");
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(methodName)}</methodName><params>${paramsXml}</params></methodCall>`;
}

function buildSystemMulticall(calls: Array<{ method: string; params: XmlRpcParam[] }>): string {
  const items = calls
    .map((c) => {
      const paramsXml = c.params.map(xmlRpcParam).join("");
      return `<value><struct>
<member><name>methodName</name>${xmlRpcString(c.method)}</member>
<member><name>params</name><value><array><data>${paramsXml}</data></array></value></member>
</struct></value>`;
    })
    .join("");
  return `<?xml version="1.0"?><methodCall><methodName>system.multicall</methodName><params><param><value><array><data>${items}</data></array></value></param></params></methodCall>`;
}

// --- XML-RPC response parser ---

const XMLRPC_PARSER = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: true,
  isArray: (name) => name === "value" || name === "member",
  numberParseOptions: { leadingZeros: false, hex: false },
  removeNSPrefix: true,
});

function parseXmlRpcValueNode(node: unknown): unknown {
  if (node === undefined || node === null) return null;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return node;
  const n = node as Record<string, unknown>;
  if ("string" in n) return String(n.string ?? "");
  if ("i8" in n) return Number(n.i8);
  if ("i4" in n) return Number(n.i4);
  if ("int" in n) return Number(n.int);
  if ("double" in n) return Number(n.double);
  if ("boolean" in n) return n.boolean === 1 || n.boolean === "1" || n.boolean === true;
  if ("array" in n) {
    const data = (n.array as Record<string, unknown> | null)?.data as Record<string, unknown> | null;
    if (!data || !("value" in data)) return [];
    const values = Array.isArray(data.value) ? data.value : [data.value];
    return values.map(parseXmlRpcValueNode);
  }
  if ("struct" in n) {
    const result: Record<string, unknown> = {};
    const members = (n.struct as Record<string, unknown>)?.member;
    if (!members) return result;
    const memberList = Array.isArray(members) ? members : [members];
    for (const m of memberList) {
      if (!m) continue;
      const mb = m as Record<string, unknown>;
      const valueArr = mb.value;
      const vNode = Array.isArray(valueArr) ? valueArr[0] : valueArr;
      result[String(mb.name)] = parseXmlRpcValueNode(vNode);
    }
    return result;
  }
  return node;
}

function parseXmlRpcResponse(xml: string): unknown {
  const doc = XMLRPC_PARSER.parse(xml) as Record<string, unknown>;
  const mr = doc.methodResponse as Record<string, unknown>;
  if (mr.fault) {
    const faultVal = ((mr.fault as Record<string, unknown>).value as unknown[]) ?? [];
    const fault = parseXmlRpcValueNode(faultVal[0]) as Record<string, unknown>;
    const message = fault?.faultString ?? JSON.stringify(fault);
    throw new Error(`rTorrent error: ${message}`);
  }
  const params = mr.params as Record<string, unknown>;
  const param = params.param;
  const paramItem = Array.isArray(param) ? param[0] : param;
  const valueArr = (paramItem as Record<string, unknown>).value;
  const valueNode = Array.isArray(valueArr) ? valueArr[0] : valueArr;
  return parseXmlRpcValueNode(valueNode);
}

// --- HTTP transport ---

const DEFAULT_TIMEOUT = 15000;

async function rtRequest(body: string): Promise<unknown> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return null; // caller uses demo data via getDemoResponse
  }

  const baseUrl = store.getActiveUrl("rtorrent");
  if (!baseUrl) throw new Error("No URL configured for rTorrent");

  const secrets = store.secrets.rtorrent;
  const headers = new Headers({ "Content-Type": "application/xml" });
  if (secrets.username && secrets.password) {
    headers.set("Authorization", `Basic ${btoa(`${secrets.username}:${secrets.password}`)}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`rTorrent request failed: ${response.status}`);
    const text = await response.text();
    return parseXmlRpcResponse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- State helper ---

export function rtorrentStateToLabel(t: RTTorrent): import("@/lib/types").RTorrentState {
  if (t.is_open === 0) return "stopped";
  if (t.is_active === 0) return "paused";
  if (t.complete === 1) return "seeding";
  return "downloading";
}

// --- Field definitions (positional — order must match d.multicall2 call) ---

const TORRENT_FIELDS = [
  "d.name=",
  "d.hash=",
  "d.size_bytes=",
  "d.bytes_done=",
  "d.down.rate=",
  "d.up.rate=",
  "d.state=",
  "d.is_active=",
  "d.is_open=",
  "d.complete=",
  "d.ratio=",
  "d.peers_connected=",
  "d.timestamp.started=",
  "d.timestamp.finished=",
  "d.custom1=",
  "d.base_path=",
];

function mapTorrentFields(fields: unknown[]): RTTorrent {
  return {
    name: String(fields[0] ?? ""),
    hash: String(fields[1] ?? ""),
    size: Number(fields[2] ?? 0),
    bytes_done: Number(fields[3] ?? 0),
    dl_rate: Number(fields[4] ?? 0),
    up_rate: Number(fields[5] ?? 0),
    state: Number(fields[6] ?? 0),
    is_active: Number(fields[7] ?? 0),
    is_open: Number(fields[8] ?? 0),
    complete: Number(fields[9] ?? 0),
    ratio: Number(fields[10] ?? 0),
    peers_connected: Number(fields[11] ?? 0),
    timestamp_started: Number(fields[12] ?? 0),
    timestamp_finished: Number(fields[13] ?? 0),
    label: String(fields[14] ?? ""),
    base_path: String(fields[15] ?? ""),
  };
}

type RTorrentFilter = "all" | "downloading" | "seeding" | "completed" | "paused";

const FILTER_VIEW: Record<RTorrentFilter, string> = {
  all: "main",
  downloading: "leeching",
  seeding: "seeding",
  completed: "complete",
  paused: "stopped",
};

// --- API functions ---

export async function getRtTransferInfo(): Promise<RTTransferInfo> {
  const store = useConfigStore.getState();
  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return getDemoResponse("rtorrent", "transfer") as RTTransferInfo;
  }

  const body = buildSystemMulticall([
    { method: "throttle.global_down.rate", params: [] },
    { method: "throttle.global_up.rate", params: [] },
    { method: "throttle.global_down.total", params: [] },
    { method: "throttle.global_up.total", params: [] },
  ]);
  const results = (await rtRequest(body)) as unknown[][];
  return {
    dl_rate: Number((results[0] as unknown[])[0] ?? 0),
    up_rate: Number((results[1] as unknown[])[0] ?? 0),
    dl_total: Number((results[2] as unknown[])[0] ?? 0),
    up_total: Number((results[3] as unknown[])[0] ?? 0),
  };
}

export async function getRtTorrents(filter?: RTorrentFilter): Promise<RTTorrent[]> {
  const store = useConfigStore.getState();
  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return getDemoResponse("rtorrent", "torrents") as RTTorrent[];
  }

  const view = FILTER_VIEW[filter ?? "all"];
  const body = buildXmlRpcCall("d.multicall2", ["", view, ...TORRENT_FIELDS]);
  const results = (await rtRequest(body)) as unknown[][];
  if (!Array.isArray(results)) {
    return [];
  }
  return results.map((fields) => mapTorrentFields(fields as unknown[]));
}

export async function getRtTorrentFiles(hash: string): Promise<RTTorrentFile[]> {
  const store = useConfigStore.getState();
  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return [];
  }

  const body = buildXmlRpcCall("f.multicall", [
    hash,
    "",
    "f.path=",
    "f.size_bytes=",
    "f.completed_chunks=",
    "f.size_chunks=",
    "f.priority=",
  ]);
  const results = (await rtRequest(body)) as unknown[][];
  if (!Array.isArray(results)) return [];
  return results.map((fields) => ({
    path: String((fields as unknown[])[0] ?? ""),
    size_bytes: Number((fields as unknown[])[1] ?? 0),
    completed_chunks: Number((fields as unknown[])[2] ?? 0),
    size_chunks: Number((fields as unknown[])[3] ?? 1),
    priority: Number((fields as unknown[])[4] ?? 0),
  }));
}

export async function getRtTorrentTrackers(hash: string): Promise<RTTorrentTracker[]> {
  const store = useConfigStore.getState();
  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return [];
  }

  const body = buildXmlRpcCall("t.multicall", [
    hash,
    "",
    "t.url=",
    "t.scrape_time_last=",
    "t.scrape_complete=",
    "t.scrape_incomplete=",
  ]);
  const results = (await rtRequest(body)) as unknown[][];
  if (!Array.isArray(results)) return [];
  return results.map((fields) => ({
    url: String((fields as unknown[])[0] ?? ""),
    activity_time_last: Number((fields as unknown[])[1] ?? 0),
    scrape_complete: Number((fields as unknown[])[2] ?? 0),
    scrape_incomplete: Number((fields as unknown[])[3] ?? 0),
  }));
}

export async function pauseRtTorrents(hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  const body = buildSystemMulticall(hashes.map((h) => ({ method: "d.stop", params: [h] })));
  await rtRequest(body);
}

export async function resumeRtTorrents(hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  const body = buildSystemMulticall(hashes.map((h) => ({ method: "d.start", params: [h] })));
  await rtRequest(body);
}

export async function deleteRtTorrents(
  hashes: string[],
  deleteFiles = false,
  basePaths?: string[],
): Promise<void> {
  if (!hashes.length) return;

  if (deleteFiles && basePaths && basePaths.length === hashes.length) {
    const calls: Array<{ method: string; params: XmlRpcParam[] }> = [];
    for (let i = 0; i < hashes.length; i++) {
      const bp = basePaths[i];
      if (bp) {
        calls.push({ method: "execute.throw", params: ["rm", "-rf", bp] });
      }
      calls.push({ method: "d.erase", params: [hashes[i]!] });
    }
    const body = buildSystemMulticall(calls);
    await rtRequest(body);
  } else {
    const body = buildSystemMulticall(hashes.map((h) => ({ method: "d.erase", params: [h] })));
    await rtRequest(body);
  }
}

export async function addRtTorrentMagnet(magnetUri: string): Promise<void> {
  const body = buildXmlRpcCall("load.start", ["", magnetUri]);
  await rtRequest(body);
}

export async function setRtDownloadLimit(limit: number): Promise<void> {
  const body = buildXmlRpcCall("throttle.global_down.max_rate.set_kb", [Math.floor(limit / 1024)]);
  await rtRequest(body);
}

export async function setRtUploadLimit(limit: number): Promise<void> {
  const body = buildXmlRpcCall("throttle.global_up.max_rate.set_kb", [Math.floor(limit / 1024)]);
  await rtRequest(body);
}
