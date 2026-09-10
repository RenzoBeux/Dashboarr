import type { SeerrMe } from "@/lib/seerr-auth";

/**
 * Seerr's permission bitfield and the capabilities the app derives from it.
 *
 * Bits and `hasSeerrPermission` mirror server/lib/permissions.ts in
 * seerr-team/seerr (identical in sct/overseerr): the ADMIN bit short-circuits
 * every check to true, and array checks are AND unless `{type: "or"}`.
 *
 * Pure and store-free so the UI gating logic is unit-tested without React.
 */

export const SeerrPermission = {
  NONE: 0,
  ADMIN: 2,
  MANAGE_SETTINGS: 4,
  MANAGE_USERS: 8,
  MANAGE_REQUESTS: 16,
  REQUEST: 32,
  VOTE: 64,
  AUTO_APPROVE: 128,
  AUTO_APPROVE_MOVIE: 256,
  AUTO_APPROVE_TV: 512,
  REQUEST_4K: 1024,
  REQUEST_4K_MOVIE: 2048,
  REQUEST_4K_TV: 4096,
  REQUEST_ADVANCED: 8192,
  REQUEST_VIEW: 16384,
  AUTO_APPROVE_4K: 32768,
  AUTO_APPROVE_4K_MOVIE: 65536,
  AUTO_APPROVE_4K_TV: 131072,
  REQUEST_MOVIE: 262144,
  REQUEST_TV: 524288,
  MANAGE_ISSUES: 1048576,
  VIEW_ISSUES: 2097152,
  CREATE_ISSUES: 4194304,
  AUTO_REQUEST: 8388608,
  AUTO_REQUEST_MOVIE: 16777216,
  AUTO_REQUEST_TV: 33554432,
  RECENT_VIEW: 67108864,
  WATCHLIST_VIEW: 134217728,
  MANAGE_BLOCKLIST: 268435456,
  VIEW_BLOCKLIST: 1073741824,
} as const;

export type SeerrPermission = (typeof SeerrPermission)[keyof typeof SeerrPermission];

export interface SeerrPermissionCheckOptions {
  type: "and" | "or";
}

export function hasSeerrPermission(
  value: number,
  permissions: SeerrPermission | SeerrPermission[],
  options: SeerrPermissionCheckOptions = { type: "and" },
): boolean {
  if (value & SeerrPermission.ADMIN) return true;
  if (Array.isArray(permissions)) {
    return options.type === "or"
      ? permissions.some((p) => (value & p) !== 0)
      : permissions.every((p) => (value & p) !== 0);
  }
  return (value & permissions) !== 0;
}

/**
 * What the signed-in account may do, as the app's surfaces need it.
 *
 * `loaded` is false until /auth/me has answered; every action control hides
 * behind it so a non-admin never sees a button that would 403. In API-key
 * mode /auth/me returns the admin, so `isAdmin` is true and nothing changes
 * from the pre-#332 UI.
 *
 * Route-level truth these map to (verified upstream):
 *  - canManageDiscover: the whole /settings mount needs ADMIN (reading
 *    GET /settings/discover does not, so Discover itself still renders).
 *  - canManageRequests: approve, decline, DELETE /media/{id}, deleting any
 *    request, AND having serverId/profileId/rootFolder/tags honoured on
 *    POST /request. Without it Seerr discards those overrides and substitutes
 *    the account's defaults, so the pickers gate on this bit and NOT on
 *    REQUEST_ADVANCED, which is what Seerr's own web UI keys the advanced
 *    panel on. Copying the web UI here would render pickers the server
 *    ignores.
 *  - canViewAllRequests: GET /request self-scopes without MANAGE_REQUESTS or
 *    REQUEST_VIEW, and GET /request/count is server-wide for everyone.
 *  - canRequestAs: the `userId` body field ("Request As") needs
 *    MANAGE_USERS AND MANAGE_REQUESTS. MediaRequest.createRequest passes
 *    both to hasPermission without options, and both forks default array
 *    checks to AND (server/lib/permissions.ts).
 */
export interface SeerrCapabilities {
  loaded: boolean;
  userId: number | null;
  displayName: string | null;
  isAdmin: boolean;
  canManageRequests: boolean;
  canManageUsers: boolean;
  canManageDiscover: boolean;
  canViewAllRequests: boolean;
  canRequestAs: boolean;
  canRequestMovie: boolean;
  canRequestTv: boolean;
  canRequest4kMovie: boolean;
  canRequest4kTv: boolean;
}

export const UNLOADED_SEERR_CAPABILITIES: SeerrCapabilities = Object.freeze({
  loaded: false,
  userId: null,
  displayName: null,
  isAdmin: false,
  canManageRequests: false,
  canManageUsers: false,
  canManageDiscover: false,
  canViewAllRequests: false,
  canRequestAs: false,
  canRequestMovie: false,
  canRequestTv: false,
  canRequest4kMovie: false,
  canRequest4kTv: false,
});

export function deriveSeerrCapabilities(me: SeerrMe | undefined | null): SeerrCapabilities {
  if (!me) return UNLOADED_SEERR_CAPABILITIES;
  const p = me.permissions;
  const has = (perms: SeerrPermission | SeerrPermission[], type: "and" | "or" = "or") =>
    hasSeerrPermission(p, perms, { type });
  return {
    loaded: true,
    userId: me.id,
    displayName: me.displayName,
    isAdmin: has(SeerrPermission.ADMIN),
    canManageRequests: has(SeerrPermission.MANAGE_REQUESTS),
    canManageUsers: has(SeerrPermission.MANAGE_USERS),
    canManageDiscover: has(SeerrPermission.ADMIN),
    canViewAllRequests: has([SeerrPermission.MANAGE_REQUESTS, SeerrPermission.REQUEST_VIEW]),
    canRequestAs: has([SeerrPermission.MANAGE_USERS, SeerrPermission.MANAGE_REQUESTS], "and"),
    canRequestMovie: has([SeerrPermission.REQUEST, SeerrPermission.REQUEST_MOVIE]),
    canRequestTv: has([SeerrPermission.REQUEST, SeerrPermission.REQUEST_TV]),
    canRequest4kMovie: has([SeerrPermission.REQUEST_4K, SeerrPermission.REQUEST_4K_MOVIE]),
    canRequest4kTv: has([SeerrPermission.REQUEST_4K, SeerrPermission.REQUEST_4K_TV]),
  };
}

export type SeerrMediaKind = "movie" | "tv";

export function canRequestMedia(caps: SeerrCapabilities, mediaType: SeerrMediaKind): boolean {
  return mediaType === "tv" ? caps.canRequestTv : caps.canRequestMovie;
}

export function canRequest4kMedia(caps: SeerrCapabilities, mediaType: SeerrMediaKind): boolean {
  return mediaType === "tv" ? caps.canRequest4kTv : caps.canRequest4kMovie;
}

/** Seerr's MediaRequestStatus.PENDING. */
const REQUEST_STATUS_PENDING = 1;

/**
 * DELETE /request/{id}: managers may delete anything; anyone else only their
 * own request, and only while it is still pending (upstream answers 401
 * otherwise).
 */
export function canDeleteSeerrRequest(
  caps: SeerrCapabilities,
  request: { status: number; requestedBy: { id: number } },
): boolean {
  if (!caps.loaded) return false;
  if (caps.canManageRequests) return true;
  return (
    caps.userId !== null &&
    request.requestedBy.id === caps.userId &&
    request.status === REQUEST_STATUS_PENDING
  );
}
