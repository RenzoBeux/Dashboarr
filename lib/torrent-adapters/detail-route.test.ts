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
// The adapters reach their speed-limits sheets through SpeedLimitsControl, and
// those pull in react-native-keyboard-controller, whose module body binds to a
// native event emitter that doesn't exist under jest. Nothing here renders a
// component, so a stub is enough to let the import resolve.
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardAwareScrollView: "KeyboardAwareScrollView",
  useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  KeyboardProvider: "KeyboardProvider",
}));

import { delugeTorrentAdapter } from "@/lib/torrent-adapters/deluge";
import { qbittorrentTorrentAdapter } from "@/lib/torrent-adapters/qbittorrent";
import { rtorrentTorrentAdapter } from "@/lib/torrent-adapters/rtorrent";
import { transmissionTorrentAdapter } from "@/lib/torrent-adapters/transmission";

// The dashboard Downloads widget aggregates every configured instance of a kind
// without changing the active one, so a detail route carrying only the hash
// lands on whichever instance happens to be active: a torrent from a second
// server reads as "not found", and when the same hash exists on both, pause and
// delete hit the wrong server.
const PINNING = [
  { name: "qbittorrent", adapter: qbittorrentTorrentAdapter, base: "/torrent" },
  { name: "transmission", adapter: transmissionTorrentAdapter, base: "/transmission" },
  { name: "deluge", adapter: delugeTorrentAdapter, base: "/deluge" },
] as const;

const INSTANCE = "11111111-2222-3333-4444-555555555555";

describe.each(PINNING)("$name detailRoute", ({ adapter, base }) => {
  it("pins the source instance when one is given", () => {
    expect(adapter.detailRoute("abc123", INSTANCE)).toBe(
      `${base}/abc123?instanceId=${INSTANCE}`,
    );
  });

  it("falls back to the active instance when none is given", () => {
    // The Downloads tab already follows the active instance, so an unpinned
    // route stays valid there.
    expect(adapter.detailRoute("abc123")).toBe(`${base}/abc123`);
    expect(adapter.detailRoute("abc123", null)).toBe(`${base}/abc123`);
    expect(adapter.detailRoute("abc123", "")).toBe(`${base}/abc123`);
  });

  it("escapes the instance id rather than splicing it into the query raw", () => {
    expect(adapter.detailRoute("abc123", "a b&c=d")).toBe(
      `${base}/abc123?instanceId=a%20b%26c%3Dd`,
    );
  });

  it("routes at the path its detail screen is registered under", () => {
    // app/torrent/[hash].tsx, app/transmission/[hash].tsx, app/deluge/[hash].tsx
    // — a mismatch is a dead drill-in, and nothing else links these together.
    expect(adapter.detailRoute("abc123")).toMatch(new RegExp(`^${base}/abc123`));
  });
});

describe("rtorrent detailRoute", () => {
  it("stays unpinned — rtorrent rows never drill in", () => {
    // capabilities.perTorrentFiles is false, so this is never called. It points
    // at the qBittorrent screen, so pinning an rtorrent instance id onto it
    // would be actively wrong if it ever were.
    expect(rtorrentTorrentAdapter.capabilities.perTorrentFiles).toBe(false);
    expect(rtorrentTorrentAdapter.detailRoute("abc123", INSTANCE)).toBe("/torrent/abc123");
  });
});
