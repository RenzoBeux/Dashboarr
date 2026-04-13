import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface SonarrQueueItem {
  id: number;
  title: string;
  trackedDownloadStatus?: string;
}

export interface SonarrQueue {
  records: SonarrQueueItem[];
  totalRecords: number;
}

export function getSonarrQueue(config: StoredServiceConfig): Promise<SonarrQueue> {
  return serviceFetch<SonarrQueue>(config, "/queue", {
    params: { page: 1, pageSize: 200 },
  });
}
