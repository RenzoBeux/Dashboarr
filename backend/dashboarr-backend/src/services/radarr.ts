import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface RadarrQueueItem {
  id: number;
  title: string;
  trackedDownloadStatus?: string;
  movie?: { title?: string; year?: number };
}

export interface RadarrQueue {
  records: RadarrQueueItem[];
  totalRecords: number;
}

export function getRadarrQueue(config: StoredServiceConfig): Promise<RadarrQueue> {
  return serviceFetch<RadarrQueue>(config, "/queue", {
    params: { page: 1, pageSize: 200, includeMovie: true },
  });
}
