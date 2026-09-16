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
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
}));
jest.mock("@/services/backend-api", () => ({
  listConfigBackups: jest.fn(),
  WEB_SLOT_ID: "web",
}));
jest.mock("@/services/backend-backup", () => ({
  uploadConfigBackup: jest.fn(async () => "uploaded"),
}));

import { listConfigBackups } from "@/services/backend-api";
import { uploadConfigBackup } from "@/services/backend-backup";
import type { BackupMeta } from "@/services/backend-api";
import { isWebSlotPending, useBackendStore } from "@/store/backend-store";
import { STORAGE_KEYS } from "@/lib/constants";
import { getString } from "@/store/storage";
import { checkWebSlot, loadWebSlotStatus, markWebSlotApplied, resetWebSlotWatch } from "./web-slot-watch";

const listMock = listConfigBackups as jest.MockedFunction<typeof listConfigBackups>;
const uploadMock = uploadConfigBackup as jest.MockedFunction<typeof uploadConfigBackup>;

function slot(over: Partial<BackupMeta>): BackupMeta {
  return { deviceId: "web", platform: "web", appVersion: "web", paired: false, sizeBytes: 1, configVersion: 54, exportedAt: 1, updatedAt: 2, revision: 3, lastSeenAt: null, mine: false, ...over };
}

beforeEach(() => {
  listMock.mockReset();
  uploadMock.mockClear();
  resetWebSlotWatch();
  useBackendStore.setState({ hydrated: true, url: "http://b:4000", sharedSecret: "s", backupEnabled: false, webSlotRevision: null, webSlotAppliedRevision: null });
});

describe("checkWebSlot", () => {
  it("records the web slot revision and computes pending from revisions, not times", async () => {
    listMock.mockResolvedValue({ backups: [slot({ revision: 3 })] });
    await checkWebSlot();
    expect(useBackendStore.getState().webSlotRevision).toBe(3);
    expect(isWebSlotPending(useBackendStore.getState())).toBe(true);
    markWebSlotApplied(3);
    expect(isWebSlotPending(useBackendStore.getState())).toBe(false);
    expect(getString(STORAGE_KEYS.backendWebSlotAppliedRevision)).toBe("3");
    listMock.mockResolvedValue({ backups: [slot({ revision: 4, updatedAt: 1 })] });
    await checkWebSlot({ force: true });
    expect(isWebSlotPending(useBackendStore.getState())).toBe(true);
  });

  it("throttles repeated checks and skips when not paired", async () => {
    listMock.mockResolvedValue({ backups: [] });
    await checkWebSlot();
    await checkWebSlot();
    expect(listMock).toHaveBeenCalledTimes(1);
    await checkWebSlot({ force: true });
    expect(listMock).toHaveBeenCalledTimes(2);
    useBackendStore.setState({ url: null });
    await checkWebSlot({ force: true });
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("a successful empty list clears the revision; unsupported backends clear it; network errors keep it", async () => {
    useBackendStore.setState({ webSlotRevision: 5 });
    listMock.mockRejectedValueOnce(Object.assign(new Error("offline"), {}));
    await checkWebSlot({ force: true });
    expect(useBackendStore.getState().webSlotRevision).toBe(5);
    listMock.mockRejectedValueOnce(Object.assign(new Error("404"), { status: 404 }));
    await checkWebSlot({ force: true });
    expect(useBackendStore.getState().webSlotRevision).toBeNull();
    useBackendStore.setState({ webSlotRevision: 5 });
    listMock.mockResolvedValueOnce({ backups: [slot({ deviceId: "11111111-1111-4111-8111-111111111111", platform: "ios" })] });
    await checkWebSlot({ force: true });
    expect(useBackendStore.getState().webSlotRevision).toBeNull();
  });

  it("unpair clears both markers; loadWebSlotStatus restores the applied one", async () => {
    markWebSlotApplied(9);
    useBackendStore.setState({ webSlotRevision: 9 });
    await useBackendStore.getState().unpair();
    expect(useBackendStore.getState().webSlotRevision).toBeNull();
    expect(useBackendStore.getState().webSlotAppliedRevision).toBeNull();
    expect(getString(STORAGE_KEYS.backendWebSlotAppliedRevision)).toBeUndefined();
    markWebSlotApplied(12);
    useBackendStore.setState({ webSlotAppliedRevision: null });
    loadWebSlotStatus();
    expect(useBackendStore.getState().webSlotAppliedRevision).toBe(12);
  });
});

describe("own slot reconciliation", () => {
  it("forces a re-upload when backup is on but the authoritative list has no slot of ours", async () => {
    useBackendStore.setState({ backupEnabled: true });
    listMock.mockResolvedValue({ backups: [slot({ deviceId: "web" })] });
    await checkWebSlot({ force: true });
    expect(uploadMock).toHaveBeenCalledWith({ force: true });
    uploadMock.mockClear();
    listMock.mockResolvedValue({ backups: [slot({ deviceId: "11111111-1111-4111-8111-111111111111", platform: "ios", mine: true })] });
    await checkWebSlot({ force: true });
    expect(uploadMock).not.toHaveBeenCalled();
    useBackendStore.setState({ backupEnabled: false });
    listMock.mockResolvedValue({ backups: [] });
    await checkWebSlot({ force: true });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
