import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getDelugeTorrents } from "../../services/deluge.js";
import { diffDelugeTorrents } from "../transitions.js";

export async function pollDeluge(instance: StoredServiceInstance): Promise<void> {
  const torrents = await getDelugeTorrents(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("deluge") ?? 0) > 1;
  await diffDelugeTorrents(instance.id, instance.name, multiple, torrents);
}
