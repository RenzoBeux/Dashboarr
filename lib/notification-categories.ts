import type { ServiceId } from "@/lib/constants";
import type { NotificationSettings, NotifCategory } from "@/store/config-store";

export type { NotifCategory };

// Categories that make sense to surface on each kind's per-instance editor.
// Every kind exposes "serviceOffline"; download/import/request categories only
// appear on the kind that actually emits them.
export const CATEGORIES_FOR_KIND: Record<ServiceId, NotifCategory[]> = {
  qbittorrent: ["torrentCompleted", "serviceOffline"],
  sabnzbd:     ["sabnzbdCompleted", "serviceOffline"],
  nzbget:      ["nzbgetCompleted",  "serviceOffline"],
  radarr:      ["radarrDownloaded", "serviceOffline"],
  sonarr:      ["sonarrDownloaded", "serviceOffline"],
  overseerr:   ["overseerrNewRequest", "serviceOffline"],
  prowlarr:    ["serviceOffline"],
  tautulli:    ["serviceOffline"],
  plex:        ["serviceOffline"],
  bazarr:      ["serviceOffline"],
  glances:     ["serviceOffline"],
  jellyfin:    ["serviceOffline"],
  emby:        ["serviceOffline"],
};

export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  torrentCompleted: "Torrent completed",
  sabnzbdCompleted: "SABnzbd completed",
  nzbgetCompleted: "NZBGet completed",
  radarrDownloaded: "Movie downloaded",
  sonarrDownloaded: "Episode downloaded",
  serviceOffline: "Service offline",
  overseerrNewRequest: "New Seerr request",
};

export const NOTIF_CATEGORIES = Object.keys(CATEGORY_LABELS) as NotifCategory[];

// Resolves the effective per-instance notification preference.
// Per-instance override (when present) wins over the global category toggle.
// Master `enabled = false` short-circuits everything.
export function shouldNotifyForInstance(
  category: NotifCategory,
  instanceId: string | undefined,
  settings: NotificationSettings,
): boolean {
  if (!settings.enabled) return false;
  if (instanceId) {
    const override = settings.perInstance?.[instanceId]?.[category];
    if (override !== undefined) return override;
  }
  return settings[category];
}
