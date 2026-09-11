import type { SeerrMe } from "@/lib/seerr-auth";

/**
 * The per-instance, per-HOST Seerr session cache (#332).
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
 * that a login succeeded and the jar therefore holds a session.
 *
 * Keyed by (instance, host), because that is how the jar is keyed. An instance
 * whose local and remote URLs are different hosts holds two independent
 * cookies, and a network switch moves every request from one to the other. A
 * per-instance flag would let a session validated on one host vouch for a
 * cookie on the other, which is exactly how an old account's session would
 * survive a credential change.
 *
 * Whether a host must be logged into with CREDENTIALS rather than trusted from
 * the jar is not here: it has to outlive the process (the jar does), so it is
 * persisted by store/config-store.ts (`seerrStaleHosts`). This module is the
 * in-memory half only.
 */

export interface SeerrSessionEntry {
  /** A login (or a validated jar cookie) succeeded on this host. */
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
  /**
   * Logins that were superseded by a drop but are still on the wire. A drop
   * only detaches a login from the cache; it cannot cancel the request, and
   * that request's Set-Cookie will still land in the jar when it answers.
   * seerrClearSession awaits these (drainSeerrLogins) BEFORE logging out, so a
   * superseded login can never land after the logout that was meant to end it.
   */
  draining: Set<Promise<unknown>>;
  /**
   * The last credential rejection on this host. While it stands,
   * dedupedSeerrLogin rejects with it instead of posting the credentials
   * again: the 30-second health poll, every query's retries and every
   * refetch would otherwise each re-submit a wrong password, and in
   * mediaServer mode Seerr forwards each attempt to Jellyfin/Emby, whose
   * lockout counts them cumulatively, so even a slow retry eventually locks
   * the account. There is deliberately no timeout. It is cleared by a
   * credential, URL or mode change (dropSeerrSession, via the save path) and
   * by an explicit user retry (forgetSeerrLoginFailures: Test Connection,
   * pull-to-refresh), never by the clock.
   */
  failure: { error: unknown } | null;
}

const sessions = new Map<string, SeerrSessionEntry>();

/**
 * Whether a login rejection means the CREDENTIALS were refused, as opposed
 * to the host being unreachable. Duck-typed on http-client's SeerrLoginError
 * (`result.kind`) because this module cannot import it (cycle); the retry
 * policy in lib/query-client.ts reads errors the same way.
 */
function isCredentialRejection(err: unknown): boolean {
  const kind = (err as { result?: { kind?: unknown } } | null)?.result?.kind;
  return kind === "auth_failed";
}

/**
 * Instances whose logins are suspended, with a depth so nested suspensions
 * compose. While an instance is suspended, dedupedSeerrLogin REJECTS instead
 * of starting a login. Draining alone is not enough during a credential or
 * configuration change: it only awaits what was already on the wire, and the
 * health poll or any query can start a new login with the OLD credentials in
 * the middle of the change, whose Set-Cookie would then land after the new
 * account's. The barrier closes that window; callers lift it once the new
 * configuration and its stale-host marks are installed.
 */
const suspended = new Map<string, number>();

export class SeerrLoginSuspendedError extends Error {
  constructor() {
    super("Seerr sign-in is paused while its settings change");
    this.name = "SeerrLoginSuspendedError";
  }
}

/** Suspend logins for an instance; returns the (idempotent) release. */
export function suspendSeerrLogins(instanceId: string): () => void {
  suspended.set(instanceId, (suspended.get(instanceId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const depth = (suspended.get(instanceId) ?? 1) - 1;
    if (depth <= 0) suspended.delete(instanceId);
    else suspended.set(instanceId, depth);
  };
}

export function seerrLoginsSuspended(instanceId: string): boolean {
  return (suspended.get(instanceId) ?? 0) > 0;
}

// Printable on purpose: a raw control character in source makes git treat the
// file as binary. Neither a UUID nor a hostname can contain "|".
const SEP = "|";
const keyOf = (instanceId: string, host: string) => `${instanceId}${SEP}${host}`;

function entriesOf(instanceId: string): SeerrSessionEntry[] {
  const prefix = `${instanceId}${SEP}`;
  const out: SeerrSessionEntry[] = [];
  for (const [k, entry] of sessions) if (k.startsWith(prefix)) out.push(entry);
  return out;
}

export function seerrSessionEntry(instanceId: string, host: string): SeerrSessionEntry {
  const k = keyOf(instanceId, host);
  let entry = sessions.get(k);
  if (!entry) {
    entry = {
      established: false,
      me: null,
      loginPromise: null,
      generation: 0,
      draining: new Set(),
      failure: null,
    };
    sessions.set(k, entry);
  }
  return entry;
}

/** The account any established host of this instance resolved to, or null. */
export function getSeerrSessionMe(instanceId: string): SeerrMe | null {
  for (const entry of entriesOf(instanceId)) {
    if (entry.established && entry.me) return entry.me;
  }
  return null;
}

export function isSeerrSessionEstablished(instanceId: string, host: string): boolean {
  return sessions.get(keyOf(instanceId, host))?.established ?? false;
}

export function seerrSessionGeneration(instanceId: string, host: string): number {
  return sessions.get(keyOf(instanceId, host))?.generation ?? 0;
}

/** Record a session the jar now holds for this host, and who it belongs to. */
export function setSeerrSession(instanceId: string, host: string, me: SeerrMe): void {
  const entry = seerrSessionEntry(instanceId, host);
  entry.established = true;
  entry.me = me;
  entry.failure = null;
}

/**
 * The 401/403 path. A no-op unless `generation` is still current, so a late
 * rejection from a request made against an already-replaced session cannot
 * wipe the replacement. Bumps the generation so any login still in flight for
 * the dead session cannot publish. Never touches `loginPromise`: an in-flight
 * login is producing a DIFFERENT session and cancelling it is what causes
 * duplicate logins.
 */
export function invalidateSeerrSession(
  instanceId: string,
  host: string,
  generation: number,
): void {
  const entry = sessions.get(keyOf(instanceId, host));
  if (!entry) return;
  if (entry.generation !== generation) return;
  entry.established = false;
  entry.me = null;
  entry.generation += 1;
}

/**
 * The jar lost its cookie for `host` (POST /auth/logout was sent there on
 * behalf of no instance in particular, as the editor's Test button does for
 * an unsaved form). Every instance whose cache still says it is established
 * there is now wrong: unconditional, generation-bumping, so the next request
 * logs in cleanly instead of paying a 401 and a post-mortem first. In-flight
 * logins are left alone: their Set-Cookie is still coming and will be valid.
 */
export function invalidateSeerrSessionsOnHost(host: string): void {
  const suffix = `${SEP}${host}`;
  for (const [k, entry] of sessions) {
    if (!k.endsWith(suffix)) continue;
    if (!entry.established) continue;
    entry.established = false;
    entry.me = null;
    entry.generation += 1;
  }
}

/**
 * The credential-change path, for every host of the instance: unconditional,
 * bumps the generation and supersedes any in-flight login (it is moved to
 * `draining` so nobody joins it, but it is NOT forgotten, because its
 * Set-Cookie is still coming). Nothing here touches the network; the
 * server-side logout and the persisted "needs a credential login" mark are
 * seerrClearSession's job in services/overseerr-api.ts.
 */
export function dropSeerrSession(instanceId: string): void {
  for (const entry of entriesOf(instanceId)) {
    entry.established = false;
    entry.me = null;
    entry.failure = null;
    if (entry.loginPromise) {
      entry.draining.add(entry.loginPromise);
      entry.loginPromise = null;
    }
    entry.generation += 1;
  }
}

/**
 * Wait for every login of this instance still on the wire, superseded or
 * current, so that whatever cookie they set has landed before the caller
 * logs the host out. Outcomes are irrelevant here and errors are swallowed.
 */
export async function drainSeerrLogins(instanceId: string): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const entry of entriesOf(instanceId)) {
    for (const p of entry.draining) pending.push(p);
    if (entry.loginPromise) pending.push(entry.loginPromise);
  }
  await Promise.all(pending.map((p) => p.catch(() => undefined)));
}

/**
 * Establish a session on a host through the shared in-flight promise, whoever
 * the caller is. Both the probe and the data layer pass their own `loginFn`;
 * the first to arrive runs it and everyone else joins.
 */
export function dedupedSeerrLogin(
  instanceId: string,
  host: string,
  loginFn: () => Promise<SeerrMe>,
): Promise<SeerrMe> {
  if (seerrLoginsSuspended(instanceId)) {
    return Promise.reject(new SeerrLoginSuspendedError());
  }
  const entry = seerrSessionEntry(instanceId, host);
  if (entry.established && entry.me) return Promise.resolve(entry.me);
  if (entry.loginPromise) return entry.loginPromise;
  if (entry.failure) return Promise.reject(entry.failure.error);

  const generation = entry.generation;
  const attempt: Promise<SeerrMe> = loginFn()
    .then(
      (me) => {
        if (entry.generation === generation) {
          entry.established = true;
          entry.me = me;
          entry.failure = null;
        }
        return me;
      },
      (err: unknown) => {
        if (isCredentialRejection(err) && entry.generation === generation) {
          entry.failure = { error: err };
        }
        throw err;
      },
    )
    .finally(() => {
      if (entry.loginPromise === attempt) entry.loginPromise = null;
      entry.draining.delete(attempt);
    });
  entry.loginPromise = attempt;
  return attempt;
}

/**
 * The user asked for another try (Test Connection, pull-to-refresh): forget
 * the remembered credential rejections, for one instance or for all of them,
 * so the next login posts the credentials again.
 */
export function forgetSeerrLoginFailures(instanceId?: string): void {
  const entries = instanceId ? entriesOf(instanceId) : [...sessions.values()];
  for (const entry of entries) entry.failure = null;
}

/** Instances whose cache says they hold a session on `host`. */
export function seerrEstablishedInstancesOnHost(host: string): string[] {
  const suffix = `${SEP}${host}`;
  const ids: string[] = [];
  for (const [k, entry] of sessions) {
    if (k.endsWith(suffix) && entry.established) ids.push(k.slice(0, k.length - suffix.length));
  }
  return ids;
}

/** The login already in flight for this host, if any. */
export function seerrLoginInFlight(instanceId: string, host: string): Promise<SeerrMe> | null {
  return sessions.get(keyOf(instanceId, host))?.loginPromise ?? null;
}

/** Distinct instance ids with a cached entry, for logging every session out. */
export function seerrSessionIds(): string[] {
  const ids = new Set<string>();
  for (const k of sessions.keys()) ids.add(k.slice(0, k.indexOf(SEP)));
  return [...ids];
}

/** Forget an instance entirely (every host), after it has been logged out. */
export function forgetSeerrSession(instanceId: string): void {
  const prefix = `${instanceId}${SEP}`;
  for (const k of [...sessions.keys()]) if (k.startsWith(prefix)) sessions.delete(k);
}

/** Test-only, mirroring resetPiholeSessions. */
export function resetSeerrSessions(): void {
  sessions.clear();
  suspended.clear();
}
