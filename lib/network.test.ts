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

import { isHomeNetwork, evaluateHomeNetwork } from "./network";

const wifi = (ssid: string | null, bssid: string | null = null) =>
  ({ type: "wifi", isConnected: true, details: { ssid, bssid } }) as any;
const vpn = () => ({ type: "vpn", isConnected: true, details: null }) as any;
const cellular = () => ({ type: "cellular", isConnected: true, details: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
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
      homeNetworks: [{ id: "1", ssid: "Home", bssid: "" }],
      setNetworkAwayFromHome: jest.fn(),
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
});
