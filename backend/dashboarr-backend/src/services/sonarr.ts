import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface SonarrQueueItem {
  id: number;
  seriesId?: number;
  title: string;
  trackedDownloadStatus?: string;
  series?: { id?: number; title?: string };
  episode?: { title?: string; seasonNumber?: number; episodeNumber?: number };
}

export interface SonarrQueue {
  records: SonarrQueueItem[];
  totalRecords: number;
}

export function getSonarrQueue(config: StoredServiceConfig): Promise<SonarrQueue> {
  return serviceFetch<SonarrQueue>(config, "/queue", {
    params: { page: 1, pageSize: 200, includeSeries: true, includeEpisode: true },
  });
}

export interface SonarrHistoryRecord {
  id: number;
  eventType: string;
  sourceTitle?: string;
  date?: string;
  downloadId?: string;
  seriesId?: number;
  episodeId?: number;
  series?: { id?: number; title?: string };
  episode?: { title?: string; seasonNumber?: number; episodeNumber?: number };
}

export interface SonarrHistory {
  records: SonarrHistoryRecord[];
  totalRecords: number;
}

export function getSonarrHistory(config: StoredServiceConfig): Promise<SonarrHistory> {
  return serviceFetch<SonarrHistory>(config, "/history", {
    params: {
      page: 1,
      pageSize: 50,
      sortKey: "date",
      sortDirection: "descending",
      includeSeries: true,
      includeEpisode: true,
    },
  });
}
