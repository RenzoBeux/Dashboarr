import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface OverseerrRequest {
  id: number;
  status: number;
  media: { mediaType: "movie" | "tv"; tmdbId: number };
  requestedBy: { displayName: string };
}

export interface OverseerrRequestsResponse {
  pageInfo: { pages: number; pageSize: number; results: number; page: number };
  results: OverseerrRequest[];
}

export function getOverseerrPendingRequests(
  config: StoredServiceConfig,
): Promise<OverseerrRequestsResponse> {
  return serviceFetch<OverseerrRequestsResponse>(config, "/request", {
    params: { take: 50, skip: 0, filter: "pending", sort: "added" },
  });
}
