import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getSonarrQueue } from "../../services/sonarr.js";
import { diffSonarrQueue } from "../transitions.js";

export async function pollSonarr(instance: StoredServiceInstance): Promise<void> {
  const queue = await getSonarrQueue(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("sonarr") ?? 0) > 1;
  await diffSonarrQueue(instance.id, instance.name, multiple, queue.records);
}
