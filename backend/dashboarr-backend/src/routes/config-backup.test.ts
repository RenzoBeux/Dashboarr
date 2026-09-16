import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// See health.test.ts: env and DB paths must be set before anything reads them.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-backup-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { default: Fastify } = await import("fastify");
const { configBackupRoutes } = await import("./config-backup.js");
const { registerErrorHandler } = await import("../http/error-handler.js");
const { createDevice, deleteDevice } = await import("../db/repos/devices.js");

function envelope(ciphertextHex = "ab".repeat(64)) {
  return {
    format: "dashboarr-encrypted-v1",
    kdf: { name: "pbkdf2-sha256", iterations: 100_000, salt: "0123456789abcdef0123456789abcdef" },
    cipher: { name: "aes-256-gcm", nonce: "0123456789abcdef01234567", ciphertext: ciphertextHex },
  };
}

function putBody(over: Record<string, unknown> = {}) {
  return { envelope: envelope(), configVersion: 54, exportedAt: 1_700_000_000_000, appVersion: "1.19.0", ...over };
}

/** Same 1 MB global limit as production, so the per-route override is what the test exercises. */
async function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  registerErrorHandler(app);
  await configBackupRoutes(app);
  await app.ready();
  return app;
}

function bearer(secret: string) {
  return { authorization: `Bearer ${secret}` };
}

const phoneA = createDevice({ expoPushToken: "ExponentPushToken[backup-a]", platform: "ios", appVersion: "1.18.0" });
const phoneB = createDevice({ expoPushToken: "ExponentPushToken[backup-b]", platform: "android", appVersion: "1.18.0" });

test("every route requires a bearer", async () => {
  const app = await buildApp();
  for (const [method, url] of [
    ["PUT", "/config/backup"],
    ["GET", "/config/backups"],
    ["GET", `/config/backups/${phoneA.id}`],
    ["DELETE", `/config/backups/${phoneA.id}`],
  ] as const) {
    const res = await app.inject({ method, url, payload: method === "PUT" ? putBody() : undefined });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
  await app.close();
});

test("PUT rejects malformed envelopes with 400", async () => {
  const app = await buildApp();
  const bad = [
    { envelope: { ...envelope(), format: "dashboarr-encrypted-v2" } },
    { envelope: { ...envelope(), kdf: { ...envelope().kdf, salt: "not-hex" } } },
    { envelope: { ...envelope(), kdf: { ...envelope().kdf, iterations: 5_000 } } },
    { envelope: { ...envelope(), cipher: { ...envelope().cipher, ciphertext: "abc" } } },
    { envelope: { ...envelope(), extra: 1 } },
    { configVersion: 0 },
    { exportedAt: "2026-09-16" },
    { surprise: true },
  ];
  for (const over of bad) {
    const res = await app.inject({ method: "PUT", url: "/config/backup", headers: bearer(phoneA.sharedSecret), payload: putBody(over) });
    assert.equal(res.statusCode, 400, JSON.stringify(over).slice(0, 60));
    assert.deepEqual(res.json(), { error: "invalid_payload" });
  }
  await app.close();
});

test("PUT stores the caller's own slot and a second PUT replaces it", async () => {
  const app = await buildApp();
  const first = await app.inject({ method: "PUT", url: "/config/backup", headers: bearer(phoneA.sharedSecret), payload: putBody() });
  assert.equal(first.statusCode, 200);
  const body = first.json() as { ok: boolean; updatedAt: number; sizeBytes: number };
  assert.equal(body.ok, true);
  assert.equal(typeof body.updatedAt, "number");
  assert.ok(body.sizeBytes > 100);

  const second = await app.inject({
    method: "PUT",
    url: "/config/backup",
    headers: bearer(phoneA.sharedSecret),
    payload: putBody({ envelope: envelope("cd".repeat(64)), configVersion: 55 }),
  });
  assert.equal(second.statusCode, 200);

  const list = await app.inject({ method: "GET", url: "/config/backups", headers: bearer(phoneA.sharedSecret) });
  const { backups } = list.json() as { backups: Record<string, unknown>[] };
  assert.equal(backups.filter((b) => b.deviceId === phoneA.id).length, 1);
  const mine = backups.find((b) => b.deviceId === phoneA.id)!;
  assert.equal(mine.configVersion, 55);
  assert.equal(mine.mine, true);
  assert.equal(mine.paired, true);
  assert.equal(mine.platform, "ios");
  assert.equal(mine.appVersion, "1.19.0");
  assert.equal("envelope" in mine, false);
  assert.equal(list.body.includes("cdcd"), false, "list must not carry ciphertext");
  await app.close();
});

test("another paired device can read the slot verbatim, and mine is false for it", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: `/config/backups/${phoneA.id}`, headers: bearer(phoneB.sharedSecret) });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { mine: boolean; envelope: unknown; deviceId: string };
  assert.equal(body.mine, false);
  assert.equal(body.deviceId, phoneA.id);
  assert.deepEqual(body.envelope, envelope("cd".repeat(64)));
  await app.close();
});

test("a body above the per-route limit is a named 413, and one above the global 1 MB but below it succeeds", async () => {
  const app = await buildApp();
  const big = await app.inject({
    method: "PUT",
    url: "/config/backup",
    headers: bearer(phoneB.sharedSecret),
    payload: putBody({ envelope: envelope("ef".repeat(750 * 1024)) }), // ~1.5 MB
  });
  assert.equal(big.statusCode, 200);

  const tooBig = await app.inject({
    method: "PUT",
    url: "/config/backup",
    headers: bearer(phoneB.sharedSecret),
    payload: putBody({ envelope: envelope("ef".repeat(2_200_000)) }), // ~4.4 MB
  });
  assert.equal(tooBig.statusCode, 413);
  assert.deepEqual(tooBig.json(), { error: "payload_too_large" });
  await app.close();
});

test("unknown or malformed ids are 404 / 400", async () => {
  const app = await buildApp();
  const missing = await app.inject({ method: "GET", url: "/config/backups/00000000-0000-4000-8000-000000000000", headers: bearer(phoneA.sharedSecret) });
  assert.equal(missing.statusCode, 404);
  const malformed = await app.inject({ method: "GET", url: "/config/backups/not-a-uuid", headers: bearer(phoneA.sharedSecret) });
  assert.equal(malformed.statusCode, 400);
  const delMissing = await app.inject({ method: "DELETE", url: "/config/backups/00000000-0000-4000-8000-000000000000", headers: bearer(phoneA.sharedSecret) });
  assert.equal(delMissing.statusCode, 404);
  await app.close();
});

test("a slot outlives its device row and shows as unpaired; delete removes it", async () => {
  const app = await buildApp();
  deleteDevice(phoneB.id);
  const list = await app.inject({ method: "GET", url: "/config/backups", headers: bearer(phoneA.sharedSecret) });
  const orphan = (list.json() as { backups: Record<string, unknown>[] }).backups.find((b) => b.deviceId === phoneB.id);
  assert.ok(orphan, "orphan slot must still be listed");
  assert.equal(orphan.paired, false);
  assert.equal(orphan.platform, "android");
  assert.equal(orphan.lastSeenAt, null);

  const del = await app.inject({ method: "DELETE", url: `/config/backups/${phoneB.id}`, headers: bearer(phoneA.sharedSecret) });
  assert.equal(del.statusCode, 200);
  const after = await app.inject({ method: "GET", url: `/config/backups/${phoneB.id}`, headers: bearer(phoneA.sharedSecret) });
  assert.equal(after.statusCode, 404);
  await app.close();
});
