import type { SeerrMe } from "@/lib/seerr-auth";
import {
  dedupedSeerrLogin,
  dropSeerrSession,
  forgetSeerrSession,
  getSeerrSessionMe,
  invalidateSeerrSession,
  isSeerrSessionEstablished,
  resetSeerrSessions,
  seerrLoginInFlight,
  seerrLoginMustBeFresh,
  seerrSessionGeneration,
  seerrSessionIds,
  setSeerrSession,
} from "@/lib/seerr-session";

/**
 * The cache is what keeps the health poll and the Requests screen from each
 * logging in on a cold start, and what keeps N concurrent rejections from
 * producing N re-logins. Its concurrency rules are tested directly.
 */

const ID = "inst-1";
const ME: SeerrMe = { id: 7, displayName: "Sarah", permissions: 32 };
const OTHER: SeerrMe = { id: 8, displayName: "Alex", permissions: 32 };

beforeEach(() => {
  resetSeerrSessions();
});

/** A login that resolves on demand, so races can be ordered deterministically. */
function deferredLogin(me: SeerrMe) {
  let resolve!: (value: SeerrMe) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<SeerrMe>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const fn = jest.fn(() => promise);
  return { fn, resolve: () => resolve(me), reject };
}

describe("dedupedSeerrLogin", () => {
  it("returns the cached account without logging in", async () => {
    setSeerrSession(ID, ME);
    const login = jest.fn();
    await expect(dedupedSeerrLogin(ID, login)).resolves.toEqual(ME);
    expect(login).not.toHaveBeenCalled();
  });

  it("shares one in-flight login across concurrent callers", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const a = dedupedSeerrLogin(ID, fn);
    const b = dedupedSeerrLogin(ID, fn);
    const c = dedupedSeerrLogin(ID, fn);
    resolve();
    await expect(Promise.all([a, b, c])).resolves.toEqual([ME, ME, ME]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isSeerrSessionEstablished(ID)).toBe(true);
    expect(getSeerrSessionMe(ID)).toEqual(ME);
  });

  // The cross-layer case: the probe and the data layer have different login
  // implementations; whoever arrives first runs, everyone else joins.
  it("de-duplicates across callers with different login implementations", async () => {
    const probeLogin = deferredLogin(ME);
    const dataLogin = deferredLogin(OTHER);

    const fromProbe = dedupedSeerrLogin(ID, probeLogin.fn);
    const fromData = dedupedSeerrLogin(ID, dataLogin.fn);

    probeLogin.resolve();
    await expect(Promise.all([fromProbe, fromData])).resolves.toEqual([ME, ME]);
    expect(probeLogin.fn).toHaveBeenCalledTimes(1);
    expect(dataLogin.fn).not.toHaveBeenCalled();
  });

  it("starts a fresh login once the previous session was invalidated", async () => {
    const first = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, first.fn);
    first.resolve();
    await p;

    invalidateSeerrSession(ID, seerrSessionGeneration(ID));
    const second = deferredLogin(OTHER);
    const q = dedupedSeerrLogin(ID, second.fn);
    second.resolve();
    await expect(q).resolves.toEqual(OTHER);
    expect(second.fn).toHaveBeenCalledTimes(1);
    expect(getSeerrSessionMe(ID)).toEqual(OTHER);
  });

  it("clears the in-flight promise when a login fails, so the next can retry", async () => {
    const failing = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, failing.fn);
    failing.reject(new Error("nope"));
    await expect(p).rejects.toThrow("nope");
    expect(seerrLoginInFlight(ID)).toBeNull();
    expect(isSeerrSessionEstablished(ID)).toBe(false);

    const ok = deferredLogin(ME);
    const q = dedupedSeerrLogin(ID, ok.fn);
    ok.resolve();
    await expect(q).resolves.toEqual(ME);
  });

  // A credential change must not let a login started under the OLD
  // credentials publish its session.
  it("does not publish a session dropped mid-flight by a credential change", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, fn);
    dropSeerrSession(ID);
    resolve();
    await p;
    expect(isSeerrSessionEstablished(ID)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
  });
});

describe("invalidateSeerrSession", () => {
  it("clears the session when the generation is current", () => {
    setSeerrSession(ID, ME);
    const gen = seerrSessionGeneration(ID);
    invalidateSeerrSession(ID, gen);
    expect(isSeerrSessionEstablished(ID)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(seerrSessionGeneration(ID)).toBe(gen + 1);
  });

  // Several requests share one session and get rejected together. Only the
  // first invalidation may act; the rest carry a stale generation and must
  // not wipe the replacement that is already being established.
  it("ignores a stale generation so concurrent rejections invalidate once", async () => {
    setSeerrSession(ID, ME);
    const gen = seerrSessionGeneration(ID);

    invalidateSeerrSession(ID, gen);
    const { fn, resolve } = deferredLogin(OTHER);
    const p = dedupedSeerrLogin(ID, fn);

    // Late rejections from the same batch.
    invalidateSeerrSession(ID, gen);
    invalidateSeerrSession(ID, gen);
    expect(seerrSessionGeneration(ID)).toBe(gen + 1);
    expect(seerrLoginInFlight(ID)).not.toBeNull();

    resolve();
    await expect(p).resolves.toEqual(OTHER);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isSeerrSessionEstablished(ID)).toBe(true);
  });

  it("does not cancel a login already in flight", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, fn);
    invalidateSeerrSession(ID, seerrSessionGeneration(ID) - 1);
    expect(seerrLoginInFlight(ID)).not.toBeNull();
    resolve();
    await expect(p).resolves.toEqual(ME);
    expect(isSeerrSessionEstablished(ID)).toBe(true);
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => invalidateSeerrSession("nope", 0)).not.toThrow();
  });
});

describe("dropSeerrSession", () => {
  it("clears everything and bumps the generation", async () => {
    const { fn, resolve } = deferredLogin(ME);
    void dedupedSeerrLogin(ID, fn).catch(() => undefined);
    const gen = seerrSessionGeneration(ID);
    dropSeerrSession(ID);
    expect(isSeerrSessionEstablished(ID)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(seerrLoginInFlight(ID)).toBeNull();
    expect(seerrSessionGeneration(ID)).toBe(gen + 1);
    resolve();
  });

  // The jar outlives the process and is scoped per host, so after a
  // credential or URL change the next login must post credentials instead of
  // adopting whatever old-account cookie is still live somewhere.
  it("flags the next login as credential-only, even for an untouched instance", () => {
    expect(seerrLoginMustBeFresh("fresh")).toBe(false);
    dropSeerrSession("fresh");
    expect(seerrLoginMustBeFresh("fresh")).toBe(true);
  });

  it("clears the flag once a login publishes, and a plain 401 never sets it", async () => {
    dropSeerrSession(ID);
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, fn);
    resolve();
    await p;
    expect(seerrLoginMustBeFresh(ID)).toBe(false);

    invalidateSeerrSession(ID, seerrSessionGeneration(ID));
    expect(seerrLoginMustBeFresh(ID)).toBe(false);
  });

  it("keeps the flag when the login it superseded tries to publish", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, fn);
    dropSeerrSession(ID);
    resolve();
    await p;
    expect(seerrLoginMustBeFresh(ID)).toBe(true);
  });
});

describe("bookkeeping", () => {
  it("lists and forgets instances", () => {
    setSeerrSession(ID, ME);
    setSeerrSession("inst-2", OTHER);
    expect(seerrSessionIds().sort()).toEqual([ID, "inst-2"]);
    forgetSeerrSession(ID);
    expect(seerrSessionIds()).toEqual(["inst-2"]);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(seerrSessionGeneration(ID)).toBe(0);
  });
});
