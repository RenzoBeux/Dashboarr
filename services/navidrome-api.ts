import { HttpError, buildUrl, serviceRequest } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import {
  SUBSONIC_API_VERSION,
  SUBSONIC_CLIENT,
  randomSalt,
  subsonicToken,
  summarizeLibraries,
  scanStatusToSummary,
  assertSubsonicOk,
  unwrapSubsonic,
  type NavidromeLibrary,
  type NavidromeScanStatus,
} from "@/lib/navidrome-normalize";
import type {
  NavidromeAlbum,
  NavidromeArtist,
  NavidromeArtistsResult,
  NavidromeLoginResponse,
  NavidromeNowPlayingEntry,
  NavidromeOverview,
  NavidromePlaylist,
  NavidromeSearchResult,
  NavidromeUser,
} from "@/lib/types";

// Navidrome API notes. Verified against navidrome/navidrome@master (v0.63.2);
// the upstream file is named on every rule.
//
//   - THREE roots on one host, which is why SERVICE_DEFAULTS.navidrome sets
//     apiBasePath to "" and every path below carries its own prefix (the
//     Cleanuparr / JellyStat pattern):
//       /rest/*      Subsonic API v1.16.1
//       /api/*       native react-admin API, X-ND-Authorization: Bearer <jwt>
//       /auth/login  mints that jwt
//
//   - NO API KEYS. server/subsonic/middlewares.go:validateCredentials accepts
//     only `p` (plain or `enc:` hex), `t`+`s`, or `jwt`; GetOpenSubsonicExtensions
//     does not advertise the OpenSubsonic apiKey extension. So auth is username +
//     password, and Subsonic calls use the salted token `t = md5(password + salt)`.
//     Upstream recomputes that from the `s` we send, so a salt generated once per
//     instance stays valid for the life of the password — we never re-derive it
//     per request, and never put the password itself on the wire.
//
//   - EVERY Subsonic error is HTTP 200. sendResponse in server/subsonic/api.go
//     sets no status for failures (only 429 for too-many-transcodes), so
//     serviceRequest resolves happily on a wrong password and the BODY is the
//     only signal. Everything goes through unwrapSubsonic, which throws a
//     SubsonicApiError carrying the numeric code. Same trap as NZBHydra2's /api.
//
//   - The two admin-only features. `startScan` is behind subsonic's adminOnly and
//     `/api/library` behind nativeapi's adminOnlyMiddleware. getScanStatus,
//     getUser, getNowPlaying, search3 and getPlaylists are NOT gated, so a plain
//     account still gets a useful Overview. getUser.adminRole tells us which
//     path to take WITHOUT spending a login.
//
//   - Total size exists only on the native API. model/library.go's Library row
//     carries totalSize/totalDuration/totalMissingFiles/lastScanAt; nothing in
//     Subsonic reports any of them. That, plus DELETE /api/missing, is the whole
//     reason we log in at all.
//
//   - POST /auth/login is rate limited by default (conf AuthRequestLimit, applied
//     in server/server.go:mountAuthenticationRoutes), so the jwt is cached per
//     instance and only re-minted on a 401. Session lifetime is 48h upstream
//     (consts.DefaultSessionTimeout); we don't track expiry, we just re-login
//     once when a native call is rejected.
//
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Navidrome is used.

const SCAN_TIMEOUT = 30_000;

interface SessionEntry {
  /** Stable Subsonic salt for this instance. Generated lazily, memory only. */
  salt: string;
  /** Native-API JWT from /auth/login, or null when we haven't logged in yet. */
  jwt: string | null;
  isAdmin: boolean | null;
  loginPromise: Promise<NavidromeLoginResponse> | null;
}

// One entry per Navidrome instance UUID. In-memory only, like Deluge's: the
// salt is not a secret (it travels in the query string of every request) and a
// re-login is one cheap call, so persisting either would leave a token at rest
// for no benefit.
const sessions = new Map<string, SessionEntry>();

function entryFor(instanceId: string): SessionEntry {
  let entry = sessions.get(instanceId);
  if (!entry) {
    entry = { salt: randomSalt(), jwt: null, isAdmin: null, loginPromise: null };
    sessions.set(instanceId, entry);
  }
  return entry;
}

function resolveInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("navidrome");
  if (!id) throw new Error("No Navidrome instance configured");
  return id;
}

/**
 * Drop the cached salt + JWT for an instance (or all of them). Called when the
 * user saves new credentials so the next request re-derives and re-logs in,
 * mirroring qbClearSession / delugeClearSession.
 */
export function navidromeClearSession(instanceId?: string): void {
  if (instanceId) sessions.delete(instanceId);
  else sessions.clear();
}

/**
 * The `u`/`t`/`s`/`v`/`c`/`f` every Subsonic request must carry.
 *
 * Narrow store read for the credential, the same precedent as
 * getTautulliImageUrl and services/nzbhydra2-api.ts: http-client's per-service
 * auth branch can only inject one shape, and Navidrome needs three.
 */
export function subsonicAuthParams(instanceId?: string): Record<string, string> {
  const targetId = resolveInstanceId(instanceId);
  const secrets = useConfigStore.getState().instanceSecrets[targetId] ?? {};
  const salt = entryFor(targetId).salt;
  return {
    u: secrets.username ?? "",
    t: subsonicToken(secrets.password ?? "", salt),
    s: salt,
    v: SUBSONIC_API_VERSION,
    c: SUBSONIC_CLIENT,
    f: "json",
  };
}

/** A Subsonic GET whose 200-body is unwrapped and error-checked. */
async function subsonic<T>(
  method: string,
  key: string,
  params: Record<string, string | number | boolean> = {},
  instanceId?: string,
  timeout?: number,
): Promise<T> {
  const body = await serviceRequest<unknown>("navidrome", `/rest/${method}`, {
    params: { ...subsonicAuthParams(instanceId), ...params },
    instanceId,
    ...(timeout ? { timeout } : {}),
  });
  return unwrapSubsonic<T>(body, key);
}

// --- Native API (JWT) ------------------------------------------------------

async function login(instanceId?: string): Promise<NavidromeLoginResponse> {
  const targetId = resolveInstanceId(instanceId);
  const entry = entryFor(targetId);
  // Collapse concurrent callers onto one login: /auth/login is rate limited,
  // and the Overview fires the library + missing queries at the same moment.
  if (entry.loginPromise) return entry.loginPromise;

  const secrets = useConfigStore.getState().instanceSecrets[targetId] ?? {};
  const promise = serviceRequest<NavidromeLoginResponse>("navidrome", "/auth/login", {
    method: "POST",
    instanceId: targetId,
    body: JSON.stringify({
      username: secrets.username ?? "",
      password: secrets.password ?? "",
    }),
  })
    .then((res) => {
      entry.jwt = res.token;
      entry.isAdmin = res.isAdmin;
      return res;
    })
    .finally(() => {
      entry.loginPromise = null;
    });

  entry.loginPromise = promise;
  return promise;
}

/**
 * A native-API call, logging in on demand and retrying ONCE on a 401 (the JWT
 * outlived its 48h session, or the user's token epoch was bumped by a password
 * change). Anything else propagates.
 */
async function native<T>(
  path: string,
  options: { method?: string; params?: Record<string, string | number | boolean> } = {},
  instanceId?: string,
): Promise<T> {
  const targetId = resolveInstanceId(instanceId);
  const entry = entryFor(targetId);

  const call = async (): Promise<T> => {
    if (!entry.jwt) await login(targetId);
    return serviceRequest<T>("navidrome", path, {
      ...options,
      instanceId: targetId,
      headers: { "X-ND-Authorization": `Bearer ${entry.jwt}` },
    });
  };

  try {
    return await call();
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      entry.jwt = null;
      return call();
    }
    throw err;
  }
}

// --- Reads -----------------------------------------------------------------

/** Credential-validating reachability check. Returns the server version. */
export async function ping(instanceId?: string): Promise<string | null> {
  const body = await serviceRequest<unknown>("navidrome", "/rest/ping", {
    params: subsonicAuthParams(instanceId),
    instanceId,
  });
  // ping has no payload key — the envelope IS the answer. assertSubsonicOk
  // still owns the failure path, so a bad password throws the same
  // SubsonicApiError here as it does on every other call.
  return assertSubsonicOk(body).serverVersion ?? null;
}

export function getScanStatus(instanceId?: string): Promise<NavidromeScanStatus> {
  return subsonic<NavidromeScanStatus>("getScanStatus", "scanStatus", {}, instanceId);
}

export function getUser(instanceId?: string): Promise<NavidromeUser> {
  const targetId = resolveInstanceId(instanceId);
  const secrets = useConfigStore.getState().instanceSecrets[targetId] ?? {};
  return subsonic<NavidromeUser>(
    "getUser",
    "user",
    { username: secrets.username ?? "" },
    targetId,
  );
}

export function getNowPlaying(instanceId?: string): Promise<NavidromeNowPlayingEntry[]> {
  return subsonic<{ entry?: NavidromeNowPlayingEntry[] } | undefined>(
    "getNowPlaying",
    "nowPlaying",
    {},
    instanceId,
  ).then((res) => res?.entry ?? []);
}

/**
 * Artist and album counts for the non-admin path. getArtists returns the whole
 * ID3 index in one response, so summing `albumCount` is the only Subsonic way
 * to get an album total.
 */
export async function getArtistCounts(
  instanceId?: string,
): Promise<{ artists: number; albums: number }> {
  const res = await subsonic<NavidromeArtistsResult | undefined>(
    "getArtists",
    "artists",
    {},
    instanceId,
  );
  let artists = 0;
  let albums = 0;
  for (const index of res?.index ?? []) {
    for (const artist of index.artist ?? []) {
      artists += 1;
      albums += artist.albumCount ?? 0;
    }
  }
  return { artists, albums };
}

export function search3(
  query: string,
  counts: { artistCount?: number; albumCount?: number; songCount?: number } = {},
  instanceId?: string,
): Promise<NavidromeSearchResult> {
  return subsonic<NavidromeSearchResult | undefined>(
    "search3",
    "searchResult3",
    {
      query,
      artistCount: counts.artistCount ?? 10,
      albumCount: counts.albumCount ?? 20,
      songCount: counts.songCount ?? 20,
    },
    instanceId,
  ).then((res) => res ?? {});
}

export function getAlbumList(
  type: "newest" | "recent" | "frequent" | "random" | "alphabeticalByName" = "newest",
  size = 24,
  offset = 0,
  instanceId?: string,
): Promise<NavidromeAlbum[]> {
  return subsonic<{ album?: NavidromeAlbum[] } | undefined>(
    "getAlbumList2",
    "albumList2",
    { type, size, offset },
    instanceId,
  ).then((res) => res?.album ?? []);
}

export function getPlaylists(instanceId?: string): Promise<NavidromePlaylist[]> {
  return subsonic<{ playlist?: NavidromePlaylist[] } | undefined>(
    "getPlaylists",
    "playlists",
    {},
    instanceId,
  ).then((res) => res?.playlist ?? []);
}

export function getPlaylist(id: string, instanceId?: string): Promise<NavidromePlaylist> {
  return subsonic<NavidromePlaylist>("getPlaylist", "playlist", { id }, instanceId);
}

export function getLibraries(instanceId?: string): Promise<NavidromeLibrary[]> {
  return native<NavidromeLibrary[]>("/api/library", {}, instanceId);
}

/**
 * The Overview payload. Takes the admin path when the account allows it (one
 * /api/library call gives every counter including total size), and degrades to
 * Subsonic otherwise rather than erroring.
 */
export async function getOverview(instanceId?: string): Promise<NavidromeOverview> {
  const [user, scan] = await Promise.all([
    getUser(instanceId).catch(() => null),
    getScanStatus(instanceId),
  ]);
  const isAdmin = user?.adminRole === true;

  if (isAdmin) {
    try {
      const libraries = await getLibraries(instanceId);
      const summary = summarizeLibraries(libraries);
      // getScanStatus is the live signal; /api/library's fullScanInProgress
      // only flips for a FULL scan, so a quick scan would read as idle.
      summary.scanning = scan.scanning || summary.scanning;
      return { summary, serverVersion: null, isAdmin };
    } catch {
      // An admin whose /auth/login is unreachable (reverse proxy, rate limit)
      // still gets the Subsonic numbers instead of an error screen.
    }
  }

  const counts = await getArtistCounts(instanceId).catch(() => undefined);
  return { summary: scanStatusToSummary(scan, counts), serverVersion: null, isAdmin };
}

// --- Maintenance -----------------------------------------------------------

/**
 * Trigger a scan. `fullScan: false` is the incremental "quick" scan; true
 * re-reads every file. Admin only. Upstream blocks up to 3s waiting for the
 * scanner to actually start, then answers with the current scanStatus — hence
 * the raised timeout.
 */
export function startScan(fullScan: boolean, instanceId?: string): Promise<NavidromeScanStatus> {
  return subsonic<NavidromeScanStatus>(
    "startScan",
    "scanStatus",
    { fullScan },
    instanceId,
    SCAN_TIMEOUT,
  );
}

/**
 * Permanently delete every track marked missing, with their ratings, play
 * counts and playlist entries. server/nativeapi/missing.go routes a DELETE with
 * NO `id` param to Maintenance.DeleteAllMissingFiles; sending ids would delete
 * only those, which is not what this action offers.
 */
export function deleteAllMissingFiles(instanceId?: string): Promise<unknown> {
  return native<unknown>("/api/missing", { method: "DELETE" }, instanceId);
}

// --- Cover art -------------------------------------------------------------

/**
 * A `getCoverArt` URL. Subsonic auth lives in the query string, so a plain
 * <Image> can load this directly — the Plex/Tautulli precedent.
 */
export function getCoverArtUrl(coverArt: string | undefined, size = 300, instanceId?: string): string {
  if (!coverArt) return "";
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("navidrome");
  if (!targetId) return "";
  const baseUrl = store.getActiveUrl("navidrome", targetId).replace(/\/+$/, "");
  if (!baseUrl) return "";
  // buildUrl, not URLSearchParams: RN's polyfill emits `+` for spaces, and a
  // username can contain one. See lib/url-builder.ts.
  return buildUrl(baseUrl, "", "/rest/getCoverArt", {
    ...subsonicAuthParams(targetId),
    id: coverArt,
    size,
  });
}

/**
 * expo-image source with the credential stripped from the cache key, so the
 * same art isn't re-fetched when the salt or token changes. Mirrors
 * getPlexImageSource / getJellyfinImageSource.
 */
export function getCoverArtSource(
  coverArt: string | undefined,
  size = 300,
  instanceId?: string,
): { uri: string; cacheKey: string } | null {
  const uri = getCoverArtUrl(coverArt, size, instanceId);
  if (!uri) return null;
  const cacheKey = uri.replace(/[?&](u|t|s|c|f|v)=[^&]*/g, "");
  return { uri, cacheKey };
}

/**
 * Deep link into Navidrome's own web UI. The UI is a react-admin hash router
 * mounted at /app (consts.URLPathUI), so records live at /app/#/<resource>/<id>/show.
 */
export function getWebUiUrl(
  resource: "album" | "artist" | "playlist" | "song",
  id?: string,
  instanceId?: string,
): string {
  const store = useConfigStore.getState();
  const targetId = instanceId ?? store.getActiveInstanceId("navidrome");
  if (!targetId) return "";
  const baseUrl = store.getActiveUrl("navidrome", targetId).replace(/\/+$/, "");
  if (!baseUrl) return "";
  return id ? `${baseUrl}/app/#/${resource}/${id}/show` : `${baseUrl}/app/`;
}
