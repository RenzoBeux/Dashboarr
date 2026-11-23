const mockKeychain = new Map<string, string>();

jest.mock("@/store/storage", () => ({
  getSecret: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setSecret: jest.fn(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  }),
  deleteSecret: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

import { deleteSecret, setSecret } from "@/store/storage";
import { createCookieSessionCache } from "./cookie-session-cache";

const ID = "qb-1";
const KEY = `secrets.${ID}.sessionCookie`;

const flush = () => new Promise((resolve) => setImmediate(resolve));

// A login whose response arrives when the test says so.
function heldLogin() {
  let finish!: () => void;
  const response = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { send: () => response, finish };
}

beforeEach(() => {
  mockKeychain.clear();
  jest.mocked(deleteSecret).mockClear();
});

describe("createCookieSessionCache", () => {
  it("drops the cookie of a login that finishes after the instance was cleared", async () => {
    const cookies = createCookieSessionCache();
    const login = cookies.session(ID);
    await cookies.clear(ID);
    await expect(cookies.storeCookie(ID, login, "old-sid")).resolves.toBe(false);
    await expect(cookies.getCookie(ID)).resolves.toBeNull();
    expect(mockKeychain.has(KEY)).toBe(false);
  });

  it("deletes a keychain write that landed after the clear", async () => {
    const cookies = createCookieSessionCache();
    const login = cookies.session(ID);
    let land!: () => void;
    jest.mocked(setSecret).mockImplementationOnce(
      (key, value) =>
        new Promise<void>((resolve) => {
          land = () => {
            mockKeychain.set(key, value);
            resolve();
          };
        }),
    );
    const stored = cookies.storeCookie(ID, login, "old-sid");
    await cookies.clear(ID);
    land();
    await expect(stored).resolves.toBe(false);
    expect(mockKeychain.has(KEY)).toBe(false);
    await expect(cookies.getCookie(ID)).resolves.toBeNull();
  });

  it("does not read back a cookie left in the keychain after a clear", async () => {
    const cookies = createCookieSessionCache();
    await cookies.clear(ID);
    mockKeychain.set(KEY, "old-sid");
    await expect(cookies.getCookie(ID)).resolves.toBeNull();
  });

  it("keeps a login in flight when only the cookie was rejected", async () => {
    const cookies = createCookieSessionCache();
    mockKeychain.set(KEY, "expired");
    await expect(cookies.getCookie(ID)).resolves.toBe("expired");
    const login = cookies.session(ID);
    await cookies.dropCookie(ID, login);
    await expect(cookies.storeCookie(ID, login, "fresh")).resolves.toBe(true);
    await expect(cookies.getCookie(ID)).resolves.toBe("fresh");
    expect(mockKeychain.get(KEY)).toBe("fresh");
  });

  it("sends a login only once the discarded logins to its host have finished", async () => {
    const cookies = createCookieSessionCache();
    const old = heldLogin();
    const oldLogin = cookies.login(ID, cookies.session(ID), "http://qb.local:8080", old.send);
    await cookies.clear(ID);
    const send = jest.fn(async () => "new");
    // Another port of the same host: the platform jar ignores ports.
    const newLogin = cookies.login(ID, cookies.session(ID), "https://QB.local:9443/api", send);
    await flush();
    expect(send).not.toHaveBeenCalled();
    old.finish();
    await oldLogin;
    await expect(newLogin).resolves.toBe("new");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("waits for a discarded login to the same host from an instance a restore replaced", async () => {
    const cookies = createCookieSessionCache();
    const old = heldLogin();
    void cookies.login("qb-old", cookies.session("qb-old"), "http://qb.local", old.send);
    // The restore resets every previous id, including the ones it drops.
    await cookies.clear("qb-old");
    const send = jest.fn(async () => "new");
    const newLogin = cookies.login("qb-new", cookies.session("qb-new"), "http://qb.local", send);
    await flush();
    expect(send).not.toHaveBeenCalled();
    old.finish();
    await expect(newLogin).resolves.toBe("new");
  });

  it("does not hold a login for another instance's live login to the same host", async () => {
    const cookies = createCookieSessionCache();
    void cookies.login("qb-other", cookies.session("qb-other"), "http://qb.local", heldLogin().send);
    await expect(
      cookies.login(ID, cookies.session(ID), "http://qb.local:8081", async () => "new"),
    ).resolves.toBe("new");
  });

  it("does not hold a login to another host", async () => {
    const cookies = createCookieSessionCache();
    void cookies.login(ID, cookies.session(ID), "http://old.local", heldLogin().send);
    await cookies.clear(ID);
    await expect(
      cookies.login(ID, cookies.session(ID), "http://new.local", async () => "new"),
    ).resolves.toBe("new");
  });

  it("does not send a login for settings cleared while it waited", async () => {
    const cookies = createCookieSessionCache();
    const old = heldLogin();
    void cookies.login(ID, cookies.session(ID), "http://qb.local", old.send);
    await cookies.clear(ID);
    const send = jest.fn(async () => {});
    const waiting = cookies.login(ID, cookies.session(ID), "http://qb.local", send);
    await cookies.clear(ID);
    old.finish();
    await expect(waiting).rejects.toThrow("settings changed");
    expect(send).not.toHaveBeenCalled();
  });

  it("gives up on a discarded login that does not finish, until it does", async () => {
    jest.useFakeTimers();
    try {
      const cookies = createCookieSessionCache();
      const old = heldLogin();
      void cookies.login(ID, cookies.session(ID), "http://qb.local", old.send);
      await cookies.clear(ID);
      const send = jest.fn(async () => "new");
      const waiting = cookies.login(ID, cookies.session(ID), "http://qb.local", send);
      const gaveUp = expect(waiting).rejects.toThrow("has not finished yet");
      await jest.advanceTimersByTimeAsync(30_000);
      await gaveUp;
      expect(send).not.toHaveBeenCalled();
      old.finish();
      await jest.advanceTimersByTimeAsync(0);
      await expect(cookies.login(ID, cookies.session(ID), "http://qb.local", send)).resolves.toBe(
        "new",
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("leaves the new session's cookie alone when a request from before a clear is rejected", async () => {
    const cookies = createCookieSessionCache();
    const before = cookies.session(ID);
    await cookies.clear(ID);
    await cookies.storeCookie(ID, cookies.session(ID), "new-sid");
    await expect(cookies.dropCookie(ID, before)).rejects.toThrow("settings changed");
    await expect(cookies.getCookie(ID)).resolves.toBe("new-sid");
    expect(mockKeychain.get(KEY)).toBe("new-sid");
  });

  it("leaves instances this run never used alone on a restore", async () => {
    const cookies = createCookieSessionCache();
    cookies.clearIfUsed(ID);
    expect(deleteSecret).not.toHaveBeenCalled();
    const login = cookies.session(ID);
    cookies.clearIfUsed(ID);
    await expect(cookies.storeCookie(ID, login, "old-sid")).resolves.toBe(false);
    expect(deleteSecret).toHaveBeenCalledWith(KEY);
  });
});
