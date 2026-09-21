import type { OverseerrMediaInfoRequest } from "@/lib/types";

/**
 * Turning a title's Seerr requests into the "Requested by" row (#378).
 *
 * Pure and store-free so the collapsing rules are unit-tested without React —
 * the lib/seerr-permissions.ts precedent.
 */

export interface SeerrRequester {
  /** Seerr account id; the collapse key. */
  userId: number;
  displayName: string;
  /** Raw `User.avatar`, absolute or Seerr-relative. See seerrAvatarUrl. */
  avatar?: string;
  /** This account's EARLIEST request for the title, when the row carried one. */
  requestedAt?: string;
  /**
   * Every request this account filed for the title is the 4K one. False when
   * they also filed the regular request, so the badge marks the 4K-only case
   * instead of appearing on everyone who happened to request both.
   */
  only4k: boolean;
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta <= tb ? a : b;
}

/**
 * One row per requester, oldest request first.
 *
 * A title commonly carries two requests (the regular one and the 4K one), and
 * in a household they are usually the same person — so rows are collapsed by
 * account rather than listed per request, which would print the same name
 * twice. Rows without a `requestedBy` are dropped: the field is eager upstream
 * and always on the wire, but a hand-rolled proxy that strips unknown fields
 * would otherwise crash the screen this block is decorating.
 *
 * Ordering is by first request ascending, with undated rows last, so the
 * original requester leads. `Array.prototype.sort` is stable, so accounts whose
 * timestamps tie keep the server's order.
 */
export function collectSeerrRequesters(
  requests: OverseerrMediaInfoRequest[] | undefined | null,
): SeerrRequester[] {
  const byUser = new Map<number, SeerrRequester>();
  for (const request of requests ?? []) {
    const user = request?.requestedBy;
    if (!user || typeof user.id !== "number") continue;
    const existing = byUser.get(user.id);
    if (existing) {
      existing.requestedAt = earlier(existing.requestedAt, request.createdAt);
      existing.only4k = existing.only4k && request.is4k === true;
      // A later row may be the one carrying the avatar.
      if (!existing.avatar && user.avatar) existing.avatar = user.avatar;
      continue;
    }
    byUser.set(user.id, {
      userId: user.id,
      displayName: user.displayName || `User #${user.id}`,
      ...(user.avatar ? { avatar: user.avatar } : {}),
      ...(request.createdAt ? { requestedAt: request.createdAt } : {}),
      only4k: request.is4k === true,
    });
  }
  return [...byUser.values()].sort((a, b) => {
    const ta = a.requestedAt ? Date.parse(a.requestedAt) : Number.NaN;
    const tb = b.requestedAt ? Date.parse(b.requestedAt) : Number.NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

/**
 * An `<Image>`-ready URL for a Seerr `User.avatar`, or undefined when there is
 * nothing to load.
 *
 * Overseerr only ever stores absolute URLs there (the Plex account thumb, or a
 * gravatar). Jellyseerr and Seerr add a server-relative one for media-server
 * accounts — `/avatarproxy/{jellyfinUserId}?v={n}` — which is mounted at the
 * SERVER root (`server.use('/avatarproxy', …)` in server/index.ts), NOT under
 * the `/api/v1` base path, and sits outside `isAuthenticated()`, so it loads
 * with no credential attached.
 */
export function seerrAvatarUrl(
  avatar: string | undefined,
  baseUrl: string | undefined,
): string | undefined {
  const raw = avatar?.trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = baseUrl?.replace(/\/+$/, "");
  if (!base) return undefined;
  return `${base}/${raw.replace(/^\/+/, "")}`;
}

/** Up to two letters for the avatar fallback: "Sarah Connor" -> "SC". */
export function seerrInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? words[0]!.slice(0, 2)
      : `${words[0]![0]}${words[words.length - 1]![0]}`;
  return letters.toUpperCase();
}
