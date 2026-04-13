import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getProwlarrIndexerStatuses } from "../../services/prowlarr.js";

/**
 * Prowlarr polling is advisory only for now — we fetch indexer statuses so the
 * poller footprint exists and surfaces in /health, but there's no user-facing
 * notification category for "indexer failed" yet. Extend once a category is
 * added to NotificationSettings.
 */
export async function pollProwlarr(config: StoredServiceConfig): Promise<void> {
  await getProwlarrIndexerStatuses(config);
}
