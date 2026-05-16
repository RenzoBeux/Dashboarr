import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getSonarrHistory } from "../../services/sonarr.js";
import { diffSonarrHistory } from "../transitions.js";

export async function pollSonarr(instance: StoredServiceInstance): Promise<void> {
  const history = await getSonarrHistory(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("sonarr") ?? 0) > 1;
  await diffSonarrHistory(instance.id, instance.name, multiple, history.records);
}
