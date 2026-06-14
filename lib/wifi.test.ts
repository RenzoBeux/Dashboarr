// expo-location and NetInfo are native; mock them so importing wifi.ts (which
// calls NetInfo.configure at module load) pulls in nothing native.
const mockGetPerm = jest.fn();
const mockReqPerm = jest.fn();
jest.mock("expo-location", () => ({
  getForegroundPermissionsAsync: (...a: any[]) => mockGetPerm(...a),
  requestForegroundPermissionsAsync: (...a: any[]) => mockReqPerm(...a),
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    fetch: jest.fn(),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

import { Platform } from "react-native";
import { ensureWifiPermission, getWifiPermissionStatus } from "./wifi";

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
