import { test } from "node:test";
import assert from "node:assert/strict";
import { skipsPollerWithoutApiKey } from "./poller-eligibility.js";

/**
 * A Seerr the app signed into as a user carries no API key on the backend;
 * its pending-request poller must be skipped rather than 403 every tick. No
 * other kind changes behavior.
 */
test("a Seerr instance without an API key skips its poller", () => {
  assert.equal(skipsPollerWithoutApiKey("overseerr", { apiKey: null }), true);
  assert.equal(skipsPollerWithoutApiKey("overseerr", { apiKey: "" }), true);
});

test("a Seerr instance with an API key polls as before", () => {
  assert.equal(skipsPollerWithoutApiKey("overseerr", { apiKey: "admin-key" }), false);
});

test("other kinds are never skipped for a missing key", () => {
  assert.equal(skipsPollerWithoutApiKey("radarr", { apiKey: null }), false);
  assert.equal(skipsPollerWithoutApiKey("sonarr", { apiKey: "" }), false);
  assert.equal(skipsPollerWithoutApiKey("qbittorrent", { apiKey: null }), false);
});
