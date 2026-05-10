import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface SabHistorySlot {
  nzo_id: string;
  name: string;
  category: string;
  status: "Completed" | "Failed";
  fail_message: string;
  size: string;
  bytes: number;
  download_time: number;
  completed: number;
  storage: string;
}

export interface SabHistory {
  slots: SabHistorySlot[];
  total_size: string;
  noofslots: number;
}

interface SabHistoryEnvelope {
  history: SabHistory;
}

export async function getSabHistory(
  config: StoredServiceConfig,
  limit = 20,
): Promise<SabHistory> {
  const env = await serviceFetch<SabHistoryEnvelope>(config, "", {
    params: { mode: "history", limit },
  });
  return env.history;
}
