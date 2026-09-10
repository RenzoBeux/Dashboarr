import type { SeerrMe } from "@/lib/seerr-auth";
import {
  dedupedSeerrLogin,
  drainSeerrLogins,
  dropSeerrSession,
  forgetSeerrSession,
  getSeerrSessionMe,
  invalidateSeerrSession,
  isSeerrSessionEstablished,
  resetSeerrSessions,
  seerrLoginInFlight,
  seerrSessionGeneration,
  seerrSessionIds,
  setSeerrSession,
} from "@/lib/seerr-session";

/**
 * The cache is what keeps the health poll and the Requests screen from each
 * logging in on a cold start, what keeps N concurrent rejections from
 * producing N re-logins, and (via draining) what keeps a superseded login's
 * Set-Cookie from landing after the logout meant to end it. Its rules are
 * tested directly.
 */

const ID = "inst-1";
const LAN = "seerr.local";
const WAN = "seerr.example.com";
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
    setSeerrSession(ID, LAN, ME);
    const login = jest.fn();
    await expect(dedupedSeerrLogin(ID, LAN, login)).resolves.toEqual(ME);
    expect(login).not.toHaveBeenCalled();
  });

  it("shares one in-flight login across concurrent callers", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const a = dedupedSeerrLogin(ID, LAN, fn);
    const b = dedupedSeerrLogin(ID, LAN, fn);
    const c = dedupedSeerrLogin(ID, LAN, fn);
    resolve();
    await expect(Promise.all([a, b, c])).resolves.toEqual([ME, ME, ME]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(true);
    expect(getSeerrSessionMe(ID)).toEqual(ME);
  });

  // The cross-layer case: the probe and the data layer have different login
  // implementations; whoever arrives first runs, everyone else joins.
  it("de-duplicates across callers with different login implementations", async () => {
    const probeLogin = deferredLogin(ME);
    const dataLogin = deferredLogin(OTHER);

    const fromProbe = dedupedSeerrLogin(ID, LAN, probeLogin.fn);
    const fromData = dedupedSeerrLogin(ID, LAN, dataLogin.fn);

    probeLogin.resolve();
    await expect(Promise.all([fromProbe, fromData])).resolves.toEqual([ME, ME]);
    expect(probeLogin.fn).toHaveBeenCalledTimes(1);
    expect(dataLogin.fn).not.toHaveBeenCalled();
  });

  // The jar keys cookies by host, so a session on the LAN host says nothing
  // about the remote host: a network switch must log in there separately.
  it("keeps hosts of one instance independent", async () => {
    setSeerrSession(ID, LAN, ME);
    expect(isSeerrSessionEstablished(ID, WAN)).toBe(false);
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, WAN, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    resolve();
    await p;
    expect(isSeerrSessionEstablished(ID, WAN)).toBe(true);
  });

  it("starts a fresh login once the previous session was invalidated", async () => {
    const first = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, LAN, first.fn);
    first.resolve();
    await p;

    invalidateSeerrSession(ID, LAN, seerrSessionGeneration(ID, LAN));
    const second = deferredLogin(OTHER);
    const q = dedupedSeerrLogin(ID, LAN, second.fn);
    second.resolve();
    await expect(q).resolves.toEqual(OTHER);
    expect(second.fn).toHaveBeenCalledTimes(1);
    expect(getSeerrSessionMe(ID)).toEqual(OTHER);
  });

  it("clears the in-flight promise when a login fails, so the next can retry", async () => {
    const failing = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, LAN, failing.fn);
    failing.reject(new Error("nope"));
    await expect(p).rejects.toThrow("nope");
    expect(seerrLoginInFlight(ID, LAN)).toBeNull();
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(false);

    const ok = deferredLogin(ME);
    const q = dedupedSeerrLogin(ID, LAN, ok.fn);
    ok.resolve();
    await expect(q).resolves.toEqual(ME);
  });

  // A credential change must not let a login started under the OLD
  // credentials publish its session.
  it("does not publish a session dropped mid-flight by a credential change", async () => {
    const { fn, resolve } = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, LAN, fn);
    dropSeerrSession(ID);
    resolve();
    await p;
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
  });
});

describe("invalidateSeerrSession", () => {
  it("clears the session when the generation is current", () => {
    setSeerrSession(ID, LAN, ME);
    const gen = seerrSessionGeneration(ID, LAN);
    invalidateSeerrSession(ID, LAN, gen);
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(seerrSessionGeneration(ID, LAN)).toBe(gen + 1);
  });

  // Several requests share one session and get rejected together. Only the
  // first invalidation may act; the rest carry a stale generation and must
  // not wipe the replacement that is already being established.
  it("ignores a stale generation so concurrent rejections invalidate once", async () => {
    setSeerrSession(ID, LAN, ME);
    const gen = seerrSessionGeneration(ID, LAN);

    invalidateSeerrSession(ID, LAN, gen);
    const { fn, resolve } = deferredLogin(OTHER);
    const p = dedupedSeerrLogin(ID, LAN, fn);

    invalidateSeerrSession(ID, LAN, gen);
    invalidateSeerrSession(ID, LAN, gen);
    expect(seerrSessionGeneration(ID, LAN)).toBe(gen + 1);
    expect(seerrLoginInFlight(ID, LAN)).not.toBeNull();

    resolve();
    await expect(p).resolves.toEqual(OTHER);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(true);
  });

  it("does not touch the other host", () => {
    setSeerrSession(ID, LAN, ME);
    setSeerrSession(ID, WAN, ME);
    invalidateSeerrSession(ID, LAN, seerrSessionGeneration(ID, LAN));
    expect(isSeerrSessionEstablished(ID, WAN)).toBe(true);
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => invalidateSeerrSession("nope", LAN, 0)).not.toThrow();
  });
});

describe("dropSeerrSession", () => {
  it("clears every host and bumps each generation", () => {
    setSeerrSession(ID, LAN, ME);
    setSeerrSession(ID, WAN, ME);
    const lanGen = seerrSessionGeneration(ID, LAN);
    const wanGen = seerrSessionGeneration(ID, WAN);
    dropSeerrSession(ID);
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(false);
    expect(isSeerrSessionEstablished(ID, WAN)).toBe(false);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(seerrSessionGeneration(ID, LAN)).toBe(lanGen + 1);
    expect(seerrSessionGeneration(ID, WAN)).toBe(wanGen + 1);
  });

  // A drop cannot cancel a request already on the wire; it only stops anyone
  // from joining it and stops it from publishing.
  it("supersedes an in-flight login so a new caller starts its own", async () => {
    const old = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, LAN, old.fn);
    dropSeerrSession(ID);
    expect(seerrLoginInFlight(ID, LAN)).toBeNull();

    const fresh = deferredLogin(OTHER);
    const q = dedupedSeerrLogin(ID, LAN, fresh.fn);
    expect(fresh.fn).toHaveBeenCalledTimes(1);

    old.resolve();
    await p;
    expect(isSeerrSessionEstablished(ID, LAN)).toBe(false);
    fresh.resolve();
    await expect(q).resolves.toEqual(OTHER);
    expect(getSeerrSessionMe(ID)).toEqual(OTHER);
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => dropSeerrSession("nope")).not.toThrow();
  });
});

describe("drainSeerrLogins", () => {
  // THE reason draining exists: the superseded login's Set-Cookie lands when
  // it answers, so the logout that follows a credential change must wait for
  // it or the old account's cookie ends up in charge of the host.
  it("waits for a superseded login before resolving", async () => {
    const old = deferredLogin(ME);
    void dedupedSeerrLogin(ID, LAN, old.fn);
    dropSeerrSession(ID);

    let drained = false;
    const drain = drainSeerrLogins(ID).then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    old.resolve();
    await drain;
    expect(drained).toBe(true);
  });

  it("waits for a current login too, and swallows failures", async () => {
    const failing = deferredLogin(ME);
    const p = dedupedSeerrLogin(ID, WAN, failing.fn).catch(() => undefined);
    const drain = drainSeerrLogins(ID);
    failing.reject(new Error("nope"));
    await expect(drain).resolves.toBeUndefined();
    await p;
  });

  it("resolves immediately with nothing in flight", async () => {
    await expect(drainSeerrLogins(ID)).resolves.toBeUndefined();
  });
});

describe("bookkeeping", () => {
  it("lists distinct instances and forgets every host of one", () => {
    setSeerrSession(ID, LAN, ME);
    setSeerrSession(ID, WAN, ME);
    setSeerrSession("inst-2", LAN, OTHER);
    expect(seerrSessionIds().sort()).toEqual([ID, "inst-2"]);
    forgetSeerrSession(ID);
    expect(seerrSessionIds()).toEqual(["inst-2"]);
    expect(getSeerrSessionMe(ID)).toBeNull();
    expect(isSeerrSessionEstablished(ID, WAN)).toBe(false);
  });
});
