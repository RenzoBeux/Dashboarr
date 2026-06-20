import type { ServiceId } from "@/lib/constants";

/**
 * Service kinds that participate in global search (#223). v1 is the set of
 * kinds that already expose a text-query search function (Radarr/Sonarr/Lidarr
 * lookup, Seerr media search, Prowlarr indexer search). Plex/Jellyfin/Emby
 * library search is a planned follow-up — add their ids here when it lands.
 */
export const GLOBAL_SEARCH_KINDS = [
  "radarr",
  "sonarr",
  "lidarr",
  "overseerr",
  "prowlarr",
] as const satisfies readonly ServiceId[];

/** True when at least one searchable kind is attached to the active workspace. */
export function hasSearchableKind(attached: ReadonlySet<ServiceId>): boolean {
  return GLOBAL_SEARCH_KINDS.some((k) => attached.has(k));
}
