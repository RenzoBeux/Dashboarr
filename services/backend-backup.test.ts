// Storage + native shims, same reasoning as store/config-store.test.ts.
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
jest.mock("expo-crypto", () => ({
  getRandomBytes: (n: number) => {
    const out = new Uint8Array(n);
    require("crypto").randomFillSync(out);
    return out;
  },
}));
jest.mock("@/lib/app-version", () => ({ NATIVE_VERSION: "1.19.0-test" }));
jest.mock("@/services/backend-api", () => ({
  putConfigBackup: jest.fn(),
}));

import { putConfigBackup } from "@/services/backend-api";
import { useBackendStore } from "@/store/backend-store";
import { useConfigStore } from "@/store/config-store";
import { STORAGE_KEYS } from "@/lib/constants";
import { deleteKey, getString } from "@/store/storage";
import { decryptEnvelope, deriveKeyHex, generateSaltHex } from "@/lib/config-crypto";
import { buildBackupPlaintext, uploadConfigBackup } from "./backend-backup";

const putMock = putConfigBackup as jest.MockedFunction<typeof putConfigBackup>;
const PASSPHRASE = "correct-horse-battery-staple";
const DASHBOARD = { id: "dash-1", name: "Default", widgets: [] };

let saltHex: string;
let keyHex: string;

beforeAll(async () => {
  saltHex = generateSaltHex();
  keyHex = await deriveKeyHex(PASSPHRASE, saltHex, 10_000);
});

beforeEach(() => {
  putMock.mockReset();
  putMock.mockResolvedValue({ ok: true, updatedAt: 1_700_000_000_000, sizeBytes: 1234 });
  deleteKey(STORAGE_KEYS.backendBackupLastHash);
  deleteKey(STORAGE_KEYS.backendBackupLastAt);
  useConfigStore.setState({ hydrated: true, demoMode: false, dashboards: [DASHBOARD] as never, activeDashboardId: "dash-1" });
  useBackendStore.setState({
    hydrated: true,
    url: "http://backend.local:4000",
    sharedSecret: "s".repeat(64),
    deviceId: "dev-1",
    backupEnabled: true,
    backupSaltHex: saltHex,
    backupKeyHex: keyHex,
    backupKeyIterations: 10_000,
    lastBackupAt: null,
    lastBackupError: null,
    backupInFlight: false,
  });
});

describe("buildBackupPlaintext", () => {
  it("strips the backend pairing and hashes everything but exportedAt", () => {
    const a = buildBackupPlaintext();
    expect(JSON.parse(a.json)).not.toHaveProperty("backend");
    expect(a.json.includes("s".repeat(64))).toBe(false);
    expect(a.configVersion).toBeGreaterThan(0);
    expect(typeof a.exportedAt).toBe("number");
    const b = buildBackupPlaintext();
    expect(b.hash).toBe(a.hash);
    useConfigStore.setState({ hapticsEnabled: !useConfigStore.getState().hapticsEnabled });
    expect(buildBackupPlaintext().hash).not.toBe(a.hash);
  });
});

describe("uploadConfigBackup", () => {
  it("uploads an envelope the passphrase can open and records the result", async () => {
    await expect(uploadConfigBackup()).resolves.toBe("uploaded");
    expect(putMock).toHaveBeenCalledTimes(1);
    const body = putMock.mock.calls[0]![0];
    expect(body.appVersion).toBe("1.19.0-test");
    const plain = JSON.parse(await decryptEnvelope(body.envelope, PASSPHRASE));
    expect(plain).not.toHaveProperty("backend");
    expect(plain.version).toBe(body.configVersion);
    expect(getString(STORAGE_KEYS.backendBackupLastHash)).toBe(buildBackupPlaintext().hash);
    expect(getString(STORAGE_KEYS.backendBackupLastAt)).toBe("1700000000000");
    expect(useBackendStore.getState().lastBackupAt).toBe(1_700_000_000_000);
    expect(useBackendStore.getState().lastBackupError).toBeNull();
    expect(useBackendStore.getState().backupInFlight).toBe(false);
  });

  it("skips an unchanged payload unless forced", async () => {
    await uploadConfigBackup();
    await expect(uploadConfigBackup()).resolves.toBe("skipped");
    expect(putMock).toHaveBeenCalledTimes(1);
    await expect(uploadConfigBackup({ force: true })).resolves.toBe("uploaded");
    expect(putMock).toHaveBeenCalledTimes(2);
  });

  it("skips in demo mode and when the feature is off", async () => {
    useConfigStore.setState({ demoMode: true });
    await expect(uploadConfigBackup({ force: true })).resolves.toBe("skipped");
    useConfigStore.setState({ demoMode: false });
    useBackendStore.setState({ backupEnabled: false });
    await expect(uploadConfigBackup({ force: true })).resolves.toBe("skipped");
    expect(putMock).not.toHaveBeenCalled();
  });

  it("maps a 413 to a friendly error and clears the hash so the next tick retries", async () => {
    await uploadConfigBackup();
    const err = Object.assign(new Error("Backend /config/backup HTTP 413"), { status: 413 });
    putMock.mockRejectedValueOnce(err);
    useConfigStore.setState({ hapticsEnabled: !useConfigStore.getState().hapticsEnabled });
    await expect(uploadConfigBackup()).rejects.toThrow(/larger than the backend accepts/);
    expect(useBackendStore.getState().lastBackupError).toMatch(/4 MB/);
    expect(getString(STORAGE_KEYS.backendBackupLastHash)).toBeUndefined();
    await expect(uploadConfigBackup()).resolves.toBe("uploaded");
  });

  it("coalesces overlapping calls into one more run", async () => {
    let release!: () => void;
    putMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, updatedAt: 1, sizeBytes: 1 });
        }),
    );
    const first = uploadConfigBackup({ force: true });
    const second = uploadConfigBackup({ force: true });
    const third = uploadConfigBackup();
    expect(second).toBe(first);
    expect(third).toBe(first);
    release();
    await first;
    // One in-flight PUT plus exactly one forced re-run for the two queued calls.
    expect(putMock).toHaveBeenCalledTimes(2);
  });
});
