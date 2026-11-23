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
}

/**
 * Per-instance login cookies for the services that sign in with a cookie
 * session (qBittorrent, AdGuard Home), persisted to SecureStore under
 * `secrets.${instanceId}.sessionCookie`.
 *
 * A login stores its cookie on the session object it started on. Clearing an
 * instance (new credentials or URL, a restore) swaps in a new object, so a
 * login still in flight for the old settings cannot hand its cookie to the
 * new ones.
 */
export function createCookieSessionCache() {
  const sessions = new Map<string, CookieSession>();
  const keyFor = (instanceId: string) => `${SECRET_PREFIX}.${instanceId}.sessionCookie`;

  function session(instanceId: string): CookieSession {
    let entry = sessions.get(instanceId);
    if (!entry) {
      entry = { cached: null, loaded: false, loginPromise: null };
      sessions.set(instanceId, entry);
    }
    return entry;
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
    if (sessions.get(instanceId) !== owner) {
      throw new Error("The service settings changed during the request. Try again.");
    }
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
   * Forget the current cookie after the server rejected it. Logins already in
   * flight stay valid: they use the same settings.
   */
  async function dropCookie(instanceId: string): Promise<void> {
    const entry = session(instanceId);
    entry.cached = null;
    entry.loaded = true;
    await deleteSecret(keyFor(instanceId));
  }

  /**
   * Start the instance over with no session and discard logins in flight. The
   * new session is marked loaded, so it never reads back a cookie a discarded
   * login managed to write.
   */
  async function clear(instanceId: string): Promise<void> {
    sessions.set(instanceId, { cached: null, loaded: true, loginPromise: null });
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
