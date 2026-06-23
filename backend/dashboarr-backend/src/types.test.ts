import { test } from "node:test";
import assert from "node:assert/strict";
import { configPayloadSchema, DEFAULT_NOTIFICATION_SETTINGS } from "./types.js";

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

test("rtorrent, lidarr and jellystat are accepted kinds", () => {
  for (const kind of ["rtorrent", "lidarr", "jellystat"]) {
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
