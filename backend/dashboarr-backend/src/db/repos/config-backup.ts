import { getDb } from "../client.js";

/**
 * One passphrase-encrypted config backup per paired device, plus the web
 * editor's reserved slot (Refs #385).
 *
 * The envelope is opaque: the backend stores and hands back exactly what was
 * uploaded and never holds the passphrase. Slots deliberately outlive the
 * device row (no FK, no cascade): the app's "Rotate secret" and "Unpair" both
 * delete the device, and a reinstall re-pairs under the same id, so a slot
 * must survive all three for the restore flow to have anything to offer.
 * `platform` is copied at upload time so an orphaned slot still displays.
 *
 * `revision` is a per-slot counter bumped on every write. The web editor
 * sends the revision it loaded and `upsertBackupIfRevision` refuses the write
 * when it no longer matches, inside one transaction (better-sqlite3 is
 * synchronous, so the check and the write cannot interleave).
 */

interface ConfigBackupMetaRow {
  device_id: string;
  size_bytes: number;
  config_version: number;
  exported_at: number;
  platform: string;
  app_version: string | null;
  updated_at: number;
  revision: number;
  paired: number;
  last_seen_at: number | null;
}

export interface ConfigBackupMeta {
  deviceId: string;
  sizeBytes: number;
  configVersion: number;
  exportedAt: number;
  platform: string;
  appVersion: string | null;
  updatedAt: number;
  revision: number;
  /** The device row still exists (false after unpair / rotate, always false for the web slot). */
  paired: boolean;
  lastSeenAt: number | null;
}

export interface BackupWriteInput {
  deviceId: string;
  /** The serialized envelope exactly as it will be handed back. */
  envelope: string;
  configVersion: number;
  exportedAt: number;
  platform: string;
  appVersion?: string | null;
}

export interface BackupWriteResult {
  updatedAt: number;
  sizeBytes: number;
  revision: number;
}

const META_SELECT = `
  SELECT b.device_id, b.size_bytes, b.config_version, b.exported_at, b.platform,
         b.app_version, b.updated_at, b.revision,
         (d.id IS NOT NULL) AS paired, d.last_seen_at
  FROM config_backup b
  LEFT JOIN devices d ON d.id = b.device_id`;

function mapMeta(row: ConfigBackupMetaRow): ConfigBackupMeta {
  return {
    deviceId: row.device_id,
    sizeBytes: row.size_bytes,
    configVersion: row.config_version,
    exportedAt: row.exported_at,
    platform: row.platform,
    appVersion: row.app_version,
    updatedAt: row.updated_at,
    revision: row.revision,
    paired: row.paired === 1,
    lastSeenAt: row.last_seen_at,
  };
}

function writeRow(input: BackupWriteInput): BackupWriteResult {
  const updatedAt = Date.now();
  const sizeBytes = Buffer.byteLength(input.envelope, "utf8");
  getDb()
    .prepare(
      `INSERT INTO config_backup
         (device_id, envelope, size_bytes, config_version, exported_at, platform, app_version, updated_at, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(device_id) DO UPDATE SET
         envelope       = excluded.envelope,
         size_bytes     = excluded.size_bytes,
         config_version = excluded.config_version,
         exported_at    = excluded.exported_at,
         platform       = excluded.platform,
         app_version    = excluded.app_version,
         updated_at     = excluded.updated_at,
         revision       = config_backup.revision + 1`,
    )
    .run(
      input.deviceId,
      input.envelope,
      sizeBytes,
      input.configVersion,
      input.exportedAt,
      input.platform,
      input.appVersion ?? null,
      updatedAt,
    );
  const row = getDb()
    .prepare<[string], { revision: number }>("SELECT revision FROM config_backup WHERE device_id = ?")
    .get(input.deviceId);
  return { updatedAt, sizeBytes, revision: row?.revision ?? 1 };
}

/** Unconditional write: a phone always owns its own slot. */
export function upsertBackup(input: BackupWriteInput): BackupWriteResult {
  return getDb().transaction(() => writeRow(input))();
}

export type ConditionalWrite =
  | { ok: true; result: BackupWriteResult }
  | { ok: false; current: ConfigBackupMeta | null };

/**
 * Write only if the stored revision matches `expectedRevision` (null = the
 * slot must not exist). On mismatch nothing is written and the current
 * metadata (or null when the slot is gone) is returned for the client to show.
 */
export function upsertBackupIfRevision(
  input: BackupWriteInput,
  expectedRevision: number | null,
): ConditionalWrite {
  return getDb().transaction((): ConditionalWrite => {
    const current = getMeta(input.deviceId);
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== expectedRevision) return { ok: false, current };
    return { ok: true, result: writeRow(input) };
  })();
}

function getMeta(deviceId: string): ConfigBackupMeta | null {
  const row = getDb()
    .prepare<[string], ConfigBackupMetaRow>(`${META_SELECT} WHERE b.device_id = ?`)
    .get(deviceId);
  return row ? mapMeta(row) : null;
}

/** Metadata only. Never selects the envelope column: the overview polls this. */
export function listBackupMeta(): ConfigBackupMeta[] {
  return getDb()
    .prepare<[], ConfigBackupMetaRow>(`${META_SELECT} ORDER BY b.updated_at DESC`)
    .all()
    .map(mapMeta);
}

export function getBackup(deviceId: string): { meta: ConfigBackupMeta; envelope: string } | null {
  const meta = getMeta(deviceId);
  if (!meta) return null;
  const row = getDb()
    .prepare<[string], { envelope: string }>("SELECT envelope FROM config_backup WHERE device_id = ?")
    .get(deviceId);
  if (!row) return null;
  return { meta, envelope: row.envelope };
}

/** Delete; with `expectedRevision` the delete is refused (false) when the revision moved. */
export function deleteBackup(deviceId: string, expectedRevision?: number): boolean {
  if (expectedRevision === undefined) {
    return getDb().prepare("DELETE FROM config_backup WHERE device_id = ?").run(deviceId).changes > 0;
  }
  return (
    getDb()
      .prepare("DELETE FROM config_backup WHERE device_id = ? AND revision = ?")
      .run(deviceId, expectedRevision).changes > 0
  );
}
