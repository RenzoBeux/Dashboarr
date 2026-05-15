import { getState, setState } from "../db/repos/seen-state.js";
import { getEnv } from "../env.js";
import { dispatchPush } from "../push/dispatcher.js";
import type { TorrentState, QBTorrent } from "../services/qbittorrent.js";
import type { SabHistorySlot } from "../services/sabnzbd.js";
import type { NzbgetHistoryItem } from "../services/nzbget.js";
import type { NotificationCategory } from "../types.js";
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

// ---------------- Usenet (SABnzbd, NZBGet) ----------------

interface UsenetSnapshot {
  ids: string[];
}

/**
 * Identifies which fields a Usenet client's history items expose so the
 * generic completion-diff can pull out the id, name, completion check, and
 * "managed by an *arr service" check without knowing the concrete shape.
 */
interface UsenetDiffSpec<T> {
  /** Short prefix for the dedupe key (e.g. "sab", "nzbget"). */
  serviceKey: string;
  /**
   * Builds the seen_state key. SAB shipped with `sab:${id}:nzo:history`; this
   * stays parameterized so we can match that exactly and not re-fire every
   * history item on backend upgrade.
   */
  seenStateKey: (instanceId: string) => string;
  /** Notification category toggle the user can enable/disable. */
  notificationCategory: NotificationCategory;
  /** `data.type` shipped to the device — drives the deep-link router. */
  payloadType: string;
  /** `data` field name carrying the per-item id. */
  payloadIdKey: string;
  getId: (item: T) => string;
  getName: (item: T) => string;
  getCategory: (item: T) => string;
  isCompleted: (item: T) => boolean;
}

async function diffUsenetCompletionSet<T>(
  spec: UsenetDiffSpec<T>,
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  items: T[],
): Promise<void> {
  const key = spec.seenStateKey(instanceId);
  const prev = getState<UsenetSnapshot>(key);
  const currentIds = items.map((i) => spec.getId(i));

  // Persist first, dispatch after — a crash between snapshot and push must not
  // re-fire on restart.
  setState(key, { ids: currentIds });

  if (!prev) return;
  const prevSet = new Set(prev.ids);
  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const item of items) {
    const id = spec.getId(item);
    if (prevSet.has(id)) continue;
    if (!spec.isCompleted(item)) continue;
    if (isManagedByArr(spec.getCategory(item))) continue;

    await dispatchPush({
      category: spec.notificationCategory,
      title: `${prefix}Download complete`,
      body: spec.getName(item),
      data: {
        type: spec.payloadType,
        [spec.payloadIdKey]: id,
        instanceId,
      },
      dedupeKey: `${spec.serviceKey}:${instanceId}:completed:${id}`,
    });
  }
}

const SAB_DIFF: UsenetDiffSpec<SabHistorySlot> = {
  serviceKey: "sab",
  // Pre-refactor key shape — keep verbatim so existing snapshots still match.
  seenStateKey: (id) => `sab:${id}:nzo:history`,
  notificationCategory: "sabnzbdCompleted",
  payloadType: "sabnzbd",
  payloadIdKey: "nzoId",
  getId: (s) => s.nzo_id,
  getName: (s) => s.name,
  getCategory: (s) => s.category,
  isCompleted: (s) => s.status === "Completed",
};

const NZBGET_DIFF: UsenetDiffSpec<NzbgetHistoryItem> = {
  serviceKey: "nzbget",
  seenStateKey: (id) => `nzbget:${id}:history`,
  notificationCategory: "nzbgetCompleted",
  payloadType: "nzbget",
  payloadIdKey: "nzbId",
  getId: (h) => String(h.NZBID),
  getName: (h) => h.NZBName,
  getCategory: (h) => h.Category,
  // History `Status` is "SUCCESS/ALL", "FAILURE/PAR", "WARNING/HEALTH", etc.
  // SUCCESS and WARNING both mean the file landed; FAILURE/DELETED do not.
  isCompleted: (h) => {
    const head = h.Status.split("/")[0];
    return head === "SUCCESS" || head === "WARNING";
  },
};

export async function diffSabHistory(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  slots: SabHistorySlot[],
): Promise<void> {
  await diffUsenetCompletionSet(SAB_DIFF, instanceId, instanceName, multipleOfKind, slots);
}

export async function diffNzbgetHistory(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  items: NzbgetHistoryItem[],
): Promise<void> {
  await diffUsenetCompletionSet(NZBGET_DIFF, instanceId, instanceName, multipleOfKind, items);
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
