import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DATA_DIR must point at a throwaway directory before the DB is first opened,
// hence the dynamic imports. No device is paired, so a dispatched push only
// shows up as its claimed dedupe key.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-cleanuparr-events-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { planCleanuparrPushes, cleanuparrReasonLabel, MAX_INDIVIDUAL_PUSHES } = await import(
  "./cleanuparr-events.js"
);
const { diffCleanuparrEvents } = await import("./transitions.js");
const { saveNotificationSettings } = await import("../db/repos/config.js");
const { getState } = await import("../db/repos/seen-state.js");
const { DEFAULT_NOTIFICATION_SETTINGS } = await import("../types.js");

type Item = Parameters<typeof planCleanuparrPushes>[1][number];
type Ctx = Parameters<typeof planCleanuparrPushes>[2];

const removedCtx: Ctx = {
  instanceId: "c1",
  instanceName: "Cleanuparr",
  multipleOfKind: false,
  eventType: "QueueItemDeleted",
};

// Ids sort with their minute so "newest first" pages read naturally.
const removed = (minute: number, over: Partial<Item> = {}): Item => ({
  id: `del-${minute}`,
  timestamp: new Date(Date.UTC(2026, 9, 29, 12, minute)).toISOString(),
  eventType: "QueueItemDeleted",
  message: "Deleting item from queue with reason: SlowSpeed",
  severity: "Important",
  isDryRun: false,
  itemTitle: `Release.${minute}.1080p.WEB-DL`,
  deleteReason: "SlowSpeed",
  removeFromClient: true,
  ...over,
});

/** Newest first, like GET /api/events. */
const page = (...items: Item[]): Item[] =>
  [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

function claimed(key: string): boolean {
  return getState<number>(`event:${key}`) !== null;
}

// ---------------- planCleanuparrPushes (pure) ----------------

test("the first poll only seeds the snapshot", () => {
  const { next, pushes } = planCleanuparrPushes(null, page(removed(1), removed(2)), removedCtx);
  assert.deepEqual(pushes, []);
  assert.deepEqual(next, { ids: ["del-2", "del-1"], newest: removed(2).timestamp });
});

test("a new removal pushes the release name and the reason", () => {
  const { next } = planCleanuparrPushes(null, page(removed(1)), removedCtx);
  const { pushes } = planCleanuparrPushes(next, page(removed(1), removed(2)), removedCtx);
  assert.deepEqual(pushes, [
    {
      category: "cleanuparrRemoved",
      title: "Cleanuparr removed a download",
      body: "Release.2.1080p.WEB-DL · Slow speed",
      data: { type: "cleanuparr", instanceId: "c1", eventType: "QueueItemDeleted", eventId: "del-2" },
      dedupeKey: "cleanuparr:c1:QueueItemDeleted:del-2",
    },
  ]);
});

test("already seen events are not pushed again", () => {
  const items = page(removed(1), removed(2));
  const { next } = planCleanuparrPushes(null, items, removedCtx);
  assert.deepEqual(planCleanuparrPushes(next, items, removedCtx).pushes, []);
});

test("dry-run events never push but still join the baseline", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  const dry = removed(3, { isDryRun: true });
  const result = planCleanuparrPushes(next, page(dry), removedCtx);
  assert.deepEqual(result.pushes, []);
  assert.deepEqual(result.next.ids, ["del-3"]);
});

test("events of another type are ignored (upstream drops an unparsable filter)", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  const strike: Item = {
    id: "strike-1",
    timestamp: removed(4).timestamp,
    eventType: "SlowSpeedStrike",
    itemTitle: "Release.4",
  };
  const result = planCleanuparrPushes(next, [strike], removedCtx);
  assert.deepEqual(result.pushes, []);
  assert.deepEqual(result.next.ids, []);
});

test("an empty first page seeds, so the next removal pushes", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  assert.deepEqual(next, { ids: [], newest: null });
  assert.equal(planCleanuparrPushes(next, page(removed(5)), removedCtx).pushes.length, 1);
});

test("events well before the newest one seen are skipped", () => {
  const { next } = planCleanuparrPushes(null, page(removed(30)), removedCtx);
  // An unseen event 20 minutes older (an instance repointed at another
  // Cleanuparr), and one 2 minutes older (committed out of order).
  const result = planCleanuparrPushes(next, page(removed(30), removed(28), removed(10)), removedCtx);
  assert.deepEqual(
    result.pushes.map((p) => p.data?.eventId),
    ["del-28"],
  );
});

test("several fresh events push oldest first, up to the cap", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  const fresh = Array.from({ length: MAX_INDIVIDUAL_PUSHES }, (_, i) => removed(i + 1));
  const { pushes } = planCleanuparrPushes(next, page(...fresh), removedCtx);
  assert.deepEqual(
    pushes.map((p) => p.data?.eventId),
    fresh.map((f) => f.id),
  );
});

test("a burst becomes one summary push", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  const burst = [1, 2, 3, 4, 5, 6].map((m) => removed(m));
  const { pushes } = planCleanuparrPushes(next, page(...burst), removedCtx);
  assert.deepEqual(pushes, [
    {
      category: "cleanuparrRemoved",
      title: "Cleanuparr removed 6 downloads",
      body: "Release.6.1080p.WEB-DL, Release.5.1080p.WEB-DL, Release.4.1080p.WEB-DL and 3 more",
      data: { type: "cleanuparr", instanceId: "c1", eventType: "QueueItemDeleted", eventId: "del-6" },
      dedupeKey: "cleanuparr:c1:QueueItemDeleted:batch:del-6",
    },
  ]);
});

test("a burst past the page says its count is a lower bound", () => {
  const { next } = planCleanuparrPushes(null, page(removed(0)), removedCtx);
  // 70 removals since the last poll: the page holds the newest 50 and none of
  // the seen ids, so the rest sit on later pages.
  const full = Array.from({ length: 50 }, (_, i) => removed(i + 10));
  const [push] = planCleanuparrPushes(next, page(...full), { ...removedCtx, totalCount: 71 }).pushes;
  assert.equal(push?.title, "Cleanuparr removed 50+ downloads");
  assert.equal(
    push?.body,
    "Release.59.1080p.WEB-DL, Release.58.1080p.WEB-DL, Release.57.1080p.WEB-DL and 47+ more",
  );
});

test("a burst that reaches a seen id keeps its exact count", () => {
  const { next } = planCleanuparrPushes(null, page(removed(0)), removedCtx);
  const items = page(...[0, 1, 2, 3, 4, 5].map((m) => removed(m)));
  const [push] = planCleanuparrPushes(next, items, { ...removedCtx, totalCount: 200 }).pushes;
  assert.equal(push?.title, "Cleanuparr removed 5 downloads");
});

test("titles carry the instance name when there are several Cleanuparrs", () => {
  const ctx: Ctx = { ...removedCtx, instanceName: "Cleanuparr Cabin", multipleOfKind: true };
  const { next } = planCleanuparrPushes(null, [], ctx);
  assert.equal(
    planCleanuparrPushes(next, page(removed(1)), ctx).pushes[0]?.title,
    "Cleanuparr Cabin: Download removed",
  );
  const burst = [1, 2, 3, 4].map((m) => removed(m));
  assert.equal(
    planCleanuparrPushes(next, page(...burst), ctx).pushes[0]?.title,
    "Cleanuparr Cabin: 4 downloads removed",
  );
});

test("a missing release name or reason degrades to what is there", () => {
  const { next } = planCleanuparrPushes(null, [], removedCtx);
  const bare = removed(1, { itemTitle: null, deleteReason: undefined });
  const none = removed(2, { deleteReason: "None" });
  const { pushes } = planCleanuparrPushes(next, page(bare, none), removedCtx);
  assert.deepEqual(
    pushes.map((p) => p.body),
    ["Unknown download", "Release.2.1080p.WEB-DL"],
  );
});

test("reason labels: known values, a newer value, and the clean reasons", () => {
  const label = (eventType: Ctx["eventType"], over: Partial<Item>) =>
    cleanuparrReasonLabel(eventType, removed(1, over));
  assert.equal(label("QueueItemDeleted", { deleteReason: "AllFilesSkippedByQBit" }), "All files skipped in qBittorrent");
  assert.equal(label("QueueItemDeleted", { deleteReason: "SomeFutureReason" }), "Some future reason");
  assert.equal(label("QueueItemDeleted", { deleteReason: null }), undefined);
  assert.equal(label("DownloadCleaned", { cleanReason: "MaxSeedTimeReached" }), "Max seed time reached");
  assert.equal(label("DownloadCleaned", { deleteReason: "SlowSpeed" }), undefined);
});

test("a seeding cleanup uses the cleaned copy and category", () => {
  const ctx: Ctx = { ...removedCtx, eventType: "DownloadCleaned" };
  const cleaned: Item = {
    id: "clean-1",
    timestamp: removed(1).timestamp,
    eventType: "DownloadCleaned",
    isDryRun: false,
    itemTitle: "Some.Linux.ISO",
    cleanReason: "MaxRatioReached",
    cleanedCategory: "tv-sonarr",
  };
  const { next } = planCleanuparrPushes(null, [], ctx);
  const [push] = planCleanuparrPushes(next, [cleaned], ctx).pushes;
  assert.equal(push?.category, "cleanuparrCleaned");
  assert.equal(push?.title, "Cleanuparr cleaned a download");
  assert.equal(push?.body, "Some.Linux.ISO · Max ratio reached");
  assert.equal(push?.dedupeKey, "cleanuparr:c1:DownloadCleaned:clean-1");
});

// ---------------- diffCleanuparrEvents (seen_state + dispatcher) ----------------

test("diff seeds silently, then pushes a new removal once", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
  await diffCleanuparrEvents("d1", "Cleanuparr", false, "QueueItemDeleted", page(removed(1)));
  assert.equal(claimed("cleanuparr:d1:QueueItemDeleted:del-1"), false, "no backlog on the first poll");
  assert.deepEqual(getState("cleanuparr:d1:events:QueueItemDeleted"), {
    ids: ["del-1"],
    newest: removed(1).timestamp,
  });

  await diffCleanuparrEvents("d1", "Cleanuparr", false, "QueueItemDeleted", page(removed(1), removed(2)));
  assert.equal(claimed("cleanuparr:d1:QueueItemDeleted:del-2"), true, "removals are on by default");
});

test("cleanups stay quiet by default and a per-instance override turns them on", async () => {
  saveNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    perInstance: { d3: { cleanuparrCleaned: true } },
  });
  const cleaned = (id: string): Item => ({
    id,
    timestamp: removed(1).timestamp,
    eventType: "DownloadCleaned",
    itemTitle: id,
    cleanReason: "MaxRatioReached",
  });
  await diffCleanuparrEvents("d2", "Cleanuparr", true, "DownloadCleaned", []);
  await diffCleanuparrEvents("d3", "Cleanuparr", true, "DownloadCleaned", []);
  await diffCleanuparrEvents("d2", "Cleanuparr", true, "DownloadCleaned", [cleaned("off")]);
  await diffCleanuparrEvents("d3", "Cleanuparr", true, "DownloadCleaned", [cleaned("on")]);
  assert.equal(claimed("cleanuparr:d2:DownloadCleaned:off"), false);
  assert.equal(claimed("cleanuparr:d3:DownloadCleaned:on"), true);
});

test("a removal seen while muted does not push when unmuted", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, perInstance: { d4: { cleanuparrRemoved: false } } });
  await diffCleanuparrEvents("d4", "Cleanuparr", false, "QueueItemDeleted", []);
  await diffCleanuparrEvents("d4", "Cleanuparr", false, "QueueItemDeleted", page(removed(7)));
  assert.equal(claimed("cleanuparr:d4:QueueItemDeleted:del-7"), false);

  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
  await diffCleanuparrEvents("d4", "Cleanuparr", false, "QueueItemDeleted", page(removed(7)));
  assert.equal(claimed("cleanuparr:d4:QueueItemDeleted:del-7"), false);
});
