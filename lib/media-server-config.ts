import type { ServiceId } from "@/lib/constants";

// Jellyfin and Emby share an effectively identical API — Jellyfin forked from
// Emby and inherited the `X-Emby-Token` header Emby invented.
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
  // Image URLs are consumed by <Image>, which cannot carry headers, so the
  // credential has to ride in the query string. Jellyfin gates `api_key` behind
  // EnableLegacyAuthorization but reads `ApiKey` unconditionally in every
  // release from 10.8 to 12.0 (see setMediaServerAuthHeaders below). Emby only
  // documents `api_key`, so it keeps that spelling.
  imageAuthParam: "ApiKey" | "api_key";
}

export const MEDIA_SERVER_CONFIGS: Record<MediaServerId, MediaServerConfig> = {
  jellyfin: {
    serviceId: "jellyfin",
    displayName: "Jellyfin",
    imageSizeParams: (w, h) => ({ fillWidth: String(w), fillHeight: String(h) }),
    imageAuthParam: "ApiKey",
  },
  emby: {
    serviceId: "emby",
    displayName: "Emby",
    imageSizeParams: (w, h) => ({ maxWidth: String(w), maxHeight: String(h) }),
    imageAuthParam: "api_key",
  },
};

export function getMediaServerConfig(id: MediaServerId): MediaServerConfig {
  return MEDIA_SERVER_CONFIGS[id];
}

/**
 * Apply Jellyfin/Emby credentials to an outgoing request, returning any query
 * params the caller must merge into the URL.
 *
 * Jellyfin moved every Emby-era credential shape behind a single server flag,
 * `EnableLegacyAuthorization` (Jellyfin.Server.Implementations/Security/
 * AuthorizationContext.cs). With it off, `X-Emby-Token`, `X-MediaBrowser-Token`,
 * `X-Emby-Authorization` and the `api_key` query param are all ignored outright,
 * so a perfectly valid key comes back 401 and reads as "Invalid Jellyfin token"
 * (#399). The flag defaults to `true` in 10.11.x but is an admin-facing toggle
 * there, and defaults to `false` on 12.0 (verified on v12.0-rc7).
 *
 * Exactly two shapes are read unconditionally in every release from v10.8.13
 * through v12.0-rc7: the `Authorization: MediaBrowser …` header and the `ApiKey`
 * query param. Jellyfin gets the header when the slot is free, and falls back to
 * the query param when it is not, because `GetAuthorizationDictionary` reads the
 * Authorization header FIRST and `GetAuthorization` returns null for any scheme
 * that is not `MediaBrowser`. A proxy's `Basic` credential does not just coexist
 * with the token, it consumes the only header Jellyfin would have read.
 * Leaving it at `X-Emby-Token` there would 401 on exactly the reverse-proxied
 * 12.0 setup this is meant to fix.
 *
 * The header is preferred over the query param so the key stays out of proxy and
 * server access logs; the param is the fallback precisely because it is the only
 * thing left. `X-Emby-Token` still goes out for both services: Jellyfin reads the
 * Authorization header first when both are present, and Emby never deprecated it.
 *
 * Only `Token` goes into the Authorization header, deliberately. When the key is
 * a *user* access token rather than a server API key, Jellyfin writes any
 * `Device`/`Version` parts back onto that token's device row, which would rename
 * whichever client actually minted it.
 */
export function applyMediaServerAuth(
  headers: Headers,
  serviceId: MediaServerId,
  apiKey: string | undefined,
): Record<string, string> | undefined {
  if (!apiKey) return undefined;
  headers.set("X-Emby-Token", apiKey);
  if (serviceId !== "jellyfin") return undefined;
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `MediaBrowser Token="${apiKey}"`);
    return undefined;
  }
  return { ApiKey: apiKey };
}
