import { getState, setState } from "../db/repos/seen-state.js";
import { getEnv } from "../env.js";
import { dispatchPush } from "../push/dispatcher.js";
import type { TorrentState, QBTorrent } from "../services/qbittorrent.js";
import type { TransmissionTorrent } from "../services/transmission.js";
import type { SabHistorySlot } from "../services/sabnzbd.js";
import type { NzbgetHistoryItem } from "../services/nzbget.js";
import type { NotificationCategory } from "../types.js";
import type { RadarrHistoryRecord } from "../services/radarr.js";
import type { SonarrHistoryRecord } from "../services/sonarr.js";
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

// ---------------- Transmission ----------------

// Transmission `status`: 3 = queued to download, 4 = downloading. percentDone is
// the authoritative completion signal (a torrent that finishes and immediately
// stops becomes status 0, so status alone can't tell "done" from "paused").
function isTransmissionDownloading(t: { status: number; percentDone: number }): boolean {
  return t.percentDone < 1 && (t.status === 3 || t.status === 4);
}
function isTransmissionCompleted(t: { percentDone: number }): boolean {
  return t.percentDone >= 1;
}

interface TransmissionSnapshot {
  [hash: string]: { name: string; status: number; percentDone: number };
}

export async function diffTransmissionTorrents(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  torrents: TransmissionTorrent[],
): Promise<void> {
  const key = `transmission:${instanceId}:hashes:downloading`;
  const prev = getState<TransmissionSnapshot>(key);
  const next: TransmissionSnapshot = {};
  for (const t of torrents) {
    next[t.hash] = { name: t.name, status: t.status, percentDone: t.percentDone };
  }

  // Persist first, dispatch after.
  setState(key, next);
  if (!prev) return;

  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const t of torrents) {
    const before = prev[t.hash];
    if (before && isTransmissionDownloading(before) && isTransmissionCompleted(t)) {
      // Skip torrents managed by Radarr/Sonarr — those services notify
      // themselves. Transmission carries the *arr name as a label, not category.
      if (isManagedByArr(t.labels[0] ?? "")) continue;

      await dispatchPush({
        category: "torrentCompleted",
        title: `${prefix}Download complete`,
        body: t.name,
        data: { type: "transmission", hash: t.hash, instanceId },
        dedupeKey: `transmission:${instanceId}:completed:${t.hash}`,
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

function radarrDisplayTitle(r: RadarrHistoryRecord): string {
  if (r.movie?.title) {
    return r.movie.year ? `${r.movie.title} (${r.movie.year})` : r.movie.title;
  }
  return r.sourceTitle ?? "";
}

// Diffs Radarr's /history endpoint for newly-imported releases. We only
// announce records with eventType "downloadFolderImported" — the queue can
// shed items for many non-success reasons (delay profile, manual removal,
// internal state transitions), so queue disappearance is not a reliable
// success signal.
export async function diffRadarrHistory(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  records: RadarrHistoryRecord[],
): Promise<void> {
  const key = `radarr:${instanceId}:history:seen`;
  const prev = getState<number[]>(key);

  const imported = records.filter((r) => r.eventType === "downloadFolderImported");
  const currentIds = imported.map((r) => r.id);

  setState(key, currentIds);
  if (!prev) return;

  const prevSet = new Set(prev);
  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const r of imported) {
    if (prevSet.has(r.id)) continue;
    await dispatchPush({
      category: "radarrDownloaded",
      title: `${prefix}Movie downloaded`,
      body: radarrDisplayTitle(r),
      data: { type: "radarr", movieId: r.movieId ?? r.movie?.id, instanceId },
      dedupeKey: r.downloadId
        ? `radarr:${instanceId}:downloaded:${r.downloadId}`
        : `radarr:${instanceId}:history:${r.id}`,
    });
  }
}

// ---------------- Sonarr ----------------

function sonarrDisplayTitle(r: SonarrHistoryRecord): string {
  if (r.series?.title && r.episode) {
    const ep = `S${String(r.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(r.episode.episodeNumber ?? 0).padStart(2, "0")}`;
    const epTitle = r.episode.title ? ` - ${r.episode.title}` : "";
    return `${r.series.title} ${ep}${epTitle}`;
  }
  if (r.series?.title) return r.series.title;
  return r.sourceTitle ?? "";
}

// Diffs Sonarr's /history endpoint for newly-imported releases. See the
// Radarr equivalent above for why we no longer diff /queue (Sonarr's Delay
// Profile and other internal transitions cause queue items to disappear
// without being imported, which previously fired false-positive notifications).
export async function diffSonarrHistory(
  instanceId: string,
  instanceName: string,
  multipleOfKind: boolean,
  records: SonarrHistoryRecord[],
): Promise<void> {
  const key = `sonarr:${instanceId}:history:seen`;
  const prev = getState<number[]>(key);

  const imported = records.filter((r) => r.eventType === "downloadFolderImported");
  const currentIds = imported.map((r) => r.id);

  setState(key, currentIds);
  if (!prev) return;

  const prevSet = new Set(prev);
  const prefix = instancePrefix(instanceName, multipleOfKind);

  for (const r of imported) {
    if (prevSet.has(r.id)) continue;
    await dispatchPush({
      category: "sonarrDownloaded",
      title: `${prefix}Episode downloaded`,
      body: sonarrDisplayTitle(r),
      data: { type: "sonarr", seriesId: r.seriesId ?? r.series?.id, instanceId },
      dedupeKey: r.downloadId
        ? `sonarr:${instanceId}:downloaded:${r.downloadId}`
        : `sonarr:${instanceId}:history:${r.id}`,
    });
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
