import { CURRENT_CONFIG_VERSION, migrateConfig } from "@/store/config-migrations";
import { validateExportPayload } from "@/store/config-schema";
import { blankExportPayload } from "@/lib/config-defaults";
import { SERVICE_IDS } from "@/lib/constants";
import type { ExportPayload } from "@/lib/config-types";
import type { OverviewBackup } from "../../../src/ui/overview-types";
import type { WebBackupPutBody, WebBackupPutResult } from "../api";
import { decryptEnvelope, deriveKeyHex, encryptWithKey, generateSaltHex, PBKDF2_ITERATIONS } from "../lib/envelope";
import type { DerivedKey, EncryptedEnvelope } from "../lib/envelope";

/**
 * The editor's session: where the payload came from, the key that will
 * re-encrypt it, and the web slot revision the save must still match.
 *
 * The passphrase itself is never kept — only the derived key, exactly what
 * the phone caches. Everything here is pure and takes its I/O through
 * `EditorApi`, so it is unit-tested with a fake backend.
 */

export interface EditorApi {
  getEnvelope(id: string): Promise<{ envelope: EncryptedEnvelope; revision: number }>;
  putWeb(body: WebBackupPutBody): Promise<WebBackupPutResult>;
}

export type EditorSource = { kind: "slot"; slot: OverviewBackup } | { kind: "new" };

export interface EditorSession {
  source: EditorSource;
  key: DerivedKey;
  /** Migrated to CURRENT_CONFIG_VERSION and validated: the canonical shape. */
  payload: ExportPayload;
  /** Revision of the web slot when the editor opened; null = it did not exist. */
  baseRevision: number | null;
}

export class UnsupportedVersionError extends Error {
  constructor(public readonly configVersion: number) {
    super(
      `This backup was made by a newer app (config version ${configVersion}, this backend understands up to ${CURRENT_CONFIG_VERSION}). Update the backend.`,
    );
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase, or the backup is corrupted.");
  }
}

export const SUPPORTED_CONFIG_VERSION = CURRENT_CONFIG_VERSION;

export async function openFromSlot(
  api: EditorApi,
  slot: OverviewBackup,
  passphrase: string,
  webSlotRevision: number | null,
): Promise<EditorSession> {
  if (slot.configVersion > CURRENT_CONFIG_VERSION) throw new UnsupportedVersionError(slot.configVersion);
  const { envelope } = await api.getEnvelope(slot.deviceId);
  let plain: string;
  try {
    plain = await decryptEnvelope(envelope, passphrase);
  } catch (err) {
    if (err instanceof Error && /Incorrect passphrase/.test(err.message)) throw new WrongPassphraseError();
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(plain);
  } catch {
    throw new Error("The decrypted backup is not valid JSON.");
  }
  const versionOf = (raw as { version?: unknown } | null)?.version;
  if (typeof versionOf === "number" && versionOf > CURRENT_CONFIG_VERSION) {
    throw new UnsupportedVersionError(versionOf);
  }
  const payload = withEveryKind(validateExportPayload(migrateConfig(raw)));
  const key: DerivedKey = {
    saltHex: envelope.kdf.salt,
    keyHex: await deriveKeyHex(passphrase, envelope.kdf.salt, envelope.kdf.iterations),
    iterations: envelope.kdf.iterations,
  };
  return { source: { kind: "slot", slot }, key, payload, baseRevision: webSlotRevision };
}

/** The editor lists every kind; a backup may omit kinds it never configured. */
function withEveryKind(payload: ExportPayload): ExportPayload {
  const services = { ...payload.services };
  for (const kind of SERVICE_IDS) if (!services[kind]) services[kind] = [];
  return { ...payload, services };
}

export async function openBlank(passphrase: string, webSlotRevision: number | null): Promise<EditorSession> {
  const saltHex = generateSaltHex();
  const key: DerivedKey = {
    saltHex,
    keyHex: await deriveKeyHex(passphrase, saltHex, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
  };
  const payload = validateExportPayload(blankExportPayload());
  return { source: { kind: "new" }, key, payload, baseRevision: webSlotRevision };
}

/**
 * Validates, stamps a fresh exportedAt and encrypts. `expectedRevision` is
 * the caller's current baseline so a 409 surfaces when the slot moved.
 */
export function buildSavePayload(
  session: EditorSession,
  payload: ExportPayload,
  expectedRevision: number | null,
): WebBackupPutBody {
  const exportedAt = new Date().toISOString();
  const validated = validateExportPayload({ ...payload, version: CURRENT_CONFIG_VERSION, exportedAt });
  return {
    envelope: encryptWithKey(JSON.stringify(validated), session.key),
    configVersion: CURRENT_CONFIG_VERSION,
    exportedAt: Date.parse(exportedAt),
    expectedRevision,
  };
}

export async function saveSession(
  api: EditorApi,
  session: EditorSession,
  payload: ExportPayload,
  expectedRevision: number | null,
): Promise<WebBackupPutResult> {
  return api.putWeb(buildSavePayload(session, payload, expectedRevision));
}
