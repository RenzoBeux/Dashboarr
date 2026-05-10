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
