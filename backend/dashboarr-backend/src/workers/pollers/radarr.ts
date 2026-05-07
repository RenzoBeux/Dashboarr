import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getRadarrQueue } from "../../services/radarr.js";
import { diffRadarrQueue } from "../transitions.js";

export async function pollRadarr(instance: StoredServiceInstance): Promise<void> {
  const queue = await getRadarrQueue(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("radarr") ?? 0) > 1;
  await diffRadarrQueue(instance.id, instance.name, multiple, queue.records);
}
