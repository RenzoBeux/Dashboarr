import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../client.js";

export interface DeviceRow {
  id: string;
  expo_push_token: string;
  shared_secret: string;
  platform: string;
  app_version: string | null;
  created_at: number;
  last_seen_at: number;
  invalid: number;
}

export interface Device {
  id: string;
  expoPushToken: string;
  sharedSecret: string;
  platform: string;
  appVersion: string | null;
  createdAt: number;
  lastSeenAt: number;
  invalid: boolean;
}

function mapRow(row: DeviceRow): Device {
  return {
    id: row.id,
    expoPushToken: row.expo_push_token,
    sharedSecret: row.shared_secret,
    platform: row.platform,
    appVersion: row.app_version,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    invalid: row.invalid === 1,
  };
}

export function createDevice(input: {
  expoPushToken: string;
  platform: string;
  appVersion?: string;
}): Device {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  const sharedSecret = randomBytes(32).toString("hex");

  // If this push token already exists, reuse the row (and rotate the secret).
  const existing = db
    .prepare<[string], DeviceRow>("SELECT * FROM devices WHERE expo_push_token = ?")
    .get(input.expoPushToken);

  if (existing) {
    db.prepare(
      `UPDATE devices
       SET shared_secret = ?, platform = ?, app_version = ?, last_seen_at = ?, invalid = 0
       WHERE id = ?`,
    ).run(sharedSecret, input.platform, input.appVersion ?? null, now, existing.id);
    return mapRow({
      ...existing,
      shared_secret: sharedSecret,
      platform: input.platform,
      app_version: input.appVersion ?? null,
      last_seen_at: now,
      invalid: 0,
    });
  }

  db.prepare(
    `INSERT INTO devices
     (id, expo_push_token, shared_secret, platform, app_version, created_at, last_seen_at, invalid)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(id, input.expoPushToken, sharedSecret, input.platform, input.appVersion ?? null, now, now);

  return {
    id,
    expoPushToken: input.expoPushToken,
    sharedSecret,
    platform: input.platform,
    appVersion: input.appVersion ?? null,
    createdAt: now,
    lastSeenAt: now,
    invalid: false,
  };
}

export function findDeviceBySecret(secret: string): Device | null {
  const row = getDb()
    .prepare<[string], DeviceRow>("SELECT * FROM devices WHERE shared_secret = ?")
    .get(secret);
  return row ? mapRow(row) : null;
}

export function findDeviceById(id: string): Device | null {
  const row = getDb()
    .prepare<[string], DeviceRow>("SELECT * FROM devices WHERE id = ?")
    .get(id);
  return row ? mapRow(row) : null;
}

export function listActiveDevices(): Device[] {
  const rows = getDb()
    .prepare<[], DeviceRow>("SELECT * FROM devices WHERE invalid = 0 ORDER BY created_at ASC")
    .all();
  return rows.map(mapRow);
}

export function markDeviceInvalidByToken(expoPushToken: string): void {
  getDb()
    .prepare("UPDATE devices SET invalid = 1 WHERE expo_push_token = ?")
    .run(expoPushToken);
}

export function touchDevice(id: string): void {
  getDb().prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(Date.now(), id);
}

export function updateDevicePushToken(id: string, expoPushToken: string): void {
  getDb()
    .prepare("UPDATE devices SET expo_push_token = ?, invalid = 0, last_seen_at = ? WHERE id = ?")
    .run(expoPushToken, Date.now(), id);
}

export function deleteDevice(id: string): void {
  getDb().prepare("DELETE FROM devices WHERE id = ?").run(id);
}
