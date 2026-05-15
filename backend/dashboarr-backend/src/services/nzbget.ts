import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

// Backend-side mirror of services/nzbget-api.ts on the app. Only the methods
// the backend's poller needs land here — currently just history, used to
// detect newly-completed downloads.

export interface NzbgetHistoryItem {
  NZBID: number;
  NZBName: string;
  Category: string;
  // Composite "SUCCESS/ALL", "FAILURE/PAR", etc. — the prefix before the
  // slash is the outcome we classify on.
  Status: string;
  HistoryTime: number;
  FileSizeLo: number;
  FileSizeHi: number;
}

interface JsonRpcEnvelope<T> {
  version: string;
  result: T;
}

async function nzbgetRpc<T>(
  config: StoredServiceConfig,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  const env = await serviceFetch<JsonRpcEnvelope<T>>(config, "", {
    method: "POST",
    body: JSON.stringify({ version: "1.1", method, params }),
  });
  return env.result;
}

export async function getNzbgetHistory(
  config: StoredServiceConfig,
  limit = 20,
): Promise<NzbgetHistoryItem[]> {
  // history takes a single boolean (`hidden`) — we want the user-visible list
  // only. NZBGet doesn't support a server-side limit, so the client slices.
  const all = await nzbgetRpc<NzbgetHistoryItem[]>(config, "history", [false]);
  return all.slice(0, limit);
}
