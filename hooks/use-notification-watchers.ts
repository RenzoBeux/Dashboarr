import { useEffect, useRef } from "react";
import { useDownloadingTorrentsForWatcher } from "@/hooks/use-qbittorrent";
import { getTorrents } from "@/services/qbittorrent-api";
import { useRadarrQueue } from "@/hooks/use-radarr";
import { useSonarrQueue } from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useOverseerrRequests } from "@/hooks/use-overseerr";
import { useNotificationStore } from "@/store/notifications-store";
import { useBackendStore } from "@/store/backend-store";
import { sendLocalNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toast";
import type { QBTorrent, TorrentState } from "@/lib/types";

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

/**
 * Subscribes to existing React Query hooks and fires local notifications on
 * state transitions. Must be rendered inside a QueryClientProvider.
 */
export function useNotificationWatchers() {
  const enabled = useNotificationStore((s) => s.enabled);
  const hydrated = useNotificationStore((s) => s.hydrated);
  const torrentCompleted = useNotificationStore((s) => s.torrentCompleted);
  const radarrDownloaded = useNotificationStore((s) => s.radarrDownloaded);
  const sonarrDownloaded = useNotificationStore((s) => s.sonarrDownloaded);
  const serviceOffline = useNotificationStore((s) => s.serviceOffline);
  const overseerrNewRequest = useNotificationStore((s) => s.overseerrNewRequest);

  // When a backend is paired AND currently reachable, defer notifications to
  // it so the user doesn't get double-notified (one local, one push). If the
  // backend goes offline (2 consecutive /health failures), `backendActive`
  // flips back to false and local watchers take over again.
  const backendActive = useBackendStore(
    (s) => s.hydrated && !!s.sharedSecret && !!s.url && s.isHealthy,
  );

  // --- qBittorrent: torrent downloading → completed ---
  // We only fetch torrents currently in a downloading state (a small slice
  // even on huge libraries). When a hash leaves that set, we do a targeted
  // verification fetch by hash to disambiguate completion (notify) from
  // pause/delete (don't notify). The watcher query stays fully disabled
  // unless notifications are on, qBT is enabled, completions are wanted,
  // and the backend isn't already pushing — so the cost is zero at rest.
  const watcherActive =
    !backendActive && hydrated && enabled && torrentCompleted;
  const { data: downloading } = useDownloadingTorrentsForWatcher(watcherActive);
  const prevDownloading = useRef<Map<string, QBTorrent>>(new Map());

  // Reset the baseline whenever the watcher goes inactive so the next active
  // poll doesn't compare against a stale snapshot from before the gap.
  useEffect(() => {
    if (!watcherActive) prevDownloading.current = new Map();
  }, [watcherActive]);

  useEffect(() => {
    if (!watcherActive) return;
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
        const list = await getTorrents({ hashes: departed.map((t) => t.hash) });
        const stateByHash = new Map(list.map((t) => [t.hash, t.state]));
        for (const t of departed) {
          const newState = stateByHash.get(t.hash);
          if (newState && isCompletedState(newState)) {
            sendLocalNotification({
              title: "Download complete",
              body: t.name,
              data: { type: "torrent", hash: t.hash },
            });
          }
        }
      } catch {
        // Best-effort — if verification fails, skip the notification rather
        // than risk a false positive.
      }
    })();
  }, [downloading, watcherActive]);

  // --- Radarr: queue item disappears (success only) ---
  const { data: radarrQueue } = useRadarrQueue();
  const prevRadarrQueue = useRef<Map<number, { title: string; status?: string }> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !radarrDownloaded) return;
    if (!Array.isArray(radarrQueue?.records)) return;
    const prev = prevRadarrQueue.current;
    const currentMap = new Map(
      radarrQueue.records.map((r) => [
        r.id,
        { title: r.title, status: r.trackedDownloadStatus },
      ]),
    );
    if (prev !== null) {
      for (const [id, item] of prev) {
        if (!currentMap.has(id) && item.status !== "error") {
          sendLocalNotification({
            title: "Movie downloaded",
            body: item.title,
            data: { type: "radarr", queueId: id },
          });
        }
      }
    }
    prevRadarrQueue.current = currentMap;
  }, [radarrQueue, hydrated, enabled, radarrDownloaded, backendActive]);

  // --- Sonarr: queue item disappears (success only) ---
  const { data: sonarrQueue } = useSonarrQueue();
  const prevSonarrQueue = useRef<Map<number, { title: string; status?: string }> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !sonarrDownloaded) return;
    if (!Array.isArray(sonarrQueue?.records)) return;
    const prev = prevSonarrQueue.current;
    const currentMap = new Map(
      sonarrQueue.records.map((r) => [
        r.id,
        { title: r.title, status: r.trackedDownloadStatus },
      ]),
    );
    if (prev !== null) {
      for (const [id, item] of prev) {
        if (!currentMap.has(id) && item.status !== "error") {
          sendLocalNotification({
            title: "Episode downloaded",
            body: item.title,
            data: { type: "sonarr", queueId: id },
          });
        }
      }
    }
    prevSonarrQueue.current = currentMap;
  }, [sonarrQueue, hydrated, enabled, sonarrDownloaded, backendActive]);

  // --- Service health: online → offline ---
  const { data: health } = useServiceHealth();
  const prevHealth = useRef<Map<string, boolean> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !serviceOffline) return;
    if (!Array.isArray(health)) return;
    const prev = prevHealth.current;
    if (prev !== null) {
      for (const s of health) {
        const wasOnline = prev.get(s.id);
        if (wasOnline === true && s.online === false) {
          sendLocalNotification({
            title: "Service offline",
            body: `${s.name} is unreachable`,
            data: { type: "health", serviceId: s.id },
          });
        }
      }
    }
    prevHealth.current = new Map(health.map((s) => [s.id, s.online]));
  }, [health, hydrated, enabled, serviceOffline, backendActive]);

  // --- Overseerr: new pending request ---
  const { data: overseerrRequests } = useOverseerrRequests(1, "pending");
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
    if (backendActive) return;
    if (!hydrated || !enabled || !overseerrNewRequest) return;
    if (!Array.isArray(overseerrRequests?.results)) return;
    const currentIds = new Set(overseerrRequests.results.map((r) => r.id));
    const prev = prevRequestIds.current;
    if (prev !== null) {
      for (const req of overseerrRequests.results) {
        if (!prev.has(req.id)) {
          sendLocalNotification({
            title: "New request",
            body: `${req.requestedBy.displayName} requested a ${req.media.mediaType}`,
            data: { type: "overseerr", requestId: req.id },
          });
        }
      }
    }
    prevRequestIds.current = currentIds;
  }, [overseerrRequests, hydrated, enabled, overseerrNewRequest, backendActive]);
}
