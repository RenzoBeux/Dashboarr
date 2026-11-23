import { deleteSecret, getSecret, setSecret } from "@/store/storage";
import { SECRET_PREFIX } from "@/lib/constants";
import { hostOf } from "@/lib/url-validation";

/**
 * Recorded when a login worked but its Set-Cookie header was not readable.
 * iOS's NSURLSession always strips it, and Android's OkHttp CookieJar usually
 * consumes it first, so the platform jar holds the cookie and attaches it on
 * its own.
 */
export const NATIVE_JAR_SENTINEL = "__native_cookie_jar__";

const noop = () => {};

export interface CookieSession {
  cached: string | null;
  loaded: boolean;
  loginPromise: Promise<boolean> | null;
}

/** How long a login waits for discarded logins to its host to finish. */
const DISCARDED_LOGIN_WAIT_MS = 30_000;

interface LoginInFlight {
  owner: CookieSession;
  host: string;
  finished: Promise<void>;
}

/** Resolves false when `deadline` passes first. */
async function finishedBy(logins: Promise<void>[], deadline: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([Promise.all(logins).then(() => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Per-instance login cookies for the services that sign in with a cookie
 * session (qBittorrent, AdGuard Home), persisted to SecureStore under
 * `secrets.${instanceId}.sessionCookie`.
 *
 * A login stores its cookie on the session object it started on. Clearing an
 * instance (new credentials or URL, a restore) swaps in a new object, so a
 * login still in flight for the old settings cannot hand its cookie to the
 * new ones. Where the platform jar keeps the cookie, that login's response
 * would still replace the cookie of a newer login to the same host, and later
 * requests would run as the previous account. Aborting it is not enough: on
 * iOS React Native only cancels a request whose id already reached
 * JavaScript, and the jar can take the cookie before JavaScript sees the
 * response. So a login waits until every discarded login to its host has
 * finished, and its own cookie lands last.
 */
export function createCookieSessionCache() {
  const sessions = new Map<string, CookieSession>();
  const inFlight = new Map<string, Set<LoginInFlight>>();
  const keyFor = (instanceId: string) => `${SECRET_PREFIX}.${instanceId}.sessionCookie`;

  function create(instanceId: string, loaded: boolean): CookieSession {
    const entry = { cached: null, loaded, loginPromise: null };
    sessions.set(instanceId, entry);
    return entry;
  }

  function session(instanceId: string): CookieSession {
    return sessions.get(instanceId) ?? create(instanceId, false);
  }

  function staleRequest(): Error {
    return new Error("The service settings changed during the request. Try again.");
  }

  function discardedLogins(instanceId: string, owner: CookieSession, host: string) {
    return [...(inFlight.get(instanceId) ?? [])]
      .filter((login) => login.owner !== owner && login.host === host)
      .map((login) => login.finished);
  }

  /**
   * Send a login for `owner` to `url` once the discarded logins to the same
   * host (cookies ignore the port) have finished. Throws when the instance is
   * cleared meanwhile, or when they do not finish in time.
   */
  async function login<T>(
    instanceId: string,
    owner: CookieSession,
    url: string,
    send: () => Promise<T>,
  ): Promise<T> {
    const host = hostOf(url);
    const deadline = Date.now() + DISCARDED_LOGIN_WAIT_MS;
    for (;;) {
      if (sessions.get(instanceId) !== owner) throw staleRequest();
      const waiting = discardedLogins(instanceId, owner, host);
      if (waiting.length === 0) break;
      if (!(await finishedBy(waiting, deadline))) {
        throw new Error(
          "A sign-in made with the previous settings has not finished yet. Try again shortly.",
        );
      }
    }
    // Sent in the same tick as the check above, so no clear slips in between.
    const request = send();
    const logins = inFlight.get(instanceId) ?? new Set<LoginInFlight>();
    inFlight.set(instanceId, logins);
    const entry: LoginInFlight = { owner, host, finished: request.then(noop, noop) };
    logins.add(entry);
    void entry.finished.then(() => logins.delete(entry));
    return request;
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
    create(instanceId, true);
    await deleteSecret(keyFor(instanceId));
  }

  /** `clear` for the instances this run has used. Others have nothing in flight. */
  function clearIfUsed(instanceId: string): void {
    if (sessions.has(instanceId)) void clear(instanceId).catch(() => {});
  }

  return {
    session,
    login,
    getCookie,
    cookieForRequest,
    storeCookie,
    dropCookie,
    clear,
    clearIfUsed,
    ids: () => [...sessions.keys()],
  };
}
