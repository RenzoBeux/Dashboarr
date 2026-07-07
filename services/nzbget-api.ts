import { serviceRequest } from "@/lib/http-client";
import type {
  NzbgetGroup,
  NzbgetHistoryItem,
  NzbgetStatus,
} from "@/lib/types";

// NZBGet's API is JSON-RPC 2.0. Every method is a POST to /jsonrpc with a
// JSON body of the form `{ version: "1.1", method, params: [...] }`. NZBGet's
// JSON-RPC ignores parameter names — params are positional.
//
// Auth (Basic) and Content-Type headers are injected by serviceRequest's
// nzbget branch.
//
// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific NZBGet instance. When omitted, the user's
// active NZBGet instance is used.

interface JsonRpcEnvelope<T> {
  version: string;
  result: T;
}

async function nzbgetRpc<T>(
  method: string,
  params: unknown[] = [],
  instanceId?: string,
): Promise<T> {
  const env = await serviceRequest<JsonRpcEnvelope<T>>("nzbget", "", {
    method: "POST",
    body: JSON.stringify({ version: "1.1", method, params }),
    instanceId,
  });
  return env.result;
}

// --- Queue ---

export async function getNzbgetGroups(instanceId?: string): Promise<NzbgetGroup[]> {
  return nzbgetRpc<NzbgetGroup[]>("listgroups", [], instanceId);
}

export async function getNzbgetHistory(
  limit = 50,
  instanceId?: string,
): Promise<NzbgetHistoryItem[]> {
  // The history method takes a single boolean: `true` includes hidden items
  // (post-processing intermediates). We want the user-visible list only.
  // NZBGet doesn't support a server-side limit on history; clients slice.
  const all = await nzbgetRpc<NzbgetHistoryItem[]>("history", [false], instanceId);
  return all.slice(0, limit);
}

export async function getNzbgetStatus(instanceId?: string): Promise<NzbgetStatus> {
  return nzbgetRpc<NzbgetStatus>("status", [], instanceId);
}

// --- Global pause/resume ---

export async function pauseNzbgetAll(instanceId?: string): Promise<void> {
  await nzbgetRpc<boolean>("pausedownload", [], instanceId);
}

export async function resumeNzbgetAll(instanceId?: string): Promise<void> {
  await nzbgetRpc<boolean>("resumedownload", [], instanceId);
}

// --- Speed limit ---

// `rate` sets the download speed limit in KB/s; `0` disables throttling. Note
// the scale mismatch NZBGet documents: `rate` takes KB/s, while the current
// limit reported on `status.DownloadLimit` is in bytes/s.
export async function setNzbgetRate(
  kbPerSec: number,
  instanceId?: string,
): Promise<void> {
  await nzbgetRpc<boolean>("rate", [Math.max(0, Math.round(kbPerSec))], instanceId);
}

// --- Per-group actions ---
// editqueue takes [Command, Param, IDs[]]. For Group* commands the Param is
// an empty string and IDs is the list of NZBIDs to act on.

export async function pauseNzbgetGroup(
  nzbId: number,
  instanceId?: string,
): Promise<void> {
  await nzbgetRpc<boolean>(
    "editqueue",
    ["GroupPause", "", [nzbId]],
    instanceId,
  );
}

export async function resumeNzbgetGroup(
  nzbId: number,
  instanceId?: string,
): Promise<void> {
  await nzbgetRpc<boolean>(
    "editqueue",
    ["GroupResume", "", [nzbId]],
    instanceId,
  );
}

export async function deleteNzbgetGroup(
  nzbId: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  // GroupFinalDelete removes the group AND its on-disk intermediate files;
  // GroupDelete moves it to history with a "Deleted" status. Match SAB's
  // "delete" / "delete + files" UX by mapping deleteFiles=true → final.
  const command = deleteFiles ? "GroupFinalDelete" : "GroupDelete";
  await nzbgetRpc<boolean>("editqueue", [command, "", [nzbId]], instanceId);
}

export async function deleteNzbgetHistorySlot(
  nzbId: number,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  // HistoryFinalDelete is permanent (purges from the database); HistoryDelete
  // marks the entry as hidden but recoverable. We always use the final form
  // when the user confirms a delete to match what they expect.
  const command = deleteFiles ? "HistoryFinalDelete" : "HistoryDelete";
  await nzbgetRpc<boolean>("editqueue", [command, "", [nzbId]], instanceId);
}

// --- Add NZB by URL ---

export async function addNzbgetUrl(
  url: string,
  category?: string,
  instanceId?: string,
): Promise<number> {
  // append params: [NZBFilename, Content, Category, Priority, AddToTop,
  //                 AddPaused, DupeKey, DupeScore, DupeMode]
  // For URL adds, Content is the URL itself and NZBFilename can be empty —
  // NZBGet derives a filename from the URL.
  return nzbgetRpc<number>(
    "append",
    ["", url, category ?? "", 0, false, false, "", 0, "SCORE"],
    instanceId,
  );
}

// --- Add NZB by file upload ---

export async function addNzbgetFile(
  fileName: string,
  base64Content: string,
  category?: string,
  instanceId?: string,
): Promise<number> {
  // Same `append` method as URL adds. NZBGet decides by inspecting Content:
  // a URL is fetched, anything else is treated as base64-encoded .nzb data —
  // so the file body goes in Content and NZBFilename supplies the name it
  // can't derive.
  return nzbgetRpc<number>(
    "append",
    [fileName, base64Content, category ?? "", 0, false, false, "", 0, "SCORE"],
    instanceId,
  );
}
