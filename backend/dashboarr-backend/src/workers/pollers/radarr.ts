import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getRadarrQueue } from "../../services/radarr.js";
import { diffRadarrQueue } from "../transitions.js";

export async function pollRadarr(config: StoredServiceConfig): Promise<void> {
  const queue = await getRadarrQueue(config);
  await diffRadarrQueue(queue.records);
}
