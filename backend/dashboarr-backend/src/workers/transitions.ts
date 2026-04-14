import { getState, setState } from "../db/repos/seen-state.js";
import { dispatchPush } from "../push/dispatcher.js";
import type { TorrentState, QBTorrent } from "../services/qbittorrent.js";
import type { RadarrQueueItem } from "../services/radarr.js";
import type { SonarrQueueItem } from "../services/sonarr.js";
import type { OverseerrRequest } from "../services/overseerr.js";

/**
 * State-transition logic ported from
 * C:\Users\renzi\Documents\Proyectos\Dashboarr\hooks\use-notification-watchers.ts
 *
 * Core invariant: persist the new state **before** dispatching so a crash
 * between "saw change" and "pushed" won't re-fire after restart.
 */

const DOWNLOADING_STATES: readonly TorrentState[] = [
  "downloading",
  "metaDL",
  "stalledDL",
  "queuedDL",
  "forcedDL",
  "allocating",
  "checkingDL",
];

function isDownloading(state: TorrentState): boolean {
  return DOWNLOADING_STATES.includes(state);
}

// ---------------- qBittorrent ----------------

const QBT_KEY = "qbt:hashes:downloading";

interface QbtSnapshot {
  [hash: string]: { name: string; state: TorrentState };
}

export async function diffQbTorrents(torrents: QBTorrent[]): Promise<void> {
  const prev = getState<QbtSnapshot>(QBT_KEY);
  const next: QbtSnapshot = {};
  for (const t of torrents) {
    next[t.hash] = { name: t.name, state: t.state };
  }

  // Persist first, dispatch after.
  setState(QBT_KEY, next);

  if (!prev) return;

  for (const t of torrents) {
    const before = prev[t.hash];
    if (before && isDownloading(before.state) && !isDownloading(t.state)) {
      await dispatchPush({
        category: "torrentCompleted",
        title: "Download complete",
        body: t.name,
        data: { type: "torrent", hash: t.hash },
        dedupeKey: `qbt:completed:${t.hash}`,
      });
    }
  }
}

// ---------------- Radarr ----------------

const RADARR_KEY = "radarr:queue:ids";

interface QueueSnapshot {
  [id: string]: { title: string; status?: string };
}

export async function diffRadarrQueue(records: RadarrQueueItem[]): Promise<void> {
  const prev = getState<QueueSnapshot>(RADARR_KEY);
  const next: QueueSnapshot = {};
  for (const r of records) {
    next[String(r.id)] = { title: r.title, status: r.trackedDownloadStatus };
  }
  setState(RADARR_KEY, next);

  if (!prev) return;

  const currentIds = new Set(records.map((r) => String(r.id)));
  for (const [id, item] of Object.entries(prev)) {
    if (!currentIds.has(id) && item.status !== "error") {
      await dispatchPush({
        category: "radarrDownloaded",
        title: "Movie downloaded",
        body: item.title,
        data: { type: "radarr", queueId: Number(id) },
        dedupeKey: `radarr:downloaded:${id}`,
      });
    }
  }
}

// ---------------- Sonarr ----------------

const SONARR_KEY = "sonarr:queue:ids";

export async function diffSonarrQueue(records: SonarrQueueItem[]): Promise<void> {
  const prev = getState<QueueSnapshot>(SONARR_KEY);
  const next: QueueSnapshot = {};
  for (const r of records) {
    next[String(r.id)] = { title: r.title, status: r.trackedDownloadStatus };
  }
  setState(SONARR_KEY, next);

  if (!prev) return;

  const currentIds = new Set(records.map((r) => String(r.id)));
  for (const [id, item] of Object.entries(prev)) {
    if (!currentIds.has(id) && item.status !== "error") {
      await dispatchPush({
        category: "sonarrDownloaded",
        title: "Episode downloaded",
        body: item.title,
        data: { type: "sonarr", queueId: Number(id) },
        dedupeKey: `sonarr:downloaded:${id}`,
      });
    }
  }
}

// ---------------- Overseerr ----------------

const OVERSEERR_KEY = "overseerr:pending:ids";

interface OverseerrSnapshot {
  ids: number[];
}

export async function diffOverseerrPending(requests: OverseerrRequest[]): Promise<void> {
  const prev = getState<OverseerrSnapshot>(OVERSEERR_KEY);
  const currentIds = requests.map((r) => r.id);
  setState(OVERSEERR_KEY, { ids: currentIds });

  if (!prev) return;
  const prevSet = new Set(prev.ids);

  for (const req of requests) {
    if (!prevSet.has(req.id)) {
      await dispatchPush({
        category: "overseerrNewRequest",
        title: "New request",
        body: `${req.requestedBy.displayName} requested a ${req.media.mediaType}`,
        data: { type: "overseerr", requestId: req.id },
        dedupeKey: `overseerr:new:${req.id}`,
      });
    }
  }
}

// ---------------- Service health ----------------

/** Require this many consecutive failed pings before declaring a service offline. */
const OFFLINE_THRESHOLD = 3;

interface HealthState {
  online: boolean;
  failCount: number;
}

export async function diffHealth(
  serviceId: string,
  displayName: string,
  online: boolean,
): Promise<void> {
  const key = `health:${serviceId}:online`;
  const prev = getState<HealthState>(key);

  if (!prev) {
    setState(key, { online, failCount: online ? 0 : 1 });
    return;
  }

  if (online) {
    setState(key, { online: true, failCount: 0 });
    return;
  }

  // Ping failed — increment consecutive failure count
  const failCount = prev.failCount + 1;

  if (failCount >= OFFLINE_THRESHOLD && prev.online) {
    setState(key, { online: false, failCount });
    await dispatchPush({
      category: "serviceOffline",
      title: "Service offline",
      body: `${displayName} is unreachable`,
      data: { type: "health", serviceId },
      dedupeKey: `health:offline:${serviceId}:${Date.now() - (Date.now() % 300000)}`,
      // dedupe window is rounded to 5min buckets so flapping doesn't spam
    });
  } else {
    setState(key, { online: prev.online, failCount });
  }
}
