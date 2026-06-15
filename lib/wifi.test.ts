// expo-location and NetInfo are native; mock them so importing wifi.ts (which
// calls NetInfo.configure at module load) pulls in nothing native.
const mockGetPerm = jest.fn();
const mockReqPerm = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: (...a: any[]) => mockGetPerm(...a),
  requestForegroundPermissionsAsync: (...a: any[]) => mockReqPerm(...a),
}));
const mockRefresh = jest.fn();
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    fetch: jest.fn(),
    refresh: (...a: any[]) => mockRefresh(...a),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

import { Platform } from "react-native";
import {
  ensureWifiPermission,
  getWifiPermissionStatus,
  refreshWifiIdentity,
  detectWifiWithRefresh,
} from "./wifi";

// Never wait real time in the refresh+retry loop.
const noSleep = async () => {};
const wifiState = (ssid: string | null, bssid: string | null = null) =>
  ({ type: "wifi", details: { ssid, bssid } }) as any;
const cellularState = () => ({ type: "cellular", details: {} }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as any).OS = "ios";
});

describe("ensureWifiPermission", () => {
  it("returns granted without prompting when already granted", async () => {
    mockGetPerm.mockResolvedValue({ status: "granted", canAskAgain: false });

    const result = await ensureWifiPermission();

    expect(result).toEqual({ granted: true, canAskAgain: false });
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it("prompts once when undetermined and the OS still allows it", async () => {
    mockGetPerm.mockResolvedValue({ status: "undetermined", canAskAgain: true });
    mockReqPerm.mockResolvedValue({ status: "granted", canAskAgain: false });

    const result = await ensureWifiPermission();

    expect(mockReqPerm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ granted: true, canAskAgain: false });
  });

  it("does NOT prompt when hard-denied (canAskAgain false) — avoids a silent no-op loop", async () => {
    mockGetPerm.mockResolvedValue({ status: "denied", canAskAgain: false });

    const result = await ensureWifiPermission();

    expect(mockReqPerm).not.toHaveBeenCalled();
    expect(result).toEqual({ granted: false, canAskAgain: false });
  });

  it("reports still-denied after a declined prompt", async () => {
    mockGetPerm.mockResolvedValue({ status: "undetermined", canAskAgain: true });
    mockReqPerm.mockResolvedValue({ status: "denied", canAskAgain: false });

    const result = await ensureWifiPermission();

    expect(result).toEqual({ granted: false, canAskAgain: false });
  });

  it("treats non-native platforms as granted (no Location needed)", async () => {
    (Platform as any).OS = "web";

    const result = await ensureWifiPermission();

    expect(mockGetPerm).not.toHaveBeenCalled();
    expect(result).toEqual({ granted: true, canAskAgain: false });
  });
});

describe("getWifiPermissionStatus", () => {
  it("reports the granted state without ever prompting", async () => {
    mockGetPerm.mockResolvedValue({ status: "granted", canAskAgain: false });

    const result = await getWifiPermissionStatus();

    expect(result.granted).toBe(true);
    expect(mockReqPerm).not.toHaveBeenCalled();
  });

  it("reports a denied state with canAskAgain so the UI can offer Settings", async () => {
    mockGetPerm.mockResolvedValue({ status: "denied", canAskAgain: false });

    const result = await getWifiPermissionStatus();

    expect(result).toEqual({ granted: false, canAskAgain: false });
  });
});

describe("refreshWifiIdentity", () => {
  it("returns the identity on the first refresh, lowercasing the BSSID", async () => {
    mockRefresh.mockResolvedValueOnce(wifiState("Home", "AA:BB:CC"));

    const result = await refreshWifiIdentity(noSleep);

    expect(result).toEqual({ ssid: "Home", bssid: "aa:bb:cc" });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("retries until the SSID surfaces — the post-grant null-SSID bug (#168)", async () => {
    // iOS: first read after the permission grant has no SSID yet; the next does.
    mockRefresh
      .mockResolvedValueOnce(wifiState(null))
      .mockResolvedValueOnce(wifiState("Home"));

    const result = await refreshWifiIdentity(noSleep);

    expect(result).toEqual({ ssid: "Home", bssid: "" });
    expect(mockRefresh).toHaveBeenCalledTimes(2);
  });

  it("gives up (null) after the retry budget when the SSID never surfaces", async () => {
    mockRefresh.mockResolvedValue(wifiState(null));

    const result = await refreshWifiIdentity(noSleep);

    expect(result).toBeNull();
    expect(mockRefresh).toHaveBeenCalledTimes(4); // WIFI_REFRESH_ATTEMPTS
  });

  it("bails immediately when not on WiFi (no point retrying)", async () => {
    mockRefresh.mockResolvedValue(cellularState());

    const result = await refreshWifiIdentity(noSleep);

    expect(result).toBeNull();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("returns null without refreshing on non-native platforms", async () => {
    (Platform as any).OS = "web";

    const result = await refreshWifiIdentity(noSleep);

    expect(result).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("detectWifiWithRefresh", () => {
  it("prompts for Location, then warms until the SSID surfaces", async () => {
    mockReqPerm.mockResolvedValue({ status: "granted" });
    mockRefresh
      .mockResolvedValueOnce(wifiState(null))
      .mockResolvedValueOnce(wifiState("Home", "aa:bb"));

    const result = await detectWifiWithRefresh(noSleep);

    expect(mockReqPerm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ssid: "Home", bssid: "aa:bb" });
  });

  it("returns null without refreshing when Location is denied", async () => {
    mockReqPerm.mockResolvedValue({ status: "denied" });

    const result = await detectWifiWithRefresh(noSleep);

    expect(result).toBeNull();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
