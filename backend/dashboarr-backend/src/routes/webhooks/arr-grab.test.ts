import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// getEnv() caches on first call and getDb() creates the SQLite file under
// DATA_DIR, so point both at a throwaway directory BEFORE anything that reads
// them is imported. Hence the dynamic imports below. No device is paired, so
// the dispatcher never reaches Expo; the claimed dedupe key is the evidence
// that a push would have gone out.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-arr-grab-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { default: Fastify } = await import("fastify");
const { radarrWebhook } = await import("./radarr.js");
const { sonarrWebhook } = await import("./sonarr.js");
const { getWebhookSecret } = await import("../../db/repos/settings.js");
const { saveNotificationSettings } = await import("../../db/repos/config.js");
const { getState } = await import("../../db/repos/seen-state.js");
const { DEFAULT_NOTIFICATION_SETTINGS } = await import("../../types.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await radarrWebhook(app);
  await sonarrWebhook(app);
  await app.ready();
  return app;
}

function post(app: Awaited<ReturnType<typeof buildApp>>, kind: "radarr" | "sonarr", payload: unknown) {
  return app.inject({
    method: "POST",
    url: `/webhooks/${kind}`,
    headers: { "x-dashboarr-secret": getWebhookSecret() },
    payload: payload as Record<string, unknown>,
  });
}

function claimed(key: string): boolean {
  return getState<number>(`event:${key}`) !== null;
}

// Fixtures follow WebhookGrabPayload / WebhookRelease on Radarr and Sonarr develop.
const radarrGrab = (downloadId: string) => ({
  eventType: "Grab",
  instanceName: "Radarr",
  movie: { id: 7, title: "Dune: Part Two", year: 2024, tmdbId: 693134 },
  release: {
    quality: "WEBDL-2160p",
    qualityVersion: 1,
    releaseTitle: "Dune.Part.Two.2024.2160p.WEB-DL",
    indexer: "NZBgeek (Prowlarr)",
    size: 64_424_509_440,
  },
  downloadClient: "SABnzbd",
  downloadId,
});

const sonarrPackGrab = (downloadId: string) => ({
  eventType: "Grab",
  series: { id: 3, title: "Severance" },
  episodes: Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, seasonNumber: 2, episodeNumber: i + 1 })),
  release: { quality: "WEBDL-1080p", indexer: "DrunkenSlug", size: 21_474_836_480 },
  downloadId,
});

test("a Radarr Grab is dropped while radarrGrabbed is off (the default)", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
  const app = await buildApp();
  const res = await post(app, "radarr", radarrGrab("OFF1"));
  assert.equal(res.statusCode, 200);
  assert.equal(claimed("radarr:grabbed:any:OFF1"), false);
  await app.close();
});

test("a Radarr Grab claims its own key, and the later Download still claims its own", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true });
  const app = await buildApp();

  assert.equal((await post(app, "radarr", radarrGrab("HASH1"))).statusCode, 200);
  assert.equal(claimed("radarr:grabbed:any:HASH1"), true);
  // The grab must not have swallowed the import push for the same downloadId.
  assert.equal(claimed("radarr:webhook:any:HASH1"), false);

  const download = {
    eventType: "Download",
    movie: { id: 7, title: "Dune: Part Two", year: 2024 },
    downloadId: "HASH1",
  };
  assert.equal((await post(app, "radarr", download)).statusCode, 200);
  assert.equal(claimed("radarr:webhook:any:HASH1"), true);

  await app.close();
});

test("a Sonarr season-pack Grab claims one key for the whole release", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, sonarrGrabbed: true });
  const app = await buildApp();
  assert.equal((await post(app, "sonarr", sonarrPackGrab("PACK1"))).statusCode, 200);
  assert.equal(claimed("sonarr:grabbed:any:PACK1"), true);
  assert.equal(claimed("sonarr:webhook:any:PACK1"), false);
  await app.close();
});

test("a Grab without a movie or series is accepted and ignored", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true, sonarrGrabbed: true });
  const app = await buildApp();
  const radarr = await post(app, "radarr", { eventType: "Grab", downloadId: "NOMOVIE" });
  const sonarr = await post(app, "sonarr", { eventType: "Grab", downloadId: "NOSERIES" });
  assert.equal(radarr.statusCode, 200);
  assert.equal(sonarr.statusCode, 200);
  assert.equal(claimed("radarr:grabbed:any:NOMOVIE"), false);
  assert.equal(claimed("sonarr:grabbed:any:NOSERIES"), false);
  await app.close();
});

test("a Grab with the wrong secret is rejected", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true });
  const app = await buildApp();
  const res = await app.inject({
    method: "POST",
    url: "/webhooks/radarr",
    headers: { "x-dashboarr-secret": "nope" },
    payload: radarrGrab("BADSECRET"),
  });
  assert.equal(res.statusCode, 401);
  assert.equal(claimed("radarr:grabbed:any:BADSECRET"), false);
  await app.close();
});
