import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface ProwlarrIndexerStatus {
  indexerId: number;
  disabledTill?: string;
  mostRecentFailure?: string;
  initialFailure?: string;
}

export function getProwlarrIndexerStatuses(
  config: StoredServiceConfig,
): Promise<ProwlarrIndexerStatus[]> {
  return serviceFetch<ProwlarrIndexerStatus[]>(config, "/indexerstatus");
}
