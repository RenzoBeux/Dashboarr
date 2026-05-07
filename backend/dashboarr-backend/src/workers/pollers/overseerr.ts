import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getOverseerrPendingRequests } from "../../services/overseerr.js";
import { diffOverseerrPending } from "../transitions.js";

export async function pollOverseerr(instance: StoredServiceInstance): Promise<void> {
  const res = await getOverseerrPendingRequests(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("overseerr") ?? 0) > 1;
  await diffOverseerrPending(instance.id, instance.name, multiple, res.results);
}
