import { isLocalEndpoint } from "@/lib/now-playing-stream";
import type {
  TautulliActivity,
  PlexSession,
  JellyfinSession,
} from "@/lib/types";

// Media servers that can report live streaming bandwidth. Tautulli and Plex
// expose measured bandwidth; Jellyfin/Emby only expose the transcode target
// bitrate (and only while a stream is transcoding) — see the converter below.
export type StreamingServiceId = "tautulli" | "plex" | "jellyfin" | "emby";

// Streaming is outbound-only (server → viewers). We split it by client
// location: WAN = remote/internet, LAN = local. Both values are in kbit/s.
export interface WanLanKbps {
  wan: number;
  lan: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Tautulli aggregates WAN/LAN bandwidth server-side (kbps) — the cleanest source.
export function tautulliActivityToWanLan(
  activity: TautulliActivity | undefined,
): WanLanKbps {
  if (!activity) return { wan: 0, lan: 0 };
  return { wan: num(activity.wan_bandwidth), lan: num(activity.lan_bandwidth) };
}

// Plex tags each session with its bandwidth (kbps) and lan/wan location; sum
// the active sessions per bucket.
export function plexSessionsToWanLan(
  sessions: PlexSession[] | undefined,
): WanLanKbps {
  let wan = 0;
  let lan = 0;
  for (const s of sessions ?? []) {
    const bw = num(s.Session?.bandwidth);
    if (s.Session?.location === "wan") wan += bw;
    else lan += bw;
  }
  return { wan, lan };
}

// Jellyfin/Emby expose no measured bandwidth — only TranscodingInfo.Bitrate
// (bits/sec, the transcode target), and only while a session is transcoding.
// Direct-play streams contribute nothing, so this is an approximation. LAN vs
// WAN is inferred from the session's RemoteEndPoint.
export function mediaServerSessionsToWanLan(
  sessions: JellyfinSession[] | undefined,
): WanLanKbps {
  let wan = 0;
  let lan = 0;
  for (const s of sessions ?? []) {
    const bitrateBps = num(s.TranscodingInfo?.Bitrate);
    if (bitrateBps <= 0) continue;
    const kbps = bitrateBps / 1000; // bits/s → kbit/s
    if (isLocalEndpoint(s.RemoteEndPoint)) lan += kbps;
    else wan += kbps;
  }
  return { wan, lan };
}

// Pick the streaming service the widget should read: the stored preference when
// it's still configured, otherwise the first configured one (so a widget keeps
// working if its service is removed), or null when none are configured.
export function resolveStreamingService(
  pref: StreamingServiceId,
  configured: readonly StreamingServiceId[],
): StreamingServiceId | null {
  if (configured.includes(pref)) return pref;
  return configured[0] ?? null;
}
