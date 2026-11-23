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
    await cookies.dropCookie(ID);
    await expect(cookies.storeCookie(ID, login, "fresh")).resolves.toBe(true);
    await expect(cookies.getCookie(ID)).resolves.toBe("fresh");
    expect(mockKeychain.get(KEY)).toBe("fresh");
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
