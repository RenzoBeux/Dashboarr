/**
 * The per-instance Pi-hole session (SID) cache.
 *
 * This lives in lib/, not in services/pihole-api.ts, to break a cycle: the
 * connection probe in lib/http-client.ts has to read and write the SAME cache
 * the API module uses, and http-client importing services/pihole-api.ts would
 * be circular. lib/http-auth.ts plays exactly this role for the Digest nonce
 * cache, down to the test-only reset export.
 *
 * ---------------------------------------------------------------------------
 * Why sharing this cache is not an optimisation but a correctness requirement
 * ---------------------------------------------------------------------------
 * FTL's `webserver.api.max_sessions` defaults to 16, and sessions idle out
 * after 30 minutes. hooks/use-service-health.ts probes every enabled instance
 * every 30 seconds, so a probe that logged in each cycle would mint 120
 * sessions an hour and exhaust the pool in about eight minutes — locking the
 * user out of their own Pi-hole admin UI. They would then change the web
 * password to "fix" it, which invalidates every session and starts the storm
 * again.
 *
 * So: the probe validates a cached SID first (free, and it refreshes the idle
 * timer) and only logs in when there is none, handing the result here for the
 * data layer to reuse.
 *
 * Deliberately in-memory only, unlike qBittorrent's SecureStore-persisted
 * cookie (services/qbittorrent-api.ts). The SID is a bearer credential we would
 * rather not leave at rest, and the 30-minute *idle* TTL means a persisted one
 * is stale on almost every real cold start anyway — so persisting would buy a
 * wasted 401 round trip in exchange for a security surface. The seat pressure
 * comes from the health poll, not from launches, and that is solved above.
 */

export const PIHOLE_SID_HEADER = "X-FTL-SID";

export interface PiholeSessionEntry {
  /**
   * The session id, or null when there is none cached.
   *
   * An EMPTY STRING is a distinct, meaningful state: the Pi-hole has no
   * password configured, so FTL answers `{valid: true, sid: null}` and every
   * call authenticates anonymously. Caching "" stops ensureSession re-logging
   * in on every single request forever. Never test this for truthiness to mean
   * "do we have a session".
   */
  sid: string | null;
  /**
   * The in-flight login, shared by every concurrent caller.
   *
   * Load-bearing: opening the Pi-hole screen fires roughly six queries in one
   * tick, which without de-duplication is six of the sixteen available seats
   * spent on a single render.
   */
  loginPromise: Promise<string> | null;
  /**
   * Bumped whenever the session is invalidated. Recovery paths capture it
   * before re-logging in and bail if it moved, so N concurrent 401s produce one
   * new session rather than N.
   */
  generation: number;
}

const sessions = new Map<string, PiholeSessionEntry>();

export function piholeSessionEntry(instanceId: string): PiholeSessionEntry {
  let entry = sessions.get(instanceId);
  if (!entry) {
    entry = { sid: null, loginPromise: null, generation: 0 };
    sessions.set(instanceId, entry);
  }
  return entry;
}

/** The cached SID, or null when there is none. "" means "no password needed". */
export function getPiholeSid(instanceId: string): string | null {
  return sessions.get(instanceId)?.sid ?? null;
}

export function setPiholeSid(instanceId: string, sid: string | null): void {
  piholeSessionEntry(instanceId).sid = sid;
}

/**
 * Invalidate the cached session for an instance.
 *
 * Mutates the entry in place and bumps the generation rather than deleting it.
 * Deleting is what services/deluge-api.ts does (:516), and it is harmless there
 * because a Deluge re-login is cheap and unmetered — but here a dropped entry
 * means concurrent callers that already resolved against the old object each
 * re-login independently, and every abandoned SID holds one of sixteen seats
 * for thirty minutes.
 */
export function dropPiholeSession(instanceId: string): void {
  const entry = sessions.get(instanceId);
  if (!entry) return;
  entry.sid = null;
  entry.loginPromise = null;
  entry.generation += 1;
}

/** Instance ids with a cached entry — used to log every session out at once. */
export function piholeSessionIds(): string[] {
  return [...sessions.keys()];
}

/** Forget an instance entirely, after its session has been logged out. */
export function forgetPiholeSession(instanceId: string): void {
  sessions.delete(instanceId);
}

/** Test-only, mirroring resetDigestSessions in lib/http-auth.ts. */
export function resetPiholeSessions(): void {
  sessions.clear();
}
