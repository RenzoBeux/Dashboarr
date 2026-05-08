import { getState, setState } from "../db/repos/seen-state.js";
import { getEnv } from "../env.js";
import { dispatchPush } from "../push/dispatcher.js";
import type { TorrentState, QBTorrent } from "../services/qbittorrent.js";
import type { SabHistorySlot } from "../services/sabnzbd.js";
import type { RadarrQueueItem } from "../services/radarr.js";
import type { SonarrQueueItem } from "../services/sonarr.js";
import type { OverseerrRequest } from "../services/overseerr.js";

/**
 * State-transition logic ported from
 * C:\Users\renzi\Documents\Proyectos\Dashboarr\hooks\use-notification-watchers.ts
 *
 * Core invariant: persist the new state **before** dispatching so a crash
 * between "saw change" and "pushed" won't re-fire after restart.
 *
 * Multi-instance: every seen_state key and every push dedupeKey is namespaced
 * by the source instance UUID. Two Radarrs grabbing the same movie produce
 * two distinct dedupe keys (one per instance), so a user with both linked
 * still gets a push from each rather than one silently swallowing the other.
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

// Post-download states. `pausedUP`/`stoppedUP` cover qBT 4.x and 5.x naming.
// Excluded on purpose: pausedDL/stoppedDL (paused mid-download), error/
// missingFiles/unknown (failures), and transient states like moving/
// checkingResumeData — they resolve into one of the buckets above on the next
// poll.
const COMPLETED_STATES: readonly TorrentState[] = [
  "uploading",
  "pausedUP",
  "stoppedUP",
  "queuedUP",
  "stalledUP",
  "checkingUP",
  "forcedUP",
];

function isDownloading(state: TorrentState): boolean {
  return DOWNLOADING_STATES.includes(state);
}

function isCompleted(state: TorrentState): boolean {
  return COMPLETED_STATES.includes(state);
}

/**
 * Per-instance push title formatting. When a kind has multiple instances,
 * prefix the instance name so the user can tell "Radarr Home" from "Radarr
 * Seedbox" without opening the app. Single-instance setups stay terse.
 */
function instancePrefix(instanceName: string, multipleOfKind: boolean): string {
  return multipleOfKind ? `${instanceName}: ` : "";
}

// ---------------- qBittorrent ----------------

/** Categories that Radarr/Sonarr set on torrents they manage. */
const MANAGED_CATEGORIES = new Set(["radarr", "sonarr", "tv-sonarr"]);

function isManagedByArr(category: string): boolean {
  return MANAGED_CATEGORIES.has(category.toLowerCase());
}

interface QbtSnapshot {
  [hash: string]: { name: string; state: TorrentState };
}

export async function diffQbTorrents(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  torrents: QBTorrent[],
): Promise<void> {
  const key = `qbt:${instanceId}:hashes:downloading`;
  const prev = getState<QbtSnapshot>(key);
  const next: QbtSnapshot = {};
  for (const t of torrents) {
    next[t.hash] = { name: t.name, state: t.state };
  }

  // Persist first, dispatch after.
  setState(key, next);

  if (!prev) return;

  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const t of torrents) {
    const before = prev[t.hash];
    if (before && isDownloading(before.state) && isCompleted(t.state)) {
      // Skip notification for torrents managed by Radarr/Sonarr — those
      // services send their own, more informative notifications.
      if (isManagedByArr(t.category)) continue;

      await dispatchPush({
        category: "torrentCompleted",
        title: `${prefix}Download complete`,
        body: t.name,
        data: { type: "torrent", hash: t.hash, instanceId },
        dedupeKey: `qbt:${instanceId}:completed:${t.hash}`,
      });
    }
  }
}

// ---------------- SABnzbd ----------------

interface SabSnapshot {
  ids: string[];
}

export async function diffSabHistory(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  slots: SabHistorySlot[],
): Promise<void> {
  const key = `sab:${instanceId}:nzo:history`;
  const prev = getState<SabSnapshot>(key);
  const currentIds = slots.map((s) => s.nzo_id);

  // Persist first, dispatch after.
  setState(key, { ids: currentIds });

  if (!prev) return;
  const prevSet = new Set(prev.ids);

  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const slot of slots) {
    if (prevSet.has(slot.nzo_id)) continue;
    if (slot.status !== "Completed") continue;
    if (isManagedByArr(slot.category)) continue;

    await dispatchPush({
      category: "sabnzbdCompleted",
      title: `${prefix}Download complete`,
      body: slot.name,
      data: { type: "sabnzbd", nzoId: slot.nzo_id, instanceId },
      dedupeKey: `sab:${instanceId}:completed:${slot.nzo_id}`,
    });
  }
}

// ---------------- Radarr ----------------

interface QueueSnapshot {
  [id: string]: { title: string; status?: string; entityId?: number };
}

function radarrDisplayTitle(r: RadarrQueueItem): string {
  if (r.movie?.title) {
    return r.movie.year ? `${r.movie.title} (${r.movie.year})` : r.movie.title;
  }
  return r.title;
}

export async function diffRadarrQueue(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  records: RadarrQueueItem[],
): Promise<void> {
  const key = `radarr:${instanceId}:queue:ids`;
  const prev = getState<QueueSnapshot>(key);
  const next: QueueSnapshot = {};
  for (const r of records) {
    next[String(r.id)] = {
      title: radarrDisplayTitle(r),
      status: r.trackedDownloadStatus,
      entityId: r.movieId ?? r.movie?.id,
    };
  }
  setState(key, next);

  if (!prev) return;

  const prefix = instancePrefix(instanceName, multipleOfKind);
  const currentIds = new Set(records.map((r) => String(r.id)));
  for (const [id, item] of Object.entries(prev)) {
    if (!currentIds.has(id) && item.status !== "error") {
      await dispatchPush({
        category: "radarrDownloaded",
        title: `${prefix}Movie downloaded`,
        body: item.title,
        data: { type: "radarr", movieId: item.entityId, instanceId },
        dedupeKey: `radarr:${instanceId}:downloaded:${id}`,
      });
    }
  }
}

// ---------------- Sonarr ----------------

function sonarrDisplayTitle(r: SonarrQueueItem): string {
  if (r.series?.title && r.episode) {
    const ep = `S${String(r.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(r.episode.episodeNumber ?? 0).padStart(2, "0")}`;
    const epTitle = r.episode.title ? ` - ${r.episode.title}` : "";
    return `${r.series.title} ${ep}${epTitle}`;
  }
  if (r.series?.title) return r.series.title;
  return r.title;
}

export async function diffSonarrQueue(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  records: SonarrQueueItem[],
): Promise<void> {
  const key = `sonarr:${instanceId}:queue:ids`;
  const prev = getState<QueueSnapshot>(key);
  const next: QueueSnapshot = {};
  for (const r of records) {
    next[String(r.id)] = {
      title: sonarrDisplayTitle(r),
      status: r.trackedDownloadStatus,
      entityId: r.seriesId ?? r.series?.id,
    };
  }
  setState(key, next);

  if (!prev) return;

  const prefix = instancePrefix(instanceName, multipleOfKind);
  const currentIds = new Set(records.map((r) => String(r.id)));
  for (const [id, item] of Object.entries(prev)) {
    if (!currentIds.has(id) && item.status !== "error") {
      await dispatchPush({
        category: "sonarrDownloaded",
        title: `${prefix}Episode downloaded`,
        body: item.title,
        data: { type: "sonarr", seriesId: item.entityId, instanceId },
        dedupeKey: `sonarr:${instanceId}:downloaded:${id}`,
      });
    }
  }
}

// ---------------- Overseerr ----------------

interface OverseerrSnapshot {
  ids: number[];
}

export async function diffOverseerrPending(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  requests: OverseerrRequest[],
): Promise<void> {
  const key = `overseerr:${instanceId}:pending:ids`;
  const prev = getState<OverseerrSnapshot>(key);
  const currentIds = requests.map((r) => r.id);
  setState(key, { ids: currentIds });

  if (!prev) return;
  const prevSet = new Set(prev.ids);

  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const req of requests) {
    if (!prevSet.has(req.id)) {
      await dispatchPush({
        category: "overseerrNewRequest",
        title: `${prefix}New request`,
        body: `${req.requestedBy.displayName} requested a ${req.media.mediaType}`,
        data: { type: "overseerr", requestId: req.id, instanceId },
        dedupeKey: `overseerr:${instanceId}:new:${req.id}`,
      });
    }
  }
}

// ---------------- Service health ----------------

/** Require this many consecutive failed pings before declaring a service offline. */
const OFFLINE_THRESHOLD = getEnv().OFFLINE_THRESHOLD;

interface HealthState {
  online: boolean;
  failCount: number;
}

export async function diffHealth(
  instanceId: string,
  kind: string,
  displayName: string,
  online: boolean,
): Promise<void> {
  const key = `health:${instanceId}:online`;
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
    // displayName is the per-instance name the user configured ("Radarr Home"
    // / "Radarr Seedbox"). For single-instance setups it's typically just the
    // kind name, matching the pre-multi-instance phrasing. No multipleOfKind
    // branching needed.
    await dispatchPush({
      category: "serviceOffline",
      title: "Service offline",
      body: `${displayName} is unreachable`,
      data: { type: "health", serviceId: kind, instanceId },
      dedupeKey: `health:offline:${instanceId}:${Date.now() - (Date.now() % 300000)}`,
      // dedupe window is rounded to 5min buckets so flapping doesn't spam
    });
  } else {
    setState(key, { online: prev.online, failCount });
  }
}
