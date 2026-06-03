import type { JellyfinSession, PlexSession } from "@/lib/types";
import { getPlexImageSource } from "@/services/plex-api";
import {
  getJellyfinImageSource,
  isJellyfinTranscoding,
  ticksToMs,
} from "@/services/jellyfin-api";
import type { MediaServerId } from "@/lib/media-server-config";
import type { ServiceId } from "@/lib/constants";

// The media servers whose live sessions the combined "Now Playing" widget
// aggregates. Tautulli is deliberately excluded — it reports Plex's own
// streams, so including it would double-count.
export const NOW_PLAYING_SERVICE_IDS = ["plex", "jellyfin", "emby"] as const;
export type NowPlayingServiceId = (typeof NOW_PLAYING_SERVICE_IDS)[number];

// Normalized shape every server's session maps into, so one tile/row renders
// them all (mirrors lib/usenet-adapter.ts for SAB/NZBGet). Poster matches the
// expo-image source returned by the getXImageSource helpers.
//
// `serviceId` is the broad ServiceId (not just the media-server subset) because
// the Tautulli/Tracearr stream monitor reuses this shape and tile too — see
// lib/monitor-adapter.ts. The combined media-server card still scopes itself to
// NOW_PLAYING_SERVICE_IDS so Tautulli's Plex streams aren't double-counted.
export interface NowPlayingStream {
  key: string;
  serviceId: ServiceId;
  instanceId: string;
  title: string;
  user?: string;
  device?: string;
  isLocal: boolean;
  state: "playing" | "paused" | "buffering";
  transcoding: boolean;
  progress: number; // 0–1
  poster: { uri: string; cacheKey: string } | null;
  mediaType: "movie" | "tv";
  // Human-readable resolution label ("4K", "1080p", …) when the source reports
  // it. Used by the Activity tab's stream cards; left undefined by media-server
  // mappers that don't surface it.
  resolution?: string | null;
  // Rich per-track transcode breakdown, when the source exposes it (Tautulli).
  // The Activity tab makes a card expandable to show this; sources that don't
  // provide it leave it undefined.
  details?: StreamDetails;
}

// One decoded track row (video / audio / subtitle) for the per-stream detail.
export interface StreamTrackDetail {
  label: "Video" | "Audio" | "Subtitle";
  // Display decision: "Direct Play" | "Direct Stream" | "Transcode" | "Burn".
  decision: string;
  // Drives the badge color — true only for an actual transcode/burn.
  transcoding: boolean;
  // Codec/resolution/channel summary, e.g. "H264 1080p" or "DTS 5.1 → AAC 2.0".
  summary: string;
  // Per-track bitrate label ("3.0 Mbps", "256 kbps") when known.
  bitrateLabel?: string;
}

export interface StreamDetails {
  tracks: StreamTrackDetail[];
  // Source → stream container when remuxed/transcoded (e.g. "MKV → MP4").
  container?: string;
  // Overall stream bitrate label ("8.4 Mbps").
  totalBitrateLabel?: string;
  // Tautulli's quality-profile label ("Original", "1080p 8 Mbps", …).
  qualityProfile?: string;
}

// kbps → compact label. Returns undefined for 0/unknown so callers can omit it.
export function formatBitrateKbps(kbps: number | undefined): string | undefined {
  if (!kbps || kbps <= 0 || Number.isNaN(kbps)) return undefined;
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;
}

// Hidden-users filter input ("alice, bob" → {"alice","bob"}). Shared by the
// per-service cards and the combined widget.
export function parseHiddenUsers(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// Jellyfin/Emby don't tag sessions as local/remote like Plex does, so we sniff
// the RemoteEndPoint for the standard RFC1918 ranges + IPv6 link-local/ULA.
// Good enough for "hide my own TV from the dashboard" — not a security boundary.
export function isLocalEndpoint(remote: string | undefined): boolean {
  if (!remote) return false;
  const r = remote.toLowerCase().trim();
  if (!r) return false;

  let host: string;
  if (r.startsWith("[")) {
    const end = r.indexOf("]");
    host = end > 1 ? r.slice(1, end) : r.slice(1);
  } else if (r.includes(".") || r.split(":").length === 2) {
    host = r.split(":")[0]!;
  } else {
    host = r;
  }

  if (!host) return false;
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host.startsWith("fe80:") || host.startsWith("fe80::")) return true;
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
}

function plexIsTranscoding(session: PlexSession): boolean {
  return (
    session.TranscodeSession?.videoDecision === "transcode" ||
    session.TranscodeSession?.audioDecision === "transcode"
  );
}

// --- Mappers (one per server kind) ---

export function plexSessionToStream(
  session: PlexSession,
  instanceId: string,
): NowPlayingStream {
  const state =
    session.Player.state === "paused"
      ? "paused"
      : session.Player.state === "buffering"
        ? "buffering"
        : "playing";
  const title =
    session.type === "episode"
      ? `${session.grandparentTitle} — ${session.title}`
      : session.title;

  return {
    key: `plex:${instanceId}:${session.sessionKey}`,
    serviceId: "plex",
    instanceId,
    title,
    user: session.User.title,
    device: session.Player.title,
    isLocal: session.Player.local,
    state,
    transcoding: plexIsTranscoding(session),
    progress: session.duration > 0 ? session.viewOffset / session.duration : 0,
    poster: getPlexImageSource(
      session.thumb || session.grandparentThumb,
      220,
      330,
      instanceId,
    ),
    mediaType: session.type === "episode" ? "tv" : "movie",
  };
}

export function mediaServerSessionToStream(
  session: JellyfinSession,
  instanceId: string,
  serviceId: MediaServerId,
): NowPlayingStream {
  const item = session.NowPlayingItem;
  const durationMs = ticksToMs(item?.RunTimeTicks);
  const positionMs = ticksToMs(session.PlayState?.PositionTicks);
  const title =
    item?.Type === "Episode" && item.SeriesName
      ? `${item.SeriesName} — ${item.Name}`
      : (item?.Name ?? "Unknown");

  return {
    key: `${serviceId}:${instanceId}:${session.Id}`,
    serviceId,
    instanceId,
    title,
    user: session.UserName,
    device: session.Client,
    isLocal: isLocalEndpoint(session.RemoteEndPoint),
    state: session.PlayState?.IsPaused ? "paused" : "playing",
    transcoding: isJellyfinTranscoding(session),
    progress: durationMs > 0 ? positionMs / durationMs : 0,
    poster: getJellyfinImageSource(item ?? null, "Primary", 220, 330, instanceId, serviceId),
    mediaType: item?.Type === "Episode" ? "tv" : "movie",
  };
}
