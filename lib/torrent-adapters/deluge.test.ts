// Mock the storage layer before importing anything that pulls in the config
// store (the adapter chain reaches it through hooks/services).
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
// The adapter reaches the speed-limits sheet through its SpeedLimitsControl,
// and that pulls in react-native-keyboard-controller, whose module body binds
// to a native event emitter that doesn't exist under jest. Nothing here renders
// a component, so a stub is enough to let the import resolve.
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: "KeyboardAwareScrollView",
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  KeyboardProvider: "KeyboardProvider",
}));

import { delugeTorrentAdapter } from "@/lib/torrent-adapters/deluge";

// The dashboard Downloads widget aggregates every configured Deluge instance
// without changing the active one, so a detail route carrying only the hash
// lands on whichever instance happens to be active: a torrent from a second
// server reads as "not found", and when the same hash exists on both, pause and
// delete hit the wrong server.
describe("delugeTorrentAdapter.detailRoute", () => {
  it("pins the source instance when one is given", () => {
    expect(delugeTorrentAdapter.detailRoute("abc123", "11111111-2222-3333-4444-555555555555")).toBe(
      "/deluge/abc123?instanceId=11111111-2222-3333-4444-555555555555",
    );
  });

  it("falls back to the active instance when none is given", () => {
    // The Downloads tab already follows the active instance, so an unpinned
    // route stays valid there.
    expect(delugeTorrentAdapter.detailRoute("abc123")).toBe("/deluge/abc123");
    expect(delugeTorrentAdapter.detailRoute("abc123", null)).toBe("/deluge/abc123");
    expect(delugeTorrentAdapter.detailRoute("abc123", "")).toBe("/deluge/abc123");
  });

  it("escapes the instance id rather than splicing it into the query raw", () => {
    expect(delugeTorrentAdapter.detailRoute("abc123", "a b&c=d")).toBe(
      "/deluge/abc123?instanceId=a%20b%26c%3Dd",
    );
  });

  it("still routes at the path the detail screen is registered under", () => {
    // app/deluge/[hash].tsx — a mismatch here is a dead drill-in, and nothing
    // else in the app links these two together.
    expect(delugeTorrentAdapter.detailRoute("abc123")).toMatch(/^\/deluge\/abc123/);
  });
});
