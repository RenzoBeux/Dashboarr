import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-uibackups-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { default: Fastify } = await import("fastify");
const { default: cookie } = await import("@fastify/cookie");
const { registerErrorHandler } = await import("../http/error-handler.js");
const { uiDataRoutes, uiLoginRoutes, UI_COOKIE } = await import("./ui.js");
const { uiBackupRoutes } = await import("./ui-backups.js");
const { createUiSessionStore } = await import("../auth/ui-session.js");
const { createDevice } = await import("../db/repos/devices.js");
const { upsertBackup, getBackup } = await import("../db/repos/config-backup.js");
const { WEB_SLOT_ID } = await import("../ui/overview-types.js");

const PASSWORD = "correct-horse-battery";
const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };

function envelope(ciphertextHex = "ab".repeat(64)) {
  return {
    format: "dashboarr-encrypted-v1",
    kdf: { name: "pbkdf2-sha256", iterations: 100_000, salt: "0123456789abcdef0123456789abcdef" },
    cipher: { name: "aes-256-gcm", nonce: "0123456789abcdef01234567", ciphertext: ciphertextHex },
  };
}
function body(over: Record<string, unknown> = {}) {
  return { envelope: envelope(), configVersion: 54, exportedAt: 1_700_000_000_000, expectedRevision: null, ...over };
}

async function buildApp(password: string | null = PASSWORD) {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  registerErrorHandler(app);
  await app.register(cookie);
  const opts = { password: password ?? undefined, sessions: createUiSessionStore() };
  await uiLoginRoutes(app, opts);
  await uiDataRoutes(app, opts);
  await uiBackupRoutes(app, opts);
  await app.ready();
  return app;
}

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<Record<string, string>> {
  const res = await app.inject({ method: "POST", url: "/ui/api/login", payload: { password: PASSWORD } });
  const c = res.cookies.find((x) => x.name === UI_COOKIE);
  assert.ok(c);
  return { [UI_COOKIE]: c.value };
}

const phone = createDevice({ expoPushToken: "ExponentPushToken[ui-backups]", platform: "ios", appVersion: "1.19.0" });
upsertBackup({ deviceId: phone.id, envelope: JSON.stringify(envelope("cd".repeat(64))), configVersion: 54, exportedAt: 1, platform: "ios", appVersion: "1.19.0" });

test("every route needs the session; disabled UI answers 403", async () => {
  const app = await buildApp();
  for (const [method, url] of [
    ["GET", `/ui/api/backups/${phone.id}/envelope`],
    ["PUT", `/ui/api/backups/${WEB_SLOT_ID}`],
    ["DELETE", `/ui/api/backups/${WEB_SLOT_ID}`],
  ] as const) {
    const res = await app.inject({ method, url, headers: SAME_ORIGIN, payload: method === "PUT" ? body() : undefined });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
  await app.close();
  const disabled = await buildApp(null);
  const res = await disabled.inject({ method: "GET", url: `/ui/api/backups/${phone.id}/envelope` });
  assert.equal(res.statusCode, 403);
  await disabled.close();
});

test("envelope GET returns a phone slot verbatim with its revision; unknown and malformed ids fail", async () => {
  const app = await buildApp();
  const cookies = await login(app);
  const res = await app.inject({ method: "GET", url: `/ui/api/backups/${phone.id}/envelope`, cookies });
  assert.equal(res.statusCode, 200);
  const got = res.json() as { deviceId: string; revision: number; envelope: unknown; paired: boolean };
  assert.equal(got.deviceId, phone.id);
  assert.equal(got.revision, 1);
  assert.equal(got.paired, true);
  assert.deepEqual(got.envelope, envelope("cd".repeat(64)));
  assert.equal(res.headers["cache-control"], "no-store");
  const missing = await app.inject({ method: "GET", url: "/ui/api/backups/00000000-0000-4000-8000-000000000000/envelope", cookies });
  assert.equal(missing.statusCode, 404);
  const bad = await app.inject({ method: "GET", url: "/ui/api/backups/nope/envelope", cookies });
  assert.equal(bad.statusCode, 400);
  await app.close();
});

test("PUT web: same-origin required, strict schema, creates then conflicts then overwrites with the returned revision", async () => {
  const app = await buildApp();
  const cookies = await login(app);
  const crossSite = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: { "sec-fetch-site": "cross-site" }, payload: body() });
  assert.equal(crossSite.statusCode, 403);
  assert.deepEqual(crossSite.json(), { error: "cross_origin" });

  const withAppVersion = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ appVersion: "1.0" }) });
  assert.equal(withAppVersion.statusCode, 400);

  // Absent slot, expectedRevision must be null.
  const stale = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ expectedRevision: 3 }) });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.json(), { error: "conflict", current: null });

  const created = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body() });
  assert.equal(created.statusCode, 200);
  const first = created.json() as { ok: boolean; revision: number; sizeBytes: number };
  // The counter is shared by every slot: the phone slot seeded above took 1.
  assert.equal(first.revision, 2);
  const stored = getBackup(WEB_SLOT_ID);
  assert.equal(stored?.meta.platform, "web");
  assert.equal(stored?.meta.appVersion, "web");
  assert.equal(stored?.meta.paired, false);

  // Another tab still holding null (or a stale number) gets the current meta back.
  const again = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body() });
  assert.equal(again.statusCode, 409);
  const conflict = again.json() as { error: string; current: { revision: number; platform: string } };
  assert.equal(conflict.current.revision, 2);
  assert.equal(conflict.current.platform, "web");

  const overwritten = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ envelope: envelope("ef".repeat(64)), expectedRevision: 2 }) });
  assert.equal(overwritten.statusCode, 200);
  assert.equal((overwritten.json() as { revision: number }).revision, 3);
  assert.deepEqual(JSON.parse(getBackup(WEB_SLOT_ID)!.envelope), envelope("ef".repeat(64)));

  const overview = await app.inject({ method: "GET", url: "/ui/api/overview", cookies });
  const web = (overview.json() as { backups: { deviceId: string; paired: boolean; revision: number }[] }).backups.find((b) => b.deviceId === WEB_SLOT_ID);
  assert.deepEqual(web && [web.paired, web.revision], [false, 3]);
  assert.equal(overview.body.includes("efef"), false);
  await app.close();
});

test("PUT web over the limit is a named 413", async () => {
  const app = await buildApp();
  const cookies = await login(app);
  const res = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ envelope: envelope("ef".repeat(2_200_000)), expectedRevision: 3 }) });
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.json(), { error: "payload_too_large" });
  await app.close();
});

test("DELETE web: stale revision conflicts, matching one deletes, then 404; a recreated slot never reuses a revision", async () => {
  const app = await buildApp();
  const cookies = await login(app);
  const stale = await app.inject({ method: "DELETE", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: { expectedRevision: 2 } });
  assert.equal(stale.statusCode, 409);
  const ok = await app.inject({ method: "DELETE", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: { expectedRevision: 3 } });
  assert.equal(ok.statusCode, 200);
  const gone = await app.inject({ method: "DELETE", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN });
  assert.equal(gone.statusCode, 404);
  // A deleted slot is "absent" again: a writer expecting revision 3 conflicts with current null.
  const deletedMeanwhile = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ expectedRevision: 3 }) });
  assert.equal(deletedMeanwhile.statusCode, 409);
  assert.deepEqual(deletedMeanwhile.json(), { error: "conflict", current: null });
  // Recreating it continues the global sequence (no ABA against the old 3).
  const recreated = await app.inject({ method: "PUT", url: `/ui/api/backups/${WEB_SLOT_ID}`, cookies, headers: SAME_ORIGIN, payload: body({ expectedRevision: null }) });
  assert.equal(recreated.statusCode, 200);
  assert.ok((recreated.json() as { revision: number }).revision > 3);
  await app.close();
});
