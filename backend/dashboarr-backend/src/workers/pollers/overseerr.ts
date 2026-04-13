import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getOverseerrPendingRequests } from "../../services/overseerr.js";
import { diffOverseerrPending } from "../transitions.js";

export async function pollOverseerr(config: StoredServiceConfig): Promise<void> {
  const res = await getOverseerrPendingRequests(config);
  await diffOverseerrPending(res.results);
}
