import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { requireSameOrigin } from "./same-origin.js";

async function buildApp() {
  const app = Fastify({ logger: false });
  app.delete("/write", { preHandler: requireSameOrigin }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

test("Sec-Fetch-Site decides when present", async () => {
  const app = await buildApp();
  for (const [value, status] of [
    ["same-origin", 200],
    ["same-site", 403],
    ["cross-site", 403],
    ["none", 403],
  ] as const) {
    const res = await app.inject({ method: "DELETE", url: "/write", headers: { "sec-fetch-site": value, origin: "http://localhost:80" } });
    assert.equal(res.statusCode, status, `sec-fetch-site: ${value}`);
  }
  await app.close();
});

test("without Sec-Fetch-Site, Origin must match the request host including the port", async () => {
  const app = await buildApp();
  const ok = await app.inject({ method: "DELETE", url: "/write", headers: { host: "backend.lan:4000", origin: "http://backend.lan:4000" } });
  assert.equal(ok.statusCode, 200);
  const wrongPort = await app.inject({ method: "DELETE", url: "/write", headers: { host: "backend.lan:4000", origin: "http://backend.lan:4001" } });
  assert.equal(wrongPort.statusCode, 403);
  const otherHost = await app.inject({ method: "DELETE", url: "/write", headers: { host: "backend.lan:4000", origin: "https://evil.example" } });
  assert.equal(otherHost.statusCode, 403);
  assert.deepEqual(otherHost.json(), { error: "cross_origin" });
  const garbage = await app.inject({ method: "DELETE", url: "/write", headers: { host: "backend.lan:4000", origin: "not a url" } });
  assert.equal(garbage.statusCode, 403);
  await app.close();
});

test("neither header present is rejected", async () => {
  const app = await buildApp();
  const res = await app.inject({ method: "DELETE", url: "/write" });
  assert.equal(res.statusCode, 403);
  await app.close();
});
