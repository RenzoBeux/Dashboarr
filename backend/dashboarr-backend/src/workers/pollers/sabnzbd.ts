import { instanceToServiceConfig } from "../../db/repos/config.js";
import type { StoredServiceInstance } from "../../db/repos/service-instance.js";
import { getSabHistory } from "../../services/sabnzbd.js";
import { diffSabHistory } from "../transitions.js";

export async function pollSabnzbd(instance: StoredServiceInstance): Promise<void> {
  const history = await getSabHistory(instanceToServiceConfig(instance), 20);
  await diffSabHistory(history.slots);
}
