import {
  BESZEL_TOKEN_MAX_AGE_MS,
  dropBeszelSession,
  forgetBeszelSession,
  getBeszelToken,
  resetBeszelSessions,
} from "@/lib/beszel-session";

/**
 * This cache is the only thing standing between the integration and the
 * "silent empty list" trap (see the module doc): a stale/invalidated token
 * never 401s, it just answers 200 with zero systems, so getting the
 * cache/staleness/dedup logic right here is what services/beszel-api.ts's
 * retry-on-empty backstop depends on.
 */

const ID = "inst-1";

beforeEach(() => {
  resetBeszelSessions();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function deferredLogin(token: string, authCollection: "_superusers" | "users" = "_superusers") {
  let resolve!: (value: { token: string; authCollection: "_superusers" | "users" }) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<{ token: string; authCollection: "_superusers" | "users" }>(
    (res, rej) => {
      resolve = res;
      reject = rej;
    },
  );
  const fn = jest.fn(() => promise);
  return { fn, resolve: () => resolve({ token, authCollection }), reject };
}

describe("getBeszelToken", () => {
  it("logs in on a cold cache and marks the result fresh", async () => {
    const { fn, resolve } = deferredLogin("tok-1");
    const p = getBeszelToken(ID, fn);
    resolve();
    await expect(p).resolves.toEqual({
      token: "tok-1",
      authCollection: "_superusers",
      fresh: true,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the cached token without logging in again, marked not fresh", async () => {
    const first = deferredLogin("tok-1");
    const p1 = getBeszelToken(ID, first.fn);
    first.resolve();
    await p1;

    const login = jest.fn();
    await expect(getBeszelToken(ID, login)).resolves.toEqual({
      token: "tok-1",
      authCollection: "_superusers",
      fresh: false,
    });
    expect(login).not.toHaveBeenCalled();
  });

  it("caches the authCollection a users-collection login resolved to", async () => {
    const { fn, resolve } = deferredLogin("tok-1", "users");
    const p = getBeszelToken(ID, fn);
    resolve();
    await expect(p).resolves.toEqual({
      token: "tok-1",
      authCollection: "users",
      fresh: true,
    });
  });

  it("shares one in-flight login across concurrent callers", async () => {
    const { fn, resolve } = deferredLogin("tok-1");
    const a = getBeszelToken(ID, fn);
    const b = getBeszelToken(ID, fn);
    const c = getBeszelToken(ID, fn);
    resolve();
    await expect(Promise.all([a, b, c])).resolves.toEqual([
      { token: "tok-1", authCollection: "_superusers", fresh: true },
      { token: "tok-1", authCollection: "_superusers", fresh: false },
      { token: "tok-1", authCollection: "_superusers", fresh: false },
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-logs-in once the cached token ages past BESZEL_TOKEN_MAX_AGE_MS", async () => {
    const first = deferredLogin("tok-1");
    const p1 = getBeszelToken(ID, first.fn);
    first.resolve();
    await p1;

    jest.advanceTimersByTime(BESZEL_TOKEN_MAX_AGE_MS + 1);

    const second = deferredLogin("tok-2");
    const p2 = getBeszelToken(ID, second.fn);
    second.resolve();
    await expect(p2).resolves.toEqual({
      token: "tok-2",
      authCollection: "_superusers",
      fresh: true,
    });
    expect(second.fn).toHaveBeenCalledTimes(1);
  });

  it("does not re-login just under the max age", async () => {
    const first = deferredLogin("tok-1");
    const p1 = getBeszelToken(ID, first.fn);
    first.resolve();
    await p1;

    jest.advanceTimersByTime(BESZEL_TOKEN_MAX_AGE_MS - 1);

    const login = jest.fn();
    await expect(getBeszelToken(ID, login)).resolves.toEqual({
      token: "tok-1",
      authCollection: "_superusers",
      fresh: false,
    });
    expect(login).not.toHaveBeenCalled();
  });

  it("does not publish a token invalidated mid-flight by a credential change", async () => {
    // dropBeszelSession bumps the generation while the login below is still
    // in flight, so its result must not get cached even though the promise
    // itself resolves fine to whoever was awaiting it directly.
    const { fn, resolve } = deferredLogin("tok-old");
    const p = getBeszelToken(ID, fn);
    dropBeszelSession(ID);
    resolve();
    await p;

    // The next call must log in again rather than serving the orphaned
    // "tok-old" from cache.
    const second = deferredLogin("tok-new");
    const p2 = getBeszelToken(ID, second.fn);
    second.resolve();
    await expect(p2).resolves.toEqual({
      token: "tok-new",
      authCollection: "_superusers",
      fresh: true,
    });
    expect(second.fn).toHaveBeenCalledTimes(1);
  });

  it("clears the in-flight login on failure so the next call can retry", async () => {
    const failing = deferredLogin("unused");
    const p = getBeszelToken(ID, failing.fn);
    failing.reject(new Error("wrong password"));
    await expect(p).rejects.toThrow("wrong password");

    const ok = deferredLogin("tok-2");
    const q = getBeszelToken(ID, ok.fn);
    ok.resolve();
    await expect(q).resolves.toMatchObject({ token: "tok-2" });
  });
});

describe("dropBeszelSession", () => {
  it("forces the next call to log in again", async () => {
    const first = deferredLogin("tok-1");
    const p1 = getBeszelToken(ID, first.fn);
    first.resolve();
    await p1;

    dropBeszelSession(ID);

    const second = deferredLogin("tok-2");
    const p2 = getBeszelToken(ID, second.fn);
    second.resolve();
    await expect(p2).resolves.toMatchObject({ token: "tok-2", fresh: true });
  });

  it("is a no-op for an unknown instance", () => {
    expect(() => dropBeszelSession("nope")).not.toThrow();
  });
});

describe("forgetBeszelSession / resetBeszelSessions", () => {
  it("forgetBeszelSession drops just the one instance", async () => {
    const a = deferredLogin("tok-a");
    const pa = getBeszelToken("a", a.fn);
    a.resolve();
    await pa;
    const b = deferredLogin("tok-b");
    const pb = getBeszelToken("b", b.fn);
    b.resolve();
    await pb;

    forgetBeszelSession("a");

    const loginA = deferredLogin("tok-a-2");
    const pa2 = getBeszelToken("a", loginA.fn);
    loginA.resolve();
    await expect(pa2).resolves.toMatchObject({ fresh: true });

    const loginB = jest.fn();
    await expect(getBeszelToken("b", loginB)).resolves.toMatchObject({ token: "tok-b", fresh: false });
    expect(loginB).not.toHaveBeenCalled();
  });
});
