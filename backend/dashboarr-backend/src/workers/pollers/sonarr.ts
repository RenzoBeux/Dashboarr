import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getSonarrQueue } from "../../services/sonarr.js";
import { diffSonarrQueue } from "../transitions.js";

export async function pollSonarr(config: StoredServiceConfig): Promise<void> {
  const queue = await getSonarrQueue(config);
  await diffSonarrQueue(queue.records);
}
