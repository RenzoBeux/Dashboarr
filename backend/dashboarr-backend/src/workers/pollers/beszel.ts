import { instanceToServiceConfig } from "../../db/repos/config.js";
import type { StoredServiceInstance } from "../../db/repos/service-instance.js";
import { checkBeszelAuth } from "../../services/beszel.js";

/**
 * Beszel polling currently just exercises the PocketBase login so we surface
 * it as an online/offline signal via the generic health poller, mirroring
 * pollGlances. Unlike Glances' static Basic-auth header, Beszel authenticates
 * via a PocketBase login POST rather than a per-request header (see
 * services/beszel.ts), so this performs the login directly instead of
 * routing through serviceFetch. A thrown error (network failure, timeout, or
 * rejected credentials) is caught by the scheduler and surfaced as
 * `lastError` — the same convention every other poller here relies on.
 */
export async function pollBeszel(instance: StoredServiceInstance): Promise<void> {
  const cfg = instanceToServiceConfig(instance);
  await checkBeszelAuth(cfg);
}
