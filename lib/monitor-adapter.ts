import type { NowPlayingStream } from "@/lib/now-playing-stream";
import type {
  TautulliHistoryItem,
  TautulliSession,
  TracearrSessionHistory,
  TracearrStream,
} from "@/lib/types";
import {
  getActivity as getTautulliActivity,
  getHistory as getTautulliHistory,
  getTautulliSessionPoster,
} from "@/services/tautulli-api";
import {
  getHistory as getTracearrHistory,
  getStreams as getTracearrStreams,
  getTracearrImageSource,
} from "@/services/tracearr-api";

/**
 * Shared adapter unifying the two "active-stream monitor" services — Tautulli
 * and Tracearr — behind one normalized surface (mirrors lib/usenet-adapter.ts
 * for SAB/NZBGet). The Activity tab and the Stream Activity dashboard widget
 * consume this so neither needs service-specific knowledge: both render the
 * normalized NowPlayingStream (via NowPlayingStreamTile) and MonitorHistoryItem.
 */
export const MONITOR_KINDS = ["tautulli", "tracearr"] as const;
export type MonitorKind = (typeof MONITOR_KINDS)[number];

// Aggregate live-activity result for one monitor instance.
export interface MonitorActivity {
  streams: NowPlayingStream[];
  streamCount: number;
  // Pre-formatted total-bandwidth label (e.g. "45.2 Mbps") when the source
  // exposes one cheaply; omitted otherwise.
  bandwidthLabel?: string;
}

// One normalized history row (shared shape for both sources).
export interface MonitorHistoryItem {
  key: string;
  title: string;
  user: string;
  device: string;
  durationMin: number;
  watched: boolean;
  percentComplete: number;
  date: Date;
  poster: { uri: string; cacheKey: string } | null;
}

export interface MonitorAdapter {
  kind: MonitorKind;
  getActivity(instanceId: string): Promise<MonitorActivity>;
  getHistory(length: number, instanceId: string): Promise<MonitorHistoryItem[]>;
}

// --- Mappers: Tautulli ---

function tautulliSessionToStream(s: TautulliSession, instanceId: string): NowPlayingStream {
  const pct = parseInt(s.progress_percent, 10);
  return {
    key: `tautulli:${instanceId}:${s.session_key}`,
    serviceId: "tautulli",
    instanceId,
    title: s.full_title,
    user: s.user,
    device: s.player,
    isLocal: false,
    state: s.state,
    transcoding: s.transcode_decision === "transcode",
    progress: Number.isNaN(pct) ? 0 : pct / 100,
    // Picks the album cover for music, show poster for episodes, item thumb for
    // movies — each with the correct pms_image_proxy fallback (issue #141).
    poster: getTautulliSessionPoster(s, 220, 330, instanceId),
    mediaType: s.media_type === "episode" ? "tv" : "movie",
    resolution: s.video_resolution || null,
  };
}

function tautulliHistoryToItem(h: TautulliHistoryItem, instanceId: string): MonitorHistoryItem {
  return {
    key: `tautulli:${instanceId}:${h.row_id}`,
    title: h.full_title,
    user: h.friendly_name,
    device: h.player,
    durationMin: Math.round((h.duration || 0) / 60), // Tautulli duration is seconds
    watched: h.watched_status === 1,
    percentComplete: h.percent_complete,
    date: new Date(h.date * 1000),
    poster: null,
  };
}

// --- Mappers: Tracearr ---

function tracearrStreamToStream(s: TracearrStream, instanceId: string): NowPlayingStream {
  const title =
    s.mediaType === "episode" && s.showTitle ? `${s.showTitle} — ${s.mediaTitle}` : s.mediaTitle;
  const progress = s.durationMs && s.durationMs > 0 ? s.progressMs / s.durationMs : 0;
  const transcoding =
    s.isTranscode === true || s.videoDecision === "transcode" || s.audioDecision === "transcode";
  return {
    key: `tracearr:${instanceId}:${s.id}`,
    serviceId: "tracearr",
    instanceId,
    title,
    user: s.username,
    device: s.player ?? s.product ?? s.device ?? undefined,
    isLocal: false,
    // Active streams are playing/paused; "stopped" shouldn't surface here.
    state: s.state === "paused" ? "paused" : "playing",
    transcoding,
    progress,
    poster: getTracearrImageSource(s.posterUrl, instanceId),
    mediaType: s.mediaType === "episode" ? "tv" : "movie",
    resolution: s.resolution || null,
  };
}

function tracearrHistoryToItem(
  h: TracearrSessionHistory,
  instanceId: string,
): MonitorHistoryItem {
  const title =
    h.mediaType === "episode" && h.showTitle ? `${h.showTitle} — ${h.mediaTitle}` : h.mediaTitle;
  const pct =
    h.totalDurationMs && h.totalDurationMs > 0 && h.progressMs != null
      ? Math.round((h.progressMs / h.totalDurationMs) * 100)
      : 0;
  return {
    key: `tracearr:${instanceId}:${h.id}`,
    title,
    user: h.user.username,
    device: h.player ?? h.device ?? "",
    durationMin: Math.round((h.durationMs ?? 0) / 60000), // Tracearr duration is ms
    watched: h.watched,
    percentComplete: pct,
    date: new Date(h.startedAt),
    poster: getTracearrImageSource(h.posterUrl, instanceId),
  };
}

// --- Adapters ---

const tautulliAdapter: MonitorAdapter = {
  kind: "tautulli",
  async getActivity(instanceId) {
    const activity = await getTautulliActivity(instanceId);
    const sessions = activity?.sessions ?? [];
    return {
      streams: sessions.map((s) => tautulliSessionToStream(s, instanceId)),
      streamCount: parseInt(activity?.stream_count ?? "0", 10) || sessions.length,
      // Tautulli reports total_bandwidth in kbps. Show it as Mbps to match
      // Tracearr's summary.totalBitrate ("X Mbps") so a combined Tautulli +
      // Tracearr view uses one unit instead of mixing "MB/s" with "Mbps".
      bandwidthLabel: activity
        ? `${((activity.total_bandwidth || 0) / 1000).toFixed(1)} Mbps`
        : undefined,
    };
  },
  async getHistory(length, instanceId) {
    const { data } = await getTautulliHistory(length, 0, instanceId);
    return (data ?? []).map((h) => tautulliHistoryToItem(h, instanceId));
  },
};

const tracearrAdapter: MonitorAdapter = {
  kind: "tracearr",
  async getActivity(instanceId) {
    const res = await getTracearrStreams(instanceId);
    const data = res?.data ?? [];
    return {
      streams: data.map((s) => tracearrStreamToStream(s, instanceId)),
      streamCount: res?.summary?.total ?? data.length,
      bandwidthLabel: res?.summary?.totalBitrate || undefined,
    };
  },
  async getHistory(length, instanceId) {
    const res = await getTracearrHistory(1, length, instanceId);
    return (res?.data ?? []).map((h) => tracearrHistoryToItem(h, instanceId));
  },
};

const ADAPTERS: Record<MonitorKind, MonitorAdapter> = {
  tautulli: tautulliAdapter,
  tracearr: tracearrAdapter,
};

export function getMonitorAdapter(kind: MonitorKind): MonitorAdapter {
  return ADAPTERS[kind];
}
