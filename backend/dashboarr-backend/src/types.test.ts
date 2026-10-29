import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configPayloadSchema,
  notificationSettingsSchema,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "./types.js";
import { isQbtCategoryMuted } from "./workers/transitions.js";

/**
 * Regression guard for the bug where the app sends a config entry for a service
 * kind the backend doesn't know yet (it ships a default instance for every kind
 * in its own list). A strict `kind` enum used to fail the whole `PUT /config`,
 * which silently disabled ALL push notifications. The schema must now drop the
 * unknown entry and keep the rest.
 */
test("unknown service kind is dropped, not fatal to the whole payload", () => {
  const result = configPayloadSchema.safeParse({
    instances: [
      { id: "a", kind: "sonarr", enabled: true, name: "Sonarr", localUrl: "http://192.168.0.2:8989" },
      { id: "b", kind: "somefutureservice", enabled: false, name: "Future", localUrl: "" },
    ],
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.instances?.length, 1);
  assert.equal(result.data.instances?.[0]?.kind, "sonarr");
});

test("rtorrent, transmission, deluge, lidarr, bindery, jellystat, unraid, jackett, autobrr, cleanuparr, nzbhydra2, navidrome and pihole are accepted kinds", () => {
  for (const kind of ["rtorrent", "transmission", "deluge", "lidarr", "bindery", "jellystat", "unraid", "jackett", "autobrr", "cleanuparr", "nzbhydra2", "navidrome", "pihole"]) {
    const result = configPayloadSchema.safeParse({
      instances: [{ id: "x", kind, enabled: false, name: kind, localUrl: "" }],
      notifications: DEFAULT_NOTIFICATION_SETTINGS,
    });
    assert.equal(result.success, true, `${kind} should be accepted`);
    if (!result.success) continue;
    assert.equal(result.data.instances?.length, 1);
  }
});

test("a known service with a non-http url still fails (no silent acceptance)", () => {
  const result = configPayloadSchema.safeParse({
    instances: [{ id: "a", kind: "sonarr", enabled: true, name: "Sonarr", localUrl: "ftp://nope" }],
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
  });
  assert.equal(result.success, false);
});

test("a payload with only unknown kinds still parses to an empty instances list", () => {
  const result = configPayloadSchema.safeParse({
    instances: [{ id: "b", kind: "somefutureservice", enabled: false, name: "Future", localUrl: "" }],
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.instances?.length, 0);
});

// Apprise (issue #220) — the notifications schema gained an optional `apprise`
// config object. A pre-Apprise client omits it; a newer one sends the full shape.

test("notifications without apprise still parse (back-compat)", () => {
  const result = notificationSettingsSchema.safeParse(DEFAULT_NOTIFICATION_SETTINGS);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.apprise, undefined);
});

test("notifications with a full apprise config parse", () => {
  const result = notificationSettingsSchema.safeParse({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    apprise: { enabled: true, url: "http://host:8000/notify/dashboarr", tags: "phone" },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.apprise, {
    enabled: true,
    url: "http://host:8000/notify/dashboarr",
    tags: "phone",
  });
});

test("apprise sub-fields default when partially provided", () => {
  const result = notificationSettingsSchema.safeParse({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    apprise: { url: "http://host:8000/notify/dashboarr" },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.apprise?.enabled, false);
  assert.equal(result.data.apprise?.tags, "");
});

// qbtMutedCategories (issue #310) — optional per-instance category mute list.

test("notifications without qbtMutedCategories still parse (back-compat)", () => {
  const result = notificationSettingsSchema.safeParse(DEFAULT_NOTIFICATION_SETTINGS);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.qbtMutedCategories, undefined);
});

test("qbtMutedCategories round-trips, including the uncategorized \"\" entry", () => {
  const map = { "uuid-1": ["cross-seed-link", ""] };
  const result = notificationSettingsSchema.safeParse({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    qbtMutedCategories: map,
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.qbtMutedCategories, map);
});

test("isQbtCategoryMuted matches exactly and treats missing category as uncategorized", () => {
  const map = { "uuid-1": ["cross-seed-link", ""] };
  assert.equal(isQbtCategoryMuted(map, "uuid-1", "cross-seed-link"), true);
  assert.equal(isQbtCategoryMuted(map, "uuid-1", "Cross-Seed-Link"), false);
  assert.equal(isQbtCategoryMuted(map, "uuid-1", ""), true);
  assert.equal(isQbtCategoryMuted(map, "uuid-1", undefined), true);
  assert.equal(isQbtCategoryMuted(map, "uuid-1", "movies"), false);
  assert.equal(isQbtCategoryMuted(map, "uuid-2", "cross-seed-link"), false);
  assert.equal(isQbtCategoryMuted(undefined, "uuid-1", "cross-seed-link"), false);
  assert.equal(isQbtCategoryMuted({ "uuid-1": [] }, "uuid-1", "cross-seed-link"), false);
});

/**
 * A Seerr the app signed into as a user (#332) is pushed WITHOUT any secret:
 * its credential is a person's Plex token or media-server password and the
 * backend has no session client to use it with. The payload must still
 * validate, so the instance keeps its webhooks and offline checks.
 */
test("a Seerr instance with no secrets at all validates", () => {
  const result = configPayloadSchema.safeParse({
    instances: [
      { id: "s", kind: "overseerr", enabled: true, name: "Seerr", localUrl: "http://192.168.0.5:5055" },
    ],
    notifications: DEFAULT_NOTIFICATION_SETTINGS,
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.instances?.[0]?.apiKey, undefined);
  assert.equal(result.data.instances?.[0]?.username, undefined);
});

// Grab categories (#464). Opt-in, so an older app that never sends the keys
// must leave them off.

test("radarrGrabbed / sonarrGrabbed default to false when absent", () => {
  const { radarrGrabbed: _r, sonarrGrabbed: _s, ...older } = DEFAULT_NOTIFICATION_SETTINGS;
  const result = notificationSettingsSchema.safeParse(older);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.radarrGrabbed, false);
  assert.equal(result.data.sonarrGrabbed, false);
});

test("perInstance accepts the grab categories", () => {
  const perInstance = { "uuid-r": { radarrGrabbed: true }, "uuid-s": { sonarrGrabbed: false } };
  const result = notificationSettingsSchema.safeParse({ ...DEFAULT_NOTIFICATION_SETTINGS, perInstance });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.perInstance, perInstance);
});

/**
 * #230 failure class for categories: a strict key enum on perInstance made one
 * category this build doesn't know (a newer app's per-instance "Always
 * notify") 400 the whole PUT /config. The unknown key is dropped instead.
 */
test("perInstance drops an unknown category instead of failing the payload", () => {
  const result = configPayloadSchema.safeParse({
    instances: [],
    notifications: {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      perInstance: {
        "uuid-1": { radarrGrabbed: true, someFutureCategory: false },
        "uuid-2": { someFutureCategory: true },
      },
    },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.notifications.perInstance, {
    "uuid-1": { radarrGrabbed: true },
    "uuid-2": {},
  });
});

test("perInstance still rejects a non-boolean override and a non-object entry", () => {
  for (const perInstance of [
    { "uuid-1": { radarrGrabbed: "yes" } },
    { "uuid-1": true },
    { "uuid-1": ["radarrGrabbed"] },
  ]) {
    const result = notificationSettingsSchema.safeParse({ ...DEFAULT_NOTIFICATION_SETTINGS, perInstance });
    assert.equal(result.success, false, JSON.stringify(perInstance));
  }
});

test("perInstance stays optional", () => {
  const result = notificationSettingsSchema.safeParse(DEFAULT_NOTIFICATION_SETTINGS);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.perInstance, undefined);
});

// Cleanuparr categories (#486). An older app never sends the keys, so they
// must fall back to the same defaults the app uses: removals on, cleanups off.

test("cleanuparrRemoved defaults on and cleanuparrCleaned off when absent", () => {
  const { cleanuparrRemoved: _r, cleanuparrCleaned: _c, ...older } = DEFAULT_NOTIFICATION_SETTINGS;
  const result = notificationSettingsSchema.safeParse(older);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.cleanuparrRemoved, true);
  assert.equal(result.data.cleanuparrCleaned, false);
});

test("perInstance accepts the Cleanuparr categories", () => {
  const perInstance = { "uuid-c": { cleanuparrRemoved: false, cleanuparrCleaned: true } };
  const result = configPayloadSchema.safeParse({
    instances: [],
    notifications: { ...DEFAULT_NOTIFICATION_SETTINGS, perInstance },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.notifications.perInstance, perInstance);
});
