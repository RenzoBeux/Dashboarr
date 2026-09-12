import type { ServiceId } from "../types.js";

/**
 * Whether a poller must be skipped because the instance carries no API key.
 *
 * Only Seerr qualifies today. The app can sign a Seerr instance in as a
 * household member (Plex, Jellyfin/Emby or a Seerr password) instead of the
 * admin API key, and it deliberately never sends those personal credentials
 * here. The pending-request poller authenticates with `X-Api-Key` and has no
 * session client, so without a key it would 403 every tick. Skipping keeps
 * the instance's webhooks and the offline poller working, which need no
 * credential at all.
 *
 * Every other kind keeps its previous behavior: a missing credential still
 * spawns the poller and surfaces as `lastError`, which is how a misconfigured
 * instance has always been diagnosed.
 *
 * Kept in its own dependency-free module so it can be tested without loading
 * the SQLite client the scheduler imports.
 */
export function skipsPollerWithoutApiKey(
  kind: ServiceId,
  instance: { apiKey: string | null },
): boolean {
  return kind === "overseerr" && !instance.apiKey;
}
