import type { ServiceId } from "@/lib/constants";

/**
 * Single source of truth mapping each service kind to its dedicated tab route.
 * Two surfaces tap into this map — the Services tab tiles and the dashboard
 * Status widget — and they previously held independent copies that drifted
 * out of sync (the dashboard widget was missing 7 entries, so tapping Seerr,
 * Glances, Prowlarr, Plex, Jellyfin, Tautulli, or Bazarr did nothing).
 *
 * `Partial` because qBittorrent and SAB share the Downloads tab, so neither
 * surface needs every ServiceId represented — but both should always agree on
 * which ids do and don't have a destination.
 */
export const SERVICE_ROUTES: Partial<Record<ServiceId, string>> = {
  qbittorrent: "/(tabs)/downloads?client=qbittorrent",
  sabnzbd: "/(tabs)/downloads?client=sabnzbd",
  nzbget: "/(tabs)/downloads?client=nzbget",
  radarr: "/(tabs)/movies",
  sonarr: "/(tabs)/tv",
  overseerr: "/(tabs)/requests",
  tautulli: "/(tabs)/activity",
  prowlarr: "/(tabs)/indexers",
  plex: "/(tabs)/plex",
  jellyfin: "/(tabs)/jellyfin",
  emby: "/(tabs)/emby",
  glances: "/(tabs)/glances",
  bazarr: "/(tabs)/bazarr",
};
