import { deleteSecret, getSecret, setSecret } from "@/store/storage";
import { SECRET_PREFIX } from "@/lib/constants";

/**
 * Recorded when a login worked but its Set-Cookie header was not readable.
 * iOS's NSURLSession always strips it, and Android's OkHttp CookieJar usually
 * consumes it first, so the platform jar holds the cookie and attaches it on
 * its own.
 */
export const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

export interface CookieSession {
  cached: string | null;
  loaded: boolean;
  loginPromise: Promise<boolean> | null;
  /** Aborted when the session is cleared. Logins pass it to fetch. */
  signal: AbortSignal;
}

/**
 * Per-instance login cookies for the services that sign in with a cookie
 * session (qBittorrent, AdGuard Home), persisted to SecureStore under
 * `secrets.${instanceId}.sessionCookie`.
 *
 * A login stores its cookie on the session object it started on. Clearing an
 * instance (new credentials or URL, a restore) swaps in a new object, so a
 * login still in flight for the old settings cannot hand its cookie to the
 * new ones. The clear also aborts that login: where the platform jar keeps
 * the cookie, its response would otherwise replace the new login's cookie for
 * the same host, and the next request would run as the previous account.
 */
export function createCookieSessionCache() {
  const sessions = new Map<string, CookieSession>();
  const controllers = new WeakMap<CookieSession, AbortController>();
  const keyFor = (instanceId: string) => `${SECRET_PREFIX}.${instanceId}.sessionCookie`;

  function create(instanceId: string, loaded: boolean): CookieSession {
    const controller = new AbortController();
    const entry = { cached: null, loaded, loginPromise: null, signal: controller.signal };
    controllers.set(entry, controller);
    sessions.set(instanceId, entry);
    return entry;
  }

  function session(instanceId: string): CookieSession {
    return sessions.get(instanceId) ?? create(instanceId, false);
  }

  function staleRequest(): Error {
    return new Error("The service settings changed during the request. Try again.");
  }

  async function getCookie(instanceId: string): Promise<string | null> {
    const entry = session(instanceId);
    if (!entry.loaded) {
      const stored = await getSecret(keyFor(instanceId));
      // A login may have finished while the keychain was being read.
      if (!entry.loaded) {
        entry.cached = stored;
        entry.loaded = true;
      }
    }
    return entry.cached;
  }

  /**
   * The cookie for a request that read its URL and headers while `owner` was
   * current. Throws once the instance was cleared, so neither server gets the
   * other's cookie.
   */
  async function cookieForRequest(
    instanceId: string,
    owner: CookieSession,
  ): Promise<string | null> {
    const cookie = await getCookie(instanceId);
    if (sessions.get(instanceId) !== owner) throw staleRequest();
    return cookie;
  }

  /**
   * Store a login's cookie on the session it started on. Resolves false when
   * that session was cleared meanwhile: the cookie belongs to the old settings.
   */
  async function storeCookie(
    instanceId: string,
    owner: CookieSession,
    value: string,
  ): Promise<boolean> {
    if (sessions.get(instanceId) !== owner) return false;
    owner.cached = value;
    owner.loaded = true;
    await setSecret(keyFor(instanceId), value);
    if (sessions.get(instanceId) === owner) return true;
    // Cleared while the write was in flight, which may have landed after the
    // clear's own delete.
    await deleteSecret(keyFor(instanceId)).catch(() => {});
    return false;
  }

  /**
   * Forget the cookie after the server rejected a request made while `owner`
   * was current. Logins already in flight stay valid: they use the same
   * settings. Throws once the instance was cleared, leaving the new session's
   * cookie alone.
   */
  async function dropCookie(instanceId: string, owner: CookieSession): Promise<void> {
    if (sessions.get(instanceId) !== owner) throw staleRequest();
    owner.cached = null;
    owner.loaded = true;
    await deleteSecret(keyFor(instanceId));
  }

  /**
   * Start the instance over with no session and discard logins in flight. The
   * new session is marked loaded, so it never reads back a cookie a discarded
   * login managed to write.
   */
  async function clear(instanceId: string): Promise<void> {
    const previous = sessions.get(instanceId);
    create(instanceId, true);
    if (previous) controllers.get(previous)?.abort();
    await deleteSecret(keyFor(instanceId));
  }

  /** `clear` for the instances this run has used. Others have nothing in flight. */
  function clearIfUsed(instanceId: string): void {
    if (sessions.has(instanceId)) void clear(instanceId).catch(() => {});
  }

  return {
    session,
    getCookie,
    cookieForRequest,
    storeCookie,
    dropCookie,
    clear,
    clearIfUsed,
    ids: () => [...sessions.keys()],
  };
}
