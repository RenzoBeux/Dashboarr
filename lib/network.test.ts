// Mock NetInfo (native) and the config store so importing network.ts pulls in
// no native modules and the store is fully controllable.
const mockFetch = jest.fn();
const mockRefresh = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    fetch: (...args: any[]) => mockFetch(...args),
    refresh: (...args: any[]) => mockRefresh(...args),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

// network.ts pulls in lib/wifi.ts (via detectWifiWithRefresh), which imports
// expo-location — mock it so the import is native-free and the permission
// prompt is controllable.
const mockReqPerm = jest.fn();
const mockGetPerm = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: (...a: any[]) => mockGetPerm(...a),
  requestForegroundPermissionsAsync: (...a: any[]) => mockReqPerm(...a),
}));

const mockGetState = jest.fn();
jest.mock("@/store/config-store", () => ({
  useConfigStore: { getState: () => mockGetState() },
}));

// Native VPN detection (lib/vpn.ts requires an Expo native module).
const mockDetectVpnActive = jest.fn();
jest.mock("@/lib/vpn", () => ({
  detectVpnActive: () => mockDetectVpnActive(),
}));

import { Platform } from "react-native";
import {
  isHomeNetwork,
  evaluateHomeNetwork,
  resolveEffectiveHomeNetworks,
  reevaluateHomeNetworkAfterImport,
} from "./network";

const wifi = (ssid: string | null, bssid: string | null = null) =>
  ({ type: "wifi", isConnected: true, details: { ssid, bssid } }) as any;
const vpn = () => ({ type: "vpn", isConnected: true, details: null }) as any;
const cellular = () => ({ type: "cellular", isConnected: true, details: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockDetectVpnActive.mockReturnValue(false);
  // Default: Location granted, so the #234 null-SSID refresh fallback is
  // allowed to run. The denied-path test overrides this.
  mockGetPerm.mockResolvedValue({ status: "granted", canAskAgain: false });
});

describe("isHomeNetwork", () => {
  const ssidOnly = [{ id: "1", ssid: "Home", bssid: "" }];
  const pinned = [{ id: "1", ssid: "Home", bssid: "aa:bb:cc" }];

  it("is false when no home networks are configured", () => {
    expect(isHomeNetwork(wifi("Home"), [])).toBe(false);
  });

  it("is false under a VPN (SSID masked) — the safe default that prevents the leak", () => {
    expect(isHomeNetwork(vpn(), ssidOnly)).toBe(false);
    expect(isHomeNetwork(cellular(), ssidOnly)).toBe(false);
  });

  it("is true on an SSID-only match", () => {
    expect(isHomeNetwork(wifi("Home"), ssidOnly)).toBe(true);
  });

  it("is false on a non-matching SSID", () => {
    expect(isHomeNetwork(wifi("Cafe"), ssidOnly)).toBe(false);
  });

  it("is true when a pinned BSSID matches (case-insensitive)", () => {
    expect(isHomeNetwork(wifi("Home", "AA:BB:CC"), pinned)).toBe(true);
  });

  it("is false when the SSID matches but a pinned BSSID does not (rogue-AP guard)", () => {
    expect(isHomeNetwork(wifi("Home", "ff:ff:ff"), pinned)).toBe(false);
  });

  it("fails closed (false) when a BSSID is pinned but the OS hides it", () => {
    expect(isHomeNetwork(wifi("Home", null), pinned)).toBe(false);
  });
});

describe("evaluateHomeNetwork", () => {
  function fakeStore(over: Record<string, any> = {}) {
    return {
      demoMode: false,
      autoSwitchNetwork: true,
      treatVpnAsHome: false,
      homeNetworks: [{ id: "1", ssid: "Home", bssid: "" }],
      // No dashboards by default → resolveEffectiveHomeNetworks falls back to
      // the global list, so the pre-v29 cases below keep exercising it.
      dashboards: [],
      activeDashboardId: "",
      setNetworkAwayFromHome: jest.fn(),
      setIsVpnActive: jest.fn(),
      ...over,
    };
  }

  it("sets away=false on a confirmed home network", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi("Home"));

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("sets away=true when not on a home network (VPN masks the SSID)", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(vpn());

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  // --- iOS null-SSID transient after cold start / resume (#234) ---
  //
  // NetInfo.fetch() can briefly report type "wifi" with a null SSID on iOS
  // before the OS surfaces it. Without a refresh+retry the evaluator would
  // conclude "away" and, since no NetInfo change event follows on an already-
  // connected device, stay stuck there until a restart. The steady-state path
  // now falls back to refreshWifiIdentity() (NetInfo.refresh) in that case.

  it("refreshes and clears away when the SSID surfaces after a null-SSID fetch", async () => {
    (Platform as any).OS = "ios";
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    // First fetch: on WiFi but SSID not surfaced yet (the transient).
    mockFetch.mockResolvedValueOnce(wifi(null));
    // refresh() surfaces it; the post-refresh re-fetch reads it.
    mockRefresh.mockResolvedValue(wifi("Home"));
    mockFetch.mockResolvedValueOnce(wifi("Home"));

    await evaluateHomeNetwork();

    expect(mockRefresh).toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("refreshes on the null-SSID transient but stays away when the surfaced SSID isn't home", async () => {
    (Platform as any).OS = "ios";
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValueOnce(wifi(null));
    mockRefresh.mockResolvedValue(wifi("Cafe"));
    mockFetch.mockResolvedValueOnce(wifi("Cafe"));

    await evaluateHomeNetwork();

    expect(mockRefresh).toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  it("does NOT refresh when the first fetch already has the SSID (fast path, no wasted work)", async () => {
    (Platform as any).OS = "ios";
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi("Home"));

    await evaluateHomeNetwork();

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("does NOT refresh on a genuinely-away network (cellular resolves on the first fetch)", async () => {
    (Platform as any).OS = "ios";
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(cellular());

    await evaluateHomeNetwork();

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  it("falls back to away (never throws) when the refresh path errors", async () => {
    (Platform as any).OS = "ios";
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi(null)); // stuck on the null-SSID transient
    mockRefresh.mockRejectedValue(new Error("native refresh blew up"));

    // Must resolve (not reject) and conclude away — the pre-retry behavior.
    await expect(evaluateHomeNetwork()).resolves.toBeUndefined();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  it("no-ops (no fetch, no write) when auto-switch is off", async () => {
    const store = fakeStore({ autoSwitchNetwork: false });
    mockGetState.mockReturnValue(store);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  it("no-ops when no home networks are configured (flag stays at its safe default)", async () => {
    const store = fakeStore({ homeNetworks: [] });
    mockGetState.mockReturnValue(store);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  it("no-ops in demo mode", async () => {
    const store = fakeStore({ demoMode: true });
    mockGetState.mockReturnValue(store);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  // --- v29: per-dashboard selection (#148) ---

  // Two global networks; dashboards select a subset of them by id.
  const twoNetworks = [
    { id: "home", ssid: "Home", bssid: "" },
    { id: "cabin", ssid: "Cabin", bssid: "" },
  ];
  const dashWithIds = (homeNetworkIds?: any) => ({
    id: "d1",
    name: "Cabin",
    widgets: [],
    ...(homeNetworkIds !== undefined ? { homeNetworkIds } : {}),
  });

  it("uses only the active dashboard's selected networks", async () => {
    const store = fakeStore({
      homeNetworks: twoNetworks,
      dashboards: [dashWithIds(["cabin"])],
      activeDashboardId: "d1",
    });
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi("Cabin"));

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("treats a deselected network as away even though it's in the global list", async () => {
    const store = fakeStore({
      homeNetworks: twoNetworks,
      dashboards: [dashWithIds(["cabin"])], // Home not selected
      activeDashboardId: "d1",
    });
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi("Home"));

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  it("no-ops when the active dashboard's selection is empty (always away)", async () => {
    const store = fakeStore({
      homeNetworks: twoNetworks,
      dashboards: [dashWithIds([])],
      activeDashboardId: "d1",
    });
    mockGetState.mockReturnValue(store);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  it("uses all networks when the active dashboard has no selection", async () => {
    const store = fakeStore({
      homeNetworks: twoNetworks,
      dashboards: [dashWithIds(undefined)],
      activeDashboardId: "d1",
    });
    mockGetState.mockReturnValue(store);
    mockFetch.mockResolvedValue(wifi("Home"));

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  // --- v32: opt-in "treat VPN as home" (#185) ---

  it("always refreshes the isVpnActive flag, even when auto-switch is off", async () => {
    const store = fakeStore({ autoSwitchNetwork: false });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(true);

    await evaluateHomeNetwork();

    expect(store.setIsVpnActive).toHaveBeenCalledWith(true);
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  it("sets away=false when treatVpnAsHome is on and a VPN is up (no SSID needed)", async () => {
    const store = fakeStore({ treatVpnAsHome: true });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(true);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("falls back to the SSID match when treatVpnAsHome is on but no VPN is up", async () => {
    const store = fakeStore({ treatVpnAsHome: true });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(false);
    mockFetch.mockResolvedValue(wifi("Home"));

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("counts a VPN as home even with zero configured home networks", async () => {
    const store = fakeStore({ treatVpnAsHome: true, homeNetworks: [] });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(true);

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });

  it("actively flips back to away when the VPN drops with zero configured home networks", async () => {
    const store = fakeStore({ treatVpnAsHome: true, homeNetworks: [] });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(false);

    await evaluateHomeNetwork();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  it("does not treat a VPN as home without the opt-in (the pinned safe default)", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(true);
    mockFetch.mockResolvedValue(vpn());

    await evaluateHomeNetwork();

    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
  });

  // --- re-runnable in-flight gate (#185 flakiness) ---

  it("re-runs with a fresh store snapshot when called again while in-flight", async () => {
    // First pass: opt-in off, so it reaches the awaited NetInfo.fetch and parks
    // there (held open by a deferred promise) — the gate is now in-flight.
    const before = fakeStore();
    mockGetState.mockReturnValue(before);
    let resolveFetch!: (v: any) => void;
    mockFetch.mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );

    const inFlight = evaluateHomeNetwork();

    // Mid-flight, the user enables "treat VPN as home" and a VPN is up. A naive
    // gate would DROP this call; the re-runnable gate must queue it.
    const after = fakeStore({ treatVpnAsHome: true });
    mockGetState.mockReturnValue(after);
    mockDetectVpnActive.mockReturnValue(true);
    await evaluateHomeNetwork(); // queued, returns immediately

    resolveFetch(wifi("Cafe")); // first pass settles: not home → away=true
    await inFlight;

    // The queued re-run read the FRESH snapshot (opt-in on + VPN) → away=false.
    expect(before.setNetworkAwayFromHome).toHaveBeenCalledWith(true);
    expect(after.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });
});

describe("reevaluateHomeNetworkAfterImport", () => {
  function fakeStore(over: Record<string, any> = {}) {
    return {
      demoMode: false,
      autoSwitchNetwork: true,
      treatVpnAsHome: false,
      homeNetworks: [{ id: "1", ssid: "Home", bssid: "" }],
      dashboards: [],
      activeDashboardId: "",
      setNetworkAwayFromHome: jest.fn(),
      setIsVpnActive: jest.fn(),
      ...over,
    };
  }

  beforeEach(() => {
    // detectWifiWithRefresh only prompts/refreshes on a native platform.
    (Platform as any).OS = "ios";
  });

  it("prompts for Location, warms the SSID, then clears away on the home WiFi", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockReqPerm.mockResolvedValue({ status: "granted" });
    mockRefresh.mockResolvedValue(wifi("Home")); // surfaces on first refresh
    mockFetch.mockResolvedValue(wifi("Home"));

    await reevaluateHomeNetworkAfterImport();

    expect(mockReqPerm).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenLastCalledWith(false);
  });

  it("stays away when the confirmed WiFi isn't a home network", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockReqPerm.mockResolvedValue({ status: "granted" });
    mockRefresh.mockResolvedValue(wifi("Cafe"));
    mockFetch.mockResolvedValue(wifi("Cafe"));

    await reevaluateHomeNetworkAfterImport();

    expect(store.setNetworkAwayFromHome).toHaveBeenLastCalledWith(true);
  });

  it("stays away (honest result) when Location is denied — never refreshes", async () => {
    const store = fakeStore();
    mockGetState.mockReturnValue(store);
    mockReqPerm.mockResolvedValue({ status: "denied" });
    // Non-prompting status read (used by the #234 refresh guard) also denied,
    // so the null-SSID fetch below must NOT trigger a pointless refresh loop.
    mockGetPerm.mockResolvedValue({ status: "denied", canAskAgain: true });
    mockFetch.mockResolvedValue(wifi(null));

    await reevaluateHomeNetworkAfterImport();

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenLastCalledWith(true);
  });

  it("is a full no-op with no home networks and no treatVpnAsHome (no prompt)", async () => {
    const store = fakeStore({ homeNetworks: [] });
    mockGetState.mockReturnValue(store);

    await reevaluateHomeNetworkAfterImport();

    expect(mockReqPerm).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).not.toHaveBeenCalled();
  });

  it("clears away via the VPN check with zero networks — without a permission prompt", async () => {
    const store = fakeStore({ homeNetworks: [], treatVpnAsHome: true });
    mockGetState.mockReturnValue(store);
    mockDetectVpnActive.mockReturnValue(true);

    await reevaluateHomeNetworkAfterImport();

    expect(mockReqPerm).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(store.setNetworkAwayFromHome).toHaveBeenCalledWith(false);
  });
});

describe("resolveEffectiveHomeNetworks", () => {
  const global = [
    { id: "home", ssid: "Home", bssid: "" },
    { id: "cabin", ssid: "Cabin", bssid: "" },
  ];
  const dash = (homeNetworkIds?: any) =>
    ({
      id: "d1",
      name: "Cabin",
      widgets: [],
      ...(homeNetworkIds !== undefined ? { homeNetworkIds } : {}),
    }) as any;

  it("returns the whole global list when the dashboard uses all", () => {
    expect(resolveEffectiveHomeNetworks([dash(undefined)], "d1", global)).toBe(
      global,
    );
  });

  it("returns only the selected subset, in global order", () => {
    expect(
      resolveEffectiveHomeNetworks([dash(["cabin"])], "d1", global),
    ).toEqual([{ id: "cabin", ssid: "Cabin", bssid: "" }]);
  });

  it("ignores stale ids that no longer match a live network", () => {
    expect(
      resolveEffectiveHomeNetworks([dash(["cabin", "gone"])], "d1", global),
    ).toEqual([{ id: "cabin", ssid: "Cabin", bssid: "" }]);
  });

  it("returns an empty list for an explicit empty selection", () => {
    expect(resolveEffectiveHomeNetworks([dash([])], "d1", global)).toEqual([]);
  });

  it("falls back to the global list when there are no dashboards", () => {
    expect(resolveEffectiveHomeNetworks([], "d1", global)).toBe(global);
  });

  it("falls back to the first dashboard when the active id doesn't match", () => {
    expect(
      resolveEffectiveHomeNetworks([dash(["cabin"])], "missing", global),
    ).toEqual([{ id: "cabin", ssid: "Cabin", bssid: "" }]);
  });
});
