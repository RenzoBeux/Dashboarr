import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getNzbgetHistory } from "../../services/nzbget.js";
import { diffNzbgetHistory } from "../transitions.js";

export async function pollNzbget(instance: StoredServiceInstance): Promise<void> {
  const items = await getNzbgetHistory(instanceToServiceConfig(instance), 20);
  const multiple = (countEnabledInstancesByKind().get("nzbget") ?? 0) > 1;
  await diffNzbgetHistory(instance.id, instance.name, multiple, items);
}
