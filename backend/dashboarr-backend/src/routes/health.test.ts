import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// getEnv() caches on first call and getDb() creates the SQLite file under
// DATA_DIR, so point both at a throwaway directory BEFORE anything that reads
// them is imported. Hence the dynamic imports below.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-health-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { default: Fastify } = await import("fastify");
const { healthRoutes } = await import("./health.js");
const { createDevice } = await import("../db/repos/devices.js");

function bodyOf(res: { json: () => unknown }): Record<string, unknown> {
  return res.json() as Record<string, unknown>;
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await healthRoutes(app);
  await app.ready();
  return app;
}

/**
 * Anonymous liveness — the fix for #357. A browser, a Docker HEALTHCHECK and an
 * uptime monitor all land here, and all of them used to get a 401.
 */
test("GET /health with no Authorization returns the liveness projection", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "GET", url: "/health" });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, name: "dashboarr-backend" });
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers.vary, "Authorization");

  await app.close();
});

test("the liveness projection leaks no poller, version or uptime data", async () => {
  const app = await buildApp();
  const body = bodyOf(await app.inject({ method: "GET", url: "/health" }));

  for (const key of ["pollers", "version", "uptimeMs", "expoAuth"]) {
    assert.equal(key in body, false, `${key} must not be exposed anonymously`);
  }

  await app.close();
});

/**
 * A forward-auth proxy (Authentik, Authelia) can inject its own Authorization
 * header on the proxied request. That caller never tried to present a bearer,
 * so it must not be treated as a failed one — otherwise an ordinary healthcheck
 * behind such a proxy 401s and reproduces the original confusion.
 */
test("a non-Bearer Authorization scheme is treated as anonymous", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: "Basic Zm9vOmJhcg==" },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, name: "dashboarr-backend" });

  await app.close();
});

/**
 * A wrong bearer must stay a 401: it is the app's only signal that its stored
 * secret went stale. Answering 200 would leave it reporting "Connected" forever
 * with its local notification fallback suppressed.
 */
test("an unknown Bearer still returns 401 invalid_bearer", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: "Bearer nope" },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: "invalid_bearer" });

  await app.close();
});

test("an empty Bearer returns 401 missing_bearer", async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: "Bearer    " },
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: "missing_bearer" });

  await app.close();
});

test("a valid Bearer returns the full body", async () => {
  const device = createDevice({
    expoPushToken: "ExponentPushToken[health-test]",
    platform: "ios",
  });
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: `Bearer ${device.sharedSecret}` },
  });

  assert.equal(res.statusCode, 200);
  const body = bodyOf(res);
  assert.equal(body.ok, true);
  assert.equal(body.name, "dashboarr-backend");
  assert.equal(body.expoAuth, "must-be-disabled");
  assert.equal(typeof body.version, "string");
  assert.equal(typeof body.uptimeMs, "number");
  assert.ok(Array.isArray(body.pollers));

  await app.close();
});

// RFC 7235 makes the auth scheme case-insensitive.
test("a lowercase `bearer` scheme authenticates", async () => {
  const device = createDevice({
    expoPushToken: "ExponentPushToken[health-test-lower]",
    platform: "android",
  });
  const app = await buildApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { authorization: `bearer ${device.sharedSecret}` },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(bodyOf(res).expoAuth, "must-be-disabled");

  await app.close();
});
