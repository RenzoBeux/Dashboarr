import type { StoredServiceConfig } from "../db/repos/config.js";
import { serviceFetch } from "./http.js";

export interface BazarrSystemStatus {
  data: { bazarr_version?: string };
}

export function getBazarrStatus(config: StoredServiceConfig): Promise<BazarrSystemStatus> {
  return serviceFetch<BazarrSystemStatus>(config, "/system/status");
}
