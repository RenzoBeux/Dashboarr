import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getRadarrHistory } from "../../services/radarr.js";
import { diffRadarrHistory } from "../transitions.js";

export async function pollRadarr(instance: StoredServiceInstance): Promise<void> {
  const history = await getRadarrHistory(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("radarr") ?? 0) > 1;
  await diffRadarrHistory(instance.id, instance.name, multiple, history.records);
}
