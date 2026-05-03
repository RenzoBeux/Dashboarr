import { serviceRequest } from "@/lib/http-client";
import type { SabHistory, SabQueue } from "@/lib/types";

// SABnzbd has a single endpoint at /api?mode=<command>; this module just maps
// each call we care about to the right `mode` + params. Auth (apikey + output)
// is injected by serviceRequest's sabnzbd branch.

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

export async function getSabQueue(): Promise<SabQueue> {
  const env = await serviceRequest<SabQueueEnvelope>("sabnzbd", "", {
    params: { mode: "queue" },
  });
  return env.queue;
}

export async function getSabHistory(limit = 50): Promise<SabHistory> {
  const env = await serviceRequest<SabHistoryEnvelope>("sabnzbd", "", {
    params: { mode: "history", limit },
  });
  return env.history;
}

// --- Global pause/resume ---

export async function pauseSabAll(): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "pause" },
  });
}

export async function resumeSabAll(): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "resume" },
  });
}

// --- Per-slot actions ---

export async function pauseSabSlot(nzoId: string): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "queue", name: "pause", value: nzoId },
  });
}

export async function resumeSabSlot(nzoId: string): Promise<void> {
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", {
    params: { mode: "queue", name: "resume", value: nzoId },
  });
}

export async function deleteSabSlot(
  nzoId: string,
  deleteFiles = false,
): Promise<void> {
  const params: Record<string, string | number | boolean> = {
    mode: "queue",
    name: "delete",
    value: nzoId,
  };
  if (deleteFiles) {
    params.del_files = 1;
  }
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params });
}

export async function deleteSabHistorySlot(
  nzoId: string,
  deleteFiles = false,
): Promise<void> {
  const params: Record<string, string | number | boolean> = {
    mode: "history",
    name: "delete",
    value: nzoId,
  };
  if (deleteFiles) {
    params.del_files = 1;
  }
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params });
}

// --- Add NZB by URL ---

export async function addSabUrl(url: string, category?: string): Promise<void> {
  const params: Record<string, string | number | boolean> = {
    mode: "addurl",
    name: url,
  };
  if (category) params.cat = category;
  await serviceRequest<SabStatusEnvelope>("sabnzbd", "", { params });
}
