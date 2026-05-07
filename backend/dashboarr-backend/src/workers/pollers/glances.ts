import { instanceToServiceConfig } from "../../db/repos/config.js";
import type { StoredServiceInstance } from "../../db/repos/service-instance.js";
import { getGlancesCpu, getGlancesFs, getGlancesMem } from "../../services/glances.js";

/**
 * Glances polling currently just exercises the API so we surface it as an
 * online/offline signal via the generic health poller. Threshold-alerting
 * hooks will be added alongside a "serverHighLoad" notification category.
 */
export async function pollGlances(instance: StoredServiceInstance): Promise<void> {
  const cfg = instanceToServiceConfig(instance);
  await Promise.all([getGlancesCpu(cfg), getGlancesMem(cfg), getGlancesFs(cfg)]);
}
