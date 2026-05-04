import { useEffect, useRef } from "react";
import { useAllTorrents } from "@/hooks/use-qbittorrent";
import { useAllRTTorrents } from "@/hooks/use-rtorrent";
import { useRadarrQueue } from "@/hooks/use-radarr";
import { useSonarrQueue } from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useOverseerrRequests } from "@/hooks/use-overseerr";
import { useNotificationStore } from "@/store/notifications-store";
import { useBackendStore } from "@/store/backend-store";
import { useConfigStore } from "@/store/config-store";
import { sendLocalNotification } from "@/lib/notifications";
import { toast } from "@/components/ui/toast";
import { rtorrentStateToLabel } from "@/services/rtorrent-api";
import type { QBTorrent, TorrentState, RTTorrent } from "@/lib/types";

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

  const rtEnabled = useConfigStore((s) => s.services.rtorrent.enabled);

  // --- qBittorrent: torrent downloading → completed ---
  const { data: torrents } = useAllTorrents();
  const prevTorrents = useRef<Map<string, QBTorrent> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !torrentCompleted) return;
    if (!Array.isArray(torrents)) return;
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

  // --- rTorrent: torrent downloading → completed ---
  const { data: rtTorrents } = useAllRTTorrents();
  const prevRTTorrents = useRef<Map<string, RTTorrent> | null>(null);

  useEffect(() => {
    if (backendActive) return;
    if (!hydrated || !enabled || !torrentCompleted) return;
    if (!rtEnabled || !Array.isArray(rtTorrents)) return;
    const prev = prevRTTorrents.current;
    if (prev !== null) {
      for (const t of rtTorrents) {
        const prevT = prev.get(t.hash);
        if (prevT) {
          const wasDownloading = rtorrentStateToLabel(prevT) === "downloading";
          const isNowComplete = t.complete === 1 && prevT.complete === 0;
          if (wasDownloading && isNowComplete) {
            sendLocalNotification({
              title: "Download complete",
              body: t.name,
              data: { type: "torrent", hash: t.hash },
            });
          }
        }
      }
    }
    prevRTTorrents.current = new Map(rtTorrents.map((t) => [t.hash, t]));
  }, [rtTorrents, hydrated, enabled, torrentCompleted, backendActive, rtEnabled]);

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
      "Overseerr returned an unexpected response. Check the URL and API key.",
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
