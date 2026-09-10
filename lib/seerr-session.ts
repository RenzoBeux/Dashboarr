import type { SeerrMe } from "@/lib/seerr-auth";

/**
 * The per-instance Seerr session cache (#332).
 *
 * Lives in lib/ for the same reason lib/pihole-session.ts does: the connection
 * probe in lib/http-client.ts and the data layer in services/overseerr-api.ts
 * must share ONE cache, and http-client importing the API module would be a
 * cycle. On a cold start the 30-second health poll and the Requests screen's
 * first query race; without the shared in-flight promise each would log in and
 * Seerr would hold two sessions for one phone.
 *
 * What is cached is deliberately NOT the cookie. Seerr's `connect.sid` is
 * httpOnly and the platform cookie jar consumes `Set-Cookie` before fetch
 * exposes it (iOS always, Android usually; see the NATIVE_JAR_SENTINEL notes in
 * services/qbittorrent-api.ts). So `established` is the sentinel: it records
 * that a login succeeded against this instance's host and the jar therefore
 * holds a session for it. The jar persists across launches; this cache does
 * not, which is fine because the first request after a launch validates the
 * jar's cookie with a free GET /auth/me before ever logging in again.
 *
 * In-memory only, like Pi-hole and Navidrome: the credential that would need
 * persisting is unreadable anyway, and `me` is one cheap call to rebuild.
 */

export interface SeerrSessionEntry {
  /** A login (or a validated jar cookie) succeeded for this instance. */
  established: boolean;
  /** The account behind the session; the permissions source for the UI. */
  me: SeerrMe | null;
  /** The in-flight login shared by every concurrent caller. */
  loginPromise: Promise<SeerrMe> | null;
  /**
   * Bumped on every invalidation. A caller captures it before its request and
   * hands it back on rejection, so N concurrent 401s yield ONE invalidation
   * (the first matches, the rest are stale) and a login started under an old
   * generation cannot publish a superseded session.
   */
  generation: number;
}

const sessions = new Map<string, SeerrSessionEntry>();

export function seerrSessionEntry(instanceId: string): SeerrSessionEntry {
  let entry = sessions.get(instanceId);
  if (!entry) {
    entry = { established: false, me: null, loginPromise: null, generation: 0 };
    sessions.set(instanceId, entry);
  }
  return entry;
}

export function getSeerrSessionMe(instanceId: string): SeerrMe | null {
  return sessions.get(instanceId)?.me ?? null;
}

export function isSeerrSessionEstablished(instanceId: string): boolean {
  return sessions.get(instanceId)?.established ?? false;
}

export function seerrSessionGeneration(instanceId: string): number {
  return sessions.get(instanceId)?.generation ?? 0;
}

/** Record a session the jar now holds, and who it belongs to. */
export function setSeerrSession(instanceId: string, me: SeerrMe): void {
  const entry = seerrSessionEntry(instanceId);
  entry.established = true;
  entry.me = me;
}

/**
 * The 401/403 path. A no-op unless `generation` is still current, so a late
 * rejection from a request made against an already-replaced session cannot
 * wipe the replacement. Bumps the generation so any login still in flight for
 * the dead session cannot publish. Never touches `loginPromise`: an in-flight
 * login is producing a DIFFERENT session and cancelling it is what causes
 * duplicate logins.
 */
export function invalidateSeerrSession(instanceId: string, generation: number): void {
  const entry = sessions.get(instanceId);
  if (!entry) return;
  if (entry.generation !== generation) return;
  entry.established = false;
  entry.me = null;
  entry.generation += 1;
}

/**
 * The credential-change path: unconditional, drops the in-flight login and
 * bumps the generation. Callers that want the server-side session gone log it
 * out first (seerrClearSession in services/overseerr-api.ts does); nothing
 * here touches the network.
 */
export function dropSeerrSession(instanceId: string): void {
  const entry = sessions.get(instanceId);
  if (!entry) return;
  entry.established = false;
  entry.me = null;
  entry.loginPromise = null;
  entry.generation += 1;
}

/**
 * Establish a session through the shared in-flight promise, whoever the caller
 * is. Both the probe and the data layer pass their own `loginFn`; the first to
 * arrive runs it and everyone else joins.
 */
export function dedupedSeerrLogin(
  instanceId: string,
  loginFn: () => Promise<SeerrMe>,
): Promise<SeerrMe> {
  const entry = seerrSessionEntry(instanceId);
  if (entry.established && entry.me) return Promise.resolve(entry.me);
  if (entry.loginPromise) return entry.loginPromise;

  const generation = entry.generation;
  const attempt = loginFn()
    .then((me) => {
      if (entry.generation === generation) {
        entry.established = true;
        entry.me = me;
      }
      return me;
    })
    .finally(() => {
      if (entry.loginPromise === attempt) entry.loginPromise = null;
    });
  entry.loginPromise = attempt;
  return attempt;
}

/** The login already in flight for this instance, if any. */
export function seerrLoginInFlight(instanceId: string): Promise<SeerrMe> | null {
  return sessions.get(instanceId)?.loginPromise ?? null;
}

/** Instance ids with a cached entry, for logging every session out at once. */
export function seerrSessionIds(): string[] {
  return [...sessions.keys()];
}

/** Forget an instance entirely, after its session has been logged out. */
export function forgetSeerrSession(instanceId: string): void {
  sessions.delete(instanceId);
}

/** Test-only, mirroring resetPiholeSessions. */
export function resetSeerrSessions(): void {
  sessions.clear();
}
