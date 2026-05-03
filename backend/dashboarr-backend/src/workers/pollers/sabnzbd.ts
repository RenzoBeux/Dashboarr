import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getSabHistory } from "../../services/sabnzbd.js";
import { diffSabHistory } from "../transitions.js";

export async function pollSabnzbd(config: StoredServiceConfig): Promise<void> {
  const history = await getSabHistory(config, 20);
  await diffSabHistory(history.slots);
}
