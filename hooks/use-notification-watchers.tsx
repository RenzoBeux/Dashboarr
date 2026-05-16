import { useEffect, useRef } from "react";
import {
  useDownloadingTorrentsForWatcher,
} from "@/hooks/use-qbittorrent";
import { getTorrents } from "@/services/qbittorrent-api";
import { useRadarrHistory } from "@/hooks/use-radarr";
import { useSonarrHistory } from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useOverseerrRequests } from "@/hooks/use-overseerr";
import { useSabHistory } from "@/hooks/use-sabnzbd";
import { useNzbgetHistory } from "@/hooks/use-nzbget";
import { useConfigStore } from "@/store/config-store";
import { useBackendStore } from "@/store/backend-store";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { sendLocalNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toast";
import type {
  QBTorrent,
  TorrentState,
  SonarrHistoryRecord,
  RadarrHistoryRecord,
} from "@/lib/types";

// Categories Radarr/Sonarr set on jobs they manage. The arr-specific watchers
// already notify on those, so the download-client watchers skip them to avoid
// double-firing.
const MANAGED_CATEGORIES = new Set(["radarr", "sonarr", "tv-sonarr"]);

function isManagedByArr(category: string): boolean {
  return MANAGED_CATEGORIES.has(category.toLowerCase());
}

// Post-download states. `pausedUP`/`stoppedUP` cover qBT 4.x and 5.x naming.
// Excluding pausedDL/stoppedDL here is what stops a pause from being mistaken
// for a completion.
const COMPLETED_STATES: TorrentState[] = [
  "uploading",
  "pausedUP",
  "stoppedUP",
  "queuedUP",
  "stalledUP",
  "checkingUP",
  "forcedUP",
];

function isCompletedState(state: TorrentState): boolean {
  return COMPLETED_STATES.includes(state);
}

// Used by the watcher children to decide whether to fire local notifications.
// All four conditions must be met: notifications hydrated + globally enabled
// + the per-kind toggle on + no backend currently pushing.
interface BaseGate {
  hydrated: boolean;
  enabled: boolean;
  backendActive: boolean;
}

/**
 * Renders one watcher child per (kind, enabled instance) pair so each
 * instance owns its own polling cadence and previous-state ref. Children all
 * return null — they exist purely to scope hooks per instance, which the
 * single-effect approach can't do without breaking the rules of hooks.
 *
 * Must be rendered inside a QueryClientProvider.
 */
export function NotificationWatchers() {
  // Notification settings now live on the config store; hydration is bundled
  // into useConfigStore.hydrate() so the toggles can't read defaults before
  // AsyncStorage has been loaded into the in-memory cache.
  const hydrated = useConfigStore((s) => s.hydrated);
  const enabled = useConfigStore((s) => s.notificationSettings.enabled);
  const torrentCompleted = useConfigStore((s) => s.notificationSettings.torrentCompleted);
  const sabnzbdCompleted = useConfigStore((s) => s.notificationSettings.sabnzbdCompleted);
  const nzbgetCompleted = useConfigStore((s) => s.notificationSettings.nzbgetCompleted);
  const radarrDownloaded = useConfigStore((s) => s.notificationSettings.radarrDownloaded);
  const sonarrDownloaded = useConfigStore((s) => s.notificationSettings.sonarrDownloaded);
  const serviceOffline = useConfigStore((s) => s.notificationSettings.serviceOffline);
  const overseerrNewRequest = useConfigStore((s) => s.notificationSettings.overseerrNewRequest);

  // When a backend is paired AND currently reachable, defer notifications to
  // it so the user doesn't get double-notified (one local, one push). If the
  // backend goes offline (2 consecutive /health failures), `backendActive`
  // flips back to false and local watchers take over again.
  const backendActive = useBackendStore(
    (s) => s.hydrated && !!s.sharedSecret && !!s.url && s.isHealthy,
  );

  const gate: BaseGate = { hydrated, enabled, backendActive };

  const qbInstances = useEnabledInstances("qbittorrent");
  const sabInstances = useEnabledInstances("sabnzbd");
  const nzbgetInstances = useEnabledInstances("nzbget");
  const radarrInstances = useEnabledInstances("radarr");
  const sonarrInstances = useEnabledInstances("sonarr");
  const overseerrInstances = useEnabledInstances("overseerr");

  return (
    <>
      {qbInstances.map((inst) => (
        <QbDownloadWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && torrentCompleted}
        />
      ))}
      {sabInstances.map((inst) => (
        <SabnzbdHistoryWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && sabnzbdCompleted}
        />
      ))}
      {nzbgetInstances.map((inst) => (
        <NzbgetHistoryWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && nzbgetCompleted}
        />
      ))}
      {radarrInstances.map((inst) => (
        <RadarrImportWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && radarrDownloaded}
        />
      ))}
      {sonarrInstances.map((inst) => (
        <SonarrImportWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && sonarrDownloaded}
        />
      ))}
      {overseerrInstances.map((inst) => (
        <OverseerrRequestWatcher
          key={inst.id}
          instanceId={inst.id}
          active={!backendActive && hydrated && enabled && overseerrNewRequest}
        />
      ))}
      <ServiceHealthWatcher gate={gate} active={serviceOffline} />
    </>
  );
}

// --- qBittorrent: torrent downloading → completed ---
// We only fetch torrents currently in a downloading state (a small slice
// even on huge libraries). When a hash leaves that set, we do a targeted
// verification fetch by hash to disambiguate completion (notify) from
// pause/delete (don't notify). The watcher query stays fully disabled
// unless notifications are on, qBT is enabled, completions are wanted,
// and the backend isn't already pushing — so the cost is zero at rest.
function QbDownloadWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: downloading } = useDownloadingTorrentsForWatcher(active, instanceId);
  const prevDownloading = useRef<Map<string, QBTorrent>>(new Map());

  // Reset the baseline whenever the watcher goes inactive so the next active
  // poll doesn't compare against a stale snapshot from before the gap.
  useEffect(() => {
    if (!active) prevDownloading.current = new Map();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (!Array.isArray(downloading)) return;

    const currMap = new Map(downloading.map((t) => [t.hash, t]));
    const prev = prevDownloading.current;
    prevDownloading.current = currMap;

    const departed: QBTorrent[] = [];
    for (const [hash, t] of prev) {
      if (!currMap.has(hash)) departed.push(t);
    }
    if (departed.length === 0) return;

    // Disappearance from the downloading set could mean the torrent was
    // paused, deleted, or actually completed — verify with one targeted
    // fetch before notifying.
    void (async () => {
      try {
        const list = await getTorrents(
          { hashes: departed.map((t) => t.hash) },
          instanceId,
        );
        const stateByHash = new Map(list.map((t) => [t.hash, t.state]));
        for (const t of departed) {
          const newState = stateByHash.get(t.hash);
          if (newState && isCompletedState(newState)) {
            sendLocalNotification({
              title: "Download complete",
              body: t.name,
              data: { type: "torrent", hash: t.hash, instanceId },
            });
          }
        }
      } catch {
        // Best-effort — if verification fails, skip the notification rather
        // than risk a false positive.
      }
    })();
  }, [downloading, active, instanceId]);

  return null;
}

// --- SABnzbd: new history entries with status=Completed ---
// Per-instance: each enabled SAB instance gets its own watcher with isolated
// previous-id snapshot, so a completion on instance A doesn't get muted by
// the same nzo_id appearing on instance B.
function SabnzbdHistoryWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: sabHistory } = useSabHistory(20, instanceId);
  const prevSabHistoryIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!active) {
      prevSabHistoryIds.current = null;
      return;
    }
    if (!sabHistory) return;
    const prev = prevSabHistoryIds.current;
    const currentIds = new Set(sabHistory.slots.map((s) => s.nzo_id));
    if (prev !== null) {
      for (const slot of sabHistory.slots) {
        if (prev.has(slot.nzo_id)) continue;
        if (slot.status !== "Completed") continue;
        if (isManagedByArr(slot.category)) continue;
        sendLocalNotification({
          title: "Download complete",
          body: slot.name,
          data: { type: "sabnzbd", nzoId: slot.nzo_id, instanceId },
        });
      }
    }
    prevSabHistoryIds.current = currentIds;
  }, [sabHistory, active, instanceId]);

  return null;
}

// --- NZBGet: new history entries appear (success only, per backend diff
// semantics: SUCCESS and WARNING both count as delivered) ---
function NzbgetHistoryWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: history } = useNzbgetHistory(20, instanceId);
  const prevIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!active) {
      prevIds.current = null;
      return;
    }
    if (!history) return;
    const prev = prevIds.current;
    const currentIds = new Set(history.map((h) => h.NZBID));
    if (prev !== null) {
      for (const item of history) {
        if (prev.has(item.NZBID)) continue;
        const head = item.Status.split("/")[0];
        if (head !== "SUCCESS" && head !== "WARNING") continue;
        if (isManagedByArr(item.Category)) continue;
        sendLocalNotification({
          title: "Download complete",
          body: item.NZBName,
          data: { type: "nzbget", nzbId: String(item.NZBID), instanceId },
        });
      }
    }
    prevIds.current = currentIds;
  }, [history, active, instanceId]);

  return null;
}

function radarrHistoryDisplayTitle(r: RadarrHistoryRecord): string {
  if (r.movie?.title) {
    return r.movie.year ? `${r.movie.title} (${r.movie.year})` : r.movie.title;
  }
  return r.sourceTitle ?? "";
}

function sonarrHistoryDisplayTitle(r: SonarrHistoryRecord): string {
  if (r.series?.title && r.episode) {
    const ep = `S${String(r.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(r.episode.episodeNumber ?? 0).padStart(2, "0")}`;
    const epTitle = r.episode.title ? ` - ${r.episode.title}` : "";
    return `${r.series.title} ${ep}${epTitle}`;
  }
  if (r.series?.title) return r.series.title;
  return r.sourceTitle ?? "";
}

// --- Radarr: new `downloadFolderImported` history record appears ---
// Queue diffing produced false positives (delay-profile holds, internal state
// transitions); history records are immutable and explicit about completion.
function RadarrImportWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: history } = useRadarrHistory(instanceId);
  const prevIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!active) {
      prevIds.current = null;
      return;
    }
    if (!Array.isArray(history?.records)) return;
    const imported = history.records.filter(
      (r) => r.eventType === "downloadFolderImported",
    );
    const currentIds = new Set(imported.map((r) => r.id));
    const prev = prevIds.current;
    if (prev !== null) {
      for (const r of imported) {
        if (prev.has(r.id)) continue;
        sendLocalNotification({
          title: "Movie downloaded",
          body: radarrHistoryDisplayTitle(r),
          data: {
            type: "radarr",
            movieId: r.movieId ?? r.movie?.id,
            historyId: r.id,
            instanceId,
          },
        });
      }
    }
    prevIds.current = currentIds;
  }, [history, active, instanceId]);

  return null;
}

// --- Sonarr: new `downloadFolderImported` history record appears ---
function SonarrImportWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: history } = useSonarrHistory(instanceId);
  const prevIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!active) {
      prevIds.current = null;
      return;
    }
    if (!Array.isArray(history?.records)) return;
    const imported = history.records.filter(
      (r) => r.eventType === "downloadFolderImported",
    );
    const currentIds = new Set(imported.map((r) => r.id));
    const prev = prevIds.current;
    if (prev !== null) {
      for (const r of imported) {
        if (prev.has(r.id)) continue;
        sendLocalNotification({
          title: "Episode downloaded",
          body: sonarrHistoryDisplayTitle(r),
          data: {
            type: "sonarr",
            seriesId: r.seriesId ?? r.series?.id,
            historyId: r.id,
            instanceId,
          },
        });
      }
    }
    prevIds.current = currentIds;
  }, [history, active, instanceId]);

  return null;
}

// --- Service health: any instance online → offline ---
// Per-instance: fire one notification per (kind, instance) that goes offline.
// The instance name lands in the body so multi-instance setups can tell
// "Radarr (4K) is offline" from "Radarr (1080p) is offline".
function ServiceHealthWatcher({
  gate,
  active,
}: {
  gate: BaseGate;
  active: boolean;
}) {
  const { data: health } = useServiceHealth();
  const prevHealth = useRef<Map<string, boolean> | null>(null);

  useEffect(() => {
    if (gate.backendActive) return;
    if (!gate.hydrated || !gate.enabled || !active) return;
    if (!Array.isArray(health)) return;
    const prev = prevHealth.current;
    const currentMap = new Map<string, boolean>();
    for (const kind of health) {
      for (const inst of kind.instances) {
        const key = `${kind.id}:${inst.instanceId}`;
        currentMap.set(key, inst.online);
        if (prev !== null) {
          const wasOnline = prev.get(key);
          if (wasOnline === true && inst.online === false) {
            sendLocalNotification({
              title: "Service offline",
              body: `${inst.instanceName} is unreachable`,
              data: {
                type: "health",
                serviceId: kind.id,
                instanceId: inst.instanceId,
              },
            });
          }
        }
      }
    }
    prevHealth.current = currentMap;
  }, [health, gate.backendActive, gate.hydrated, gate.enabled, active]);

  return null;
}

// --- Overseerr: new pending request ---
function OverseerrRequestWatcher({
  instanceId,
  active,
}: {
  instanceId: string;
  active: boolean;
}) {
  const { data: overseerrRequests } = useOverseerrRequests(
    1,
    "pending",
    "added",
    instanceId,
  );
  const prevRequestIds = useRef<Set<number> | null>(null);
  const overseerrShapeWarned = useRef(false);

  // Surface a one-shot toast when Overseerr returns a body that isn't shaped
  // like { results: [...] } — usually a reverse-proxy auth challenge or a URL
  // that doesn't actually point at Overseerr. Without this the user just sees
  // empty screens with no clue why.
  useEffect(() => {
    if (overseerrShapeWarned.current) return;
    if (overseerrRequests === undefined) return;
    if (Array.isArray(overseerrRequests?.results)) return;
    overseerrShapeWarned.current = true;
    toast(
      "Seerr returned an unexpected response. Check the URL and API key.",
      "error",
    );
  }, [overseerrRequests]);

  useEffect(() => {
    if (!active) {
      prevRequestIds.current = null;
      return;
    }
    if (!Array.isArray(overseerrRequests?.results)) return;
    const currentIds = new Set(overseerrRequests.results.map((r) => r.id));
    const prev = prevRequestIds.current;
    if (prev !== null) {
      for (const req of overseerrRequests.results) {
        if (!prev.has(req.id)) {
          sendLocalNotification({
            title: "New request",
            body: `${req.requestedBy.displayName} requested a ${req.media.mediaType}`,
            data: { type: "overseerr", requestId: req.id, instanceId },
          });
        }
      }
    }
    prevRequestIds.current = currentIds;
  }, [overseerrRequests, active, instanceId]);

  return null;
}
