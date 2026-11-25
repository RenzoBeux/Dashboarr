import { serviceRequest } from "@/lib/http-client";
import type { SabHistory, SabQueue } from "@/lib/types";

// SABnzbd has a single endpoint at /api?mode=<command>; this module just maps
// each call we care about to the right `mode` + params. Auth (apikey + output)
// is injected by serviceRequest's sabnzbd branch.
//
// Per-instance routing: every function takes an optional `instanceId` that
// scopes the request to a specific SABnzbd instance. When omitted, the user's
// active SAB instance is used (legacy single-instance behavior).

interface SabQueueEnvelope {
  queue: SabQueue;
}

interface SabHistoryEnvelope {
  history: SabHistory;
}

interface SabStatusEnvelope {
  status: boolean;
  error?: string;
}

// --- Queue ---

export async function getSabQueue(instanceId?: string): Promise<SabQueue> {
  const env = await serviceRequest<SabQueueEnvelope>("sabnzbd", "", {
    params: { mode: "queue" },
    instanceId,
  });
  return env.queue;
}

export async function getSabHistory(
  limit = 50,
  instanceId?: string,
): Promise<SabHistory> {
  const env = await serviceRequest<SabHistoryEnvelope>("sabnzbd", "", {
    params: { mode: "history", limit },
    instanceId,
  });
  return env.history;
}

// --- Global pause/resume ---

export async function pauseSabAll(instanceId?: string): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "pause" },
    instanceId,
  });
}

export async function resumeSabAll(instanceId?: string): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "resume" },
    instanceId,
  });
}

// --- Speed limit ---

// SAB's `config&name=speedlimit&value=X` treats a bare number as a *percentage*
// of the user's configured max line speed. Appending `K` makes it an absolute
// KB/s limit, which is what we expose (works even when no line speed is set and
// matches how qBittorrent's limit reads). `value=0` clears the limit. The
// current absolute limit comes back on the queue as `speedlimit_abs` (bytes/s).
export async function setSabSpeedLimit(
  kbPerSec: number,
  instanceId?: string,
): Promise<void> {
  const value = kbPerSec > 0 ? `${Math.round(kbPerSec)}K` : "0";
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "config", name: "speedlimit", value },
    instanceId,
  });
}

// --- Per-slot actions ---

export async function pauseSabSlot(
  nzoId: string,
  instanceId?: string,
): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "queue", name: "pause", value: nzoId },
    instanceId,
  });
}

export async function resumeSabSlot(
  nzoId: string,
  instanceId?: string,
): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "queue", name: "resume", value: nzoId },
    instanceId,
  });
}

export async function deleteSabSlot(
  nzoId: string,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  const params: Record<string, string | number | boolean> = {
    mode: "queue",
    name: "delete",
    value: nzoId,
  };
  if (deleteFiles) {
    params.del_files = 1;
  }
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params, instanceId });
}

// --- Queue order (#515) ---

export interface SabMoveResult {
  // The job's new index, -1 when SAB moved nothing (job gone, same slot).
  position: number;
  // SAB's numeric priority after the move (see moveSabSlot).
  priority: number;
}

// mode=switch: `value2` as a number is an index, and SAB moves the job into
// the slot of the job now at that index (NzbQueue.switch), so 0 is the top and
// queue length - 1 the bottom. SAB keeps the queue grouped by priority: moving
// among jobs of another priority can give the job theirs, which is why the
// answer carries the priority too.
export async function moveSabSlot(
  nzoId: string,
  position: number,
  instanceId?: string,
): Promise<SabMoveResult> {
  const env = await serviceRequest<{ result?: SabMoveResult }>("sabnzbd", "", {
    params: { mode: "switch", value: nzoId, value2: position },
    instanceId,
  });
  return env.result ?? { position: -1, priority: 0 };
}

export interface SabSlotPosition {
  // 0-based index in SAB's queue order.
  position: number;
  // Jobs in the whole queue.
  length: number;
}

const POSITION_PAGE_SIZE = 200;

// Where one job sits in the queue. SAB can't answer that directly: under an
// nzo_ids filter `index` counts from 0 within the matches. So this pages
// through the queue in SAB's order until the job turns up, which is a single
// request for a job near the top. null when the job is no longer queued.
export async function findSabSlotPosition(
  nzoId: string,
  instanceId?: string,
): Promise<SabSlotPosition | null> {
  for (let start = 0; ; start += POSITION_PAGE_SIZE) {
    const env = await serviceRequest<SabQueueEnvelope>("sabnzbd", "", {
      params: { mode: "queue", start, limit: POSITION_PAGE_SIZE },
      instanceId,
    });
    const slots = env.queue.slots ?? [];
    const length = Number(env.queue.noofslots) || 0;
    const i = slots.findIndex((s) => s.nzo_id === nzoId);
    if (i >= 0) return { position: start + i, length: Math.max(length, start + i + 1) };
    if (slots.length < POSITION_PAGE_SIZE || start + slots.length >= length) return null;
  }
}

export async function deleteSabHistorySlot(
  nzoId: string,
  deleteFiles = false,
  instanceId?: string,
): Promise<void> {
  // SAB's default behavior on history delete is to *move* the row into the
  // Archive view rather than remove it. That doesn't match what users expect
  // when they tap "Delete" on a history entry, so always pass `archive=0` to
  // make the delete final. See https://sabnzbd.org/wiki/configuration/4.5/api.
  const params: Record<string, string | number | boolean> = {
    mode: "history",
    name: "delete",
    value: nzoId,
    archive: 0,
  };
  if (deleteFiles) {
    params.del_files = 1;
  }
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params, instanceId });
}

// --- Add NZB by URL ---

export async function addSabUrl(
  url: string,
  category?: string,
  instanceId?: string,
): Promise<void> {
  const params: Record<string, string | number | boolean> = {
    mode: "addurl",
    name: url,
  };
  if (category) params.cat = category;
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params, instanceId });
}

// --- Add NZB by file upload ---

export async function addSabFile(
  fileUri: string,
  fileName: string,
  category?: string,
  instanceId?: string,
): Promise<void> {
  // mode=addfile takes the .nzb as a multipart/form-data part named "name".
  // React Native's fetch uploads a { uri, name, type } descriptor as a file
  // part and sets the multipart Content-Type (with boundary) itself —
  // serviceRequest skips its JSON default for FormData bodies.
  const form = new FormData();
  form.append("name", {
    uri: fileUri,
    name: fileName,
    type: "application/x-nzb",
  } as unknown as Blob);
  const params: Record<string, string | number | boolean> = {
    mode: "addfile",
  };
  if (category) params.cat = category;
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    method: "POST",
    body: form,
    params,
    instanceId,
  });
}
