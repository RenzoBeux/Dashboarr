import { getDb } from "../client.js";

/**
 * One passphrase-encrypted config backup per paired device (Refs #385).
 *
 * The envelope is opaque: the backend stores and hands back exactly what the
 * app uploaded and never holds the passphrase. Slots deliberately outlive the
 * device row (no FK, no cascade): the app's "Rotate secret" and "Unpair" both
 * delete the device, and a reinstall re-pairs under the same id, so a slot
 * must survive all three for the restore flow to have anything to offer.
 * `platform` is copied at upload time so an orphaned slot still displays.
 */

interface ConfigBackupMetaRow {
  device_id: string;
  size_bytes: number;
  config_version: number;
  exported_at: number;
  platform: string;
  app_version: string | null;
  updated_at: number;
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
  /** The device row still exists (false after unpair / rotate). */
  paired: boolean;
  lastSeenAt: number | null;
}

const META_SELECT = `
  SELECT b.device_id, b.size_bytes, b.config_version, b.exported_at, b.platform,
         b.app_version, b.updated_at,
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
    paired: row.paired === 1,
    lastSeenAt: row.last_seen_at,
  };
}

export function upsertBackup(input: {
  deviceId: string;
  /** The serialized envelope exactly as it will be handed back. */
  envelope: string;
  configVersion: number;
  exportedAt: number;
  platform: string;
  appVersion?: string | null;
}): { updatedAt: number; sizeBytes: number } {
  const updatedAt = Date.now();
  const sizeBytes = Buffer.byteLength(input.envelope, "utf8");
  getDb()
    .prepare(
      `INSERT INTO config_backup
         (device_id, envelope, size_bytes, config_version, exported_at, platform, app_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         envelope       = excluded.envelope,
         size_bytes     = excluded.size_bytes,
         config_version = excluded.config_version,
         exported_at    = excluded.exported_at,
         platform       = excluded.platform,
         app_version    = excluded.app_version,
         updated_at     = excluded.updated_at`,
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
  return { updatedAt, sizeBytes };
}

/** Metadata only. Never selects the envelope column: the overview polls this. */
export function listBackupMeta(): ConfigBackupMeta[] {
  return getDb()
    .prepare<[], ConfigBackupMetaRow>(`${META_SELECT} ORDER BY b.updated_at DESC`)
    .all()
    .map(mapMeta);
}

export function getBackup(deviceId: string): { meta: ConfigBackupMeta; envelope: string } | null {
  const meta = getDb()
    .prepare<[string], ConfigBackupMetaRow>(`${META_SELECT} WHERE b.device_id = ?`)
    .get(deviceId);
  if (!meta) return null;
  const row = getDb()
    .prepare<[string], { envelope: string }>("SELECT envelope FROM config_backup WHERE device_id = ?")
    .get(deviceId);
  if (!row) return null;
  return { meta: mapMeta(meta), envelope: row.envelope };
}

export function deleteBackup(deviceId: string): boolean {
  const result = getDb().prepare("DELETE FROM config_backup WHERE device_id = ?").run(deviceId);
  return result.changes > 0;
}
