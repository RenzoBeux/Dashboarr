import {
  formatBitrateKbps,
  isLocalEndpoint,
  mediaServerSessionToStream,
  type NowPlayingStream,
  type StreamDetails,
  type StreamTrackDetail,
} from "@/lib/now-playing-stream";
import type { MediaServerId } from "@/lib/media-server-config";
import type {
  JellyfinSession,
  JellystatActivityRow,
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
import {
  getSessions as getMediaServerSessions,
  isJellyfinTranscoding,
  ticksToMs,
} from "@/services/jellyfin-api";
import {
  getPlaybackActivity as getJellystatHistory,
  getSessions as getJellystatSessions,
} from "@/services/jellystat-api";

/**
 * Shared adapter unifying the "active-stream monitor" services behind one
 * normalized surface (mirrors lib/usenet-adapter.ts for SAB/NZBGet). The
 * Activity tab and the Stream Activity dashboard widget consume this so neither
 * needs service-specific knowledge: all render the normalized NowPlayingStream
 * (via NowPlayingStreamTile).
 *
 * Tautulli, Tracearr, and JellyStat expose both live streams AND watch history.
 * Jellyfin and Emby expose live sessions only (no history endpoint we consume),
 * so they set `supportsHistory: false` and the Activity tab's History view omits
 * them. JellyStat surfaces history/stats for Jellyfin the way Tautulli does for
 * Plex; its live sessions come from JellyStat's /proxy/getSessions passthrough.
 */
export const MONITOR_KINDS = ["tautulli", "tracearr", "jellystat", "jellyfin", "emby"] as const;
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
  // 0–100 completion when the source reports it (Tautulli/Tracearr). JellyStat
  // logs watch duration but not item runtime, so it can't compute completion —
  // it leaves this unset and the History row simply omits the percentage.
  percentComplete?: number;
  date: Date;
  poster: { uri: string; cacheKey: string } | null;
}

export interface MonitorAdapter {
  kind: MonitorKind;
  // Whether this source has a watch-history surface. When false, getHistory
  // returns [] and the Activity tab leaves it out of the History view.
  supportsHistory: boolean;
  getActivity(instanceId: string): Promise<MonitorActivity>;
  getHistory(length: number, instanceId: string): Promise<MonitorHistoryItem[]>;
}

// --- Mappers: Tautulli ---

// Tautulli per-track decision → display label + whether it's an actual
// transcode/burn (drives badge color). Returns null for tracks not in play.
function decisionLabel(d: string): { text: string; transcoding: boolean } | null {
  switch (d) {
    case "transcode":
      return { text: "Transcode", transcoding: true };
    case "copy":
      return { text: "Direct Stream", transcoding: false };
    case "burn":
      return { text: "Burn", transcoding: true };
    case "direct play":
      return { text: "Direct Play", transcoding: false };
    default:
      return null;
  }
}

function toKbps(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) || n <= 0 ? undefined : n;
}

// "H264 1080p → H264 720p" when transcoding to a different target, else the
// single source/stream descriptor.
function srcDstSummary(src: string, dst: string, transcoding: boolean): string {
  if (transcoding && dst && dst !== src) return `${src} → ${dst}`;
  return dst || src || "—";
}

function tautulliSessionToDetails(s: TautulliSession): StreamDetails | undefined {
  const tracks: StreamTrackDetail[] = [];

  const video = decisionLabel(s.video_decision);
  if (video) {
    const src = [s.video_codec?.toUpperCase(), s.video_full_resolution].filter(Boolean).join(" ");
    const dst = [s.stream_video_codec?.toUpperCase(), s.stream_video_full_resolution]
      .filter(Boolean)
      .join(" ");
    tracks.push({
      label: "Video",
      decision: video.text,
      transcoding: video.transcoding,
      summary: srcDstSummary(src, dst, video.transcoding),
      bitrateLabel: formatBitrateKbps(toKbps(s.stream_video_bitrate) ?? toKbps(s.video_bitrate)),
    });
  }

  const audio = decisionLabel(s.audio_decision);
  if (audio) {
    const src = [s.audio_codec?.toUpperCase(), s.audio_channel_layout].filter(Boolean).join(" ");
    const dst = [s.stream_audio_codec?.toUpperCase(), s.stream_audio_channel_layout]
      .filter(Boolean)
      .join(" ");
    tracks.push({
      label: "Audio",
      decision: audio.text,
      transcoding: audio.transcoding,
      summary: srcDstSummary(src, dst, audio.transcoding),
      bitrateLabel: formatBitrateKbps(toKbps(s.stream_audio_bitrate) ?? toKbps(s.audio_bitrate)),
    });
  }

  const subtitle = decisionLabel(s.subtitle_decision);
  if (subtitle) {
    tracks.push({
      label: "Subtitle",
      decision: subtitle.text,
      transcoding: subtitle.transcoding,
      summary:
        [s.subtitle_codec?.toUpperCase(), s.subtitle_language].filter(Boolean).join(" ") || "—",
    });
  }

  if (tracks.length === 0) return undefined;

  const container =
    s.container && s.stream_container && s.container !== s.stream_container
      ? `${s.container.toUpperCase()} → ${s.stream_container.toUpperCase()}`
      : s.stream_container?.toUpperCase() || s.container?.toUpperCase() || undefined;

  return {
    tracks,
    container,
    totalBitrateLabel: formatBitrateKbps(toKbps(s.stream_bitrate) ?? toKbps(s.bitrate)),
    qualityProfile: s.quality_profile || undefined,
  };
}

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
    details: tautulliSessionToDetails(s),
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

// --- Mappers: JellyStat ---

// JellyStat's /proxy/getSessions returns the raw Jellyfin Sessions payload, so
// these reuse the Jellyfin helpers (ticksToMs, isJellyfinTranscoding). Unlike
// the native Jellyfin adapter we can't build a poster — JellyStat doesn't proxy
// item images and we don't hold the Jellyfin URL/key here — so poster is null
// (the Activity tab's stream cards don't render posters anyway).
function jellystatSessionToStream(s: JellyfinSession, instanceId: string): NowPlayingStream {
  const item = s.NowPlayingItem;
  const durationMs = ticksToMs(item?.RunTimeTicks);
  const positionMs = ticksToMs(s.PlayState?.PositionTicks);
  const title =
    item?.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} — ${item.Name}`
      : (item?.Name ?? "Unknown");
  return {
    key: `jellystat:${instanceId}:${s.Id}`,
    serviceId: "jellystat",
    instanceId,
    title,
    user: s.UserName,
    device: s.Client,
    isLocal: isLocalEndpoint(s.RemoteEndPoint),
    state: s.PlayState?.IsPaused ? "paused" : "playing",
    transcoding: isJellyfinTranscoding(s),
    progress: durationMs > 0 ? positionMs / durationMs : 0,
    poster: null,
    mediaType: item?.Type === "Episode" ? "tv" : "movie",
  };
}

function jellystatActivityToHistoryItem(
  r: JellystatActivityRow,
  instanceId: string,
): MonitorHistoryItem {
  const title =
    r.SeriesName && r.EpisodeId
      ? `${r.SeriesName} — ${r.NowPlayingItemName ?? ""}`.trim()
      : (r.NowPlayingItemName ?? "Unknown");
  // PlaybackDuration is seconds, serialized as a string by node-postgres.
  const seconds = Number(r.PlaybackDuration ?? 0);
  return {
    key: `jellystat:${instanceId}:${r.Id}`,
    title,
    user: r.UserName ?? "",
    device: r.DeviceName || r.Client || "",
    durationMin: Math.round((Number.isFinite(seconds) ? seconds : 0) / 60),
    // JellyStat only logs real playback sessions, so treat each as a watch
    // event. It exposes no item runtime, so percentComplete stays unset.
    watched: true,
    date: new Date(r.ActivityDateInserted ?? Date.now()),
    poster: null,
  };
}

// --- Adapters ---

const tautulliAdapter: MonitorAdapter = {
  kind: "tautulli",
  supportsHistory: true,
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
  supportsHistory: true,
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

// Jellyfin and Emby share the same Sessions API (only the serviceId differs),
// so one factory produces both. Live sessions only — getHistory is a no-op.
function mediaServerMonitorAdapter(kind: MediaServerId): MonitorAdapter {
  return {
    kind,
    supportsHistory: false,
    async getActivity(instanceId) {
      const sessions = await getMediaServerSessions(instanceId, kind);
      return {
        streams: sessions.map((s) => mediaServerSessionToStream(s, instanceId, kind)),
        streamCount: sessions.length,
      };
    },
    async getHistory() {
      return [];
    },
  };
}

const jellystatAdapter: MonitorAdapter = {
  kind: "jellystat",
  supportsHistory: true,
  async getActivity(instanceId) {
    const sessions = await getJellystatSessions(instanceId);
    return {
      streams: sessions.map((s) => jellystatSessionToStream(s, instanceId)),
      streamCount: sessions.length,
    };
  },
  async getHistory(length, instanceId) {
    const rows = await getJellystatHistory(length, 1, instanceId);
    return rows.map((r) => jellystatActivityToHistoryItem(r, instanceId));
  },
};

const ADAPTERS: Record<MonitorKind, MonitorAdapter> = {
  tautulli: tautulliAdapter,
  tracearr: tracearrAdapter,
  jellystat: jellystatAdapter,
  jellyfin: mediaServerMonitorAdapter("jellyfin"),
  emby: mediaServerMonitorAdapter("emby"),
};

export function getMonitorAdapter(kind: MonitorKind): MonitorAdapter {
  return ADAPTERS[kind];
}
