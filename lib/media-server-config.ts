import type { ServiceId } from "@/lib/constants";

// Jellyfin and Emby share an effectively identical API — Jellyfin forked from
// Emby and still authenticates with the `X-Emby-Token` header Emby invented.
// So a single parameterized "media server" layer (services/jellyfin-api.ts,
// the hooks factory, the tab screen, the now-playing widget) serves both; this
// object captures the handful of per-service differences that layer needs.
export type MediaServerId = Extract<ServiceId, "jellyfin" | "emby">;

export interface MediaServerConfig {
  serviceId: MediaServerId;
  displayName: string;
  // The one wire difference confirmed against Emby's docs: the image endpoint
  // sizing params. Jellyfin uses fillWidth/fillHeight (added in 10.7+); Emby
  // only documents maxWidth/maxHeight (and width/height for exact sizing).
  imageSizeParams: (width: number, height: number) => Record<string, string>;
}

export const MEDIA_SERVER_CONFIGS: Record<MediaServerId, MediaServerConfig> = {
  jellyfin: {
    serviceId: "jellyfin",
    displayName: "Jellyfin",
    imageSizeParams: (w, h) => ({ fillWidth: String(w), fillHeight: String(h) }),
  },
  emby: {
    serviceId: "emby",
    displayName: "Emby",
    imageSizeParams: (w, h) => ({ maxWidth: String(w), maxHeight: String(h) }),
  },
};

export function getMediaServerConfig(id: MediaServerId): MediaServerConfig {
  return MEDIA_SERVER_CONFIGS[id];
}
