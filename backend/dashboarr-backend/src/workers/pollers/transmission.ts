import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getTransmissionTorrents } from "../../services/transmission.js";
import { diffTransmissionTorrents } from "../transitions.js";

export async function pollTransmission(instance: StoredServiceInstance): Promise<void> {
  const torrents = await getTransmissionTorrents(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("transmission") ?? 0) > 1;
  await diffTransmissionTorrents(instance.id, instance.name, multiple, torrents);
}
