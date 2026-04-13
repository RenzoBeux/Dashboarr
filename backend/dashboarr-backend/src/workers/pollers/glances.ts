import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getGlancesCpu, getGlancesFs, getGlancesMem } from "../../services/glances.js";

/**
 * Glances polling currently just exercises the API so we surface it as an
 * online/offline signal via the generic health poller. Threshold-alerting
 * hooks will be added alongside a "serverHighLoad" notification category.
 */
export async function pollGlances(config: StoredServiceConfig): Promise<void> {
  await Promise.all([getGlancesCpu(config), getGlancesMem(config), getGlancesFs(config)]);
}
