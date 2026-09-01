import {
  dedupedPiholeLogin,
  dropPiholeSession,
  getPiholeSid,
  invalidatePiholeSid,
  piholeLoginInFlight,
  resetPiholeSessions,
  setPiholeSid,
} from "@/lib/pihole-session";

/**
 * The session cache is the thing standing between this integration and
 * exhausting Pi-hole's sixteen API seats, so its concurrency rules are tested
 * directly rather than only through the API module.
 */

const ID = "inst-1";

beforeEach(() => {
  resetPiholeSessions();
});

/** A login that resolves on demand, so races can be ordered deterministically. */
function deferredLogin(sid: string) {
  let resolve!: (value: string) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const fn = jest.fn(() => promise);
  return { fn, resolve: () => resolve(sid), reject };
}

describe("dedupedPiholeLogin", () => {
  it("returns the cached sid without logging in", async () => {
    setPiholeSid(ID, "sid-1");
    const login = jest.fn();
    await expect(dedupedPiholeLogin(ID, login)).resolves.toBe("sid-1");
    expect(login).not.toHaveBeenCalled();
  });

  // The empty string is a real session: a Pi-hole with no password configured.
  it("treats an empty sid as cached, not as absent", async () => {
    setPiholeSid(ID, "");
    const login = jest.fn();
    await expect(dedupedPiholeLogin(ID, login)).resolves.toBe("");
    expect(login).not.toHaveBeenCalled();
  });

  it("shares one in-flight login across concurrent callers", async () => {
    const { fn, resolve } = deferredLogin("sid-1");
    const a = dedupedPiholeLogin(ID, fn);
    const b = dedupedPiholeLogin(ID, fn);
    const c = dedupedPiholeLogin(ID, fn);
    resolve();
    await expect(Promise.all([a, b, c])).resolves.toEqual(["sid-1", "sid-1", "sid-1"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getPiholeSid(ID)).toBe("sid-1");
  });

  // THE cross-layer case: on a cold start the health probe and the screen's
  // first query race. They live in different modules with different login
  // implementations, so the de-duplication has to happen here or each mints its
  // own session and only the last writer is cached — one seat orphaned for
  // thirty minutes, on every cold start.
  it("de-duplicates across callers with different login implementations", async () => {
    const probeLogin = deferredLogin("sid-probe");
    const dataLogin = deferredLogin("sid-data");

    const fromProbe = dedupedPiholeLogin(ID, probeLogin.fn);
    const fromData = dedupedPiholeLogin(ID, dataLogin.fn);

    probeLogin.resolve();
    await expect(Promise.all([fromProbe, fromData])).resolves.toEqual([
      "sid-probe",
      "sid-probe",
    ]);
    expect(probeLogin.fn).toHaveBeenCalledTimes(1);
    expect(dataLogin.fn).not.toHaveBeenCalled();
  });

  it("starts a fresh login once the previous one settled", async () => {
    const first = deferredLogin("sid-1");
    const p = dedupedPiholeLogin(ID, first.fn);
    first.resolve();
    await p;

    invalidatePiholeSid(ID, "sid-1");
    const second = deferredLogin("sid-2");
    const q = dedupedPiholeLogin(ID, second.fn);
    second.resolve();
    await expect(q).resolves.toBe("sid-2");
    expect(second.fn).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight promise when a login fails, so the next can retry", async () => {
    const failing = deferredLogin("unused");
    const p = dedupedPiholeLogin(ID, failing.fn);
    failing.reject(new Error("nope"));
    await expect(p).rejects.toThrow("nope");
    expect(piholeLoginInFlight(ID)).toBeNull();

    const ok = deferredLogin("sid-2");
    const q = dedupedPiholeLogin(ID, ok.fn);
    ok.resolve();
    await expect(q).resolves.toBe("sid-2");
  });

  // A credential change must not let a login started under the OLD password
  // publish its session — that SID would then be sent on every later request.
  it("does not publish a session invalidated mid-flight by a credential change", async () => {
    const { fn, resolve } = deferredLogin("sid-old");
    const p = dedupedPiholeLogin(ID, fn);
    dropPiholeSession(ID);
    resolve();
    await p;
    expect(getPiholeSid(ID)).toBeNull();
  });
});

describe("invalidatePiholeSid", () => {
  it("clears the session when the failing sid is still the cached one", () => {
    setPiholeSid(ID, "sid-1");
    invalidatePiholeSid(ID, "sid-1");
    expect(getPiholeSid(ID)).toBeNull();
  });

  // The whole point of the conditional. Several requests share one SID and 401
  // together; if each cleared unconditionally, the second would wipe the
  // replacement the first had just obtained, spawning another login and
  // orphaning a seat.
  it("ignores a stale sid so it cannot clobber a replacement", () => {
    setPiholeSid(ID, "sid-2");
    invalidatePiholeSid(ID, "sid-1");
    expect(getPiholeSid(ID)).toBe("sid-2");
  });

  it("does not cancel a login already in flight", async () => {
    setPiholeSid(ID, "sid-1");
    const { fn, resolve } = deferredLogin("sid-2");
    invalidatePiholeSid(ID, "sid-1");
    const p = dedupedPiholeLogin(ID, fn);
    expect(piholeLoginInFlight(ID)).not.toBeNull();

    // A second, later 401 for the already-dead sid must be a no-op.
    invalidatePiholeSid(ID, "sid-1");
    expect(piholeLoginInFlight(ID)).not.toBeNull();

    resolve();
    await expect(p).resolves.toBe("sid-2");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => invalidatePiholeSid("nope", "sid-1")).not.toThrow();
  });
});

describe("dropPiholeSession", () => {
  it("clears the sid and the in-flight login", async () => {
    const { fn, resolve } = deferredLogin("sid-1");
    void dedupedPiholeLogin(ID, fn).catch(() => undefined);
    dropPiholeSession(ID);
    expect(getPiholeSid(ID)).toBeNull();
    expect(piholeLoginInFlight(ID)).toBeNull();
    resolve();
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => dropPiholeSession("nope")).not.toThrow();
  });
});
