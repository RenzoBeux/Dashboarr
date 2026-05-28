import type { JellyfinSession, PlexSession } from "@/lib/types";
import { getPlexImageSource } from "@/services/plex-api";
import {
  getJellyfinImageSource,
  isJellyfinTranscoding,
  ticksToMs,
} from "@/services/jellyfin-api";
import type { MediaServerId } from "@/lib/media-server-config";

// The media servers whose live sessions the combined "Now Playing" widget
// aggregates. Tautulli is deliberately excluded — it reports Plex's own
// streams, so including it would double-count.
export const NOW_PLAYING_SERVICE_IDS = ["plex", "jellyfin", "emby"] as const;
export type NowPlayingServiceId = (typeof NOW_PLAYING_SERVICE_IDS)[number];

// Normalized shape every server's session maps into, so one tile/row renders
// them all (mirrors lib/usenet-adapter.ts for SAB/NZBGet). Poster matches the
// expo-image source returned by the getXImageSource helpers.
export interface NowPlayingStream {
  key: string;
  serviceId: NowPlayingServiceId;
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
