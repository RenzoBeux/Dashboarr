// The adapters reach services -> http-client -> the config store, which pulls
// in AsyncStorage. Nothing here fetches; stub it so the module graph loads.
jest.mock("@/store/config-store", () => ({ useConfigStore: { getState: () => ({}) } }));

import { radarrArrQueueAdapter } from "@/lib/arr-queue-adapters/radarr";
import { sonarrArrQueueAdapter } from "@/lib/arr-queue-adapters/sonarr";
import { lidarrArrQueueAdapter } from "@/lib/arr-queue-adapters/lidarr";

// A pending release as the *arr appends it to /queue (issue #484): no
// trackedDownload* fields, no downloadId, nothing downloaded, and a timeleft
// that counts down to the grab rather than to a finished download.
const held = {
  id: 1,
  title: "Some.Release.1080p",
  status: "delay",
  size: 1000,
  sizeleft: 1000,
  timeleft: "00:41:59.5123456",
  quality: { quality: { name: "WEBDL-1080p" } },
};
const downloading = {
  ...held,
  id: 2,
  status: "downloading",
  trackedDownloadStatus: "ok",
  trackedDownloadState: "downloading",
  sizeleft: 250,
  timeleft: "00:05:00",
};

describe("queue adapters flag held releases (#484)", () => {
  it("Radarr: held, and its subtitle is no ETA", () => {
    const [h, d] = radarrArrQueueAdapter.toItems(
      { records: [{ ...held, movieId: 7 }, { ...downloading, movieId: 8 }] },
      "home",
    );
    expect(h).toMatchObject({ held: true, subtitle: "Delayed", progress: 0 });
    expect(h.severity).toBeNull();
    expect(d).toMatchObject({ held: false, subtitle: "ETA 00:05:00", progress: 0.75 });
  });

  it("Sonarr: held, and the episode code says Delayed", () => {
    const episode = { seasonNumber: 2, episodeNumber: 7 };
    const [h, d, hNoEp, dNoEp] = sonarrArrQueueAdapter.toItems(
      {
        records: [
          { ...held, seriesId: 3, episodeId: 31, episode },
          { ...downloading, seriesId: 3, episodeId: 32, episode },
          { ...held, id: 3, seriesId: 3, episodeId: 33 },
          { ...downloading, id: 4, seriesId: 3, episodeId: 34 },
        ],
      },
      "home",
    );
    expect(h).toMatchObject({ held: true, subtitle: "Delayed · S02E07" });
    expect(d).toMatchObject({ held: false, subtitle: "S02E07" });
    expect(hNoEp).toMatchObject({ held: true, subtitle: "Delayed" });
    expect(dNoEp).toMatchObject({ held: false, subtitle: "ETA 00:05:00" });
  });

  it("Lidarr: held, and the artist name says Delayed", () => {
    const artist = { artistName: "Radiohead" };
    const [h, d, dNoArtist] = lidarrArrQueueAdapter.toItems(
      {
        records: [
          { ...held, albumId: 11, artist },
          { ...downloading, albumId: 12, artist },
          { ...downloading, id: 3, albumId: 13 },
        ],
      },
      "home",
    );
    expect(h).toMatchObject({ held: true, subtitle: "Delayed · Radiohead" });
    expect(d).toMatchObject({ held: false, subtitle: "Radiohead" });
    expect(dNoArtist).toMatchObject({ held: false, subtitle: "ETA 00:05:00" });
  });
});
