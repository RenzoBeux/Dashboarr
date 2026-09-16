import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeWebhookEvent } from "./webhook-summary.js";

test("radarr: eventType plus title and year", () => {
  assert.deepEqual(
    summarizeWebhookEvent("radarr", {
      eventType: "Download",
      movie: { id: 1, title: "Heat", year: 1995, folderPath: "/movies/Heat (1995)" },
    }),
    { eventType: "Download", summary: "Heat (1995)" },
  );
  assert.deepEqual(summarizeWebhookEvent("radarr", { eventType: "Test" }), {
    eventType: "Test",
    summary: null,
  });
});

test("sonarr: series title with padded episode code and episode title", () => {
  assert.deepEqual(
    summarizeWebhookEvent("sonarr", {
      eventType: "Download",
      series: { title: "Severance" },
      episodes: [{ seasonNumber: 2, episodeNumber: 7, title: "Chikhai Bardo" }],
    }),
    { eventType: "Download", summary: "Severance S02E07 - Chikhai Bardo" },
  );
  assert.deepEqual(
    summarizeWebhookEvent("sonarr", { eventType: "Grab", series: { title: "Severance" }, episodes: [] }),
    { eventType: "Grab", summary: "Severance" },
  );
});

test("overseerr: subject only, never the message or requester", () => {
  const out = summarizeWebhookEvent("overseerr", {
    notification_type: "MEDIA_PENDING",
    subject: "Dune (2021)",
    message: "please approve",
    request: { requestedBy_username: "alice" },
  });
  assert.deepEqual(out, { eventType: "MEDIA_PENDING", summary: "Dune (2021)" });
  assert.equal(JSON.stringify(out).includes("alice"), false);
});

test("tracearr: event name only", () => {
  assert.deepEqual(
    summarizeWebhookEvent("tracearr", {
      event: "new_device",
      data: { userName: "bob", deviceName: "Living room TV", location: "Berlin" },
    }),
    { eventType: "new_device", summary: null },
  );
});

test("bazarr, tautulli and unknown sources have no structured type", () => {
  assert.deepEqual(summarizeWebhookEvent("bazarr", { some: "text" }), { eventType: null, summary: null });
  assert.deepEqual(summarizeWebhookEvent("tautulli", { eventType: "x" }), { eventType: null, summary: null });
  assert.deepEqual(summarizeWebhookEvent("mystery", { eventType: "x" }), { eventType: null, summary: null });
});

test("non-object payloads and wrong field types are tolerated", () => {
  for (const payload of [null, undefined, "text", 42, [], [{ eventType: "Download" }]]) {
    assert.deepEqual(summarizeWebhookEvent("radarr", payload), { eventType: null, summary: null });
  }
  assert.deepEqual(
    summarizeWebhookEvent("radarr", { eventType: 7, movie: { title: 3, year: "1995" } }),
    { eventType: null, summary: null },
  );
  assert.deepEqual(
    summarizeWebhookEvent("sonarr", { eventType: "Download", series: { title: "X" }, episodes: "nope" }),
    { eventType: "Download", summary: "X" },
  );
});

test("summaries are truncated to 120 characters", () => {
  const long = "a".repeat(300);
  const out = summarizeWebhookEvent("overseerr", { notification_type: "T", subject: long });
  assert.equal(out.summary?.length, 120);
});
