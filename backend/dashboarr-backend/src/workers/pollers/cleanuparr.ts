import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getCleanuparrEvents } from "../../services/cleanuparr.js";
import { CLEANUPARR_WATCHED_EVENT_TYPES } from "../cleanuparr-events.js";
import { diffCleanuparrEvents } from "../transitions.js";

export async function pollCleanuparr(instance: StoredServiceInstance): Promise<void> {
  const config = instanceToServiceConfig(instance);
  const multiple = (countEnabledInstancesByKind().get("cleanuparr") ?? 0) > 1;
  for (const eventType of CLEANUPARR_WATCHED_EVENT_TYPES) {
    const page = await getCleanuparrEvents(config, eventType);
    // A proxy login page or other non-JSON answer must not reach the diff: an
    // empty page would wipe the seen ids and re-push them on the next poll.
    if (!Array.isArray(page?.items)) {
      throw new Error(`cleanuparr: unexpected /api/events response for ${eventType}`);
    }
    await diffCleanuparrEvents(instance.id, instance.name, multiple, eventType, page.items);
  }
}
