// backend-error.ts reuses isAbortError from http-client, which transitively
// imports the config store and so touches AsyncStorage/SecureStore at module
// load — native modules absent in the jest-expo node env. Shim them; these
// tests only exercise the pure describeBackendTransportError.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
    getAllKeys: jest.fn(async () => []),
    multiGet: jest.fn(async () => []),
    multiSet: jest.fn(async () => {}),
    multiRemove: jest.fn(async () => {}),
  },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { describeBackendTransportError } from "./backend-error";

const URL_UNDER_TEST = "https://dashboarr.ember.ops/pair/claim";

/** RN's fetch rejects with a plain Error named "AbortError" (see isAbortError). */
function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

describe("describeBackendTransportError", () => {
  it("rewrites RN's bare TypeError to name the host and the cert toggle", () => {
    const original = new TypeError("Network request failed");
    const result = describeBackendTransportError(original, URL_UNDER_TEST) as Error;

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("dashboarr.ember.ops");
    expect(result.message).toContain("Allow invalid certificates");
    expect(result.cause).toBe(original);
  });

  // pairClaim only advances to its next scheme candidate when `.status` is
  // absent, so a wrapped connection error must not acquire one.
  it("leaves the wrapped connection error without a .status", () => {
    const result = describeBackendTransportError(
      new TypeError("Network request failed"),
      URL_UNDER_TEST,
    );
    expect((result as { status?: number }).status).toBeUndefined();
  });

  it("rewrites an abort into a timeout message, still without a .status", () => {
    const original = abortError();
    const result = describeBackendTransportError(original, URL_UNDER_TEST) as Error;

    expect(result.message).toContain("didn't respond");
    expect(result.cause).toBe(original);
    expect((result as { status?: number }).status).toBeUndefined();
  });

  // The load-bearing invariant: an HTTP answer is a real result, never a
  // wrong-scheme guess, so it must survive untouched by reference.
  it("returns an error carrying a numeric .status identically", () => {
    const err = Object.assign(new Error("Backend /pair/claim HTTP 401"), { status: 401 });
    expect(describeBackendTransportError(err, URL_UNDER_TEST)).toBe(err);
  });

  it("returns a status-carrying TypeError untouched too", () => {
    const err = Object.assign(new TypeError("weird"), { status: 500 });
    expect(describeBackendTransportError(err, URL_UNDER_TEST)).toBe(err);
  });

  it("falls back to a generic target when the URL is unparseable", () => {
    const result = describeBackendTransportError(
      new TypeError("Network request failed"),
      "not a url",
    ) as Error;
    expect(result.message).toContain("the backend");
    expect(result.message).toContain("Allow invalid certificates");
  });

  // Error toasts clamp to 4 lines (LINE_CLAMP in components/ui/toast.tsx). If a
  // rewrite grows past that, the half telling the user what to do is the half
  // that gets cut off — which is the whole point of the message.
  it("keeps rewritten messages short enough to survive the toast clamp", () => {
    const messages = [
      describeBackendTransportError(new TypeError("Network request failed"), URL_UNDER_TEST),
      describeBackendTransportError(abortError(), URL_UNDER_TEST),
    ] as Error[];

    for (const err of messages) {
      expect(err.message.length).toBeLessThanOrEqual(160);
    }
  });

  it("passes non-Error throw values through unchanged", () => {
    expect(describeBackendTransportError("boom", URL_UNDER_TEST)).toBe("boom");
    expect(describeBackendTransportError(undefined, URL_UNDER_TEST)).toBeUndefined();
  });

  it("passes an unrecognized Error through unchanged", () => {
    const err = new Error("Backend not paired");
    expect(describeBackendTransportError(err, URL_UNDER_TEST)).toBe(err);
  });
});
