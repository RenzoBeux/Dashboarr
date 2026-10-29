import type { ServiceId } from "@/lib/constants";
import type { NotificationSettings, NotifCategory } from "@/lib/config-types";

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
  // Deluge reuses the shared "torrentCompleted" category for the same reason
  // Transmission does — one toggle covers every torrent client.
  deluge: ["torrentCompleted", "serviceOffline"],
  sabnzbd:     ["sabnzbdCompleted", "serviceOffline"],
  nzbget:      ["nzbgetCompleted",  "serviceOffline"],
  // Grab pushes (#464) come from the Grab webhook, the backend history poller
  // and the in-app watcher, the same three sources as the import pushes.
  radarr:      ["radarrGrabbed", "radarrDownloaded", "serviceOffline"],
  sonarr:      ["sonarrGrabbed", "sonarrDownloaded", "serviceOffline"],
  // Lidarr has no album-import completion watcher/backend poller in v1, so only
  // the offline category is surfaced (an "album downloaded" toggle would be a
  // dead switch nothing emits yet). Mirrors rtorrent's offline-only stance.
  lidarr:      ["serviceOffline"],
  // Bindery mirrors the Lidarr/rtorrent stance: no book-import watcher in the
  // app and no backend poller, and Bindery exposes no webhook receiver we could
  // subscribe to, so a "book downloaded" toggle would be a switch nothing
  // emits. Offline is the only category with a real source.
  bindery:     ["serviceOffline"],
  overseerr:   ["overseerrNewRequest", "serviceOffline"],
  prowlarr:    ["serviceOffline"],
  jackett:     ["serviceOffline"],
  nzbhydra2:   ["serviceOffline"],
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
  navidrome:   ["serviceOffline"],
  unraid:      ["serviceOffline"],
  // No completion-watcher/backend poller in v1 — a future "transcode
  // completed" push could reuse the Statistics collection's sizeDiff delta,
  // mirroring how SABnzbd/NZBGet detect completion.
  tdarr:       ["serviceOffline"],
  autobrr:     ["serviceOffline"],
  cleanuparr:  ["serviceOffline"],
  // No blocking/gravity watcher in the app and no backend poller, so a
  // "blocking disabled" toggle would be a switch nothing emits. Offline is the
  // only category with a real source — the rtorrent/Lidarr/Bindery stance.
  pihole:      ["serviceOffline"],
  // Maintainerr's deletions run on its own schedule and it exposes no webhook
  // receiver we could subscribe to, so a "media deleted" toggle would be a
  // switch nothing emits. Offline is the only category with a real source.
  maintainerr: ["serviceOffline"],
  // Same story as Pi-hole: no protection/blocking watcher and no backend
  // poller for query-log events, so only offline has a real source.
  adguard:     ["serviceOffline"],
  // Beszel has its own threshold-alert system (alerts/alerts_history
  // collections) but nothing here polls it yet, so only offline has a real
  // source — a future "system alert triggered" category could poll for
  // triggered=true rows, mirroring the *arr health-check pattern.
  beszel:      ["serviceOffline"],
};

export const CATEGORY_LABELS: Record<NotifCategory, string> = {
  torrentCompleted: "Torrent completed",
  sabnzbdCompleted: "SABnzbd completed",
  nzbgetCompleted: "NZBGet completed",
  radarrDownloaded: "Movie downloaded",
  sonarrDownloaded: "Episode downloaded",
  radarrGrabbed: "Movie grabbed",
  sonarrGrabbed: "Episode grabbed",
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

// The categories a backend up to v1.9.0 accepts inside `perInstance`. Those
// builds validate its keys with a strict enum, so a single newer category
// there makes the whole PUT /config 400 and the backend silently keeps its
// last good config (the #230 failure class). pushConfigSnapshot retries such
// a 400 once with perInstance restricted to this list. FROZEN: newer backends
// drop unknown categories themselves, so never add to it.
export const LEGACY_BACKEND_NOTIF_CATEGORIES: readonly NotifCategory[] = [
  "torrentCompleted",
  "sabnzbdCompleted",
  "nzbgetCompleted",
  "radarrDownloaded",
  "sonarrDownloaded",
  "serviceOffline",
  "overseerrNewRequest",
  "tracearrViolation",
  "tracearrNewDevice",
  "tracearrTrustScore",
  "tracearrServerDown",
  "tracearrServerUp",
  "tracearrStreamStarted",
  "tracearrStreamStopped",
];

// Copy of a perInstance override map keeping only the `allowed` categories.
// Instances left with no override are dropped, and undefined comes back when
// nothing at all remains (the "no overrides" shape the backend expects).
export function restrictPerInstanceCategories(
  perInstance: NotificationSettings["perInstance"],
  allowed: readonly NotifCategory[],
): NotificationSettings["perInstance"] {
  if (!perInstance) return undefined;
  const allowedSet = new Set<string>(allowed);
  const out: NonNullable<NotificationSettings["perInstance"]> = {};
  for (const [instanceId, overrides] of Object.entries(perInstance)) {
    const kept = Object.fromEntries(
      Object.entries(overrides ?? {}).filter(([cat]) => allowedSet.has(cat)),
    ) as Partial<Record<NotifCategory, boolean>>;
    if (Object.keys(kept).length > 0) out[instanceId] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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
