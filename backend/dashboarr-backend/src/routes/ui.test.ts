import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// See health.test.ts: env and DB paths must be set before anything reads them.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-ui-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { default: Fastify } = await import("fastify");
const { default: cookie } = await import("@fastify/cookie");
const { uiDataRoutes, uiLoginRoutes, UI_COOKIE } = await import("./ui.js");
const { createUiSessionStore } = await import("../auth/ui-session.js");
const { createDevice } = await import("../db/repos/devices.js");
const { upsertServiceInstance } = await import("../db/repos/service-instance.js");
const { recordWebhook } = await import("../db/repos/events.js");
const { setState } = await import("../db/repos/seen-state.js");
const { upsertBackup } = await import("../db/repos/config-backup.js");

const PASSWORD = "correct-horse-battery";
const API_KEY = "SUPERSECRET-API-KEY-123";
const DEVICE_TOKEN = "ExponentPushToken[ui-test]";
const BACKUP_MARKER = "deadbeefcafef00d".repeat(4);

async function buildApp(password: string | undefined) {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const opts = { password, sessions: createUiSessionStore() };
  await uiLoginRoutes(app, opts);
  await uiDataRoutes(app, opts);
  await app.ready();
  return app;
}

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/ui/api/login",
    payload: { password: PASSWORD },
  });
  assert.equal(res.statusCode, 200);
  const found = res.cookies.find((c) => c.name === UI_COOKIE);
  assert.ok(found, "login must set the session cookie");
  return found.value;
}

test("disabled: session reports enabled=false and everything else is 403", async () => {
  const app = await buildApp(undefined);
  const session = await app.inject({ method: "GET", url: "/ui/api/session" });
  assert.deepEqual(session.json(), { enabled: false, authenticated: false });

  const login = await app.inject({ method: "POST", url: "/ui/api/login", payload: { password: "x" } });
  assert.equal(login.statusCode, 403);
  assert.deepEqual(login.json(), { error: "ui_disabled" });

  const overview = await app.inject({ method: "GET", url: "/ui/api/overview" });
  assert.equal(overview.statusCode, 403);
  assert.deepEqual(overview.json(), { error: "ui_disabled" });
  await app.close();
});

test("login rejects malformed bodies and wrong passwords without a cookie", async () => {
  const app = await buildApp(PASSWORD);
  const bad = await app.inject({ method: "POST", url: "/ui/api/login", payload: { nope: 1 } });
  assert.equal(bad.statusCode, 400);

  const wrong = await app.inject({ method: "POST", url: "/ui/api/login", payload: { password: "wrong" } });
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.json(), { error: "invalid_password" });
  assert.equal(wrong.headers["set-cookie"], undefined);
  assert.equal(wrong.headers["cache-control"], "no-store");
  await app.close();
});

test("login sets an httpOnly, strict cookie with no explicit Path (not Secure over http)", async () => {
  const app = await buildApp(PASSWORD);
  const res = await app.inject({ method: "POST", url: "/ui/api/login", payload: { password: PASSWORD } });
  assert.equal(res.statusCode, 200);
  const c = res.cookies.find((c) => c.name === UI_COOKIE);
  assert.ok(c);
  assert.match(c.value, /^[0-9a-f]{64}$/);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, "Strict");
  // No Path attribute: the browser defaults it to the request directory,
  // which keeps the cookie working behind a reverse-proxy path prefix.
  assert.equal(c.path, undefined);
  assert.equal(c.secure, undefined);
  assert.equal(c.maxAge, 86400);

  const session = await app.inject({ method: "GET", url: "/ui/api/session", cookies: { [UI_COOKIE]: c.value } });
  assert.deepEqual(session.json(), { enabled: true, authenticated: true });
  await app.close();
});

test("overview requires a session and never leaks secrets", async () => {
  const app = await buildApp(PASSWORD);

  const anon = await app.inject({ method: "GET", url: "/ui/api/overview" });
  assert.equal(anon.statusCode, 401);
  assert.deepEqual(anon.json(), { error: "unauthenticated" });

  const stale = await app.inject({ method: "GET", url: "/ui/api/overview", cookies: { [UI_COOKIE]: "f".repeat(64) } });
  assert.equal(stale.statusCode, 401);

  const device = createDevice({ expoPushToken: DEVICE_TOKEN, platform: "ios", appVersion: "1.18.0" });
  upsertServiceInstance({
    id: "inst-radarr",
    kind: "radarr",
    enabled: true,
    name: "Radarr",
    localUrl: "http://alice:pw@10.0.0.5:7878/?apikey=SUPERSECRET-API-KEY-123",
    remoteUrl: "",
    useRemote: false,
    apiKey: API_KEY,
    username: "alice",
    password: "hunter2-pass",
  });
  setState("health:inst-radarr:online", { online: false, failCount: 3 });
  recordWebhook("radarr", { eventType: "Download", movie: { title: "Heat", year: 1995, folderPath: "/data/movies/Heat" } });
  recordWebhook("tautulli", { subject: "Playback started", ip: "203.0.113.9" });
  upsertBackup({
    deviceId: device.id,
    envelope: JSON.stringify({ format: "dashboarr-encrypted-v1", cipher: { ciphertext: BACKUP_MARKER } }),
    configVersion: 54,
    exportedAt: Date.now(),
    platform: "ios",
    appVersion: "1.18.0",
  });

  const token = await login(app);
  const res = await app.inject({ method: "GET", url: "/ui/api/overview", cookies: { [UI_COOKIE]: token } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");

  for (const secret of [API_KEY, "hunter2-pass", "alice:pw@", device.sharedSecret, DEVICE_TOKEN, "/data/movies", "203.0.113.9", BACKUP_MARKER]) {
    assert.equal(res.body.includes(secret), false, `body must not contain ${secret}`);
  }

  const body = res.json() as {
    version: string;
    devices: { id: string; platform: string; invalid: boolean }[];
    instances: { id: string; localUrl: string; hasApiKey: boolean; hasCredentials: boolean; health: { online: boolean; failCount: number } | null }[];
    webhooks: { source: string; eventType: string | null; summary: string | null }[];
    backups: { deviceId: string; paired: boolean; sizeBytes: number }[];
  };
  assert.equal(typeof body.version, "string");
  assert.deepEqual(body.devices.map((d) => [d.id, d.platform, d.invalid]), [[device.id, "ios", false]]);
  const inst = body.instances.find((i) => i.id === "inst-radarr");
  assert.ok(inst);
  assert.equal(inst.localUrl, "http://10.0.0.5:7878/");
  assert.equal(inst.hasApiKey, true);
  assert.equal(inst.hasCredentials, true);
  assert.deepEqual(inst.health && { online: inst.health.online, failCount: inst.health.failCount }, { online: false, failCount: 3 });
  assert.deepEqual(
    body.webhooks.map((w) => [w.source, w.eventType, w.summary]),
    [
      ["tautulli", null, null],
      ["radarr", "Download", "Heat (1995)"],
    ],
  );
  assert.deepEqual(body.backups.map((b) => [b.deviceId, b.paired, b.sizeBytes > 0]), [[device.id, true, true]]);
  await app.close();
});

test("logout revokes the session", async () => {
  const app = await buildApp(PASSWORD);
  const token = await login(app);
  const out = await app.inject({ method: "POST", url: "/ui/api/logout", cookies: { [UI_COOKIE]: token } });
  assert.equal(out.statusCode, 200);
  const cleared = out.cookies.find((c) => c.name === UI_COOKIE);
  assert.ok(cleared);
  assert.equal(cleared.value, "");
  assert.equal(cleared.maxAge, 0);
  // Same default path as the login cookie, so the browser really drops it
  // (reply.clearCookie would have emitted Path=/ and left it in place).
  assert.equal(cleared.path, undefined);
  assert.equal(cleared.httpOnly, true);
  assert.equal(cleared.sameSite, "Strict");

  const after = await app.inject({ method: "GET", url: "/ui/api/overview", cookies: { [UI_COOKIE]: token } });
  assert.equal(after.statusCode, 401);
  await app.close();
});
