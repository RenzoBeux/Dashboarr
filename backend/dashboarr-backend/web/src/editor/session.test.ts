import { describe, expect, it } from "vitest";
import { encryptJsonString } from "@/lib/config-crypto-core";
import { blankExportPayload } from "@/lib/config-defaults";
import { validateExportPayload } from "@/store/config-schema";
import { CURRENT_CONFIG_VERSION, migrateConfig } from "@/store/config-migrations";
import type { OverviewBackup } from "../../../src/ui/overview-types";
import type { WebBackupPutBody } from "../api";
import { decryptEnvelope } from "../lib/envelope";
import { openBlank, openFromSlot, saveSession, UnsupportedVersionError, WrongPassphraseError, type EditorApi } from "./session";
import { addInstance, updateInstance, updateSecrets } from "./reducer";

const PASSPHRASE = "correct-horse-battery-staple";
const rng = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function slot(over: Partial<OverviewBackup> = {}): OverviewBackup {
  return { deviceId: "11111111-1111-4111-8111-111111111111", platform: "ios", appVersion: "1.19.0", paired: true, sizeBytes: 1, configVersion: CURRENT_CONFIG_VERSION, exportedAt: 1, updatedAt: 2, revision: 4, ...over };
}

function fakeApi(stored: Record<string, { envelope: Awaited<ReturnType<typeof encryptJsonString>>; revision: number }>) {
  const puts: WebBackupPutBody[] = [];
  const api: EditorApi = {
    async getEnvelope(id) {
      const s = stored[id];
      if (!s) throw new Error("not found");
      return s;
    },
    async putWeb(body) {
      puts.push(body);
      return { ok: true, updatedAt: 99, sizeBytes: 1, revision: (body.expectedRevision ?? 0) + 1 };
    },
  };
  return { api, puts };
}

describe("editor session", () => {
  it("opens a slot, migrates an older payload, edits, saves, and the passphrase re-opens the result", async () => {
    // A v53-style payload: no `maintainerr` service key yet.
    const older = blankExportPayload() as unknown as Record<string, unknown>;
    older.version = 53;
    delete (older.services as Record<string, unknown>).maintainerr;
    const env = await encryptJsonString(JSON.stringify(older), PASSPHRASE, rng);
    const { api, puts } = fakeApi({ [slot().deviceId]: { envelope: env, revision: 4 } });

    const session = await openFromSlot(api, slot({ configVersion: 53 }), PASSPHRASE, null);
    expect(session.payload.version).toBe(CURRENT_CONFIG_VERSION);
    expect(Array.isArray(session.payload.services.maintainerr)).toBe(true);
    expect(session.baseRevision).toBeNull();

    const { payload, id } = addInstance(session.payload, "sonarr");
    const edited = updateSecrets(updateInstance(payload, "sonarr", id, { enabled: true, localUrl: "http://s:8989" }), id, { apiKey: "SONARR-KEY" });
    const result = await saveSession(api, session, edited, null);
    expect(result.revision).toBe(1);
    expect(puts[0]!.expectedRevision).toBeNull();
    expect(puts[0]!.configVersion).toBe(CURRENT_CONFIG_VERSION);

    const reopened = JSON.parse(await decryptEnvelope(puts[0]!.envelope, PASSPHRASE));
    const validated = validateExportPayload(migrateConfig(reopened));
    expect(validated.services.sonarr.find((i) => i.id === id)?.localUrl).toBe("http://s:8989");
    expect(validated.secrets[id]).toEqual({ apiKey: "SONARR-KEY" });
    expect(validated).not.toHaveProperty("backend");
    expect(puts[0]!.envelope.kdf.salt).toBe(env.kdf.salt); // same salt, cached key
  });

  it("rejects a wrong passphrase and a newer config version", async () => {
    const env = await encryptJsonString(JSON.stringify(blankExportPayload()), PASSPHRASE, rng);
    const { api } = fakeApi({ [slot().deviceId]: { envelope: env, revision: 1 } });
    await expect(openFromSlot(api, slot(), "not-the-passphrase", null)).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(openFromSlot(api, slot({ configVersion: CURRENT_CONFIG_VERSION + 1 }), PASSPHRASE, null)).rejects.toBeInstanceOf(UnsupportedVersionError);
    const future = { ...blankExportPayload(), version: CURRENT_CONFIG_VERSION + 5 };
    const futureEnv = await encryptJsonString(JSON.stringify(future), PASSPHRASE, rng);
    const { api: api2 } = fakeApi({ [slot().deviceId]: { envelope: futureEnv, revision: 1 } });
    await expect(openFromSlot(api2, slot(), PASSPHRASE, null)).rejects.toBeInstanceOf(UnsupportedVersionError);
  });

  it("a blank configuration saves and restores through the app's validation path", async () => {
    const session = await openBlank(PASSPHRASE, 7);
    expect(session.source.kind).toBe("new");
    expect(session.baseRevision).toBe(7);
    const { api, puts } = fakeApi({});
    await saveSession(api, session, session.payload, 7);
    expect(puts[0]!.expectedRevision).toBe(7);
    const plain = JSON.parse(await decryptEnvelope(puts[0]!.envelope, PASSPHRASE));
    const validated = validateExportPayload(migrateConfig(plain));
    expect(validated.dashboards).toHaveLength(1);
    expect(Object.keys(validated.services)).toHaveLength(Object.keys(blankExportPayload().services).length);
  });
});
