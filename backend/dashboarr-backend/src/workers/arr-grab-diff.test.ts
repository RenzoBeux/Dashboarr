import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// DATA_DIR must point at a throwaway directory before the DB is first opened,
// hence the dynamic imports. No device is paired, so a dispatched push only
// shows up as its claimed dedupe key.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "dashboarr-arr-grab-diff-"));
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";

const { diffRadarrGrabs, diffSonarrGrabs, diffRadarrHistory } = await import("./transitions.js");
const { saveNotificationSettings } = await import("../db/repos/config.js");
const { getState } = await import("../db/repos/seen-state.js");
const { DEFAULT_NOTIFICATION_SETTINGS } = await import("../types.js");

type RadarrRecord = Parameters<typeof diffRadarrGrabs>[3][number];
type SonarrRecord = Parameters<typeof diffSonarrGrabs>[3][number];

function claimed(key: string): boolean {
  return getState<number>(`event:${key}`) !== null;
}

const radarrGrab = (id: number, downloadId: string): RadarrRecord => ({
  id,
  eventType: "grabbed",
  movieId: 7,
  movie: { id: 7, title: "Dune", year: 2021 },
  downloadId,
  quality: { quality: { name: "Bluray-1080p" } },
  data: { indexer: "TorrentLeech", size: "1610612736" },
});

test("the first poll only seeds the baseline, later grabs push once", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true });
  const old = radarrGrab(1, "OLD");

  await diffRadarrGrabs("r1", "Radarr", false, [old]);
  assert.equal(claimed("radarr:grabbed:r1:OLD"), false, "no backlog on the first poll");
  assert.deepEqual(getState<number[]>("radarr:r1:history:grabbed:seen"), [1]);

  const fresh = radarrGrab(2, "NEW");
  await diffRadarrGrabs("r1", "Radarr", false, [fresh, old]);
  assert.equal(claimed("radarr:grabbed:r1:NEW"), true);
  assert.equal(claimed("radarr:grabbed:r1:OLD"), false);
});

test("the grab baseline is independent of the import one", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true });
  const imported: RadarrRecord = { id: 11, eventType: "downloadFolderImported", movieId: 7, downloadId: "IMP" };
  const grab = radarrGrab(10, "IMP");

  await diffRadarrHistory("r2", "Radarr", false, [imported, grab]);
  await diffRadarrGrabs("r2", "Radarr", false, [imported, grab]);
  assert.deepEqual(getState<number[]>("radarr:r2:history:seen"), [11]);
  assert.deepEqual(getState<number[]>("radarr:r2:history:grabbed:seen"), [10]);
});

test("a grab seen while the toggle is off does not burst when it is turned on", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS });
  await diffRadarrGrabs("r3", "Radarr", false, []);
  const grab = radarrGrab(20, "QUIET");
  await diffRadarrGrabs("r3", "Radarr", false, [grab]);
  assert.equal(claimed("radarr:grabbed:r3:QUIET"), false);

  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, radarrGrabbed: true });
  await diffRadarrGrabs("r3", "Radarr", false, [grab]);
  assert.equal(claimed("radarr:grabbed:r3:QUIET"), false);
});

test("a per-instance override turns grabs on for one instance only", async () => {
  saveNotificationSettings({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    perInstance: { r4: { radarrGrabbed: true } },
  });
  await diffRadarrGrabs("r4", "Radarr", false, []);
  await diffRadarrGrabs("r5", "Radarr", false, []);
  await diffRadarrGrabs("r4", "Radarr", false, [radarrGrab(30, "ON")]);
  await diffRadarrGrabs("r5", "Radarr", false, [radarrGrab(31, "OFF")]);
  assert.equal(claimed("radarr:grabbed:r4:ON"), true);
  assert.equal(claimed("radarr:grabbed:r5:OFF"), false);
});

test("a Sonarr season pack split across two polls pushes once", async () => {
  saveNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, sonarrGrabbed: true });
  const ep = (n: number): SonarrRecord => ({
    id: 40 + n,
    eventType: "grabbed",
    seriesId: 3,
    series: { id: 3, title: "Severance" },
    episode: { seasonNumber: 1, episodeNumber: n },
    downloadId: "PACK",
  });

  await diffSonarrGrabs("s1", "Sonarr", false, []);
  await diffSonarrGrabs("s1", "Sonarr", false, [ep(3), ep(2)]);
  assert.equal(claimed("sonarr:grabbed:s1:PACK"), true);
  // The rest of the pack lands on the next poll: same key, already claimed.
  await diffSonarrGrabs("s1", "Sonarr", false, [ep(1), ep(3), ep(2)]);
  assert.deepEqual(getState<number[]>("sonarr:s1:history:grabbed:seen"), [41, 43, 42]);
});
