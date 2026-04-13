import { useEffect, useRef } from "react";
import { useAllTorrents } from "@/hooks/use-qbittorrent";
import { useRadarrQueue } from "@/hooks/use-radarr";
import { useSonarrQueue } from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useOverseerrRequests } from "@/hooks/use-overseerr";
import { useNotificationStore } from "@/store/notifications-store";
import { useBackendStore } from "@/store/backend-store";
import { sendLocalNotification } from "@/lib/notifications";
import type { QBTorrent, TorrentState } from "@/lib/types";

const DOWNLOADING_STATES: TorrentState[] = [
  "downloading",
  "metaDL",
  "stalledDL",
  "queuedDL",
  "forcedDL",
  "allocating",
  "checkingDL",
];

function isDownloadingState(state: TorrentState): boolean {
  return DOWNLOADING_STATES.includes(state);
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
  const { data: torrents } = useAllTorrents();
  const prevTorrents = useRef<Map<string, QBTorrent> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !torrentCompleted || !torrents) return;
    const prev = prevTorrents.current;
    if (prev !== null) {
      for (const t of torrents) {
        const prevT = prev.get(t.hash);
        if (prevT && isDownloadingState(prevT.state) && !isDownloadingState(t.state)) {
          sendLocalNotification({
            title: "Download complete",
            body: t.name,
            data: { type: "torrent", hash: t.hash },
          });
        }
      }
    }
    prevTorrents.current = new Map(torrents.map((t) => [t.hash, t]));
  }, [torrents, hydrated, enabled, torrentCompleted, backendActive]);

  // --- Radarr: queue item disappears (success only) ---
  const { data: radarrQueue } = useRadarrQueue();
  const prevRadarrQueue = useRef<Map<number, { title: string; status?: string }> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !radarrDownloaded || !radarrQueue) return;
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
    if (!hydrated || !enabled || !sonarrDownloaded || !sonarrQueue) return;
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
    if (!hydrated || !enabled || !serviceOffline || !health) return;
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

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !overseerrNewRequest || !overseerrRequests) return;
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
