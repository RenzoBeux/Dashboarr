import type { ServiceId } from "@/lib/constants";
import type { NotificationSettings, NotifCategory } from "@/store/config-store";

export type { NotifCategory };

// Categories that make sense to surface on each kind's per-instance editor.
// Every kind exposes "serviceOffline"; download/import/request categories only
// appear on the kind that actually emits them.
export const CATEGORIES_FOR_KIND: Record<ServiceId, NotifCategory[]> = {
  qbittorrent: ["torrentCompleted", "serviceOffline"],
  // rtorrent has no completion watcher/backend poller in v1, so only the
  // offline category is surfaced (a torrentCompleted toggle would be a dead
  // switch nothing emits). Phase 2 adds the watcher + "torrentCompleted".
  rtorrent:    ["serviceOffline"],
  // Transmission reuses the shared "torrentCompleted" category — its completion
  // watcher (app) + poller (backend) emit "Download complete" just like
  // qBittorrent, so no new category is needed.
  transmission: ["torrentCompleted", "serviceOffline"],
  sabnzbd:     ["sabnzbdCompleted", "serviceOffline"],
  nzbget:      ["nzbgetCompleted",  "serviceOffline"],
  radarr:      ["radarrDownloaded", "serviceOffline"],
  sonarr:      ["sonarrDownloaded", "serviceOffline"],
  // Lidarr has no album-import completion watcher/backend poller in v1, so only
  // the offline category is surfaced (an "album downloaded" toggle would be a
  // dead switch nothing emits yet). Mirrors rtorrent's offline-only stance.
  lidarr:      ["serviceOffline"],
  overseerr:   ["overseerrNewRequest", "serviceOffline"],
  prowlarr:    ["serviceOffline"],
  tautulli:    ["serviceOffline"],
  // Tracearr webhook events. These have no global toggle rows in Settings →
  // Notifications; they're controlled per-instance here (each Tracearr instance
  // editor), so point its webhook at /webhooks/tracearr/<secret>?instance=<id>
  // for these overrides to apply.
  tracearr: [
    "tracearrViolation",
    "tracearrNewDevice",
    "tracearrTrustScore",
    "tracearrServerDown",
    "tracearrServerUp",
    "tracearrStreamStarted",
    "tracearrStreamStopped",
    "serviceOffline",
  ],
  jellystat:   ["serviceOffline"],
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
  tracearrViolation: "Rule violation",
  tracearrNewDevice: "New device",
  tracearrTrustScore: "Trust score change",
  tracearrServerDown: "Server offline",
  tracearrServerUp: "Server back online",
  tracearrStreamStarted: "Stream started",
  tracearrStreamStopped: "Stream stopped",
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
