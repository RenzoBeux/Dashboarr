// Mock NetInfo (native) and the config store so importing network.ts pulls in
// no native modules and the store is fully controllable.
const mockFetch = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    fetch: (...args: any[]) => mockFetch(...args),
    addEventListener: jest.fn(() => jest.fn()),
  },
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

import {
  isHomeNetwork,
  evaluateHomeNetwork,
  resolveEffectiveHomeNetworks,
} from "./network";

const wifi = (ssid: string | null, bssid: string | null = null) =>
  ({ type: "wifi", isConnected: true, details: { ssid, bssid } }) as any;
const vpn = () => ({ type: "vpn", isConnected: true, details: null }) as any;
const cellular = () => ({ type: "cellular", isConnected: true, details: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockDetectVpnActive.mockReturnValue(false);
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
