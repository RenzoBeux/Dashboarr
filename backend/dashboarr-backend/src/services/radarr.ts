import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface RadarrQueueItem {
  id: number;
  movieId?: number;
  title: string;
  trackedDownloadStatus?: string;
  movie?: { id?: number; title?: string; year?: number };
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

export interface RadarrHistoryRecord {
  id: number;
  eventType: string;
  sourceTitle?: string;
  date?: string;
  downloadId?: string;
  movieId?: number;
  movie?: { id?: number; title?: string; year?: number };
}

export interface RadarrHistory {
  records: RadarrHistoryRecord[];
  totalRecords: number;
}

export function getRadarrHistory(config: StoredServiceConfig): Promise<RadarrHistory> {
  return serviceFetch<RadarrHistory>(config, "/history", {
    params: {
      page: 1,
      pageSize: 50,
      sortKey: "date",
      sortDirection: "descending",
      includeMovie: true,
    },
  });
}
