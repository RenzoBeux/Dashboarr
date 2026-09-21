/**
 * The per-instance Beszel auth-token cache.
 *
 * Beszel's hub is a PocketBase app: POST /api/collections/{_superusers|
 * users}/auth-with-password returns a JWT directly in the response body (no
 * Set-Cookie dance — unlike AdGuard Home's cookie session, this is readable
 * in JS on every platform), sent back as a raw Authorization header on every
 * later call. A superuser account and a plain `users` account can share the
 * same email/password (Beszel's setup wizard mirrors the admin into both —
 * confirmed against a live v0.19.0 hub), so login tries `_superusers` first
 * (it sees every system, bypassing per-system sharing rules) and falls back
 * to `users` on a 400 (a hub that only grants non-admin access would 400 on
 * `_superusers` and succeed on `users`).
 *
 * ---------------------------------------------------------------------------
 * Why this cache also tracks token AGE and whether a login was FRESH
 * ---------------------------------------------------------------------------
 * Verified live: a missing, garbage, OR EXPIRED token does not 401 the
 * systems/containers/system_stats list endpoints — it silently answers
 * `200 {items:[],totalItems:0}`. A 401-driven "invalidate and retry" (the
 * Pi-hole/AdGuard shape) never fires here, so services/beszel-api.ts needs
 * two different defenses instead, both served by this module:
 *
 *  1. Proactive refresh: a superuser token's own TTL is ~24h (decoded from a
 *     live token's `exp` claim), but this cache treats one older than
 *     BESZEL_TOKEN_MAX_AGE_MS as stale and re-logs-in before handing it out,
 *     so normal polling (every few seconds to a minute) never gets close to
 *     the real expiry.
 *  2. Reactive backstop: `getBeszelToken` reports whether the token it
 *     returned came from a FRESH login (`fresh: true`) or a cache hit. If a
 *     cache-hit token's list query comes back with zero results — which can
 *     otherwise only mean "legitimately empty" (no systems on this hub, no
 *     Docker on this system, no rollups yet) OR "this token was invalidated
 *     out of band" (hub restart, password rotated elsewhere) and those are
 *     indistinguishable from the response alone — the caller confirms the
 *     token itself via PocketBase's `POST .../auth-refresh` (200 + a renewed
 *     token = still valid, 404 = invalid) before trusting either reading.
 *     Only a confirmed-invalid token triggers a fresh login + retry; a
 *     confirmed-valid one keeps the empty result and its renewed token gets
 *     cached via `updateBeszelToken` so the next call skips the refresh too.
 *     A token that was ALREADY fresh returning zero results is trusted
 *     outright: it just logged in, so a second check would be redundant.
 */

export type BeszelAuthCollection = "_superusers" | "users";

export interface BeszelToken {
  token: string;
  authCollection: BeszelAuthCollection;
  /** True when this call performed the login itself, false on a cache hit. */
  fresh: boolean;
}

interface BeszelSessionEntry {
  token: string | null;
  authCollection: BeszelAuthCollection | null;
  obtainedAt: number | null;
  loginPromise: Promise<{ token: string; authCollection: BeszelAuthCollection }> | null;
  generation: number;
}

// See the module doc above — proactive refresh well inside the real ~24h TTL.
export const BESZEL_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;

const sessions = new Map<string, BeszelSessionEntry>();

function entryFor(instanceId: string): BeszelSessionEntry {
  let entry = sessions.get(instanceId);
  if (!entry) {
    entry = {
      token: null,
      authCollection: null,
      obtainedAt: null,
      loginPromise: null,
      generation: 0,
    };
    sessions.set(instanceId, entry);
  }
  return entry;
}

function isFresh(entry: BeszelSessionEntry): boolean {
  return (
    entry.token !== null &&
    entry.authCollection !== null &&
    entry.obtainedAt !== null &&
    Date.now() - entry.obtainedAt <= BESZEL_TOKEN_MAX_AGE_MS
  );
}

/**
 * Return a usable token, logging in through a shared in-flight promise when
 * none is cached (or the cached one aged out). `loginFn` tries `_superusers`
 * then `users` and throws on failure — see beszelLogin in services/beszel-api.ts.
 */
export function getBeszelToken(
  instanceId: string,
  loginFn: () => Promise<{ token: string; authCollection: BeszelAuthCollection }>,
): Promise<BeszelToken> {
  const entry = entryFor(instanceId);
  if (isFresh(entry)) {
    return Promise.resolve({
      token: entry.token as string,
      authCollection: entry.authCollection as BeszelAuthCollection,
      fresh: false,
    });
  }
  if (entry.loginPromise) {
    return entry.loginPromise.then((r) => ({ ...r, fresh: false }));
  }

  const generation = entry.generation;
  const attempt = loginFn()
    .then((result) => {
      if (entry.generation === generation) {
        entry.token = result.token;
        entry.authCollection = result.authCollection;
        entry.obtainedAt = Date.now();
      }
      return result;
    })
    .finally(() => {
      if (entry.loginPromise === attempt) entry.loginPromise = null;
    });
  entry.loginPromise = attempt;
  return attempt.then((r) => ({ ...r, fresh: true }));
}

/**
 * Cache a token obtained out-of-band (PocketBase's auth-refresh response),
 * without going through the login path. Used by the reactive backstop in
 * services/beszel-api.ts when auth-refresh confirms a cache-hit token is
 * still valid — its renewed token replaces the cached one so the next call
 * doesn't need to re-confirm it.
 */
export function updateBeszelToken(
  instanceId: string,
  token: string,
  authCollection: BeszelAuthCollection,
): void {
  const entry = entryFor(instanceId);
  entry.token = token;
  entry.authCollection = authCollection;
  entry.obtainedAt = Date.now();
}

/**
 * Force the next `getBeszelToken` call to log in again — the reactive
 * backstop in the module doc above, and the credential-change path.
 */
export function dropBeszelSession(instanceId: string): void {
  const entry = sessions.get(instanceId);
  if (!entry) return;
  entry.token = null;
  entry.authCollection = null;
  entry.obtainedAt = null;
  entry.loginPromise = null;
  entry.generation += 1;
}

/** Instance ids with a cached entry. */
export function beszelSessionIds(): string[] {
  return [...sessions.keys()];
}

export function forgetBeszelSession(instanceId: string): void {
  sessions.delete(instanceId);
}

/** Test-only, mirroring resetPiholeSessions in lib/pihole-session.ts. */
export function resetBeszelSessions(): void {
  sessions.clear();
}
